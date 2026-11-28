import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/authServer";
import { markOffPlatformPaymentByBuyer } from "@/services/purchaseOrderService";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ poId: string }> }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { poId } = await context.params;
    const body = await req.json();

    const result = await markOffPlatformPaymentByBuyer({
      poId,
      buyerUid: user.userId,
      receiptUrl: typeof body?.receiptUrl === "string" ? body.receiptUrl : "",
      receiptPublicId: typeof body?.receiptPublicId === "string" ? body.receiptPublicId : undefined,
      fileName: typeof body?.fileName === "string" ? body.fileName : undefined,
      mimeType: typeof body?.mimeType === "string" ? body.mimeType : undefined,
      paymentReferenceNote:
        typeof body?.paymentReferenceNote === "string" ? body.paymentReferenceNote : undefined,
      paymentMethodNote:
        typeof body?.paymentMethodNote === "string" ? body.paymentMethodNote : undefined,
    });

    return NextResponse.json({
      success: true,
      purchaseOrder: result.purchaseOrder,
      invoice: result.invoice,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[PO Off-Platform Paid Error]:", msg);
    if (msg.includes("Authentication") || msg.toLowerCase().includes("unauthorized")) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    if (msg.includes("Authorization Error") || msg.includes("Security Error")) {
      return NextResponse.json({ error: msg }, { status: 403 });
    }
    if (msg.includes("Lookup Error")) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    if (msg.includes("State Error")) {
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    if (msg.includes("Validation Error")) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to submit off-platform payment receipt." }, { status: 500 });
  }
}
