import { NextRequest, NextResponse } from "next/server";
import { cooperativeService } from "@/lib/cooperative/cooperativeService";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("cooperativeOrgId");
    const actorUid = req.headers.get("x-user-uid") || searchParams.get("userId");

    if (!orgId || !actorUid) {
      return NextResponse.json(
        { success: false, error: "cooperativeOrgId and actor userId are required." },
        { status: 400 }
      );
    }

    const data = await cooperativeService.getDashboardData(orgId, actorUid);
    return NextResponse.json({ success: true, data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
