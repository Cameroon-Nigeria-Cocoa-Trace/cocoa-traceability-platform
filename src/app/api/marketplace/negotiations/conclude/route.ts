/**
 * Conclude Negotiation API Route
 * Endpoint: /api/marketplace/negotiations/conclude
 * Handles:
 * - Deal Succeeded (Sold): Deducts quantity, bargained price, transfers certificates & holdings, sets available or sold
 * - Deal Fell Through: Restores listing to "available"
 */

import { NextRequest, NextResponse } from "next/server";
import { concludeNegotiationDeal } from "@/services/tradeService";
import { getAuthenticatedUser, AuthenticatedUser } from "@/lib/authServer";

export async function POST(req: NextRequest) {
  let user: AuthenticatedUser;
  try {
    user = await getAuthenticatedUser(req);
  } catch (authError: unknown) {
    const authMessage = authError instanceof Error ? authError.message : "Authentication Required";
    return NextResponse.json({ success: false, error: authMessage }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));

    if (!body.listingId || typeof body.listingId !== "string") {
      return NextResponse.json(
        { success: false, error: "Validation Error: listingId is required." },
        { status: 400 }
      );
    }

    if (body.dealOutcome !== "sold" && body.dealOutcome !== "deal_fell_through") {
      return NextResponse.json(
        {
          success: false,
          error: "Validation Error: dealOutcome must be either 'sold' or 'deal_fell_through'.",
        },
        { status: 400 }
      );
    }

    const result = await concludeNegotiationDeal({
      listingId: body.listingId.trim(),
      accessId: body.accessId ? String(body.accessId).trim() : undefined,
      sellerUid: user.userId,
      dealOutcome: body.dealOutcome,
      quantityKg: body.quantityKg !== undefined ? Number(body.quantityKg) : undefined,
      agreedPricePerKg: body.agreedPricePerKg !== undefined ? Number(body.agreedPricePerKg) : undefined,
      buyerId: body.buyerId ? String(body.buyerId).trim() : undefined,
      buyerHolderType: body.buyerHolderType || undefined,
      currency: body.currency || undefined,
      notes: body.notes || undefined,
      cancellationReason: body.cancellationReason || undefined,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    console.error("Conclude Negotiation Error:", message);

    const status = message.includes("Validation Error") || message.includes("Lookup Error")
      ? 400
      : message.includes("Security Error") || message.includes("Authorization")
      ? 403
      : 500;

    return NextResponse.json({ success: false, error: message }, { status });
  }
}
