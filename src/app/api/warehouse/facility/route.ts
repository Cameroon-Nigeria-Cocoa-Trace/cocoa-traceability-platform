import { NextRequest, NextResponse } from "next/server";
import { warehouseService } from "@/lib/warehouse/warehouseService";
import { warehouseStore } from "@/lib/warehouse/warehouseStore";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const facilityId = searchParams.get("facilityId") || req.headers.get("x-user-uid");
    if (!facilityId) {
      return NextResponse.json({ success: false, error: "facilityId is required." }, { status: 400 });
    }
    const facility = await warehouseStore.getFacility(facilityId);
    return NextResponse.json({ success: true, facility });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.action === "create_organization") {
      const org = await warehouseService.createOrganization(body);
      return NextResponse.json({ success: true, organization: org });
    }

    const facility = await warehouseService.registerFacility(body);
    return NextResponse.json({ success: true, facility });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
