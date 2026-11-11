import { NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json({ status: "ok", database_configured: isDbConfigured(), runtime: "nextjs", application: "upi-gateway" });
}
