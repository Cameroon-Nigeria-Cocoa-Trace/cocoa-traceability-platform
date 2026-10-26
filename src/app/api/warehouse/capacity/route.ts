import { NextRequest, NextResponse } from "next/server";
import { warehouseService } from "@/lib/warehouse/warehouseService";
import { warehouseStore } from "@/lib/warehouse/warehouseStore";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const facilityId = searchParams.get("facilityId");
    if (!facilityId) {
      return NextResponse.json({ success: false, error: "facilityId is required." }, { status: 400 });
    }
    const facility = await warehouseStore.getFacility(facilityId);
    if (!facility) {
      return NextResponse.json({ success: false, error: "Facility not found." }, { status: 404 });
    }
    return NextResponse.json({
      success: true,
      capacityKg: facility.capacityKg,
      currentStockKg: facility.currentStockKg,
      availableCapacityKg: facility.availableCapacityKg,
      operationalStatus: facility.operationalStatus,
      adminStatus: facility.adminStatus,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const actorUid = req.headers.get("x-user-uid") || body.actorUserId;
    const updated = await warehouseService.updateOperationalStatus(
      body.facilityId,
      body.status,
      actorUid
    );
    return NextResponse.json({ success: true, facility: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
