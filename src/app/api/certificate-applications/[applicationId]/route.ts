/**
 * Single Certificate Application API Route
 * Endpoint: /api/certificate-applications/[applicationId]
 */

import { NextRequest, NextResponse } from "next/server";
import { getCertificateApplication } from "@/services/certificateService";
import { getAuthenticatedUser, AuthenticatedUser } from "@/lib/authServer";
import { isAuthorizedForCertificateOperation } from "@/lib/certificateAuthorization";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ applicationId: string }> }
) {
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

  try {
    const { applicationId } = await params;
    const application = await getCertificateApplication(applicationId);

    if (!application) {
      return NextResponse.json(
        { success: false, error: `Certificate application "${applicationId}" not found.` },
        { status: 404 }
      );
    }

    // 2. Enforce Authorization Requirement: Only the applicant or an authorized reviewer can view internal application details
    const canReadInternal = await isAuthorizedForCertificateOperation(user.userId, "read_internal");
    if (application.applicantId !== user.userId && !canReadInternal) {
      return NextResponse.json(
        { success: false, error: "Authorization Error: Cannot access another user's certificate application details." },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      application,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
