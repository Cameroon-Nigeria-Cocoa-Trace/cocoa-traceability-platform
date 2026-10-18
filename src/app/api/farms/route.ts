/**
 * Farms API Route
 * Endpoint: /api/farms
 * 
 * Enforces server-side validation ensuring only farms located entirely within Cameroon can be registered
 * or updated with location geometry.
 * 
 * Rejects Cross River State (Nigeria) and any points/polygons located outside sovereign Cameroon boundaries.
 * Enforces strict Firebase ID token verification and derives the acting farmerId from authenticated identity.
 */

import { NextRequest, NextResponse } from "next/server";
import { firebaseAdminDb } from "@/lib/firebaseAdmin";
import { getAuthenticatedUser, AuthenticatedUser } from "@/lib/authServer";
import { validateCameroonFarmLocation } from "@/lib/geo/cameroonBoundary";
import { isAuthorizedCadastralReviewer } from "@/lib/cadastralAuthorization";

export { validateCameroonFarmLocation as validateCameroonLocationServer };


export async function POST(req: NextRequest) {
  // 1. Verify the caller's Firebase identity.
  let user: AuthenticatedUser;

  try {
    user = await getAuthenticatedUser(req);
  } catch (authError: unknown) {
    const message =
      authError instanceof Error
        ? authError.message
        : "Authentication Required";

    return NextResponse.json(
      { success: false, error: message },
      { status: 401 }
    );
  }

  try {
    const body: unknown = await req.json();

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      return NextResponse.json(
        { success: false, error: "A valid farm object is required." },
        { status: 400 }
      );
    }

    const input = body as Record<string, unknown>;

    // Never allow a client to choose or overwrite a Firestore farm ID.
    // Also use an allowlist rather than spreading the entire request body.
    const allowedFields = [
      "farmName",
      "farmerName",
      "farmerPhone",
      "farmerEmail",
      "region",
      "village",
      "lga",
      "state",
      "cooperative",
      "geolocation",
      "sizeHectares",
      "cocoaVariety",
      "harvestSeason",
      "estimatedAnnualYieldKg",
      "quantityHarvestedKg",
      "batchNumber",
      "aggregatorCenter",
      "batchMovementRoute",
      "processorExporter",
      "designatedBuyer",
      "landDocType",
      "landDocReference",
      "geofenceAreaHa",
    ] as const;

    const safeInput: Record<string, unknown> = {};

    for (const key of allowedFields) {
      if (input[key] !== undefined) {
        safeInput[key] = input[key];
      }
    }

    // Validate and normalize the optional geofence polygon.
    let normalizedPoly: [number, number][] | undefined;

    if (input.geofencePolygon !== undefined) {
      if (!Array.isArray(input.geofencePolygon)) {
        return NextResponse.json(
          { success: false, error: "Invalid geofence polygon format." },
          { status: 400 }
        );
      }

      if (input.geofencePolygon.length > 0) {
        normalizedPoly = input.geofencePolygon.map(
          (point: unknown): [number, number] => {
            let lng: number;
            let lat: number;

            if (Array.isArray(point) && point.length >= 2) {
              lng = Number(point[0]);
              lat = Number(point[1]);
            } else if (point && typeof point === "object") {
              const p = point as Record<string, unknown>;
              lng = Number(p.lng ?? p.longitude);
              lat = Number(p.lat ?? p.latitude);
            } else {
              throw new Error(
                "Validation Error: Invalid geofence polygon point."
              );
            }

            if (
              !Number.isFinite(lng) ||
              !Number.isFinite(lat) ||
              lng < -180 ||
              lng > 180 ||
              lat < -90 ||
              lat > 90
            ) {
              throw new Error(
                "Validation Error: Invalid longitude or latitude."
              );
            }

            return [lng, lat];
          }
        );
      }
    }

    // 2. Run authoritative server-side Cameroon farm validation.
    const validationResult = validateCameroonFarmLocation({
      region: safeInput.region as string,
      state: safeInput.state as string | undefined,
      village: safeInput.village as string | undefined,
      geolocation: safeInput.geolocation as string,
      geofencePolygon: normalizedPoly,
      landDocType: safeInput.landDocType as string | undefined,
      landDocReference: safeInput.landDocReference as string | undefined,
    });

    // 3. Generate the document ID on the server.
    // Never reuse a client-supplied ID.
    const farmRef = firebaseAdminDb.collection("farms").doc();
    const farmId = farmRef.id;

    const now = new Date();
    const nowIso = now.toISOString();
    const uniqueSuffix = Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase();

    // Explicitly construct the persisted record.
    // Ownership and official metadata are server-controlled.
    const newFarm: Record<string, unknown> = {
      ...safeInput,
      id: farmId,
      farmId,
      farmUniqueId: `TTN-CM-${now.getFullYear()}-${uniqueSuffix}`,
      farmerId: user.userId,
      createdAt: nowIso,
      registrationDate: nowIso.split("T")[0],
      sizeHectares:
        Number.isFinite(Number(safeInput.sizeHectares)) &&
        Number(safeInput.sizeHectares) > 0
          ? Number(safeInput.sizeHectares)
          : 2.5,

      // A submitted farm is not automatically EUDR-compliant.
      // Compliance must be established by the proper workflow.
      eudrCompliant: false,
    };

    // Only server validation may set border-review metadata.
    if (validationResult?.borderProximity) {
      newFarm.borderProximity =
        validationResult.borderProximity.zone;

      newFarm.distanceToBorderKm =
        validationResult.borderProximity.distanceToBorderKm;

      newFarm.borderAuditStatus =
        validationResult.borderProximity.requiresSecondaryVerification
          ? "pending_cadastral_review"
          : "inland_verified";

      newFarm.hasLandDocumentSubmitted =
        Boolean(safeInput.landDocReference);

      newFarm.borderGuidance =
        validationResult.borderProximity.guidance;
    }

    if (normalizedPoly && normalizedPoly.length > 0) {
      // Firestore does not allow nested arrays.
      newFarm.geofencePolygon = normalizedPoly.map(([lng, lat]) => ({
        lng,
        lat,
      }));

      newFarm.geofencePointCount = normalizedPoly.length;
    }

    // 4. Persist only under the newly generated server ID.
    // Existing farm documents cannot be overwritten using a supplied ID.
    await farmRef.create(newFarm);

    return NextResponse.json(
      { success: true, farm: newFarm },
      { status: 201 }
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal Server Error";

    const status =
      message.includes("Validation Error") ||
      message.includes("Registration Policy Violation")
        ? 400
        : 500;

    return NextResponse.json(
      { success: false, error: message },
      { status }
    );
  }
}


export async function PATCH(req: NextRequest) {
  // 1. Authenticate the caller.
  let user: AuthenticatedUser;

  try {
    user = await getAuthenticatedUser(req);
  } catch (authError: unknown) {
    const message =
      authError instanceof Error
        ? authError.message
        : "Authentication Required";

    return NextResponse.json(
      { success: false, error: message },
      { status: 401 }
    );
  }

  try {
    const body: unknown = await req.json();

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      return NextResponse.json(
        { success: false, error: "A valid update object is required." },
        { status: 400 }
      );
    }

    const input = body as Record<string, unknown>;
    const farmId = input.farmId;

    if (
      typeof farmId !== "string" ||
      farmId.trim().length === 0
    ) {
      return NextResponse.json(
        { success: false, error: "farmId is required." },
        { status: 400 }
      );
    }

    // 2. Only explicitly approved fields may be changed by a farm owner.
    // Ownership, compliance, registration, audit and review fields remain
    // controlled by trusted server workflows.
    const allowedFields = new Set([
      "farmName",
      "farmerName",
      "farmerPhone",
      "farmerEmail",
      "region",
      "village",
      "lga",
      "state",
      "cooperative",
      "geolocation",
      "sizeHectares",
      "cocoaVariety",
      "harvestSeason",
      "estimatedAnnualYieldKg",
      "quantityHarvestedKg",
      "batchNumber",
      "aggregatorCenter",
      "batchMovementRoute",
      "processorExporter",
      "designatedBuyer",
      "landDocType",
      "landDocReference",
      "deforestationRisk",
      "paymentMethod",
      "transactionReference",
      "transactionAmount",
      "geofencePolygon",
    ]);

    const suppliedFields = Object.keys(input).filter(
      (key) => key !== "farmId"
    );

    const forbiddenFields = suppliedFields.filter(
      (key) => !allowedFields.has(key)
    );

    if (forbiddenFields.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `These fields cannot be updated through this endpoint: ${forbiddenFields.join(", ")}`,
        },
        { status: 400 }
      );
    }

    if (suppliedFields.length === 0) {
      return NextResponse.json(
        { success: false, error: "No update fields were supplied." },
        { status: 400 }
      );
    }

    // 3. Load the existing farm and verify ownership.
    const farmRef = firebaseAdminDb
      .collection("farms")
      .doc(farmId);

    const farmDoc = await farmRef.get();

    if (!farmDoc.exists) {
      return NextResponse.json(
        { success: false, error: "Farm not found." },
        { status: 404 }
      );
    }

    const existingFarm = farmDoc.data();

    if (existingFarm?.farmerId !== user.userId) {
      return NextResponse.json(
        {
          success: false,
          error: "Forbidden: You cannot modify another user's farm.",
        },
        { status: 403 }
      );
    }

    // 4. Copy only allowlisted fields into the update payload.
    const safeUpdates: Record<string, unknown> = {};

    for (const key of suppliedFields) {
      safeUpdates[key] = input[key];
    }

    // Normalize supported polygon formats:
    // [longitude, latitude] or { lng, lat } / { longitude, latitude }.
    const normalizePolygon = (
      value: unknown
    ): [number, number][] => {
      if (!Array.isArray(value) || value.length < 3) {
        throw new Error(
          "Validation Error: A geofence polygon requires at least three points."
        );
      }

      return value.map((point: unknown): [number, number] => {
        let longitude: number;
        let latitude: number;

        if (Array.isArray(point) && point.length >= 2) {
          longitude = Number(point[0]);
          latitude = Number(point[1]);
        } else if (point && typeof point === "object") {
          const coordinates = point as Record<string, unknown>;

          longitude = Number(
            coordinates.lng ?? coordinates.longitude
          );

          latitude = Number(
            coordinates.lat ?? coordinates.latitude
          );
        } else {
          throw new Error(
            "Validation Error: Invalid geofence polygon point."
          );
        }

        if (
          !Number.isFinite(longitude) ||
          !Number.isFinite(latitude) ||
          longitude < -180 ||
          longitude > 180 ||
          latitude < -90 ||
          latitude > 90
        ) {
          throw new Error(
            "Validation Error: Invalid geofence coordinates."
          );
        }

        return [longitude, latitude];
      });
    };

    const locationFields = [
      "region",
      "state",
      "village",
      "geolocation",
      "geofencePolygon",
      "landDocType",
      "landDocReference",
    ];

    const requiresLocationValidation = locationFields.some(
      (field) => input[field] !== undefined
    );

    if (requiresLocationValidation) {
      let polygon: [number, number][] | undefined;

      if (input.geofencePolygon !== undefined) {
        polygon = normalizePolygon(input.geofencePolygon);
      } else if (Array.isArray(existingFarm?.geofencePolygon)) {
        polygon = normalizePolygon(existingFarm.geofencePolygon);
      }

      const validationResult = validateCameroonFarmLocation({
        region: (input.region ?? existingFarm?.region) as string,
        state: (input.state ?? existingFarm?.state) as
          | string
          | undefined,
        village: (input.village ?? existingFarm?.village) as
          | string
          | undefined,
        geolocation: (input.geolocation ??
          existingFarm?.geolocation) as string,
        geofencePolygon: polygon,
        landDocType: (input.landDocType ??
          existingFarm?.landDocType) as string | undefined,
        landDocReference: (input.landDocReference ??
          existingFarm?.landDocReference) as string | undefined,
      });

      // Persist polygons in the Firestore-compatible object format.
      if (polygon) {
        safeUpdates.geofencePolygon = polygon.map(
          ([lng, lat]) => ({ lng, lat })
        );

        safeUpdates.geofencePointCount = polygon.length;
      }

      // Recalculate border-review metadata on the server.
      // A submitted document never independently approves a farm.
      if (validationResult?.borderProximity) {
        const border = validationResult.borderProximity;

        safeUpdates.borderProximity = border.zone;
        safeUpdates.distanceToBorderKm =
          border.distanceToBorderKm;
        safeUpdates.borderAuditStatus =
          border.requiresSecondaryVerification
            ? "pending_cadastral_review"
            : "inland_verified";
        safeUpdates.hasLandDocumentSubmitted = Boolean(
          input.landDocReference ??
          existingFarm?.landDocReference
        );
        safeUpdates.borderGuidance = border.guidance;
      }
    }

    // Never accept audit decisions or compliance claims from this endpoint.
    // A separate authorized review workflow must make those changes.
    safeUpdates.updatedAt = new Date().toISOString();

    await farmRef.update(safeUpdates);

    const updatedDoc = await farmRef.get();

    return NextResponse.json(
      {
        success: true,
        farm: updatedDoc.data(),
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Internal Server Error";

    const isValidationError =
      message.includes("Validation Error") ||
      message.includes("Registration Policy Violation");

    return NextResponse.json(
      {
        success: false,
        error: isValidationError ? message : "Farm update failed.",
      },
      { status: isValidationError ? 400 : 500 }
    );
  }
}
