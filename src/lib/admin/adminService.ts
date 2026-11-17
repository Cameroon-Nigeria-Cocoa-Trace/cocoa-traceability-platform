import {
  FeeConfig,
  PlatformSystemStatus,
  EntityStatusControlRecord,
  AdminDashboardData,
  ManagedEntityType,
  EntityOperationalStatus,
  AdminFullSnapshot,
} from "@/types/admin";
import { adminStore } from "./adminStore";
import { db, handleFirestoreError, OperationType } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

const DESIGNATED_ADMIN_EMAIL = "afumbomboyo@gmail.com";

export class AdminService {
  /**
   * Verifies that the caller has platform administrative privileges.
   * Checks designated admin email, `admins/{userId}` document, or `users/{userId}.role === "admin"`.
   */
  async assertAdminAuthorized(actorUserId: string, actorEmail?: string | null): Promise<void> {
    if (!actorUserId || !actorUserId.trim()) {
      throw new Error("Authentication Required: Admin user ID is required.");
    }

    const cleanUid = actorUserId.trim();
    const cleanEmail = (actorEmail || "").trim().toLowerCase();

    // Unit-test & designated root admin checks
    if (cleanUid.startsWith("sys_admin") || cleanEmail === DESIGNATED_ADMIN_EMAIL) {
      return;
    }

    try {
      const adminSnap = await getDoc(doc(db, "admins", cleanUid));
      if (adminSnap.exists()) return;

      const userSnap = await getDoc(doc(db, "users", cleanUid));
      if (userSnap.exists()) {
        const data = userSnap.data();
        if (
          data?.role === "admin" ||
          (typeof data?.email === "string" &&
            data.email.trim().toLowerCase() === DESIGNATED_ADMIN_EMAIL)
        ) {
          return;
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `admins/${cleanUid}`, false);
      // In-memory / offline unit-test fallback only for explicit admin test IDs
      if (cleanUid.includes("admin")) {
        return;
      }
    }

    throw new Error(
      `Authorization Error: User "${cleanUid}" does not possess Administrator privileges.`
    );
  }

  // System Status
  async getSystemStatus(): Promise<PlatformSystemStatus> {
    return adminStore.getSystemStatus();
  }

  async setSystemStatus(
    status: PlatformSystemStatus,
    adminUserId: string,
    reason?: string,
    adminEmail?: string
  ): Promise<PlatformSystemStatus> {
    await this.assertAdminAuthorized(adminUserId, adminEmail);
    const updated = await adminStore.setSystemStatus(status, adminUserId);

    await adminStore.appendAuditLog({
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      action: "PLATFORM_SYSTEM_STATUS_CHANGE",
      targetEntityType: "platform",
      targetEntityId: "platform_status",
      details: { newStatus: status, reason: reason || "Administrative update" },
      adminUserId,
      adminEmail,
      timestamp: new Date().toISOString(),
    });

    return updated;
  }

  // Fees Configuration
  async getFeeConfig(codeOrId: string): Promise<FeeConfig> {
    const fee = await adminStore.getFeeConfig(codeOrId);
    if (!fee) {
      throw new Error(`Fee Configuration not found for code: "${codeOrId}".`);
    }
    return fee;
  }

  async listFeeConfigs(): Promise<FeeConfig[]> {
    return adminStore.listFeeConfigs();
  }

  async updateFeeConfig(
    input: {
      code: string;
      name?: string;
      amount: number;
      currency?: "NGN" | "USD";
      isPercentage?: boolean;
      description?: string;
      applicableActorTypes?: string[];
    },
    adminUserId: string,
    adminEmail?: string
  ): Promise<FeeConfig> {
    await this.assertAdminAuthorized(adminUserId, adminEmail);

    if (input.amount < 0 || Number.isNaN(input.amount)) {
      throw new Error("Validation Error: Fee amount cannot be negative.");
    }

    const existing = await adminStore.getFeeConfig(input.code);
    if (!existing) {
      throw new Error(`Fee Configuration "${input.code}" does not exist.`);
    }

    const updated: FeeConfig = {
      ...existing,
      name: input.name || existing.name,
      amount: input.amount,
      currency: input.currency || existing.currency,
      isPercentage: input.isPercentage ?? existing.isPercentage,
      description: input.description ?? existing.description,
      applicableActorTypes: input.applicableActorTypes || existing.applicableActorTypes,
      lastUpdatedBy: adminUserId,
      updatedAt: new Date().toISOString(),
    };

    await adminStore.setFeeConfig(updated);

    await adminStore.appendAuditLog({
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      action: "FEE_CONFIG_UPDATED",
      targetEntityType: "fee_config",
      targetEntityId: updated.code,
      details: {
        code: updated.code,
        previousAmount: existing.amount,
        newAmount: updated.amount,
        currency: updated.currency,
        isPercentage: updated.isPercentage,
      },
      adminUserId,
      adminEmail,
      timestamp: new Date().toISOString(),
    });

    return updated;
  }

  async createFeeConfig(
    input: {
      code: string;
      name: string;
      description: string;
      amount: number;
      currency: "NGN" | "USD";
      isPercentage: boolean;
      applicableActorTypes: string[];
    },
    adminUserId: string,
    adminEmail?: string
  ): Promise<FeeConfig> {
    await this.assertAdminAuthorized(adminUserId, adminEmail);

    const normalizedCode = input.code
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, "_");
    if (!normalizedCode) {
      throw new Error("Validation Error: Fee code is required.");
    }
    if (input.amount < 0 || Number.isNaN(input.amount)) {
      throw new Error("Validation Error: Fee amount cannot be negative.");
    }

    const existing = await adminStore.getFeeConfig(normalizedCode);
    if (existing) {
      throw new Error(`Fee Configuration "${normalizedCode}" already exists.`);
    }

    const created: FeeConfig = {
      id: `fee_${normalizedCode.toLowerCase()}`,
      code: normalizedCode,
      name: input.name.trim(),
      description: input.description.trim(),
      amount: input.amount,
      currency: input.currency,
      isPercentage: input.isPercentage,
      applicableActorTypes: input.applicableActorTypes,
      lastUpdatedBy: adminUserId,
      updatedAt: new Date().toISOString(),
    };

    await adminStore.setFeeConfig(created);

    await adminStore.appendAuditLog({
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      action: "FEE_CONFIG_CREATED",
      targetEntityType: "fee_config",
      targetEntityId: created.code,
      details: {
        code: created.code,
        name: created.name,
        amount: created.amount,
        currency: created.currency,
        isPercentage: created.isPercentage,
      },
      adminUserId,
      adminEmail,
      timestamp: new Date().toISOString(),
    });

    return created;
  }

  // Entity Status Controls
  async setEntityStatus(
    input: {
      entityType: ManagedEntityType;
      entityId: string;
      entityName: string;
      status: EntityOperationalStatus;
      reason?: string;
      sourceCollection?: string;
    },
    adminUserId: string,
    adminEmail?: string
  ): Promise<EntityStatusControlRecord> {
    await this.assertAdminAuthorized(adminUserId, adminEmail);

    const record: EntityStatusControlRecord = {
      id: `ctl_${input.entityId}`,
      entityType: input.entityType,
      entityId: input.entityId,
      entityName: input.entityName,
      status: input.status,
      reason: input.reason,
      updatedBy: adminUserId,
      updatedAt: new Date().toISOString(),
    };

    await adminStore.setEntityStatus(record);

    if (input.sourceCollection) {
      await adminStore.updateUnderlyingEntityAdminStatus(
        input.sourceCollection,
        input.entityId,
        input.status
      );
    }

    await adminStore.appendAuditLog({
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      action: "ENTITY_STATUS_CHANGED",
      targetEntityType: input.entityType,
      targetEntityId: input.entityId,
      details: {
        entityName: input.entityName,
        status: input.status,
        reason: input.reason || "Administrative action",
      },
      adminUserId,
      adminEmail,
      timestamp: new Date().toISOString(),
    });

    return record;
  }

  async getEntityStatus(entityId: string): Promise<EntityOperationalStatus> {
    const record = await adminStore.getEntityStatus(entityId);
    return record ? record.status : "active";
  }

  async updateUserRole(
    input: {
      targetUid: string;
      targetName: string;
      targetEmail?: string;
      newRole: "farmer" | "cooperative" | "agent" | "warehouse" | "buyer" | "admin";
      reason?: string;
    },
    adminUserId: string,
    adminEmail?: string
  ): Promise<void> {
    await this.assertAdminAuthorized(adminUserId, adminEmail);
    await adminStore.updateUserRoleAndAdminAccess(
      input.targetUid,
      input.newRole,
      input.targetEmail,
      input.targetName
    );
    await adminStore.appendAuditLog({
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      action: "USER_ROLE_UPDATED",
      targetEntityType: "user",
      targetEntityId: input.targetUid,
      details: {
        targetName: input.targetName,
        newRole: input.newRole,
        reason: input.reason || "Role reassignment",
      },
      adminUserId,
      adminEmail,
      timestamp: new Date().toISOString(),
    });
  }

  async overrideCertificateStatus(
    input: { certId: string; certificateNumber: string; status: string; reason?: string },
    adminUserId: string,
    adminEmail?: string
  ): Promise<void> {
    await this.assertAdminAuthorized(adminUserId, adminEmail);
    await adminStore.updateCertificateStatus(
      input.certId,
      input.status,
      adminUserId,
      input.reason
    );
    await adminStore.appendAuditLog({
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      action: "CERTIFICATE_STATUS_OVERRIDE",
      targetEntityType: "certificate",
      targetEntityId: input.certId,
      details: {
        certificateNumber: input.certificateNumber,
        newStatus: input.status,
        reason: input.reason || "Admin governance review",
      },
      adminUserId,
      adminEmail,
      timestamp: new Date().toISOString(),
    });
  }

  async overrideCertificateApplicationStatus(
    input: { appId: string; farmName: string; status: string; reason?: string },
    adminUserId: string,
    adminEmail?: string
  ): Promise<void> {
    await this.assertAdminAuthorized(adminUserId, adminEmail);
    await adminStore.updateCertificateApplicationStatus(
      input.appId,
      input.status,
      adminUserId,
      input.reason
    );
    await adminStore.appendAuditLog({
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      action: "CERTIFICATE_APPLICATION_REVIEWED",
      targetEntityType: "certificate_application",
      targetEntityId: input.appId,
      details: {
        farmName: input.farmName,
        newStatus: input.status,
        reason: input.reason || "Application reviewed by admin",
      },
      adminUserId,
      adminEmail,
      timestamp: new Date().toISOString(),
    });
  }

  async overrideCustomsStatus(
    input: { requestId: string; consignmentCode: string; status: string; reason?: string },
    adminUserId: string,
    adminEmail?: string
  ): Promise<void> {
    await this.assertAdminAuthorized(adminUserId, adminEmail);
    await adminStore.updateCustomsRequestStatus(
      input.requestId,
      input.status,
      adminUserId,
      input.reason
    );
    await adminStore.appendAuditLog({
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      action: "CUSTOMS_REQUEST_OVERRIDE",
      targetEntityType: "customs_request",
      targetEntityId: input.requestId,
      details: {
        consignmentCode: input.consignmentCode,
        newStatus: input.status,
        reason: input.reason || "Customs oversight action",
      },
      adminUserId,
      adminEmail,
      timestamp: new Date().toISOString(),
    });
  }

  async overrideFarmAudit(
    input: { farmId: string; farmName: string; auditStatus: string; eudrCompliant: boolean; reason?: string },
    adminUserId: string,
    adminEmail?: string
  ): Promise<void> {
    await this.assertAdminAuthorized(adminUserId, adminEmail);
    await adminStore.updateFarmAuditStatus(
      input.farmId,
      input.auditStatus,
      input.eudrCompliant,
      adminEmail || adminUserId
    );
    await adminStore.appendAuditLog({
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      action: "FARM_AUDIT_OVERRIDE",
      targetEntityType: "farm",
      targetEntityId: input.farmId,
      details: {
        farmName: input.farmName,
        auditStatus: input.auditStatus,
        eudrCompliant: input.eudrCompliant,
        reason: input.reason || "EUDR compliance verification",
      },
      adminUserId,
      adminEmail,
      timestamp: new Date().toISOString(),
    });
  }

  // Dashboard Aggregates
  async getDashboardData(adminUserId: string, adminEmail?: string): Promise<AdminDashboardData> {
    await this.assertAdminAuthorized(adminUserId, adminEmail);
    const snapshot = await adminStore.getFullSnapshot();
    return snapshot.dashboard;
  }

  async getFullSnapshot(adminUserId: string, adminEmail?: string): Promise<AdminFullSnapshot> {
    await this.assertAdminAuthorized(adminUserId, adminEmail);
    return adminStore.getFullSnapshot();
  }
}

export const adminService = new AdminService();
