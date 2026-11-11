import { json } from "@/lib/http";
export const dynamic = "force-dynamic";
// There are NO inbound webhooks in the source app (INVENTORY §10): provider
// callbacks land only on /pay/{order}/return, which ignores the posted data
// and re-checks via the provider status API. This route exists so a provider
// that POSTs here gets an explicit, documented refusal instead of a silent 404.
export async function POST(_req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  return json({ message: `Inbound webhooks are not accepted for provider '${provider}'. Payment confirmation happens only via server-side provider status checks (see /pay/{order}/return).` }, 410);
}
