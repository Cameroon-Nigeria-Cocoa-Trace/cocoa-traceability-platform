
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

  if (message.startsWith("QR Error") || message.startsWith("Holding Error")) {
    return message.includes("does not exist") ? 404 : 409;
  }

  if (message.startsWith("Repackage Error")) return 409;

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

    // Accept an omitted body for compatibility with existing callers.
    const rawText = await req.text();
    let body: Record<string, unknown> = {};

    if (rawText.trim()) {
      let parsed: unknown;

      try {
        parsed = JSON.parse(rawText);
      } catch {
        return NextResponse.json(
          { success: false, error: "Validation Error: Invalid JSON body." },
          { status: 400 }
        );
      }

      if (
        parsed === null ||
        typeof parsed !== "object" ||
        Array.isArray(parsed)
      ) {
        return NextResponse.json(
          { success: false, error: "Validation Error: A JSON object is required." },
          { status: 400 }
        );
      }

      body = parsed as Record<string, unknown>;
    }

    if (Object.keys(body).some((key) => key !== "notes")) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation Error: Only the notes field is accepted.",
        },
        { status: 400 }
      );
    }

    const notes =
      body.notes === undefined
        ? "Emptied physical package cocoa returned to bulk state."
        : typeof body.notes === "string"
          ? body.notes.trim()
          : "";

    if (!notes || notes.length > 500) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation Error: Notes must contain 1–500 characters.",
        },
        { status: 400 }
      );
    }

    const qrId = rawQrId.trim();

    // Only trusted Firebase Admin custom claims grant platform-wide admin access.
    const authRecord = await firebaseAdminAuth.getUser(user.userId);
    const isAdmin = authRecord.customClaims?.admin === true;

    const repackagedQR = await firebaseAdminDb.runTransaction(async (tx) => {
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
        // Organizational access remains denied until trusted server-side
        // membership verification is implemented.
        if (
          holding.holderType.toLowerCase() !== "farmer" ||
          holding.holderId !== user.userId
        ) {
          throw new Error(
            "Authorization Error: You are not authorized to repackage this QR."
          );
        }
      }

      // Only revoked, not-yet-returned packages can release capacity.
      if (qr.status !== "revoked") {
        throw new Error(
          `Repackage Error: Only revoked packages can be returned to bulk; current status is "${qr.status}".`
        );
      }

      if (qr.returnedToBulk === true) {
        throw new Error(
          `Repackage Error: QR package "${qrId}" has already been returned to bulk.`
        );
      }

      const now = new Date().toISOString();

      const updates = {
        returnedToBulk: true,
        returnedToBulkAt: now,
        returnedToBulkBy: user.userId,
        repackageNotes: notes,
      };

      // The old QR remains revoked permanently. We do not change its status,
      // represented quantity, identity, or custody references.
      tx.update(qrRef, updates);

      return {
        ...qr,
        ...updates,
      } as QRCode;
    });

    return NextResponse.json({
      success: true,
      qrCode: repackagedQR,
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
