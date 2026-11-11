import Link from "next/link";
import { AppShell } from "@/components/layout";
import { getSessionSafe, requireUser } from "@/components/server-data";

export const dynamic = "force-dynamic";

export default async function SandboxPage() {
  const session = await getSessionSafe();
  const user = requireUser(session, "/sandbox");
  return (
    <AppShell user={user} active="/sandbox" title="Sandbox" subtitle="Test payments without real money — no provider is ever contacted.">
      <div className="mb-5 rounded-xl bg-amber-500/10 px-5 py-4 text-center text-sm font-medium text-amber-300 ring-1 ring-amber-500/30">
        Sandbox — test only, no real money
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-6">
          <h2 className="card-title">How sandbox works</h2>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-slate-400">
            <li>Use your sandbox API credentials (<code className="kbd">test_key_…</code> from <Link href="/settings" className="font-medium text-brand-400">Settings</Link>) to create an order with <code className="kbd">POST /api/v1/orders</code>.</li>
            <li>The order number starts with <code className="kbd">TST</code> and its payment URL is <code className="kbd">/sandbox/pay/TST…</code>.</li>
            <li>Open that URL and pick one of the six outcomes: success, failure, pending, expiry, timeout, invalid reference.</li>
            <li>Webhooks fire to your <span className="font-medium text-slate-300">sandbox</span> webhook URL (must differ from the live URL) so you can test your receiver end to end.</li>
          </ol>
        </div>
        <div className="card p-6">
          <h2 className="card-title">The six outcomes</h2>
          <dl className="mt-4 space-y-3 text-sm">
            {[
              ["success", "Order becomes paid; order.paid webhook fires."],
              ["failed", "Order becomes failed."],
              ["pending", "Nothing changes — stays pending."],
              ["expired", "Order becomes expired."],
              ["timeout", "Simulated provider timeout (HTTP 504)."],
              ["invalid_reference", "Provider rejects the reference; verification fails."],
            ].map(([k, v]) => (
              <div key={k} className="flex gap-3">
                <code className="kbd shrink-0">{k}</code>
                <span className="text-slate-400">{v}</span>
              </div>
            ))}
          </dl>
        </div>
      </div>
      <div className="card mt-4 p-6">
        <h2 className="card-title">Try it from the API</h2>
        <pre className="mt-4 overflow-x-auto rounded-xl bg-slate-950 p-4 text-[13px] leading-relaxed text-slate-200 ring-1 ring-slate-800">{`curl -X POST https://your-gateway.example/api/v1/orders \\
  -H 'Content-Type: application/json' \\
  -H 'X-Api-Key: test_key_xxxxxxxxxxxxxxxx' \\
  -H 'X-Api-Secret: test_sec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' \\
  -d '{"amount": 10.00, "client_order_id": "TEST-1", "customer_name": "Test customer"}'

# → data.payment_url is /sandbox/pay/TST… — open it and simulate an outcome.`}</pre>
        <p className="mt-4 text-sm text-slate-400">
          Full details in the <Link href="/docs" className="font-medium text-brand-400">API docs</Link>.
        </p>
      </div>
    </AppShell>
  );
}
