
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/authServer";
import { firebaseAdminAuth, firebaseAdminDb } from "@/lib/firebaseAdmin";
import type {
  CertificateHolding,
  QRCode,
} from "@/types/traceability";

export const runtime = "nodejs";

function getErrorStatus(message: string): number {
  if (message.startsWith("Authorization Error")) return 403;
  if (message.startsWith("Validation Error")) return 400;
  if (
    message.startsWith("QR Error") ||
    message.startsWith("Holding Error")
  ) {
    return message.includes("does not exist") ? 404 : 409;
  }
  return 500;
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ qrId: string }> }
) {
  let user: { userId: string };

  try {
    user = await getAuthenticatedUser(req);
  } catch {
    return NextResponse.json(
      { success: false, error: "Authentication Required" },
      { status: 401 }
    );
  }

  try {
    const { qrId: rawQrId } = await context.params;

    if (
      typeof rawQrId !== "string" ||
      !rawQrId.trim() ||
      rawQrId.length > 256
    ) {
      return NextResponse.json(
        { success: false, error: "Validation Error: A valid qrId is required." },
        { status: 400 }
      );
    }

    const qrId = rawQrId.trim();

    // Admin authority must come from a trusted Firebase custom claim.
    const authRecord = await firebaseAdminAuth.getUser(user.userId);
    const isAdmin = authRecord.customClaims?.admin === true;

    const updatedQR = await firebaseAdminDb.runTransaction(async (tx) => {
      const qrRef = firebaseAdminDb.collection("qrCodes").doc(qrId);
      const qrSnap = await tx.get(qrRef);

      if (!qrSnap.exists) {
        throw new Error(`QR Error: QRCode "${qrId}" does not exist.`);
      }

      const qr = qrSnap.data() as QRCode;

      if (
        qr.qrId !== qrId ||
        typeof qr.currentHoldingId !== "string" ||
        !qr.currentHoldingId.trim()
      ) {
        throw new Error(
          "QR Error: The QR record has an invalid current holding reference."
        );
      }

      const holdingRef = firebaseAdminDb
        .collection("certificateHoldings")
        .doc(qr.currentHoldingId);

      const holdingSnap = await tx.get(holdingRef);

      // Never proceed without the holding needed to establish authority.
      if (!holdingSnap.exists) {
        throw new Error(
          `Holding Error: Current holding "${qr.currentHoldingId}" does not exist.`
        );
      }

      const holding = holdingSnap.data() as CertificateHolding;

      if (
        holding.holdingId !== qr.currentHoldingId ||
        !holding.holderId ||
        !holding.holderType
      ) {
        throw new Error(
          "Holding Error: The current holding record is incomplete or inconsistent."
        );
      }

      if (!isAdmin) {
        // Organization memberships need a trusted server-side verifier.
        // Until it exists, fail closed for non-farmer organizational holdings.
        if (
          holding.holderType.toLowerCase() !== "farmer" ||
          holding.holderId !== user.userId
        ) {
          throw new Error(
            "Authorization Error: You are not authorized to deactivate this QR package."
          );
        }
      }

      if (qr.status === "revoked") {
        throw new Error(
          `QR Error: Cannot deactivate revoked QR package "${qrId}".`
        );
      }

      if (qr.status !== "active") {
        throw new Error(
          `QR Error: Only active QR packages can be deactivated; current status is "${qr.status}".`
        );
      }

      const now = new Date().toISOString();

      // Deactivation never releases packaging capacity.
      // Only the formal repackaging workflow may set returnedToBulk=true.
      const updates = {
        status: "inactive",
        deactivatedAt: now,
        returnedToBulk: false,
      };

      tx.update(qrRef, updates);

      return {
        ...qr,
        ...updates,
      } as QRCode;
    });

    return NextResponse.json({
      success: true,
      qrCode: updatedQR,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal Server Error";
    const status = getErrorStatus(message);

    return NextResponse.json(
      {
        success: false,
        error: status === 500 ? "Internal Server Error" : message,
      },
      { status }
    );
  }
}
