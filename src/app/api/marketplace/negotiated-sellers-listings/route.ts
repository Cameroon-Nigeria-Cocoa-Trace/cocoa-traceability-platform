/**
 * Negotiated Sellers' Other Cocoa Listings API Route
 * Endpoint: /api/marketplace/negotiated-sellers-listings
 *
 * Returns other marketplace cocoa listings belonging to sellers for whom
 * the authenticated buyer has previously paid for seller contact information.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, AuthenticatedUser } from "@/lib/authServer";
import { firebaseAdminDb } from "@/lib/firebaseAdmin";
import { MarketplaceListing, SellerAccessRecord } from "@/types/traceability";

export interface UnlockedSellerContact {
  sellerHolderId: string;
  sellerHolderType: string;
  contactName: string;
  phone: string;
  email: string;
  location: string;
  paidListingsCount: number;
  lastAccessGrantedAt: string;
  otherListingsCount: number;
}

export interface NegotiatedSellerOtherListing {
  listing: MarketplaceListing;
  sellerContact: {
    sellerHolderId: string;
    sellerHolderType: string;
    contactName: string;
    phone: string;
    email: string;
    location: string;
    lastAccessGrantedAt: string;
  };
  tradeRequest?: {
    accessId: string;
    status: string;
    createdAt?: string;
    sellerConfirmedAt?: string;
    declinedAt?: string;
    declineReason?: string;
  };
  purchaseOrder?: {
    poId: string;
    poNumber: string;
    status: string;
  };
}

function isValidPaidAccessRecord(rec: SellerAccessRecord): boolean {
  if (rec.accessStatus === "revoked" || rec.status === "revoked") {
    return false;
  }
  if (rec.accessType === "repeat_buyer_trade_request") {
    return false;
  }
  const feePaid = Number(rec.feePaid ?? 0);
  const amountPaid = Number(rec.amountPaid ?? 0);
  return (
    feePaid > 0 ||
    amountPaid > 0 ||
    Boolean(rec.paymentReference) ||
    Boolean(rec.paymentId) ||
    rec.accessType === "flutterwave_seller_info_access" ||
    rec.accessType === "off_platform_negotiation" ||
    rec.accessType === "on_platform_purchase"
  );
}

async function resolveSellerContactInfo(
  sellerHolderId: string,
  sampleListing?: MarketplaceListing
): Promise<{
  sellerHolderType: string;
  contactName: string;
  phone: string;
  email: string;
  location: string;
}> {
  let contactName = "";
  let phone = "";
  let email = "";
  let location = "Cameroon";
  const sellerHolderType = sampleListing?.sellerHolderType || "farmer";

  // 1. Try farm record linked via lot or farmerId
  try {
    if (sampleListing?.lotId) {
      const lotSnap = await firebaseAdminDb
        .collection("cocoaLots")
        .doc(sampleListing.lotId)
        .get();
      const lotData = lotSnap.exists ? lotSnap.data() : null;
      if (lotData && typeof lotData.farmId === "string" && lotData.farmId) {
        const farmSnap = await firebaseAdminDb
          .collection("farms")
          .doc(lotData.farmId)
          .get();
        if (farmSnap.exists) {
          const farm = farmSnap.data() || {};
          if (farm.farmerId === sellerHolderId) {
            contactName = typeof farm.farmerName === "string" ? farm.farmerName.trim() : "";
            phone = typeof farm.farmerPhone === "string" ? farm.farmerPhone.trim() : "";
            email = typeof farm.farmerEmail === "string" ? farm.farmerEmail.trim() : "";
            const locParts = [
              typeof farm.village === "string" ? farm.village.trim() : "",
              typeof farm.region === "string" ? farm.region.trim() : "",
              "Cameroon",
            ].filter(Boolean);
            if (locParts.length > 0) location = locParts.join(", ");
          }
        }
      }
    }

    if (!contactName && !phone && !email) {
      const farmsByFarmer = await firebaseAdminDb
        .collection("farms")
        .where("farmerId", "==", sellerHolderId)
        .limit(1)
        .get();
      if (!farmsByFarmer.empty) {
        const farm = farmsByFarmer.docs[0].data() || {};
        contactName = typeof farm.farmerName === "string" ? farm.farmerName.trim() : "";
        phone = typeof farm.farmerPhone === "string" ? farm.farmerPhone.trim() : "";
        email = typeof farm.farmerEmail === "string" ? farm.farmerEmail.trim() : "";
        const locParts = [
          typeof farm.village === "string" ? farm.village.trim() : "",
          typeof farm.region === "string" ? farm.region.trim() : "",
          "Cameroon",
        ].filter(Boolean);
        if (locParts.length > 0) location = locParts.join(", ");
      }
    }
  } catch {
    // Fall through to user profile lookup
  }

  // 2. Fallback / enrich from users collection
  if (!contactName || (!phone && !email)) {
    try {
      const userSnap = await firebaseAdminDb.collection("users").doc(sellerHolderId).get();
      if (userSnap.exists) {
        const u = userSnap.data() || {};
        if (!contactName) {
          contactName =
            typeof u.displayName === "string" && u.displayName.trim()
              ? u.displayName.trim()
              : typeof u.name === "string"
                ? u.name.trim()
                : "";
        }
        if (!phone) {
          phone =
            typeof u.phone === "string" && u.phone.trim()
              ? u.phone.trim()
              : typeof u.phoneNumber === "string"
                ? u.phoneNumber.trim()
                : "";
        }
        if (!email && typeof u.email === "string") {
          email = u.email.trim();
        }
      }
    } catch {
      // Ignore profile fallback errors
    }
  }

  return {
    sellerHolderType,
    contactName: contactName || `Verified Seller (${sellerHolderId.slice(-6)})`,
    phone,
    email,
    location,
  };
}

export async function GET(req: NextRequest) {
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
    const buyerUid = user.userId;

    // 1. Fetch all sellerAccessRecords and purchaseOrders owned by the authenticated buyer
    const [byBuyerUidSnap, byBuyerIdSnap, buyerPosSnap] = await Promise.all([
      firebaseAdminDb
        .collection("sellerAccessRecords")
        .where("buyerUid", "==", buyerUid)
        .get(),
      firebaseAdminDb
        .collection("sellerAccessRecords")
        .where("buyerId", "==", buyerUid)
        .get(),
      firebaseAdminDb
        .collection("purchaseOrders")
        .where("buyerId", "==", buyerUid)
        .get(),
    ]);

    const accessMap = new Map<string, SellerAccessRecord>();
    const tradeRequestByListingId = new Map<string, SellerAccessRecord>();

    for (const d of [...byBuyerUidSnap.docs, ...byBuyerIdSnap.docs]) {
      const rec = d.data() as SellerAccessRecord;
      if (rec.accessType === "repeat_buyer_trade_request") {
        const existingReq = tradeRequestByListingId.get(rec.listingId);
        const existingTs = existingReq?.updatedAt || existingReq?.createdAt || "";
        const nextTs = rec.updatedAt || rec.createdAt || "";
        if (!existingReq || nextTs >= existingTs) {
          tradeRequestByListingId.set(rec.listingId, rec);
        }
        continue;
      }

      if (isValidPaidAccessRecord(rec)) {
        accessMap.set(d.id, rec);
      }
    }

    if (accessMap.size === 0) {
      return NextResponse.json({
        success: true,
        unlockedSellers: [],
        otherListings: [],
        count: 0,
      });
    }

    // Index buyer's non-cancelled purchase orders by listingId (newest first)
    const poByListingId = new Map<
      string,
      { poId: string; poNumber: string; status: string; createdAt: string }
    >();
    for (const d of buyerPosSnap.docs) {
      const po = d.data() as {
        poId?: string;
        poNumber?: string;
        listingId?: string;
        status?: string;
        createdAt?: string;
      };
      if (!po.listingId || !po.poId || po.status === "cancelled") continue;
      const existingPo = poByListingId.get(po.listingId);
      if (!existingPo || (po.createdAt || "") >= existingPo.createdAt) {
        poByListingId.set(po.listingId, {
          poId: po.poId,
          poNumber: po.poNumber || po.poId,
          status: po.status || "po_submitted",
          createdAt: po.createdAt || "",
        });
      }
    }

    // 2. Group paid access records by sellerHolderId and track which listingIds were already paid for
    const sellerAccessSummary = new Map<
      string,
      {
        paidListingIds: Set<string>;
        lastAccessGrantedAt: string;
      }
    >();

    for (const rec of accessMap.values()) {
      const sellerId = (rec.sellerHolderId || rec.sellerId || "").trim();
      if (!sellerId || sellerId === buyerUid) continue;

      const existing = sellerAccessSummary.get(sellerId) || {
        paidListingIds: new Set<string>(),
        lastAccessGrantedAt: "",
      };

      if (rec.listingId) {
        existing.paidListingIds.add(rec.listingId);
      }

      const grantedAt = rec.accessGrantedAt || rec.createdAt || "";
      if (grantedAt && grantedAt > existing.lastAccessGrantedAt) {
        existing.lastAccessGrantedAt = grantedAt;
      }

      sellerAccessSummary.set(sellerId, existing);
    }

    const sellerIds = Array.from(sellerAccessSummary.keys());
    if (sellerIds.length === 0) {
      return NextResponse.json({
        success: true,
        unlockedSellers: [],
        otherListings: [],
        count: 0,
      });
    }

    // 3. Query marketplaceListings for each unlocked seller and collect OTHER listings
    const unlockedSellers: UnlockedSellerContact[] = [];
    const otherListings: NegotiatedSellerOtherListing[] = [];

    for (const sellerId of sellerIds) {
      const summary = sellerAccessSummary.get(sellerId)!;

      const listingsSnap = await firebaseAdminDb
        .collection("marketplaceListings")
        .where("sellerHolderId", "==", sellerId)
        .get();

      const allSellerListings = listingsSnap.docs
        .map((d) => d.data() as MarketplaceListing)
        .filter(
          (l) =>
            l.listingStatus !== "cancelled" &&
            l.listingStatus !== "expired" &&
            l.createdByUid !== buyerUid
        );

      // Filter strictly to OTHER listings (not the exact listing(s) originally paid for)
      const sellerOtherListings = allSellerListings.filter(
        (l) => !summary.paidListingIds.has(l.listingId)
      );

      const sampleListing = sellerOtherListings[0] || allSellerListings[0];
      const contact = await resolveSellerContactInfo(sellerId, sampleListing);

      unlockedSellers.push({
        sellerHolderId: sellerId,
        sellerHolderType: contact.sellerHolderType,
        contactName: contact.contactName,
        phone: contact.phone,
        email: contact.email,
        location: contact.location,
        paidListingsCount: summary.paidListingIds.size,
        lastAccessGrantedAt: summary.lastAccessGrantedAt,
        otherListingsCount: sellerOtherListings.length,
      });

      for (const listing of sellerOtherListings) {
        const reqRec = tradeRequestByListingId.get(listing.listingId);
        const poRec = poByListingId.get(listing.listingId);

        otherListings.push({
          listing,
          sellerContact: {
            sellerHolderId: sellerId,
            sellerHolderType: contact.sellerHolderType,
            contactName: contact.contactName,
            phone: contact.phone,
            email: contact.email,
            location: contact.location,
            lastAccessGrantedAt: summary.lastAccessGrantedAt,
          },
          tradeRequest: reqRec
            ? {
                accessId: reqRec.accessId,
                status: reqRec.accessStatus,
                createdAt: reqRec.createdAt,
                sellerConfirmedAt: reqRec.sellerConfirmedAt,
                declinedAt: reqRec.declinedAt,
                declineReason: reqRec.declineReason,
              }
            : undefined,
          purchaseOrder: poRec
            ? {
                poId: poRec.poId,
                poNumber: poRec.poNumber,
                status: poRec.status,
              }
            : undefined,
        });
      }
    }

    // Sort: buyer's active/confirmed requests first, then pending requests, then available, then other under_negotiation, then sold
    const itemPriority = (item: NegotiatedSellerOtherListing): number => {
      if (item.tradeRequest?.status === "active" && !item.purchaseOrder) return 0;
      if (item.tradeRequest?.status === "pending_seller_confirmation") return 1;
      if (item.listing.listingStatus === "available") return 2;
      if (item.listing.listingStatus === "under_negotiation") return 3;
      return 4;
    };

    otherListings.sort((a, b) => {
      const prioDiff = itemPriority(a) - itemPriority(b);
      if (prioDiff !== 0) return prioDiff;
      return (b.listing.createdAt || "").localeCompare(a.listing.createdAt || "");
    });

    unlockedSellers.sort((a, b) =>
      (b.lastAccessGrantedAt || "").localeCompare(a.lastAccessGrantedAt || "")
    );

    return NextResponse.json({
      success: true,
      unlockedSellers,
      otherListings,
      count: otherListings.length,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal Server Error";
    console.error("Failed to fetch negotiated sellers' listings:", message);
    return NextResponse.json(
      { success: false, error: "Failed to load listings from negotiated sellers." },
      { status: 500 }
    );
  }
}
