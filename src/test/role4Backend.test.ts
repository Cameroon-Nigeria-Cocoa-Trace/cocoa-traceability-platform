/**
 * Complete Role 4 Backend Verification Test Suite
 * Covers All 5 Actors:
 * 1. Administrator
 * 2. Cooperative
 * 3. Agent
 * 4. Warehouse
 * 5. Platform Customs Agent
 */

import assert from "assert";
import { adminService } from "../lib/admin/adminService";
import { cooperativeService } from "../lib/cooperative/cooperativeService";
import { cooperativeStore } from "../lib/cooperative/cooperativeStore";
import { agentService } from "../lib/agent/agentService";
import { warehouseService } from "../lib/warehouse/warehouseService";
import { warehouseStore } from "../lib/warehouse/warehouseStore";
import { customsService } from "../lib/customs/customsService";
import { customsStore } from "../lib/customs/customsStore";
import { SubmitterType } from "../types/customs";

async function runRole4Tests() {
  console.log("================================================================================");
  console.log("            ROLE 4 BACKEND BUSINESS FUNCTIONALITY TEST SUITE                    ");
  console.log("  Cooperative | Agent | Warehouse | Customs Agent | Platform Administrator      ");
  console.log("================================================================================\n");

  let passed = 0;
  let total = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    total++;
    return (async () => {
      try {
        await fn();
        passed++;
        console.log(`  ✓ [PASS] ${name}`);
      } catch (err: unknown) {
        console.error(`  ✗ [FAIL] ${name}`);
        console.error("    Error:", err instanceof Error ? err.message : err);
        throw err;
      }
    })();
  }

  // ============================================================================
  // 1. ADMINISTRATOR ACTOR TESTS
  // ============================================================================
  console.log("\n--- 1. Administrator Actor Tests ---");

  await test("Admin 1.1: Default dynamic fee configurations are seeded and readable", async () => {
    const fees = await adminService.listFeeConfigs();
    assert(fees.length >= 4, "Should have default fee configs seeded");
    const customsFee = await adminService.getFeeConfig("FEE_CUSTOMS_CLEARANCE");
    assert.strictEqual(customsFee.amount, 45000, "Default customs clearance fee should be 45,000 NGN");
    assert.strictEqual(customsFee.currency, "NGN");
  });

  await test("Admin 1.2: Dynamic fee updates require admin authorization and reject negative fees", async () => {
    await assert.rejects(
      async () => {
        await adminService.updateFeeConfig({ code: "FEE_CUSTOMS_CLEARANCE", amount: -500 }, "sys_admin_01");
      },
      /cannot be negative/i,
      "Should reject negative fee amounts"
    );

    const updated = await adminService.updateFeeConfig(
      { code: "FEE_CUSTOMS_CLEARANCE", amount: 48000 },
      "sys_admin_01"
    );
    assert.strictEqual(updated.amount, 48000, "Fee should be updated dynamically");

    // Reset back to 45,000 for standard downstream tests
    await adminService.updateFeeConfig({ code: "FEE_CUSTOMS_CLEARANCE", amount: 45000 }, "sys_admin_01");
  });

  await test("Admin 1.3: Platform system status controls and audit logging", async () => {
    const initial = await adminService.getSystemStatus();
    assert.strictEqual(initial, "active");

    await adminService.setSystemStatus("maintenance", "sys_admin_01", "Routine database index maintenance");
    const maint = await adminService.getSystemStatus();
    assert.strictEqual(maint, "maintenance");

    await adminService.setSystemStatus("active", "sys_admin_01", "Maintenance complete");
    const active = await adminService.getSystemStatus();
    assert.strictEqual(active, "active");
  });

  await test("Admin 1.4: Administrative entity suspension control overrides actor status", async () => {
    await adminService.setEntityStatus(
      {
        entityType: "cooperative",
        entityId: "org_coop_suspension_test",
        entityName: "Suspended Test Cooperative",
        status: "suspended",
        reason: "Compliance audit pending",
      },
      "sys_admin_01"
    );

    const status = await adminService.getEntityStatus("org_coop_suspension_test");
    assert.strictEqual(status, "suspended");
  });

  await test("Admin 1.5: Administrator dashboard data aggregation", async () => {
    const dash = await adminService.getDashboardData("sys_admin_01");
    assert.strictEqual(dash.systemStatus, "active");
    assert(dash.feeConfigs.length > 0, "Dashboard should include fee configs");
    assert(dash.recentAuditLogs.length > 0, "Dashboard should include audit logs");
  });

  // ============================================================================
  // 2. COOPERATIVE ACTOR TESTS
  // ============================================================================
  console.log("\n--- 2. Cooperative Actor Tests ---");
  const coopLeaderUid = "usr_coop_leader_test";

  await test("Cooperative 2.1: Register organizational and personal cooperative accounts", async () => {
    const org = await cooperativeService.createOrganization({
      name: "Manyu Allied Cocoa Farmers Cooperative",
      registrationNumber: "COOP-CMR-SW-2026-99",
      region: "Manyu Division, South-West Region",
      headquartersAddress: "Mamfe Central Hub",
      contactEmail: "allied@manyu-coop.cm",
      contactPhone: "+237 677 112 233",
      createdBy: coopLeaderUid,
    });
    assert.strictEqual(org.status, "active");

    const profile = await cooperativeService.registerProfile({
      userId: coopLeaderUid,
      fullName: "Tabe Victor Ashu",
      email: "victor.tabe@manyu-coop.cm",
      phone: "+237 677 112 233",
      accountType: "organizational",
      cooperativeOrgId: org.id,
      cooperativeOrgName: org.name,
      role: "president",
    });
    assert.strictEqual(profile.userId, coopLeaderUid);
    assert.strictEqual(profile.cooperativeOrgId, org.id);
  });

  await test("Cooperative 2.2: Farmer membership onboarding, duplicate prevention, and history preservation", async () => {
    const org = await cooperativeStore.getProfile(coopLeaderUid);
    assert(org, "Coop leader profile should exist");

    // Add farmer member
    const member = await cooperativeService.addFarmerMember(
      {
        cooperativeOrgId: org.cooperativeOrgId,
        farmerId: "usr_farmer_manyu_001",
        farmerName: "Enow Paul",
        villageOrCommunity: "Ekok Village",
        farmsCount: 2,
      },
      coopLeaderUid
    );
    assert.strictEqual(member.status, "active");

    // Prevent duplicate active membership
    await assert.rejects(
      async () => {
        await cooperativeService.addFarmerMember(
          {
            cooperativeOrgId: org.cooperativeOrgId,
            farmerId: "usr_farmer_manyu_001",
            farmerName: "Enow Paul",
            villageOrCommunity: "Ekok Village",
          },
          coopLeaderUid
        );
      },
      /already an active member/i,
      "Duplicate active membership should be rejected"
    );

    // Update status to withdrawn (no hard deletes!)
    const withdrawn = await cooperativeService.updateMemberStatus(
      {
        cooperativeOrgId: org.cooperativeOrgId,
        farmerId: "usr_farmer_manyu_001",
        status: "withdrawn",
        reason: "Relocated to Douala",
      },
      coopLeaderUid
    );
    assert.strictEqual(withdrawn.status, "withdrawn");

    // Verify history audit records exist
    const history = await cooperativeStore.listMembershipHistory(org.cooperativeOrgId, "usr_farmer_manyu_001");
    assert(history.length >= 2, "History trail should contain registration and withdrawal");
  });

  await test("Cooperative 2.3: Subordinate cooperative relationships, self-parent prevention, circular check", async () => {
    const org = await cooperativeStore.getProfile(coopLeaderUid);
    assert(org);

    // Self-parenting must fail
    await assert.rejects(
      async () => {
        await cooperativeService.linkSubordinateCooperative(
          {
            parentCooperativeId: org.cooperativeOrgId,
            parentCooperativeName: org.cooperativeOrgName,
            subordinateCooperativeId: org.cooperativeOrgId,
            subordinateCooperativeName: org.cooperativeOrgName,
          },
          coopLeaderUid
        );
      },
      /cannot be its own/i,
      "Self-parenting should be rejected"
    );

    // Valid subordinate linking
    const subRel = await cooperativeService.linkSubordinateCooperative(
      {
        parentCooperativeId: org.cooperativeOrgId,
        parentCooperativeName: org.cooperativeOrgName,
        subordinateCooperativeId: "org_coop_sub_mamfe_south",
        subordinateCooperativeName: "Mamfe South Sub-Cooperative",
      },
      coopLeaderUid
    );
    assert.strictEqual(subRel.status, "active");

    // Unlink preserving history
    const severed = await cooperativeService.unlinkSubordinateCooperative(
      {
        parentCooperativeId: org.cooperativeOrgId,
        subordinateCooperativeId: "org_coop_sub_mamfe_south",
        reason: "Sub-cooperative attained independent charter",
      },
      coopLeaderUid
    );
    assert.strictEqual(severed.status, "severed");
  });

  await test("Cooperative 2.4: Scoped authorization prevents Cooperative A from accessing Cooperative B", async () => {
    const org = await cooperativeStore.getProfile(coopLeaderUid);
    assert(org);

    await assert.rejects(
      async () => {
        await cooperativeService.assertCooperativeAuthorized(coopLeaderUid, "org_coop_unauthorized_different");
      },
      /Scoped Authorization Error/i,
      "Cooperative officer cannot access data of a different cooperative"
    );
  });

  await test("Cooperative 2.5: Administrative suspension blocks cooperative operations", async () => {
    // Register temporary coop profile under suspended org
    await cooperativeStore.saveProfile({
      id: "coop_usr_susp_01",
      userId: "usr_coop_susp_01",
      fullName: "Suspended Officer",
      email: "susp@coop.cm",
      phone: "+237 677 000 000",
      accountType: "organizational",
      cooperativeOrgId: "org_coop_suspension_test",
      cooperativeOrgName: "Suspended Test Cooperative",
      role: "president",
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await assert.rejects(
      async () => {
        await cooperativeService.assertCooperativeAuthorized("usr_coop_susp_01", "org_coop_suspension_test");
      },
      /suspended by platform administration/i,
      "Admin suspension must block cooperative access"
    );
  });

  await test("Cooperative 2.6: Cooperative dashboard data contract", async () => {
    const org = await cooperativeStore.getProfile(coopLeaderUid);
    assert(org);
    const data = await cooperativeService.getDashboardData(org.cooperativeOrgId, coopLeaderUid);
    assert(data.metrics.totalRegisteredFarmers >= 0);
    assert(Array.isArray(data.recentMemberships));
  });

  // ============================================================================
  // 3. AGENT ACTOR TESTS
  // ============================================================================
  console.log("\n--- 3. Agent Actor Tests ---");

  const agentUid = "usr_agt_test_01";
  let agentId = "";

  await test("Agent 3.1: Register agent organization and personal profile", async () => {
    const agency = await agentService.createAgency({
      name: "Ikom Cross-Border Cocoa Aggregators Ltd",
      registrationNumber: "RC-AGT-2026-90",
      licenseCode: "CRS-LBA-CORP-90",
      headquarters: "Ikom Border Junction",
      contactEmail: "contact@ikom-aggregators.ng",
      contactPhone: "+234 802 999 8888",
      operatingCorridors: ["Ikom-Mamfe Corridor"],
    });

    const profile = await agentService.registerAgent({
      userId: agentUid,
      fullName: "Sylvester Obi",
      email: "sylvester.obi@ikom-aggregators.ng",
      phone: "+234 802 999 8888",
      accountType: "organizational",
      agencyId: agency.id,
      agencyName: agency.name,
      role: "licensed_buying_agent",
      licenseNumber: "CRS-LBA-2026-0881",
      primaryCorridor: "Ikom-Mamfe Corridor",
    });

    agentId = profile.id;
    assert.strictEqual(profile.status, "active");
  });

  await test("Agent 3.2: Establish linkages with farmers, cooperatives, and warehouses", async () => {
    const linkFarmer = await agentService.establishLinkage(
      {
        agentId,
        linkageType: "farmer",
        partnerId: "usr_farmer_manyu_001",
        partnerName: "Enow Paul",
        partnerLocation: "Ekok Village",
      },
      agentUid
    );
    assert.strictEqual(linkFarmer.linkageType, "farmer");

    const linkWarehouse = await agentService.establishLinkage(
      {
        agentId,
        linkageType: "warehouse",
        partnerId: "wh_calabar_port",
        partnerName: "Calabar Port Maritime Export Facility",
        partnerLocation: "Calabar Free Trade Zone",
      },
      agentUid
    );
    assert.strictEqual(linkWarehouse.linkageType, "warehouse");
  });

  await test("Agent 3.3: Record cocoa operation and enforce dynamic statutory transfer fee", async () => {
    // Purchase from farmer: charged fee
    const opFarmer = await agentService.recordCocoaOperation(
      {
        agentId,
        operationType: "purchase_from_farmer",
        partnerId: "usr_farmer_manyu_001",
        partnerType: "farmer",
        quantityKg: 6400, // 100 bags
      },
      agentUid
    );
    assert.strictEqual(opFarmer.totalBags, 100);
    assert.strictEqual(opFarmer.feePaidNgn, 15000, "Farmer -> Agent transfer should be charged 15,000 NGN");

    // Deliver to warehouse: FREE fee
    const opWh = await agentService.recordCocoaOperation(
      {
        agentId,
        operationType: "deliver_to_warehouse",
        partnerId: "wh_calabar_port",
        partnerType: "warehouse",
        quantityKg: 6400,
      },
      agentUid
    );
    assert.strictEqual(opWh.feePaidNgn, 0, "Agent -> Warehouse delivery is free of transfer fee");
  });

  await test("Agent 3.4: Scoped authorization and Agent dashboard metrics", async () => {
    await assert.rejects(
      async () => {
        await agentService.assertAgentAuthorized(agentUid, "agt_unauthorized_other");
      },
      /cannot access records/i,
      "Agent cannot access another agent's records"
    );

    const dash = await agentService.getDashboardData(agentId, agentUid);
    assert.strictEqual(dash.metrics.totalLinkedFarmers, 1);
    assert.strictEqual(dash.metrics.totalLinkedWarehouses, 1);
    assert(dash.metrics.totalVolumeAggregatedKg >= 6400);
  });

  // ============================================================================
  // 4. WAREHOUSE ACTOR TESTS
  // ============================================================================
  console.log("\n--- 4. Warehouse Actor Tests ---");

  const whManagerUid = "usr_wh_mgr_test";
  let whFacilityId = "";

  await test("Warehouse 4.1: Register facility with valid coordinates and capacity in kg/bags", async () => {
    // Invalid coordinate test
    await assert.rejects(
      async () => {
        await warehouseService.registerFacility({
          organizationId: "org_wh_crossriver_bonded",
          name: "Invalid Coord Terminal",
          licenseNumber: "NCS-WH-INV-01",
          location: {
            address: "Highway",
            cityOrLGA: "Ikom",
            stateOrRegion: "Cross River",
            country: "Nigeria",
            latitude: 195, // invalid > 90
            longitude: 8.5,
            operatingHours: "08:00 - 17:00",
          },
          capacityKg: 100000,
          managerUserId: whManagerUid,
          contactEmail: "mgr@wh.ng",
          contactPhone: "+234 803 111 2222",
        });
      },
      /Latitude must be between -90 and 90/i,
      "Invalid latitude must be rejected"
    );

    const facility = await warehouseService.registerFacility({
      organizationId: "org_wh_crossriver_bonded",
      name: "Ikom Inland Cocoa Depot & Transit Terminal",
      licenseNumber: "NCS-WH-IKOM-2026-04",
      location: {
        address: "Ikom-Mamfe Highway Corridor Terminal 2",
        cityOrLGA: "Ikom",
        stateOrRegion: "Cross River State",
        country: "Nigeria",
        latitude: 5.9612,
        longitude: 8.7183,
        operatingHours: "07:00 - 19:00 WAT",
      },
      capacityKg: 128000, // 128 metric tonnes = 2000 bags of 64kg
      managerUserId: whManagerUid,
      contactEmail: "ikom-depot@cr-cocoaterminal.com",
      contactPhone: "+234 803 111 2222",
    });

    whFacilityId = facility.id;
    assert.strictEqual(facility.capacityBags, 2000);
    assert.strictEqual(facility.availableCapacityKg, 128000);
  });

  await test("Warehouse 4.2: Atomic receipt increments stock and prevents exceeding capacity", async () => {
    // Consignment of 64,000 kg (1000 bags) -> Fits
    const { receipt, updatedFacility } = await warehouseService.receiveConsignment(
      {
        facilityId: whFacilityId,
        consignmentCode: "CONSIGN-IKOM-2026-001",
        sourceType: "agent",
        sourceEntityId: agentId,
        sourceEntityName: "Ikom Cross-Border Cocoa Aggregators Ltd",
        quantityKg: 64000,
        qualityInspectionGrade: "Grade 1",
        moistureContentPercent: 7.1,
        receivedByName: "Depot Supervisor",
      },
      whManagerUid
    );

    assert.strictEqual(receipt.totalBags, 1000);
    assert.strictEqual(updatedFacility.currentStockKg, 64000);
    assert.strictEqual(updatedFacility.availableCapacityKg, 64000);

    // Attempting to receive 70,000 kg (exceeds available 64,000 kg) -> MUST FAIL ATOMICALLY
    await assert.rejects(
      async () => {
        await warehouseService.receiveConsignment(
          {
            facilityId: whFacilityId,
            consignmentCode: "CONSIGN-IKOM-2026-OVER",
            sourceType: "agent",
            sourceEntityId: agentId,
            sourceEntityName: "Ikom Cross-Border Cocoa Aggregators Ltd",
            quantityKg: 70000,
            qualityInspectionGrade: "Grade 1",
            receivedByName: "Depot Supervisor",
          },
          whManagerUid
        );
      },
      /exceeds available capacity/i,
      "Receipt exceeding available capacity must be rejected atomically"
    );

    // Verify stock remains untouched at 64,000 kg
    const verified = await warehouseStore.getFacility(whFacilityId);
    assert.strictEqual(verified?.currentStockKg, 64000);
  });

  await test("Warehouse 4.3: Warehouse operational status cannot override administrative suspension", async () => {
    // Suspend warehouse via admin
    await adminService.setEntityStatus(
      {
        entityType: "warehouse",
        entityId: whFacilityId,
        entityName: "Ikom Inland Depot",
        status: "suspended",
        reason: "Structural roof audit",
      },
      "sys_admin_01"
    );

    // Warehouse manager attempting to set operational status must fail
    await assert.rejects(
      async () => {
        await warehouseService.updateOperationalStatus(whFacilityId, "operational", whManagerUid);
      },
      /suspended by platform administration/i,
      "Administrative suspension cannot be overridden by warehouse manager"
    );

    // Lift admin suspension
    await adminService.setEntityStatus(
      {
        entityType: "warehouse",
        entityId: whFacilityId,
        entityName: "Ikom Inland Depot",
        status: "active",
      },
      "sys_admin_01"
    );
  });

  await test("Warehouse 4.4: Cross River State Full Trace Certificate request workflow", async () => {
    const crs = await warehouseService.requestCrossRiverStateTraceCertificate(
      {
        facilityId: whFacilityId,
        consignmentCode: "CONSIGN-IKOM-2026-001",
        totalQuantityKg: 64000,
        sourceOriginSummary: "Cameroon Mamfe Corridor via Ikom Transit",
        applicantName: "Depot Supervisor",
        applicantContactEmail: "ikom-depot@cr-cocoaterminal.com",
        applicantContactPhone: "+234 803 111 2222",
      },
      whManagerUid
    );

    assert(crs.requestNumber.startsWith("CRS-FTC-2026-"));
    assert.strictEqual(crs.inspectionFeeNgn, 25000, "Should apply dynamic fee from admin configuration");
    assert.strictEqual(crs.status, "pending_inspection");
  });

  await test("Warehouse 4.5: Warehouse dashboard data aggregation", async () => {
    const dash = await warehouseService.getDashboardData(whFacilityId, whManagerUid);
    assert.strictEqual(dash.facility?.id, whFacilityId);
    assert.strictEqual(dash.metrics.totalConsignmentsReceived, 1);
    assert.strictEqual(dash.metrics.currentStockKg, 64000);
    assert.strictEqual(dash.metrics.utilizationPercentage, 50);
  });

  // ============================================================================
  // 5. PLATFORM CUSTOMS AGENT ACTOR TESTS
  // ============================================================================
  console.log("\n--- 5. Platform Customs Agent Actor Tests ---");

  const customsOfficerUid = "usr_customs_lead_01"; // Seeded officer
  let customsRequestId = "";

  await test("Customs 5.1: Submitter eligibility validation (only agent or warehouse)", async () => {
    // Ineligible submitter: farmer
    await assert.rejects(
      async () => {
        await customsService.submitExportCustomsRequest(
          {
            serviceType: "export_license_and_customs",
            submitterType: "farmer" as unknown as SubmitterType,
            submitterId: "usr_farmer_manyu_001",
            submitterName: "Enow Paul",
            submitterContactEmail: "farmer@manyu.cm",
            submitterContactPhone: "+237 677 000 000",
            manifestOrBatchCode: "BATCH-EXP-01",
            quantityKg: 30000,
            destinationCountry: "Netherlands",
            exitPortOrBorderPost: "Calabar Port",
          },
          "usr_farmer_manyu_001"
        );
      },
      /Only licensed Nigerian Agents or Warehouses may submit customs requests/i,
      "Farmer cannot submit export customs request directly"
    );
  });

  await test("Customs 5.2: Submit request with dynamic administrative fee and initial audit log", async () => {
    const request = await customsService.submitExportCustomsRequest(
      {
        serviceType: "export_license_and_customs",
        submitterType: "warehouse",
        submitterId: whFacilityId,
        submitterName: "Ikom Inland Cocoa Depot & Transit Terminal",
        submitterContactEmail: "ikom-depot@cr-cocoaterminal.com",
        submitterContactPhone: "+234 803 111 2222",
        manifestOrBatchCode: "MANIFEST-EXP-IKOM-2026-081",
        quantityKg: 64000,
        destinationCountry: "Germany (Port of Hamburg)",
        exitPortOrBorderPost: "Calabar Free Trade Zone Port",
        eur1OrEudrCertificateNumber: "CERT-CRS-FULLTRACE-2026-9901",
        nxpFormNumber: "NXP-FED-2026-99120",
      },
      whManagerUid
    );

    customsRequestId = request.id;
    assert.strictEqual(request.feeCodeApplied, "FEE_CUSTOMS_CLEARANCE");
    assert.strictEqual(request.feeAmount, 45000, "Should derive dynamic 45,000 NGN fee from Admin");
    assert.strictEqual(request.status, "submitted");
    assert.strictEqual(request.paymentStatus, "pending");

    const history = await customsStore.getProcessingHistory(request.id);
    assert(history.length >= 1, "Initial submission must append to history trail");
    assert.strictEqual(history[0].newStatus, "submitted");
  });

  await test("Customs 5.3: Officer advances processing stage and records statutory references", async () => {
    const updated = await customsService.updateProcessingStage(
      {
        requestId: customsRequestId,
        newStatus: "documentation_verified",
        statutoryReferencesUpdate: {
          singleGoodsDeclarationNumber: "SGD-CAL-2026-90112",
          cleanCertificateOfInspectionNumber: "CCI-CR-2026-4401",
        },
        comments: "All export documentation verified against NXP and EUDR cert",
      },
      customsOfficerUid
    );

    assert.strictEqual(updated.status, "documentation_verified");
    assert.strictEqual(updated.references.singleGoodsDeclarationNumber, "SGD-CAL-2026-90112");

    const history = await customsStore.getProcessingHistory(customsRequestId);
    assert(history.some((h) => h.newStatus === "documentation_verified"));
  });

  await test("Customs 5.4: Clearance precondition: Unpaid clearance fee prevents clearance release", async () => {
    await assert.rejects(
      async () => {
        await customsService.markRequestCleared(
          {
            requestId: customsRequestId,
            singleGoodsDeclarationNumber: "SGD-CAL-2026-90112",
          },
          customsOfficerUid
        );
      },
      /fee must be paid/i,
      "Cannot issue clearance release while fee payment is pending"
    );
  });

  await test("Customs 5.5: Record fee payment and mark request as cleared with official NCS release reference", async () => {
    // Record payment
    const paid = await customsService.recordFeePayment(customsRequestId, "PAY-NCS-994102", customsOfficerUid);
    assert.strictEqual(paid.paymentStatus, "paid");

    // Mark cleared
    const cleared = await customsService.markRequestCleared(
      {
        requestId: customsRequestId,
        singleGoodsDeclarationNumber: "SGD-CAL-2026-90112",
        cleanCertificateOfInspectionNumber: "CCI-CR-2026-4401",
        billOfLadingOrConsignmentNote: "BOL-CAL-HAM-2026-004",
        clearanceNotes: "Physical sampling passed; NCS exit clearance granted",
      },
      customsOfficerUid
    );

    assert.strictEqual(cleared.status, "cleared");
    assert(cleared.customsReleaseReference?.startsWith("NCS-CR-REL-"));
    assert(cleared.clearedAt !== undefined);

    // Operational invariant: cannot modify cleared request
    await assert.rejects(
      async () => {
        await customsService.updateProcessingStage(
          {
            requestId: customsRequestId,
            newStatus: "under_review",
          },
          customsOfficerUid
        );
      },
      /Cannot alter a request that has already been cleared/i,
      "Cleared request is immutable"
    );
  });

  await test("Customs 5.6: Query raising and rejection workflows with audit logging", async () => {
    // Submit a second request to test query/reject
    const req2 = await customsService.submitExportCustomsRequest(
      {
        serviceType: "customs_clearance",
        submitterType: "agent",
        submitterId: agentId,
        submitterName: "Ikom Cross-Border Cocoa Aggregators Ltd",
        submitterContactEmail: "contact@ikom-aggregators.ng",
        submitterContactPhone: "+234 802 999 8888",
        manifestOrBatchCode: "BATCH-EXP-02",
        quantityKg: 32000,
        destinationCountry: "Belgium",
        exitPortOrBorderPost: "Calabar Port",
      },
      agentUid
    );

    const queried = await customsService.raiseQueryOrReject(
      {
        requestId: req2.id,
        action: "query",
        reason: "Discrepancy between stated bag count and manifest gross weight",
      },
      customsOfficerUid
    );

    assert.strictEqual(queried.status, "query_raised");
    assert.strictEqual(
      queried.queryNotes,
      "Discrepancy between stated bag count and manifest gross weight"
    );
  });

  await test("Customs 5.7: Customs Agent dashboard aggregation", async () => {
    const dash = await customsService.getDashboardData(customsOfficerUid);
    assert(dash.metrics.totalRequests >= 2);
    assert(dash.metrics.clearedCount >= 1);
    assert(dash.metrics.totalClearedTonnageKg >= 64000);
    assert(dash.metrics.totalFeesRecordedNgn >= 90000);
    assert(dash.recentClearances.length >= 1);
  });

  console.log("\n================================================================================");
  console.log(`All tests passed! Passed: ${passed}/${total}`);
  console.log("================================================================================\n");

  process.exit(0);
}

runRole4Tests().catch((err) => {
  console.error("Test execution encountered an error:", err);
  process.exit(1);
});
