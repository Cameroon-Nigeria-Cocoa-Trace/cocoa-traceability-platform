/**
 * Origin Trace Certificates API Route
 * Endpoint: /api/certificates
 *
 * Provides a secure server-side boundary for the Frontend developer.
 * - POST: Issues a Trace Certificate for an approved Certificate Application.
 * - GET: Queries certificates by lotId or certificateNumber.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  issueTraceCertificate,
  getTraceCertificateByLot,
  getTraceCertificateByNumber,
  toPublicTraceCertificate,
} from "@/services/certificateService";
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

  // 2. Parse Payload
  try {
    const body = await req.json();

    // 3. Delegate to service, binding issuedBy to authenticated UID
    const certificate = await issueTraceCertificate({
      ...body,
      issuedBy: user.userId,
    });

    return NextResponse.json({
      success: true,
      certificate,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";

    const status = message.includes("Authorization Error")
      ? 403
      : message.includes("not exist")
      ? 404
      : message.includes("Issuance Error") ||
        message.includes("Quantity Error") ||
        message.includes("Capacity Exceeded Error")
      ? 409
      : message.includes("Validation Error")
      ? 400
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
    const lotId = searchParams.get("lotId");
    const certificateNumber = searchParams.get("certificateNumber");

    if (certificateNumber) {
      const cert = await getTraceCertificateByNumber(certificateNumber);
      if (!cert) {
        return NextResponse.json({ success: false, error: "Certificate not found." }, { status: 404 });
      }
      return NextResponse.json({ success: true, certificate: toPublicTraceCertificate(cert) });
    }

    if (lotId) {
      const cert = await getTraceCertificateByLot(lotId);
      if (!cert) {
        return NextResponse.json({ success: false, error: "No certificate found for lot." }, { status: 404 });
      }
      return NextResponse.json({ success: true, certificate: toPublicTraceCertificate(cert) });
    }

    return NextResponse.json(
      { success: false, error: "Query parameter 'lotId' or 'certificateNumber' is required." },
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
