/**
 * QR Scans API Route
 * Endpoint: /api/qr-scans
 *
 * Records read-only scan events for public or authenticated consumers.
 * Does not mutate any domain quantities, certificates, or holdings.
 */

import { NextRequest, NextResponse } from "next/server";
import { recordQRScan } from "@/services/qrTraceabilityService";
import { getAuthenticatedUser } from "@/lib/authServer";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Check optional authenticated user
    let userId: string | undefined;
    try {
      const authUser = await getAuthenticatedUser(req);
      userId = authUser.userId;
    } catch {
      // Anonymous public scan - no fake UID
      userId = undefined;
    }

    const ipAddress =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      undefined;

    const userAgent = req.headers.get("user-agent") || undefined;

    const scanRecord = await recordQRScan({
      qrValue: body.qrValue,
      scannerType: body.scannerType || (userId ? "authenticated" : "public"),
      userId,
      location: body.location,
      ipAddress,
      userAgent,
    });

    if (!scanRecord) {
      return NextResponse.json(
        { success: false, error: `Invalid QR value or QR code not found.` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      scan: scanRecord,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
