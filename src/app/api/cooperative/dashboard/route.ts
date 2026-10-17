import { NextRequest, NextResponse } from "next/server";
import { cooperativeService } from "@/lib/cooperative/cooperativeService";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const cooperativeId =
      searchParams.get("cooperativeId") ||
      searchParams.get("id") ||
      searchParams.get("userId") ||
      "org_coop_sowescop";

    const dashboard = await cooperativeService.getDashboardData(cooperativeId);
    return NextResponse.json({ success: true, dashboard });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
