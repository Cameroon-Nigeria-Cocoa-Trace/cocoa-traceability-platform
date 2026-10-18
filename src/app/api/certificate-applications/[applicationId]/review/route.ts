/**
 * Review Certificate Application API Route
 * Endpoint: POST /api/certificate-applications/[applicationId]/review
 */

import { NextRequest, NextResponse } from "next/server";
import { reviewCertificateApplication } from "@/services/certificateService";
import { getAuthenticatedUser, AuthenticatedUser } from "@/lib/authServer";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ applicationId: string }> }
) {
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
    const application = await reviewCertificateApplication(applicationId, user.userId);

    return NextResponse.json({
      success: true,
      application,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    const status = message.includes("Authorization Error")
      ? 403
      : message.includes("not exist")
      ? 404
      : message.includes("State Transition Error")
      ? 409
      : 500;

    return NextResponse.json(
      { success: false, error: message },
      { status }
    );
  }
}
