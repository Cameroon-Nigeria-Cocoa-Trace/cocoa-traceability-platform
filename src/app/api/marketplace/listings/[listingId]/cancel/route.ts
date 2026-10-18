/**
 * Marketplace Cancel Listing API Route
 * Endpoint: /api/marketplace/listings/[listingId]/cancel
 */

import { NextRequest, NextResponse } from "next/server";
import { cancelMarketplaceListing } from "@/services/marketplaceService";
import { getAuthenticatedUser, AuthenticatedUser } from "@/lib/authServer";

export async function POST(
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
    let reason = "Listing cancelled by seller";
    try {
      const body = await req.json();
      if (body?.reason) reason = body.reason;
    } catch {
      // Empty body is acceptable
    }

    const cancelled = await cancelMarketplaceListing(listingId, user.userId, reason);
    return NextResponse.json({ success: true, listing: cancelled });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    const status = message.includes("Authorization Error")
      ? 403
      : message.includes("State Error") || message.includes("Listing Error")
      ? 400
      : 500;

    return NextResponse.json({ success: false, error: message }, { status });
  }
}
