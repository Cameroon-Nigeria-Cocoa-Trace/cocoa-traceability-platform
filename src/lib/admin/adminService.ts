import {
  AdminRole,
  AdminUserRecord,
  AdminOrganizationRecord,
  ServiceFeeConfig,
  ServiceFeeHistoryRecord,
  PlatformControls,
  PlatformOperationalStatus,
  AdminAuditLog,
  AdminSystemOverviewMetrics,
  AdminActionType,
} from "@/types/admin";
import { adminStore } from "./adminStore";
import { agentStore } from "@/lib/agent/agentStore";

export interface FeeInput {
  feeCode: string;
  title: string;
  category: ServiceFeeConfig["category"];
  feeType: ServiceFeeConfig["feeType"];
  rate: number;
  currency?: ServiceFeeConfig["currency"];
  minAmount?: number;
  maxAmount?: number;
  description: string;
}

export class AdminService {
  // ==========================================
  // 1. ADMIN AUTHORIZATION VERIFICATION
  // ==========================================

  /**
   * Enforces server-side administrator authorization.
   * Throws an error if the user is not an authorized administrator.
   */
  async verifyAdminAuth(actorId: string): Promise<boolean> {
    if (!actorId) {
      throw new Error("Unauthorized: Actor ID required for administrator operations.");
    }

    const isAdmin = await adminStore.isUserAdmin(actorId);
    if (!isAdmin) {
      throw new Error(
        `Forbidden: User ${actorId} is not authorized for administrator operations.`
      );
    }
    return true;
  }

  // ==========================================
  // 2. USER & MEMBERSHIP MANAGEMENT
  // ==========================================

  async listUsers(
    actorId: string,
    filter?: { role?: string; status?: string; search?: string }
  ): Promise<AdminUserRecord[]> {
    await this.verifyAdminAuth(actorId);
    return await adminStore.listUsers(filter);
  }

  async getUser(actorId: string, targetUid: string): Promise<AdminUserRecord> {
    await this.verifyAdminAuth(actorId);
    const user = await adminStore.getUser(targetUid);
    if (!user) {
      throw new Error(`User record not found for UID: ${targetUid}`);
    }
    return user;
  }

  /**
   * Suspend a user account (preserves historical data, no hard delete).
   */
  async suspendUser(
    actorId: string,
    targetUid: string,
    reason: string
  ): Promise<AdminUserRecord> {
    await this.verifyAdminAuth(actorId);

    const user = await adminStore.getUser(targetUid);
    if (!user) {
      throw new Error(`Cannot suspend: user ${targetUid} not found.`);
    }

    if (user.status === "suspended") {
      return user; // Already suspended
    }

    const beforeState = { ...user };
    const updated = await adminStore.updateUserRecord(targetUid, {
      status: "suspended",
      statusReason: reason,
      suspendedAt: new Date().toISOString(),
      suspendedBy: actorId,
    });

    await this.recordAuditLog({
      action: "USER_SUSPEND",
      actorId,
      actorEmail: (await adminStore.getUser(actorId))?.email || "admin@cocoatrace-cr.ng",
      actorRole: "admin",
      targetType: "user",
      targetId: targetUid,
      beforeState,
      afterState: { ...updated },
      reason,
    });

    return updated;
  }

  /**
   * Reactivate a suspended user account.
   */
  async activateUser(
    actorId: string,
    targetUid: string,
    reason?: string
  ): Promise<AdminUserRecord> {
    await this.verifyAdminAuth(actorId);

    const user = await adminStore.getUser(targetUid);
    if (!user) {
      throw new Error(`Cannot activate: user ${targetUid} not found.`);
    }

    const beforeState = { ...user };
    const updated = await adminStore.updateUserRecord(targetUid, {
      status: "active",
      statusReason: undefined,
      suspendedAt: undefined,
      suspendedBy: undefined,
    });

    await this.recordAuditLog({
      action: "USER_ACTIVATE",
      actorId,
      actorEmail: (await adminStore.getUser(actorId))?.email || "admin@cocoatrace-cr.ng",
      actorRole: "admin",
      targetType: "user",
      targetId: targetUid,
      beforeState,
      afterState: { ...updated },
      reason: reason || "Administrative reactivation",
    });

    return updated;
  }

  /**
   * Modify user role administratively.
   */
  async updateUserRole(
    actorId: string,
    targetUid: string,
    newRole: AdminUserRecord["role"],
    reason?: string
  ): Promise<AdminUserRecord> {
    await this.verifyAdminAuth(actorId);

    const user = await adminStore.getUser(targetUid);
    if (!user) {
      throw new Error(`User ${targetUid} not found.`);
    }

    const beforeState = { ...user };
    const updated = await adminStore.updateUserRecord(targetUid, {
      role: newRole,
    });

    await this.recordAuditLog({
      action: "USER_ROLE_CHANGE",
      actorId,
      actorEmail: (await adminStore.getUser(actorId))?.email || "admin@cocoatrace-cr.ng",
      actorRole: "admin",
      targetType: "user",
      targetId: targetUid,
      beforeState,
      afterState: { ...updated },
      reason: reason || `Role changed to ${newRole}`,
    });

    return updated;
  }

  // ==========================================
  // 3. ORGANIZATION MANAGEMENT
  // ==========================================

  async listOrganizations(
    actorId: string,
    filter?: { type?: string; status?: string }
  ): Promise<AdminOrganizationRecord[]> {
    await this.verifyAdminAuth(actorId);
    return await adminStore.listOrganizations(filter);
  }

  async updateOrganizationStatus(
    actorId: string,
    orgId: string,
    status: AdminOrganizationRecord["status"],
    reason: string
  ): Promise<AdminOrganizationRecord> {
    await this.verifyAdminAuth(actorId);

    const org = await adminStore.getOrganization(orgId);
    if (!org) {
      throw new Error(`Organization ${orgId} not found.`);
    }

    const beforeState = { ...org };
    const updated = await adminStore.updateOrganizationRecord(orgId, {
      status,
      statusReason: reason,
      suspendedAt: status === "suspended" ? new Date().toISOString() : undefined,
      suspendedBy: status === "suspended" ? actorId : undefined,
    });

    await this.recordAuditLog({
      action: "ORG_STATUS_CHANGE",
      actorId,
      actorEmail: (await adminStore.getUser(actorId))?.email || "admin@cocoatrace-cr.ng",
      actorRole: "admin",
      targetType: "organization",
      targetId: orgId,
      beforeState,
      afterState: { ...updated },
      reason,
    });

    return updated;
  }

  // ==========================================
  // 4. CONFIGURABLE FEES & SERVICE CHARGES
  // ==========================================

  async listFees(
    actorId: string,
    filter?: { category?: string; isActive?: boolean }
  ): Promise<ServiceFeeConfig[]> {
    await this.verifyAdminAuth(actorId);
    return await adminStore.listFeeConfigs(filter);
  }

  async getFee(actorId: string, feeIdOrCode: string): Promise<ServiceFeeConfig> {
    await this.verifyAdminAuth(actorId);
    const fee = await adminStore.getFeeConfig(feeIdOrCode);
    if (!fee) {
      throw new Error(`Fee configuration not found for: ${feeIdOrCode}`);
    }
    return fee;
  }

  /**
   * Create a new fee configuration with versioning and audit trail.
   */
  async createFeeConfig(
    actorId: string,
    input: FeeInput
  ): Promise<ServiceFeeConfig> {
    await this.verifyAdminAuth(actorId);

    // Validation
    if (!input.feeCode || !input.title || input.rate === undefined) {
      throw new Error("Missing required fee fields: feeCode, title, rate.");
    }
    if (input.rate < 0) {
      throw new Error("Fee rate cannot be negative.");
    }

    const feeId = `fee_${input.feeCode.toLowerCase()}_${Date.now()}`;
    const newConfig: ServiceFeeConfig = {
      id: feeId,
      feeCode: input.feeCode.trim().toUpperCase(),
      title: input.title.trim(),
      category: input.category,
      feeType: input.feeType,
      rate: input.rate,
      currency: input.currency || "NGN",
      minAmount: input.minAmount,
      maxAmount: input.maxAmount,
      description: input.description,
      isActive: true,
      version: 1,
      effectiveFrom: new Date().toISOString(),
      createdBy: actorId,
      updatedBy: actorId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const saved = await adminStore.saveFeeConfig(newConfig);

    // Record fee history
    const historyEntry: ServiceFeeHistoryRecord = {
      id: `feehist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      feeConfigId: saved.id,
      feeCode: saved.feeCode,
      version: saved.version,
      changeType: "create",
      newRate: saved.rate,
      feeType: saved.feeType,
      reason: "Initial fee configuration established",
      changedBy: actorId,
      timestamp: new Date().toISOString(),
    };
    await adminStore.appendFeeHistory(historyEntry);

    // Record admin audit log
    await this.recordAuditLog({
      action: "FEE_CREATE",
      actorId,
      actorEmail: (await adminStore.getUser(actorId))?.email || "admin@cocoatrace-cr.ng",
      actorRole: "admin",
      targetType: "fee_config",
      targetId: saved.id,
      beforeState: null,
      afterState: { ...saved },
      reason: `Created fee ${saved.feeCode} at rate ${saved.rate}`,
    });

    return saved;
  }

  /**
   * Updates an existing fee configuration.
   * Increments the version number and preserves complete historical records.
   */
  async updateFeeRate(
    actorId: string,
    feeIdOrCode: string,
    updates: {
      newRate?: number;
      title?: string;
      description?: string;
      isActive?: boolean;
      reason: string;
    }
  ): Promise<ServiceFeeConfig> {
    await this.verifyAdminAuth(actorId);

    const existing = await adminStore.getFeeConfig(feeIdOrCode);
    if (!existing) {
      throw new Error(`Fee configuration ${feeIdOrCode} does not exist.`);
    }

    if (!updates.reason) {
      throw new Error("A clear audit reason is required for fee rate modifications.");
    }

    if (updates.newRate !== undefined && updates.newRate < 0) {
      throw new Error("Fee rate cannot be negative.");
    }

    const previousRate = existing.rate;
    const newVersion = existing.version + 1;

    const updatedConfig: ServiceFeeConfig = {
      ...existing,
      rate: updates.newRate !== undefined ? updates.newRate : existing.rate,
      title: updates.title || existing.title,
      description: updates.description || existing.description,
      isActive: updates.isActive !== undefined ? updates.isActive : existing.isActive,
      version: newVersion,
      previousVersionId: existing.id,
      updatedBy: actorId,
      updatedAt: new Date().toISOString(),
    };

    const saved = await adminStore.saveFeeConfig(updatedConfig);

    // Append history record
    const historyEntry: ServiceFeeHistoryRecord = {
      id: `feehist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      feeConfigId: saved.id,
      feeCode: saved.feeCode,
      version: newVersion,
      changeType:
        updates.isActive === false
          ? "deactivate"
          : updates.isActive === true && !existing.isActive
          ? "reactivate"
          : "update",
      previousRate,
      newRate: saved.rate,
      feeType: saved.feeType,
      reason: updates.reason,
      changedBy: actorId,
      timestamp: new Date().toISOString(),
    };
    await adminStore.appendFeeHistory(historyEntry);

    // Audit log
    await this.recordAuditLog({
      action: "FEE_UPDATE",
      actorId,
      actorEmail: (await adminStore.getUser(actorId))?.email || "admin@cocoatrace-cr.ng",
      actorRole: "admin",
      targetType: "fee_config",
      targetId: saved.id,
      beforeState: { ...existing },
      afterState: { ...saved },
      reason: updates.reason,
    });

    return saved;
  }

  async getFeeHistory(
    actorId: string,
    feeIdOrCode?: string
  ): Promise<ServiceFeeHistoryRecord[]> {
    await this.verifyAdminAuth(actorId);
    return await adminStore.getFeeHistory(feeIdOrCode);
  }

  // ==========================================
  // 5. PLATFORM STATUS & OPERATIONAL CONTROLS
  // ==========================================

  async getPlatformControls(actorId: string): Promise<PlatformControls> {
    await this.verifyAdminAuth(actorId);
    return await adminStore.getPlatformControls();
  }

  /**
   * Updates platform operational status with allowed values:
   * "operational" | "maintenance" | "read_only" | "degraded"
   */
  async updatePlatformControls(
    actorId: string,
    updates: {
      operationalStatus?: PlatformOperationalStatus;
      statusMessage?: string;
      tradingEnabled?: boolean;
      intakeSubmissionsEnabled?: boolean;
      customsProcessingEnabled?: boolean;
      eudrEnforcementStrict?: boolean;
      corridorCrossBorderTransitOpen?: boolean;
      allowedRegions?: string[];
      maintenanceNotice?: string;
      reason: string;
    }
  ): Promise<PlatformControls> {
    await this.verifyAdminAuth(actorId);

    if (!updates.reason) {
      throw new Error("A reason must be provided when modifying platform operational controls.");
    }

    const current = await adminStore.getPlatformControls();
    const beforeState = { ...current };

    const allowedStatuses: PlatformOperationalStatus[] = [
      "operational",
      "maintenance",
      "read_only",
      "degraded",
    ];

    if (
      updates.operationalStatus &&
      !allowedStatuses.includes(updates.operationalStatus)
    ) {
      throw new Error(
        `Invalid operationalStatus: ${updates.operationalStatus}. Allowed: ${allowedStatuses.join(", ")}`
      );
    }

    const { reason, ...controlUpdates } = updates;
    const updated = await adminStore.updatePlatformControls({
      ...controlUpdates,
      updatedBy: actorId,
    });

    await this.recordAuditLog({
      action: "PLATFORM_STATUS_CHANGE",
      actorId,
      actorEmail: (await adminStore.getUser(actorId))?.email || "admin@cocoatrace-cr.ng",
      actorRole: "admin",
      targetType: "platform_controls",
      targetId: "global_platform_controls",
      beforeState,
      afterState: { ...updated },
      reason,
    });

    return updated;
  }

  // ==========================================
  // 6. AUDIT LOGGING & COMPLIANCE
  // ==========================================

  async recordAuditLog(input: {
    action: AdminActionType;
    actorId: string;
    actorEmail: string;
    actorRole: AdminRole;
    targetType: AdminAuditLog["targetType"];
    targetId: string;
    beforeState?: Record<string, unknown> | null;
    afterState: Record<string, unknown>;
    reason?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<AdminAuditLog> {
    const entry: AdminAuditLog = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      action: input.action,
      actorId: input.actorId,
      actorEmail: input.actorEmail,
      actorRole: input.actorRole,
      targetType: input.targetType,
      targetId: input.targetId,
      beforeState: input.beforeState,
      afterState: input.afterState,
      reason: input.reason,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      timestamp: new Date().toISOString(),
    };

    return await adminStore.appendAuditLog(entry);
  }

  async getAuditLogs(
    actorId: string,
    options?: {
      limit?: number;
      targetType?: string;
      action?: string;
      filterActorId?: string;
    }
  ): Promise<AdminAuditLog[]> {
    await this.verifyAdminAuth(actorId);
    return await adminStore.getAuditLogs({
      limit: options?.limit,
      targetType: options?.targetType,
      action: options?.action,
      actorId: options?.filterActorId,
    });
  }

  // ==========================================
  // 7. MONITORING & REPORTING (AGGREGATED READ-ONLY)
  // ==========================================

  /**
   * Aggregates real-time operational telemetry across all actors.
   * Completely READ-ONLY with respect to existing modules (farms, lots, agentStore).
   */
  async getSystemOverview(actorId: string): Promise<AdminSystemOverviewMetrics> {
    await this.verifyAdminAuth(actorId);

    const users = await adminStore.listUsers();
    const orgs = await adminStore.listOrganizations();
    const farms = await adminStore.getFarmsSummary();
    const lots = await adminStore.getMarketplaceLotsSummary();
    const controls = await adminStore.getPlatformControls();
    const fees = await adminStore.listFeeConfigs();

    // Query agent metrics read-only
    const agentProfile = await agentStore.getProfile("demo_agent_cr_001");
    let agentTransactionsCount = 0;
    let agentVolumeKg = 0;
    let manifestsInTransit = 0;

    if (agentProfile) {
      const txs = await agentStore.getTransactionsByAgent(agentProfile.id);
      agentTransactionsCount = txs.length;
      agentVolumeKg = txs.reduce((sum, t) => sum + (t.quantityKg || 0), 0);
      const manifests = await agentStore.getManifestsByAgent(agentProfile.id);
      manifestsInTransit = manifests.filter((m) => m.status === "in_transit").length;
    }

    const byRole: Record<string, number> = {};
    for (const u of users) {
      byRole[u.role] = (byRole[u.role] || 0) + 1;
    }

    return {
      timestamp: new Date().toISOString(),
      users: {
        total: users.length,
        active: users.filter((u) => u.status === "active").length,
        suspended: users.filter((u) => u.status === "suspended").length,
        byRole,
      },
      organizations: {
        total: orgs.length,
        active: orgs.filter((o) => o.status === "active").length,
        suspended: orgs.filter((o) => o.status === "suspended").length,
      },
      cocoaTraceability: {
        registeredFarmsCount: farms.totalFarms,
        totalHectaresMapped: farms.totalHectares,
        eudrCompliantFarmsCount: farms.eudrCompliant,
        activeMarketLotsCount: lots.totalLots,
        availableLotsKg: lots.availableLotsKg,
      },
      supplyChainOperations: {
        activeAgentTransactions: agentTransactionsCount,
        totalAgentVolumeKg: agentVolumeKg,
        manifestsInTransit,
        activeFeesConfigured: fees.filter((f) => f.isActive).length,
      },
      platformControls: controls,
    };
  }
}

export const adminService = new AdminService();
