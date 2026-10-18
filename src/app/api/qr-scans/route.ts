
import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/authServer";
import { firebaseAdminDb } from "@/lib/firebaseAdmin";
import type { QRCode, QRScan } from "@/types/traceability";

export const runtime = "nodejs";

const ALLOWED_FIELDS = new Set([
  "qrValue",
  "location",
  // Accepted for compatibility, but never trusted:
  "scannerType",
  "userId",
]);

export async function POST(req: NextRequest) {
  let rawBody: unknown;

  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Validation Error: Invalid JSON body." },
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

  if (Object.keys(body).some((key) => !ALLOWED_FIELDS.has(key))) {
    return NextResponse.json(
      { success: false, error: "Validation Error: Unsupported request fields." },
      { status: 400 }
    );
  }

  if (
    typeof body.qrValue !== "string" ||
    !body.qrValue.trim() ||
    body.qrValue.length > 256
  ) {
    return NextResponse.json(
      { success: false, error: "Validation Error: A valid QR value is required." },
      { status: 400 }
    );
  }

  let userId: string | undefined;

  try {
    const user = await getAuthenticatedUser(req);
    userId = user.userId;
  } catch {
    // Anonymous scanning is intentionally supported.
  }

  let location: QRScan["location"];

  if (body.location !== undefined) {
    if (
      body.location === null ||
      typeof body.location !== "object" ||
      Array.isArray(body.location)
    ) {
      return NextResponse.json(
        { success: false, error: "Validation Error: Invalid scan location." },
        { status: 400 }
      );
    }

    const candidate = body.location as Record<string, unknown>;
    const allowedLocationFields = new Set([
      "latitude",
      "longitude",
      "description",
    ]);

    if (
      Object.keys(candidate).some(
        (key) => !allowedLocationFields.has(key)
      ) ||
      typeof candidate.latitude !== "number" ||
      !Number.isFinite(candidate.latitude) ||
      candidate.latitude < -90 ||
      candidate.latitude > 90 ||
      typeof candidate.longitude !== "number" ||
      !Number.isFinite(candidate.longitude) ||
      candidate.longitude < -180 ||
      candidate.longitude > 180 ||
      (
        candidate.description !== undefined &&
        (
          typeof candidate.description !== "string" ||
          candidate.description.length > 200
        )
      )
    ) {
      return NextResponse.json(
        { success: false, error: "Validation Error: Invalid scan location fields." },
        { status: 400 }
      );
    }

    location = {
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      ...(typeof candidate.description === "string" &&
      candidate.description.trim()
        ? { description: candidate.description.trim() }
        : {}),
    };
  }

  try {
    const qrValue = body.qrValue.trim();

    const matchingQRs = await firebaseAdminDb
      .collection("qrCodes")
      .where("qrValue", "==", qrValue)
      .limit(2)
      .get();

    if (matchingQRs.empty) {
      return NextResponse.json(
        { success: false, error: "Invalid QR value or QR code not found." },
        { status: 404 }
      );
    }

    // Duplicate values are a data-integrity problem; never guess which
    // package the caller intended to scan.
    if (matchingQRs.size !== 1) {
      return NextResponse.json(
        { success: false, error: "QR verification is temporarily unavailable." },
        { status: 409 }
      );
    }

    const qrDoc = matchingQRs.docs[0];
    const qr = qrDoc.data() as QRCode;

    if (
      typeof qr.packageNumber !== "string" ||
      typeof qr.currentHoldingId !== "string" ||
      typeof qr.lotId !== "string" ||
      typeof qr.certificateId !== "string"
    ) {
      return NextResponse.json(
        { success: false, error: "The QR record is incomplete." },
        { status: 409 }
      );
    }

    const scannedAt = new Date().toISOString();
    const scanId = `scan_${randomBytes(16).toString("hex")}`;
    const scannerType = userId ? "authenticated" : "public";

    const scanRecord: QRScan = {
      scanId,
      qrId: qrDoc.id,
      qrValue,
      packageNumber: qr.packageNumber,
      lotId: qr.lotId,
      certificateId: qr.certificateId,
      currentHoldingId: qr.currentHoldingId,
      scannerType,
      scannedAt,
      ...(userId ? { userId } : {}),
      ...(location ? { location } : {}),
      ...(req.headers.get("user-agent")
        ? { userAgent: req.headers.get("user-agent")!.slice(0, 512) }
        : {}),
    };

    // Persist using the trusted Admin SDK, not the client Firestore SDK.
    await firebaseAdminDb
      .collection("qrScans")
      .doc(scanId)
      .create(scanRecord);

    // Return only a public-safe acknowledgement, not internal database IDs.
    return NextResponse.json(
      {
        success: true,
        scan: {
          scanId,
          packageNumber: qr.packageNumber,
          scannerType,
          scannedAt,
        },
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Unable to record the QR scan." },
      { status: 500 }
    );
  }
}
