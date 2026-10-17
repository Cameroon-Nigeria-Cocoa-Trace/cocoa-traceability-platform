import { AgentService } from "../lib/agent/agentService";
import { AgentStore } from "../lib/agent/agentStore";

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
    throw new Error(`Assertion failed: ${message}. Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

async function runAllTests() {
  console.log("\n========================================================");
  console.log("RUNNING BACKEND TESTS: AGENT ACTOR MODULE");
  console.log("========================================================\n");

  const service = new AgentService();
  const store = new AgentStore();

  // ----------------------------------------------------
  // SUITE 1: Personal Agent Account & Registration
  // ----------------------------------------------------
  console.log("Suite 1: Personal Agent Account & Registration");

  let testAgentId = "";
  const testUserId = `usr_agent_test_${Date.now()}`;

  await runTest("Account & Registration", "Register Personal Agent Account", async () => {
    const profile = await service.registerAgent({
      userId: testUserId,
      fullName: "Benedict Agbor",
      email: "benedict.agbor@crossriver-agents.org",
      phone: "+234 803 111 2233",
      accountType: "personal",
      operatingRegion: "Cross River State / Central Corridor",
      operatingLgas: ["Ikom", "Boki"],
      assignedCooperativeId: "coop_mile18",
      assignedCooperativeName: "Mile 18 Cocoa Farmers Union",
      serviceFeePercentage: 2.0, // Configurable fee
    });

    assert(Boolean(profile.id), "Profile must have a generated ID");
    assertEqual(profile.userId, testUserId, "Profile userId must match");
    assertEqual(profile.fullName, "Benedict Agbor", "Full name must match");
    assertEqual(profile.accountType, "personal", "Account type must be personal");
    assertEqual(profile.status, "active", "Status must be active");
    assertEqual(profile.serviceFeePercentage, 2.0, "Configurable fee percentage must be 2.0%");
    assert(profile.accreditationNumber.startsWith("AGT-CR-"), "Accreditation number must follow pattern AGT-CR-");

    testAgentId = profile.id;
  });

  await runTest("Account & Registration", "Retrieve Agent Profile by ID and UserID", async () => {
    const byId = await service.getProfile(testAgentId);
    assert(Boolean(byId), "Agent profile must be retrievable by agent ID");
    assertEqual(byId?.fullName, "Benedict Agbor", "Name must match");

    const byUserId = await service.getProfile(testUserId);
    assert(Boolean(byUserId), "Agent profile must be retrievable by userId");
    assertEqual(byUserId?.id, testAgentId, "Found agent ID must match");
  });

  await runTest("Account & Registration", "Update Agent Profile Information", async () => {
    const updated = await service.updateProfile(testAgentId, {
      phone: "+234 803 999 8877",
      operatingLgas: ["Ikom", "Boki", "Etung"],
      serviceFeePercentage: 1.8,
    });

    assert(Boolean(updated), "Updated profile must not be null");
    assertEqual(updated?.phone, "+234 803 999 8877", "Phone number must be updated");
    assertEqual(updated?.operatingLgas.length, 3, "Operating LGAs count must be 3");
    assertEqual(updated?.serviceFeePercentage, 1.8, "Fee rate must be updated to 1.8");
  });

  // ----------------------------------------------------
  // SUITE 2: Agent Organization & Membership
  // ----------------------------------------------------
  console.log("\nSuite 2: Agent Organization & Membership");

  let testOrgId = "";

  await runTest("Organization & Membership", "Create Agent Organization with Owner", async () => {
    const org = await service.createOrganization(testAgentId, {
      name: "Ikom Cocoa Purchasing & Quality Agency Ltd",
      registrationNumber: "RC-883921-NG",
      headquarters: "42 Ikom-Calabar Road, Ikom",
      contactEmail: "info@ikomcocoa.ng",
      contactPhone: "+234 802 555 4433",
      operatingRegions: ["Cross River Central", "Southwest Cameroon"],
      serviceFeePercentage: 1.75,
    });

    assert(Boolean(org.id), "Org must have an ID");
    assertEqual(org.name, "Ikom Cocoa Purchasing & Quality Agency Ltd", "Org name must match");
    assertEqual(org.members.length, 1, "Org must have initial owner member");
    assertEqual(org.members[0].role, "owner", "Initial member must have owner role");
    assertEqual(org.members[0].agentId, testAgentId, "Owner agentId must match");

    testOrgId = org.id;

    // Verify owner's profile was updated to organizational
    const ownerProfile = await service.getProfile(testAgentId);
    assertEqual(ownerProfile?.accountType, "organizational", "Owner profile must be updated to organizational");
    assertEqual(ownerProfile?.organizationId, testOrgId, "Owner org ID must match");
    assertEqual(ownerProfile?.organizationRole, "owner", "Owner org role must match");
  });

  let newMemberId = "";

  await runTest("Organization & Membership", "Add Member to Organization", async () => {
    const updatedOrg = await service.addMemberToOrganization(testOrgId, testAgentId, {
      userId: "usr_inspector_02",
      name: "Tanyi Ojong",
      email: "tanyi.ojong@ikomcocoa.ng",
      phone: "+234 803 444 1122",
      role: "inspector",
    });

    assertEqual(updatedOrg.members.length, 2, "Org members count must now be 2");
    const member = updatedOrg.members.find((m) => m.email === "tanyi.ojong@ikomcocoa.ng");
    assert(Boolean(member), "New member must be found in org members");
    assertEqual(member?.role, "inspector", "Member role must be inspector");
    assertEqual(member?.status, "active", "Member status must be active");

    newMemberId = member!.id;
  });

  await runTest("Organization & Membership", "Remove Member from Organization by Owner", async () => {
    const updatedOrg = await service.removeMemberFromOrganization(
      testOrgId,
      testAgentId,
      newMemberId
    );

    assertEqual(updatedOrg.members.length, 1, "Org members count must be 1 after removal");
    assert(!updatedOrg.members.some((m) => m.id === newMemberId), "Removed member must not be present");
  });

  // ----------------------------------------------------
  // SUITE 3: Quality Intake & Field Inspection Workflow
  // ----------------------------------------------------
  console.log("\nSuite 3: Quality Intake & Field Inspection Workflow");

  let issuedCertNumber = "";

  await runTest("Inspection Workflow", "Record Grade 1 Compliant Inspection & Issue Certificate", async () => {
    const { inspection, certificate } = await service.recordInspection({
      agentId: testAgentId,
      farmId: "farm_cr_bamenda_01",
      farmerId: "producer_cam_001",
      farmerName: "Alain Nkweta",
      cooperative: "SOWESCOP / Mile 18 Cooperative",
      moistureContentPercent: 7.2,
      beanCountPer100g: 96,
      fermentationRatePercent: 88,
      defectiveBeansPercent: 1.5,
      geolocation: "5.9723°, 10.0162°",
      notes: "Grade 1 quality bean, uniform fermentation, zero mold.",
      issueCertificate: true,
    });

    assertEqual(inspection.qualityGrade, "Grade 1", "Grade must be Grade 1");
    assertEqual(inspection.eudrComplianceVerified, true, "EUDR compliance must be true");
    assertEqual(inspection.certificateIssued, true, "Certificate issued flag must be true");
    assert(Boolean(certificate), "Certificate object must be returned");
    assert(certificate!.certificateNumber.startsWith("CERT-AGT-INSP-"), "Certificate number format");
    assertEqual(certificate!.status, "valid", "Certificate status must be valid");

    issuedCertNumber = certificate!.certificateNumber;
  });

  await runTest("Inspection Workflow", "Record Grade 2 Inspection", async () => {
    const { inspection } = await service.recordInspection({
      agentId: testAgentId,
      farmId: "farm_cr_etung_02",
      farmerId: "producer_etung_002",
      farmerName: "Moses Ntui",
      cooperative: "Etung Cocoa Union",
      moistureContentPercent: 8.2, // Slightly higher moisture
      beanCountPer100g: 104,
      fermentationRatePercent: 74,
      defectiveBeansPercent: 4.2,
      issueCertificate: false,
    });

    assertEqual(inspection.qualityGrade, "Grade 2", "Grade must be Grade 2");
    assertEqual(inspection.certificateIssued, false, "Certificate should not be issued when requested false");
  });

  await runTest("Inspection Workflow", "Record Sub-Standard Inspection (Fails EUDR Moisture)", async () => {
    const { inspection } = await service.recordInspection({
      agentId: testAgentId,
      farmId: "farm_cr_sub_03",
      farmerId: "producer_sub_003",
      farmerName: "Victor Bassey",
      moistureContentPercent: 9.8, // Excessively wet
      beanCountPer100g: 120,
      fermentationRatePercent: 60,
      defectiveBeansPercent: 8.5,
      issueCertificate: true,
    });

    assertEqual(inspection.qualityGrade, "Sub-standard", "Grade must be Sub-standard");
    assertEqual(inspection.eudrComplianceVerified, false, "EUDR compliance must be false");
    assertEqual(inspection.certificateIssued, false, "Certificate must NOT be issued for sub-standard lots");
  });

  // ----------------------------------------------------
  // SUITE 4: Cocoa Purchasing Transaction & Service Fees
  // ----------------------------------------------------
  console.log("\nSuite 4: Cocoa Purchasing Transaction & Service Fees");

  let txnId1 = "";
  let txnId2 = "";

  await runTest("Transaction Workflow", "Record Cocoa Purchase with Configured Service Fee", async () => {
    // 1500 kg at 1800 FCFA/kg = 2,700,000 FCFA
    // Agent fee is 1.8% -> 48,600 FCFA
    // Net amount -> 2,651,400 FCFA
    const txn = await service.recordTransaction({
      agentId: testAgentId,
      farmId: "farm_cr_bamenda_01",
      farmerId: "producer_cam_001",
      farmerName: "Alain Nkweta",
      cooperative: "SOWESCOP / Mile 18 Cooperative",
      quantityKg: 1500,
      unitPrice: 1800,
      currency: "FCFA",
      paymentMethod: "bank_transfer",
      batchCode: "BATCH-CMR-CR-001",
    });

    assert(Boolean(txn.id), "Transaction must have an ID");
    assertEqual(txn.grossAmount, 2700000, "Gross amount must be 2,700,000");
    assertEqual(txn.feeRateApplied, 1.8, "Applied fee rate must be 1.8%");
    assertEqual(txn.serviceFeeAmount, 48600, "Service fee must be 48,600");
    assertEqual(txn.netAmount, 2651400, "Net amount must be 2,651,400");
    assertEqual(txn.status, "completed", "Transaction status must be completed");

    txnId1 = txn.id;
  });

  await runTest("Transaction Workflow", "Record Second Purchase with Custom Fee Override", async () => {
    // 2000 kg at 1750 FCFA/kg = 3,500,000 FCFA
    // Custom fee override = 2.5% -> 87,500 FCFA
    // Net amount -> 3,412,500 FCFA
    const txn = await service.recordTransaction({
      agentId: testAgentId,
      farmId: "farm_cr_etung_02",
      farmerId: "producer_etung_002",
      farmerName: "Moses Ntui",
      cooperative: "Etung Cocoa Union",
      quantityKg: 2000,
      unitPrice: 1750,
      currency: "FCFA",
      paymentMethod: "mobile_money",
      batchCode: "BATCH-CMR-CR-002",
      feeRateOverride: 2.5,
    });

    assertEqual(txn.grossAmount, 3500000, "Gross amount must be 3,500,000");
    assertEqual(txn.feeRateApplied, 2.5, "Fee rate must be 2.5%");
    assertEqual(txn.serviceFeeAmount, 87500, "Service fee must be 87,500");
    assertEqual(txn.netAmount, 3412500, "Net amount must be 3,412,500");

    txnId2 = txn.id;
  });

  // ----------------------------------------------------
  // SUITE 5: Batch Aggregation & Warehouse Handover
  // ----------------------------------------------------
  console.log("\nSuite 5: Batch Aggregation & Warehouse Handover");

  let manifestId = "";

  await runTest("Manifest Workflow", "Aggregate Purchases into Batch Manifest", async () => {
    // Aggregates txn1 (1500kg) + txn2 (2000kg) = 3500kg
    // Total bags = Math.ceil(3500 / 64) = 55 bags
    const { manifest, certificate } = await service.createBatchManifest({
      agentId: testAgentId,
      transactionIds: [txnId1, txnId2],
      warehouseId: "wh_ikom_central",
      warehouseName: "Ikom Central Aggregation Warehouse",
      warehouseLocation: "Ikom Commercial District, Cross River State",
    });

    assert(Boolean(manifest.id), "Manifest must have an ID");
    assertEqual(manifest.totalQuantityKg, 3500, "Total quantity must be 3500 kg");
    assertEqual(manifest.totalBagCount, 55, "Bag count must be 55");
    assertEqual(manifest.cooperativesInvolved.length, 2, "Must involve 2 cooperatives");
    assertEqual(manifest.status, "prepared", "Status must be prepared");
    assert(Boolean(certificate), "Aggregation certificate must be issued");

    // Verify transactions updated to 'aggregated'
    const updatedTxn1 = await store.getTransaction(txnId1);
    assertEqual(updatedTxn1?.status, "aggregated", "Txn1 status must be aggregated");

    manifestId = manifest.id;
  });

  await runTest("Manifest Workflow", "Update Manifest Lifecycle to Accepted by Warehouse", async () => {
    // Move to in_transit
    await service.updateManifestStatus(manifestId, testAgentId, "in_transit");
    const current = (await store.getManifestsByAgent(testAgentId)).find((m) => m.id === manifestId);
    assertEqual(current?.status, "in_transit", "Status must be in_transit");

    // Move to accepted_by_warehouse
    const finalManifest = await service.updateManifestStatus(
      manifestId,
      testAgentId,
      "accepted_by_warehouse",
      "Full 55 bags received, seals verified intact, moisture tested 7.4%",
      "Officer Peter Ogar"
    );

    assertEqual(finalManifest?.status, "accepted_by_warehouse", "Status must be accepted_by_warehouse");
    assertEqual(finalManifest?.receivedByWarehouseOfficer, "Officer Peter Ogar", "Officer name recorded");
  });

  // ----------------------------------------------------
  // SUITE 6: Certificate Verification Operations
  // ----------------------------------------------------
  console.log("\nSuite 6: Certificate Verification Operations");

  await runTest("Certificates", "Verify Existing Inspection Certificate", async () => {
    const cert = await service.verifyCertificate(issuedCertNumber);
    assert(Boolean(cert), "Certificate must be found");
    assertEqual(cert?.status, "valid", "Certificate status must be valid");
    assertEqual(cert?.agentId, testAgentId, "Agent ID must match");
  });

  await runTest("Certificates", "Lookup Non-Existent Certificate Returns Null", async () => {
    const cert = await service.verifyCertificate("CERT-NON-EXISTENT-999");
    assertEqual(cert, null, "Unknown certificate must return null");
  });

  // ----------------------------------------------------
  // SUITE 7: Dashboard Metrics & Operational Records
  // ----------------------------------------------------
  console.log("\nSuite 7: Dashboard Metrics & Operational Records");

  await runTest("Dashboard", "Calculate Real-Time Agent Dashboard Metrics", async () => {
    const dashboard = await service.getDashboardData(testAgentId);

    assert(Boolean(dashboard.agent), "Dashboard must include agent profile");
    assertEqual(dashboard.agent.fullName, "Benedict Agbor", "Agent name must match");

    const summary = dashboard.summary;
    assertEqual(summary.totalCocoaPurchasedKg, 3500, "Total kg must be 3500");
    assertEqual(summary.totalExpenditure, 6200000, "Expenditure must be 2.7m + 3.5m = 6,200,000");
    assertEqual(summary.totalTransactionsCount, 2, "Total transactions count must be 2");
    assertEqual(summary.activeFarmersCount, 2, "Active farmers count must be 2");
    assertEqual(summary.cooperativesCount, 2, "Cooperatives count must be 2");
    assertEqual(summary.batchesAggregatedCount, 1, "Aggregated batches must be 1");
    assertEqual(summary.warehouseDeliveriesCount, 1, "Warehouse deliveries must be 1");

    assert(dashboard.recentTransactions.length > 0, "Must return recent transactions");
    assert(dashboard.recentInspections.length > 0, "Must return recent inspections");
    assert(dashboard.recentManifests.length > 0, "Must return recent manifests");
    assert(dashboard.activeCertificates.length > 0, "Must return active certificates");
  });

  // ----------------------------------------------------
  // SUITE 8: Integrations (Warehouses & Farmer Details)
  // ----------------------------------------------------
  console.log("\nSuite 8: Integrations (Warehouses & Farmer Details)");

  await runTest("Integrations", "List Approved Warehouses", async () => {
    const warehouses = service.getApprovedWarehouses();
    assert(warehouses.length >= 3, "Must have at least 3 approved warehouses");
    assert(warehouses.some((w) => w.id === "wh_ikom_central"), "Must include Ikom Central");
    assert(warehouses.some((w) => w.id === "wh_calabar_port"), "Must include Calabar Port");
  });

  // Print Summary
  console.log("\n========================================================");
  console.log("TEST RESULTS SUMMARY");
  console.log("========================================================");
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;

  console.log(`Total Tests Run: ${results.length}`);
  console.log(`Passed:         ${passedCount}`);
  console.log(`Failed:         ${failedCount}`);
  console.log("========================================================\n");

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAllTests().catch((err) => {
  console.error("Test runner failed:", err);
  process.exit(1);
});
