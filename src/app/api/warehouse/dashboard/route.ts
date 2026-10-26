import { NextRequest, NextResponse } from "next/server";
import { warehouseService } from "@/lib/warehouse/warehouseService";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const facilityId = searchParams.get("facilityId");
    const actorUid = req.headers.get("x-user-uid") || searchParams.get("userId") || facilityId;

    if (!facilityId || !actorUid) {
      return NextResponse.json(
        { success: false, error: "facilityId and actor userId are required." },
        { status: 400 }
      );
    }

    const data = await warehouseService.getDashboardData(facilityId, actorUid);
    return NextResponse.json({ success: true, data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
