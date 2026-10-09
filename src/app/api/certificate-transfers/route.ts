/**
 * Certificate Transfers API Route
 * Endpoint: /api/certificate-transfers
 *
 * Provides a secure server-side boundary for Role 3:
 * - POST: Executes an atomic certificate transfer between eligible holders.
 * - GET: Queries transfer records by certificateId or holderId.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  initiateCertificateTransfer,
  listCertificateTransfersByCertificate,
} from "@/services/transferService";
import { getAuthenticatedUser, AuthenticatedUser } from "@/lib/authServer";

export async function POST(req: NextRequest) {
  // 1. Enforce Authentication Requirement
  let user: AuthenticatedUser;
  try {
    user = await getAuthenticatedUser(req);
  } catch (authError: unknown) {
    const authMessage = authError instanceof Error ? authError.message : "Authentication Required";
    return NextResponse.json(
      { success: false, error: authMessage },
      { status: 401 }
    );
  }

  // 2. Parse & Validate Payload
  try {
    const body = await req.json();

    const transfer = await initiateCertificateTransfer({
      ...body,
      actorUid: user.userId,
    });

    return NextResponse.json({
      success: true,
      transfer,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";

    const status = message.includes("Authentication Required")
      ? 401
      : message.includes("Authorization Error")
      ? 403
      : message.includes("Destination Entity Error")
      ? 422
      : message.includes("Unsupported Transfer Route") || message.includes("Validation Error")
      ? 400
      : message.includes("Quantity Error") || message.includes("Transfer Error")
      ? 409
      : 500;

    return NextResponse.json(
      { success: false, error: message },
      { status }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const certificateId = searchParams.get("certificateId");

    if (certificateId) {
      const transfers = await listCertificateTransfersByCertificate(certificateId);
      return NextResponse.json({ success: true, transfers });
    }

    return NextResponse.json(
      { success: false, error: "Query parameter 'certificateId' is required." },
      { status: 400 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
