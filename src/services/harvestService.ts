/**
 * Harvest Service
 * Cocoa Traceability, Certificate & Cross-Border Export Platform
 *
 * Responsibilities:
 * - Manages harvest records linked to a specific farm and production record.
 * - Enforces the strict upstream hierarchy: Farm -> Production Record -> Harvest.
 * - Validates harvest quantities, dates, and quality grades.
 * - Validates date consistency against the parent Production Record season:
 *   - harvestDate >= productionRecord.startDate
 *   - harvestDate <= productionRecord.endDate (if defined)
 * - Derives and protects user identity: userId = Firebase Authentication UID.
 * - Prohibits UID impersonation.
 * - Synchronizes ProductionRecord.actualQuantityKg and numberOfHarvests via atomic
 *   Firestore transactions during creation and updates:
 *   - On create: adds harvest quantity to actualQuantityKg and increments numberOfHarvests.
 *   - On update: applies the delta (newQuantity - oldQuantity) to actualQuantityKg.
 *   - On non-quantity update: production totals remain unchanged.
 *   - When updating: numberOfHarvests never increases.
 *   - If archived: excluded from active production totals.
 * - Preserves historical harvest events for immutable traceability lineage.
 * - Idempotent harvest creation.
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
import { Harvest, HarvestStatus, CocoaQualityGrade, ProductionRecord } from "@/types/traceability";
import { resolveAuthenticatedUserUid } from "./productionService";

export interface CreateHarvestInput {
  harvestId?: string; // Optional idempotency key / custom ID
  productionRecordId: string;
  farmId: string;
  harvestDate: string;
  quantityKg: number;
  qualityGrade?: CocoaQualityGrade;
  status?: HarvestStatus;
  notes?: string;
  createdBy?: string; // Derived from Firebase Auth UID; caller cannot impersonate
}

export interface UpdateHarvestInput {
  harvestDate?: string;
  quantityKg?: number;
  qualityGrade?: CocoaQualityGrade;
  status?: HarvestStatus;
  notes?: string;
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
 * Validates that harvestDate falls within the parent production season.
 * - Must not be earlier than production startDate.
 * - Must not be later than production endDate (if endDate is defined).
 */
export function validateHarvestDateAgainstProduction(
  harvestDateStr: string,
  productionRecord: { startDate: string; endDate?: string }
): void {
  if (!isValidDateString(harvestDateStr)) {
    throw new Error(`Validation Error: harvestDate "${harvestDateStr}" is not a valid date.`);
  }

  const harvestTime = new Date(harvestDateStr).getTime();
  const prodStartTime = new Date(productionRecord.startDate).getTime();

  if (harvestTime < prodStartTime) {
    throw new Error(
      `Date Consistency Error: harvestDate (${harvestDateStr}) cannot be earlier than production startDate (${productionRecord.startDate}).`
    );
  }

  if (productionRecord.endDate) {
    const prodEndTime = new Date(productionRecord.endDate).getTime();
    if (harvestTime > prodEndTime) {
      throw new Error(
        `Date Consistency Error: harvestDate (${harvestDateStr}) cannot be later than production endDate (${productionRecord.endDate}).`
      );
    }
  }
}

/**
 * Pure calculation logic for updating production totals when a harvest is modified.
 * Used for transaction evaluation and unit testing.
 */
export function calculateUpdatedProductionTotals(
  currentTotals: { actualQuantityKg: number; numberOfHarvests: number },
  oldHarvest: { quantityKg: number; status?: string },
  updateInput: UpdateHarvestInput
): { actualQuantityKg: number; numberOfHarvests: number; quantityDelta: number; isChanged: boolean } {
  const oldQty = Number(oldHarvest.quantityKg);
  const newQty = updateInput.quantityKg !== undefined ? Number(updateInput.quantityKg) : oldQty;
  const quantityDelta = newQty - oldQty;

  const oldStatus = oldHarvest.status || "logged";
  const newStatus = updateInput.status !== undefined ? updateInput.status : oldStatus;
  const wasArchived = oldStatus === "archived";
  const isNowArchived = newStatus === "archived";

  let actualDelta = 0;
  let countDelta = 0;

  if (!wasArchived && isNowArchived) {
    // Harvest being archived: deduct its full quantity and decrement harvest count
    actualDelta = -oldQty;
    countDelta = -1;
  } else if (wasArchived && !isNowArchived) {
    // Harvest unarchived: add its new quantity and increment harvest count
    actualDelta = newQty;
    countDelta = 1;
  } else if (!isNowArchived) {
    // Harvest remains active: apply delta only, harvest count remains unchanged
    actualDelta = quantityDelta;
    countDelta = 0;
  }

  const updatedActual = Math.max(0, currentTotals.actualQuantityKg + actualDelta);
  const updatedCount = Math.max(0, currentTotals.numberOfHarvests + countDelta);
  const isChanged = actualDelta !== 0 || countDelta !== 0;

  return {
    actualQuantityKg: updatedActual,
    numberOfHarvests: updatedCount,
    quantityDelta,
    isChanged,
  };
}

/**
 * Validates basic harvest input parameters.
 */
export function validateHarvestInput(
  input: CreateHarvestInput | UpdateHarvestInput,
  isCreate: boolean
): void {
  if (isCreate) {
    const createInput = input as CreateHarvestInput;
    if (!createInput.farmId || typeof createInput.farmId !== "string" || !createInput.farmId.trim()) {
      throw new Error("Validation Error: farmId is required and must be a non-empty string.");
    }
    if (
      !createInput.productionRecordId ||
      typeof createInput.productionRecordId !== "string" ||
      !createInput.productionRecordId.trim()
    ) {
      throw new Error("Validation Error: productionRecordId is required and must be a non-empty string.");
    }
    if (!createInput.harvestDate || !isValidDateString(createInput.harvestDate)) {
      throw new Error(`Validation Error: harvestDate is required and must be a valid date.`);
    }
    if (
      typeof createInput.quantityKg !== "number" ||
      isNaN(createInput.quantityKg) ||
      !isFinite(createInput.quantityKg) ||
      createInput.quantityKg <= 0
    ) {
      throw new Error(
        `Validation Error: Invalid harvest quantity (${createInput.quantityKg}). Must be a positive finite number greater than 0.`
      );
    }

    // Verify identity integrity
    resolveAuthenticatedUserUid(createInput.createdBy);
  }

  // Common updates validation
  if (input.harvestDate && !isValidDateString(input.harvestDate)) {
    throw new Error(`Validation Error: Invalid harvestDate "${input.harvestDate}".`);
  }

  if (input.quantityKg !== undefined) {
    if (
      typeof input.quantityKg !== "number" ||
      isNaN(input.quantityKg) ||
      !isFinite(input.quantityKg) ||
      input.quantityKg <= 0
    ) {
      throw new Error(
        `Validation Error: Invalid harvest quantity (${input.quantityKg}). Must be a positive finite number greater than 0.`
      );
    }
  }
}

/**
 * Creates a new harvest record using an atomic Firestore transaction.
 * Validates:
 * 1. Farm exists.
 * 2. Production record exists.
 * 3. Production record belongs to the same farm.
 * 4. harvestDate falls within production period (startDate <= harvestDate <= endDate).
 * 5. Quantity is positive finite number.
 * 6. User identity is derived from authenticated Firebase UID.
 * 7. Atomically increments parent ProductionRecord.numberOfHarvests and adds quantityKg to actualQuantityKg.
 * Idempotent: If harvestId exists, returns existing record without duplicate accumulation.
 */
export async function createHarvestRecord(input: CreateHarvestInput): Promise<Harvest> {
  validateHarvestInput(input, true);

  const createdBy = resolveAuthenticatedUserUid(input.createdBy);
  const farmId = input.farmId.trim();
  const productionRecordId = input.productionRecordId.trim();
  const harvestId =
    input.harvestId?.trim() ||
    `harv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const farmRef = doc(db, "farms", farmId);
  const prodRef = doc(db, "productions", productionRecordId);
  const harvestDocRef = doc(db, "harvests", harvestId);
  const now = new Date().toISOString();

  let createdHarvest: Harvest | null = null;

  try {
    await runTransaction(db, async (transaction) => {
      // 1. Verify Farm exists
      const farmSnap = await transaction.get(farmRef);
      if (!farmSnap.exists()) {
        throw new Error(
          `Farm Verification Failed: Farm with ID "${farmId}" does not exist. Cannot create harvest.`
        );
      }

      // 2. Verify Production Record exists
      const prodSnap = await transaction.get(prodRef);
      if (!prodSnap.exists()) {
        throw new Error(
          `Production Verification Failed: Production record with ID "${productionRecordId}" does not exist. Cannot create harvest.`
        );
      }

      const productionRecord = prodSnap.data() as ProductionRecord;

      // 3. Verify Production Record belongs to the same farm
      if (productionRecord.farmId !== farmId) {
        throw new Error(
          `Relational Mismatch Error: Production record "${productionRecordId}" belongs to farm "${productionRecord.farmId}", not "${farmId}".`
        );
      }

      // 4. Validate harvestDate against parent Production Record's startDate and endDate
      validateHarvestDateAgainstProduction(input.harvestDate, productionRecord);

      // 5. Check if harvest already exists (idempotency support)
      const existingSnap = await transaction.get(harvestDocRef);
      if (existingSnap.exists()) {
        createdHarvest = existingSnap.data() as Harvest;
        return;
      }

      const initialStatus = input.status || "logged";
      const harvestQty = Number(input.quantityKg);

      createdHarvest = {
        harvestId,
        productionRecordId,
        farmId,
        harvestDate: input.harvestDate.trim(),
        quantityKg: harvestQty,
        qualityGrade: input.qualityGrade,
        status: initialStatus,
        notes: input.notes?.trim(),
        createdBy,
        createdAt: now,
        updatedAt: now,
      };

      transaction.set(harvestDocRef, createdHarvest);

      // If harvest is active (not archived), atomically update parent ProductionRecord totals
      if (initialStatus !== "archived") {
        const currentActual = productionRecord.actualQuantityKg || 0;
        const currentHarvests = productionRecord.numberOfHarvests || 0;
        transaction.update(prodRef, {
          actualQuantityKg: currentActual + harvestQty,
          numberOfHarvests: currentHarvests + 1,
          updatedAt: now,
        });
      }
    });

    if (!createdHarvest) {
      throw new Error(`Failed to create harvest "${harvestId}".`);
    }

    return createdHarvest;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `harvests/${harvestId}`);
    throw error;
  }
}

/**
 * Retrieves a single harvest record by its ID.
 */
export async function getHarvestRecord(harvestId: string): Promise<Harvest | null> {
  if (!harvestId || typeof harvestId !== "string" || !harvestId.trim()) {
    throw new Error("Validation Error: harvestId must be a non-empty string.");
  }

  const cleanHarvestId = harvestId.trim();
  const harvestPath = `harvests/${cleanHarvestId}`;
  try {
    const docSnap = await getDoc(doc(db, "harvests", cleanHarvestId));
    if (!docSnap.exists()) {
      return null;
    }
    return docSnap.data() as Harvest;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, harvestPath);
    return null;
  }
}

/**
 * Updates an existing harvest record using an atomic Firestore transaction.
 * Guarantees:
 * - If harvest quantity changes: applies delta (newQty - oldQty) to ProductionRecord.actualQuantityKg.
 *   Does NOT add new quantity on top of old quantity.
 * - If non-quantity fields change (notes, qualityGrade): ProductionRecord totals remain unchanged.
 * - numberOfHarvests NEVER increases when an existing harvest is updated.
 * - If status changes to/from "archived": adjusts active production totals accordingly.
 * - Preserves createdAt, farmId, productionRecordId, and createdBy.
 */
export async function updateHarvestRecord(
  harvestId: string,
  input: UpdateHarvestInput
): Promise<Harvest> {
  if (!harvestId || typeof harvestId !== "string" || !harvestId.trim()) {
    throw new Error("Validation Error: harvestId must be a non-empty string.");
  }

  validateHarvestInput(input, false);

  const cleanHarvestId = harvestId.trim();
  const harvestDocRef = doc(db, "harvests", cleanHarvestId);
  const now = new Date().toISOString();

  let updatedRecord: Harvest | null = null;

  try {
    await runTransaction(db, async (transaction) => {
      const harvestSnap = await transaction.get(harvestDocRef);
      if (!harvestSnap.exists()) {
        throw new Error(`Harvest with ID "${cleanHarvestId}" does not exist.`);
      }

      const existing = harvestSnap.data() as Harvest;
      const prodRef = doc(db, "productions", existing.productionRecordId);
      const prodSnap = await transaction.get(prodRef);

      let prodRecord: ProductionRecord | null = null;
      if (prodSnap.exists()) {
        prodRecord = prodSnap.data() as ProductionRecord;
      }

      // If harvestDate changed, cross-check against parent production record
      const effectiveHarvestDate = input.harvestDate?.trim() || existing.harvestDate;
      if (prodRecord && input.harvestDate && input.harvestDate !== existing.harvestDate) {
        validateHarvestDateAgainstProduction(effectiveHarvestDate, prodRecord);
      }

      const newQty = input.quantityKg !== undefined ? Number(input.quantityKg) : existing.quantityKg;
      const newStatus = input.status !== undefined ? input.status : existing.status;

      // Calculate production total updates using atomic helper logic
      if (prodRecord) {
        const currentTotals = {
          actualQuantityKg: prodRecord.actualQuantityKg || 0,
          numberOfHarvests: prodRecord.numberOfHarvests || 0,
        };

        const result = calculateUpdatedProductionTotals(currentTotals, existing, input);

        if (result.isChanged) {
          transaction.update(prodRef, {
            actualQuantityKg: result.actualQuantityKg,
            numberOfHarvests: result.numberOfHarvests,
            updatedAt: now,
          });
        }
      }

      updatedRecord = {
        ...existing,
        harvestDate: effectiveHarvestDate,
        quantityKg: newQty,
        qualityGrade: input.qualityGrade !== undefined ? input.qualityGrade : existing.qualityGrade,
        status: newStatus,
        notes: input.notes !== undefined ? input.notes?.trim() : existing.notes,
        // Preserve immutable attributes
        harvestId: existing.harvestId,
        productionRecordId: existing.productionRecordId,
        farmId: existing.farmId,
        createdBy: existing.createdBy,
        createdAt: existing.createdAt,
        updatedAt: now,
      };

      transaction.set(harvestDocRef, updatedRecord);
    });

    if (!updatedRecord) {
      throw new Error(`Failed to update harvest "${cleanHarvestId}".`);
    }

    return updatedRecord;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `harvests/${cleanHarvestId}`);
    throw error;
  }
}

/**
 * Lists all harvests associated with a specific production record.
 */
export async function listHarvestsByProductionRecord(
  productionRecordId: string
): Promise<Harvest[]> {
  if (!productionRecordId || typeof productionRecordId !== "string" || !productionRecordId.trim()) {
    throw new Error("Validation Error: productionRecordId must be a non-empty string.");
  }

  const cleanProdId = productionRecordId.trim();
  const harvestColl = collection(db, "harvests");
  const q = query(harvestColl, where("productionRecordId", "==", cleanProdId));
  const path = "harvests";

  try {
    const snap = await getDocs(q);
    const records: Harvest[] = [];
    snap.forEach((d) => {
      records.push(d.data() as Harvest);
    });
    return records.sort((a, b) => b.harvestDate.localeCompare(a.harvestDate));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

/**
 * Lists all harvests associated with a farm across all production seasons.
 */
export async function listHarvestsByFarm(farmId: string): Promise<Harvest[]> {
  if (!farmId || typeof farmId !== "string" || !farmId.trim()) {
    throw new Error("Validation Error: farmId must be a non-empty string.");
  }

  const cleanFarmId = farmId.trim();
  const harvestColl = collection(db, "harvests");
  const q = query(harvestColl, where("farmId", "==", cleanFarmId));
  const path = "harvests";

  try {
    const snap = await getDocs(q);
    const records: Harvest[] = [];
    snap.forEach((d) => {
      records.push(d.data() as Harvest);
    });
    return records.sort((a, b) => b.harvestDate.localeCompare(a.harvestDate));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}
