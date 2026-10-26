import { NextRequest, NextResponse } from "next/server";
import { warehouseService } from "@/lib/warehouse/warehouseService";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const actorUid = req.headers.get("x-user-uid") || body.actorUserId;

    if (body.action === "request_crs_trace_cert") {
      const crs = await warehouseService.requestCrossRiverStateTraceCertificate(body, actorUid);
      return NextResponse.json({ success: true, crsRequest: crs });
    }

    const result = await warehouseService.receiveConsignment(body, actorUid);
    return NextResponse.json({
      success: true,
      receipt: result.receipt,
      updatedFacility: result.updatedFacility,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
