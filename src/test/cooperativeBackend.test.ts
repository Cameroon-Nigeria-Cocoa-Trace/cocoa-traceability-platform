import { CooperativeService } from "../lib/cooperative/cooperativeService";

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
  console.log("RUNNING BACKEND TESTS: COOPERATIVE ACTOR MODULE");
  console.log("========================================================\n");

  const service = new CooperativeService();

  // ----------------------------------------------------
  // SUITE 1: Personal & Organizational Accounts & Registration
  // ----------------------------------------------------
  console.log("Suite 1: Personal & Organizational Accounts & Registration");

  const testUserId1 = `usr_coop_test_${Date.now()}`;
  let registeredProfileId = "";

  await runTest("Account & Registration", "Register Personal Cooperative Officer Account", async () => {
    const profile = await service.registerCooperativeAccount({
      userId: testUserId1,
      fullName: "Agbor Tabi",
      email: "agbor.tabi@sowescop.cm",
      phone: "+237 671 223 344",
      accountType: "personal",
      officerRole: "extension_officer",
      cooperativeId: "org_coop_sowescop",
      cooperativeName: "Southwest Farmers Cocoa Cooperative Society (SOWESCOP)",
      operatingRegion: "Manyu / Mamfe Corridor",
      operatingLgas: ["Manyu", "Mamfe"],
    });

    assert(Boolean(profile.id), "Profile must have a generated ID");
    assertEqual(profile.userId, testUserId1, "Profile userId matches");
    assertEqual(profile.officerRole, "extension_officer", "Officer role matches");
    assertEqual(profile.status, "active", "Status is active");
    registeredProfileId = profile.id;
  });

  await runTest("Account & Registration", "Lookup Profile by ID and by User ID", async () => {
    const byId = await service.getProfile(registeredProfileId);
    assert(Boolean(byId), "Profile found by profile ID");
    assertEqual(byId?.fullName, "Agbor Tabi", "Full name matches");

    const byUserId = await service.getProfile(testUserId1);
    assert(Boolean(byUserId), "Profile found by userId");
    assertEqual(byUserId?.id, registeredProfileId, "IDs match");
  });

  await runTest("Account & Registration", "Update Cooperative Profile", async () => {
    const updated = await service.updateProfile(registeredProfileId, {
      phone: "+237 679 888 777",
      officerRole: "manager",
    });

    assert(Boolean(updated), "Updated profile returned");
    assertEqual(updated?.phone, "+237 679 888 777", "Phone updated");
    assertEqual(updated?.officerRole, "manager", "Officer role updated");
  });

  await runTest("Account & Registration", "Rejects Registration with Missing Required Fields", async () => {
    let errorCaught = false;
    try {
      await service.registerCooperativeAccount({
        userId: "",
        fullName: "",
        email: "invalid",
        phone: "",
        accountType: "personal",
        operatingRegion: "",
      });
    } catch {
      errorCaught = true;
    }
    assert(errorCaught, "Should throw error on missing required fields");
  });

  // ----------------------------------------------------
  // SUITE 2: Cooperative Organization & Membership Management
  // ----------------------------------------------------
  console.log("\nSuite 2: Cooperative Organization & Membership Management");

  let createdOrgId = "";
  const testFounderId = `usr_founder_${Date.now()}`;

  await runTest("Organization & Membership", "Create New Primary Cooperative Society", async () => {
    const org = await service.createOrganization(testFounderId, {
      name: "Boki High Canopy Cocoa Farmers Cooperative",
      registrationNumber: "COOP-CR-BOKI-2026-081",
      tier: "primary_society",
      parentCooperativeId: "org_coop_sowescop",
      headquarters: "Boki Farmers Hall, Cross River State",
      contactEmail: "boki-coop@crossriver-cocoa.org",
      contactPhone: "+234 803 444 5566",
      operatingRegions: ["Cross River State"],
      operatingLgas: ["Boki", "Etung"],
      bankSettlementInfo: {
        bankName: "First Bank of Nigeria",
        accountNumber: "3082910283",
        accountName: "Boki Cocoa Cooperative Society",
      },
    });

    assert(Boolean(org.id), "Org ID generated");
    assertEqual(org.tier, "primary_society", "Tier is primary_society");
    assertEqual(org.members.length, 1, "Founder is initial member");
    assertEqual(org.members[0].role, "president", "Founder role is president");
    createdOrgId = org.id;
  });

  let newMemberId = "";
  const testMemberUserId = `usr_sec_${Date.now()}`;

  await runTest("Organization & Membership", "Add Executive Staff Member", async () => {
    const updated = await service.addMember(
      createdOrgId,
      {
        userId: testMemberUserId,
        name: "Eunice Odu",
        email: "eunice.odu@boki-coop.ng",
        phone: "+234 802 111 4455",
        role: "secretary",
        notes: "Appointed at 2026 General Assembly",
      },
      testFounderId
    );

    assertEqual(updated.members.length, 2, "Member count is now 2");
    const added = updated.members.find((m) => m.userId === testMemberUserId);
    assert(Boolean(added), "New member present in roster");
    assertEqual(added?.role, "secretary", "Role is secretary");
    newMemberId = added!.id;
  });

  await runTest("Organization & Membership", "Update Member Role with Historical Preservation", async () => {
    const updated = await service.updateMemberRole(
      createdOrgId,
      newMemberId,
      "treasurer",
      testFounderId,
      "Promoted to treasurer"
    );

    const member = updated.members.find((m) => m.id === newMemberId);
    assertEqual(member?.role, "treasurer", "Member role updated to treasurer");

    const history = await service.getMembershipHistory(createdOrgId);
    assert(history.length > 0, "Membership history must contain audit entry");
    assertEqual(history[0].newRole, "treasurer", "Audit log records new role");
    assertEqual(history[0].previousRole, "secretary", "Audit log records previous role");
  });

  await runTest("Organization & Membership", "Soft Status Transition & Removal Preserves Historical Trail", async () => {
    // 1. Suspend member
    const suspendedOrg = await service.updateMemberStatus(
      createdOrgId,
      newMemberId,
      "suspended",
      testFounderId,
      "Suspended pending financial reconciliation"
    );
    const suspendedMember = suspendedOrg.members.find((m) => m.id === newMemberId);
    assertEqual(suspendedMember?.status, "suspended", "Status is suspended");

    // 2. Remove member (soft transition to "removed" - no hard delete)
    const removedOrg = await service.removeMember(
      createdOrgId,
      newMemberId,
      testFounderId,
      "Relocated to another district"
    );
    const removedMember = removedOrg.members.find((m) => m.id === newMemberId);
    assertEqual(removedMember?.status, "removed", "Status is soft removed");
    assertEqual(removedOrg.memberCount, 1, "Active member count decremented to 1");

    // 3. Verify history integrity
    const history = await service.getMembershipHistory(createdOrgId);
    assert(history.length >= 3, "Complete audit trail preserved");
    assertEqual(history[0].newStatus, "removed", "Latest status is removed");
  });

  // ----------------------------------------------------
  // SUITE 3: Farmer Relationship Management (Affiliation & Workflows)
  // ----------------------------------------------------
  console.log("\nSuite 3: Farmer Relationship Management");

  let testAffiliationId = "";
  const testFarmerId = `farmer_boki_${Date.now()}`;
  const testFarmId = `farm_boki_${Date.now()}`;

  await runTest("Farmer Management", "Link Farmer & Farm Plot to Cooperative (Pending Verification)", async () => {
    const aff = await service.linkFarmerToCooperative(
      createdOrgId,
      testFarmId,
      testFarmerId,
      "Sunday Ntui",
      {
        farmerPhone: "+234 803 777 9900",
        farmerEmail: "sunday.ntui@gmail.com",
        farmName: "Ntui Agroforestry Cocoa Farm",
        farmRegion: "Cross River State",
        farmLga: "Boki",
        sizeHectares: 3.5,
        estimatedAnnualYieldKg: 2800,
        eudrCompliant: true,
        autoVerify: false,
        notes: "Submitted canopy survey for cooperative registration",
      }
    );

    assert(Boolean(aff.id), "Affiliation ID generated");
    assertEqual(aff.status, "pending_verification", "Status is pending_verification");
    assertEqual(aff.sizeHectares, 3.5, "Hectares matches");
    testAffiliationId = aff.id;
  });

  await runTest("Farmer Management", "Verify Farmer Affiliation by Officer", async () => {
    const verified = await service.verifyFarmerAffiliation(
      testAffiliationId,
      testFounderId,
      "GPS boundary polygon verified zero-deforestation compliant"
    );

    assertEqual(verified.status, "active", "Status transitioned to active");
    assert(Boolean(verified.verifiedAt), "Verified timestamp set");
    assertEqual(verified.verifiedBy, testFounderId, "Officer ID recorded");

    const history = await service.getAffiliationHistory(createdOrgId);
    assert(history.length >= 2, "Affiliation history recorded");
    assertEqual(history[0].action, "verified", "Action is verified");
  });

  await runTest("Farmer Management", "Update Affiliation Status (Suspend & Reinstate) Preserving History", async () => {
    // Suspend
    const suspended = await service.updateAffiliationStatus(
      testAffiliationId,
      "suspended",
      testFounderId,
      "Pending chemical residue re-test"
    );
    assertEqual(suspended.status, "suspended", "Status is suspended");

    // Reinstate
    const reinstated = await service.updateAffiliationStatus(
      testAffiliationId,
      "active",
      testFounderId,
      "Chemical re-test passed with zero banned synthetic pesticides"
    );
    assertEqual(reinstated.status, "active", "Status is active");

    const history = await service.getAffiliationHistory(createdOrgId);
    assert(history.length >= 4, "All status changes tracked");
  });

  await runTest("Farmer Management", "List Affiliated Farmers with Status Filtering", async () => {
    const all = await service.listAffiliatedFarmers(createdOrgId);
    assertEqual(all.length, 1, "One affiliated farmer");

    const activeOnly = await service.listAffiliatedFarmers(createdOrgId, "active");
    assertEqual(activeOnly.length, 1, "One active affiliation");

    const pendingOnly = await service.listAffiliatedFarmers(createdOrgId, "pending_verification");
    assertEqual(pendingOnly.length, 0, "Zero pending affiliations");
  });

  // ----------------------------------------------------
  // SUITE 4: Subordinate Cooperative Relationships
  // ----------------------------------------------------
  console.log("\nSuite 4: Subordinate Cooperative Relationships");

  let subordinateRelId = "";

  await runTest("Subordinate Relationships", "Link Primary Society to Regional Apex Union", async () => {
    const rel = await service.linkSubordinateCooperative(
      "org_coop_sowescop",
      createdOrgId,
      "Boki primary society linked to SOWESCOP regional apex union"
    );

    assert(Boolean(rel.id), "Relationship ID generated");
    assertEqual(rel.relationshipStatus, "active", "Relationship status is active");
    assertEqual(rel.apexCooperativeId, "org_coop_sowescop", "Apex ID matches");
    assertEqual(rel.subordinateCooperativeId, createdOrgId, "Subordinate ID matches");
    subordinateRelId = rel.id;

    // Verify parent pointer on subordinate org
    const subOrg = await service.getOrganization(createdOrgId);
    assertEqual(subOrg?.parentCooperativeId, "org_coop_sowescop", "Parent pointer set");

    // Verify subordinate array on apex org
    const apexOrg = await service.getOrganization("org_coop_sowescop");
    assert(
      Boolean(apexOrg?.subordinateCooperativeIds?.includes(createdOrgId)),
      "Subordinate ID present in apex array"
    );
  });

  await runTest("Subordinate Relationships", "List Subordinate Cooperatives of Apex Union", async () => {
    const subs = await service.listSubordinateCooperatives("org_coop_sowescop");
    assert(subs.length >= 2, "Apex union has at least 2 subordinate societies");
  });

  await runTest("Subordinate Relationships", "Soft Dissolve Subordinate Relationship Preserving History", async () => {
    const dissolved = await service.delinkSubordinateCooperative(
      subordinateRelId,
      "Mutual restructuring into autonomous corridor union"
    );

    assertEqual(dissolved.relationshipStatus, "dissolved", "Status is dissolved");
    assert(Boolean(dissolved.dissolutionDate), "Dissolution date recorded");

    // Subordinate org parent pointer cleared
    const subOrg = await service.getOrganization(createdOrgId);
    assertEqual(subOrg?.parentCooperativeId, undefined, "Parent pointer cleared");
  });

  // ----------------------------------------------------
  // SUITE 5: Cooperative Certificate Operations
  // ----------------------------------------------------
  console.log("\nSuite 5: Cooperative Certificate Operations");

  let endorsedCertNumber = "";
  let originCertNumber = "";
  let fullTraceCertNumber = "";

  await runTest("Certificate Operations", "Workflow 1: Endorse Member Farm EUDR Authenticity Certificate", async () => {
    const cert = await service.endorseFarmEudrCertificate({
      cooperativeId: "org_coop_sowescop",
      officerId: "coop_usr_lead_01",
      farmId: testFarmId,
      farmerId: testFarmerId,
      farmerName: "Sunday Ntui",
      farmAuditCertificateNumber: "CT-CMR-FARM-99-2026",
      originCorridor: "Cross River / Manyu Border Corridor",
      notes: "Satellite canopy zero-deforestation baseline confirmed.",
    });

    assert(Boolean(cert.id), "Cert ID generated");
    assert(cert.certificateNumber.startsWith("CERT-COOP-EUDR-"), "Certificate numbering convention");
    assertEqual(cert.status, "valid", "Certificate status is valid");
    assertEqual(cert.eudrComplianceVerified, true, "EUDR compliance verified");
    endorsedCertNumber = cert.certificateNumber;
  });

  await runTest("Certificate Operations", "Workflow 2: Issue Cooperative Origin & EUDR Batch Declaration (Dynamic Admin Fee)", async () => {
    const cert = await service.issueCooperativeOriginDeclaration({
      cooperativeId: "org_coop_sowescop",
      officerId: "coop_usr_lead_01",
      batchCode: "BATCH-SOWESCOP-2026-B01",
      quantityKg: 2000,
      farmId: testFarmId,
      farmerId: testFarmerId,
      farmerName: "Sunday Ntui",
      originCorridor: "Southwest Cameroon / Cross River Corridor",
    });

    assert(cert.certificateNumber.startsWith("CERT-COOP-ORIGIN-"), "Origin cert number convention");
    assertEqual(cert.status, "valid", "Origin certificate valid");
    // Verify dynamic levy fee integration (2000 kg * 15 NGN/kg = 30000 NGN)
    assertEqual(cert.feeCodeApplied, "FEE_COOPERATIVE_LEVY", "Cooperative levy fee code applied");
    assertEqual(cert.feeAmountPaid, 30000, "Levy calculated dynamically from Admin fee config");
    originCertNumber = cert.certificateNumber;
  });

  await runTest("Certificate Operations", "Workflow 3: Request Cross River Full Trace Certificate (Dynamic Admin Fee)", async () => {
    const cert = await service.requestCrossRiverFullTraceCertificate({
      cooperativeId: "org_coop_sowescop",
      officerId: "coop_usr_lead_01",
      batchCode: "BATCH-CRS-FULLTRACE-001",
      totalLotsCount: 4,
      quantityKg: 5000,
      originCorridor: "Manyu-Mamfe / Ikom Border Corridor",
      destinationWarehouseOrAgent: "Ikom Central Aggregation Terminal Warehouse",
    });

    assert(cert.certificateNumber.startsWith("CERT-CRS-FULLTRACE-"), "Full trace cert number convention");
    assertEqual(cert.status, "valid", "Full trace certificate valid");
    assertEqual(cert.feeCodeApplied, "FEE_EUDR_AUDIT", "EUDR audit fee code applied");
    // Baseline value = 5000 * 1800 = 9,000,000 NGN. At 0.75% = 67,500 NGN.
    assertEqual(cert.feeAmountPaid, 67500, "Dynamic EUDR audit fee calculated from Admin config");
    fullTraceCertNumber = cert.certificateNumber;
  });

  await runTest("Certificate Operations", "Verify Authenticity of Issued Certificates", async () => {
    const verification = await service.verifyCertificate(endorsedCertNumber);
    assertEqual(verification.valid, true, "Valid certificate confirms authenticity");
    assert(verification.message.includes("is authentic"), "Authentic message returned");

    const originVerification = await service.verifyCertificate(originCertNumber);
    assertEqual(originVerification.valid, true, "Origin certificate confirms authenticity");

    const nonExistent = await service.verifyCertificate("CERT-FAKE-999999");
    assertEqual(nonExistent.valid, false, "Unknown certificate marked invalid");
  });

  await runTest("Certificate Operations", "Revoke Certificate with Reason & Traceability Status", async () => {
    const revoked = await service.revokeCertificate(
      fullTraceCertNumber,
      "Corridor seal damaged during severe weather transit; re-bagging required",
      "Chief Victor Agbor"
    );

    assertEqual(revoked.status, "revoked", "Status is revoked");
    assert(Boolean(revoked.statusReason?.includes("Chief Victor Agbor")), "Revoker tracked in reason");

    const reVerification = await service.verifyCertificate(fullTraceCertNumber);
    assertEqual(reVerification.valid, false, "Revoked certificate returns valid: false");
    assert(reVerification.message.includes("revoked"), "Revocation notice in message");
  });

  // ----------------------------------------------------
  // SUITE 6: Cocoa Intake & Aggregation Records with Dynamic Fee
  // ----------------------------------------------------
  console.log("\nSuite 6: Cocoa Intake & Aggregation Records");

  let testIntakeId = "";

  await runTest("Intake Records", "Record Member Cocoa Intake with Dynamic Cooperative Levy Calculation", async () => {
    // 1500 kg @ 1800 NGN/kg = Gross 2,700,000 NGN
    // Levy from Admin Fee Config FEE_COOPERATIVE_LEVY (15 NGN/kg) = 22,500 NGN
    // Net Payout = 2,700,000 - 22,500 = 2,677,500 NGN
    const batch = await service.recordIntakeBatch({
      cooperativeId: "org_coop_sowescop",
      officerId: "coop_usr_lead_01",
      farmerId: testFarmerId,
      farmerName: "Sunday Ntui",
      farmId: testFarmId,
      farmName: "Ntui Agroforestry Cocoa Farm",
      quantityKg: 1500,
      qualityGrade: "Grade 1",
      moistureContentPercent: 7.3,
      eudrCompliant: true,
      farmAuditCertificateNumber: endorsedCertNumber,
      unitPricePerKg: 1800,
      currency: "NGN",
      paymentReference: "PAY-COOP-BOKI-901",
    });

    assert(Boolean(batch.id), "Intake ID generated");
    assertEqual(batch.grossAmount, 2700000, "Gross amount matches");
    assertEqual(batch.levyFeeRatePerKg, 15, "Levy rate matches Admin Config");
    assertEqual(batch.levyAmountDeducted, 22500, "Levy deducted matches rate * qty");
    assertEqual(batch.netPayoutToFarmer, 2677500, "Net payout matches gross - levy");
    assertEqual(batch.paymentStatus, "paid", "Payment status is paid");
    assertEqual(batch.status, "stored_in_depot", "Batch status is stored_in_depot");
    testIntakeId = batch.id;
  });

  await runTest("Intake Records", "Dispatch Intake Batch to Central Warehouse", async () => {
    const dispatched = await service.dispatchIntakeBatch(
      testIntakeId,
      "warehouse",
      "DISP-WH-IKOM-2026-04"
    );

    assertEqual(dispatched.status, "transferred_to_warehouse", "Status updated to transferred_to_warehouse");
    assertEqual(dispatched.dispatchReference, "DISP-WH-IKOM-2026-04", "Dispatch reference recorded");
  });

  // ----------------------------------------------------
  // SUITE 7: Cooperative Dashboard & Operational Records
  // ----------------------------------------------------
  console.log("\nSuite 7: Cooperative Dashboard & Operational Records");

  await runTest("Dashboard Metrics", "Aggregate Complete Cooperative Dashboard", async () => {
    const dashboard = await service.getDashboardData("org_coop_sowescop");

    assert(Boolean(dashboard.cooperative), "Cooperative organization present");
    assertEqual(dashboard.cooperative?.id, "org_coop_sowescop", "Organization ID matches");

    const summary = dashboard.summary;
    assert(summary.totalHectaresManaged > 0, "Managed hectares calculated");
    assert(summary.totalIntakeRecordedKg >= 2750, "Intake volume accumulated");
    assert(summary.totalLevyCollectedAmount > 0, "Levy revenue calculated");
    assert(summary.activeCertificatesCount >= 2, "Active certificates counted");
    assert(summary.eudrCompliancePercentage === 100, "EUDR compliance 100%");

    assert(dashboard.recentIntakes.length > 0, "Recent intakes populated");
    assert(dashboard.activeCertificates.length > 0, "Active certificates populated");
  });

  // ----------------------------------------------------
  // SUMMARY REPORT
  // ----------------------------------------------------
  console.log("\n========================================================");
  console.log("COOPERATIVE ACTOR MODULE TEST RESULTS SUMMARY");
  console.log("========================================================");

  const passedTests = results.filter((r) => r.passed).length;
  const failedTests = results.filter((r) => !r.passed).length;

  console.log(`Total Tests Run: ${results.length}`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${failedTests}`);

  if (failedTests > 0) {
    console.error("\nFailed Tests Details:");
    results
      .filter((r) => !r.passed)
      .forEach((r) => console.error(`  - [${r.suite}] ${r.testName}: ${r.error}`));
    process.exit(1);
  } else {
    console.log("\nALL COOPERATIVE ACTOR MODULE TESTS PASSED PERFECTLY!\n");
    process.exit(0);
  }
}

runAllTests().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
