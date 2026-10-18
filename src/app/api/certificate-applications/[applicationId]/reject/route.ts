/**
 * Reject Certificate Application API Route
 * Endpoint: POST /api/certificate-applications/[applicationId]/reject
 */

import { NextRequest, NextResponse } from "next/server";
import { rejectCertificateApplication } from "@/services/certificateService";
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
    const body = await req.json();
    const rejectionReason = body.rejectionReason;

    if (!rejectionReason || typeof rejectionReason !== "string" || !rejectionReason.trim()) {
      return NextResponse.json(
        { success: false, error: "Validation Error: 'rejectionReason' field is required in request body." },
        { status: 400 }
      );
    }

    const application = await rejectCertificateApplication(applicationId, rejectionReason, user.userId);

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
