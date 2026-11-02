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
  listTraceCertificatesByHolder,
  toPublicTraceCertificate,
} from "@/services/certificateService";
import { getAuthenticatedUser, AuthenticatedUser } from "@/lib/authServer";
import {
  getAffiliatedFarmerIds,
  getCooperativeActorInfo,
  isCooperativeAuthorizedForFarmer,
} from "@/lib/serverCooperativeAuth";
import { firebaseAdminDb } from "@/lib/firebaseAdmin";
import { TraceCertificate } from "@/types/traceability";

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
  let authenticatedUser: AuthenticatedUser | null = null;
  try {
    authenticatedUser = await getAuthenticatedUser(req);
  } catch {
    // Optional for public lookup
  }

  try {
    const { searchParams } = new URL(req.url);
    const lotId = searchParams.get("lotId");
    const certificateNumber = searchParams.get("certificateNumber");
    const holderId = searchParams.get("holderId");

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

    if (holderId) {
      if (authenticatedUser) {
        const isAuthorized =
          holderId === authenticatedUser.userId ||
          (await isCooperativeAuthorizedForFarmer(authenticatedUser.userId, holderId));
        if (!isAuthorized) {
          const actorInfo = await getCooperativeActorInfo(authenticatedUser.userId);
          if (!actorInfo.isAdmin && !actorInfo.cooperativeOrgIds.includes(holderId)) {
            return NextResponse.json(
              { success: false, error: "Authorization Error: Not authorized to access certificates for this holder." },
              { status: 403 }
            );
          }
        }
      }

      const certs = await listTraceCertificatesByHolder(holderId);
      return NextResponse.json({
        success: true,
        certificates: certs.map(toPublicTraceCertificate),
      });
    }

    // If no params, resolve based on authenticated caller
    if (authenticatedUser) {
      const actorInfo = await getCooperativeActorInfo(authenticatedUser.userId);
      const targetHolders = new Set<string>([authenticatedUser.userId]);

      if (actorInfo.isCooperative || actorInfo.cooperativeOrgIds.length > 0) {
        actorInfo.cooperativeOrgIds.forEach((id) => targetHolders.add(id));
        const memberFarmerIds = await getAffiliatedFarmerIds(authenticatedUser.userId);
        memberFarmerIds.forEach((id) => targetHolders.add(id));
      }

      const certMap = new Map<string, TraceCertificate>();
      const holderList = Array.from(targetHolders);

      for (let i = 0; i < holderList.length; i += 10) {
        const chunk = holderList.slice(i, i + 10);
        if (chunk.length === 0) continue;
        const snap = await firebaseAdminDb
          .collection("certificates")
          .where("currentHolderId", "in", chunk)
          .get();
        snap.forEach((doc) => {
          const cert = doc.data() as TraceCertificate;
          certMap.set(doc.id, cert);
        });
      }

      return NextResponse.json({
        success: true,
        certificates: Array.from(certMap.values()).map(toPublicTraceCertificate),
      });
    }

    return NextResponse.json(
      { success: false, error: "Query parameter 'lotId', 'certificateNumber', or 'holderId' is required." },
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
