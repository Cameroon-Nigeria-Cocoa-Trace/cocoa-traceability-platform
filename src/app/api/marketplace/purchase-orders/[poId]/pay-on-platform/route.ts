import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/authServer";
import { initiateOnPlatformInvoicePayment } from "@/services/purchaseOrderService";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ poId: string }> }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { poId } = await context.params;
    const body = await req.json();

    const result = await initiateOnPlatformInvoicePayment({
      poId,
      buyerUid: user.userId,
      onPlatformMode: body?.onPlatformMode,
      customerEmail:
        typeof body?.customerEmail === "string" && body.customerEmail.trim()
          ? body.customerEmail.trim()
          : undefined,
      customerName:
        typeof body?.customerName === "string" && body.customerName.trim()
          ? body.customerName
          : undefined,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[PO On-Platform Pay Error]:", msg);
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
    if (msg.includes("Validation Error") || msg.includes("Configuration Error")) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    if (msg.includes("Flutterwave Checkout Error")) {
      return NextResponse.json({ error: msg }, { status: 502 });
    }
    return NextResponse.json({ error: "Failed to initiate on-platform payment." }, { status: 500 });
  }
}
