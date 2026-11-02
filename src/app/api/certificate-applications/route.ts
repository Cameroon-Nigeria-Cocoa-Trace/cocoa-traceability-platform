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
import {
  isCooperativeAuthorizedForFarmer,
  getAffiliatedFarmerIds,
  getCooperativeActorInfo,
} from "@/lib/serverCooperativeAuth";
import { firebaseAdminDb } from "@/lib/firebaseAdmin";
import { CertificateApplication } from "@/types/traceability";

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

    let resolvedApplicantId = user.userId;
    if (body.applicantId && body.applicantId !== user.userId) {
      const isAuthorized = await isCooperativeAuthorizedForFarmer(user.userId, body.applicantId);
      if (isAuthorized) {
        resolvedApplicantId = body.applicantId;
      }
    }

    const coopInfo = await getCooperativeActorInfo(user.userId);

    // 3. Delegate to service
    const application = await createCertificateApplication({
      ...body,
      applicantId: resolvedApplicantId,
      ...(coopInfo.primaryOrgId ? { targetCooperativeOrgId: coopInfo.primaryOrgId } : {}),
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
      // Non-authorities can view their own applications or cooperative affiliated applications
      const isAffiliatedCoop = await isCooperativeAuthorizedForFarmer(user.userId, applicantId);
      if (applicantId !== user.userId && !canReadInternal && !isAffiliatedCoop) {
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

    // Default query for authenticated user (and their cooperative members)
    const coopInfo = await getCooperativeActorInfo(user.userId);
    const targetApplicants = new Set<string>([user.userId]);

    if (coopInfo.isCooperative || coopInfo.cooperativeOrgIds.length > 0) {
      const affiliatedFarmerIds = await getAffiliatedFarmerIds(user.userId);
      affiliatedFarmerIds.forEach((id) => targetApplicants.add(id));
    }

    const appMap = new Map<string, CertificateApplication>();
    const applicantList = Array.from(targetApplicants);

    for (let i = 0; i < applicantList.length; i += 10) {
      const chunk = applicantList.slice(i, i + 10);
      if (chunk.length === 0) continue;
      const snap = await firebaseAdminDb
        .collection("certificateApplications")
        .where("applicantId", "in", chunk)
        .get();
      snap.forEach((doc) => {
        appMap.set(doc.id, doc.data() as CertificateApplication);
      });
    }

    // Also check applications targeted at this cooperative
    if (coopInfo.primaryOrgId) {
      const targetSnap = await firebaseAdminDb
        .collection("certificateApplications")
        .where("targetCooperativeOrgId", "==", coopInfo.primaryOrgId)
        .get();
      targetSnap.forEach((doc) => {
        appMap.set(doc.id, doc.data() as CertificateApplication);
      });
    }

    const applications = Array.from(appMap.values()).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );

    return NextResponse.json({ success: true, applications });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
