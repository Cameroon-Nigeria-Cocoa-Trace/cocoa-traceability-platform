import {
  FeeConfig,
  PlatformSystemStatus,
  EntityStatusControlRecord,
  AdminAuditRecord,
  AdminManagedEntity,
  AdminFarmSummary,
  AdminCertificateSummary,
  AdminCertApplicationSummary,
  AdminCustomsSummary,
  AdminLotTradeSummary,
  AdminPaymentSummary,
  AdminWarehouseReceiptSummary,
  AdminSystemMetrics,
  AdminFullSnapshot,
  ManagedEntityType,
  EntityOperationalStatus,
} from "@/types/admin";
import { auth, db, handleFirestoreError, OperationType } from "@/lib/firebase";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit as firestoreLimit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { issueTraceCertificate } from "@/services/certificateService";
import { TraceCertificate } from "@/types/traceability";

function cleanData<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        result[key] = cleanData(value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }
  }
  return result;
}

// Operational fallback fee definitions used ONLY when strictFirestore=false (unit tests / downstream fee calculators if rule not yet saved in Firestore).
// Never merged or auto-seeded into the Admin Dashboard snapshot or strict Firestore queries.
const OPERATIONAL_FALLBACK_FEES: FeeConfig[] = [
  {
    id: "fee_customs_export_clearance",
    code: "FEE_CUSTOMS_CLEARANCE",
    name: "Customs Export Processing & Statutory Clearance",
    description: "Official NCS & Cross River State border customs clearance verification fee",
    amount: 45000,
    currency: "NGN",
    isPercentage: false,
    applicableActorTypes: ["agent", "warehouse"],
    lastUpdatedBy: "sys_admin_root",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "fee_cert_transfer_farmer_agent",
    code: "FEE_CERTIFICATE_TRANSFER",
    name: "Commercial Certificate Transfer Fee",
    description: "Standard statutory fee levied when cocoa trace certificate is transferred commercially",
    amount: 15000,
    currency: "NGN",
    isPercentage: false,
    applicableActorTypes: ["farmer", "agent"],
    lastUpdatedBy: "sys_admin_root",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "fee_marketplace_service",
    code: "FEE_MARKETPLACE_COMMISSION",
    name: "Marketplace Platform Service Fee",
    description: "Platform transaction facilitation commission on cleared trades",
    amount: 2.0,
    currency: "NGN",
    isPercentage: true,
    applicableActorTypes: ["buyer", "agent", "cooperative"],
    lastUpdatedBy: "sys_admin_root",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "fee_eudr_audit_verification",
    code: "FEE_EUDR_AUDIT",
    name: "EUDR GPS Geofence & Deforestation Audit Fee",
    description: "Statutory third-party EUDR satellite deforestation audit fee per consignment",
    amount: 0.75,
    currency: "NGN",
    isPercentage: true,
    applicableActorTypes: ["warehouse", "agent"],
    lastUpdatedBy: "sys_admin_root",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "fee_crs_full_trace_inspection",
    code: "FEE_CRS_FULL_TRACE",
    name: "Cross River State Full Trace Inspection Fee",
    description: "Physical inspection and sampling fee for CRS Full Trace Certification",
    amount: 25000,
    currency: "NGN",
    isPercentage: false,
    applicableActorTypes: ["warehouse"],
    lastUpdatedBy: "sys_admin_root",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

class AdminMemoryStore {
  systemStatus: PlatformSystemStatus = "active";
  feeConfigs: Map<string, FeeConfig> = new Map();
  entityStatuses: Map<string, EntityStatusControlRecord> = new Map();
  auditLogs: AdminAuditRecord[] = [];

  constructor() {
    for (const f of OPERATIONAL_FALLBACK_FEES) {
      this.feeConfigs.set(f.code, f);
      this.feeConfigs.set(f.id, f);
    }
  }
}

const memoryStore = new AdminMemoryStore();

interface RawDoc {
  id: string;
  data: Record<string, unknown>;
}

async function safeGetDocs(collectionName: string, warnings?: string[]): Promise<RawDoc[]> {
  try {
    const snap = await getDocs(collection(db, collectionName));
    return snap.docs.map((d) => ({
      id: d.id,
      data: (d.data() || {}) as Record<string, unknown>,
    }));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, collectionName, false);
    if (warnings) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`Failed reading "${collectionName}": ${msg}`);
    }
    return [];
  }
}

function asString(val: unknown, fallback = ""): string {
  return typeof val === "string" ? val : fallback;
}

function asNumber(val: unknown, fallback = 0): number {
  if (typeof val === "number" && !Number.isNaN(val)) return val;
  if (typeof val === "string") {
    const parsed = parseFloat(val);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return fallback;
}

function asBoolean(val: unknown, fallback = false): boolean {
  return typeof val === "boolean" ? val : fallback;
}

export class AdminStore {
  // System Status
  async getSystemStatusRecord(strictFirestore = true): Promise<{
    status: PlatformSystemStatus;
    configured: boolean;
    updatedAt?: string;
    updatedBy?: string;
  }> {
    try {
      const snap = await getDoc(doc(db, "admin_settings", "platform_status"));
      if (snap.exists()) {
        const data = snap.data() || {};
        const val = data.status as PlatformSystemStatus | undefined;
        if (val) {
          memoryStore.systemStatus = val;
          return {
            status: val,
            configured: true,
            updatedAt: asString(data.updatedAt) || undefined,
            updatedBy: asString(data.updatedBy) || undefined,
          };
        }
      }
      if (strictFirestore) {
        return { status: "active", configured: false };
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, "admin_settings/platform_status", false);
      if (strictFirestore) {
        return { status: "active", configured: false };
      }
    }
    return { status: memoryStore.systemStatus, configured: false };
  }

  async getSystemStatus(strictFirestore = false): Promise<PlatformSystemStatus> {
    const rec = await this.getSystemStatusRecord(strictFirestore);
    return rec.status;
  }

  async setSystemStatus(status: PlatformSystemStatus, adminId: string): Promise<PlatformSystemStatus> {
    memoryStore.systemStatus = status;
    try {
      await setDoc(doc(db, "admin_settings", "platform_status"), {
        status,
        updatedBy: adminId,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, "admin_settings/platform_status", false);
    }
    return status;
  }

  // Fees Configuration
  async getFeeConfig(codeOrId: string, strictFirestore = false): Promise<FeeConfig | null> {
    try {
      const snap = await getDoc(doc(db, "admin_fee_configs", codeOrId));
      if (snap.exists()) {
        const data = { id: snap.id, ...(snap.data() as Omit<FeeConfig, "id">) } as FeeConfig;
        if (!strictFirestore) {
          memoryStore.feeConfigs.set(data.code || snap.id, data);
          memoryStore.feeConfigs.set(data.id, data);
        }
        return data;
      }
      if (strictFirestore) {
        return null;
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `admin_fee_configs/${codeOrId}`, false);
      if (strictFirestore) {
        return null;
      }
    }
    return memoryStore.feeConfigs.get(codeOrId) || null;
  }

  async listFeeConfigs(strictFirestore = false, warnings?: string[]): Promise<FeeConfig[]> {
    if (strictFirestore) {
      try {
        const snap = await getDocs(collection(db, "admin_fee_configs"));
        return snap.docs
          .map((d) => {
            const raw = (d.data() || {}) as Record<string, unknown>;
            return {
              id: asString(raw.id, d.id),
              code: asString(raw.code, d.id),
              name: asString(raw.name, d.id),
              description: asString(raw.description),
              amount: asNumber(raw.amount, 0),
              currency: asString(raw.currency, "NGN") as "NGN" | "USD",
              isPercentage: asBoolean(raw.isPercentage, false),
              applicableActorTypes: Array.isArray(raw.applicableActorTypes)
                ? raw.applicableActorTypes.filter((x): x is string => typeof x === "string")
                : [],
              lastUpdatedBy: asString(raw.lastUpdatedBy),
              updatedAt: asString(raw.updatedAt),
            } satisfies FeeConfig;
          })
          .sort((a, b) => a.code.localeCompare(b.code));
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, "admin_fee_configs", false);
        if (warnings) {
          warnings.push(`Failed reading "admin_fee_configs": ${err instanceof Error ? err.message : String(err)}`);
        }
        return [];
      }
    }

    const unique = new Map<string, FeeConfig>();
    for (const f of memoryStore.feeConfigs.values()) {
      unique.set(f.code, f);
    }

    try {
      const snap = await getDocs(collection(db, "admin_fee_configs"));
      for (const d of snap.docs) {
        const data = d.data() as FeeConfig;
        if (data?.code) {
          unique.set(data.code, data);
          memoryStore.feeConfigs.set(data.code, data);
          memoryStore.feeConfigs.set(data.id || d.id, data);
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, "admin_fee_configs", false);
    }

    return Array.from(unique.values()).sort((a, b) => a.code.localeCompare(b.code));
  }

  async setFeeConfig(config: FeeConfig): Promise<FeeConfig> {
    memoryStore.feeConfigs.set(config.code, config);
    memoryStore.feeConfigs.set(config.id, config);
    try {
      await setDoc(
        doc(db, "admin_fee_configs", config.code),
        cleanData(config as unknown as Record<string, unknown>)
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `admin_fee_configs/${config.code}`, false);
    }
    return config;
  }

  // Entity Status Controls
  async getEntityStatus(entityId: string, strictFirestore = false): Promise<EntityStatusControlRecord | null> {
    try {
      const snap = await getDoc(doc(db, "admin_entity_statuses", entityId));
      if (snap.exists()) {
        const data = snap.data() as EntityStatusControlRecord;
        if (!strictFirestore) {
          memoryStore.entityStatuses.set(entityId, data);
        }
        return data;
      }
      if (strictFirestore) return null;
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `admin_entity_statuses/${entityId}`, false);
      if (strictFirestore) return null;
    }
    return memoryStore.entityStatuses.get(entityId) || null;
  }

  async setEntityStatus(record: EntityStatusControlRecord): Promise<EntityStatusControlRecord> {
    memoryStore.entityStatuses.set(record.entityId, record);
    try {
      await setDoc(
        doc(db, "admin_entity_statuses", record.entityId),
        cleanData(record as unknown as Record<string, unknown>)
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `admin_entity_statuses/${record.entityId}`, false);
    }
    return record;
  }

  async listAllEntityStatuses(strictFirestore = false, warnings?: string[]): Promise<EntityStatusControlRecord[]> {
    if (strictFirestore) {
      const docs = await safeGetDocs("admin_entity_statuses", warnings);
      return docs
        .map((d) => {
          const raw = d.data;
          return {
            id: asString(raw.id, d.id),
            entityType: asString(raw.entityType, "user") as ManagedEntityType,
            entityId: asString(raw.entityId, d.id),
            entityName: asString(raw.entityName, d.id),
            status: asString(raw.status, "active") as EntityOperationalStatus,
            reason: asString(raw.reason) || undefined,
            updatedBy: asString(raw.updatedBy),
            updatedAt: asString(raw.updatedAt),
          } satisfies EntityStatusControlRecord;
        })
        .filter((r) => Boolean(r.entityId));
    }

    const merged = new Map<string, EntityStatusControlRecord>();
    for (const [k, v] of memoryStore.entityStatuses.entries()) {
      merged.set(k, v);
    }
    const docs = await safeGetDocs("admin_entity_statuses", warnings);
    for (const d of docs) {
      const rec = d.data as unknown as EntityStatusControlRecord;
      if (rec?.entityId) {
        merged.set(rec.entityId, rec);
        memoryStore.entityStatuses.set(rec.entityId, rec);
      }
    }
    return Array.from(merged.values());
  }

  async listSuspendedEntities(strictFirestore = false): Promise<EntityStatusControlRecord[]> {
    const all = await this.listAllEntityStatuses(strictFirestore);
    return all.filter((e) => e.status !== "active");
  }

  // Audit Logs
  async appendAuditLog(log: AdminAuditRecord): Promise<AdminAuditRecord> {
    memoryStore.auditLogs.unshift(log);
    try {
      await setDoc(
        doc(db, "admin_audit_logs", log.id),
        cleanData(log as unknown as Record<string, unknown>)
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `admin_audit_logs/${log.id}`, false);
    }
    return log;
  }

  async listAuditLogs(
    maxCount: number = 50,
    strictFirestore = false,
    warnings?: string[]
  ): Promise<AdminAuditRecord[]> {
    if (strictFirestore) {
      try {
        const q = query(
          collection(db, "admin_audit_logs"),
          orderBy("timestamp", "desc"),
          firestoreLimit(maxCount)
        );
        const snap = await getDocs(q);
        return snap.docs.map((d) => {
          const data = d.data() || {};
          return {
            id: d.id,
            action: asString(data.action),
            targetEntityType: asString(data.targetEntityType) || undefined,
            targetEntityId: asString(data.targetEntityId) || undefined,
            details:
              data.details && typeof data.details === "object"
                ? (data.details as Record<string, unknown>)
                : {},
            adminUserId: asString(data.adminUserId),
            adminEmail: asString(data.adminEmail) || undefined,
            timestamp: asString(data.timestamp),
          } satisfies AdminAuditRecord;
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, "admin_audit_logs", false);
        if (warnings) {
          warnings.push(`Failed reading "admin_audit_logs": ${err instanceof Error ? err.message : String(err)}`);
        }
        return [];
      }
    }

    const byId = new Map<string, AdminAuditRecord>();
    for (const item of memoryStore.auditLogs) {
      byId.set(item.id, item);
    }

    try {
      const q = query(
        collection(db, "admin_audit_logs"),
        orderBy("timestamp", "desc"),
        firestoreLimit(maxCount)
      );
      const snap = await getDocs(q);
      for (const d of snap.docs) {
        const rec = { id: d.id, ...(d.data() as Omit<AdminAuditRecord, "id">) };
        byId.set(rec.id, rec);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, "admin_audit_logs", false);
    }

    return Array.from(byId.values())
      .sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""))
      .slice(0, maxCount);
  }

  // Direct Admin Governance Overrides on Operational Collections
  async updateUnderlyingEntityAdminStatus(
    sourceCollection: string,
    entityId: string,
    status: EntityOperationalStatus
  ): Promise<void> {
    const supportedCollections = new Set([
      "cooperative_organizations",
      "cooperatives",
      "agent_profiles",
      "agent_organizations",
      "agents",
      "warehouse_facilities",
      "warehouses",
      "customs_agencies",
      "users",
    ]);
    if (!supportedCollections.has(sourceCollection) || !entityId) return;

    try {
      await updateDoc(doc(db, sourceCollection, entityId), {
        adminStatus: status,
        status: status === "active" ? "active" : status,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `${sourceCollection}/${entityId}`, false);
    }
  }

  async deleteEntityRecord(sourceCollection: string, entityId: string): Promise<void> {
    const deletableCollections = new Set([
      "cooperative_organizations",
      "cooperatives",
      "cooperative_profiles",
      "agent_profiles",
      "agent_organizations",
      "agents",
      "warehouse_facilities",
      "warehouses",
      "customs_agencies",
      "users",
    ]);
    if (!deletableCollections.has(sourceCollection) || !entityId) {
      throw new Error(`Unsupported collection for deletion: ${sourceCollection}`);
    }

    try {
      await deleteDoc(doc(db, sourceCollection, entityId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `${sourceCollection}/${entityId}`, true);
    }

    // Remove any companion admin status override doc if present
    try {
      await deleteDoc(doc(db, "admin_entity_statuses", entityId));
    } catch {
      // Ignore if override doc didn't exist
    }
    memoryStore.entityStatuses.delete(entityId);
  }

  async updateUserRoleAndAdminAccess(
    targetUid: string,
    newRole: "farmer" | "cooperative" | "agent" | "warehouse" | "buyer" | "admin",
    adminEmail?: string,
    displayName?: string
  ): Promise<void> {
    try {
      await updateDoc(doc(db, "users", targetUid), {
        role: newRole,
        accountType: newRole,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${targetUid}`, true);
    }

    try {
      const adminRef = doc(db, "admins", targetUid);
      if (newRole === "admin") {
        await setDoc(adminRef, {
          uid: targetUid,
          email: adminEmail || "",
          displayName: displayName || "",
          role: "admin",
          grantedAt: new Date().toISOString(),
        });
      } else {
        await deleteDoc(adminRef);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `admins/${targetUid}`, false);
    }
  }

  async updateCertificateStatus(
    certId: string,
    status: string,
    adminUserId: string,
    reason?: string
  ): Promise<void> {
    try {
      await updateDoc(doc(db, "certificates", certId), {
        status,
        adminReviewedBy: adminUserId,
        adminReviewReason: reason || "",
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `certificates/${certId}`, true);
    }
  }

  async updateCertificateApplicationStatus(
    appId: string,
    status: string,
    adminUserId: string,
    reason?: string
  ): Promise<void> {
    const now = new Date().toISOString();
    try {
      await updateDoc(doc(db, "certificateApplications", appId), {
        status,
        reviewedBy: adminUserId,
        reviewedAt: now,
        reviewNotes: reason || "",
        updatedAt: now,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `certificateApplications/${appId}`, true);
    }
  }

  async issueCertificateForApprovedApplication(
    appId: string,
    adminUserId: string
  ): Promise<TraceCertificate> {
    try {
      return await issueTraceCertificate({
        applicationId: appId,
        issuedBy: adminUserId,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("Capacity Exceeded Error")) {
        throw err;
      }

      // Check if uncommitted capacity is only blocked by unsold "available" uncertified listings
      // owned by the same applicant on this lot (0 completed trades / no active negotiation).
      const appSnap = await getDoc(doc(db, "certificateApplications", appId));
      if (!appSnap.exists()) throw err;
      const appData = appSnap.data() || {};
      const lotId = asString(appData.lotId);
      const applicantId = asString(appData.applicantId);
      const requestedQty = asNumber(appData.requestedQuantityKg, 0);
      if (!lotId || requestedQty <= 0) throw err;

      const lotSnap = await getDoc(doc(db, "cocoaLots", lotId));
      if (!lotSnap.exists()) throw err;
      const lotData = lotSnap.data() || {};
      const currentCertifiedKg = asNumber(lotData.certifiedQuantityKg, 0);
      const lotTotalKg = asNumber(lotData.quantityKg, 0);
      if (currentCertifiedKg + requestedQty > lotTotalKg) {
        throw err;
      }

      const listingsSnap = await getDocs(
        query(
          collection(db, "marketplaceListings"),
          where("lotId", "==", lotId),
          where("certificationType", "==", "uncertified")
        )
      );

      const candidates = listingsSnap.docs.filter((d) => {
        const l = d.data() || {};
        return (
          l.listingStatus === "available" &&
          asString(l.sellerHolderId) === applicantId &&
          asNumber(l.quantityAvailableKg, 0) > 0 &&
          asNumber(l.quantityAvailableKg, 0) === asNumber(l.quantityInitialKg, 0)
        );
      });

      if (candidates.length === 0) {
        throw err;
      }

      const now = new Date().toISOString();
      for (const listingDoc of candidates) {
        await updateDoc(doc(db, "marketplaceListings", listingDoc.id), {
          listingStatus: "cancelled",
          quantityAvailableKg: 0,
          adminCancelledReason: `Superseded by approved Origin Trace Certificate application ${appId}`,
          updatedAt: now,
        });
      }

      return await issueTraceCertificate({
        applicationId: appId,
        issuedBy: adminUserId,
      });
    }
  }

  async updateCustomsRequestStatus(
    requestId: string,
    status: string,
    adminUserId: string,
    reason?: string
  ): Promise<void> {
    try {
      await updateDoc(doc(db, "customs_requests", requestId), {
        status,
        adminOverrideBy: adminUserId,
        adminOverrideReason: reason || "",
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `customs_requests/${requestId}`, true);
    }
  }

  async updateFarmAuditStatus(
    farmId: string,
    auditStatus: string,
    eudrCompliant: boolean,
    adminUserId: string
  ): Promise<void> {
    try {
      await updateDoc(doc(db, "farms", farmId), {
        auditStatus,
        eudrCompliant,
        auditorName: adminUserId,
        auditDate: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `farms/${farmId}`, true);
    }
  }

  // Full Live Platform Snapshot strictly from Firestore (Zero dummy/memory data)
  async getFullSnapshot(): Promise<AdminFullSnapshot> {
    const warnings: string[] = [];

    const [
      statusRecord,
      feeConfigs,
      entityStatuses,
      auditLogs,
      usersDocs,
      farmsDocs,
      coopOrgDocs,
      coopLegacyDocs,
      agentOrgDocs,
      agentProfDocs,
      agentDocs,
      whFacDocs,
      whLegacyDocs,
      whReceiptDocs,
      customsAgencyDocs,
      customsReqDocs,
      certDocs,
      certAppDocs,
      lotDocs,
      listingDocs,
      tradeDocs,
      paymentDocs,
      currentAdminDocExists,
    ] = await Promise.all([
      this.getSystemStatusRecord(true),
      this.listFeeConfigs(true, warnings),
      this.listAllEntityStatuses(true, warnings),
      this.listAuditLogs(100, true, warnings),
      safeGetDocs("users", warnings),
      safeGetDocs("farms", warnings),
      safeGetDocs("cooperative_organizations", warnings),
      safeGetDocs("cooperatives", warnings),
      safeGetDocs("agent_organizations", warnings),
      safeGetDocs("agent_profiles", warnings),
      safeGetDocs("agents", warnings),
      safeGetDocs("warehouse_facilities", warnings),
      safeGetDocs("warehouses", warnings),
      safeGetDocs("warehouse_receipts", warnings),
      safeGetDocs("customs_agencies", warnings),
      safeGetDocs("customs_requests", warnings),
      safeGetDocs("certificates", warnings),
      safeGetDocs("certificateApplications", warnings),
      safeGetDocs("cocoaLots", warnings),
      safeGetDocs("marketplaceListings", warnings),
      safeGetDocs("trades", warnings),
      safeGetDocs("payments", warnings),
      auth.currentUser?.uid
        ? getDoc(doc(db, "admins", auth.currentUser.uid))
            .then((s) => s.exists())
            .catch(() => false)
        : Promise.resolve(false),
    ]);

    const currentAdminUid = currentAdminDocExists ? auth.currentUser?.uid : undefined;

    // Lookup maps strictly built from real Firestore documents
    const userById = new Map<string, RawDoc>();
    for (const u of usersDocs) {
      userById.set(u.id, u);
      const uid = asString(u.data.uid || u.data.id);
      if (uid) userById.set(uid, u);
    }

    const farmById = new Map<string, RawDoc>();
    for (const f of farmsDocs) {
      farmById.set(f.id, f);
      const fid = asString(f.data.farmId);
      if (fid) farmById.set(fid, f);
    }

    const warehouseById = new Map<string, RawDoc>();
    for (const w of [...whFacDocs, ...whLegacyDocs]) {
      warehouseById.set(w.id, w);
    }

    const resolveUserLabel = (uid: string): string => {
      if (!uid) return "";
      const u = userById.get(uid);
      if (!u) return uid;
      return asString(u.data.displayName || u.data.fullName || u.data.name || u.data.email) || uid;
    };

    const resolveUserEmail = (uid: string): string => {
      if (!uid) return "";
      const u = userById.get(uid);
      return u ? asString(u.data.email) : "";
    };

    const statusByEntityId = new Map<string, EntityStatusControlRecord>();
    for (const rec of entityStatuses) {
      statusByEntityId.set(rec.entityId, rec);
    }

    const resolveOpStatus = (
      id: string,
      docData: Record<string, unknown>
    ): { status: EntityOperationalStatus; reason?: string } => {
      const override = statusByEntityId.get(id);
      if (override) {
        return { status: override.status, reason: override.reason };
      }
      const raw = asString(docData.adminStatus || docData.status, "active").toLowerCase();
      if (raw === "suspended") return { status: "suspended" };
      if (raw === "under_investigation") return { status: "under_investigation" };
      return { status: "active" };
    };

    const entitiesMap = new Map<string, AdminManagedEntity>();

    const upsertEntity = (
      key: string,
      id: string,
      name: string,
      entityType: ManagedEntityType,
      sourceCollection: string,
      region: string,
      subtitle: string,
      data: Record<string, unknown>,
      role?: string
    ) => {
      if (entitiesMap.has(key)) return;
      const resolved = resolveOpStatus(id, data);
      entitiesMap.set(key, {
        id,
        name: name || id,
        entityType,
        sourceCollection,
        region,
        subtitle,
        operationalStatus: resolved.status,
        statusReason: resolved.reason,
        role: role || undefined,
        createdAt: asString(data.createdAt) || undefined,
        updatedAt: asString(data.updatedAt) || undefined,
      });
    };

    for (const d of coopOrgDocs) {
      upsertEntity(
        `coop_${d.id}`,
        d.id,
        asString(d.data.name || d.data.cooperativeName),
        "cooperative",
        "cooperative_organizations",
        asString(
          d.data.region ||
            d.data.headquartersAddress ||
            d.data.division ||
            d.data.country ||
            d.data.location
        ),
        asString(d.data.registrationNumber || d.data.contactEmail || d.data.email || d.data.contactPhone),
        d.data
      );
    }

    for (const d of coopLegacyDocs) {
      upsertEntity(
        `coop_${d.id}`,
        d.id,
        asString(d.data.name || d.data.cooperativeName),
        "cooperative",
        "cooperatives",
        asString(
          d.data.region ||
            d.data.headquartersAddress ||
            d.data.division ||
            d.data.country ||
            d.data.location
        ),
        asString(d.data.registrationNumber || d.data.contactEmail || d.data.email || d.data.contactPhone),
        d.data
      );
    }

    for (const d of agentOrgDocs) {
      const corridors = Array.isArray(d.data.operatingCorridors)
        ? d.data.operatingCorridors.filter((x): x is string => typeof x === "string").join(", ")
        : "";
      upsertEntity(
        `agent_${d.id}`,
        d.id,
        asString(d.data.name || d.data.agencyName),
        "agent",
        "agent_organizations",
        asString(d.data.primaryCorridor || d.data.corridor || d.data.region) ||
          corridors ||
          asString(d.data.headquarters),
        asString(
          d.data.licenseCode ||
            d.data.licenseNumber ||
            d.data.registrationNumber ||
            d.data.contactEmail
        ),
        d.data
      );
    }

    for (const d of agentProfDocs) {
      const targetAgencyId = asString(d.data.agencyId, d.id);
      if (!entitiesMap.has(`agent_${targetAgencyId}`)) {
        upsertEntity(
          `agent_${d.id}`,
          d.id,
          asString(d.data.agencyName || d.data.fullName),
          "agent",
          "agent_profiles",
          asString(d.data.primaryCorridor || d.data.corridor || d.data.region),
          asString(d.data.licenseNumber || d.data.email || d.data.phone),
          d.data
        );
      }
    }

    for (const d of agentDocs) {
      const targetAgencyId = asString(d.data.agencyId, d.id);
      if (!entitiesMap.has(`agent_${targetAgencyId}`) && !entitiesMap.has(`agent_${d.id}`)) {
        upsertEntity(
          `agent_${d.id}`,
          d.id,
          asString(d.data.agencyName || d.data.fullName),
          "agent",
          "agents",
          asString(d.data.primaryCorridor || d.data.corridor || d.data.region),
          asString(d.data.licenseNumber || d.data.email || d.data.phone),
          d.data
        );
      }
    }

    for (const d of whFacDocs) {
      const loc = (d.data.location || {}) as Record<string, unknown>;
      upsertEntity(
        `wh_${d.id}`,
        d.id,
        asString(d.data.name),
        "warehouse",
        "warehouse_facilities",
        [asString(loc.cityOrLGA), asString(loc.stateOrRegion), asString(loc.country)]
          .filter(Boolean)
          .join(", "),
        asString(d.data.licenseNumber || d.data.contactEmail || d.data.contactPhone),
        d.data
      );
    }

    for (const d of whLegacyDocs) {
      upsertEntity(
        `wh_${d.id}`,
        d.id,
        asString(d.data.name),
        "warehouse",
        "warehouses",
        asString(d.data.region || d.data.location),
        asString(d.data.licenseNumber || d.data.email),
        d.data
      );
    }

    for (const d of customsAgencyDocs) {
      upsertEntity(
        `customs_${d.id}`,
        d.id,
        asString(d.data.name),
        "customs_agency",
        "customs_agencies",
        asString(d.data.borderPost || d.data.region || d.data.jurisdiction),
        asString(d.data.code || d.data.contactEmail),
        d.data
      );
    }

    for (const d of usersDocs) {
      const derivedRole =
        currentAdminUid && d.id === currentAdminUid
          ? "admin"
          : asString(d.data.role || d.data.accountType);
      upsertEntity(
        `user_${d.id}`,
        d.id,
        asString(d.data.displayName || d.data.fullName || d.data.name || d.data.email, d.id),
        "user",
        "users",
        asString(
          d.data.region ||
            d.data.primaryCorridor ||
            d.data.cooperativeOrgName ||
            d.data.agencyName ||
            d.data.facilityName
        ),
        asString(d.data.email || d.data.phone),
        d.data,
        derivedRole
      );
    }

    const farms: AdminFarmSummary[] = farmsDocs.map((d) => {
      const farmerId = asString(d.data.farmerId);
      return {
        id: d.id,
        farmUniqueId: asString(d.data.farmUniqueId) || undefined,
        farmName: asString(d.data.farmName, d.id),
        farmerName: asString(d.data.farmerName) || resolveUserLabel(farmerId),
        farmerEmail: asString(d.data.farmerEmail) || resolveUserEmail(farmerId) || undefined,
        region: asString(d.data.region || d.data.state || d.data.village || d.data.lga),
        sizeHectares: asNumber(d.data.sizeHectares ?? d.data.geofenceAreaHa, 0),
        eudrCompliant: asBoolean(d.data.eudrCompliant, false),
        auditStatus: asString(d.data.auditStatus),
        deforestationRisk: asString(d.data.deforestationRisk),
        createdAt: asString(d.data.createdAt) || undefined,
      };
    });

    const certificates: AdminCertificateSummary[] = certDocs.map((d) => {
      const holderId = asString(
        d.data.holderId || d.data.currentHolderId || d.data.farmerId || d.data.ownerId
      );
      const farmId = asString(d.data.farmId);
      const linkedFarm = farmById.get(farmId);
      return {
        id: d.id,
        certificateNumber: asString(d.data.certificateNumber || d.data.certificateCode, d.id),
        holderName:
          asString(d.data.currentHolderName || d.data.farmerName || d.data.ownerName) ||
          resolveUserLabel(holderId),
        holderType: asString(d.data.holderType || d.data.currentHolderType),
        originRegion:
          asString(d.data.originRegion || d.data.region) ||
          asString(linkedFarm?.data.region) ||
          asString(d.data.originCountry),
        weightKg: asNumber(
          d.data.certifiedQuantityKg ??
            d.data.totalWeightKg ??
            d.data.weightKg ??
            d.data.quantityKg,
          0
        ),
        status: asString(d.data.status),
        eudrCompliant:
          typeof d.data.eudrCompliant === "boolean"
            ? d.data.eudrCompliant
            : asBoolean(linkedFarm?.data.eudrCompliant, asString(d.data.verificationStatus) === "verified"),
        issuedAt: asString(d.data.issueDate || d.data.issuedAt || d.data.createdAt) || undefined,
      };
    });

    const certificateApplications: AdminCertApplicationSummary[] = certAppDocs.map((d) => {
      const farmId = asString(d.data.farmId);
      const applicantId = asString(d.data.applicantId);
      const linkedFarm = farmById.get(farmId);
      return {
        id: d.id,
        applicationNumber: asString(d.data.applicationNumber) || undefined,
        farmName:
          asString(d.data.farmName) ||
          asString(linkedFarm?.data.farmName) ||
          farmId ||
          d.id,
        applicantName:
          asString(d.data.applicantName || d.data.farmerName) ||
          resolveUserLabel(applicantId),
        applicantEmail:
          asString(d.data.applicantEmail || d.data.farmerEmail) ||
          resolveUserEmail(applicantId) ||
          undefined,
        status: asString(d.data.status),
        requestedWeightKg: asNumber(
          d.data.requestedQuantityKg ?? d.data.quantityKg ?? d.data.estimatedWeightKg,
          0
        ),
        region:
          asString(d.data.region) ||
          asString(linkedFarm?.data.region) ||
          asString(d.data.originCountry),
        submittedAt: asString(d.data.createdAt || d.data.submittedAt) || undefined,
      };
    });

    const customsRequests: AdminCustomsSummary[] = customsReqDocs.map((d) => {
      const refs =
        d.data.references && typeof d.data.references === "object"
          ? (d.data.references as Record<string, unknown>)
          : {};
      return {
        id: d.id,
        consignmentCode: asString(
          d.data.requestNumber ||
            d.data.consignmentCode ||
            d.data.declarationNumber ||
            d.data.manifestOrBatchCode,
          d.id
        ),
        exporterName: asString(
          d.data.submitterName ||
            d.data.exporterName ||
            d.data.applicantName ||
            d.data.agentName
        ),
        corridor: asString(
          d.data.originCorridor || d.data.corridor || d.data.borderPost
        ),
        destinationPort: asString(refs.exitPortOrBorderPost || d.data.destinationPort),
        destinationCountry: asString(refs.destinationCountry || d.data.destinationCountry) || undefined,
        weightKg: asNumber(d.data.quantityKg ?? d.data.weightKg, 0),
        status: asString(d.data.status),
        clearanceFeePaid:
          asString(d.data.paymentStatus).toLowerCase() === "paid" ||
          asBoolean(d.data.feePaid || d.data.clearanceFeePaid, false),
        createdAt: asString(d.data.createdAt) || undefined,
      };
    });

    const lotsAndTrades: AdminLotTradeSummary[] = [
      ...lotDocs.map((d) => {
        const farmId = asString(d.data.farmId);
        const createdBy = asString(d.data.createdBy);
        const linkedFarm = farmById.get(farmId);
        return {
          id: d.id,
          kind: "lot" as const,
          referenceCode: asString(d.data.lotNumber || d.data.batchNumber, d.id),
          partyName:
            asString(d.data.farmerName || d.data.cooperativeName || d.data.ownerName) ||
            asString(linkedFarm?.data.farmerName) ||
            resolveUserLabel(createdBy) ||
            asString(linkedFarm?.data.farmName),
          grade: asString(d.data.qualityGrade || d.data.grade || d.data.cocoaGrade),
          weightKg: asNumber(
            d.data.quantityKg ??
              d.data.availableQuantityKg ??
              d.data.weightKg ??
              d.data.availableWeightKg,
            0
          ),
          amount: asNumber(d.data.pricePerKg, 0),
          currency: asString(d.data.currency),
          status: asString(d.data.lotStatus || d.data.status),
          createdAt: asString(d.data.createdAt) || undefined,
        };
      }),
      ...listingDocs.map((d) => {
        const sellerId = asString(d.data.sellerHolderId || d.data.createdByUid);
        const sellerLabel = resolveUserLabel(sellerId);
        const listingTitle = asString(d.data.title);
        return {
          id: d.id,
          kind: "listing" as const,
          referenceCode: asString(d.data.listingNumber, d.id),
          partyName:
            listingTitle && sellerLabel && listingTitle !== sellerLabel
              ? `${listingTitle} · ${sellerLabel}`
              : listingTitle || sellerLabel,
          grade: asString(d.data.qualityGrade || d.data.certificationType),
          weightKg: asNumber(d.data.quantityAvailableKg ?? d.data.quantityInitialKg, 0),
          amount: asNumber(d.data.pricePerKg, 0),
          currency: asString(d.data.currency),
          status: asString(d.data.listingStatus || d.data.status),
          createdAt: asString(d.data.createdAt) || undefined,
        };
      }),
      ...tradeDocs.map((d) => {
        const buyerLabel =
          asString(d.data.buyerName) || resolveUserLabel(asString(d.data.buyerId));
        const sellerLabel =
          asString(d.data.sellerName) ||
          resolveUserLabel(asString(d.data.sellerHolderId || d.data.sellerId));
        return {
          id: d.id,
          kind: "trade" as const,
          referenceCode: asString(
            d.data.tradeNumber || d.data.tradeReference || d.data.orderId,
            d.id
          ),
          partyName: [buyerLabel, sellerLabel].filter(Boolean).join(" → "),
          grade: asString(d.data.grade || d.data.certificationType),
          weightKg: asNumber(d.data.quantityKg ?? d.data.weightKg, 0),
          amount: asNumber(d.data.totalAmount ?? d.data.amount, 0),
          currency: asString(d.data.currency),
          status: asString(d.data.tradeStatus || d.data.status),
          createdAt: asString(d.data.createdAt) || undefined,
        };
      }),
    ];

    const payments: AdminPaymentSummary[] = paymentDocs.map((d) => ({
      id: d.id,
      paymentReference: asString(d.data.paymentReference || d.data.paymentId, d.id),
      payerName: resolveUserLabel(asString(d.data.payerId || d.data.buyerUid)),
      payeeName: resolveUserLabel(asString(d.data.payeeId || d.data.sellerId)),
      purpose: asString(d.data.paymentPurpose),
      gateway: asString(d.data.paymentGateway),
      amount: asNumber(d.data.amountCharged ?? d.data.amount, 0),
      currency: asString(d.data.currency),
      status: asString(d.data.paymentStatus || d.data.status),
      createdAt: asString(d.data.createdAt) || undefined,
    }));

    const warehouseReceipts: AdminWarehouseReceiptSummary[] = whReceiptDocs.map((d) => {
      const facilityId = asString(d.data.facilityId);
      const facility = warehouseById.get(facilityId);
      return {
        id: d.id,
        consignmentCode: asString(d.data.consignmentCode, d.id),
        facilityName: asString(facility?.data.name) || facilityId,
        sourceEntityName: asString(d.data.sourceEntityName || d.data.sourceEntityId),
        grade: asString(d.data.qualityInspectionGrade),
        quantityKg: asNumber(d.data.quantityKg, 0),
        totalBags: asNumber(d.data.totalBags, 0),
        receivedAt: asString(d.data.receivedAt) || undefined,
      };
    });

    const distinctCoops = new Set([
      ...coopOrgDocs.map((d) => d.id),
      ...coopLegacyDocs.map((d) => d.id),
    ]).size;

    const distinctAgents = new Set([
      ...agentOrgDocs.map((d) => d.id),
      ...agentProfDocs.map((d) => asString(d.data.agencyId, d.id)),
      ...agentDocs.map((d) => asString(d.data.agencyId, d.id)),
    ]).size;

    const distinctWarehouses = new Set([
      ...whFacDocs.map((d) => d.id),
      ...whLegacyDocs.map((d) => d.id),
    ]).size;

    const activeFarmerIds = new Set<string>();
    for (const u of usersDocs) {
      const role = asString(u.data.role || u.data.accountType).toLowerCase();
      if (role === "farmer") activeFarmerIds.add(u.id);
    }
    for (const f of farmsDocs) {
      const fid = asString(f.data.farmerId);
      if (fid) activeFarmerIds.add(fid);
    }

    const lotsTonnage = lotDocs.reduce(
      (sum, d) => sum + asNumber(d.data.quantityKg ?? d.data.weightKg, 0),
      0
    );
    const whTonnage = whFacDocs.reduce(
      (sum, d) => sum + asNumber(d.data.currentStockKg, 0),
      0
    );
    const certTonnage = certDocs.reduce(
      (sum, d) =>
        sum + asNumber(d.data.certifiedQuantityKg ?? d.data.totalWeightKg ?? d.data.weightKg, 0),
      0
    );
    const totalPlatformTonnageKg = Math.max(lotsTonnage, whTonnage, certTonnage);

    const totalHectares = farms.reduce((sum, f) => sum + f.sizeHectares, 0);
    const eudrCompliantFarms = farms.filter((f) => f.eudrCompliant).length;
    const pendingCertApplications = certificateApplications.filter((a) =>
      ["pending", "submitted"].includes(a.status.toLowerCase())
    ).length;
    const pendingCustomsRequests = customsRequests.filter((c) =>
      ["pending", "submitted"].includes(c.status.toLowerCase())
    ).length;

    const metrics: AdminSystemMetrics = {
      totalCooperatives: distinctCoops,
      totalAgents: distinctAgents,
      totalWarehouses: distinctWarehouses,
      totalCustomsRequests: customsRequests.length,
      activeFarmersCount: activeFarmerIds.size,
      totalPlatformTonnageKg,
      systemStatus: statusRecord.status,
      totalUsers: usersDocs.length,
      totalFarms: farms.length,
      eudrCompliantFarms,
      totalHectares: Math.round(totalHectares * 10) / 10,
      totalCertificates: certificates.length,
      pendingCertApplications,
      pendingCustomsRequests,
      totalLots: lotDocs.length,
      totalListings: listingDocs.length,
      totalTrades: tradeDocs.length,
      totalPayments: paymentDocs.length,
      warehouseReceiptsCount: whReceiptDocs.length,
    };

    const suspendedEntities = entityStatuses.filter((e) => e.status !== "active");

    return {
      dashboard: {
        systemStatus: statusRecord.status,
        systemStatusConfigured: statusRecord.configured,
        systemStatusUpdatedAt: statusRecord.updatedAt,
        systemStatusUpdatedBy: statusRecord.updatedBy,
        metrics,
        feeConfigs,
        recentAuditLogs: auditLogs.slice(0, 20),
        suspendedEntities,
      },
      entities: Array.from(entitiesMap.values()),
      farms,
      certificates,
      certificateApplications,
      customsRequests,
      lotsAndTrades,
      payments,
      warehouseReceipts,
      auditLogs,
      readWarnings: warnings.length > 0 ? warnings : undefined,
    };
  }
}

export const adminStore = new AdminStore();
