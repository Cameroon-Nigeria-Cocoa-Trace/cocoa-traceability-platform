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
import { firebaseAdminDb, firebaseAdminAuth } from "@/lib/firebaseAdmin";
import { getAuthenticatedUser, AuthenticatedUser } from "@/lib/authServer";
import { validateCameroonFarmLocation } from "@/lib/geo/cameroonBoundary";
import { isAuthorizedCadastralReviewer } from "@/lib/cadastralAuthorization";
import {
  isCooperativeAuthorizedForFarm,
  getCooperativeActorInfo,
} from "@/lib/serverCooperativeAuth";

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

    // 3. Resolve farmer identity & cooperative association
    const coopInfo = await getCooperativeActorInfo(user.userId);
    let effectiveFarmerId = user.userId;
    let isCooperativeRegistering = false;

    if (
      (coopInfo.isCooperative || coopInfo.isAdmin) &&
      typeof input.farmerId === "string" &&
      input.farmerId.trim() &&
      input.farmerId.trim() !== user.userId
    ) {
      effectiveFarmerId = input.farmerId.trim();
      isCooperativeRegistering = true;
    } else if (coopInfo.isCooperative) {
      isCooperativeRegistering = true;
    }

    // Process new farmer credentials if provided by cooperative
    const rawCredentialType =
      typeof input.farmerCredentialType === "string" && input.farmerCredentialType === "phone"
        ? "phone"
        : "email";
    const rawPassword = typeof input.farmerPassword === "string" ? input.farmerPassword.trim() : "";
    const rawPhone = typeof safeInput.farmerPhone === "string" ? safeInput.farmerPhone.trim() : "";
    const rawEmail = typeof safeInput.farmerEmail === "string" ? safeInput.farmerEmail.trim() : "";
    const rawFarmerName =
      (typeof safeInput.farmerName === "string" && safeInput.farmerName.trim()) || "Member Farmer";

    let authEmail = rawEmail;
    if (rawCredentialType === "phone") {
      const cleanPhone = rawPhone.replace(/\D/g, "");
      authEmail = cleanPhone
        ? `phone_${cleanPhone}@phone.tracetrade.cm`
        : `phone_${Date.now()}@phone.tracetrade.cm`;
    } else if (!authEmail) {
      const slug = rawFarmerName.toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 16);
      authEmail = `${slug}.${Date.now().toString(36)}@cocoatrace.cm`;
    }

    // If cooperative registered a new farmer and provided a password, create or link Firebase Auth account
    if (isCooperativeRegistering && rawPassword && rawPassword.length >= 6) {
      try {
        let authUser;
        try {
          authUser = await firebaseAdminAuth.createUser({
            email: authEmail,
            password: rawPassword,
            displayName: rawFarmerName,
          });
        } catch (createErr: unknown) {
          const errCode = (createErr as { code?: string })?.code;
          if (errCode === "auth/email-already-exists") {
            authUser = await firebaseAdminAuth.getUserByEmail(authEmail);
            try {
              await firebaseAdminAuth.updateUser(authUser.uid, {
                password: rawPassword,
                displayName: rawFarmerName,
              });
            } catch (updateErr) {
              console.warn("Notice: could not update existing Auth user password:", updateErr);
            }
          } else {
            console.warn("Notice: Firebase Auth user creation error:", createErr);
          }
        }

        if (authUser?.uid) {
          effectiveFarmerId = authUser.uid;
        }
      } catch (authErr) {
        console.warn("Notice: Firebase Auth account setup error:", authErr);
      }
    }

    // Explicitly construct the persisted record.
    // Ownership and official metadata are server-controlled.
    const newFarm: Record<string, unknown> = {
      ...safeInput,
      id: farmId,
      farmId,
      farmUniqueId: `TTN-CM-${now.getFullYear()}-${uniqueSuffix}`,
      farmerId: effectiveFarmerId,
      farmerName: rawFarmerName,
      farmerPhone: rawPhone || undefined,
      farmerEmail: rawEmail || (rawCredentialType === "email" ? authEmail : undefined),
      createdAt: nowIso,
      registrationDate: nowIso.split("T")[0],
      sizeHectares:
        Number.isFinite(Number(safeInput.sizeHectares)) &&
        Number(safeInput.sizeHectares) > 0
          ? Number(safeInput.sizeHectares)
          : 2.5,
      eudrCompliant: true,
      ...(isCooperativeRegistering
        ? {
            cooperativeUserId: user.userId,
            cooperativeOrgId: coopInfo.primaryOrgId || user.userId,
            cooperative: (safeInput.cooperative as string) || coopInfo.primaryOrgId || "Cooperative Society",
          }
        : {}),
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

    // 5. If cooperative registered for a farmer, ensure user profile and automatic cooperative associations exist with full permissions
    if (isCooperativeRegistering && effectiveFarmerId !== user.userId) {
      try {
        const farmerUserRef = firebaseAdminDb.collection("users").doc(effectiveFarmerId);
        const resolvedEmail =
          rawCredentialType === "email"
            ? (rawEmail || authEmail)
            : (rawEmail || authEmail);

        await farmerUserRef.set(
          {
            id: effectiveFarmerId,
            uid: effectiveFarmerId,
            displayName: rawFarmerName,
            fullName: rawFarmerName,
            email: resolvedEmail,
            phone: rawPhone,
            credentialType: rawCredentialType,
            role: "farmer",
            accountType: "farmer",
            cooperativeOrgId: coopInfo.primaryOrgId || user.userId,
            cooperativeUserId: user.userId,
            cooperativeName: (safeInput.cooperative as string) || "Cooperative Society",
            createdAt: nowIso,
            updatedAt: nowIso,
          },
          { merge: true }
        );

        // Active association in farmerCooperativeAssociations with FULL cooperative management rights
        const assocKey1 = `${effectiveFarmerId}_${user.userId}`;
        await firebaseAdminDb.collection("farmerCooperativeAssociations").doc(assocKey1).set(
          {
            id: assocKey1,
            associationId: assocKey1,
            farmerId: effectiveFarmerId,
            farmerName: rawFarmerName,
            farmerEmail: resolvedEmail,
            farmerPhone: rawPhone,
            cooperativeUserId: user.userId,
            cooperativeOrgId: coopInfo.primaryOrgId || user.userId,
            cooperativeOrgName: (safeInput.cooperative as string) || "Cooperative Society",
            cooperativeName: (safeInput.cooperative as string) || "Cooperative Society",
            status: "active",
            farmScope: "all_farms",
            delegatedFarmIds: ["ALL"],
            manageEverything: true,
            permissions: {
              farmsManagement: true,
              harvestRecords: true,
              lotCreation: true,
              certificateIssuance: true,
              tradeExecution: true,
              productionInventory: true,
              certificatesManagement: true,
              tradingManagement: true,
            },
            associatedAt: nowIso,
            linkedAt: nowIso,
            updatedAt: nowIso,
          },
          { merge: true }
        );

        if (coopInfo.primaryOrgId && coopInfo.primaryOrgId !== user.userId) {
          const assocKey2 = `${effectiveFarmerId}_${coopInfo.primaryOrgId}`;
          await firebaseAdminDb.collection("farmerCooperativeAssociations").doc(assocKey2).set(
            {
              id: assocKey2,
              associationId: assocKey2,
              farmerId: effectiveFarmerId,
              farmerName: rawFarmerName,
              farmerEmail: resolvedEmail,
              farmerPhone: rawPhone,
              cooperativeUserId: user.userId,
              cooperativeOrgId: coopInfo.primaryOrgId,
              cooperativeOrgName: (safeInput.cooperative as string) || "Cooperative Society",
              cooperativeName: (safeInput.cooperative as string) || "Cooperative Society",
              status: "active",
              farmScope: "all_farms",
              delegatedFarmIds: ["ALL"],
              manageEverything: true,
              permissions: {
                farmsManagement: true,
                harvestRecords: true,
                lotCreation: true,
                certificateIssuance: true,
                tradeExecution: true,
                productionInventory: true,
                certificatesManagement: true,
                tradingManagement: true,
              },
              associatedAt: nowIso,
              linkedAt: nowIso,
              updatedAt: nowIso,
            },
            { merge: true }
          );
        }

        // Active membership in cooperative_memberships
        const memKey = `mem_${effectiveFarmerId}_${user.userId}`;
        await firebaseAdminDb.collection("cooperative_memberships").doc(memKey).set(
          {
            id: memKey,
            cooperativeOrgId: coopInfo.primaryOrgId || user.userId,
            farmerId: effectiveFarmerId,
            farmerName: rawFarmerName,
            farmerPhone: rawPhone,
            farmerEmail: resolvedEmail,
            villageOrCommunity: (safeInput.village as string) || (safeInput.region as string) || "",
            status: "active",
            joinedAt: nowIso,
            updatedAt: nowIso,
          },
          { merge: true }
        );
      } catch (assocErr) {
        console.warn("Notice: could not auto-create cooperative association on farm registration:", assocErr);
      }
    }

    return NextResponse.json(
      {
        success: true,
        farm: newFarm,
        farmerAccount: {
          farmerId: effectiveFarmerId,
          farmerName: rawFarmerName,
          credentialType: rawCredentialType,
          identifier: rawCredentialType === "email" ? rawEmail : rawPhone,
          accountCreated: Boolean(rawPassword && rawPassword.length >= 6),
        },
      },
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

    const isAuthorized =
      existingFarm?.farmerId === user.userId ||
      (await isCooperativeAuthorizedForFarm(user.userId, existingFarm || {}));

    if (!isAuthorized) {
      return NextResponse.json(
        {
          success: false,
          error: "Forbidden: You are not authorized to modify this farm.",
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
