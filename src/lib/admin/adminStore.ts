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
  AdminSystemMetrics,
  AdminFullSnapshot,
  ManagedEntityType,
  EntityOperationalStatus,
} from "@/types/admin";
import { db, handleFirestoreError, OperationType } from "@/lib/firebase";
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
} from "firebase/firestore";

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

const DEFAULT_FEES: FeeConfig[] = [
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
    for (const f of DEFAULT_FEES) {
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

async function safeGetDocs(collectionName: string): Promise<RawDoc[]> {
  try {
    const snap = await getDocs(collection(db, collectionName));
    return snap.docs.map((d) => ({
      id: d.id,
      data: (d.data() || {}) as Record<string, unknown>,
    }));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, collectionName, false);
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
  async getSystemStatus(): Promise<PlatformSystemStatus> {
    try {
      const snap = await getDoc(doc(db, "admin_settings", "platform_status"));
      if (snap.exists()) {
        const val = snap.data()?.status as PlatformSystemStatus;
        if (val) {
          memoryStore.systemStatus = val;
          return val;
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, "admin_settings/platform_status", false);
    }
    return memoryStore.systemStatus;
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
  async getFeeConfig(codeOrId: string): Promise<FeeConfig | null> {
    try {
      const snap = await getDoc(doc(db, "admin_fee_configs", codeOrId));
      if (snap.exists()) {
        const data = snap.data() as FeeConfig;
        memoryStore.feeConfigs.set(data.code, data);
        memoryStore.feeConfigs.set(data.id, data);
        return data;
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `admin_fee_configs/${codeOrId}`, false);
    }
    return memoryStore.feeConfigs.get(codeOrId) || null;
  }

  async listFeeConfigs(): Promise<FeeConfig[]> {
    const unique = new Map<string, FeeConfig>();
    for (const f of memoryStore.feeConfigs.values()) {
      unique.set(f.code, f);
    }

    try {
      const snap = await getDocs(collection(db, "admin_fee_configs"));
      if (!snap.empty) {
        for (const d of snap.docs) {
          const data = d.data() as FeeConfig;
          if (data?.code) {
            unique.set(data.code, data);
            memoryStore.feeConfigs.set(data.code, data);
            memoryStore.feeConfigs.set(data.id || d.id, data);
          }
        }
      } else if (typeof window !== "undefined") {
        // Seed defaults into Firestore on first live admin load
        for (const def of DEFAULT_FEES) {
          await setDoc(
            doc(db, "admin_fee_configs", def.code),
            cleanData(def as unknown as Record<string, unknown>)
          ).catch(() => {});
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
  async getEntityStatus(entityId: string): Promise<EntityStatusControlRecord | null> {
    try {
      const snap = await getDoc(doc(db, "admin_entity_statuses", entityId));
      if (snap.exists()) {
        const data = snap.data() as EntityStatusControlRecord;
        memoryStore.entityStatuses.set(entityId, data);
        return data;
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `admin_entity_statuses/${entityId}`, false);
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

  async listAllEntityStatuses(): Promise<EntityStatusControlRecord[]> {
    const merged = new Map<string, EntityStatusControlRecord>();
    for (const [k, v] of memoryStore.entityStatuses.entries()) {
      merged.set(k, v);
    }
    const docs = await safeGetDocs("admin_entity_statuses");
    for (const d of docs) {
      const rec = d.data as unknown as EntityStatusControlRecord;
      if (rec?.entityId) {
        merged.set(rec.entityId, rec);
        memoryStore.entityStatuses.set(rec.entityId, rec);
      }
    }
    return Array.from(merged.values());
  }

  async listSuspendedEntities(): Promise<EntityStatusControlRecord[]> {
    const all = await this.listAllEntityStatuses();
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

  async listAuditLogs(maxCount: number = 50): Promise<AdminAuditRecord[]> {
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
    try {
      await updateDoc(doc(db, "certificateApplications", appId), {
        status,
        reviewedBy: adminUserId,
        reviewNotes: reason || "",
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `certificateApplications/${appId}`, true);
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

  // Full Live Platform Snapshot from Firestore
  async getFullSnapshot(): Promise<AdminFullSnapshot> {
    const [
      systemStatus,
      feeConfigs,
      entityStatuses,
      auditLogs,
      usersDocs,
      farmsDocs,
      coopOrgDocs,
      coopLegacyDocs,
      agentOrgDocs,
      agentProfDocs,
      whFacDocs,
      whLegacyDocs,
      customsAgencyDocs,
      customsReqDocs,
      certDocs,
      certAppDocs,
      lotDocs,
      tradeDocs,
    ] = await Promise.all([
      this.getSystemStatus(),
      this.listFeeConfigs(),
      this.listAllEntityStatuses(),
      this.listAuditLogs(100),
      safeGetDocs("users"),
      safeGetDocs("farms"),
      safeGetDocs("cooperative_organizations"),
      safeGetDocs("cooperatives"),
      safeGetDocs("agent_organizations"),
      safeGetDocs("agent_profiles"),
      safeGetDocs("warehouse_facilities"),
      safeGetDocs("warehouses"),
      safeGetDocs("customs_agencies"),
      safeGetDocs("customs_requests"),
      safeGetDocs("certificates"),
      safeGetDocs("certificateApplications"),
      safeGetDocs("cocoaLots"),
      safeGetDocs("trades"),
    ]);

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
      const raw = asString(docData.adminStatus || docData.status, "active");
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
        region: region || "Cross-Corridor",
        subtitle: subtitle || sourceCollection,
        operationalStatus: resolved.status,
        statusReason: resolved.reason,
        role,
        createdAt: asString(data.createdAt),
        updatedAt: asString(data.updatedAt),
      });
    };

    for (const d of coopOrgDocs) {
      upsertEntity(
        `coop_${d.id}`,
        d.id,
        asString(d.data.name, "Cooperative Organization"),
        "cooperative",
        "cooperative_organizations",
        asString(d.data.region || d.data.headquartersAddress),
        asString(d.data.registrationNumber || d.data.contactEmail, "Cooperative Org"),
        d.data
      );
    }
    for (const d of coopLegacyDocs) {
      upsertEntity(
        `coop_${d.id}`,
        d.id,
        asString(d.data.name, "Cooperative"),
        "cooperative",
        "cooperatives",
        asString(d.data.region || d.data.location),
        asString(d.data.registrationNumber || d.data.email, "Cooperative"),
        d.data
      );
    }
    for (const d of agentOrgDocs) {
      upsertEntity(
        `agent_${d.id}`,
        d.id,
        asString(d.data.name || d.data.agencyName, "Buying Agency"),
        "agent",
        "agent_organizations",
        asString(d.data.corridor || d.data.region),
        asString(d.data.licenseNumber || d.data.contactEmail, "Buying Agency"),
        d.data
      );
    }
    for (const d of agentProfDocs) {
      const targetId = asString(d.data.agencyId, d.id);
      if (!entitiesMap.has(`agent_${targetId}`)) {
        upsertEntity(
          `agent_${d.id}`,
          d.id,
          asString(d.data.agencyName || d.data.fullName, "Buying Agent"),
          "agent",
          "agent_profiles",
          asString(d.data.corridor || d.data.region),
          asString(d.data.email || d.data.phone, "Licensed Agent"),
          d.data
        );
      }
    }
    for (const d of whFacDocs) {
      const loc = (d.data.location || {}) as Record<string, unknown>;
      upsertEntity(
        `wh_${d.id}`,
        d.id,
        asString(d.data.name, "Bonded Warehouse"),
        "warehouse",
        "warehouse_facilities",
        [asString(loc.cityOrLGA), asString(loc.stateOrRegion), asString(loc.country)]
          .filter(Boolean)
          .join(", "),
        asString(d.data.licenseNumber || d.data.contactEmail, "Bonded Terminal"),
        d.data
      );
    }
    for (const d of whLegacyDocs) {
      upsertEntity(
        `wh_${d.id}`,
        d.id,
        asString(d.data.name, "Warehouse"),
        "warehouse",
        "warehouses",
        asString(d.data.region || d.data.location),
        asString(d.data.licenseNumber || d.data.email, "Warehouse"),
        d.data
      );
    }
    for (const d of customsAgencyDocs) {
      upsertEntity(
        `customs_${d.id}`,
        d.id,
        asString(d.data.name, "Customs Agency"),
        "customs_agency",
        "customs_agencies",
        asString(d.data.borderPost || d.data.region || d.data.jurisdiction),
        asString(d.data.code || d.data.contactEmail, "Border Authority"),
        d.data
      );
    }
    for (const d of usersDocs) {
      upsertEntity(
        `user_${d.id}`,
        d.id,
        asString(d.data.displayName || d.data.fullName || d.data.email, d.id),
        "user",
        "users",
        asString(d.data.region || d.data.cooperativeOrgName || d.data.facilityName || "Platform Account"),
        asString(d.data.email || d.data.phone, "User Account"),
        d.data,
        asString(d.data.role || d.data.accountType, "farmer")
      );
    }

    const farms: AdminFarmSummary[] = farmsDocs.map((d) => ({
      id: d.id,
      farmUniqueId: asString(d.data.farmUniqueId),
      farmName: asString(d.data.farmName, "Unnamed Farm"),
      farmerName: asString(d.data.farmerName, "Producer"),
      farmerEmail: asString(d.data.farmerEmail),
      region: asString(d.data.region || d.data.village || d.data.state, "Cameroon"),
      sizeHectares: asNumber(d.data.sizeHectares || d.data.geofenceAreaHa, 0),
      eudrCompliant: asBoolean(d.data.eudrCompliant, false),
      auditStatus: asString(d.data.auditStatus, "Pending"),
      deforestationRisk: asString(d.data.deforestationRisk, "Unassessed"),
      createdAt: asString(d.data.createdAt),
    }));

    const certificates: AdminCertificateSummary[] = certDocs.map((d) => ({
      id: d.id,
      certificateNumber: asString(d.data.certificateNumber || d.data.certificateCode, d.id),
      holderName: asString(d.data.currentHolderName || d.data.farmerName || d.data.ownerName, "Holder"),
      holderType: asString(d.data.currentHolderType || d.data.holderType, "farmer"),
      originRegion: asString(d.data.originRegion || d.data.region, "Cameroon"),
      weightKg: asNumber(d.data.totalWeightKg || d.data.weightKg || d.data.quantityKg, 0),
      status: asString(d.data.status, "active"),
      eudrCompliant: asBoolean(d.data.eudrCompliant, true),
      issuedAt: asString(d.data.issuedAt || d.data.createdAt),
    }));

    const certificateApplications: AdminCertApplicationSummary[] = certAppDocs.map((d) => ({
      id: d.id,
      farmName: asString(d.data.farmName, "Cocoa Farm"),
      applicantName: asString(d.data.applicantName || d.data.farmerName, "Applicant"),
      applicantEmail: asString(d.data.applicantEmail || d.data.farmerEmail),
      status: asString(d.data.status, "pending"),
      requestedWeightKg: asNumber(d.data.quantityKg || d.data.estimatedWeightKg, 0),
      region: asString(d.data.region, "Cameroon"),
      submittedAt: asString(d.data.createdAt || d.data.submittedAt),
    }));

    const customsRequests: AdminCustomsSummary[] = customsReqDocs.map((d) => ({
      id: d.id,
      consignmentCode: asString(d.data.consignmentCode || d.data.declarationNumber, d.id),
      exporterName: asString(d.data.exporterName || d.data.applicantName || d.data.agentName, "Exporter"),
      corridor: asString(d.data.corridor || d.data.borderPost, "Mamfe - Ikom - Calabar"),
      destinationPort: asString(d.data.destinationPort, "Calabar Port"),
      weightKg: asNumber(d.data.quantityKg || d.data.weightKg, 0),
      status: asString(d.data.status, "pending"),
      clearanceFeePaid: asBoolean(d.data.feePaid || d.data.clearanceFeePaid, false),
      createdAt: asString(d.data.createdAt),
    }));

    const lotsAndTrades: AdminLotTradeSummary[] = [
      ...lotDocs.map((d) => ({
        id: d.id,
        kind: "lot" as const,
        referenceCode: asString(d.data.lotNumber || d.data.batchNumber, d.id),
        partyName: asString(d.data.farmerName || d.data.cooperativeName || d.data.ownerName, "Producer Lot"),
        grade: asString(d.data.grade || d.data.cocoaGrade, "Grade 1"),
        weightKg: asNumber(d.data.weightKg || d.data.availableWeightKg || d.data.quantityKg, 0),
        amount: asNumber(d.data.pricePerKg, 0),
        currency: asString(d.data.currency, "XAF"),
        status: asString(d.data.status, "available"),
        createdAt: asString(d.data.createdAt),
      })),
      ...tradeDocs.map((d) => ({
        id: d.id,
        kind: "trade" as const,
        referenceCode: asString(d.data.tradeReference || d.data.orderId, d.id),
        partyName: asString(d.data.buyerName || d.data.sellerName, "Counterparty Trade"),
        grade: asString(d.data.grade, "Export Lot"),
        weightKg: asNumber(d.data.quantityKg || d.data.weightKg, 0),
        amount: asNumber(d.data.totalAmount || d.data.amount, 0),
        currency: asString(d.data.currency, "XAF"),
        status: asString(d.data.status, "pending"),
        createdAt: asString(d.data.createdAt),
      })),
    ];

    const distinctCoops = new Set([
      ...coopOrgDocs.map((d) => d.id),
      ...coopLegacyDocs.map((d) => d.id),
    ]).size;

    const distinctAgents = new Set([
      ...agentOrgDocs.map((d) => d.id),
      ...agentProfDocs.map((d) => asString(d.data.agencyId, d.id)),
    ]).size;

    const distinctWarehouses = new Set([
      ...whFacDocs.map((d) => d.id),
      ...whLegacyDocs.map((d) => d.id),
    ]).size;

    const farmerUsers = usersDocs.filter(
      (d) => asString(d.data.role || d.data.accountType, "farmer") === "farmer"
    ).length;
    const distinctFarmOwners = new Set(
      farmsDocs.map((d) => asString(d.data.farmerId)).filter(Boolean)
    ).size;

    const lotsTonnage = lotDocs.reduce(
      (sum, d) => sum + asNumber(d.data.weightKg || d.data.quantityKg, 0),
      0
    );
    const whTonnage = whFacDocs.reduce(
      (sum, d) => sum + asNumber(d.data.currentStockKg, 0),
      0
    );
    const certTonnage = certDocs.reduce(
      (sum, d) => sum + asNumber(d.data.totalWeightKg || d.data.weightKg, 0),
      0
    );
    const totalPlatformTonnageKg = Math.max(lotsTonnage, whTonnage, certTonnage);

    const totalHectares = farms.reduce((sum, f) => sum + f.sizeHectares, 0);
    const eudrCompliantFarms = farms.filter((f) => f.eudrCompliant).length;
    const pendingCertApplications = certificateApplications.filter(
      (a) => a.status.toLowerCase() === "pending" || a.status.toLowerCase() === "submitted"
    ).length;
    const pendingCustomsRequests = customsRequests.filter(
      (c) => c.status.toLowerCase() === "pending" || c.status.toLowerCase() === "submitted"
    ).length;

    const metrics: AdminSystemMetrics = {
      totalCooperatives: distinctCoops,
      totalAgents: distinctAgents,
      totalWarehouses: distinctWarehouses,
      totalCustomsRequests: customsRequests.length,
      activeFarmersCount: Math.max(farmerUsers, distinctFarmOwners),
      totalPlatformTonnageKg,
      systemStatus,
      totalUsers: usersDocs.length,
      totalFarms: farms.length,
      eudrCompliantFarms,
      totalHectares: Math.round(totalHectares * 10) / 10,
      totalCertificates: certificates.length,
      pendingCertApplications,
      pendingCustomsRequests,
      totalLots: lotDocs.length,
      totalTrades: tradeDocs.length,
    };

    const suspendedEntities = entityStatuses.filter((e) => e.status !== "active");

    return {
      dashboard: {
        systemStatus,
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
      auditLogs,
    };
  }
}

export const adminStore = new AdminStore();
