/**
 * On-Platform Purchase API Route (Intent & Idempotent Finalization)
 * Endpoint: /api/marketplace/trades/on-platform-purchase
 */

import { NextRequest, NextResponse } from "next/server";
import { createPurchaseIntent, hasPaidSellerInfoAccess } from "@/services/tradeService";
import { getAuthenticatedUser, AuthenticatedUser } from "@/lib/authServer";
import { firebaseAdminDb } from "@/lib/firebaseAdmin";
import { MarketplaceListing } from "@/types/traceability";

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
    const action = body?.action;

    if (action === "intent") {
      const listingId = typeof body?.listingId === "string" ? body.listingId.trim() : "";
      if (!listingId) {
        return NextResponse.json(
          { success: false, error: "Validation Error: listingId is required." },
          { status: 400 }
        );
      }

      // Enforce server-side: buyers must pay for seller info before purchasing cocoa
      const listingSnap = await firebaseAdminDb
        .collection("marketplaceListings")
        .doc(listingId)
        .get();

      if (!listingSnap.exists) {
        return NextResponse.json(
          { success: false, error: `Lookup Error: Marketplace listing "${listingId}" does not exist.` },
          { status: 404 }
        );
      }

      const listing = listingSnap.data() as MarketplaceListing;
      const isSeller =
        listing.sellerHolderId === user.userId || listing.createdByUid === user.userId;

      if (isSeller) {
        return NextResponse.json(
          { success: false, error: "Authorization Error: Sellers cannot purchase their own listing." },
          { status: 403 }
        );
      }

      const accessCheck = await hasPaidSellerInfoAccess(
        user.userId,
        listing.sellerHolderId,
        listingId
      );

      if (!accessCheck.hasAccess) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Authorization Error: You must pay for seller information access before purchasing this cocoa.",
          },
          { status: 403 }
        );
      }

      const intent = await createPurchaseIntent({
        ...body,
        listingId,
        buyerId: user.userId,
      });

      return NextResponse.json({
        success: true,
        intent,
      });
    }

    if (action === "finalize") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Purchase finalization is temporarily unavailable while payment verification is being configured. No purchase has been completed.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Unsupported purchase action.",
      },
      { status: 400 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    const status = message.includes("Authentication Required")
      ? 401
      : message.includes("Authorization Error") || message.includes("Unsupported Transfer Route")
      ? 403
      : message.includes("Validation Error") || message.includes("Lookup Error")
      ? 400
      : message.includes("Quantity Error") || message.includes("Package Error") || message.includes("State Error")
      ? 409
      : 500;

    return NextResponse.json({ success: false, error: message }, { status });
  }
}
