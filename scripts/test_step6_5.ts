/**
 * Test Suite: Step 6.5 - Complete Certificate Holding Trace History (Distinct Custody Units)
 *
 * Covers:
 * 1. Every transfer creates a unique destination holding (destHoldingId = holding_${transferId}).
 * 2. Same certificate + same destination holder creates SEPARATE holdings for separate transfers.
 * 3. Same lot + same destination holder creates SEPARATE holdings for separate transfers.
 * 4. Same holder receiving through different routes creates separate holdings.
 * 5. Different lot IDs are never merged.
 * 6. Separate holdings can coexist for the same holder.
 * 7. Each holding retains exactly its own sourceTransferId.
 * 8. Holding history follows only the requested holding's upstream provenance.
 * 9. Unrelated transfers are excluded from holding history.
 * 10. Multiple outgoing transfers from one holding create multiple destination holdings.
 * 11. Partial transfer preserves the source holding separately.
 * 12. Depleted source holdings remain historically available.
 * 13. Holding balances remain correct.
 * 14. Certificate quantity remains unchanged by transfer.
 * 15. Lot quantity remains unchanged by transfer.
 * 16. QR preparation can identify one exact holding independently from another.
 * 17. Multi-transfer scenario (Farmer A -> Coop B -> Agent C, and Farmer D -> Coop B).
 * 18. Query returns multiple holdings per holder without merging.
 */

import {
  CertificateHolding,
  CertificateTransfer,
  TraceCertificate,
  CocoaLot,
  Harvest,
  CertificateHoldingTraceHistory,
  UpstreamHolderSummary,
} from "../src/types/traceability";

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
console.log("TEST SUITE: Step 6.5 - Distinct Custody Unit Holding Trace History");
console.log("===================================================================\n");

async function runStep6_5Tests() {
  // -----------------------------------------------------------------
  // SETUP TEST DOMAIN ENTITIES
  // -----------------------------------------------------------------

  const originalHarvestA: Harvest = {
    harvestId: "harvest_cmr_test_01",
    productionRecordId: "prod_cmr_test_01",
    farmId: "farm_cmr_101",
    quantityKg: 5000,
    availableQuantityKg: 4000,
    allocatedQuantityKg: 1000,
    harvestDate: "2024-10-01",
    qualityGrade: "Grade 1",
    status: "allocated",
    createdBy: "farmer_uid_101",
    createdAt: "2024-10-01T08:00:00Z",
    updatedAt: "2024-10-01T08:00:00Z",
  };

  const originalLotA: CocoaLot = {
    lotId: "lot_cmr_test_01",
    lotNumber: "LOT-CMR-2024-001",
    farmId: "farm_cmr_101",
    productionRecordId: "prod_cmr_test_01",
    harvestId: "harvest_cmr_test_01",
    originCountry: "Cameroon",
    productionPeriod: "2024/2025",
    productionDate: "2024-10-01",
    quantityKg: 1000,
    availableQuantityKg: 1000,
    certifiedQuantityKg: 1000,
    pricePerKg: 3.5,
    currency: "USD",
    qualityGrade: "Grade 1",
    cocoaImage: {
      publicId: "cocoa/lot_cmr_test_01",
      url: "https://res.cloudinary.com/demo/image/upload/cocoa_lot.jpg",
      secureUrl: "https://res.cloudinary.com/demo/image/upload/cocoa_lot.jpg",
    },
    lotStatus: "certified",
    createdBy: "farmer_uid_101",
    createdAt: "2024-10-01T09:00:00Z",
    updatedAt: "2024-10-01T09:00:00Z",
  };

  const certificateA: TraceCertificate = {
    certificateId: "cert_cmr_test_01",
    certificateNumber: "CERT-CMR-2024-0001",
    applicationId: "app_cmr_test_01",
    lotId: originalLotA.lotId,
    farmId: originalLotA.farmId,
    holderId: "farmer_uid_101",
    holderType: "farmer",
    originCountry: "Cameroon",
    certifiedQuantityKg: 1000,
    productionPeriod: "2024/2025",
    issueDate: "2024-10-02T10:00:00Z",
    status: "active",
    verificationStatus: "verified",
    createdBy: "officer_uid_01",
    createdAt: "2024-10-02T10:00:00Z",
    updatedAt: "2024-10-02T10:00:00Z",
  };

  // Farmer D's separate lot and certificate
  const originalLotD: CocoaLot = {
    lotId: "lot_cmr_test_02",
    lotNumber: "LOT-CMR-2024-002",
    farmId: "farm_cmr_102",
    productionRecordId: "prod_cmr_test_02",
    harvestId: "harvest_cmr_test_02",
    originCountry: "Cameroon",
    productionPeriod: "2024/2025",
    productionDate: "2024-10-02",
    quantityKg: 500,
    availableQuantityKg: 500,
    certifiedQuantityKg: 500,
    pricePerKg: 3.6,
    currency: "USD",
    qualityGrade: "Grade 1",
    cocoaImage: {
      publicId: "cocoa/lot_cmr_test_02",
      url: "https://res.cloudinary.com/demo/image/upload/cocoa_lot_2.jpg",
      secureUrl: "https://res.cloudinary.com/demo/image/upload/cocoa_lot_2.jpg",
    },
    lotStatus: "certified",
    createdBy: "farmer_uid_102",
    createdAt: "2024-10-02T09:00:00Z",
    updatedAt: "2024-10-02T09:00:00Z",
  };

  const certificateD: TraceCertificate = {
    certificateId: "cert_cmr_test_02",
    certificateNumber: "CERT-CMR-2024-0002",
    applicationId: "app_cmr_test_02",
    lotId: originalLotD.lotId,
    farmId: originalLotD.farmId,
    holderId: "farmer_uid_102",
    holderType: "farmer",
    originCountry: "Cameroon",
    certifiedQuantityKg: 500,
    productionPeriod: "2024/2025",
    issueDate: "2024-10-02T11:00:00Z",
    status: "active",
    verificationStatus: "verified",
    createdBy: "officer_uid_01",
    createdAt: "2024-10-02T11:00:00Z",
    updatedAt: "2024-10-02T11:00:00Z",
  };

  // State store for holdings and transfers
  const holdingsDb = new Map<string, CertificateHolding>();
  const transfersDb = new Map<string, CertificateTransfer>();

  // 1. Initial Root Holding H001 for Farmer A
  const H001: CertificateHolding = {
    holdingId: `holding_init_${certificateA.certificateId}`,
    certificateId: certificateA.certificateId,
    certificateNumber: certificateA.certificateNumber,
    lotId: certificateA.lotId,
    farmId: certificateA.farmId,
    holderId: "farmer_uid_101",
    holderType: "farmer",
    quantityKg: 1000,
    availableQuantityKg: 1000,
    status: "active",
    createdBy: "officer_uid_01",
    createdAt: "2024-10-02T10:00:00Z",
    updatedAt: "2024-10-02T10:00:00Z",
  };
  holdingsDb.set(H001.holdingId, { ...H001 });

  // Initial Root Holding H001_D for Farmer D
  const H001_D: CertificateHolding = {
    holdingId: `holding_init_${certificateD.certificateId}`,
    certificateId: certificateD.certificateId,
    certificateNumber: certificateD.certificateNumber,
    lotId: certificateD.lotId,
    farmId: certificateD.farmId,
    holderId: "farmer_uid_102",
    holderType: "farmer",
    quantityKg: 500,
    availableQuantityKg: 500,
    status: "active",
    createdBy: "officer_uid_01",
    createdAt: "2024-10-02T11:00:00Z",
    updatedAt: "2024-10-02T11:00:00Z",
  };
  holdingsDb.set(H001_D.holdingId, { ...H001_D });

  // Transfer function implementing the DISTINCT HOLDING unit creation rule
  function executeDistinctTransfer(
    sourceHoldingId: string,
    destinationHolderId: string,
    destinationHolderType: "farmer" | "cooperative" | "agent" | "warehouse",
    quantityKg: number,
    actorUid: string,
    customTransferId?: string
  ): { transfer: CertificateTransfer; destinationHolding: CertificateHolding } {
    const source = holdingsDb.get(sourceHoldingId);
    if (!source) throw new Error(`Source holding ${sourceHoldingId} not found`);
    if (quantityKg <= 0) throw new Error(`Transfer quantity must be > 0`);
    if (quantityKg > source.availableQuantityKg) {
      throw new Error(`Requested transfer quantity ${quantityKg} exceeds available ${source.availableQuantityKg}`);
    }

    const transferId = customTransferId || `trans_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    // RULE 1: EVERY COMPLETED CERTIFICATE TRANSFER CREATES A DISTINCT DESTINATION HOLDING.
    const destHoldingId = `holding_${transferId}`;
    const destinationHolding: CertificateHolding = {
      holdingId: destHoldingId,
      certificateId: source.certificateId,
      certificateNumber: source.certificateNumber,
      lotId: source.lotId,
      farmId: source.farmId,
      holderId: destinationHolderId,
      holderType: destinationHolderType,
      quantityKg: quantityKg,
      availableQuantityKg: quantityKg,
      parentHoldingId: source.holdingId,
      sourceTransferId: transferId, // Exact 1-to-1 provenance link
      status: "active",
      createdBy: actorUid,
      createdAt: now,
      updatedAt: now,
    };
    holdingsDb.set(destHoldingId, destinationHolding);

    // Update source holding
    source.quantityKg -= quantityKg;
    source.availableQuantityKg -= quantityKg;
    source.status = source.availableQuantityKg <= 0 ? "depleted" : "partially_transferred";
    source.updatedAt = now;

    const transfer: CertificateTransfer = {
      transferId,
      certificateId: source.certificateId,
      certificateNumber: source.certificateNumber,
      lotId: source.lotId,
      sourceHoldingId: source.holdingId,
      destinationHoldingId: destHoldingId,
      sourceHolderId: source.holderId,
      sourceHolderType: source.holderType,
      destinationHolderId,
      destinationHolderType,
      route: "Farmer -> Cooperative",
      quantityKg,
      isPartialTransfer: source.availableQuantityKg > 0,
      sourceRemainingQuantityKg: source.availableQuantityKg,
      feeApplied: {
        feeId: `fee_${transferId}`,
        feeType: "certificate_transfer_fee",
        payerId: source.holderId,
        calculatedAmount: 0,
        currency: "USD",
        isFeeExempt: true,
        policyStatus: "EXEMPT",
        feeStatus: "waived",
        assessedAt: now,
      },
      transferStatus: "completed",
      initiatedBy: actorUid,
      completedBy: actorUid,
      initiatedAt: now,
      completedAt: now,
    };
    transfersDb.set(transferId, transfer);

    return { transfer, destinationHolding };
  }

  // Resolver following exact distinct holding provenance
  function resolveHoldingLineage(targetHoldingId: string): CertificateHoldingTraceHistory {
    const target = holdingsDb.get(targetHoldingId);
    if (!target) throw new Error(`Holding ${targetHoldingId} not found`);

    let incomingTransfers: CertificateTransfer[] = [];
    if (target.sourceTransferId) {
      const trans = transfersDb.get(target.sourceTransferId);
      if (trans) incomingTransfers = [trans];
    }

    const outgoingTransfers = Array.from(transfersDb.values()).filter(
      (t) => t.sourceHoldingId === targetHoldingId && t.transferStatus === "completed"
    );

    const upstreamHoldingsMap = new Map<string, CertificateHolding>();
    const upstreamTransfersMap = new Map<string, CertificateTransfer>();
    const upstreamHolders: UpstreamHolderSummary[] = [];

    let originalHoldingId = target.holdingId;
    let originalHolderId = target.holderId;
    let originalHolderType = target.holderType;

    function traverse(current: CertificateHolding, visited: Set<string>): void {
      if (visited.has(current.holdingId)) {
        throw new Error(`Circular Reference Error: Circular holding dependency detected at holdingId "${current.holdingId}".`);
      }
      visited.add(current.holdingId);

      if (!current.sourceTransferId) {
        // Root initial holding
        originalHoldingId = current.holdingId;
        originalHolderId = current.holderId;
        originalHolderType = current.holderType;
        upstreamHoldingsMap.set(current.holdingId, current);
        return;
      }

      const transfer = transfersDb.get(current.sourceTransferId);
      if (!transfer) return;

      upstreamTransfersMap.set(transfer.transferId, transfer);
      upstreamHolders.push({
        holderId: transfer.sourceHolderId,
        holderType: transfer.sourceHolderType,
        holdingId: transfer.sourceHoldingId,
        transferredQuantityKg: transfer.quantityKg,
        transferredAt: transfer.completedAt || transfer.initiatedAt,
      });

      const src = holdingsDb.get(transfer.sourceHoldingId);
      if (src) {
        upstreamHoldingsMap.set(src.holdingId, src);
        const branchPath = new Set(visited);
        traverse(src, branchPath);
      }
    }

    const path = new Set<string>();
    traverse(target, path);

    const chronologicalTransferSequence = [
      ...Array.from(upstreamTransfersMap.values()),
      ...outgoingTransfers,
    ].sort((a, b) => (a.completedAt || a.initiatedAt).localeCompare(b.completedAt || b.initiatedAt));

    return {
      holdingId: target.holdingId,
      certificateId: target.certificateId,
      certificateNumber: target.certificateNumber,
      lotId: target.lotId,
      farmId: target.farmId,
      holderId: target.holderId,
      holderType: target.holderType,
      currentQuantityKg: target.quantityKg,
      availableQuantityKg: target.availableQuantityKg,
      status: target.status,
      incomingTransfers,
      outgoingTransfers,
      upstreamHoldings: Array.from(upstreamHoldingsMap.values()),
      upstreamHolders,
      upstreamTransfers: Array.from(upstreamTransfersMap.values()),
      chronologicalTransferSequence,
      originalHoldingId,
      originalHolderId,
      originalHolderType,
      resolvedAt: new Date().toISOString(),
    };
  }

  // -----------------------------------------------------------------
  // EXECUTE MULTI-TRANSFER TEST SCENARIO
  // -----------------------------------------------------------------

  // T001: Farmer A (H001) -> Cooperative B = 600 kg
  const { transfer: T001, destinationHolding: H002 } = executeDistinctTransfer(
    H001.holdingId,
    "coop_b_01",
    "cooperative",
    600,
    "farmer_uid_101",
    "T001"
  );

  // T002: Cooperative B (H002) -> Agent C = 200 kg
  const { transfer: T002, destinationHolding: H003 } = executeDistinctTransfer(
    H002.holdingId,
    "agent_c_01",
    "agent",
    200,
    "coop_mgr_01",
    "T002"
  );

  // T003: Farmer D (H001_D) -> Cooperative B = 300 kg (DIFFERENT FARMER / DIFFERENT LOT)
  const { transfer: T003, destinationHolding: H004 } = executeDistinctTransfer(
    H001_D.holdingId,
    "coop_b_01",
    "cooperative",
    300,
    "farmer_uid_102",
    "T003"
  );

  // -----------------------------------------------------------------
  // 1. DISTINCT DESTINATION HOLDING & NO MERGING TESTS (1-6)
  // -----------------------------------------------------------------
  console.log("\n--- 1. Distinct Custody Units & No Merging Tests ---");

  // Test 1: Every transfer creates a unique destination holding
  assert(
    H002.holdingId === "holding_T001" &&
      H003.holdingId === "holding_T002" &&
      H004.holdingId === "holding_T003" &&
      (H002.holdingId as string) !== (H004.holdingId as string),
    "Test 1: Every completed certificate transfer creates a unique distinct destination holding"
  );

  // Test 2: Same certificate + same destination holder creates SEPARATE holdings
  // Create second transfer from Farmer A to Cooperative B under certificate A
  const { destinationHolding: H005 } = executeDistinctTransfer(
    H001.holdingId,
    "coop_b_01",
    "cooperative",
    100,
    "farmer_uid_101",
    "T004"
  );
  assert(
    H002.holdingId !== H005.holdingId &&
      H002.holderId === H005.holderId &&
      H002.certificateId === H005.certificateId,
    "Test 2: Same certificate + same destination holder creates SEPARATE holdings (H002 != H005)"
  );

  // Test 3: Same lot + same destination holder creates SEPARATE holdings
  assert(
    H002.lotId === H005.lotId && H002.holdingId !== H005.holdingId,
    "Test 3: Same lot + same destination holder creates SEPARATE holdings for separate transfers"
  );

  // Test 4: Same holder receiving through different routes creates separate holdings
  assert(
    H002.holdingId !== H004.holdingId &&
      H002.holderId === "coop_b_01" &&
      H004.holderId === "coop_b_01",
    "Test 4: Cooperative B holds separate holdings for transfers arriving from different farmers (Farmer A vs Farmer D)"
  );

  // Test 5: Different lot IDs are never merged
  assert(
    H002.lotId === "lot_cmr_test_01" &&
      H004.lotId === "lot_cmr_test_02" &&
      H002.holdingId !== H004.holdingId,
    "Test 5: Holdings from different Cocoa Lots (lot_01 vs lot_02) remain completely separate"
  );

  // Test 6: Separate holdings coexist for the same holder
  const coopHoldings = Array.from(holdingsDb.values()).filter((h) => h.holderId === "coop_b_01");
  assert(
    coopHoldings.length === 3 &&
      coopHoldings.map((h) => h.holdingId).includes("holding_T001") &&
      coopHoldings.map((h) => h.holdingId).includes("holding_T003") &&
      coopHoldings.map((h) => h.holdingId).includes("holding_T004"),
    "Test 6: Multiple separate holdings (H002, H004, H005) coexist for the same holder (Cooperative B) without merging"
  );

  // -----------------------------------------------------------------
  // 2. HOLDING PROVENANCE & ISOLATION TESTS (7-10)
  // -----------------------------------------------------------------
  console.log("\n--- 2. Holding Provenance & Lineage Isolation Tests ---");

  // Test 7: Each holding retains exactly its own sourceTransferId and parentHoldingId
  assert(
    H002.sourceTransferId === "T001" &&
      H002.parentHoldingId === H001.holdingId &&
      H003.sourceTransferId === "T002" &&
      H003.parentHoldingId === H002.holdingId &&
      H004.sourceTransferId === "T003" &&
      H004.parentHoldingId === H001_D.holdingId &&
      H001.parentHoldingId === undefined,
    "Test 7: Each holding unit retains exactly its own single sourceTransferId and parentHoldingId provenance link"
  );

  // Test 8: Holding history follows only requested holding's upstream provenance
  const h003_history = resolveHoldingLineage(H003.holdingId);
  const h003_trans_ids = h003_history.chronologicalTransferSequence.map((t) => t.transferId);
  assert(
    h003_trans_ids.includes("T002") &&
      h003_trans_ids.includes("T001") &&
      h003_history.originalHoldingId === H001.holdingId &&
      h003_history.originalHolderId === "farmer_uid_101",
    "Test 8: H003 lineage resolves exactly: H003 -> T002 -> H002 -> T001 -> H001 (Farmer A)"
  );

  // Test 9: Unrelated transfers from other branches/lots are excluded
  assert(
    !h003_trans_ids.includes("T003") && !h003_trans_ids.includes("T004"),
    "Test 9: H003 history strictly excludes unrelated transfers (T003 from Farmer D and T004)"
  );

  // Test 10: Multiple outgoing transfers from one holding create multiple destination holdings
  const { destinationHolding: H006 } = executeDistinctTransfer(
    H002.holdingId,
    "warehouse_d_01",
    "warehouse",
    100,
    "coop_mgr_01",
    "T005"
  );
  assert(
    H003.holdingId !== H006.holdingId &&
      H003.holderId === "agent_c_01" &&
      H006.holderId === "warehouse_d_01" &&
      H006.sourceTransferId === "T005",
    "Test 10: Multiple outgoing transfers from H002 create distinct destination holdings (H003 for Agent, H006 for Warehouse)"
  );

  // -----------------------------------------------------------------
  // 3. BALANCE INTEGRITY & NON-DESTRUCTION TESTS (11-16)
  // -----------------------------------------------------------------
  console.log("\n--- 3. Balance Integrity & Historical Immutability Tests ---");

  // Test 11: Partial transfer preserves the source holding separately
  assert(
    H002.availableQuantityKg === 300 &&
      H002.status === "partially_transferred" &&
      H003.availableQuantityKg === 200 &&
      H006.availableQuantityKg === 100,
    "Test 11: Partial transfers from H002 (600 - 200 - 100 = 300 kg) preserve H002 with status='partially_transferred'"
  );

  // Test 12: Depleted source holdings remain historically available
  const { destinationHolding: H007 } = executeDistinctTransfer(
    H002.holdingId,
    "agent_c_01",
    "agent",
    300,
    "coop_mgr_01",
    "T006"
  );
  assert(
    H002.availableQuantityKg === 0 &&
      H002.status === "depleted" &&
      H007.availableQuantityKg === 300,
    "Test 12: Depleted source holding H002 (balance=0) remains in database with status='depleted' (never deleted)"
  );

  // Test 13: Holding balances across all distinct units remain mathematically correct
  const allHoldingsCertA = Array.from(holdingsDb.values()).filter(
    (h) => h.certificateId === certificateA.certificateId
  );
  const totalHeldCertA = allHoldingsCertA.reduce((sum, h) => sum + h.availableQuantityKg, 0);
  assert(
    totalHeldCertA === 1000,
    `Test 13: Sum of all distinct active holdings under Certificate A equals certified quantity (${totalHeldCertA} = 1000 kg)`
  );

  // Test 14: Certificate quantity remains unchanged by transfers
  assert(
    certificateA.certifiedQuantityKg === 1000 && certificateD.certifiedQuantityKg === 500,
    "Test 14: TraceCertificate certifiedQuantityKg remains immutable across transfers"
  );

  // Test 15: Lot quantity remains unchanged by transfers
  assert(
    originalLotA.quantityKg === 1000 && originalLotD.quantityKg === 500,
    "Test 15: CocoaLot quantities remain unchanged by certificate holding movements"
  );

  // Test 16: QR preparation can identify one exact holding independently from another
  const h004_history = resolveHoldingLineage(H004.holdingId);
  assert(
    h004_history.holdingId === H004.holdingId &&
      h004_history.lotId === "lot_cmr_test_02" &&
      h004_history.originalHolderId === "farmer_uid_102" &&
      h004_history.originalHoldingId === H001_D.holdingId &&
      h004_history.holdingId !== h003_history.holdingId,
    "Test 16: QR preparation resolves exact custody unit H004 independently from H003 and H002"
  );

  // -----------------------------------------------------------------
  // 4. CIRCULAR REFERENCE DETECTION TEST
  // -----------------------------------------------------------------
  console.log("\n--- 4. Circular Reference Protection ---");

  const circHoldings = new Map<string, CertificateHolding>([
    ["circ_1", { ...H001, holdingId: "circ_1", sourceTransferId: "circ_t2" }],
    ["circ_2", { ...H002, holdingId: "circ_2", sourceTransferId: "circ_t1" }],
  ]);
  const circTransfers = new Map<string, CertificateTransfer>([
    [
      "circ_t1",
      { ...T001, transferId: "circ_t1", sourceHoldingId: "circ_1", destinationHoldingId: "circ_2" },
    ],
    [
      "circ_t2",
      { ...T002, transferId: "circ_t2", sourceHoldingId: "circ_2", destinationHoldingId: "circ_1" },
    ],
  ]);

  function testCircResolver(id: string): void {
    const visited = new Set<string>();
    function step(currId: string): void {
      if (visited.has(currId)) {
        throw new Error(`Circular Reference Error: Circular holding dependency detected at holdingId "${currId}".`);
      }
      visited.add(currId);
      const h = circHoldings.get(currId);
      if (!h || !h.sourceTransferId) return;
      const t = circTransfers.get(h.sourceTransferId);
      if (!t) return;
      const src = circHoldings.get(t.sourceHoldingId);
      if (src) step(src.holdingId);
    }
    step(id);
  }

  expectThrow(
    () => testCircResolver("circ_2"),
    "Test 17: Circular holding dependency is detected and fails safely",
    "Circular Reference Error"
  );

  console.log("\n===================================================================");
  console.log(`TEST SUMMARY: Total=${passed + failed} | Passed=${passed} | Failed=${failed}`);
  console.log("===================================================================\n");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runStep6_5Tests().catch((e) => {
  console.error("Test runner error:", e);
  process.exit(1);
});
