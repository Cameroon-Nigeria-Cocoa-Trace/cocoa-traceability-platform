/**
 * QR Batch Generation API Route
 * Endpoint: /api/qr-codes/batch
 *
 * Atomically generates a batch of physical QR packages from an exact CertificateHolding.
 */

import { NextRequest, NextResponse } from "next/server";
import { generateQRBatch } from "@/services/qrTraceabilityService";
import { getAuthenticatedUser, AuthenticatedUser } from "@/lib/authServer";

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
    const createdQRs = await generateQRBatch({
      ...body,
      actorUid: user.userId,
    });

    return NextResponse.json({
      success: true,
      count: createdQRs.length,
      qrCodes: createdQRs,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    const status = message.includes("Authentication Required")
      ? 401
      : message.includes("Authorization Error")
      ? 403
      : message.includes("Validation Error")
      ? 400
      : message.includes("Capacity Error") || message.includes("Holding Error")
      ? 409
      : 500;

    return NextResponse.json({ success: false, error: message }, { status });
  }
}
