"""Round 7 Track 4 — diff deploy of upi-gateway to Vercel production.

Same flow as scripts/deploy_upi.py, but uploads ONLY files whose SHA-1
differs from the current production deployment (dpl_GCSr21BFKjJQKWy3idiAz3Yudgx6,
Round 6). The create_deployment manifest still lists EVERY local file so the
new deployment is complete; unchanged files reuse their remote blob SHA.

Excludes (same as deploy_upi.py): node_modules, .next, .git, .vercel,
package-lock.json, tsconfig.tsbuildinfo, .env.local, any file >90KB
(MCP shim single-arg cap). Env vars are already set on the project and are
never touched here. Run from the project root:
  python3 scripts/r7-deploy.py
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
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VERCEL = "/opt/hatch/bin/vercel"
REMOTE_TREE = "/tmp/r7-remote-tree.json"
EXCLUDE_DIRS = {"node_modules", ".next", ".git", ".vercel"}
EXCLUDE_FILES = {"package-lock.json", "tsconfig.tsbuildinfo", ".env.local"}
MAX_FILE_BYTES = 90_000


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


def flatten(nodes, prefix=""):
    out = {}
    for x in nodes:
        p = f"{prefix}{x['name']}"
        if x["type"] == "file":
            out[p] = x["uid"]
        else:
            out.update(flatten(x.get("children", []), p + "/"))
    return out


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


def upload_file(rel, sha, size):
    with open(os.path.join(ROOT, rel), "rb") as f:
        data = f.read()
    assert hashlib.sha1(data).hexdigest() == sha and len(data) == size
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
        print(f"  dedup    {rel} (blob already stored)")
    else:
        raise RuntimeError(f"unexpected upload result for {rel}: {json.dumps(inner)[:300]}")


def main():
    # The saved tree is a list whose first node is the "src" directory.
    tree = json.load(open(REMOTE_TREE))
    remote = flatten(tree[0]["children"])
    print(f"remote files: {len(remote)}")

    files = collect_files()
    print(f"local files: {len(files)}")
    manifest = []
    changed = []
    for rel in files:
        with open(os.path.join(ROOT, rel), "rb") as f:
            data = f.read()
        sha = hashlib.sha1(data).hexdigest()
        manifest.append({"file": rel, "sha": sha, "size": len(data)})
        if remote.get(rel) != sha:
            changed.append((rel, sha, len(data)))
    dropped = sorted(set(remote) - set(files))
    print(f"changed/new: {len(changed)} | dropped from deployment: {len(dropped)}")
    for p in dropped:
        print(f"  drop {p}")
    for rel, sha, size in changed:
        print(f"  + {rel}")
    for rel, sha, size in changed:
        for attempt in range(2):
            try:
                upload_file(rel, sha, size)
                break
            except Exception as e:
                print(f"  retry {rel}: {e}")
                if attempt == 1:
                    raise
                time.sleep(3)
    print(f"total manifest bytes: {sum(f['size'] for f in manifest)}")

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
    print("deployment:", json.dumps(dep, indent=2)[:1200])
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
    print("DONE dep_id=", dep_id)


if __name__ == "__main__":
    main()
