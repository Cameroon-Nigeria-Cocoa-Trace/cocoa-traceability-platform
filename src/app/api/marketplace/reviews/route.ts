/**
 * Marketplace Reviews API Route
 * Endpoint: /api/marketplace/reviews
 */

import { NextRequest, NextResponse } from "next/server";
import { getReviewsForListing, createReview } from "@/services/reviewService";
import { getAuthenticatedUser } from "@/lib/authServer";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const listingId = searchParams.get("listingId");
    if (!listingId) {
      return NextResponse.json({ success: false, error: "listingId is required." }, { status: 400 });
    }

    const data = await getReviewsForListing(listingId);
    return NextResponse.json({ success: true, ...data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch reviews";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await getAuthenticatedUser(req);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Authentication required";
    return NextResponse.json({ success: false, error: msg }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { listingId, sellerId, tradeId, rating, comment } = body;

    if (!listingId || !tradeId || !rating) {
      return NextResponse.json(
        { success: false, error: "Missing required fields (listingId, tradeId, rating)." },
        { status: 400 }
      );
    }

    // Verify trade exists and belongs to user
    const tradeSnap = await getDoc(doc(db, "trades", tradeId));
    if (!tradeSnap.exists()) {
      return NextResponse.json({ success: false, error: "Associated trade record not found." }, { status: 404 });
    }

    const tradeData = tradeSnap.data();
    if (tradeData.buyerId !== user.userId) {
      return NextResponse.json({ success: false, error: "Unauthorized: Trade does not belong to this buyer." }, { status: 403 });
    }

    if (tradeData.listingId !== listingId) {
      return NextResponse.json({ success: false, error: "Trade listing ID mismatch." }, { status: 400 });
    }

    const purchasedQuantityKg = tradeData.quantityKg || 0;

    const review = await createReview({
      listingId,
      sellerId: sellerId || tradeData.sellerHolderId,
      tradeId,
      buyerId: user.userId,
      buyerName: "Verified Buyer",
      rating: Number(rating),
      comment: comment || "",
      purchasedQuantityKg,
    });

    return NextResponse.json({ success: true, review });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to submit review";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
