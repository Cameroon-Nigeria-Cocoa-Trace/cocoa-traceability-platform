import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/authServer";
import {
  createPurchaseOrder,
  listPurchaseOrderBundlesForUser,
} from "@/services/purchaseOrderService";

function handleApiError(error: unknown, fallback: string) {
  const msg = error instanceof Error ? error.message : String(error);
  console.error("[PurchaseOrder API Error]:", msg);

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
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    const bundles = await listPurchaseOrderBundlesForUser(user.userId);
    return NextResponse.json({
      success: true,
      orders: bundles,
    });
  } catch (error: unknown) {
    return handleApiError(error, "Failed to load purchase orders.");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    const body = await req.json();

    const purchaseOrder = await createPurchaseOrder({
      listingId: typeof body?.listingId === "string" ? body.listingId : "",
      buyerId: user.userId,
      buyerName:
        typeof body?.buyerName === "string" && body.buyerName.trim()
          ? body.buyerName.trim()
          : undefined,
      buyerEmail:
        typeof body?.buyerEmail === "string" && body.buyerEmail.trim()
          ? body.buyerEmail.trim()
          : undefined,
      buyerHolderType: body?.buyerHolderType || "cooperative",
      quantityKg: Number(body?.quantityKg),
      unitPricePerKg: Number(body?.unitPricePerKg),
      buyerLetterhead: {
        companyName: typeof body?.buyerLetterhead?.companyName === "string" ? body.buyerLetterhead.companyName : "",
        address: typeof body?.buyerLetterhead?.address === "string" ? body.buyerLetterhead.address : "",
        businessRegistrationNumber:
          typeof body?.buyerLetterhead?.businessRegistrationNumber === "string"
            ? body.buyerLetterhead.businessRegistrationNumber
            : "",
        logoUrl: typeof body?.buyerLetterhead?.logoUrl === "string" ? body.buyerLetterhead.logoUrl : undefined,
        logoPublicId:
          typeof body?.buyerLetterhead?.logoPublicId === "string"
            ? body.buyerLetterhead.logoPublicId
            : undefined,
      },
      buyerSignature: {
        signerName: typeof body?.buyerSignature?.signerName === "string" ? body.buyerSignature.signerName : "",
        signerTitle:
          typeof body?.buyerSignature?.signerTitle === "string" ? body.buyerSignature.signerTitle : undefined,
        signatureImageUrl:
          typeof body?.buyerSignature?.signatureImageUrl === "string"
            ? body.buyerSignature.signatureImageUrl
            : undefined,
        signaturePublicId:
          typeof body?.buyerSignature?.signaturePublicId === "string"
            ? body.buyerSignature.signaturePublicId
            : undefined,
      },
      notes: typeof body?.notes === "string" ? body.notes : undefined,
    });

    return NextResponse.json(
      {
        success: true,
        purchaseOrder,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    return handleApiError(error, "Failed to create purchase order.");
  }
}
