
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

    let rawBody: unknown;

    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Validation Error: A valid JSON body is required." },
        { status: 400 }
      );
    }

    if (
      rawBody === null ||
      typeof rawBody !== "object" ||
      Array.isArray(rawBody)
    ) {
      return NextResponse.json(
        { success: false, error: "Validation Error: A JSON object is required." },
        { status: 400 }
      );
    }

    const body = rawBody as Record<string, unknown>;

    if (Object.keys(body).some((key) => key !== "reason")) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation Error: Only the reason field is accepted.",
        },
        { status: 400 }
      );
    }

    // Preserve the existing default for callers that omit the reason.
    const reason =
      body.reason === undefined
        ? "Administrative Revocation"
        : typeof body.reason === "string"
          ? body.reason.trim()
          : "";

    if (!reason || reason.length > 500) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation Error: Reason must contain 1–500 characters.",
        },
        { status: 400 }
      );
    }

    const qrId = rawQrId.trim();

    const authRecord = await firebaseAdminAuth.getUser(user.userId);
    const isAdmin = authRecord.customClaims?.admin === true;

    const revokedQR = await firebaseAdminDb.runTransaction(async (tx) => {
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
        // Organization membership remains fail-closed until a trusted
        // server-side membership verifier is implemented.
        if (
          holding.holderType.toLowerCase() !== "farmer" ||
          holding.holderId !== user.userId
        ) {
          throw new Error(
            "Authorization Error: You are not authorized to revoke this QR package."
          );
        }
      }

      if (qr.status === "revoked") {
        throw new Error(
          `QR Error: QR package "${qrId}" has already been revoked.`
        );
      }

      if (qr.returnedToBulk === true) {
        throw new Error(
          "QR Error: A package already returned to bulk cannot be revoked again."
        );
      }

      if (qr.status !== "active" && qr.status !== "inactive") {
        throw new Error(
          `QR Error: Cannot revoke a QR package with status "${qr.status}".`
        );
      }

      const now = new Date().toISOString();

      const updates = {
        status: "revoked",
        revokedAt: now,
        revocationReason: reason,
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
      qrCode: revokedQR,
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
