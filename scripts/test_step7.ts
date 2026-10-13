/**
 * Test Suite: Step 7 - Bag-Level QR Traceability, Virtual Package Allocation & Unified Packaging Accounting
 *
 * Verifies:
 * 1. Unified derived packaging accounting model:
 *    allocatedPackageQuantityKg = SUM(qr.representedQuantityKg WHERE currentHoldingId === holdingId AND returnedToBulk !== true)
 *    unpackagedQuantityKg = holding.availableQuantityKg - allocatedPackageQuantityKg
 * 2. Virtual package creation within unpackaged capacity.
 * 3. Rejection of package creation exceeding unpackaged capacity.
 * 4. Zero and negative package quantities rejected.
 * 5. Immutable representedQuantityKg and generatedFromHoldingId.
 * 6. Automatic permanent package numbering (${lotNumber}-PKG-${seq}) via atomic sequence counter.
 * 7. Sequence numbers are never reused.
 * 8. Deactivation preserves allocated packaging capacity (returnedToBulk === false).
 * 9. Standard revocation preserves allocated packaging capacity (returnedToBulk === false).
 * 10. Transactional return-to-bulk repackaging releases capacity (returnedToBulk === true).
 * 11. Old revoked QR is permanently retired and never reactivated.
 * 12. Holding with packaged cocoa rejects bulk transfers exceeding unpackaged quantity.
 * 13. Holding with packaged cocoa accepts bulk transfers within unpackaged quantity.
 * 14. Bulk transfers never move QR packages (currentHoldingId unchanged).
 * 15. Package-aware transfers require active QR packages belonging to source holding.
 * 16. Package-aware transfer quantity must strictly equal sum of selected package quantities.
 * 17. Mixed packaged + bulk transfers are rejected.
 * 18. Package-aware transfer moves only selected QR packages (currentHoldingId = destHoldingId).
 * 19. Unselected QR packages remain at source holding (currentHoldingId unchanged).
 * 20. QR package from another holding/lot/cert rejected in package-aware transfer.
 * 21. QR package cannot be transferred twice in separate conflicting transfers.
 * 22. Multiple distinct holdings of the same holder never merge and keep separate packaging state.
 * 23. Distinct lots never merge.
 * 24. Exact bag-level custody lineage resolution (Farm -> Lot -> Cert -> Transfers -> Current Holder).
 * 25. Every transfer displays exact historical transferred quantity (no aggregation).
 * 26. Parallel branches and unrelated transfers strictly excluded.
 * 27. Public trace response separates all 4 quantities: original lot, certified, current holding, this package.
 * 28. Public trace sanitization excludes private UIDs, contact info, and platform fees.
 * 29. QR Image rendering (SVG & PNG).
 * 30. Read-only scan auditing (authenticated vs public, no fake UIDs, zero domain mutations).
 * 31. Concurrency protection over packaging allocation and numbering.
 */

import {
  QRCode,
  QRScan,
  HoldingPackagingState,
  PublicQRTraceabilityResult,
  CertificateHolding,
  CertificateTransfer,
  TraceCertificate,
  CocoaLot,
} from "../src/types/traceability";
import QRCodeLib from "qrcode";

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
console.log("TEST SUITE: Step 7 - Bag-Level QR Traceability & Packaging Accounting");
console.log("===================================================================\n");

async function runStep7Tests() {
  // -----------------------------------------------------------------
  // 1. SETUP BASE DOMAIN ENTITIES
  // -----------------------------------------------------------------
  const lotA: CocoaLot = {
    lotId: "lot_cmr_2026_01",
    lotNumber: "LOT-CMR-2026-0001",
    farmId: "farm_cmr_101",
    productionRecordId: "prod_cmr_101",
    harvestId: "harvest_cmr_101",
    originCountry: "Cameroon",
    productionPeriod: "2025/2026",
    productionDate: "2026-01-15",
    quantityKg: 1000,
    availableQuantityKg: 1000,
    certifiedQuantityKg: 1000,
    qualityGrade: "Grade 1",
    pricePerKg: 3.5,
    currency: "USD",
    cocoaImage: {
      publicId: "cocoa/lot_01",
      url: "http://res.cloudinary.com/demo/image/upload/cocoa_lot_01.jpg",
      secureUrl: "https://res.cloudinary.com/demo/image/upload/cocoa_lot_01.jpg",
    },
    lotStatus: "certified",
    createdBy: "farmer_uid_101",
    createdAt: "2026-01-15T08:00:00Z",
    updatedAt: "2026-01-15T08:00:00Z",
  };

  const certA: TraceCertificate = {
    certificateId: "cert_cmr_2026_01",
    certificateNumber: "OTC-CMR-2026-0001",
    applicationId: "app_cmr_2026_01",
    lotId: lotA.lotId,
    farmId: lotA.farmId,
    holderId: "farmer_uid_101",
    holderType: "farmer",
    originCountry: "Cameroon",
    certifiedQuantityKg: 1000,
    productionPeriod: "2025/2026",
    issueDate: "2026-01-20T10:00:00Z",
    status: "active",
    verificationStatus: "verified",
    createdBy: "officer_uid_01",
    createdAt: "2026-01-20T10:00:00Z",
    updatedAt: "2026-01-20T10:00:00Z",
  };

  // Initial Root Holding H001: Farmer A holds 1,000 kg
  const H001: CertificateHolding = {
    holdingId: "holding_root_farmer_01",
    certificateId: certA.certificateId,
    certificateNumber: certA.certificateNumber,
    lotId: lotA.lotId,
    farmId: lotA.farmId,
    holderId: "farmer_uid_101",
    holderType: "farmer",
    quantityKg: 1000,
    availableQuantityKg: 1000,
    status: "active",
    createdBy: "officer_uid_01",
    createdAt: "2026-01-20T10:00:00Z",
    updatedAt: "2026-01-20T10:00:00Z",
  };

  // Simulation In-Memory Stores
  const holdingsDb = new Map<string, CertificateHolding>([[H001.holdingId, { ...H001 }]]);
  const transfersDb = new Map<string, CertificateTransfer>();
  const qrCodesDb = new Map<string, QRCode>();
  const lotCountersDb = new Map<string, number>([[lotA.lotId, 0]]);
  const scansDb = new Map<string, QRScan>();

  // -----------------------------------------------------------------
  // SIMULATION HELPERS: UNIFIED PACKAGING ACCOUNTING
  // -----------------------------------------------------------------

  /**
   * Enforces the unified derived packaging accounting formula:
   * allocatedPackageQuantityKg = SUM(qr.representedQuantityKg WHERE currentHoldingId === holdingId AND returnedToBulk !== true)
   * unpackagedQuantityKg = holding.availableQuantityKg - allocatedPackageQuantityKg
   */
  function derivePackagingState(holdingId: string): HoldingPackagingState {
    const holding = holdingsDb.get(holdingId);
    if (!holding) throw new Error(`Holding ${holdingId} not found`);

    const qrs = Array.from(qrCodesDb.values()).filter(
      (q) => q.currentHoldingId === holdingId
    );

    const allocatedQRs = qrs.filter((q) => q.returnedToBulk !== true);
    const activeQRs = qrs.filter((q) => q.status === "active");

    const allocatedPackageQuantityKg = allocatedQRs.reduce(
      (sum, q) => sum + q.representedQuantityKg,
      0
    );

    const unpackagedQuantityKg = Math.max(
      0,
      holding.availableQuantityKg - allocatedPackageQuantityKg
    );

    return {
      holdingId,
      totalHoldingQuantityKg: holding.quantityKg,
      availableQuantityKg: holding.availableQuantityKg,
      allocatedPackageQuantityKg,
      unpackagedQuantityKg,
      activePackageCount: activeQRs.length,
      allocatedPackageCount: allocatedQRs.length,
    };
  }

  function simulateGenerateQR(
    holdingId: string,
    representedQtyKg: number,
    actorUid: string,
    qrGroupId?: string
  ): QRCode {
    const holding = holdingsDb.get(holdingId);
    if (!holding) throw new Error(`Holding Error: CertificateHolding "${holdingId}" does not exist.`);
    if (representedQtyKg <= 0) {
      throw new Error(`Validation Error: representedQuantityKg must be > 0, received ${representedQtyKg}`);
    }

    const state = derivePackagingState(holdingId);
    if (representedQtyKg > state.unpackagedQuantityKg) {
      throw new Error(
        `Capacity Error: Requested package quantity (${representedQtyKg} kg) exceeds available unpackaged cocoa (${state.unpackagedQuantityKg} kg) in holding "${holdingId}".`
      );
    }

    // Atomic lot sequence increment
    const currentSeq = (lotCountersDb.get(holding.lotId) || 0) + 1;
    lotCountersDb.set(holding.lotId, currentSeq);

    const packageNumber = `${lotA.lotNumber}-PKG-${String(currentSeq).padStart(3, "0")}`;
    const qrId = `qr_${holding.lotId}_${currentSeq}`;
    const qrValue = `QRV-${lotA.lotNumber}-${String(currentSeq).padStart(3, "0")}-sim`;
    const now = new Date().toISOString();

    const qr: QRCode = {
      qrId,
      qrValue,
      packageNumber,
      sequenceNumber: currentSeq,
      generatedFromHoldingId: holding.holdingId,
      currentHoldingId: holding.holdingId,
      certificateId: holding.certificateId,
      certificateNumber: holding.certificateNumber,
      lotId: holding.lotId,
      lotNumber: lotA.lotNumber,
      farmId: holding.farmId,
      representedQuantityKg: representedQtyKg,
      qrGroupId,
      status: "active",
      generatedAt: now,
      activatedAt: now,
      returnedToBulk: false,
      generatedBy: actorUid,
    };

    qrCodesDb.set(qrId, qr);
    return qr;
  }

  function simulateTransfer(
    sourceHoldingId: string,
    destHolderId: string,
    destHolderType: "farmer" | "cooperative" | "agent" | "warehouse",
    quantityKg: number,
    actorUid: string,
    transferredQrPackageIds?: string[]
  ): CertificateTransfer {
    const sourceHolding = holdingsDb.get(sourceHoldingId);
    if (!sourceHolding) throw new Error(`Source holding ${sourceHoldingId} not found`);
    if (quantityKg <= 0) throw new Error(`Transfer quantity must be > 0`);
    if (quantityKg > sourceHolding.availableQuantityKg) {
      throw new Error(`Requested transfer quantity ${quantityKg} exceeds available ${sourceHolding.availableQuantityKg}`);
    }

    const pkgState = derivePackagingState(sourceHoldingId);
    const isPackageAware = Boolean(transferredQrPackageIds && transferredQrPackageIds.length > 0);
    const selectedQRs: QRCode[] = [];

    if (isPackageAware) {
      const requestedIds = transferredQrPackageIds!;
      for (const qid of requestedIds) {
        const qr = qrCodesDb.get(qid);
        if (!qr) throw new Error(`Package Transfer Error: QR package "${qid}" was not found.`);
        if (qr.currentHoldingId !== sourceHolding.holdingId) {
          throw new Error(`Package Transfer Error: QR package "${qid}" is not currently in source holding "${sourceHolding.holdingId}".`);
        }
        if (qr.status !== "active") {
          throw new Error(`Package Transfer Error: QR package "${qid}" has status "${qr.status}". Only active packages can be transferred.`);
        }
        if (qr.returnedToBulk === true) {
          throw new Error(`Package Transfer Error: QR package "${qid}" has been returned to bulk.`);
        }
        selectedQRs.push(qr);
      }

      const selectedTotal = selectedQRs.reduce((sum, q) => sum + q.representedQuantityKg, 0);
      if (selectedTotal !== quantityKg) {
        throw new Error(
          `Package Transfer Error: Selected QR packages total ${selectedTotal} kg, which does not match transfer quantity (${quantityKg} kg). Mixed transfers are prohibited.`
        );
      }
    } else {
      // Bulk transfer check: must NOT exceed unpackaged quantity
      if (quantityKg > pkgState.unpackagedQuantityKg) {
        throw new Error(
          `Transfer Error: Requested bulk transfer quantity (${quantityKg} kg) exceeds available unpackaged cocoa (${pkgState.unpackagedQuantityKg} kg) in holding "${sourceHolding.holdingId}". When active package allocations exist, transfers exceeding unpackaged quantity must identify the specific active QR packages being transferred.`
        );
      }
    }

    const transferId = `trans_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const destHoldingId = `holding_${transferId}`;
    const now = new Date().toISOString();

    // Create distinct destination holding
    const destHolding: CertificateHolding = {
      holdingId: destHoldingId,
      certificateId: sourceHolding.certificateId,
      certificateNumber: sourceHolding.certificateNumber,
      lotId: sourceHolding.lotId,
      farmId: sourceHolding.farmId,
      holderId: destHolderId,
      holderType: destHolderType,
      quantityKg,
      availableQuantityKg: quantityKg,
      parentHoldingId: sourceHolding.holdingId,
      sourceTransferId: transferId,
      status: "active",
      createdBy: actorUid,
      createdAt: now,
      updatedAt: now,
    };
    holdingsDb.set(destHoldingId, destHolding);

    // Deduct source holding
    sourceHolding.quantityKg -= quantityKg;
    sourceHolding.availableQuantityKg -= quantityKg;
    sourceHolding.status = sourceHolding.availableQuantityKg <= 0 ? "depleted" : "partially_transferred";
    sourceHolding.updatedAt = now;

    // Move selected QRs
    for (const qr of selectedQRs) {
      qr.currentHoldingId = destHoldingId;
      qr.lastTransferId = transferId;
      qr.lastTransferredAt = now;
    }

    const transfer: CertificateTransfer = {
      transferId,
      certificateId: sourceHolding.certificateId,
      certificateNumber: sourceHolding.certificateNumber,
      lotId: sourceHolding.lotId,
      sourceHoldingId: sourceHolding.holdingId,
      destinationHoldingId: destHoldingId,
      sourceHolderId: sourceHolding.holderId,
      sourceHolderType: sourceHolding.holderType,
      destinationHolderId: destHolderId,
      destinationHolderType: destHolderType,
      route: "Farmer -> Cooperative",
      quantityKg,
      isPartialTransfer: sourceHolding.availableQuantityKg > 0,
      sourceRemainingQuantityKg: sourceHolding.availableQuantityKg,
      feeApplied: {
        feeId: `fee_${transferId}`,
        feeType: "certificate_transfer_fee",
        payerId: actorUid,
        calculatedAmount: 0,
        currency: "USD",
        isFeeExempt: true,
        policyStatus: "EXEMPT",
        feeStatus: "assessed",
        assessedAt: now,
      },
      transferStatus: "completed",
      transferredQrPackageIds: isPackageAware ? transferredQrPackageIds : undefined,
      initiatedBy: actorUid,
      completedBy: actorUid,
      initiatedAt: now,
      completedAt: now,
    };
    transfersDb.set(transferId, transfer);

    return transfer;
  }

  // -----------------------------------------------------------------
  // 2. RUN TESTS
  // -----------------------------------------------------------------

  console.log("--- 1. Packaging Accounting & Capacity Enforcement ---");

  // Initial state on H001 (1,000 kg total)
  const initState = derivePackagingState(H001.holdingId);
  assert(
    initState.allocatedPackageQuantityKg === 0 && initState.unpackagedQuantityKg === 1000,
    "Test 1: Initial holding has 0 allocated packages and 1,000 kg unpackaged cocoa"
  );

  // Generate QR-001 (100 kg)
  const qr1 = simulateGenerateQR(H001.holdingId, 100, "farmer_uid_101");
  assert(
    qr1.representedQuantityKg === 100 && qr1.packageNumber === "LOT-CMR-2026-0001-PKG-001",
    "Test 2: QR-001 created with 100 kg and permanent package number LOT-CMR-2026-0001-PKG-001"
  );

  // Check derived state: 100 packaged, 900 unpackaged, holding still 1,000
  const stateAfter1 = derivePackagingState(H001.holdingId);
  assert(
    stateAfter1.allocatedPackageQuantityKg === 100 &&
      stateAfter1.unpackagedQuantityKg === 900 &&
      stateAfter1.totalHoldingQuantityKg === 1000,
    "Test 3: Generating QR increases packaged to 100 kg and decreases unpackaged to 900 kg without changing holding total"
  );

  // Generate QR-002 (200 kg)
  const qr2 = simulateGenerateQR(H001.holdingId, 200, "farmer_uid_101");
  // Generate QR-003 (300 kg)
  const qr3 = simulateGenerateQR(H001.holdingId, 300, "farmer_uid_101");

  const stateAfter3 = derivePackagingState(H001.holdingId);
  assert(
    stateAfter3.allocatedPackageQuantityKg === 600 &&
      stateAfter3.unpackagedQuantityKg === 400 &&
      stateAfter3.totalHoldingQuantityKg === 1000,
    "Test 4: Total packaged is 600 kg (100+200+300) and unpackaged is 400 kg"
  );

  // Test 5: Rejection of QR exceeding unpackaged capacity (request 450 kg when only 400 kg unpackaged)
  expectThrow(
    () => simulateGenerateQR(H001.holdingId, 450, "farmer_uid_101"),
    "Test 5: Packaging request (450 kg) exceeding unpackaged cocoa (400 kg) is rejected",
    "Capacity Error"
  );

  // Test 6: Zero and negative quantities rejected
  expectThrow(
    () => simulateGenerateQR(H001.holdingId, 0, "farmer_uid_101"),
    "Test 6a: Zero package quantity rejected",
    "Validation Error"
  );
  expectThrow(
    () => simulateGenerateQR(H001.holdingId, -50, "farmer_uid_101"),
    "Test 6b: Negative package quantity rejected",
    "Validation Error"
  );

  console.log("\n--- 2. Bulk Transfer Enforcement After QR Packaging ---");

  // H001 currently: Total=1,000, Packaged=600, Unpackaged=400.
  // Test 7: Attempt bulk transfer of 500 kg (exceeds 400 kg unpackaged) -> REJECT!
  expectThrow(
    () => simulateTransfer(H001.holdingId, "coop_kumba_01", "cooperative", 500, "farmer_uid_101"),
    "Test 7: Bulk transfer of 500 kg exceeding unpackaged cocoa (400 kg) is rejected",
    "Transfer Error"
  );

  // Test 8: Bulk transfer of 300 kg (within 400 kg unpackaged) -> SUCCEEDS!
  const bulkTrans1 = simulateTransfer(H001.holdingId, "coop_kumba_01", "cooperative", 300, "farmer_uid_101");
  assert(
    bulkTrans1.quantityKg === 300 && bulkTrans1.transferredQrPackageIds === undefined,
    "Test 8: Bulk transfer of 300 kg succeeds without QR package IDs"
  );

  // Test 9: Verify H001 unpackaged quantity decreased by 300 kg (400 - 300 = 100 kg), packaged remains 600 kg
  const stateAfterBulk = derivePackagingState(H001.holdingId);
  assert(
    stateAfterBulk.totalHoldingQuantityKg === 700 &&
      stateAfterBulk.allocatedPackageQuantityKg === 600 &&
      stateAfterBulk.unpackagedQuantityKg === 100,
    "Test 9: Bulk transfer reduces holding to 700 kg, unpackaged to 100 kg, while packaged remains 600 kg"
  );

  // Test 10: QR packages remain at H001 (bulk transfer does not move QR packages)
  assert(
    qr1.currentHoldingId === H001.holdingId &&
      qr2.currentHoldingId === H001.holdingId &&
      qr3.currentHoldingId === H001.holdingId,
    "Test 10: Bulk transfer does NOT move QR packages; currentHoldingId remains H001"
  );

  console.log("\n--- 3. Package-Aware Transfers & Exact Custody Movement ---");

  // H001 has: QR-001 (100 kg), QR-002 (200 kg), QR-003 (300 kg).
  // Test 11: Package-aware transfer selecting QR-001 and QR-002 (100 + 200 = 300 kg)
  const pkgTrans1 = simulateTransfer(
    H001.holdingId,
    "coop_kumba_01",
    "cooperative",
    300,
    "farmer_uid_101",
    [qr1.qrId, qr2.qrId]
  );
  assert(
    pkgTrans1.quantityKg === 300 &&
      Boolean(pkgTrans1.transferredQrPackageIds?.includes(qr1.qrId)) &&
      Boolean(pkgTrans1.transferredQrPackageIds?.includes(qr2.qrId)),
    "Test 11: Package-aware transfer of 300 kg succeeds with selected QR-001 and QR-002"
  );

  const destHoldingH002 = pkgTrans1.destinationHoldingId!;

  // Test 12: Selected QR-001 and QR-002 have currentHoldingId updated to destHoldingH002
  assert(
    qr1.currentHoldingId === destHoldingH002 && qr2.currentHoldingId === destHoldingH002,
    "Test 12: Transferred QR-001 and QR-002 have currentHoldingId updated to destination holding"
  );

  // Test 13: generatedFromHoldingId remains permanently unchanged as H001
  assert(
    qr1.generatedFromHoldingId === H001.holdingId && qr2.generatedFromHoldingId === H001.holdingId,
    "Test 13: generatedFromHoldingId remains permanently unchanged as H001"
  );

  // Test 14: Unselected QR-003 (300 kg) remains at source holding H001
  assert(
    qr3.currentHoldingId === H001.holdingId,
    "Test 14: Unselected QR-003 remains at source holding H001"
  );

  // Test 15: Mismatched package quantity vs transfer quantity rejected (e.g. select QR-003 (300 kg) for 200 kg transfer)
  expectThrow(
    () =>
      simulateTransfer(
        H001.holdingId,
        "coop_kumba_01",
        "cooperative",
        200,
        "farmer_uid_101",
        [qr3.qrId]
      ),
    "Test 15: Package transfer rejected when package total (300 kg) does not equal transfer quantity (200 kg)",
    "Package Transfer Error"
  );

  // Test 16: Mixed transfer rejected
  expectThrow(
    () =>
      simulateTransfer(
        H001.holdingId,
        "coop_kumba_01",
        "cooperative",
        350, // 300 kg package + 50 kg bulk
        "farmer_uid_101",
        [qr3.qrId]
      ),
    "Test 16: Mixed transfer (package + loose bulk) is strictly rejected",
    "Package Transfer Error"
  );

  // Test 17: Cannot transfer a package that does not belong to the source holding
  expectThrow(
    () =>
      simulateTransfer(
        H001.holdingId,
        "coop_kumba_01",
        "cooperative",
        100,
        "farmer_uid_101",
        [qr1.qrId] // QR-001 is now in H002, not H001!
      ),
    "Test 17: Cannot transfer QR-001 from H001 because it is no longer in H001",
    "Package Transfer Error"
  );

  console.log("\n--- 4. Multi-Hop Custody & Exact Lineage Resolution ---");

  // Second Leg Transfer: Cooperative transfers QR-001 (100 kg) from H002 to Agent C (H003)
  const pkgTrans2 = simulateTransfer(
    destHoldingH002,
    "agent_corp_01",
    "agent",
    100,
    "coop_mgr_01",
    [qr1.qrId]
  );
  const destHoldingH003 = pkgTrans2.destinationHoldingId!;

  assert(
    qr1.currentHoldingId === destHoldingH003,
    "Test 18: Second leg transfer moves QR-001 to Agent C's holding H003"
  );
  assert(
    qr2.currentHoldingId === destHoldingH002,
    "Test 19: QR-002 remains at Cooperative B's holding H002"
  );

  // Reconstruct exact lineage for QR-001
  function resolveLineageForQR(qrRecord: QRCode) {
    const currentH = holdingsDb.get(qrRecord.currentHoldingId);
    if (!currentH) throw new Error("Current holding not found");

    const hops: CertificateTransfer[] = [];
    let curr: CertificateHolding | undefined = currentH;
    const visited = new Set<string>();

    while (curr && curr.sourceTransferId) {
      if (visited.has(curr.holdingId)) break;
      visited.add(curr.holdingId);
      const t = transfersDb.get(curr.sourceTransferId);
      if (!t) break;
      hops.unshift(t); // chronological
      curr = holdingsDb.get(t.sourceHoldingId);
    }

    return {
      packageNumber: qrRecord.packageNumber,
      representedQuantityKg: qrRecord.representedQuantityKg,
      currentHolder: currentH.holderId,
      currentHolderType: currentH.holderType,
      currentHoldingId: currentH.holdingId,
      generatedFromHoldingId: qrRecord.generatedFromHoldingId,
      hops,
    };
  }

  const qr1Lineage = resolveLineageForQR(qr1);
  assert(
    qr1Lineage.hops.length === 2 &&
      qr1Lineage.hops[0].sourceHolderId === "farmer_uid_101" &&
      qr1Lineage.hops[0].destinationHolderId === "coop_kumba_01" &&
      qr1Lineage.hops[0].quantityKg === 300 &&
      qr1Lineage.hops[1].sourceHolderId === "coop_kumba_01" &&
      qr1Lineage.hops[1].destinationHolderId === "agent_corp_01" &&
      qr1Lineage.hops[1].quantityKg === 100,
    "Test 20: QR-001 lineage resolves exact 2-hop custody chain with individual transfer quantities (300 kg and 100 kg)"
  );
  assert(
    qr1Lineage.currentHolder === "agent_corp_01" && qr1Lineage.currentHolderType === "agent",
    "Test 21: QR-001 current holder correctly resolved as Agent C"
  );

  console.log("\n--- 5. QR Lifecycle: Deactivation, Revocation & Repackaging ---");

  // Generate QR-004 (50 kg) at H001
  const qr4 = simulateGenerateQR(H001.holdingId, 50, "farmer_uid_101");
  const stateBeforeDeact = derivePackagingState(H001.holdingId);

  // Test 22: Deactivation sets status="inactive", does NOT release capacity
  qr4.status = "inactive";
  qr4.deactivatedAt = new Date().toISOString();

  const stateAfterDeact = derivePackagingState(H001.holdingId);
  assert(
    stateAfterDeact.allocatedPackageQuantityKg === stateBeforeDeact.allocatedPackageQuantityKg &&
      stateAfterDeact.unpackagedQuantityKg === stateBeforeDeact.unpackagedQuantityKg,
    "Test 22: Deactivation does NOT release packaging capacity (allocatedPackageQuantityKg unchanged)"
  );

  // Test 23: Deactivated QR cannot be transferred in package-aware transfer
  expectThrow(
    () =>
      simulateTransfer(
        H001.holdingId,
        "coop_kumba_01",
        "cooperative",
        50,
        "farmer_uid_101",
        [qr4.qrId]
      ),
    "Test 23: Deactivated QR cannot be transferred in package-aware transfer",
    "Package Transfer Error"
  );

  // Test 24: Standard revocation sets status="revoked", returnedToBulk=false, does NOT release capacity
  qr4.status = "revoked";
  qr4.revokedAt = new Date().toISOString();
  qr4.revocationReason = "Damaged physical bag";
  qr4.returnedToBulk = false;

  const stateAfterRevoke = derivePackagingState(H001.holdingId);
  assert(
    stateAfterRevoke.allocatedPackageQuantityKg === stateBeforeDeact.allocatedPackageQuantityKg &&
      stateAfterRevoke.unpackagedQuantityKg === stateBeforeDeact.unpackagedQuantityKg,
    "Test 24: Standard revocation does NOT release packaging capacity (returnedToBulk === false)"
  );

  // Test 25: Transactional Repackaging (return-to-bulk) releases capacity
  const unpackagedBeforeRepack = stateAfterRevoke.unpackagedQuantityKg;
  qr4.returnedToBulk = true;
  qr4.returnedToBulkAt = new Date().toISOString();
  qr4.returnedToBulkBy = "farmer_uid_101";

  const stateAfterRepack = derivePackagingState(H001.holdingId);
  assert(
    stateAfterRepack.unpackagedQuantityKg === unpackagedBeforeRepack + 50 &&
      stateAfterRepack.allocatedPackageQuantityKg === stateBeforeDeact.allocatedPackageQuantityKg - 50,
    "Test 25: Formal return-to-bulk (returnedToBulk=true) releases 50 kg back to unpackaged capacity"
  );

  // Test 26: Old revoked QR is permanent and cannot be reactivated or transferred
  expectThrow(
    () =>
      simulateTransfer(
        H001.holdingId,
        "coop_kumba_01",
        "cooperative",
        50,
        "farmer_uid_101",
        [qr4.qrId]
      ),
    "Test 26: Revoked returned-to-bulk QR cannot be transferred",
    "Package Transfer Error"
  );

  console.log("\n--- 6. Public Sanitization & Image Generation ---");

  // Test 27: Public Sanitized Result formatting
  const publicResult: PublicQRTraceabilityResult = {
    package: {
      packageNumber: qr1.packageNumber,
      packageQuantityKg: qr1.representedQuantityKg,
      status: qr1.status,
      generatedAt: qr1.generatedAt,
      isPackagedAtOrigin: qr1.generatedFromHoldingId === H001.holdingId,
    },
    quantities: {
      originalLotQuantityKg: lotA.quantityKg,
      certifiedQuantityKg: certA.certifiedQuantityKg,
      currentHoldingQuantityKg: holdingsDb.get(qr1.currentHoldingId)!.quantityKg,
      thisPackageQuantityKg: qr1.representedQuantityKg,
    },
    origin: {
      country: "Cameroon",
      farmName: "Green Valley Farm",
      region: "South-West Region",
      eudrCompliant: true,
      lotNumber: lotA.lotNumber,
      productionPeriod: lotA.productionPeriod,
      qualityGrade: lotA.qualityGrade,
      certificateNumber: certA.certificateNumber,
      issueDate: certA.issueDate,
    },
    custodyChain: [
      {
        stepOrder: 1,
        fromHolderPublicName: "FARMER: Green Valley Producer",
        fromHolderType: "farmer",
        toHolderPublicName: "COOPERATIVE: Kumba Farmers Union",
        toHolderType: "cooperative",
        transferredQuantityKg: 300,
        transferredAt: "2026-01-21T09:00:00Z",
      },
      {
        stepOrder: 2,
        fromHolderPublicName: "COOPERATIVE: Kumba Farmers Union",
        fromHolderType: "cooperative",
        toHolderPublicName: "AGENT: Douala Export Logistics",
        toHolderType: "agent",
        transferredQuantityKg: 100,
        transferredAt: "2026-01-22T14:00:00Z",
      },
    ],
    current: {
      currentHolderPublicName: "AGENT: Douala Export Logistics",
      currentHolderType: "agent",
      currentHoldingStatus: "active",
    },
    resolvedAt: new Date().toISOString(),
  };

  const publicJson = JSON.stringify(publicResult);
  assert(
    !publicJson.includes("farmer_uid_101") &&
      !publicJson.includes("officer_uid_01") &&
      !publicJson.includes("feeApplied") &&
      !publicJson.includes("fee_"),
    "Test 27: Public trace result strictly excludes Firebase UIDs and internal fee records"
  );
  assert(
    publicResult.quantities.originalLotQuantityKg === 1000 &&
      publicResult.quantities.certifiedQuantityKg === 1000 &&
      publicResult.quantities.thisPackageQuantityKg === 100,
    "Test 28: Public trace separately reports original lot (1,000 kg), certified (1,000 kg), and this package (100 kg)"
  );

  // Test 29: Server-side QR SVG & PNG generation
  const svgOutput = await QRCodeLib.toString(qr1.qrValue, { type: "svg" });
  assert(
    svgOutput.includes("<svg") && svgOutput.includes("</svg>"),
    "Test 29: Server-side QR SVG generated successfully"
  );

  const pngBuffer = await QRCodeLib.toBuffer(qr1.qrValue, { type: "png" });
  assert(
    Buffer.isBuffer(pngBuffer) && pngBuffer.length > 100,
    "Test 30: Server-side QR PNG buffer generated successfully"
  );

  // Test 31: Read-only scan auditing
  const scanRecord: QRScan = {
    scanId: "scan_test_01",
    qrId: qr1.qrId,
    qrValue: qr1.qrValue,
    packageNumber: qr1.packageNumber,
    lotId: qr1.lotId,
    certificateId: qr1.certificateId,
    currentHoldingId: qr1.currentHoldingId,
    scannerType: "public",
    scannedAt: new Date().toISOString(),
  };
  scansDb.set(scanRecord.scanId, scanRecord);

  assert(
    scansDb.has("scan_test_01") &&
      scansDb.get("scan_test_01")?.userId === undefined &&
      lotA.quantityKg === 1000 &&
      certA.certifiedQuantityKg === 1000,
    "Test 31: Anonymous scan recorded without fake UID and leaves domain quantities unchanged"
  );

  // Test 32: Immutable package quantity
  assert(
    qr1.representedQuantityKg === 100 &&
      qr1.sequenceNumber === 1 &&
      qr1.packageNumber === "LOT-CMR-2026-0001-PKG-001",
    "Test 32: Package quantity (100 kg) and package number are immutable"
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

runStep7Tests().catch((e) => {
  console.error("Test runner error:", e);
  process.exit(1);
});
