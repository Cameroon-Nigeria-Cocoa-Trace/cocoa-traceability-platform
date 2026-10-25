/**
 * Marketplace Review & Seller Rating Service
 */

import {
  collection,
  doc,
  getDocs,
  setDoc,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { MarketplaceReview } from "@/types/traceability";

export const COLLECTIONS = {
  REVIEWS: "marketplaceReviews",
} as const;

export async function getReviewsForListing(listingId: string): Promise<{
  reviews: MarketplaceReview[];
  averageRating: number;
  totalReviews: number;
}> {
  try {
    const q = query(
      collection(db, COLLECTIONS.REVIEWS),
      where("listingId", "==", listingId)
    );
    const snap = await getDocs(q);
    const reviews: MarketplaceReview[] = [];
    snap.forEach((d) => {
      reviews.push(d.data() as MarketplaceReview);
    });

    // Sort by createdAt descending
    reviews.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const totalReviews = reviews.length;
    const averageRating =
      totalReviews > 0
        ? Number((reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews).toFixed(1))
        : 0;

    return { reviews, averageRating, totalReviews };
  } catch (err) {
    console.warn("Error fetching reviews:", err);
    return { reviews: [], averageRating: 0, totalReviews: 0 };
  }
}

export async function createReview(input: {
  listingId: string;
  sellerId: string;
  tradeId: string;
  buyerId: string;
  buyerName: string;
  rating: number;
  comment: string;
  purchasedQuantityKg: number;
}): Promise<MarketplaceReview> {
  if (input.rating < 1 || input.rating > 5) {
    throw new Error("Rating must be between 1 and 5 stars.");
  }
  if (!input.comment || !input.comment.trim()) {
    throw new Error("Review comment is required.");
  }

  // Check if review for this tradeId already exists
  const existingQuery = query(
    collection(db, COLLECTIONS.REVIEWS),
    where("tradeId", "==", input.tradeId)
  );
  const existingSnap = await getDocs(existingQuery);
  if (!existingSnap.empty) {
    throw new Error("You have already submitted a review for this purchase trade. Buy again to leave another review.");
  }

  const reviewId = `REV-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  const review: MarketplaceReview = {
    reviewId,
    sellerId: input.sellerId,
    listingId: input.listingId,
    tradeId: input.tradeId,
    buyerId: input.buyerId,
    buyerName: input.buyerName || "Verified Buyer",
    rating: Number(input.rating),
    comment: input.comment.trim(),
    purchasedQuantityKg: Number(input.purchasedQuantityKg) || 0,
    createdAt: new Date().toISOString(),
  };

  await setDoc(doc(db, COLLECTIONS.REVIEWS, reviewId), review);
  return review;
}
