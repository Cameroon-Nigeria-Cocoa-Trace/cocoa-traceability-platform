import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/authServer";
import { confirmPurchaseOrderBySeller } from "@/services/purchaseOrderService";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ poId: string }> }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { poId } = await context.params;
    const body = await req.json();

    const result = await confirmPurchaseOrderBySeller({
      poId,
      sellerUid: user.userId,
      sellerSignature: {
        signerName:
          typeof body?.sellerSignature?.signerName === "string"
            ? body.sellerSignature.signerName
            : "",
        signerTitle:
          typeof body?.sellerSignature?.signerTitle === "string"
            ? body.sellerSignature.signerTitle
            : undefined,
        signatureImageUrl:
          typeof body?.sellerSignature?.signatureImageUrl === "string"
            ? body.sellerSignature.signatureImageUrl
            : undefined,
        signaturePublicId:
          typeof body?.sellerSignature?.signaturePublicId === "string"
            ? body.sellerSignature.signaturePublicId
            : undefined,
      },
      sellerNotes: typeof body?.sellerNotes === "string" ? body.sellerNotes : undefined,
      sellerBankInstructions:
        typeof body?.sellerBankInstructions === "string"
          ? body.sellerBankInstructions
          : undefined,
    });

    return NextResponse.json({
      success: true,
      purchaseOrder: result.purchaseOrder,
      invoice: result.invoice,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[PO Seller Confirm Error]:", msg);
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
    return NextResponse.json({ error: "Failed to confirm purchase order." }, { status: 500 });
  }
}
