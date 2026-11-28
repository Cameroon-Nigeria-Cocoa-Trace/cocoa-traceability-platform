/**
 * Seller Negotiations & Incoming Trade Requests API Route
 * Endpoint: /api/marketplace/negotiations
 *
 * Retrieves all listings where buyers have either:
 *  - Paid to unlock seller contact information, or
 *  - Submitted a "Start Trade" request from Negotiated Sellers' Other Listings (awaiting seller confirmation).
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, AuthenticatedUser } from "@/lib/authServer";
import { firebaseAdminDb } from "@/lib/firebaseAdmin";
import {
  MarketplaceListing,
  SellerAccessRecord,
  SellerNegotiationItem,
} from "@/types/traceability";

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
    const targetUid = user.userId;

    const [
      bySellerHolderSnap,
      byCreatedBySnap,
      accessByHolderSnap,
      accessBySellerSnap,
      sellerPosSnap,
    ] = await Promise.all([
      firebaseAdminDb
        .collection("marketplaceListings")
        .where("sellerHolderId", "==", targetUid)
        .get(),
      firebaseAdminDb
        .collection("marketplaceListings")
        .where("createdByUid", "==", targetUid)
        .get(),
      firebaseAdminDb
        .collection("sellerAccessRecords")
        .where("sellerHolderId", "==", targetUid)
        .get(),
      firebaseAdminDb
        .collection("sellerAccessRecords")
        .where("sellerId", "==", targetUid)
        .get(),
      firebaseAdminDb
        .collection("purchaseOrders")
        .where("sellerId", "==", targetUid)
        .get(),
    ]);

    const sellerListingsMap = new Map<string, MarketplaceListing>();
    for (const d of [...bySellerHolderSnap.docs, ...byCreatedBySnap.docs]) {
      const l = d.data() as MarketplaceListing;
      if (l?.listingId) {
        sellerListingsMap.set(l.listingId, l);
      }
    }

    // Collect access records linked to this seller or any of their listings
    const accessMap = new Map<string, SellerAccessRecord>();
    for (const d of [...accessByHolderSnap.docs, ...accessBySellerSnap.docs]) {
      const r = d.data() as SellerAccessRecord;
      if (!r?.listingId) continue;
      accessMap.set(d.id, r);
    }

    // Also fetch access records by listingId for listings owned via createdByUid
    const listingIds = Array.from(sellerListingsMap.keys());
    if (listingIds.length > 0) {
      for (let i = 0; i < listingIds.length; i += 10) {
        const chunk = listingIds.slice(i, i + 10);
        const byListingSnap = await firebaseAdminDb
          .collection("sellerAccessRecords")
          .where("listingId", "in", chunk)
          .get();
        for (const d of byListingSnap.docs) {
          const r = d.data() as SellerAccessRecord;
          accessMap.set(d.id, r);
        }
      }
    }

    // Fetch any listing referenced in accessMap that wasn't already loaded
    const missingListingIds = Array.from(
      new Set(
        Array.from(accessMap.values())
          .map((r) => r.listingId)
          .filter((id) => id && !sellerListingsMap.has(id))
      )
    );
    await Promise.all(
      missingListingIds.map(async (id) => {
        const snap = await firebaseAdminDb
          .collection("marketplaceListings")
          .doc(id)
          .get();
        if (snap.exists) {
          const l = snap.data() as MarketplaceListing;
          sellerListingsMap.set(l.listingId, l);
        }
      })
    );

    // Map (listingId::buyerId) -> latest non-cancelled purchase order
    const poByListingAndBuyer = new Map<
      string,
      { poId: string; poNumber: string; status: string; createdAt: string }
    >();
    for (const d of sellerPosSnap.docs) {
      const po = d.data() as {
        poId?: string;
        poNumber?: string;
        listingId?: string;
        buyerId?: string;
        status?: string;
        createdAt?: string;
      };
      if (!po.listingId || !po.buyerId || !po.poId || po.status === "cancelled") {
        continue;
      }
      const key = `${po.listingId}::${po.buyerId}`;
      const existing = poByListingAndBuyer.get(key);
      if (!existing || (po.createdAt || "") >= existing.createdAt) {
        poByListingAndBuyer.set(key, {
          poId: po.poId,
          poNumber: po.poNumber || po.poId,
          status: po.status || "po_submitted",
          createdAt: po.createdAt || "",
        });
      }
    }

    // Cache buyer profile lookups
    const buyerProfileCache = new Map<
      string,
      SellerNegotiationItem["buyerProfile"]
    >();

    const negotiations: SellerNegotiationItem[] = [];

    for (const rec of accessMap.values()) {
      const listing = sellerListingsMap.get(rec.listingId);
      if (!listing) continue;
      if (rec.accessStatus === "revoked" || rec.status === "revoked") continue;

      const bId = rec.buyerUid || rec.buyerId;
      let buyerProfile: SellerNegotiationItem["buyerProfile"] = undefined;

      if (bId && bId !== "prospective_buyer") {
        if (buyerProfileCache.has(bId)) {
          buyerProfile = buyerProfileCache.get(bId);
        } else {
          try {
            const uDoc = await firebaseAdminDb
              .collection("users")
              .doc(bId)
              .get();
            if (uDoc.exists) {
              const u = uDoc.data() || {};
              buyerProfile = {
                userId: bId,
                displayName:
                  (typeof u.displayName === "string" && u.displayName) ||
                  (typeof u.name === "string" && u.name) ||
                  undefined,
                email: typeof u.email === "string" ? u.email : undefined,
                phone:
                  (typeof u.phone === "string" && u.phone) ||
                  (typeof u.phoneNumber === "string" && u.phoneNumber) ||
                  undefined,
                role: typeof u.role === "string" ? u.role : undefined,
              };
            }
          } catch {
            // Continue without profile
          }
          buyerProfileCache.set(bId, buyerProfile);
        }
      }

      const linkedPo = bId
        ? poByListingAndBuyer.get(`${rec.listingId}::${bId}`)
        : undefined;

      negotiations.push({
        accessRecord: rec,
        listing,
        buyerProfile,
        purchaseOrder: linkedPo
          ? {
              poId: linkedPo.poId,
              poNumber: linkedPo.poNumber,
              status: linkedPo.status,
            }
          : undefined,
      });
    }

    // Sort: pending seller confirmation first, then active negotiations, then concluded/declined
    const priority = (item: SellerNegotiationItem): number => {
      const st = item.accessRecord.accessStatus;
      if (st === "pending_seller_confirmation") return 0;
      if (st === "active") return 1;
      if (st === "concluded_sold") return 2;
      return 3;
    };

    negotiations.sort((a, b) => {
      const p = priority(a) - priority(b);
      if (p !== 0) return p;
      const tsA =
        a.accessRecord.updatedAt ||
        a.accessRecord.createdAt ||
        a.accessRecord.accessGrantedAt ||
        "";
      const tsB =
        b.accessRecord.updatedAt ||
        b.accessRecord.createdAt ||
        b.accessRecord.accessGrantedAt ||
        "";
      return tsB.localeCompare(tsA);
    });

    return NextResponse.json({
      success: true,
      negotiations,
      count: negotiations.length,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
