/**
 * Certificate Applications API Route
 * Endpoint: /api/certificate-applications
 *
 * Provides a secure server-side boundary for the Frontend developer.
 * - POST: Creates an Origin Trace Certificate Application for an authenticated applicant.
 * - GET: Lists applications filtered by lotId or applicantId.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  createCertificateApplication,
  listCertificateApplicationsByLot,
  listCertificateApplicationsByApplicant,
} from "@/services/certificateService";
import { getAuthenticatedUser, AuthenticatedUser } from "@/lib/authServer";
import { isAuthorizedForCertificateOperation } from "@/lib/certificateAuthorization";

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

    // 3. Delegate to service, strictly binding applicantId to authenticated UID
    const application = await createCertificateApplication({
      ...body,
      applicantId: user.userId,
    });

    return NextResponse.json({
      success: true,
      application,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";

    // Handle relational/upstream errors with 400 Bad Request, not found with 404
    const status = message.includes("Upstream Lookup Error")
      ? 404
      : message.includes("Validation Error") ||
        message.includes("Relational Mismatch Error") ||
        message.includes("Origin Validation Error") ||
        message.includes("Quantity Validation Error")
      ? 400
      : 500;

    return NextResponse.json(
      { success: false, error: message },
      { status }
    );
  }
}

export async function GET(req: NextRequest) {
  // 1. Enforce Authentication Requirement (Application records are internal and private)
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

  try {
    const { searchParams } = new URL(req.url);
    const lotId = searchParams.get("lotId");
    const applicantId = searchParams.get("applicantId");

    const canReadInternal = await isAuthorizedForCertificateOperation(user.userId, "read_internal");

    if (applicantId) {
      // Non-authorities can only view their own applications
      if (applicantId !== user.userId && !canReadInternal) {
        return NextResponse.json(
          { success: false, error: "Authorization Error: Cannot access another user's certificate applications." },
          { status: 403 }
        );
      }
      const applications = await listCertificateApplicationsByApplicant(applicantId);
      return NextResponse.json({ success: true, applications });
    }

    if (lotId) {
      if (!canReadInternal) {
        return NextResponse.json(
          { success: false, error: "Authorization Error: Authority permission required to query applications by lot." },
          { status: 403 }
        );
      }
      const applications = await listCertificateApplicationsByLot(lotId);
      return NextResponse.json({ success: true, applications });
    }

    return NextResponse.json(
      { success: false, error: "Query parameter 'lotId' or 'applicantId' is required." },
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
