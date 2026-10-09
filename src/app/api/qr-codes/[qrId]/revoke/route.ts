/**
 * QR Code Revocation API Route
 * Endpoint: /api/qr-codes/[qrId]/revoke
 *
 * Revokes a QR package without releasing packaging capacity.
 */

import { NextRequest, NextResponse } from "next/server";
import { revokeQRCode } from "@/services/qrTraceabilityService";
import { getAuthenticatedUser, AuthenticatedUser } from "@/lib/authServer";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ qrId: string }> }
) {
  let user: AuthenticatedUser;
  try {
    user = await getAuthenticatedUser(req);
  } catch (authError: unknown) {
    const authMessage = authError instanceof Error ? authError.message : "Authentication Required";
    return NextResponse.json({ success: false, error: authMessage }, { status: 401 });
  }

  try {
    const { qrId } = await context.params;
    const body = await req.json();
    const reason = body.reason || "Administrative Revocation";

    const revokedQR = await revokeQRCode(qrId, reason, user.userId);

    return NextResponse.json({
      success: true,
      qrCode: revokedQR,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    const status = message.includes("Authentication Required")
      ? 401
      : message.includes("Authorization Error")
      ? 403
      : message.includes("not exist")
      ? 404
      : 400;

    return NextResponse.json({ success: false, error: message }, { status });
  }
}
