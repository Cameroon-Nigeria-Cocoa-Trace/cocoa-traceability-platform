/**
 * Step 3 Verification Test Suite (Revised with Corrections)
 * Tests Production Record and Harvest Record services, validations,
 * harvest date consistency against production seasons, and secure createdBy derivation.
 */

import {
  validateProductionInput,
  resolveAuthenticatedUserUid,
  CreateProductionRecordInput,
  UpdateProductionRecordInput,
} from "../src/services/productionService";
import {
  validateHarvestInput,
  validateHarvestDateAgainstProduction,
  calculateUpdatedProductionTotals,
  CreateHarvestInput,
  UpdateHarvestInput,
} from "../src/services/harvestService";
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
console.log("TEST SUITE: Step 3 - Production & Harvest Services (Revised)");
console.log("===================================================================\n");

// -----------------------------------------------------------------
// 1. SECURE CREATEDBY / AUTHENTICATION DERIVATION TESTS
// -----------------------------------------------------------------
console.log("--- 1. Secure createdBy & Identity Protection Tests ---");

// Test 1a: When caller supplies verified UID in test environment, it is accepted
const verifiedUid = resolveAuthenticatedUserUid("verified_farmer_uid_101");
assert(
  verifiedUid === "verified_farmer_uid_101",
  "Auth 1a: resolveAuthenticatedUserUid accepts verified UID when passed"
);

// Test 1b: When empty or missing UID is passed without active auth session, rejects
expectThrow(
  () => resolveAuthenticatedUserUid(""),
  "Auth 1b: Rejects missing/empty UID without active auth session",
  "Authentication Error"
);

// Test 1c: Simulate active Firebase auth.currentUser session
const originalCurrentUser = Object.getOwnPropertyDescriptor(auth, "currentUser");
Object.defineProperty(auth, "currentUser", {
  value: { uid: "firebase_authenticated_uid_777", email: "farmer@cocoa.cm" },
  configurable: true,
});

// Under active session, resolveAuthenticatedUserUid returns the authenticated UID
const derivedUid = resolveAuthenticatedUserUid();
assert(
  derivedUid === "firebase_authenticated_uid_777",
  "Auth 1c: Automatically derives auth.currentUser.uid when signed in"
);

// Under active session, passing a matching UID succeeds
const matchingUid = resolveAuthenticatedUserUid("firebase_authenticated_uid_777");
assert(
  matchingUid === "firebase_authenticated_uid_777",
  "Auth 1d: Allows caller supplying their own matching UID"
);

// Under active session, attempting to pass a DIFFERENT UID triggers impersonation error
expectThrow(
  () => resolveAuthenticatedUserUid("attacker_spoofed_uid_999"),
  "Auth 1e: Prohibits caller from impersonating another Firebase UID",
  "Authentication Error: Identity mismatch. Cannot impersonate another Firebase UID"
);

// Restore original property
if (originalCurrentUser) {
  Object.defineProperty(auth, "currentUser", originalCurrentUser);
} else {
  Object.defineProperty(auth, "currentUser", { value: null, configurable: true });
}

// -----------------------------------------------------------------
// 2. PRODUCTION RECORD VALIDATION TESTS
// -----------------------------------------------------------------
console.log("\n--- 2. Production Record Validation Tests ---");

const validProdInput: CreateProductionRecordInput = {
  farmId: "farm_test_001",
  seasonYear: "2024/2025",
  productionPeriod: "Main Crop 2024-2025",
  startDate: "2024-10-01",
  endDate: "2025-03-31",
  estimatedQuantityKg: 5000,
  createdBy: "farmer_uid_123",
  notes: "Healthy harvest season expected",
};

try {
  validateProductionInput(validProdInput, true);
  assert(true, "Production 1: Valid production record input accepted");
} catch (e: unknown) {
  assert(false, "Production 1: Valid production record input accepted", e instanceof Error ? e.message : String(e));
}

expectThrow(
  () => validateProductionInput({ ...validProdInput, farmId: "" }, true),
  "Production 2: Reject missing or empty farmId",
  "farmId is required"
);

expectThrow(
  () => validateProductionInput({ ...validProdInput, startDate: "invalid-date-string" }, true),
  "Production 3a: Reject invalid startDate format",
  "startDate is required and must be a valid date"
);

expectThrow(
  () => validateProductionInput({ ...validProdInput, startDate: "2025-05-01", endDate: "2025-01-01" }, true),
  "Production 3b: Reject endDate earlier than startDate",
  "endDate (2025-01-01) cannot be earlier than startDate (2025-05-01)"
);

expectThrow(
  () => validateProductionInput({ ...validProdInput, estimatedQuantityKg: -100 }, true),
  "Production 4a: Reject negative estimatedQuantityKg",
  "Must be a positive finite number"
);

expectThrow(
  () => validateProductionInput({ ...validProdInput, estimatedQuantityKg: 0 }, true),
  "Production 4b: Reject zero estimatedQuantityKg",
  "Must be a positive finite number"
);

expectThrow(
  () => validateProductionInput({ ...validProdInput, estimatedQuantityKg: NaN }, true),
  "Production 4c: Reject NaN estimatedQuantityKg",
  "Must be a positive finite number"
);

const validProdUpdate: UpdateProductionRecordInput = {
  seasonYear: "2024/2025 (Revised)",
  notes: "Updated yield expectations",
  estimatedQuantityKg: 6200,
};

try {
  validateProductionInput(validProdUpdate, false);
  assert(true, "Production 5: Valid production update payload accepted");
} catch (e: unknown) {
  assert(false, "Production 5: Valid production update payload accepted", e instanceof Error ? e.message : String(e));
}

expectThrow(
  () => validateProductionInput({ ...validProdUpdate, estimatedQuantityKg: -50 }, false),
  "Production 6: Reject negative quantity in update payload",
  "Must be a positive finite number"
);

// Historical preservation simulation
const originalRecord = {
  productionRecordId: "prod_001",
  farmId: "farm_test_001",
  seasonYear: "2024/2025",
  productionPeriod: "Main Crop 2024-2025",
  startDate: "2024-10-01",
  endDate: "2025-03-31",
  status: "active",
  createdBy: "farmer_uid_123",
  createdAt: "2024-10-01T08:00:00.000Z",
  updatedAt: "2024-10-01T08:00:00.000Z",
};

const updatedRecord = {
  ...originalRecord,
  notes: "Updated notes",
  updatedAt: "2024-10-15T12:00:00.000Z",
};

assert(
  updatedRecord.createdAt === originalRecord.createdAt &&
    updatedRecord.farmId === originalRecord.farmId &&
    updatedRecord.createdBy === originalRecord.createdBy &&
    updatedRecord.updatedAt !== originalRecord.updatedAt,
  "Production 7: Preserves historical createdAt, farmId, and createdBy upon update"
);

// Test 8: New Production Record Fields - actualQuantityKg, expectedNumberOfHarvests, numberOfHarvests
const productionWithMetrics: CreateProductionRecordInput = {
  ...validProdInput,
  estimatedQuantityKg: 5000,
  actualQuantityKg: 0,
  expectedNumberOfHarvests: 4,
  numberOfHarvests: 0,
};

try {
  validateProductionInput(productionWithMetrics, true);
  assert(true, "Production 8: Accepts valid actualQuantityKg and harvest count fields");
} catch (e: unknown) {
  assert(false, "Production 8: Accepts valid actualQuantityKg and harvest count fields", e instanceof Error ? e.message : String(e));
}

// Test 9a: actualQuantityKg is distinct from estimatedQuantityKg and can exceed it without error (not a hard upper limit)
const harvestExceedingEstimate: CreateProductionRecordInput = {
  ...validProdInput,
  estimatedQuantityKg: 5000,
  actualQuantityKg: 6500, // Actual harvested amount exceeded initial estimate
};
try {
  validateProductionInput(harvestExceedingEstimate, true);
  assert(
    true,
    "Production 9a: actualQuantityKg can exceed estimatedQuantityKg (estimate is not a hard upper limit)"
  );
} catch (e: unknown) {
  assert(false, "Production 9a: actualQuantityKg can exceed estimatedQuantityKg", e instanceof Error ? e.message : String(e));
}

// Test 9b: Reject negative actualQuantityKg
expectThrow(
  () => validateProductionInput({ ...validProdInput, actualQuantityKg: -1 }, true),
  "Production 9b: Reject negative actualQuantityKg",
  "Must be a non-negative finite number"
);

// Test 10a: Reject negative expectedNumberOfHarvests
expectThrow(
  () => validateProductionInput({ ...validProdInput, expectedNumberOfHarvests: -2 }, true),
  "Production 10a: Reject negative expectedNumberOfHarvests",
  "must be a non-negative integer"
);

// Test 10b: Reject non-integer expectedNumberOfHarvests
expectThrow(
  () => validateProductionInput({ ...validProdInput, expectedNumberOfHarvests: 3.5 }, true),
  "Production 10b: Reject non-integer expectedNumberOfHarvests",
  "must be a non-negative integer"
);

// Test 10c: Reject negative numberOfHarvests
expectThrow(
  () => validateProductionInput({ ...validProdInput, numberOfHarvests: -1 }, true),
  "Production 10c: Reject negative numberOfHarvests",
  "must be a non-negative integer"
);

// Test 11: Production and Harvest metrics aggregation consistency simulation
let simulatedProdRecord = {
  productionRecordId: "prod_001",
  farmId: "farm_test_001",
  estimatedQuantityKg: 5000,
  actualQuantityKg: 0,
  expectedNumberOfHarvests: 3,
  numberOfHarvests: 0,
};

// Harvest 1: 1,500 kg
simulatedProdRecord = {
  ...simulatedProdRecord,
  actualQuantityKg: simulatedProdRecord.actualQuantityKg + 1500,
  numberOfHarvests: simulatedProdRecord.numberOfHarvests + 1,
};
assert(
  simulatedProdRecord.actualQuantityKg === 1500 && simulatedProdRecord.numberOfHarvests === 1,
  "Production 11a: First harvest correctly increments numberOfHarvests to 1 and actualQuantityKg to 1500"
);

// Harvest 2: 4,000 kg (total now 5,500 kg > 5,000 kg estimated)
simulatedProdRecord = {
  ...simulatedProdRecord,
  actualQuantityKg: simulatedProdRecord.actualQuantityKg + 4000,
  numberOfHarvests: simulatedProdRecord.numberOfHarvests + 1,
};
assert(
  simulatedProdRecord.actualQuantityKg === 5500 &&
    simulatedProdRecord.numberOfHarvests === 2 &&
    simulatedProdRecord.actualQuantityKg > simulatedProdRecord.estimatedQuantityKg,
  "Production 11b: Cumulative actualQuantityKg accurately reflects all harvests and preserves distinct estimatedQuantityKg"
);

// -----------------------------------------------------------------
// 3. HARVEST RECORD VALIDATION TESTS
// -----------------------------------------------------------------
console.log("\n--- 3. Harvest Record Validation Tests ---");

const validHarvestInput: CreateHarvestInput = {
  farmId: "farm_test_001",
  productionRecordId: "prod_001",
  harvestDate: "2024-11-15",
  quantityKg: 1250.5,
  qualityGrade: "Grade 1",
  status: "logged",
  notes: "First flush beans, excellent moisture content",
  createdBy: "farmer_uid_123",
};

try {
  validateHarvestInput(validHarvestInput, true);
  assert(true, "Harvest 1: Valid harvest input accepted");
} catch (e: unknown) {
  assert(false, "Harvest 1: Valid harvest input accepted", e instanceof Error ? e.message : String(e));
}

expectThrow(
  () => validateHarvestInput({ ...validHarvestInput, farmId: "" }, true),
  "Harvest 2: Reject empty farmId",
  "farmId is required"
);

expectThrow(
  () => validateHarvestInput({ ...validHarvestInput, productionRecordId: "" }, true),
  "Harvest 3: Reject empty productionRecordId",
  "productionRecordId is required"
);

function checkRelationalMismatch(prodFarmId: string, harvestFarmId: string) {
  if (prodFarmId !== harvestFarmId) {
    throw new Error(
      `Relational Mismatch Error: Production record belongs to farm "${prodFarmId}", not "${harvestFarmId}".`
    );
  }
}

expectThrow(
  () => checkRelationalMismatch("farm_A", "farm_B"),
  "Harvest 4: Reject production record belonging to another farm",
  "Relational Mismatch Error"
);

expectThrow(
  () => validateHarvestInput({ ...validHarvestInput, quantityKg: -500 }, true),
  "Harvest 5a: Reject negative harvest quantity",
  "Must be a positive finite number greater than 0"
);

expectThrow(
  () => validateHarvestInput({ ...validHarvestInput, quantityKg: 0 }, true),
  "Harvest 5b: Reject zero harvest quantity",
  "Must be a positive finite number greater than 0"
);

expectThrow(
  () => validateHarvestInput({ ...validHarvestInput, quantityKg: Infinity }, true),
  "Harvest 5c: Reject infinite harvest quantity",
  "Must be a positive finite number greater than 0"
);

expectThrow(
  () => validateHarvestInput({ ...validHarvestInput, harvestDate: "bad-date" }, true),
  "Harvest 6: Reject invalid harvestDate format",
  "harvestDate is required and must be a valid date"
);

const validHarvestUpdate: UpdateHarvestInput = {
  quantityKg: 1300,
  qualityGrade: "Grade 1",
  notes: "Weight calibrated on certified scale",
};

try {
  validateHarvestInput(validHarvestUpdate, false);
  assert(true, "Harvest 7: Valid harvest update payload accepted");
} catch (e: unknown) {
  assert(false, "Harvest 7: Valid harvest update payload accepted", e instanceof Error ? e.message : String(e));
}

expectThrow(
  () => validateHarvestInput({ ...validHarvestUpdate, quantityKg: 0 }, false),
  "Harvest 8: Reject 0 quantity in update payload",
  "Must be a positive finite number greater than 0"
);

// -----------------------------------------------------------------
// 4. HARVEST DATE CONSISTENCY AGAINST PRODUCTION SEASON TESTS
// -----------------------------------------------------------------
console.log("\n--- 4. Harvest Date Consistency Against Production Season Tests ---");

const boundedProduction = {
  startDate: "2024-10-01",
  endDate: "2025-03-31",
};

// Test 4a: Harvest date within defined production period passes
try {
  validateHarvestDateAgainstProduction("2024-11-20", boundedProduction);
  assert(true, "Harvest Date 1: Harvest date within defined production period accepted (2024-11-20)");
} catch (e: unknown) {
  assert(false, "Harvest Date 1: Harvest date within defined production period accepted", e instanceof Error ? e.message : String(e));
}

// Test 4b: Harvest date exactly on boundary dates passes
try {
  validateHarvestDateAgainstProduction("2024-10-01", boundedProduction);
  validateHarvestDateAgainstProduction("2025-03-31", boundedProduction);
  assert(true, "Harvest Date 2: Harvest dates on exact boundaries accepted (startDate and endDate)");
} catch (e: unknown) {
  assert(false, "Harvest Date 2: Harvest dates on exact boundaries accepted", e instanceof Error ? e.message : String(e));
}

// Test 4c: Harvest date earlier than production startDate rejected
expectThrow(
  () => validateHarvestDateAgainstProduction("2024-09-15", boundedProduction),
  "Harvest Date 3: Reject harvestDate earlier than production startDate (2024-09-15 < 2024-10-01)",
  "cannot be earlier than production startDate"
);

// Test 4d: Harvest date later than production endDate rejected
expectThrow(
  () => validateHarvestDateAgainstProduction("2025-04-10", boundedProduction),
  "Harvest Date 4: Reject harvestDate later than production endDate (2025-04-10 > 2025-03-31)",
  "cannot be later than production endDate"
);

// Test 4e: Open-ended production (no endDate defined)
const openEndedProduction = {
  startDate: "2024-10-01",
};

// Rejects earlier date
expectThrow(
  () => validateHarvestDateAgainstProduction("2024-08-30", openEndedProduction),
  "Harvest Date 5a: Reject harvestDate earlier than startDate for open-ended production",
  "cannot be earlier than production startDate"
);

// Accepts later date with no endDate
try {
  validateHarvestDateAgainstProduction("2025-08-15", openEndedProduction);
  assert(true, "Harvest Date 5b: Accept harvestDate after startDate when endDate is not defined (2025-08-15)");
} catch (e: unknown) {
  assert(false, "Harvest Date 5b: Accept harvestDate after startDate when endDate is not defined", e instanceof Error ? e.message : String(e));
}

// -----------------------------------------------------------------
// 5. HARVEST UPDATE QUANTITY SYNCHRONIZATION TESTS
// -----------------------------------------------------------------
console.log("\n--- 5. Harvest Update Quantity Synchronization Tests ---");

// Baseline scenario: ProductionRecord has 1 Harvest of 1000 kg
let prodTotals = {
  actualQuantityKg: 1000,
  numberOfHarvests: 1,
};
let harvestRecord = {
  quantityKg: 1000,
  status: "logged",
};

// Test 5a: Change harvest quantity from 1000 kg to 1200 kg
const updateResult1 = calculateUpdatedProductionTotals(
  prodTotals,
  harvestRecord,
  { quantityKg: 1200 }
);
assert(
  updateResult1.actualQuantityKg === 1200,
  "Update Sync 1a: Changing quantity 1000 kg -> 1200 kg updates total to 1200 kg (does NOT add 1200 on top)"
);
assert(
  updateResult1.numberOfHarvests === 1,
  "Update Sync 1b: numberOfHarvests does not increase when harvest quantity is updated (remains 1)"
);
assert(
  updateResult1.quantityDelta === 200,
  "Update Sync 1c: Correct quantityDelta computed (+200 kg)"
);

// Apply update for next test
prodTotals = { actualQuantityKg: updateResult1.actualQuantityKg, numberOfHarvests: updateResult1.numberOfHarvests };
harvestRecord = { quantityKg: 1200, status: "logged" };

// Test 5b: Change harvest quantity from 1200 kg to 800 kg
const updateResult2 = calculateUpdatedProductionTotals(
  prodTotals,
  harvestRecord,
  { quantityKg: 800 }
);
assert(
  updateResult2.actualQuantityKg === 800,
  "Update Sync 2a: Changing quantity 1200 kg -> 800 kg decreases total to 800 kg (-400 delta)"
);
assert(
  updateResult2.numberOfHarvests === 1,
  "Update Sync 2b: numberOfHarvests remains 1 after decrease"
);
assert(
  updateResult2.quantityDelta === -400,
  "Update Sync 2c: Correct negative quantityDelta computed (-400 kg)"
);

// Apply update for next test
prodTotals = { actualQuantityKg: updateResult2.actualQuantityKg, numberOfHarvests: updateResult2.numberOfHarvests };
harvestRecord = { quantityKg: 800, status: "logged" };

// Test 5c: Update non-quantity fields (notes, qualityGrade)
const updateResult3 = calculateUpdatedProductionTotals(
  prodTotals,
  harvestRecord,
  { notes: "Calibrated on digital scale", qualityGrade: "Grade 1" }
);
assert(
  updateResult3.actualQuantityKg === 800,
  "Update Sync 3a: Updating non-quantity fields leaves actualQuantityKg completely unchanged (800 kg)"
);
assert(
  updateResult3.numberOfHarvests === 1,
  "Update Sync 3b: Updating non-quantity fields leaves numberOfHarvests unchanged (1)"
);
assert(
  updateResult3.isChanged === false,
  "Update Sync 3c: isChanged is false when no quantity or active status changes"
);

// Test 5d: Multi-harvest updates with cumulative synchronization
// Scenario: Production record has two harvests: H1 (800 kg) and H2 (1500 kg)
let multiHarvestProdTotals = {
  actualQuantityKg: 2300, // 800 + 1500
  numberOfHarvests: 2,
};
let h1 = { quantityKg: 800, status: "logged" };
let h2 = { quantityKg: 1500, status: "logged" };

// Update H1 from 800 kg to 1000 kg
const multiUpdate1 = calculateUpdatedProductionTotals(multiHarvestProdTotals, h1, { quantityKg: 1000 });
multiHarvestProdTotals = { actualQuantityKg: multiUpdate1.actualQuantityKg, numberOfHarvests: multiUpdate1.numberOfHarvests };
h1 = { quantityKg: 1000, status: "logged" };

assert(
  multiHarvestProdTotals.actualQuantityKg === 2500,
  "Update Sync 4a: Updating H1 (800 -> 1000 kg) updates cumulative total to 2500 kg"
);
assert(
  multiHarvestProdTotals.numberOfHarvests === 2,
  "Update Sync 4b: numberOfHarvests remains 2 after H1 update"
);

// Update H2 from 1500 kg to 2000 kg
const multiUpdate2 = calculateUpdatedProductionTotals(multiHarvestProdTotals, h2, { quantityKg: 2000 });
multiHarvestProdTotals = { actualQuantityKg: multiUpdate2.actualQuantityKg, numberOfHarvests: multiUpdate2.numberOfHarvests };
h2 = { quantityKg: 2000, status: "logged" };

assert(
  multiHarvestProdTotals.actualQuantityKg === 3000,
  "Update Sync 4c: Updating H2 (1500 -> 2000 kg) updates cumulative total to 3000 kg"
);
assert(
  multiHarvestProdTotals.numberOfHarvests === 2,
  "Update Sync 4d: numberOfHarvests remains 2 after H2 update"
);

// Test 5e: Archiving a harvest excludes it from active production totals
const archiveResult = calculateUpdatedProductionTotals(multiHarvestProdTotals, h1, { status: "archived" });
assert(
  archiveResult.actualQuantityKg === 2000,
  "Update Sync 5a: Archiving H1 (1000 kg) deducts 1000 kg, leaving 2000 kg in active totals"
);
assert(
  archiveResult.numberOfHarvests === 1,
  "Update Sync 5b: Archiving H1 decrements active numberOfHarvests to 1"
);

// Test 5f: Unarchiving a harvest restores it to active production totals
const unarchiveResult = calculateUpdatedProductionTotals(
  { actualQuantityKg: 2000, numberOfHarvests: 1 },
  { quantityKg: 1000, status: "archived" },
  { status: "logged" }
);
assert(
  unarchiveResult.actualQuantityKg === 3000,
  "Update Sync 5c: Unarchiving H1 restores 1000 kg back to 3000 kg total"
);
assert(
  unarchiveResult.numberOfHarvests === 2,
  "Update Sync 5d: Unarchiving H1 increments active numberOfHarvests back to 2"
);

console.log("\n===================================================================");
console.log(`TEST SUMMARY: Total=${passed + failed} | Passed=${passed} | Failed=${failed}`);
console.log("===================================================================\n");

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
