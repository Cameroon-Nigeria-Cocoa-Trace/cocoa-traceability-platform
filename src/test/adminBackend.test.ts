import { AdminService } from "../lib/admin/adminService";
import { AdminStore } from "../lib/admin/adminStore";
import { PlatformOperationalStatus } from "../types/admin";

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

async function runAllAdminTests() {
  console.log("\n========================================================");
  console.log("RUNNING BACKEND TESTS: SYSTEM ADMINISTRATOR MODULE");
  console.log("========================================================\n");

  const service = new AdminService();
  const store = new AdminStore();

  const VALID_ADMIN_ID = "admin_super_001";
  const UNAUTHORIZED_USER_ID = "farmer_tarh_001";
  const TEST_USER_TARGET = "demo_agent_cr_001";
  const TEST_ORG_TARGET = "org_coop_sowescop";

  // ----------------------------------------------------
  // SUITE 1: Admin Authorization & Access Control
  // ----------------------------------------------------
  console.log("Suite 1: Admin Authorization & Access Control");

  await runTest("Authorization", "Admin Store confirms valid admin ID", async () => {
    const isSuper = await store.isUserAdmin(VALID_ADMIN_ID);
    assert(isSuper, "admin_super_001 must be recognized as an authorized admin");
  });

  await runTest("Authorization", "Reject non-admin user with 403 Forbidden error", async () => {
    let errorCaught = false;
    try {
      await service.listUsers(UNAUTHORIZED_USER_ID);
    } catch (err: unknown) {
      errorCaught = true;
      const msg = err instanceof Error ? err.message : String(err);
      assert(msg.includes("Forbidden"), "Error must contain Forbidden rejection");
    }
    assert(errorCaught, "Calling admin service with farmer ID must be rejected");
  });

  await runTest("Authorization", "Reject empty or missing actor ID", async () => {
    let errorCaught = false;
    try {
      await service.listUsers("");
    } catch (err: unknown) {
      errorCaught = true;
      const msg = err instanceof Error ? err.message : String(err);
      assert(msg.includes("Unauthorized"), "Error must indicate Unauthorized actor ID required");
    }
    assert(errorCaught, "Missing actor ID must fail");
  });

  // ----------------------------------------------------
  // SUITE 2: User Account Administration (Suspension over Delete)
  // ----------------------------------------------------
  console.log("\nSuite 2: User Account Administration & Lifecycle");

  await runTest("User Management", "List users with role and status filtering", async () => {
    const allUsers = await service.listUsers(VALID_ADMIN_ID);
    assert(allUsers.length >= 3, "Must list all seeded users");

    const farmers = await service.listUsers(VALID_ADMIN_ID, { role: "farmer" });
    assert(farmers.length >= 1, "Must filter farmers correctly");
    assertEqual(farmers[0].role, "farmer", "Role filter must match");
  });

  await runTest("User Management", "Suspend user with reason (No hard delete, audit logged)", async () => {
    const suspended = await service.suspendUser(
      VALID_ADMIN_ID,
      TEST_USER_TARGET,
      "Compliance investigation regarding cross-border lot mismatch"
    );

    assertEqual(suspended.status, "suspended", "User status must change to suspended");
    assertEqual(suspended.suspendedBy, VALID_ADMIN_ID, "Suspended by must record admin ID");
    assert(Boolean(suspended.statusReason), "Must record suspension reason");
    assert(Boolean(suspended.suspendedAt), "Must record suspension timestamp");
  });

  await runTest("User Management", "Reactivate suspended user account", async () => {
    const activated = await service.activateUser(
      VALID_ADMIN_ID,
      TEST_USER_TARGET,
      "Documentation verified and compliance cleared"
    );

    assertEqual(activated.status, "active", "User status must return to active");
    assert(!activated.suspendedAt, "Suspended timestamp must be cleared");
  });

  await runTest("User Management", "Administratively update user role", async () => {
    const updated = await service.updateUserRole(
      VALID_ADMIN_ID,
      TEST_USER_TARGET,
      "cooperative",
      "Assigned to head of regional cooperative"
    );

    assertEqual(updated.role, "cooperative", "User role must be updated");
    // Restore back to agent for downstream tests
    await service.updateUserRole(VALID_ADMIN_ID, TEST_USER_TARGET, "agent", "Restore agent role");
  });

  // ----------------------------------------------------
  // SUITE 3: Organization Management
  // ----------------------------------------------------
  console.log("\nSuite 3: Organization Management");

  await runTest("Org Management", "List organizations directory", async () => {
    const orgs = await service.listOrganizations(VALID_ADMIN_ID);
    assert(orgs.length >= 2, "Must list seeded organizations");
    assert(orgs.some((o) => o.id === TEST_ORG_TARGET), "Must include SOWESCOP");
  });

  await runTest("Org Management", "Suspend organization with audit record", async () => {
    const updated = await service.updateOrganizationStatus(
      VALID_ADMIN_ID,
      TEST_ORG_TARGET,
      "suspended",
      "Auditing cooperative annual general records"
    );

    assertEqual(updated.status, "suspended", "Organization status must be suspended");
    assertEqual(updated.suspendedBy, VALID_ADMIN_ID, "Recorded suspendedBy");

    // Reactivate for test integrity
    await service.updateOrganizationStatus(
      VALID_ADMIN_ID,
      TEST_ORG_TARGET,
      "active",
      "Audit completed successfully"
    );
  });

  // ----------------------------------------------------
  // SUITE 4: Configurable Fees & Service Charges
  // ----------------------------------------------------
  console.log("\nSuite 4: Configurable Fees & Service Charges");

  await runTest("Fees", "List existing platform fee configurations", async () => {
    const fees = await service.listFees(VALID_ADMIN_ID);
    assert(fees.length >= 4, "Must list all seeded fees");
    assert(fees.some((f) => f.feeCode === "FEE_AGENT_AGGREGATION"), "Must include agent fee");
    assert(fees.some((f) => f.feeCode === "FEE_CUSTOMS_CLEARANCE"), "Must include customs fee");
    assert(fees.some((f) => f.feeCode === "FEE_EUDR_AUDIT"), "Must include EUDR fee");
  });

  const testFeeCode = `FEE_WAREHOUSE_STORAGE_${Date.now()}`;
  let createdFeeId = "";

  await runTest("Fees", "Create new fee configuration with version 1", async () => {
    const newFee = await service.createFeeConfig(VALID_ADMIN_ID, {
      feeCode: testFeeCode,
      title: "Warehouse Daily Moisture & Storage Fee",
      category: "warehouse_intake",
      feeType: "per_kg_naira",
      rate: 8.5,
      currency: "NGN",
      description: "Storage maintenance charge per kg per day at border warehouse",
    });

    assertEqual(newFee.version, 1, "New fee must start at version 1");
    assertEqual(newFee.rate, 8.5, "Rate must be 8.5 NGN/kg");
    assert(newFee.isActive, "New fee must be active");
    createdFeeId = newFee.id;
  });

  await runTest("Fees", "Update fee rate preserving version history", async () => {
    const updated = await service.updateFeeRate(VALID_ADMIN_ID, createdFeeId, {
      newRate: 10.0,
      reason: "Adjusted for elevated seasonal dehumidification costs",
    });

    assertEqual(updated.version, 2, "Updated fee version must increment to 2");
    assertEqual(updated.rate, 10.0, "New rate must be 10.0");

    const history = await service.getFeeHistory(VALID_ADMIN_ID, createdFeeId);
    assert(history.length >= 2, "History must contain create and update events");
    assertEqual(history[0].newRate, 10.0, "Latest history entry has new rate");
    assertEqual(history[0].previousRate, 8.5, "Latest history entry preserves old rate");
  });

  await runTest("Fees", "Reject negative fee rates", async () => {
    let errorCaught = false;
    try {
      await service.updateFeeRate(VALID_ADMIN_ID, createdFeeId, {
        newRate: -5.0,
        reason: "Illegal negative fee test",
      });
    } catch (err: unknown) {
      errorCaught = true;
      const msg = err instanceof Error ? err.message : String(err);
      assert(msg.includes("cannot be negative"), "Error must reject negative fees");
    }
    assert(errorCaught, "Negative fee rate must be rejected");
  });

  // ----------------------------------------------------
  // SUITE 5: Platform Status & Operational Controls
  // ----------------------------------------------------
  console.log("\nSuite 5: Platform Status & Operational Controls");

  await runTest("Controls", "Read global platform operational controls", async () => {
    const controls = await service.getPlatformControls(VALID_ADMIN_ID);
    assert(Boolean(controls), "Controls must be retrieved");
    assertEqual(controls.operationalStatus, "operational", "Initial status is operational");
    assert(controls.tradingEnabled, "Trading enabled initially");
    assert(controls.eudrEnforcementStrict, "EUDR enforcement enabled");
  });

  await runTest("Controls", "Update operational status with allowed values and audit reason", async () => {
    const updated = await service.updatePlatformControls(VALID_ADMIN_ID, {
      operationalStatus: "maintenance" as PlatformOperationalStatus,
      statusMessage: "Scheduled EUDR satellite polygon server sync in progress",
      reason: "Scheduled monthly system maintenance",
    });

    assertEqual(updated.operationalStatus, "maintenance", "Status must update to maintenance");
    assertEqual(updated.updatedBy, VALID_ADMIN_ID, "Admin ID recorded in updater");

    // Restore to operational
    const restored = await service.updatePlatformControls(VALID_ADMIN_ID, {
      operationalStatus: "operational" as PlatformOperationalStatus,
      statusMessage: "Corridors operational",
      reason: "Maintenance completed",
    });
    assertEqual(restored.operationalStatus, "operational", "Restored to operational");
  });

  await runTest("Controls", "Reject invalid platform status value", async () => {
    let errorCaught = false;
    try {
      await service.updatePlatformControls(VALID_ADMIN_ID, {
        operationalStatus: "invalid_status" as unknown as PlatformOperationalStatus,
        reason: "Test invalid status",
      });
    } catch (err: unknown) {
      errorCaught = true;
      const msg = err instanceof Error ? err.message : String(err);
      assert(msg.includes("Invalid operationalStatus"), "Must reject unknown status");
    }
    assert(errorCaught, "Invalid operational status must fail validation");
  });

  // ----------------------------------------------------
  // SUITE 6: Append-Only Audit Logging
  // ----------------------------------------------------
  console.log("\nSuite 6: Append-Only Audit Logging");

  await runTest("Audit", "Retrieve immutable audit logs", async () => {
    const logs = await service.getAuditLogs(VALID_ADMIN_ID, { limit: 20 });
    assert(logs.length >= 3, "Audit logs must contain user suspension, fee update, and controls change");
    assert(logs.some((l) => l.action === "USER_SUSPEND"), "Logged USER_SUSPEND");
    assert(logs.some((l) => l.action === "FEE_CREATE" || l.action === "FEE_UPDATE"), "Logged FEE actions");
    assert(logs.some((l) => l.action === "PLATFORM_STATUS_CHANGE"), "Logged PLATFORM_STATUS_CHANGE");

    // Test filter by targetType
    const userAudit = await service.getAuditLogs(VALID_ADMIN_ID, { targetType: "user" });
    assert(userAudit.every((l) => l.targetType === "user"), "Filtered targetType correctly");
  });

  // ----------------------------------------------------
  // SUITE 7: Read-Only Telemetry & Administrative Reporting
  // ----------------------------------------------------
  console.log("\nSuite 7: Read-Only Telemetry & Administrative Reporting");

  await runTest("Reporting", "Generate comprehensive platform system overview metrics", async () => {
    const overview = await service.getSystemOverview(VALID_ADMIN_ID);

    assert(Boolean(overview.timestamp), "Overview must have timestamp");
    assert(overview.users.total >= 3, "Reports total user count");
    assert(overview.organizations.total >= 2, "Reports total organization count");
    assert(overview.cocoaTraceability.registeredFarmsCount >= 0, "Reports farm counts");
    assert(overview.cocoaTraceability.totalHectaresMapped >= 0, "Reports total hectares");
    assert(overview.supplyChainOperations.activeFeesConfigured >= 4, "Reports active fees");
    assert(Boolean(overview.platformControls), "Includes current platform controls");
  });

  // ----------------------------------------------------
  // Summary
  // ----------------------------------------------------
  console.log("\n========================================================");
  console.log("TEST RESULTS SUMMARY: SYSTEM ADMINISTRATOR MODULE");
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

runAllAdminTests().catch((err) => {
  console.error("Admin test runner failed:", err);
  process.exit(1);
});
