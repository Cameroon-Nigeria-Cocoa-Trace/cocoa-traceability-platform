/**
 * Seller Negotiation Trade Request Response API Route
 * Endpoint: POST /api/marketplace/negotiations/respond
 *
 * Allows a seller to confirm or decline an incoming "Start Trade" request from
 * a returning buyer. Confirming moves the listing to `under_negotiation` and
 * authorizes the buyer to start the Purchase Order procedure.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, AuthenticatedUser } from "@/lib/authServer";
import { firebaseAdminDb } from "@/lib/firebaseAdmin";
import { MarketplaceListing, SellerAccessRecord } from "@/types/traceability";

async function isAuthorizedSellerForListing(
  userUid: string,
  listing: MarketplaceListing,
  accessRecord: SellerAccessRecord
): Promise<boolean> {
  if (
    listing.sellerHolderId === userUid ||
    listing.createdByUid === userUid ||
    accessRecord.sellerHolderId === userUid ||
    accessRecord.sellerId === userUid
  ) {
    return true;
  }

  // Check if user is a cooperative managing the farm linked to this lot
  if (listing.lotId) {
    try {
      const lotSnap = await firebaseAdminDb
        .collection("cocoaLots")
        .doc(listing.lotId)
        .get();
      const lot = lotSnap.exists ? lotSnap.data() : null;
      if (lot && typeof lot.farmId === "string" && lot.farmId) {
        const farmSnap = await firebaseAdminDb
          .collection("farms")
          .doc(lot.farmId)
          .get();
        const farm = farmSnap.exists ? farmSnap.data() : null;
        if (
          farm &&
          (farm.registeredByUid === userUid ||
            farm.cooperativeOrgId === userUid ||
            farm.createdBy === userUid)
        ) {
          return true;
        }
      }
    } catch {
      // Ignore lookup errors
    }
  }

  return false;
}

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
    const accessId =
      typeof body?.accessId === "string" ? body.accessId.trim() : "";
    const action = body?.action === "confirm" || body?.action === "decline"
      ? (body.action as "confirm" | "decline")
      : null;
    const reason =
      typeof body?.reason === "string" ? body.reason.trim().slice(0, 500) : "";

    if (!accessId || !action) {
      return NextResponse.json(
        {
          success: false,
          error: "accessId and action ('confirm' or 'decline') are required.",
        },
        { status: 400 }
      );
    }

    const accessRef = firebaseAdminDb
      .collection("sellerAccessRecords")
      .doc(accessId);
    const initialAccessSnap = await accessRef.get();

    if (!initialAccessSnap.exists) {
      return NextResponse.json(
        { success: false, error: "Trade request record not found." },
        { status: 404 }
      );
    }

    const initialAccess = initialAccessSnap.data() as SellerAccessRecord;
    const listingRef = firebaseAdminDb
      .collection("marketplaceListings")
      .doc(initialAccess.listingId);
    const initialListingSnap = await listingRef.get();

    if (!initialListingSnap.exists) {
      return NextResponse.json(
        { success: false, error: "Associated marketplace listing not found." },
        { status: 404 }
      );
    }

    const initialListing = initialListingSnap.data() as MarketplaceListing;
    const isAllowed = await isAuthorizedSellerForListing(
      user.userId,
      initialListing,
      initialAccess
    );
    if (!isAllowed) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Authorization Error: Only the listing seller can respond to this trade request.",
        },
        { status: 403 }
      );
    }

    // Fetch any competing pending requests on the same listing before the transaction
    const competingSnap =
      action === "confirm"
        ? await firebaseAdminDb
            .collection("sellerAccessRecords")
            .where("listingId", "==", initialAccess.listingId)
            .where("accessStatus", "==", "pending_seller_confirmation")
            .get()
        : null;

    const now = new Date().toISOString();

    const result = await firebaseAdminDb.runTransaction(async (tx) => {
      const accSnap = await tx.get(accessRef);
      const listSnap = await tx.get(listingRef);

      if (!accSnap.exists || !listSnap.exists) {
        throw new Error("NOT_FOUND: Listing or trade request no longer exists.");
      }

      const acc = accSnap.data() as SellerAccessRecord;
      const listing = listSnap.data() as MarketplaceListing;

      if (acc.accessStatus !== "pending_seller_confirmation") {
        throw new Error(
          `STATE_ERROR: This trade request has already been processed (current status: ${acc.accessStatus}).`
        );
      }

      if (action === "confirm") {
        if (listing.listingStatus !== "available") {
          throw new Error(
            `CONFLICT: Listing is currently "${listing.listingStatus}" and cannot be locked for a new negotiation.`
          );
        }

        const updatedListing: MarketplaceListing = {
          ...listing,
          listingStatus: "under_negotiation",
          updatedAt: now,
        };
        const updatedAccess: SellerAccessRecord = {
          ...acc,
          accessStatus: "active",
          status: "active",
          accessGrantedAt: now,
          sellerConfirmedAt: now,
          updatedAt: now,
        };

        tx.update(listingRef, {
          listingStatus: "under_negotiation",
          updatedAt: now,
        });
        tx.update(accessRef, {
          accessStatus: "active",
          status: "active",
          accessGrantedAt: now,
          sellerConfirmedAt: now,
          updatedAt: now,
        });

        // Automatically decline other pending trade requests on this same listing
        if (competingSnap) {
          for (const compDoc of competingSnap.docs) {
            if (compDoc.id === accessId) continue;
            tx.update(compDoc.ref, {
              accessStatus: "declined",
              status: "declined",
              declinedAt: now,
              declineReason:
                "Seller confirmed another buyer's trade request for this lot.",
              updatedAt: now,
            });
          }
        }

        return { updatedListing, updatedAccess };
      }

      // Decline flow: keep listing available
      const declineReason = reason || "Trade request declined by seller.";
      const updatedAccess: SellerAccessRecord = {
        ...acc,
        accessStatus: "declined",
        status: "declined",
        declinedAt: now,
        declineReason,
        updatedAt: now,
      };

      tx.update(accessRef, {
        accessStatus: "declined",
        status: "declined",
        declinedAt: now,
        declineReason,
        updatedAt: now,
      });

      return { updatedListing: listing, updatedAccess };
    });

    return NextResponse.json({
      success: true,
      message:
        action === "confirm"
          ? "Trade confirmed! The cocoa listing is now Under Negotiation and the buyer can generate their Purchase Order."
          : "Trade request declined. Your cocoa listing remains available on the marketplace.",
      accessRecord: result.updatedAccess,
      listing: result.updatedListing,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to process seller response.";
    const status = message.startsWith("NOT_FOUND:")
      ? 404
      : message.startsWith("STATE_ERROR:") || message.startsWith("CONFLICT:")
        ? 409
        : 500;
    return NextResponse.json(
      {
        success: false,
        error: message.replace(/^(NOT_FOUND|STATE_ERROR|CONFLICT):\s*/, ""),
      },
      { status }
    );
  }
}
