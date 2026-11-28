import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/authServer";
import { confirmOffPlatformPaymentBySeller } from "@/services/purchaseOrderService";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ poId: string }> }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { poId } = await context.params;
    const body = await req.json().catch(() => ({}));

    const result = await confirmOffPlatformPaymentBySeller({
      poId,
      sellerUid: user.userId,
      deliveryNotes: typeof body?.deliveryNotes === "string" ? body.deliveryNotes : undefined,
    });

    return NextResponse.json({
      success: true,
      purchaseOrder: result.purchaseOrder,
      invoice: result.invoice,
      deliveryNote: result.deliveryNote,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[PO Seller Confirm Off-Platform Error]:", msg);
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
    return NextResponse.json({ error: "Failed to confirm off-platform payment." }, { status: 500 });
  }
}
