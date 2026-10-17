export type AdminRole = "superadmin" | "admin" | "auditor" | "operator";

export type AdminActionType =
  | "USER_SUSPEND"
  | "USER_ACTIVATE"
  | "USER_ROLE_CHANGE"
  | "USER_ARCHIVE"
  | "ORG_STATUS_CHANGE"
  | "FEE_CREATE"
  | "FEE_UPDATE"
  | "FEE_DEACTIVATE"
  | "PLATFORM_STATUS_CHANGE"
  | "EMERGENCY_SHUTDOWN_TOGGLE"
  | "CORRIDOR_RESTRICTION_CHANGE"
  | "EUDR_ENFORCEMENT_TOGGLE"
  | "INSPECTION_OVERRIDE"
  | "REPORT_GENERATE";

export type PlatformOperationalStatus = "operational" | "maintenance" | "read_only" | "degraded";

export type EntityStatus = "active" | "suspended" | "pending" | "archived" | "deactivated";

export interface AdminUserRecord {
  uid: string;
  email: string;
  displayName: string;
  role: "farmer" | "buyer" | "cooperative" | "admin" | "agent" | "warehouse" | "customs";
  status: EntityStatus;
  statusReason?: string;
  suspendedAt?: string;
  suspendedBy?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface AdminOrganizationRecord {
  id: string;
  name: string;
  type: "cooperative" | "agent_union" | "warehouse_operator" | "exporter_consortium";
  registrationNumber?: string;
  contactEmail: string;
  contactPhone?: string;
  operatingRegion: string;
  status: EntityStatus;
  statusReason?: string;
  memberCount: number;
  suspendedAt?: string;
  suspendedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceFeeConfig {
  id: string; // e.g., "fee_agent_aggregation_standard"
  feeCode: string; // e.g., "FEE_AGENT_AGGREGATION"
  title: string;
  category: "agent_aggregation" | "cooperative_levy" | "warehouse_intake" | "customs_export" | "eudr_certification";
  feeType: "percentage" | "flat_naira" | "per_kg_naira";
  rate: number; // e.g. 1.5 (%) or 5000 (flat NGN) or 15 (NGN per kg)
  currency: "NGN" | "XAF" | "USD";
  minAmount?: number;
  maxAmount?: number;
  description: string;
  isActive: boolean;
  version: number;
  previousVersionId?: string;
  effectiveFrom: string;
  effectiveTo?: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceFeeHistoryRecord {
  id: string;
  feeConfigId: string;
  feeCode: string;
  version: number;
  changeType: "create" | "update" | "deactivate" | "reactivate";
  previousRate?: number;
  newRate: number;
  feeType: "percentage" | "flat_naira" | "per_kg_naira";
  reason: string;
  changedBy: string;
  timestamp: string;
}

export interface PlatformControls {
  id: "global_platform_controls";
  operationalStatus: PlatformOperationalStatus;
  statusMessage?: string;
  tradingEnabled: boolean;
  intakeSubmissionsEnabled: boolean;
  customsProcessingEnabled: boolean;
  eudrEnforcementStrict: boolean;
  corridorCrossBorderTransitOpen: boolean;
  allowedRegions: string[];
  maintenanceNotice?: string;
  updatedBy: string;
  updatedAt: string;
}

export interface AdminAuditLog {
  id: string;
  action: AdminActionType;
  actorId: string;
  actorEmail: string;
  actorRole: AdminRole;
  targetType: "user" | "organization" | "fee_config" | "platform_controls" | "farm" | "lot" | "system";
  targetId: string;
  beforeState?: Record<string, unknown> | null;
  afterState: Record<string, unknown>;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
  timestamp: string;
}

export interface AdminSystemOverviewMetrics {
  timestamp: string;
  users: {
    total: number;
    active: number;
    suspended: number;
    byRole: Record<string, number>;
  };
  organizations: {
    total: number;
    active: number;
    suspended: number;
  };
  cocoaTraceability: {
    registeredFarmsCount: number;
    totalHectaresMapped: number;
    eudrCompliantFarmsCount: number;
    activeMarketLotsCount: number;
    availableLotsKg: number;
  };
  supplyChainOperations: {
    activeAgentTransactions: number;
    totalAgentVolumeKg: number;
    manifestsInTransit: number;
    activeFeesConfigured: number;
  };
  platformControls: PlatformControls;
}

export interface AdminAuthContext {
  uid: string;
  email: string;
  role: AdminRole;
  isAuthorizedAdmin: boolean;
}
