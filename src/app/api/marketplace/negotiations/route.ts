/**
 * Seller Negotiations API Route
 * Endpoint: /api/marketplace/negotiations
 * Retrieves all listings and inquiries where buyers have unlocked contact information
 */

import { NextRequest, NextResponse } from "next/server";
import { listNegotiationsForSeller } from "@/services/tradeService";
import { getAuthenticatedUser, AuthenticatedUser } from "@/lib/authServer";
import { firebaseAdminDb } from "@/lib/firebaseAdmin";
import { MarketplaceListing, SellerAccessRecord, SellerNegotiationItem } from "@/types/traceability";

export async function GET(req: NextRequest) {
  let user: AuthenticatedUser;
  try {
    user = await getAuthenticatedUser(req);
  } catch (authError: unknown) {
    const authMessage = authError instanceof Error ? authError.message : "Authentication Required";
    return NextResponse.json({ success: false, error: authMessage }, { status: 401 });
  }

  try {
    const targetUid = user.userId;

    let negotiations: SellerNegotiationItem[] = [];
    try {
      negotiations = await listNegotiationsForSeller(targetUid);
    } catch {
      // Server fallback using firebaseAdminDb
      const listingsSnap = await firebaseAdminDb.collection("marketplaceListings").get();
      const sellerListingsMap = new Map<string, MarketplaceListing>();
      listingsSnap.docs.forEach((d) => {
        const l = d.data() as MarketplaceListing;
        if (l.sellerHolderId === targetUid || l.createdByUid === targetUid) {
          sellerListingsMap.set(l.listingId, l);
        }
      });

      const accessSnap = await firebaseAdminDb.collection("sellerAccessRecords").get();
      const relevantAccess: SellerAccessRecord[] = [];
      accessSnap.docs.forEach((d) => {
        const r = d.data() as SellerAccessRecord;
        if (r.sellerHolderId === targetUid || r.sellerId === targetUid || sellerListingsMap.has(r.listingId)) {
          relevantAccess.push(r);
        }
      });

      for (const rec of relevantAccess) {
        const listing = sellerListingsMap.get(rec.listingId);
        if (!listing) continue;
        let buyerProfile = undefined;
        const bId = rec.buyerUid || rec.buyerId;
        if (bId && bId !== "prospective_buyer") {
          try {
            const uDoc = await firebaseAdminDb.collection("users").doc(bId).get();
            if (uDoc.exists) {
              const u = uDoc.data()!;
              buyerProfile = {
                userId: bId,
                displayName: u.displayName || u.name,
                email: u.email,
                phone: u.phone || u.phoneNumber,
                role: u.role,
              };
            }
          } catch {
            // Continue
          }
        }
        negotiations.push({
          accessRecord: rec,
          listing,
          buyerProfile,
        });
      }
    }

    return NextResponse.json({
      success: true,
      negotiations,
      count: negotiations.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
