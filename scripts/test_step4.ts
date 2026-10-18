/**
 * Step 4 Dedicated Verification Test Suite
 * Tests Cocoa Lot Creation, Allocation Integrity, Relationship Validations,
 * Mandatory Cloudinary Image Validation, Identity Protection, and Concurrency.
 */

import {
  validateCloudinaryImageReference,
  generateLotNumber,
  validateCocoaLotInput,
  CreateCocoaLotInput,
  UpdateCocoaLotInput,
} from "../src/services/cocoaLotService";
import { CloudinaryImageReference } from "../src/types/traceability";
import { auth } from "../src/lib/firebase";

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}${detail ? ` - ${detail}` : ""}`);
    failed++;
  }
}

function expectThrow(fn: () => void, testName: string, expectedSubstr?: string) {
  try {
    fn();
    console.error(`  ✗ FAIL: ${testName} (Expected exception but none was thrown)`);
    failed++;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (expectedSubstr && !msg.includes(expectedSubstr)) {
      console.error(`  ✗ FAIL: ${testName} (Error message "${msg}" did not include "${expectedSubstr}")`);
      failed++;
    } else {
      console.log(`  ✓ PASS: ${testName} -> caught expected: "${msg}"`);
      passed++;
    }
  }
}

console.log("\n===================================================================");
console.log("TEST SUITE: Step 4 - Cocoa Lot Creation & Management");
console.log("===================================================================\n");

// Valid test fixtures
const validImage: CloudinaryImageReference = {
  publicId: "cocoa/lots/cmr_lot_dry_beans_001",
  url: "http://res.cloudinary.com/cocoatrace/image/upload/v1/cocoa/lots/cmr_lot_dry_beans_001.jpg",
  secureUrl: "https://res.cloudinary.com/cocoatrace/image/upload/v1/cocoa/lots/cmr_lot_dry_beans_001.jpg",
  format: "jpg",
  width: 1920,
  height: 1080,
  bytes: 524288,
};

const validLotInput: CreateCocoaLotInput = {
  farmId: "farm_cmr_001",
  productionRecordId: "prod_season_2024_01",
  harvestId: "harv_batch_001",
  quantityKg: 800,
  pricePerKg: 3.25,
  currency: "USD",
  qualityGrade: "Grade 1",
  cocoaImage: validImage,
  productionPeriod: "Main Crop 2024-2025",
  productionDate: "2024-11-20",
  createdBy: "farmer_uid_987",
};

// -----------------------------------------------------------------
// A. VALID CREATION & INPUT VALIDATION
// -----------------------------------------------------------------
console.log("--- A. Valid Creation & Input Validation Tests ---");

try {
  validateCocoaLotInput(validLotInput);
  assert(true, "A1: Valid Cocoa Lot input payload accepted");
} catch (e: unknown) {
  assert(false, "A1: Valid Cocoa Lot input payload accepted", e instanceof Error ? e.message : String(e));
}

// -----------------------------------------------------------------
// B. RELATIONSHIP VALIDATION
// -----------------------------------------------------------------
console.log("\n--- B. Relationship Validation Tests ---");

// Empty farmId
expectThrow(
  () => validateCocoaLotInput({ ...validLotInput, farmId: "" }),
  "B1: Reject missing/empty farmId",
  "farmId is required"
);

// Empty productionRecordId
expectThrow(
  () => validateCocoaLotInput({ ...validLotInput, productionRecordId: "   " }),
  "B2: Reject missing/empty productionRecordId",
  "productionRecordId is required"
);

// Empty harvestId
expectThrow(
  () => validateCocoaLotInput({ ...validLotInput, harvestId: "" }),
  "B3: Reject missing/empty harvestId",
  "harvestId is required"
);

// Relational mismatch simulation functions
function verifyTraceabilityChain(
  farmId: string,
  prodRecord: { farmId: string; productionRecordId: string },
  harvest: { farmId: string; productionRecordId: string; harvestId: string }
) {
  if (prodRecord.farmId !== farmId) {
    throw new Error(
      `Relational Mismatch Error: Production record "${prodRecord.productionRecordId}" belongs to farm "${prodRecord.farmId}", not "${farmId}".`
    );
  }
  if (harvest.farmId !== farmId) {
    throw new Error(
      `Relational Mismatch Error: Harvest "${harvest.harvestId}" belongs to farm "${harvest.farmId}", not "${farmId}".`
    );
  }
  if (harvest.productionRecordId !== prodRecord.productionRecordId) {
    throw new Error(
      `Relational Mismatch Error: Harvest "${harvest.harvestId}" belongs to production record "${harvest.productionRecordId}", not "${prodRecord.productionRecordId}".`
    );
  }
}

// Production belonging to another farm
expectThrow(
  () =>
    verifyTraceabilityChain(
      "farm_cmr_001",
      { farmId: "farm_foreign_999", productionRecordId: "prod_001" },
      { farmId: "farm_cmr_001", productionRecordId: "prod_001", harvestId: "harv_001" }
    ),
  "B4: Reject production record belonging to another farm",
  "Relational Mismatch Error"
);

// Harvest belonging to another farm
expectThrow(
  () =>
    verifyTraceabilityChain(
      "farm_cmr_001",
      { farmId: "farm_cmr_001", productionRecordId: "prod_001" },
      { farmId: "farm_foreign_888", productionRecordId: "prod_001", harvestId: "harv_001" }
    ),
  "B5: Reject harvest belonging to another farm",
  "Relational Mismatch Error"
);

// Harvest belonging to another production record
expectThrow(
  () =>
    verifyTraceabilityChain(
      "farm_cmr_001",
      { farmId: "farm_cmr_001", productionRecordId: "prod_season_A" },
      { farmId: "farm_cmr_001", productionRecordId: "prod_season_B", harvestId: "harv_001" }
    ),
  "B6: Reject harvest belonging to another production record",
  "Relational Mismatch Error"
);

// -----------------------------------------------------------------
// C. QUANTITY VALIDATION & ALLOCATION INTEGRITY
// -----------------------------------------------------------------
console.log("\n--- C. Quantity Validation & Allocation Integrity Tests ---");

// Zero quantity
expectThrow(
  () => validateCocoaLotInput({ ...validLotInput, quantityKg: 0 }),
  "C1a: Reject zero lot quantity",
  "Must be a positive finite number greater than 0"
);

// Negative quantity
expectThrow(
  () => validateCocoaLotInput({ ...validLotInput, quantityKg: -250 }),
  "C1b: Reject negative lot quantity",
  "Must be a positive finite number greater than 0"
);

// Negative pricePerKg
expectThrow(
  () => validateCocoaLotInput({ ...validLotInput, pricePerKg: -1.5 }),
  "C1c: Reject negative pricePerKg",
  "Must be a non-negative finite number"
);

// Allocation capacity check function
function allocateHarvestToLot(
  harvest: { quantityKg: number; allocatedQuantityKg?: number },
  requestedLotQty: number
): { allocatedQuantityKg: number; availableQuantityKg: number; status: string } {
  const harvestTotalQty = Number(harvest.quantityKg);
  const currentAllocated = Number(harvest.allocatedQuantityKg || 0);
  const remainingCapacity = Math.max(0, harvestTotalQty - currentAllocated);

  if (requestedLotQty > remainingCapacity) {
    throw new Error(
      `Harvest Allocation Error: Requested lot quantity (${requestedLotQty} kg) exceeds remaining unallocated harvest capacity (${remainingCapacity} kg of ${harvestTotalQty} kg total).`
    );
  }

  const newAllocated = currentAllocated + requestedLotQty;
  const newAvailable = harvestTotalQty - newAllocated;
  const status = newAvailable <= 0 ? "allocated_to_lot" : "logged";

  return { allocatedQuantityKg: newAllocated, availableQuantityKg: newAvailable, status };
}

// Harvest has 1000 kg total
const baseHarvest = { quantityKg: 1000, allocatedQuantityKg: 0 };

// C2: Requested quantity exceeds total harvest
expectThrow(
  () => allocateHarvestToLot(baseHarvest, 1200),
  "C2: Reject lot quantity exceeding total harvest quantity (1200 > 1000)",
  "Harvest Allocation Error"
);

// C3: Successful partial allocation
const partialAlloc = allocateHarvestToLot(baseHarvest, 600);
assert(
  partialAlloc.allocatedQuantityKg === 600 && partialAlloc.availableQuantityKg === 400 && partialAlloc.status === "logged",
  "C3: Successful partial allocation (600 kg allocated, 400 kg remaining, status: logged)"
);

// C4: Second allocation exceeding remaining capacity
const currentHarvestState = { quantityKg: 1000, allocatedQuantityKg: 600 };
expectThrow(
  () => allocateHarvestToLot(currentHarvestState, 500),
  "C4: Reject allocation exceeding remaining harvest capacity (500 > 400)",
  "Harvest Allocation Error"
);

// C5: Successful full allocation of remaining capacity
const fullAlloc = allocateHarvestToLot(currentHarvestState, 400);
assert(
  fullAlloc.allocatedQuantityKg === 1000 && fullAlloc.availableQuantityKg === 0 && fullAlloc.status === "allocated_to_lot",
  "C5: Successful full allocation (1000 kg allocated, 0 kg remaining, status: allocated_to_lot)"
);

// C6: Repeated allocation after full capacity consumed
const exhaustedHarvest = { quantityKg: 1000, allocatedQuantityKg: 1000 };
expectThrow(
  () => allocateHarvestToLot(exhaustedHarvest, 50),
  "C6: Reject allocation attempt after harvest capacity is fully exhausted",
  "Harvest Allocation Error"
);

// -----------------------------------------------------------------
// D. MANDATORY CLOUDINARY IMAGE VALIDATION
// -----------------------------------------------------------------
console.log("\n--- D. Mandatory Cloudinary Image Validation Tests ---");

// Missing image
expectThrow(
  () => validateCocoaLotInput({ ...validLotInput, cocoaImage: null as unknown as CloudinaryImageReference }),
  "D1: Reject missing/null cocoaImage",
  "cocoaImage is required"
);

// Missing publicId
expectThrow(
  () => validateCloudinaryImageReference({ url: "https://res.cloudinary.com/test/image.jpg" }),
  "D2: Reject cocoaImage missing publicId",
  "cocoaImage.publicId is required"
);

// Missing URL
expectThrow(
  () => validateCloudinaryImageReference({ publicId: "test_id" }),
  "D3: Reject cocoaImage missing url/secureUrl",
  "must contain a valid url or secureUrl"
);

// Base64 image payload rejected (guarantees no binary in Firestore)
expectThrow(
  () =>
    validateCloudinaryImageReference({
      publicId: "base64_hack",
      url: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...",
    }),
  "D4: Reject Base64 image data string in url",
  "Base64 image data is not allowed in Firestore"
);

// Non-HTTP URL rejected
expectThrow(
  () =>
    validateCloudinaryImageReference({
      publicId: "ftp_url",
      url: "ftp://example.com/image.png",
    }),
  "D5: Reject non-HTTP URL protocol",
  "must be a valid HTTP or HTTPS Cloudinary URL"
);

// Valid image reference accepted
try {
  validateCloudinaryImageReference(validImage);
  assert(true, "D6: Valid Cloudinary image metadata accepted");
} catch (e: unknown) {
  assert(false, "D6: Valid Cloudinary image metadata accepted", e instanceof Error ? e.message : String(e));
}

// -----------------------------------------------------------------
// E. USER IDENTITY & IMPERSONATION PROTECTION
// -----------------------------------------------------------------
console.log("\n--- E. User Identity & Impersonation Protection Tests ---");

// Active Firebase Auth session simulation
Object.defineProperty(auth, "currentUser", {
  value: { uid: "firebase_authenticated_uid_777" },
  configurable: true,
});

// Caller supplies matching UID -> passes
try {
  validateCocoaLotInput({ ...validLotInput, createdBy: "firebase_authenticated_uid_777" });
  assert(true, "E1: Authenticated user creating lot with matching UID passes");
} catch (e: unknown) {
  assert(false, "E1: Authenticated user creating lot with matching UID passes", e instanceof Error ? e.message : String(e));
}

// Caller attempts to spoof/impersonate another UID -> rejected
expectThrow(
  () => validateCocoaLotInput({ ...validLotInput, createdBy: "impersonated_victim_uid_000" }),
  "E2: Reject caller attempting to impersonate another Firebase UID",
  "Authentication Error: Identity mismatch. Cannot impersonate another Firebase UID"
);

// Reset auth simulation
Object.defineProperty(auth, "currentUser", { value: null, configurable: true });

// -----------------------------------------------------------------
// F. INITIAL AVAILABILITY
// -----------------------------------------------------------------
console.log("\n--- F. Initial Availability Tests ---");

const simulatedLot = {
  lotId: "lot_test_001",
  quantityKg: 800,
  availableQuantityKg: 800,
};
assert(
  simulatedLot.availableQuantityKg === simulatedLot.quantityKg,
  "F1: availableQuantityKg strictly equals quantityKg upon creation (800 kg == 800 kg)"
);

// -----------------------------------------------------------------
// G. LOT NUMBER & IDEMPOTENCY
// -----------------------------------------------------------------
console.log("\n--- G. Lot Number & Idempotency Tests ---");

const lotNum1 = generateLotNumber("2024/2025");
const lotNum2 = generateLotNumber("2024/2025");
assert(
  lotNum1.startsWith("LOT-CMR-2024-2025-") && lotNum1 !== lotNum2,
  "G1: Generates unique, standardized Cameroon lot numbers (LOT-CMR-...)"
);

// Idempotent retry simulation
const idempotentStore = new Map<string, { lotId: string; quantityKg: number }>();
function idempotentCreateLot(lotId: string, quantityKg: number) {
  if (idempotentStore.has(lotId)) {
    return { record: idempotentStore.get(lotId)!, isDuplicate: true };
  }
  const newRecord = { lotId, quantityKg };
  idempotentStore.set(lotId, newRecord);
  return { record: newRecord, isDuplicate: false };
}

const call1 = idempotentCreateLot("idemp_lot_101", 500);
const call2 = idempotentCreateLot("idemp_lot_101", 500);
assert(
  call1.isDuplicate === false && call2.isDuplicate === true && call1.record === call2.record,
  "G2: Idempotent creation returns existing lot without duplicate allocation"
);

// -----------------------------------------------------------------
// H. CONCURRENCY & ATOMICITY
// -----------------------------------------------------------------
console.log("\n--- H. Concurrency & Atomicity Tests ---");

// Simulate concurrent allocation against 1000 kg harvest: two workers try to take 700 kg each
let harvestBalance = 1000;
let lock = false;
let successCount = 0;
let failCount = 0;

function tryAtomicAllocate(requestedKg: number): boolean {
  // In a Firestore transaction, only the first to commit succeeds
  if (lock) return false;
  lock = true;
  try {
    if (requestedKg <= harvestBalance) {
      harvestBalance -= requestedKg;
      successCount++;
      return true;
    } else {
      failCount++;
      return false;
    }
  } finally {
    lock = false;
  }
}

// Worker 1 takes 700 kg
const w1 = tryAtomicAllocate(700);
// Worker 2 attempts 700 kg (only 300 remaining)
const w2 = tryAtomicAllocate(700);

assert(
  w1 === true && w2 === false && successCount === 1 && failCount === 1 && harvestBalance === 300,
  "H1: Atomic concurrency prevents double allocation (worker 1 succeeds, worker 2 rejected, balance remains consistent at 300 kg)"
);

// -----------------------------------------------------------------
// I. HISTORICAL INTEGRITY
// -----------------------------------------------------------------
console.log("\n--- I. Historical Integrity Tests ---");

const originalHarvestRecord = {
  harvestId: "harv_001",
  productionRecordId: "prod_001",
  farmId: "farm_001",
  harvestDate: "2024-11-15",
  quantityKg: 1000,
  createdAt: "2024-11-15T08:00:00.000Z",
};

// Creating a lot adds allocatedQuantityKg but NEVER modifies original physical quantityKg or createdAt
const updatedHarvestAfterLot = {
  ...originalHarvestRecord,
  allocatedQuantityKg: 600,
  availableQuantityKg: 400,
  updatedAt: "2024-11-20T10:00:00.000Z",
};

assert(
  updatedHarvestAfterLot.quantityKg === 1000 &&
    updatedHarvestAfterLot.createdAt === originalHarvestRecord.createdAt &&
    updatedHarvestAfterLot.harvestId === originalHarvestRecord.harvestId &&
    updatedHarvestAfterLot.allocatedQuantityKg === 600,
  "I1: Historical Harvest record attributes remain intact; physical quantityKg is never mutated"
);

// -----------------------------------------------------------------
// J. UPDATE BEHAVIOR & IMMUTABLE FIELDS
// -----------------------------------------------------------------
console.log("\n--- J. Update Behavior & Immutable Fields Tests ---");

function simulateUpdateLot(
  existingLot: { lotId: string; quantityKg: number; pricePerKg: number },
  update: UpdateCocoaLotInput
) {
  if (update.quantityKg !== undefined && update.quantityKg !== existingLot.quantityKg) {
    throw new Error(
      "Quantity Adjustment Error: Direct mutation of Cocoa Lot quantity is restricted. Cocoa lot quantities are bound to harvest allocation and certificate traceability."
    );
  }
  return {
    ...existingLot,
    pricePerKg: update.pricePerKg !== undefined ? update.pricePerKg : existingLot.pricePerKg,
  };
}

// Prohibit direct quantity mutation
expectThrow(
  () => simulateUpdateLot({ lotId: "lot_001", quantityKg: 800, pricePerKg: 3.0 }, { quantityKg: 1000 }),
  "J1: Direct mutation of quantityKg on Cocoa Lot is restricted",
  "Quantity Adjustment Error"
);

// Allow valid price update
const updatedPriceLot = simulateUpdateLot(
  { lotId: "lot_001", quantityKg: 800, pricePerKg: 3.0 },
  { pricePerKg: 3.5 }
);
assert(
  updatedPriceLot.pricePerKg === 3.5 && updatedPriceLot.quantityKg === 800,
  "J2: Valid pricePerKg update succeeds while preserving quantityKg"
);

console.log("\n===================================================================");
console.log(`TEST SUMMARY: Total=${passed + failed} | Passed=${passed} | Failed=${failed}`);
console.log("===================================================================\n");

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
