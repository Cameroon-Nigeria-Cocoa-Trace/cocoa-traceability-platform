import { WarehouseService } from "../lib/warehouse/warehouseService";
import { WarehouseStore } from "../lib/warehouse/warehouseStore";
import { agentService } from "../lib/agent/agentService";
import { agentStore } from "../lib/agent/agentStore";
import { WarehouseActorContext } from "@/types/warehouse";
import { AgentBatchManifest } from "@/types/agent";

interface TestResult {
  suite: string;
  testName: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

const results: TestResult[] = [];

async function runTest(suite: string, testName: string, fn: () => Promise<void>) {
  const start = Date.now();
  try {
    await fn();
    results.push({
      suite,
      testName,
      passed: true,
      durationMs: Date.now() - start,
    });
    console.log(`  ✓ [PASS] ${testName} (${Date.now() - start}ms)`);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    results.push({
      suite,
      testName,
      passed: false,
      error: errorMsg,
      durationMs: Date.now() - start,
    });
    console.error(`  ✗ [FAIL] ${testName}: ${errorMsg}`);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(
      `Assertion failed: ${message}. Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

async function runAllTests() {
  console.log("\n========================================================");
  console.log("RUNNING BACKEND TESTS: WAREHOUSE ACTOR MODULE");
  console.log("========================================================\n");

  const service = new WarehouseService();
  const store = new WarehouseStore();

  const contextIkom: WarehouseActorContext = {
    userId: "usr_wh_mgr_ikom",
    warehouseId: "wh_ikom_central",
    role: "warehouse_manager",
  };

  const contextCalabar: WarehouseActorContext = {
    userId: "usr_wh_mgr_calabar",
    warehouseId: "wh_calabar_port",
    role: "warehouse_manager",
  };

  const superAdminContext: WarehouseActorContext = {
    userId: "admin_super_001",
    warehouseId: "any",
    isSuperAdmin: true,
  };

  // ----------------------------------------------------
  // SUITE 1: Warehouse Registration & Input Validation
  // ----------------------------------------------------
  console.log("Suite 1: Warehouse Registration & Input Validation");

  let newlyCreatedWhId = "";

  await runTest("Registration", "Register New Warehouse Facility with Valid Details", async () => {
    const facility = await service.registerWarehouse(
      {
        name: "Ogoja North Regional Buffer Terminal",
        registrationNumber: "RC-WH-OGJ-2026-088",
        ownerUserId: "usr_wh_mgr_ogoja",
        facilityType: "regional_depot",
        contactEmail: "ogoja-depot@crossriver-cocoa.org",
        contactPhone: "+234 803 999 4433",
        location: {
          address: "Ogoja Transit Junction, Cross River Highway",
          city: "Ogoja",
          lga: "Ogoja",
          state: "Cross River State",
          country: "Nigeria",
          coordinates: { lat: 6.6578, lng: 8.7981 },
          operatingHours: "07:00 - 18:00 WAT",
        },
        maxCapacityKg: 1000000, // 1,000 tonnes
        acceptedCertificates: ["EUDR Origine Cameroun", "Cross River Trace"],
      },
      "usr_wh_mgr_ogoja"
    );

    assert(Boolean(facility.id), "Facility has an ID");
    assertEqual(facility.maxCapacityKg, 1000000, "Max capacity matches");
    assertEqual(facility.maxCapacityTons, 1000, "Tonnage calculated correctly");
    assertEqual(facility.currentStockKg, 0, "Initial stock is 0");
    assertEqual(facility.availableCapacityKg, 1000000, "Available capacity matches");
    assertEqual(facility.operationalStatus, "operational", "Status is operational");
    assertEqual(facility.members.length, 1, "Founder added as warehouse manager");
    newlyCreatedWhId = facility.id;
  });

  await runTest("Registration", "Rejects Missing Required Identification", async () => {
    let caught = false;
    try {
      await service.registerWarehouse(
        {
          name: "",
          registrationNumber: "",
          ownerUserId: "usr_fail",
          facilityType: "regional_depot",
          contactEmail: "fail@test.com",
          contactPhone: "123",
          location: {
            address: "Street",
            city: "City",
            lga: "Lga",
            state: "State",
            country: "Country",
            coordinates: { lat: 5.0, lng: 8.0 },
            operatingHours: "9-5",
          },
          maxCapacityKg: 50000,
        },
        "usr_fail"
      );
    } catch {
      caught = true;
    }
    assert(caught, "Must throw on missing identification fields");
  });

  await runTest("Registration", "Rejects Out-of-Bounds Coordinates", async () => {
    let caught = false;
    try {
      await service.registerWarehouse(
        {
          name: "Invalid Coordinates Terminal",
          registrationNumber: "RC-FAIL-01",
          ownerUserId: "usr_fail",
          facilityType: "regional_depot",
          contactEmail: "coord@test.com",
          contactPhone: "123",
          location: {
            address: "Street",
            city: "City",
            lga: "Lga",
            state: "State",
            country: "Country",
            coordinates: { lat: 95.0, lng: 200.0 }, // Invalid lat/lng
            operatingHours: "9-5",
          },
          maxCapacityKg: 50000,
        },
        "usr_fail"
      );
    } catch {
      caught = true;
    }
    assert(caught, "Must throw on out-of-bounds coordinates");
  });

  await runTest("Registration", "Rejects Non-Positive Max Capacity", async () => {
    let caught = false;
    try {
      await service.registerWarehouse(
        {
          name: "Zero Capacity Terminal",
          registrationNumber: "RC-FAIL-02",
          ownerUserId: "usr_fail",
          facilityType: "regional_depot",
          contactEmail: "zero@test.com",
          contactPhone: "123",
          location: {
            address: "Street",
            city: "City",
            lga: "Lga",
            state: "State",
            country: "Country",
            coordinates: { lat: 5.0, lng: 8.0 },
            operatingHours: "9-5",
          },
          maxCapacityKg: 0,
        },
        "usr_fail"
      );
    } catch {
      caught = true;
    }
    assert(caught, "Must throw on zero/negative capacity");
  });

  // ----------------------------------------------------
  // SUITE 2: Organization, Location & Operational Info
  // ----------------------------------------------------
  console.log("\nSuite 2: Organization, Location & Operational Info");

  const contextOgoja: WarehouseActorContext = {
    userId: "usr_wh_mgr_ogoja",
    warehouseId: newlyCreatedWhId,
  };

  await runTest("Location & Operations", "Update Address, Operating Hours and Coordinates", async () => {
    const updated = await service.updateLocationAndOperations(
      contextOgoja,
      newlyCreatedWhId,
      {
        location: {
          address: "Plot 12 Ogoja Commercial Agro-Park",
          city: "Ogoja",
          coordinates: { lat: 6.6621, lng: 8.8015 },
        },
        operatingHours: "06:00 - 19:00 WAT",
      }
    );

    assertEqual(updated.location.address, "Plot 12 Ogoja Commercial Agro-Park", "Address updated");
    assertEqual(updated.location.operatingHours, "06:00 - 19:00 WAT", "Hours updated");
    assertEqual(updated.location.coordinates.lat, 6.6621, "Coordinates lat updated");
  });

  await runTest("Location & Operations", "Transition Operational Status and Enforce Allowed Values", async () => {
    const maintenance = await service.updateLocationAndOperations(
      contextOgoja,
      newlyCreatedWhId,
      {
        operationalStatus: "maintenance",
        statusReason: "Upgrading dehumidification fans in Bay 2",
      }
    );
    assertEqual(maintenance.operationalStatus, "maintenance", "Status transitioned to maintenance");

    let rejected = false;
    try {
      await service.updateLocationAndOperations(
        contextOgoja,
        newlyCreatedWhId,
        {
          // @ts-expect-error test invalid string
          operationalStatus: "invalid_status_type",
        }
      );
    } catch {
      rejected = true;
    }
    assert(rejected, "Must reject arbitrary status not in allowed list");

    // Restore to operational
    const restored = await service.updateLocationAndOperations(
      contextOgoja,
      newlyCreatedWhId,
      {
        operationalStatus: "operational",
        statusReason: "Maintenance complete",
      }
    );
    assertEqual(restored.operationalStatus, "operational", "Restored to operational");
  });

  // ----------------------------------------------------
  // SUITE 3: Scoped Authorization Enforcement
  // ----------------------------------------------------
  console.log("\nSuite 3: Scoped Authorization Enforcement");

  await runTest("Scoped Authorization", "Warehouse A Accessing Its Own Facility Succeeds", async () => {
    const facility = await service.getFacility(contextIkom, "wh_ikom_central");
    assert(Boolean(facility), "Facility returned for legitimate owner");
    assertEqual(facility?.id, "wh_ikom_central", "ID matches");

    const calabarFacility = await service.getFacility(contextCalabar, "wh_calabar_port");
    assertEqual(calabarFacility?.id, "wh_calabar_port", "Calabar facility returned for Calabar actor");
  });

  await runTest("Scoped Authorization", "Warehouse A Accessing Warehouse B is Strictly Blocked", async () => {
    let blocked = false;
    try {
      await service.getFacility(contextIkom, "wh_calabar_port");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Scoped authorization failure")) {
        blocked = true;
      }
    }
    assert(blocked, "Warehouse A accessing Warehouse B must throw Scoped authorization failure");
  });

  await runTest("Scoped Authorization", "Warehouse A Modifying Warehouse B Capacity is Blocked", async () => {
    let blocked = false;
    try {
      await service.updateCapacity(contextIkom, "wh_calabar_port", 15000000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Scoped authorization failure")) {
        blocked = true;
      }
    }
    assert(blocked, "Warehouse A updating Warehouse B capacity must be blocked");
  });

  await runTest("Scoped Authorization", "Warehouse A Listing Warehouse B Receipts is Blocked", async () => {
    let blocked = false;
    try {
      await service.listReceipts(contextIkom, "wh_calabar_port");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Scoped authorization failure")) {
        blocked = true;
      }
    }
    assert(blocked, "Warehouse A listing Warehouse B receipts must be blocked");
  });

  await runTest("Scoped Authorization", "SuperAdmin Has Scoped Oversight Access", async () => {
    const facility = await service.getFacility(superAdminContext, "wh_calabar_port");
    assert(Boolean(facility), "SuperAdmin can inspect any warehouse facility");
  });

  // ----------------------------------------------------
  // SUITE 4: Administrative Status & Non-Overridable Rules
  // ----------------------------------------------------
  console.log("\nSuite 4: Administrative Status & Non-Overridable Rules");

  await runTest("Admin Status", "Admin-Suspended Warehouse Cannot Receive Cocoa", async () => {
    // Administratively suspend Ogoja warehouse
    await store.updateFacility(newlyCreatedWhId, {
      adminControlledStatus: "suspended",
      statusReason: "Corridor audit pending for unregistered lot intake",
    });

    let receiveBlocked = false;
    try {
      await service.receiveCocoaDelivery(contextOgoja, {
        warehouseId: newlyCreatedWhId,
        officerUserId: contextOgoja.userId,
        officerName: "Ogoja Manager",
        sourceType: "direct_lot",
        sourceReferenceId: "LOT-CR-001",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("WAREHOUSE_ADMIN_SUSPENDED")) {
        receiveBlocked = true;
      }
    }
    assert(receiveBlocked, "Receiving into an administratively suspended warehouse must be blocked");

    // Re-activate
    await store.updateFacility(newlyCreatedWhId, {
      adminControlledStatus: "active",
      statusReason: "Audit cleared",
    });
  });

  // ----------------------------------------------------
  // SUITE 5: Receiving Cocoa & Certificates (Idempotency & Integration)
  // ----------------------------------------------------
  console.log("\nSuite 5: Receiving Cocoa & Certificates (Idempotency & Integration)");

  // Prepare a test manifest from Agent service destined for Ikom Central Warehouse
  const testManifestId = `manifest_agt_test_${Date.now()}`;
  const mockManifest: AgentBatchManifest = {
    id: testManifestId,
    manifestNumber: `MAN-TEST-${Date.now().toString().slice(-4)}`,
    agentId: "agent_cr_001",
    agentName: "Emmanuel Etim",
    transactionIds: ["txn_agt_001"],
    totalQuantityKg: 50000, // 50,000 kg (50 tonnes)
    totalBagCount: 782,
    originSummary: "Cross River Corridor / Southwest Cameroon",
    cooperativesInvolved: ["SOWESCOP / Mile 18 Cooperative"],
    warehouseId: "wh_ikom_central",
    warehouseName: "Ikom Central Aggregation Warehouse",
    warehouseLocation: "Ikom Commercial District",
    traceCertificateNumber: "CERT-AGT-AGG-9921",
    handoverDate: new Date().toISOString(),
    status: "prepared",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await agentStore.saveManifest(mockManifest);

  let firstReceiptId = "";

  await runTest("Receiving", "Receive Agent Manifest & Downstream Status Handover", async () => {
    const initialWh = await store.getFacility("wh_ikom_central");
    const stockBefore = initialWh?.currentStockKg || 0;

    const { receipt, updatedFacility } = await service.receiveCocoaDelivery(
      contextIkom,
      {
        warehouseId: "wh_ikom_central",
        officerUserId: contextIkom.userId,
        officerName: "Godwin Bassey",
        sourceType: "agent_manifest",
        sourceReferenceId: testManifestId,
        notes: "Inspected at Gate 1; moisture 7.3%, zero mold detected.",
      }
    );

    assert(Boolean(receipt.id), "Receipt ID generated");
    assertEqual(receipt.quantityKg, 50000, "Received quantity matches manifest");
    assertEqual(receipt.sourceBatchCode, mockManifest.manifestNumber, "Batch code preserved");
    assertEqual(receipt.traceCertificateNumber, "CERT-AGT-AGG-9921", "Certificate number tracked");
    assertEqual(receipt.status, "received", "Receipt status is received");

    // Stock verification
    assertEqual(updatedFacility.currentStockKg, stockBefore + 50000, "Stock incremented atomically");

    // Verify downstream manifest updated via agent service
    const manifestAfter = await agentService.getManifest(testManifestId);
    assertEqual(
      manifestAfter?.status,
      "accepted_by_warehouse",
      "Agent manifest status transitioned to accepted_by_warehouse"
    );
    assertEqual(
      manifestAfter?.receivedByWarehouseOfficer,
      "Godwin Bassey",
      "Receiving officer stamped on agent manifest"
    );

    firstReceiptId = receipt.id;
  });

  await runTest("Receiving", "Idempotency: Duplicate Receipt is Strictly Rejected", async () => {
    let duplicateRejected = false;
    try {
      await service.receiveCocoaDelivery(contextIkom, {
        warehouseId: "wh_ikom_central",
        officerUserId: contextIkom.userId,
        officerName: "Godwin Bassey",
        sourceType: "agent_manifest",
        sourceReferenceId: testManifestId, // Exact same reference
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("DUPLICATE_RECEIPT_ERROR")) {
        duplicateRejected = true;
      }
    }
    assert(duplicateRejected, "Duplicate receiving must throw DUPLICATE_RECEIPT_ERROR");
  });

  await runTest("Receiving", "Destination Mismatch Rejects Intake", async () => {
    // Create manifest designated for Calabar, but attempt intake at Ikom
    const calabarManifestId = `manifest_cal_${Date.now()}`;
    await agentStore.saveManifest({
      id: calabarManifestId,
      manifestNumber: `MAN-CAL-${Date.now().toString().slice(-4)}`,
      agentId: "agent_cr_001",
      agentName: "Emmanuel Etim",
      transactionIds: ["txn_agt_001"],
      totalQuantityKg: 10000,
      totalBagCount: 157,
      originSummary: "Corridor",
      cooperativesInvolved: ["SOWESCOP"],
      warehouseId: "wh_calabar_port", // DESIGNATED FOR CALABAR
      warehouseName: "Calabar Port Maritime Export Facility",
      warehouseLocation: "Calabar Port",
      traceCertificateNumber: "CERT-CAL-01",
      handoverDate: new Date().toISOString(),
      status: "prepared",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    let mismatchCaught = false;
    try {
      await service.receiveCocoaDelivery(contextIkom, {
        warehouseId: "wh_ikom_central", // ATTEMPT AT IKOM
        officerUserId: contextIkom.userId,
        officerName: "Godwin Bassey",
        sourceType: "agent_manifest",
        sourceReferenceId: calabarManifestId,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("DESTINATION_MISMATCH")) {
        mismatchCaught = true;
      }
    }
    assert(mismatchCaught, "Intake into wrong warehouse must throw DESTINATION_MISMATCH");
  });

  // ----------------------------------------------------
  // SUITE 6: Capacity Enforcement Under Concurrency & Over-Capacity
  // ----------------------------------------------------
  console.log("\nSuite 6: Capacity Enforcement Under Concurrency & Over-Capacity");

  await runTest("Capacity Enforcement", "Receipt Exceeding Available Capacity is Strictly Rejected", async () => {
    // Register a dedicated micro warehouse with only 2,000 kg capacity
    const microWh = await service.registerWarehouse(
      {
        id: "wh_micro_test",
        name: "Micro Storage Hub",
        registrationNumber: "RC-MICRO-01",
        ownerUserId: "usr_micro_mgr",
        facilityType: "regional_depot",
        contactEmail: "micro@crossriver-cocoa.org",
        contactPhone: "+234 803 111 9999",
        location: {
          address: "Micro Bay 1",
          city: "Ikom",
          lga: "Ikom",
          state: "Cross River State",
          country: "Nigeria",
          coordinates: { lat: 5.96, lng: 8.71 },
          operatingHours: "08:00 - 17:00 WAT",
        },
        maxCapacityKg: 2000, // 2,000 kg max capacity
      },
      "usr_micro_mgr"
    );

    const contextMicro: WarehouseActorContext = {
      userId: "usr_micro_mgr",
      warehouseId: microWh.id,
    };

    // Attempt to receive direct_lot (3,000 kg) which exceeds 2,000 kg capacity
    let overCapacityCaught = false;
    try {
      await service.receiveCocoaDelivery(contextMicro, {
        warehouseId: microWh.id,
        officerUserId: contextMicro.userId,
        officerName: "Micro Manager",
        sourceType: "direct_lot",
        sourceReferenceId: "LOT-OVERSIZED-001",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("RECEIPT_EXCEEDS_CAPACITY")) {
        overCapacityCaught = true;
      }
    }
    assert(overCapacityCaught, "Exceeding available capacity must throw RECEIPT_EXCEEDS_CAPACITY");

    // Confirm stock remained 0
    const microAfter = await store.getFacility(microWh.id);
    assertEqual(microAfter?.currentStockKg, 0, "Stock unchanged after rejected receipt");
  });

  await runTest("Capacity Enforcement", "Concurrent Receipts Increment Stock Atomically", async () => {
    // Ogoja warehouse has currentStock = 0, maxCapacity = 1,000,000 kg
    // Test atomic concurrency by launching 5 parallel atomic stock mutations
    const promises = [
      store.mutateStockAtomic(newlyCreatedWhId, 5000),
      store.mutateStockAtomic(newlyCreatedWhId, 10000),
      store.mutateStockAtomic(newlyCreatedWhId, 15000),
      store.mutateStockAtomic(newlyCreatedWhId, 20000),
      store.mutateStockAtomic(newlyCreatedWhId, 25000),
    ];

    await Promise.all(promises);

    const facility = await store.getFacility(newlyCreatedWhId);
    // 0 + 5000 + 10000 + 15000 + 20000 + 25000 = 75,000 kg
    assertEqual(facility?.currentStockKg, 75000, "Atomic mutex prevented lost updates in concurrency");
  });

  // ----------------------------------------------------
  // SUITE 7: Append-Only Receipt Ledger & Reversals
  // ----------------------------------------------------
  console.log("\nSuite 7: Append-Only Receipt Ledger & Reversals");

  await runTest("Ledger & Reversals", "Reversal Decrements Stock & Appends Reversal Record", async () => {
    const whBefore = await store.getFacility("wh_ikom_central");
    const stockBefore = whBefore?.currentStockKg || 0;

    const { reversalReceipt, updatedFacility } = await service.createReceiptReversal(
      contextIkom,
      firstReceiptId,
      "Incorrect moisture sensor calibration required batch re-testing"
    );

    assertEqual(reversalReceipt.status, "reversal", "Reversal receipt status");
    assertEqual(reversalReceipt.reversalOfReceiptId, firstReceiptId, "Links to original receipt");
    assertEqual(reversalReceipt.quantityKg, -50000, "Negative quantity delta");

    // Stock decremented by 50,000 kg
    assertEqual(updatedFacility.currentStockKg, stockBefore - 50000, "Stock restored atomically");

    // Check ledger contains both original and reversal (no deletion)
    const ledger = await service.listReceipts(contextIkom, "wh_ikom_central");
    assert(ledger.some((r) => r.id === firstReceiptId), "Original receipt still in ledger");
    assert(ledger.some((r) => r.id === reversalReceipt.id), "Reversal receipt in ledger");
  });

  await runTest("Ledger & Reversals", "Cannot Reverse an Entry That is Already a Reversal", async () => {
    const ledger = await service.listReceipts(contextIkom, "wh_ikom_central");
    const reversal = ledger.find((r) => r.status === "reversal");
    assert(Boolean(reversal), "Found reversal entry");

    let rejected = false;
    try {
      await service.createReceiptReversal(contextIkom, reversal!.id, "Double reverse attempt");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Cannot reverse an entry that is already a reversal")) {
        rejected = true;
      }
    }
    assert(rejected, "Must reject reversing a reversal record");
  });

  // ----------------------------------------------------
  // SUITE 8: Cross River State Full Trace Certificate Requests
  // ----------------------------------------------------
  console.log("\nSuite 8: Cross River State Full Trace Certificate Requests");

  await runTest("Full Trace Certificate", "Request Full Trace Certificate with Dynamic Admin Fee", async () => {
    // Current stock at Ikom is 1,250,000 kg
    // Request full trace certificate for 100,000 kg
    const req = await service.requestCrossRiverFullTraceCertificate(contextIkom, {
      warehouseId: "wh_ikom_central",
      officerId: contextIkom.userId,
      officerName: "Godwin Bassey",
      batchCode: "BATCH-WH-IKM-2026-FT01",
      receiptIds: [firstReceiptId],
      totalQuantityKg: 100000,
      originCorridor: "Cross River State Corridor / Manyu Border",
      destinationPortOrBuyer: "Calabar Port Maritime Export Facility",
    });

    assert(Boolean(req.id), "Request ID generated");
    assert(Boolean(req.certificateNumber?.startsWith("CERT-CRS-FULLTRACE-")), "Full trace certificate number");
    assertEqual(req.status, "approved", "Request status is approved");
    assertEqual(req.feeCodeApplied, "FEE_EUDR_AUDIT", "EUDR audit fee code applied");
    // 100,000 kg * 1800 NGN = 180,000,000 NGN. At 0.75% = 1,350,000 NGN.
    assertEqual(req.feeAmountPaid, 1350000, "Dynamic administrative fee calculated from Admin config");
  });

  await runTest("Full Trace Certificate", "Rejects Certificate Request Exceeding Current Stock", async () => {
    let rejected = false;
    try {
      await service.requestCrossRiverFullTraceCertificate(contextIkom, {
        warehouseId: "wh_ikom_central",
        officerId: contextIkom.userId,
        officerName: "Godwin Bassey",
        batchCode: "BATCH-WH-IKM-OVERFLOW",
        receiptIds: [],
        totalQuantityKg: 90000000, // 90,000 tonnes exceeds current stock
        originCorridor: "Corridor",
        destinationPortOrBuyer: "Calabar Port",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("INSUFFICIENT_STOCK")) {
        rejected = true;
      }
    }
    assert(rejected, "Must reject certificate request exceeding warehouse physical stock");
  });

  // ----------------------------------------------------
  // SUITE 9: Customs Export Service Requests
  // ----------------------------------------------------
  console.log("\nSuite 9: Customs Export Service Requests");

  await runTest("Customs Requests", "Submit Customs Clearance Request with Dynamic Fee", async () => {
    const custReq = await service.submitCustomsExportRequest(contextIkom, {
      warehouseId: "wh_ikom_central",
      officerId: contextIkom.userId,
      manifestOrBatchCode: "BATCH-WH-IKM-2026-FT01",
      quantityKg: 100000,
      destinationPort: "Calabar Port Maritime Terminal",
      exportLicenseNumber: "EXP-LIC-CR-2026-081",
      notes: "Prepared for Nigerian Customs export inspection",
    });

    assert(Boolean(custReq.id), "Customs request ID generated");
    assertEqual(custReq.status, "pending_clearance", "Status is pending_clearance");
    assertEqual(custReq.feeCodeApplied, "FEE_CUSTOMS_CLEARANCE", "Fee code FEE_CUSTOMS_CLEARANCE applied");
    assertEqual(custReq.feeAmount, 45000, "Dynamic customs charge of 45,000 NGN applied from Admin config");
    assert(Boolean(custReq.customsReferenceNumber), "Customs reference number assigned");
  });

  // ----------------------------------------------------
  // SUITE 10: Warehouse Dashboard & Metrics Contract
  // ----------------------------------------------------
  console.log("\nSuite 10: Warehouse Dashboard & Metrics Contract");

  await runTest("Dashboard Metrics", "Expose Complete Warehouse Operational Data Contract", async () => {
    const dashboard = await service.getDashboardData(contextIkom, "wh_ikom_central");

    assert(Boolean(dashboard.warehouse), "Warehouse facility present");
    assertEqual(dashboard.warehouse.id, "wh_ikom_central", "Warehouse ID matches");

    const m = dashboard.metrics;
    assert(m.maxCapacityKg > 0, "Max capacity reported");
    assert(m.currentStockKg >= 0, "Current stock reported");
    assert(m.availableCapacityKg >= 0, "Available capacity reported");
    assertEqual(m.maxCapacityTons, m.maxCapacityKg / 1000, "Tonnage conversion matches");
    assert(m.totalReceiptsCount >= 1, "Receipts counted");
    assert(m.totalReversalsCount >= 1, "Reversals counted");
    assert(dashboard.recentReceipts.length >= 2, "Receipts list populated");
    assert(dashboard.pendingFullTraceRequests.length >= 1, "Full trace requests populated");
    assert(dashboard.recentCustomsRequests.length >= 1, "Customs requests populated");
  });

  // ----------------------------------------------------
  // SUMMARY REPORT
  // ----------------------------------------------------
  console.log("\n========================================================");
  console.log("WAREHOUSE ACTOR MODULE TEST RESULTS SUMMARY");
  console.log("========================================================");

  const passedTests = results.filter((r) => r.passed).length;
  const failedTests = results.filter((r) => !r.passed).length;

  console.log(`Total Tests Run: ${results.length}`);
  console.log(`Passed:         ${passedTests}`);
  console.log(`Failed:         ${failedTests}`);

  if (failedTests > 0) {
    console.error("\nFailed Tests Details:");
    results
      .filter((r) => !r.passed)
      .forEach((r) => console.error(`  - [${r.suite}] ${r.testName}: ${r.error}`));
    process.exit(1);
  } else {
    console.log("\nALL WAREHOUSE ACTOR MODULE TESTS PASSED PERFECTLY!\n");
    process.exit(0);
  }
}

runAllTests().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
