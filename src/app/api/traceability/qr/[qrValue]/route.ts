
import { NextRequest, NextResponse } from "next/server";
import {
  resolvePublicQRTraceability,
  resolveAuthorizedQRTraceability,
} from "@/services/qrTraceabilityService";
import { getAuthenticatedUser } from "@/lib/authServer";
import { firebaseAdminDb } from "@/lib/firebaseAdmin";
import {
  isCooperativeAuthorizedForHolding,
  isPlatformAdmin,
} from "@/lib/serverCooperativeAuth";
import type {
  CertificateHolding,
  PublicQRTraceabilityResult,
} from "@/types/traceability";

export const runtime = "nodejs";

/**
 * Ensures zero private Firebase UIDs, emails, phone numbers, or fee records
 * are returned on the public traceability response while preserving full
 * freshness, remaining cocoa balance, upstream provenance, and lot movements.
 */
function sanitizePublicTraceability(
  result: PublicQRTraceabilityResult
): PublicQRTraceabilityResult {
  return {
    package: { ...result.package },
    quantities: { ...result.quantities },
    origin: {
      country: result.origin.country,
      farmName: result.origin.farmName?.startsWith("Farm #")
        ? "Cameroon Origin Plot"
        : result.origin.farmName,
      region: result.origin.region,
      eudrCompliant: result.origin.eudrCompliant,
      lotNumber: result.origin.lotNumber,
      productionPeriod: result.origin.productionPeriod,
      qualityGrade: result.origin.qualityGrade,
      certificateNumber: result.origin.certificateNumber,
      issueDate: result.origin.issueDate,
      cocoaImage: result.origin.cocoaImage,
    },
    ...(result.freshness ? { freshness: { ...result.freshness } } : {}),
    ...(result.lotBalance
      ? {
          lotBalance: {
            ...result.lotBalance,
            lotHolderBalances: result.lotBalance.lotHolderBalances.map((b) => ({
              ...b,
            })),
          },
        }
      : {}),
    ...(result.upstreamChain
      ? {
          upstreamChain: {
            ...result.upstreamChain,
            farm: { ...result.upstreamChain.farm },
            ...(result.upstreamChain.production
              ? { production: { ...result.upstreamChain.production } }
              : {}),
            ...(result.upstreamChain.harvest
              ? { harvest: { ...result.upstreamChain.harvest } }
              : {}),
            lot: { ...result.upstreamChain.lot },
            certificate: { ...result.upstreamChain.certificate },
          },
        }
      : {}),
    ...(result.lotMovements
      ? { lotMovements: result.lotMovements.map((m) => ({ ...m })) }
      : {}),
    custodyChain: result.custodyChain.map((step) => ({
      ...step,
    })),
    current: {
      ...result.current,
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
      rawValue.length > 512
    ) {
      return NextResponse.json(
        { success: false, error: "A valid QR value is required." },
        { status: 400 }
      );
    }

    let qrValue = rawValue.trim();
    try {
      qrValue = decodeURIComponent(qrValue).trim();
    } catch {
      qrValue = rawValue.trim();
    }

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
        const isAdmin = await isPlatformAdmin(actorUid);

        let qrSnapshot = await firebaseAdminDb
          .collection("qrCodes")
          .where("qrValue", "==", qrValue)
          .limit(1)
          .get();

        if (qrSnapshot.empty) {
          qrSnapshot = await firebaseAdminDb
            .collection("qrCodes")
            .where("packageNumber", "==", qrValue)
            .limit(1)
            .get();
        }

        if (!qrSnapshot.empty) {
          const qr = qrSnapshot.docs[0].data();
          const holdingId = qr.currentHoldingId;

          if (typeof holdingId === "string" && holdingId.trim()) {
            const holdingSnapshot = await firebaseAdminDb
              .collection("certificateHoldings")
              .doc(holdingId)
              .get();

            if (holdingSnapshot.exists) {
              const holding = holdingSnapshot.data() as CertificateHolding;
              const isAuthorized =
                isAdmin ||
                (await isCooperativeAuthorizedForHolding(actorUid, holding));

              if (isAuthorized) {
                const internalResult = await resolveAuthorizedQRTraceability(
                  qrValue,
                  actorUid
                );

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
        // Fail closed for internal access; continue cleanly to public view.
      }
    }

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
