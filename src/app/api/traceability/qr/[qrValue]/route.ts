/**
 * Public QR Traceability Verification Endpoint
 * Endpoint: /api/traceability/qr/[qrValue]
 *
 * Publicly verifiable resolution of bag-level traceability.
 * Traverses from currentHoldingId through the exact historical custody DAG.
 * Sanitizes all private identities, contact details, and fee records for anonymous consumers.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  resolvePublicQRTraceability,
  resolveAuthorizedQRTraceability,
} from "@/services/qrTraceabilityService";
import { getAuthenticatedUser } from "@/lib/authServer";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ qrValue: string }> }
) {
  try {
    const { qrValue } = await context.params;

    // Check if caller is authenticated for internal view
    let isInternalAuthorized = false;
    let actorUid: string | undefined;

    try {
      const user = await getAuthenticatedUser(req);
      if (user && user.userId) {
        isInternalAuthorized = true;
        actorUid = user.userId;
      }
    } catch {
      // Unauthenticated public request - expected and welcome
      isInternalAuthorized = false;
    }

    if (isInternalAuthorized && actorUid) {
      const authorizedResult = await resolveAuthorizedQRTraceability(qrValue, actorUid);
      if (authorizedResult) {
        return NextResponse.json({
          success: true,
          traceability: authorizedResult,
        });
      }
    }

    // Default: Public Sanitized Verification
    const publicResult = await resolvePublicQRTraceability(qrValue);
    if (!publicResult) {
      return NextResponse.json(
        { success: false, error: `QR Code verification failed: Unknown or unverified QR value "${qrValue}".` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      traceability: publicResult,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
