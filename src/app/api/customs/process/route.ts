import { NextRequest, NextResponse } from "next/server";
import { customsService } from "@/lib/customs/customsService";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const officerUid = req.headers.get("x-customs-uid") || body.officerUserId || "usr_customs_lead_01";

    if (body.action === "update_stage") {
      const updated = await customsService.updateProcessingStage(
        {
          requestId: body.requestId,
          newStatus: body.newStatus,
          statutoryReferencesUpdate: body.statutoryReferencesUpdate,
          comments: body.comments,
        },
        officerUid
      );
      return NextResponse.json({ success: true, request: updated });
    }

    if (body.action === "record_payment") {
      const updated = await customsService.recordFeePayment(
        body.requestId,
        body.paymentReference,
        officerUid
      );
      return NextResponse.json({ success: true, request: updated });
    }

    if (body.action === "mark_cleared") {
      const cleared = await customsService.markRequestCleared(
        {
          requestId: body.requestId,
          singleGoodsDeclarationNumber: body.singleGoodsDeclarationNumber,
          cleanCertificateOfInspectionNumber: body.cleanCertificateOfInspectionNumber,
          billOfLadingOrConsignmentNote: body.billOfLadingOrConsignmentNote,
          clearanceNotes: body.clearanceNotes,
        },
        officerUid
      );
      return NextResponse.json({ success: true, request: cleared });
    }

    if (body.action === "query" || body.action === "reject") {
      const result = await customsService.raiseQueryOrReject(
        {
          requestId: body.requestId,
          action: body.action,
          reason: body.reason,
        },
        officerUid
      );
      return NextResponse.json({ success: true, request: result });
    }

    return NextResponse.json(
      { success: false, error: `Unrecognized customs processing action: "${body.action}".` },
      { status: 400 }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
