import {
  FeeConfig,
  PlatformSystemStatus,
  EntityStatusControlRecord,
  AdminAuditRecord,
} from "@/types/admin";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

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

class AdminMemoryStore {
  systemStatus: PlatformSystemStatus = "active";
  feeConfigs: Map<string, FeeConfig> = new Map();
  entityStatuses: Map<string, EntityStatusControlRecord> = new Map();
  auditLogs: AdminAuditRecord[] = [];

  constructor() {
    this.seedDefaults();
  }

  private seedDefaults() {
    const defaultFees: FeeConfig[] = [
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

    for (const f of defaultFees) {
      this.feeConfigs.set(f.code, f);
      this.feeConfigs.set(f.id, f);
    }
  }
}

const memoryStore = new AdminMemoryStore();

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
    } catch {
      // Fallback
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
      console.warn("Firestore notice setting system status:", err);
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
    } catch {
      // Fallback
    }
    return memoryStore.feeConfigs.get(codeOrId) || null;
  }

  async listFeeConfigs(): Promise<FeeConfig[]> {
    const unique = new Map<string, FeeConfig>();
    for (const f of memoryStore.feeConfigs.values()) {
      unique.set(f.code, f);
    }
    return Array.from(unique.values());
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
      console.warn("Firestore notice saving fee config:", err);
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
    } catch {
      // Fallback
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
      console.warn("Firestore notice saving entity status:", err);
    }
    return record;
  }

  async listSuspendedEntities(): Promise<EntityStatusControlRecord[]> {
    return Array.from(memoryStore.entityStatuses.values()).filter((e) => e.status !== "active");
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
      console.warn("Firestore notice saving audit log:", err);
    }
    return log;
  }

  async listAuditLogs(limit: number = 50): Promise<AdminAuditRecord[]> {
    return memoryStore.auditLogs.slice(0, limit);
  }
}

export const adminStore = new AdminStore();
