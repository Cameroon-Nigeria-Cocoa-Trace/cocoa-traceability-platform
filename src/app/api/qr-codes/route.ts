/**
 * QR Codes API Route
 * Endpoint: /api/qr-codes
 *
 * Responsibilities:
 * - POST: Generates an official physical QR package from an exact CertificateHolding.
 * - GET: Queries QR packages by holdingId or lotId and returns packaging allocation state.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  generateQRCode,
  getHoldingPackagingState,
} from "@/services/qrTraceabilityService";
import { getAuthenticatedUser, AuthenticatedUser } from "@/lib/authServer";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { QRCode } from "@/types/traceability";

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
    const qrRecord = await generateQRCode({
      ...body,
      actorUid: user.userId,
    });

    return NextResponse.json({
      success: true,
      qrCode: qrRecord,
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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const holdingId = searchParams.get("holdingId");
    const lotId = searchParams.get("lotId");

    if (holdingId) {
      const q = query(collection(db, "qrCodes"), where("currentHoldingId", "==", holdingId.trim()));
      const snap = await getDocs(q);
      const qrCodes = snap.docs.map((d) => d.data() as QRCode);
      const packagingState = await getHoldingPackagingState(holdingId.trim());

      return NextResponse.json({
        success: true,
        packagingState,
        qrCodes,
      });
    }

    if (lotId) {
      const q = query(collection(db, "qrCodes"), where("lotId", "==", lotId.trim()));
      const snap = await getDocs(q);
      const qrCodes = snap.docs.map((d) => d.data() as QRCode);

      return NextResponse.json({
        success: true,
        qrCodes,
      });
    }

    return NextResponse.json(
      { success: false, error: "Query parameter 'holdingId' or 'lotId' is required." },
      { status: 400 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
