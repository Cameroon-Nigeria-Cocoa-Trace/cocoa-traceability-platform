/**
 * Cocoa Lot Service
 * Cocoa Traceability, Certificate & Cross-Border Export Platform
 *
 * Responsibilities:
 * - Manages Cocoa Lots derived from registered Cameroon farms, production records, and harvests.
 * - Enforces the strict upstream traceability chain:
 *   Farm -> Production Record -> Harvest -> Cocoa Lot
 * - Validates mandatory Cloudinary image reference (no binary/base64 in Firestore).
 * - Enforces atomic harvest allocation using Firestore transactions to prevent double allocation.
 * - Guarantees quantity integrity:
 *   - Harvest Quantity >= Total Quantity Allocated to Cocoa Lots from that Harvest
 *   - initial availableQuantityKg === quantityKg
 * - Generates unique traceable lotNumber.
 * - Derives creator identity from Firebase Authentication UID.
 * - Protects immutable attributes and prohibits direct unallocated quantity mutation.
 * - Preserves historical traceability.
 */

import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  runTransaction,
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "@/lib/firebase";
import {
  CocoaLot,
  CocoaLotStatus,
  CocoaQualityGrade,
  CloudinaryImageReference,
  ProductionRecord,
  Harvest,
} from "@/types/traceability";
import { resolveAuthenticatedUserUid } from "./productionService";

export interface CreateCocoaLotInput {
  lotId?: string; // Optional idempotency key / custom ID
  lotNumber?: string; // Optional custom traceable lot number
  farmId: string;
  productionRecordId: string;
  harvestId: string;
  quantityKg: number;
  pricePerKg: number;
  currency?: string; // Defaults to "XAF"
  qualityGrade?: CocoaQualityGrade;
  cocoaImage: CloudinaryImageReference; // MANDATORY: Valid Cloudinary metadata reference
  productionPeriod?: string;
  productionDate?: string;
  createdBy?: string; // Derived from Firebase Auth UID; caller cannot impersonate
}

export interface UpdateCocoaLotInput {
  pricePerKg?: number;
  currency?: string;
  qualityGrade?: CocoaQualityGrade;
  cocoaImage?: CloudinaryImageReference;
  lotStatus?: CocoaLotStatus;
  // Attempting to mutate quantityKg directly is prohibited to protect harvest allocation
  quantityKg?: number;
}

/**
 * Validates Cloudinary image metadata reference.
 * Prevents binary storage, base64 payloads, and empty/invalid references.
 */
export function validateCloudinaryImageReference(
  image: unknown
): asserts image is CloudinaryImageReference {
  if (!image || typeof image !== "object") {
    throw new Error(
      "Validation Error: cocoaImage is required and must be a valid CloudinaryImageReference object."
    );
  }

  const ref = image as Record<string, unknown>;

  if (!ref.publicId || typeof ref.publicId !== "string" || !ref.publicId.trim()) {
    throw new Error(
      "Validation Error: cocoaImage.publicId is required and must be a non-empty string."
    );
  }

  const url = (ref.secureUrl || ref.url) as string | undefined;
  if (!url || typeof url !== "string" || !url.trim()) {
    throw new Error(
      "Validation Error: cocoaImage must contain a valid url or secureUrl."
    );
  }

  // Reject base64 / binary content masquerading as a URL
  if (url.startsWith("data:") || url.includes(";base64,")) {
    throw new Error(
      "Validation Error: Base64 image data is not allowed in Firestore. Use the approved Cloudinary metadata reference."
    );
  }

  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    throw new Error(
      "Validation Error: cocoaImage url must be a valid HTTP or HTTPS Cloudinary URL."
    );
  }
}

/**
 * Generates a unique, standardized traceable Cocoa Lot Number.
 * Format: LOT-CMR-<SEASON>-<TIMESTAMP>-<HASH>
 */
export function generateLotNumber(seasonYear?: string): string {
  const sanitizedSeason = (seasonYear || "GEN")
    .replace(/[^a-zA-Z0-9]/g, "-")
    .toUpperCase();
  const timeComponent = Date.now().toString(36).toUpperCase();
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `LOT-CMR-${sanitizedSeason}-${timeComponent}-${randomSuffix}`;
}

/**
 * Validates input parameters for creating a Cocoa Lot.
 */
export function validateCocoaLotInput(input: CreateCocoaLotInput): void {
  if (!input.farmId || typeof input.farmId !== "string" || !input.farmId.trim()) {
    throw new Error("Validation Error: farmId is required and must be a non-empty string.");
  }
  if (
    !input.productionRecordId ||
    typeof input.productionRecordId !== "string" ||
    !input.productionRecordId.trim()
  ) {
    throw new Error("Validation Error: productionRecordId is required and must be a non-empty string.");
  }
  if (!input.harvestId || typeof input.harvestId !== "string" || !input.harvestId.trim()) {
    throw new Error("Validation Error: harvestId is required and must be a non-empty string.");
  }
  if (
    typeof input.quantityKg !== "number" ||
    isNaN(input.quantityKg) ||
    !isFinite(input.quantityKg) ||
    input.quantityKg <= 0
  ) {
    throw new Error(
      `Validation Error: Invalid lot quantity (${input.quantityKg}). Must be a positive finite number greater than 0.`
    );
  }
  if (
    typeof input.pricePerKg !== "number" ||
    isNaN(input.pricePerKg) ||
    !isFinite(input.pricePerKg) ||
    input.pricePerKg < 0
  ) {
    throw new Error(
      `Validation Error: Invalid pricePerKg (${input.pricePerKg}). Must be a non-negative finite number.`
    );
  }

  // Validate mandatory Cloudinary image
  validateCloudinaryImageReference(input.cocoaImage);

  // Validate authenticated identity
  resolveAuthenticatedUserUid(input.createdBy);
}

/**
 * Creates a new Cocoa Lot atomically.
 * Ensures:
 * 1. Farm exists.
 * 2. ProductionRecord exists and belongs to the Farm.
 * 3. Harvest exists, belongs to the Farm, and belongs to the ProductionRecord.
 * 4. Harvest has sufficient unallocated quantity (Harvest Quantity >= Total Allocated to Lots).
 * 5. Atomically increments harvest allocatedQuantityKg and deducts availableQuantityKg.
 * 6. availableQuantityKg is initialized to quantityKg.
 * 7. Idempotent: Retrying with the same lotId returns existing lot without duplicate allocation.
 */
export async function createCocoaLot(input: CreateCocoaLotInput): Promise<CocoaLot> {
  validateCocoaLotInput(input);

  const createdBy = resolveAuthenticatedUserUid(input.createdBy);
  const farmId = input.farmId.trim();
  const productionRecordId = input.productionRecordId.trim();
  const harvestId = input.harvestId.trim();

  const lotId =
    input.lotId?.trim() ||
    `lot_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const farmRef = doc(db, "farms", farmId);
  const prodRef = doc(db, "productions", productionRecordId);
  const harvestRef = doc(db, "harvests", harvestId);
  const lotDocRef = doc(db, "cocoaLots", lotId);
  const now = new Date().toISOString();

  let createdLot: CocoaLot | null = null;

  try {
    await runTransaction(db, async (transaction) => {
      // 1. Verify Farm exists
      const farmSnap = await transaction.get(farmRef);
      if (!farmSnap.exists()) {
        throw new Error(
          `Farm Verification Failed: Farm with ID "${farmId}" does not exist. Cannot create cocoa lot.`
        );
      }

      // 2. Verify Production Record exists
      const prodSnap = await transaction.get(prodRef);
      if (!prodSnap.exists()) {
        throw new Error(
          `Production Verification Failed: Production record with ID "${productionRecordId}" does not exist. Cannot create cocoa lot.`
        );
      }
      const productionRecord = prodSnap.data() as ProductionRecord;

      // 3. Verify Production Record belongs to specified Farm
      if (productionRecord.farmId !== farmId) {
        throw new Error(
          `Relational Mismatch Error: Production record "${productionRecordId}" belongs to farm "${productionRecord.farmId}", not "${farmId}".`
        );
      }

      // 4. Verify Harvest exists
      const harvestSnap = await transaction.get(harvestRef);
      if (!harvestSnap.exists()) {
        throw new Error(
          `Harvest Verification Failed: Harvest with ID "${harvestId}" does not exist. Cannot create cocoa lot.`
        );
      }
      const harvest = harvestSnap.data() as Harvest;

      // 5. Verify Harvest belongs to specified Farm
      if (harvest.farmId !== farmId) {
        throw new Error(
          `Relational Mismatch Error: Harvest "${harvestId}" belongs to farm "${harvest.farmId}", not "${farmId}".`
        );
      }

      // 6. Verify Harvest belongs to specified Production Record
      if (harvest.productionRecordId !== productionRecordId) {
        throw new Error(
          `Relational Mismatch Error: Harvest "${harvestId}" belongs to production record "${harvest.productionRecordId}", not "${productionRecordId}".`
        );
      }

      // 7. Check idempotency: If lot already exists, return it without duplicate allocation
      const existingLotSnap = await transaction.get(lotDocRef);
      if (existingLotSnap.exists()) {
        createdLot = existingLotSnap.data() as CocoaLot;
        return;
      }

      // 8. Enforce Harvest Quantity Allocation Integrity
      const harvestTotalQty = Number(harvest.quantityKg);
      const currentAllocated = Number(harvest.allocatedQuantityKg || 0);
      const remainingCapacity = Math.max(0, harvestTotalQty - currentAllocated);
      const requestedQty = Number(input.quantityKg);

      if (requestedQty > remainingCapacity) {
        throw new Error(
          `Harvest Allocation Error: Requested lot quantity (${requestedQty} kg) exceeds remaining unallocated harvest capacity (${remainingCapacity} kg of ${harvestTotalQty} kg total).`
        );
      }

      // Update Harvest allocation atomically
      const newAllocated = currentAllocated + requestedQty;
      const newAvailable = harvestTotalQty - newAllocated;
      const updatedHarvestStatus = newAvailable <= 0 ? "allocated_to_lot" : (harvest.status || "logged");

      transaction.update(harvestRef, {
        allocatedQuantityKg: newAllocated,
        availableQuantityKg: newAvailable,
        status: updatedHarvestStatus,
        updatedAt: now,
      });

      // Construct unique lotNumber
      const lotNumber = input.lotNumber?.trim() || generateLotNumber(productionRecord.seasonYear);

      // Create new CocoaLot
      createdLot = {
        lotId,
        lotNumber,
        farmId,
        productionRecordId,
        harvestId,
        originCountry: "Cameroon",
        productionPeriod: input.productionPeriod?.trim() || productionRecord.productionPeriod,
        productionDate: input.productionDate?.trim() || harvest.harvestDate,
        quantityKg: requestedQty,
        availableQuantityKg: requestedQty, // Initially equal to quantityKg
        pricePerKg: Number(input.pricePerKg),
        currency: input.currency?.trim() || "XAF",
        qualityGrade: input.qualityGrade || harvest.qualityGrade,
        cocoaImage: input.cocoaImage,
        lotStatus: "created",
        createdBy,
        createdAt: now,
        updatedAt: now,
      };

      transaction.set(lotDocRef, createdLot);
    });

    if (!createdLot) {
      throw new Error(`Failed to create cocoa lot "${lotId}".`);
    }

    return createdLot;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `cocoaLots/${lotId}`);
    throw error;
  }
}

/**
 * Retrieves a single Cocoa Lot by its ID.
 */
export async function getCocoaLot(lotId: string): Promise<CocoaLot | null> {
  if (!lotId || typeof lotId !== "string" || !lotId.trim()) {
    throw new Error("Validation Error: lotId must be a non-empty string.");
  }

  const cleanLotId = lotId.trim();
  const lotPath = `cocoaLots/${cleanLotId}`;
  try {
    const docSnap = await getDoc(doc(db, "cocoaLots", cleanLotId));
    if (!docSnap.exists()) {
      return null;
    }
    return docSnap.data() as CocoaLot;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, lotPath);
    return null;
  }
}

/**
 * Updates mutable fields of an existing Cocoa Lot.
 * Immutable fields protected:
 * - lotId, lotNumber, farmId, productionRecordId, harvestId, originCountry, createdBy, createdAt.
 * Quantity mutation protection:
 * - Prohibits direct modification of quantityKg to protect harvest allocation and traceability.
 */
export async function updateCocoaLot(
  lotId: string,
  input: UpdateCocoaLotInput
): Promise<CocoaLot> {
  if (!lotId || typeof lotId !== "string" || !lotId.trim()) {
    throw new Error("Validation Error: lotId must be a non-empty string.");
  }

  const existing = await getCocoaLot(lotId);
  if (!existing) {
    throw new Error(`Cocoa lot with ID "${lotId}" does not exist.`);
  }

  // Prevent direct quantity mutation without formal allocation workflow
  if (input.quantityKg !== undefined && input.quantityKg !== existing.quantityKg) {
    throw new Error(
      "Quantity Adjustment Error: Direct mutation of Cocoa Lot quantity is restricted. Cocoa lot quantities are bound to harvest allocation and certificate traceability."
    );
  }

  if (input.pricePerKg !== undefined) {
    if (typeof input.pricePerKg !== "number" || isNaN(input.pricePerKg) || input.pricePerKg < 0) {
      throw new Error("Validation Error: pricePerKg must be a non-negative finite number.");
    }
  }

  if (input.cocoaImage) {
    validateCloudinaryImageReference(input.cocoaImage);
  }

  const now = new Date().toISOString();
  const updatedLot: CocoaLot = {
    ...existing,
    pricePerKg: input.pricePerKg !== undefined ? Number(input.pricePerKg) : existing.pricePerKg,
    currency: input.currency?.trim() || existing.currency,
    qualityGrade: input.qualityGrade !== undefined ? input.qualityGrade : existing.qualityGrade,
    cocoaImage: input.cocoaImage || existing.cocoaImage,
    lotStatus: input.lotStatus || existing.lotStatus,
    // Preserve immutable attributes
    lotId: existing.lotId,
    lotNumber: existing.lotNumber,
    farmId: existing.farmId,
    productionRecordId: existing.productionRecordId,
    harvestId: existing.harvestId,
    originCountry: existing.originCountry,
    productionPeriod: existing.productionPeriod,
    productionDate: existing.productionDate,
    quantityKg: existing.quantityKg,
    availableQuantityKg: existing.availableQuantityKg,
    createdBy: existing.createdBy,
    createdAt: existing.createdAt,
    updatedAt: now,
  };

  const lotPath = `cocoaLots/${lotId.trim()}`;
  try {
    await runTransaction(db, async (transaction) => {
      transaction.set(doc(db, "cocoaLots", lotId.trim()), updatedLot);
    });
    return updatedLot;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, lotPath);
    throw error;
  }
}

/**
 * Lists all Cocoa Lots belonging to a specific farm.
 */
export async function listCocoaLotsByFarm(farmId: string): Promise<CocoaLot[]> {
  if (!farmId || typeof farmId !== "string" || !farmId.trim()) {
    throw new Error("Validation Error: farmId must be a non-empty string.");
  }

  const lotColl = collection(db, "cocoaLots");
  const q = query(lotColl, where("farmId", "==", farmId.trim()));
  const path = "cocoaLots";

  try {
    const snap = await getDocs(q);
    const lots: CocoaLot[] = [];
    snap.forEach((d) => {
      lots.push(d.data() as CocoaLot);
    });
    return lots.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

/**
 * Lists all Cocoa Lots belonging to a specific production record.
 */
export async function listCocoaLotsByProductionRecord(
  productionRecordId: string
): Promise<CocoaLot[]> {
  if (!productionRecordId || typeof productionRecordId !== "string" || !productionRecordId.trim()) {
    throw new Error("Validation Error: productionRecordId must be a non-empty string.");
  }

  const lotColl = collection(db, "cocoaLots");
  const q = query(lotColl, where("productionRecordId", "==", productionRecordId.trim()));
  const path = "cocoaLots";

  try {
    const snap = await getDocs(q);
    const lots: CocoaLot[] = [];
    snap.forEach((d) => {
      lots.push(d.data() as CocoaLot);
    });
    return lots.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

/**
 * Lists all Cocoa Lots derived from a specific harvest.
 */
export async function listCocoaLotsByHarvest(harvestId: string): Promise<CocoaLot[]> {
  if (!harvestId || typeof harvestId !== "string" || !harvestId.trim()) {
    throw new Error("Validation Error: harvestId must be a non-empty string.");
  }

  const lotColl = collection(db, "cocoaLots");
  const q = query(lotColl, where("harvestId", "==", harvestId.trim()));
  const path = "cocoaLots";

  try {
    const snap = await getDocs(q);
    const lots: CocoaLot[] = [];
    snap.forEach((d) => {
      lots.push(d.data() as CocoaLot);
    });
    return lots.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}
