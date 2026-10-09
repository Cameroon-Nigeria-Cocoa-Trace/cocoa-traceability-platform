/**
 * Marketplace Listings API Route
 * Endpoint: /api/marketplace/listings
 */

import { NextRequest, NextResponse } from "next/server";
import {
  createMarketplaceListing,
  listMarketplaceListings,
  sanitizePublicListing,
} from "@/services/marketplaceService";
import {
  MarketplaceCertificationType,
  MarketplaceListingStatus,
  MarketplaceInventoryMode,
} from "@/types/traceability";
import { getAuthenticatedUser, AuthenticatedUser } from "@/lib/authServer";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const certificationType = (searchParams.get("certificationType") as MarketplaceCertificationType) || undefined;
    const sellerHolderId = searchParams.get("sellerHolderId") || undefined;
    const lotId = searchParams.get("lotId") || undefined;
    const listingStatus = (searchParams.get("listingStatus") as MarketplaceListingStatus) || undefined;
    const inventoryMode = (searchParams.get("inventoryMode") as MarketplaceInventoryMode) || undefined;
    const isPublic = searchParams.get("public") === "true";

    const listings = await listMarketplaceListings({
      certificationType,
      sellerHolderId,
      lotId,
      listingStatus,
      inventoryMode,
    });

    if (isPublic) {
      const sanitized = listings.map(sanitizePublicListing);
      return NextResponse.json({ success: true, listings: sanitized });
    }

    return NextResponse.json({ success: true, listings });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let user: AuthenticatedUser;
  try {
    user = await getAuthenticatedUser(req);
  } catch (authError: unknown) {
    const authMessage = authError instanceof Error ? authError.message : "Authentication Required";
    return NextResponse.json({ success: false, error: authMessage }, { status: 401 });
  }

  try {
    const body = await req.json();
    const listing = await createMarketplaceListing({
      ...body,
      createdByUid: user.userId,
    });

    return NextResponse.json({ success: true, listing }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    const status = message.includes("Authentication Required")
      ? 401
      : message.includes("Authorization Error") || message.includes("Ownership Error")
      ? 403
      : message.includes("Validation Error") || message.includes("Relational Mismatch")
      ? 400
      : message.includes("Capacity Error") || message.includes("Reservation Error")
      ? 409
      : 500;

    return NextResponse.json({ success: false, error: message }, { status });
  }
}
