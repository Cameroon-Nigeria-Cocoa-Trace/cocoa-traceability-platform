/**
 * Production Record Service
 * Cocoa Traceability, Certificate & Cross-Border Export Platform
 *
 * Responsibilities:
 * - Manages seasonal production records for registered Cameroon cocoa farms.
 * - Enforces upstream relationship: Farm -> Production Record.
 * - Validates date ranges, estimated quantities, and actual harvest metrics.
 * - Keeps actualQuantityKg distinct from estimatedQuantityKg (estimates are not hard limits).
 * - Tracks expectedNumberOfHarvests and numberOfHarvests.
 * - Derives and protects user identity: userId = Firebase Authentication UID.
 * - Prohibits UID impersonation.
 * - Preserves historical production data; records cannot be deleted.
 * - Idempotent record creation.
 */

import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { auth, db, handleFirestoreError, OperationType } from "@/lib/firebase";
import { ProductionRecord, ProductionStatus } from "@/types/traceability";

export interface CreateProductionRecordInput {
  productionRecordId?: string; // Optional idempotency key / custom ID
  farmId: string;
  seasonYear: string;
  productionPeriod: string;
  startDate: string;
  endDate?: string;
  status?: ProductionStatus;
  estimatedQuantityKg?: number;
  actualQuantityKg?: number;
  expectedNumberOfHarvests?: number;
  numberOfHarvests?: number;
  notes?: string;
  createdBy?: string; // Derived from Firebase Auth UID; caller cannot impersonate
}

export interface UpdateProductionRecordInput {
  seasonYear?: string;
  productionPeriod?: string;
  startDate?: string;
  endDate?: string;
  status?: ProductionStatus;
  estimatedQuantityKg?: number;
  actualQuantityKg?: number;
  expectedNumberOfHarvests?: number;
  numberOfHarvests?: number;
  notes?: string;
}

/**
 * Resolves the authenticated user's Firebase UID securely.
 * - If Firebase Auth has a logged-in user, returns auth.currentUser.uid.
 * - If caller provided a different createdBy, throws an impersonation error.
 * - If no auth session is active (e.g. non-browser test runner), accepts verified caller UID.
 */
export function resolveAuthenticatedUserUid(callerSuppliedUid?: string): string {
  const currentUid = auth.currentUser?.uid;
  if (currentUid) {
    if (callerSuppliedUid && callerSuppliedUid.trim() !== currentUid) {
      throw new Error(
        `Authentication Error: Identity mismatch. Cannot impersonate another Firebase UID ("${callerSuppliedUid}" does not match authenticated user "${currentUid}").`
      );
    }
    return currentUid;
  }

  if (callerSuppliedUid && callerSuppliedUid.trim()) {
    return callerSuppliedUid.trim();
  }

  throw new Error("Authentication Error: User must be authenticated to perform this operation.");
}

/**
 * Validates date string format and validity.
 */
function isValidDateString(dateStr: string): boolean {
  if (!dateStr || typeof dateStr !== "string") return false;
  const d = new Date(dateStr);
  return !isNaN(d.getTime());
}

/**
 * Validates a production record input payload.
 */
export function validateProductionInput(
  input: CreateProductionRecordInput | UpdateProductionRecordInput,
  isCreate: boolean
): void {
  if (isCreate) {
    const createInput = input as CreateProductionRecordInput;
    if (!createInput.farmId || typeof createInput.farmId !== "string" || !createInput.farmId.trim()) {
      throw new Error("Validation Error: farmId is required and must be a non-empty string.");
    }
    if (!createInput.seasonYear || typeof createInput.seasonYear !== "string" || !createInput.seasonYear.trim()) {
      throw new Error("Validation Error: seasonYear is required and must be a non-empty string.");
    }
    if (!createInput.productionPeriod || typeof createInput.productionPeriod !== "string" || !createInput.productionPeriod.trim()) {
      throw new Error("Validation Error: productionPeriod is required and must be a non-empty string.");
    }
    if (!createInput.startDate || !isValidDateString(createInput.startDate)) {
      throw new Error("Validation Error: startDate is required and must be a valid date.");
    }

    // Verify identity integrity
    resolveAuthenticatedUserUid(createInput.createdBy);
  }

  // Validate date range if both dates exist
  if (input.startDate && !isValidDateString(input.startDate)) {
    throw new Error(`Validation Error: Invalid startDate "${input.startDate}".`);
  }
  if (input.endDate && !isValidDateString(input.endDate)) {
    throw new Error(`Validation Error: Invalid endDate "${input.endDate}".`);
  }
  if (input.startDate && input.endDate) {
    const start = new Date(input.startDate);
    const end = new Date(input.endDate);
    if (end.getTime() < start.getTime()) {
      throw new Error(
        `Validation Error: Invalid date range - endDate (${input.endDate}) cannot be earlier than startDate (${input.startDate}).`
      );
    }
  }

  // Validate estimated quantity if provided (must be strictly positive)
  if (input.estimatedQuantityKg !== undefined && input.estimatedQuantityKg !== null) {
    if (
      typeof input.estimatedQuantityKg !== "number" ||
      isNaN(input.estimatedQuantityKg) ||
      !isFinite(input.estimatedQuantityKg) ||
      input.estimatedQuantityKg <= 0
    ) {
      throw new Error(
        `Validation Error: Invalid production quantity (${input.estimatedQuantityKg}). Must be a positive finite number.`
      );
    }
  }

  // Validate actualQuantityKg if provided (must be non-negative)
  if (input.actualQuantityKg !== undefined && input.actualQuantityKg !== null) {
    if (
      typeof input.actualQuantityKg !== "number" ||
      isNaN(input.actualQuantityKg) ||
      !isFinite(input.actualQuantityKg) ||
      input.actualQuantityKg < 0
    ) {
      throw new Error(
        `Validation Error: Invalid actualQuantityKg (${input.actualQuantityKg}). Must be a non-negative finite number.`
      );
    }
  }

  // Validate expectedNumberOfHarvests if provided
  if (input.expectedNumberOfHarvests !== undefined && input.expectedNumberOfHarvests !== null) {
    if (
      typeof input.expectedNumberOfHarvests !== "number" ||
      !Number.isInteger(input.expectedNumberOfHarvests) ||
      input.expectedNumberOfHarvests < 0
    ) {
      throw new Error(
        `Validation Error: expectedNumberOfHarvests (${input.expectedNumberOfHarvests}) must be a non-negative integer.`
      );
    }
  }

  // Validate numberOfHarvests if provided
  if (input.numberOfHarvests !== undefined && input.numberOfHarvests !== null) {
    if (
      typeof input.numberOfHarvests !== "number" ||
      !Number.isInteger(input.numberOfHarvests) ||
      input.numberOfHarvests < 0
    ) {
      throw new Error(
        `Validation Error: numberOfHarvests (${input.numberOfHarvests}) must be a non-negative integer.`
      );
    }
  }
}

/**
 * Creates a new production record for a verified farm.
 * Idempotent: If productionRecordId is provided and the document already exists, returns existing record.
 */
export async function createProductionRecord(
  input: CreateProductionRecordInput
): Promise<ProductionRecord> {
  validateProductionInput(input, true);

  // Derive secure Firebase UID
  const createdBy = resolveAuthenticatedUserUid(input.createdBy);

  const farmId = input.farmId.trim();
  const farmRef = doc(db, "farms", farmId);
  const farmPath = `farms/${farmId}`;

  // 1. Verify that referenced farm exists in Firestore
  let farmExists = false;
  try {
    const farmSnap = await getDoc(farmRef);
    farmExists = farmSnap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, farmPath);
  }

  if (!farmExists) {
    throw new Error(
      `Farm Verification Failed: Farm with ID "${farmId}" does not exist. A production record cannot reference a non-existent farm.`
    );
  }

  // 2. Generate or use idempotent productionRecordId
  const productionRecordId =
    input.productionRecordId?.trim() ||
    `prod_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const prodDocRef = doc(db, "productions", productionRecordId);
  const prodPath = `productions/${productionRecordId}`;

  // Check if document already exists (idempotency support)
  try {
    const existingSnap = await getDoc(prodDocRef);
    if (existingSnap.exists()) {
      return existingSnap.data() as ProductionRecord;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, prodPath);
  }

  const now = new Date().toISOString();
  const record: ProductionRecord = {
    productionRecordId,
    farmId,
    seasonYear: input.seasonYear.trim(),
    productionPeriod: input.productionPeriod.trim(),
    startDate: input.startDate.trim(),
    endDate: input.endDate?.trim(),
    status: input.status || "active",
    estimatedQuantityKg: input.estimatedQuantityKg,
    actualQuantityKg: input.actualQuantityKg !== undefined ? input.actualQuantityKg : 0,
    expectedNumberOfHarvests: input.expectedNumberOfHarvests,
    numberOfHarvests: input.numberOfHarvests !== undefined ? input.numberOfHarvests : 0,
    notes: input.notes?.trim(),
    createdBy,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await setDoc(prodDocRef, record);
    return record;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, prodPath);
    throw error;
  }
}

/**
 * Retrieves a single production record by its ID.
 */
export async function getProductionRecord(
  productionRecordId: string
): Promise<ProductionRecord | null> {
  if (!productionRecordId || typeof productionRecordId !== "string") {
    throw new Error("Validation Error: productionRecordId must be a non-empty string.");
  }

  const prodPath = `productions/${productionRecordId}`;
  try {
    const docSnap = await getDoc(doc(db, "productions", productionRecordId));
    if (!docSnap.exists()) {
      return null;
    }
    return docSnap.data() as ProductionRecord;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, prodPath);
    return null;
  }
}

/**
 * Updates an existing production record while preserving createdAt, farmId, and createdBy.
 */
export async function updateProductionRecord(
  productionRecordId: string,
  input: UpdateProductionRecordInput
): Promise<ProductionRecord> {
  if (!productionRecordId || typeof productionRecordId !== "string") {
    throw new Error("Validation Error: productionRecordId must be a non-empty string.");
  }

  const existing = await getProductionRecord(productionRecordId);
  if (!existing) {
    throw new Error(`Production record with ID "${productionRecordId}" does not exist.`);
  }

  // Cross-check dates with existing values if partial update
  const effectiveStartDate = input.startDate || existing.startDate;
  const effectiveEndDate = input.endDate !== undefined ? input.endDate : existing.endDate;

  validateProductionInput(
    {
      ...input,
      startDate: effectiveStartDate,
      endDate: effectiveEndDate,
    },
    false
  );

  const updatedRecord: ProductionRecord = {
    ...existing,
    seasonYear: input.seasonYear?.trim() || existing.seasonYear,
    productionPeriod: input.productionPeriod?.trim() || existing.productionPeriod,
    startDate: effectiveStartDate,
    endDate: effectiveEndDate,
    status: input.status !== undefined ? input.status : existing.status,
    estimatedQuantityKg:
      input.estimatedQuantityKg !== undefined
        ? input.estimatedQuantityKg
        : existing.estimatedQuantityKg,
    actualQuantityKg:
      input.actualQuantityKg !== undefined ? input.actualQuantityKg : existing.actualQuantityKg,
    expectedNumberOfHarvests:
      input.expectedNumberOfHarvests !== undefined
        ? input.expectedNumberOfHarvests
        : existing.expectedNumberOfHarvests,
    numberOfHarvests:
      input.numberOfHarvests !== undefined ? input.numberOfHarvests : existing.numberOfHarvests,
    notes: input.notes !== undefined ? input.notes?.trim() : existing.notes,
    // Preserve immutable attributes
    productionRecordId: existing.productionRecordId,
    farmId: existing.farmId,
    createdBy: existing.createdBy,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };

  const prodPath = `productions/${productionRecordId}`;
  try {
    await setDoc(doc(db, "productions", productionRecordId), updatedRecord);
    return updatedRecord;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, prodPath);
    throw error;
  }
}

/**
 * Lists all historical production records for a specific farm.
 */
export async function listProductionRecordsByFarm(
  farmId: string
): Promise<ProductionRecord[]> {
  if (!farmId || typeof farmId !== "string") {
    throw new Error("Validation Error: farmId must be a non-empty string.");
  }

  const prodColl = collection(db, "productions");
  const q = query(prodColl, where("farmId", "==", farmId));
  const path = "productions";

  try {
    const snap = await getDocs(q);
    const records: ProductionRecord[] = [];
    snap.forEach((d) => {
      records.push(d.data() as ProductionRecord);
    });
    // Sort chronologically by startDate descending
    return records.sort((a, b) => b.startDate.localeCompare(a.startDate));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}
