/**
 * Marketplace Single Listing API Route
 * Endpoint: /api/marketplace/listings/[listingId]
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getMarketplaceListing,
  updateMarketplaceListing,
  sanitizePublicListing,
} from "@/services/marketplaceService";
import { getAuthenticatedUser, AuthenticatedUser } from "@/lib/authServer";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ listingId: string }> }
) {
  try {
    const { listingId } = await params;
    const listing = await getMarketplaceListing(listingId);
    if (!listing) {
      return NextResponse.json({ success: false, error: "Listing not found" }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    if (searchParams.get("public") === "true") {
      return NextResponse.json({ success: true, listing: sanitizePublicListing(listing) });
    }

    return NextResponse.json({ success: true, listing });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ listingId: string }> }
) {
  let user: AuthenticatedUser;
  try {
    user = await getAuthenticatedUser(req);
  } catch (authError: unknown) {
    const authMessage = authError instanceof Error ? authError.message : "Authentication Required";
    return NextResponse.json({ success: false, error: authMessage }, { status: 401 });
  }

  try {
    const { listingId } = await params;
    const body = await req.json();

    const updated = await updateMarketplaceListing({
      ...body,
      listingId,
      actorUid: user.userId,
    });

    return NextResponse.json({ success: true, listing: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    const status = message.includes("Authorization Error")
      ? 403
      : message.includes("State Error") || message.includes("Validation Error")
      ? 400
      : message.includes("Capacity Error")
      ? 409
      : 500;

    return NextResponse.json({ success: false, error: message }, { status });
  }
}
