"""Deploy upi-gateway to Vercel (new project) via the Vercel MCP.

Flow (per workspace Vercel lessons):
  1. create_project "upi-gateway" (team "mohit's projects").
  2. create_project_env for DATABASE_URL / SESSION_SECRET / ENCRYPTION_KEY /
     CRON_SECRET (type sensitive, production) + APP_URL (plain).
     Values are read from .env.local (gitignored) and NEVER printed.
  3. upload_file each source file; inspect the INNER result of every upload
     (new blob -> {"urls": [...]}, dedup/existing -> {}).
  4. create_deployment with the full file manifest + projectSettings
     {framework: "nextjs"}.
  5. Poll get_deployment until READY.
  6. update_project with ssoProtection null so the site is public.

Excludes: node_modules, .next, .git, .vercel, .env.local (SECRETS — never
uploaded), package-lock.json (>90KB MCP shim limit), tsconfig.tsbuildinfo,
and any file >90KB (INVENTORY.md). Run from the project root:
  python3 scripts/deploy_upi.py
"""
import base64
import hashlib
import json
import os
import subprocess
import sys
import time

TEAM = "team_km0mMMgLef2Bm1M85qBjoTNU"
PROJECT_NAME = "upi-gateway"
APP_URL = "https://upi-gateway-gamma.vercel.app"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VERCEL = "/opt/hatch/bin/vercel"

EXCLUDE_DIRS = {"node_modules", ".next", ".git", ".vercel"}
EXCLUDE_FILES = {"package-lock.json", "tsconfig.tsbuildinfo", ".env.local"}
MAX_FILE_BYTES = 90_000  # MCP shim single-arg cap


def read_env_local():
    env = {}
    path = os.path.join(ROOT, ".env.local")
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    for k in ("DATABASE_URL", "SESSION_SECRET", "ENCRYPTION_KEY", "CRON_SECRET"):
        if not env.get(k):
            print(f"MISSING {k} in .env.local — aborting")
            sys.exit(1)
    return env


def call_tool(name, args):
    r = subprocess.run(
        [VERCEL, "call-tool", "--name", name, "--arguments-json", json.dumps(args)],
        capture_output=True, text=True, timeout=180,
    )
    if r.returncode != 0:
        raise RuntimeError(f"{name} failed rc={r.returncode}: {r.stdout[:500]} {r.stderr[:500]}")
    d = json.loads(r.stdout)
    inner = json.loads(d["result"]["content"][0]["text"])
    if isinstance(inner, dict) and "error" in inner:
        raise RuntimeError(f"{name} API error: {json.dumps(inner['error'])[:600]}")
    return inner


def collect_files():
    out = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = sorted(d for d in dirnames if d not in EXCLUDE_DIRS)
        for fn in sorted(filenames):
            if fn in EXCLUDE_FILES:
                continue
            full = os.path.join(dirpath, fn)
            if os.path.getsize(full) > MAX_FILE_BYTES:
                print(f"  SKIP (>{MAX_FILE_BYTES} bytes): {os.path.relpath(full, ROOT)}")
                continue
            out.append(os.path.relpath(full, ROOT))
    return out


def upload_file(rel):
    with open(os.path.join(ROOT, rel), "rb") as f:
        data = f.read()
    sha = hashlib.sha1(data).hexdigest()
    args = {
        "requestBody": base64.b64encode(data).decode(),
        "contentLength": len(data),
        "xVercelDigest": sha,
        "teamId": TEAM,
    }
    inner = call_tool("upload_file", args)
    res = inner.get("result", {})
    if "urls" in res:
        print(f"  uploaded {rel} ({len(data)} bytes, new blob)")
    elif res == {}:
        print(f"  dedup    {rel} ({len(data)} bytes, blob exists)")
    else:
        print(f"  ??       {rel} -> {json.dumps(inner)[:300]}")
    return {"file": rel, "sha": sha, "size": len(data)}


def set_env(key, value, sensitive):
    args = {
        "idOrName": PROJECT_NAME,
        "teamId": TEAM,
        "upsert": "true",
        "requestBody": {
            "key": key,
            "value": value,
            "type": "sensitive" if sensitive else "plain",
            "target": ["production"],
        },
    }
    inner = call_tool("create_project_env", args)
    print(f"  env {key} ({'sensitive' if sensitive else 'plain'}, production): ok")


def main():
    env = read_env_local()
    print("== create project ==")
    try:
        proj = call_tool("create_project", {
            "requestBody": {"name": PROJECT_NAME, "framework": "nextjs"},
            "teamId": TEAM,
        })
        print("  project:", json.dumps(proj.get("result", proj))[:400])
    except Exception as e:
        print("  create_project note (may already exist):", str(e)[:300])

    print("== env vars ==")
    set_env("DATABASE_URL", env["DATABASE_URL"], True)
    set_env("SESSION_SECRET", env["SESSION_SECRET"], True)
    set_env("ENCRYPTION_KEY", env["ENCRYPTION_KEY"], True)
    set_env("CRON_SECRET", env["CRON_SECRET"], True)
    set_env("APP_URL", APP_URL, False)

    print("== upload files ==")
    files = collect_files()
    print(f"files: {len(files)}")
    manifest = []
    for rel in files:
        for attempt in range(2):
            try:
                manifest.append(upload_file(rel))
                break
            except Exception as e:
                print(f"  retry {rel}: {e}")
                if attempt == 1:
                    raise
                time.sleep(3)
    print(f"total bytes: {sum(f['size'] for f in manifest)}")

    print("== create deployment ==")
    args = {
        "requestBody": {
            "name": PROJECT_NAME,
            "project": PROJECT_NAME,
            "target": "production",
            "files": manifest,
            "projectSettings": {"framework": "nextjs"},
        },
        "teamId": TEAM,
        "forceNew": "1",
    }
    inner = call_tool("create_deployment", args)
    dep = inner.get("result", {}).get("deployment") or inner.get("result", {})
    dep_id = dep.get("id") or dep.get("uid")
    print("deployment:", json.dumps(dep, indent=2)[:1500])
    if not dep_id:
        print("FAILED to create deployment")
        sys.exit(1)

    for _ in range(60):
        time.sleep(15)
        try:
            got = call_tool("get_deployment", {"idOrUrl": dep_id, "teamId": TEAM})
        except Exception as e:
            print("  poll error:", str(e)[:200])
            continue
        g = got.get("result", {}).get("deployment") or got.get("result", {})
        state = g.get("state") or g.get("status") or g.get("readyState")
        url = g.get("url")
        print(f"  state={state} url={url}")
        if state in ("READY", "ready"):
            print("DEPLOYED:", url)
            break
        if state in ("ERROR", "error", "CANCELED", "canceled"):
            print("DEPLOYMENT FAILED:", json.dumps(g)[:2000])
            sys.exit(1)
    else:
        print("timed out waiting for READY")
        sys.exit(1)

    print("== make public (SSO off) ==")
    try:
        upd = call_tool("update_project", {
            "idOrName": PROJECT_NAME,
            "teamId": TEAM,
            "requestBody": {"ssoProtection": None},
        })
        print("  update_project ok")
    except Exception as e:
        print("  update_project note:", str(e)[:300])

    print("DONE dep_id=", dep_id)


if __name__ == "__main__":
    main()
