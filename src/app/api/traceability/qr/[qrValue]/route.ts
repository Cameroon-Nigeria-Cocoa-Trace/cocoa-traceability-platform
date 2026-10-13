
import { NextRequest, NextResponse } from "next/server";
import {
  resolvePublicQRTraceability,
  resolveAuthorizedQRTraceability,
} from "@/services/qrTraceabilityService";
import { getAuthenticatedUser } from "@/lib/authServer";
import { firebaseAdminAuth, firebaseAdminDb } from "@/lib/firebaseAdmin";
import type {
  CertificateHolding,
  PublicQRTraceabilityResult,
} from "@/types/traceability";

export const runtime = "nodejs";

/**
 * Remove internal Firebase IDs from the public custody display and avoid
 * presenting known fallback values as verified origin data.
 */
function sanitizePublicTraceability(result: PublicQRTraceabilityResult) {
  return {
    package: { ...result.package },
    quantities: { ...result.quantities },
    origin: {
      country: result.origin.country,
      farmName: result.origin.farmName?.startsWith("Farm #")
        ? undefined
        : result.origin.farmName,
      region:
        result.origin.region === "South-West Region"
          ? undefined
          : result.origin.region,
      eudrCompliant: result.origin.eudrCompliant,
      lotNumber: result.origin.lotNumber,
      productionPeriod:
        result.origin.productionPeriod === "2024/2025"
          ? undefined
          : result.origin.productionPeriod,
      // Grade 1 is currently also used as a fallback when data is missing.
      // Suppress it until the underlying resolver distinguishes real data
      // from fallback data.
      qualityGrade:
        result.origin.qualityGrade === "Grade 1"
          ? undefined
          : result.origin.qualityGrade,
      certificateNumber: result.origin.certificateNumber,
      issueDate:
        result.origin.issueDate === result.package.generatedAt
          ? undefined
          : result.origin.issueDate,
      cocoaImage: result.origin.cocoaImage,
    },
    custodyChain: result.custodyChain.map((step) => ({
      ...step,
      // These names must not contain internal holder IDs.
      fromHolderPublicName: step.fromHolderType.toUpperCase(),
      toHolderPublicName: step.toHolderType.toUpperCase(),
    })),
    current: {
      ...result.current,
      currentHolderPublicName: result.current.currentHolderType.toUpperCase(),
    },
    resolvedAt: result.resolvedAt,
  };
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ qrValue: string }> }
) {
  try {
    const { qrValue: rawValue } = await context.params;

    if (
      typeof rawValue !== "string" ||
      !rawValue.trim() ||
      rawValue.length > 256
    ) {
      return NextResponse.json(
        { success: false, error: "A valid QR value is required." },
        { status: 400 }
      );
    }

    const qrValue = rawValue.trim();

    // Authentication is optional because public QR verification is supported.
    let actorUid: string | undefined;

    try {
      const user = await getAuthenticatedUser(req);
      actorUid = user.userId;
    } catch {
      actorUid = undefined;
    }

    // Internal metadata is returned only after server-side authorization.
    if (actorUid) {
      try {
        const authRecord = await firebaseAdminAuth.getUser(actorUid);
        const isAdmin = authRecord.customClaims?.admin === true;

        const qrSnapshot = await firebaseAdminDb
          .collection("qrCodes")
          .where("qrValue", "==", qrValue)
          .limit(1)
          .get();

        if (!qrSnapshot.empty) {
          const qr = qrSnapshot.docs[0].data();
          const holdingId = qr.currentHoldingId;

          if (typeof holdingId === "string" && holdingId.trim()) {
            const holdingSnapshot = await firebaseAdminDb
              .collection("certificateHoldings")
              .doc(holdingId)
              .get();

            if (holdingSnapshot.exists) {
              const holding =
                holdingSnapshot.data() as CertificateHolding;

              const ownsFarmerHolding =
                holding.holderType?.toLowerCase() === "farmer" &&
                holding.holderId === actorUid;

              // Organizational access is denied to non-admin users until
              // trusted server-side organization membership verification
              // has been implemented.
              if (isAdmin || ownsFarmerHolding) {
                const internalResult =
                  await resolveAuthorizedQRTraceability(qrValue, actorUid);

                if (internalResult) {
                  return NextResponse.json({
                    success: true,
                    traceability: internalResult,
                    view: "internal",
                  });
                }
              }
            }
          }
        }
      } catch {
        // Fail closed for internal access. Continue to public verification
        // without exposing internal errors or metadata.
      }
    }

    // Public verification never returns the internal traceability payload.
    const publicResult = await resolvePublicQRTraceability(qrValue);

    if (!publicResult) {
      return NextResponse.json(
        {
          success: false,
          error: "QR code verification failed: unknown or unverified QR value.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      traceability: sanitizePublicTraceability(publicResult),
      view: "public",
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Unable to resolve QR traceability." },
      { status: 500 }
    );
  }
}
