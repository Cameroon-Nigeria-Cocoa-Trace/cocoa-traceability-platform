/**
 * Marketplace Adjust Availability API Route
 * Endpoint: /api/marketplace/listings/[listingId]/adjust-availability
 */

import { NextRequest, NextResponse } from "next/server";
import { adjustMarketplaceAvailability } from "@/services/marketplaceService";
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
    const body = await req.json();

    const adjustment = await adjustMarketplaceAvailability({
      ...body,
      listingId,
      actorUid: user.userId,
    });

    return NextResponse.json({ success: true, adjustment });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    const status = message.includes("Authorization Error")
      ? 403
      : message.includes("Validation Error")
      ? 400
      : message.includes("Capacity Error") || message.includes("Commitment Error")
      ? 409
      : 500;

    return NextResponse.json({ success: false, error: message }, { status });
  }
}
