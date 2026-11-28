/**
 * Start Trade Request on Negotiated Seller's Other Listing
 * Endpoint: POST /api/marketplace/negotiated-sellers-listings/start-trade
 *
 * Allows a buyer who has previously paid for a seller's contact info to request
 * starting a trade on another available listing from the same seller.
 * Requires seller confirmation before the listing moves to `under_negotiation`
 * and the Purchase Order procedure begins.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, AuthenticatedUser } from "@/lib/authServer";
import { firebaseAdminDb } from "@/lib/firebaseAdmin";
import { hasPaidSellerInfoAccess } from "@/services/tradeService";
import { MarketplaceListing, SellerAccessRecord } from "@/types/traceability";

export async function POST(req: NextRequest) {
  let user: AuthenticatedUser;
  try {
    user = await getAuthenticatedUser(req);
  } catch (authError: unknown) {
    const authMessage =
      authError instanceof Error ? authError.message : "Authentication Required";
    return NextResponse.json(
      { success: false, error: authMessage },
      { status: 401 }
    );
  }

  try {
    const body = await req.json();
    const listingId =
      typeof body?.listingId === "string" ? body.listingId.trim() : "";
    const buyerNote =
      typeof body?.buyerNote === "string" ? body.buyerNote.trim().slice(0, 500) : "";

    if (!listingId) {
      return NextResponse.json(
        { success: false, error: "listingId is required." },
        { status: 400 }
      );
    }

    const buyerUid = user.userId;
    const listingRef = firebaseAdminDb
      .collection("marketplaceListings")
      .doc(listingId);
    const listingSnap = await listingRef.get();

    if (!listingSnap.exists) {
      return NextResponse.json(
        { success: false, error: "Marketplace listing not found." },
        { status: 404 }
      );
    }

    const listing = listingSnap.data() as MarketplaceListing;

    if (
      listing.sellerHolderId === buyerUid ||
      listing.createdByUid === buyerUid
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "You cannot start a trade on your own cocoa listing.",
        },
        { status: 403 }
      );
    }

    // Verify buyer previously paid for seller info for this seller
    const paidAccess = await hasPaidSellerInfoAccess(
      buyerUid,
      listing.sellerHolderId
    );
    if (!paidAccess.hasAccess) {
      return NextResponse.json(
        {
          success: false,
          error:
            "You must have previously paid for this seller's contact info before requesting a trade from this tab.",
        },
        { status: 403 }
      );
    }

    const accessId = `req_${listingId}_${buyerUid}`;
    const accessRef = firebaseAdminDb
      .collection("sellerAccessRecords")
      .doc(accessId);
    const existingSnap = await accessRef.get();

    if (existingSnap.exists) {
      const existing = existingSnap.data() as SellerAccessRecord;
      if (existing.accessStatus === "pending_seller_confirmation") {
        return NextResponse.json({
          success: true,
          alreadyRequested: true,
          message:
            "Trade request is already pending seller confirmation.",
          accessRecord: existing,
        });
      }
      if (existing.accessStatus === "active") {
        return NextResponse.json({
          success: true,
          alreadyConfirmed: true,
          message:
            "Seller has already confirmed this trade request. You can create a Purchase Order now.",
          accessRecord: existing,
        });
      }
    }

    if (listing.listingStatus !== "available") {
      return NextResponse.json(
        {
          success: false,
          error:
            listing.listingStatus === "under_negotiation"
              ? "This cocoa listing is currently under negotiation with another buyer."
              : `This listing is "${listing.listingStatus}" and cannot start a new trade.`,
        },
        { status: 409 }
      );
    }

    if ((Number(listing.quantityAvailableKg) || 0) <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: "This listing has no remaining available quantity.",
        },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const record: SellerAccessRecord = {
      accessId,
      listingId: listing.listingId,
      lotId: listing.lotId,
      buyerId: buyerUid,
      buyerUid,
      sellerHolderId: listing.sellerHolderId,
      sellerId: listing.sellerHolderId,
      accessType: "repeat_buyer_trade_request",
      feePaid: 0,
      amountPaid: 0,
      currency: (listing.currency || "XAF").toUpperCase(),
      accessStatus: "pending_seller_confirmation",
      status: "pending_seller_confirmation",
      accessGrantedAt: "",
      buyerNote: buyerNote || undefined,
      createdAt: now,
      updatedAt: now,
    };

    // Strip undefined fields before writing to Firestore
    const cleanRecord = Object.fromEntries(
      Object.entries(record).filter(([, v]) => v !== undefined)
    );

    await accessRef.set(cleanRecord);

    return NextResponse.json(
      {
        success: true,
        message:
          "Trade request submitted. Once the seller confirms, the cocoa moves to Under Negotiation and you can generate a Purchase Order.",
        accessRecord: record,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to start trade request.";
    console.error("Error creating repeat-buyer trade request:", message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
