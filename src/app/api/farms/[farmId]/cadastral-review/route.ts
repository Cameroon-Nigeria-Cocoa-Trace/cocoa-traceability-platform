/**
 * Farm Cadastral Review API Route
 * Endpoint: POST /api/farms/[farmId]/cadastral-review
 * 
 * Enforces server-side authentication and authorization:
 * - Only Platform Admins, Certification Officers, or Inspectors can execute this review.
 * - Standard farmers receive HTTP 403 Forbidden.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, AuthenticatedUser } from "@/lib/authServer";
import { reviewFarmCadastralStatus } from "@/services/farmCadastralService";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ farmId: string }> }
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
    const { farmId } = await params;
    const body = await req.json();

    const decision = body.decision;
    if (decision !== "approve" && decision !== "reject") {
      return NextResponse.json(
        { success: false, error: "Validation Error: decision must be 'approve' or 'reject'." },
        { status: 400 }
      );
    }

    const reviewResult = await reviewFarmCadastralStatus({
      farmId,
      reviewerUid: user.userId,
      decision,
      reviewNotes: body.reviewNotes,
      cadastralCertificateNumber: body.cadastralCertificateNumber,
    });

    return NextResponse.json({
      success: true,
      review: reviewResult,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    const status = message.includes("Authorization Error")
      ? 403
      : message.includes("not exist")
      ? 404
      : message.includes("Validation Error")
      ? 400
      : 500;

    return NextResponse.json(
      { success: false, error: message },
      { status }
    );
  }
}
