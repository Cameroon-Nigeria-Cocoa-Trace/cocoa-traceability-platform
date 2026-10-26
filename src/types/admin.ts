export type PlatformSystemStatus =
  | "active"
  | "maintenance"
  | "suspended"
  | "emergency_stop";

export type ManagedEntityType =
  | "cooperative"
  | "agent"
  | "warehouse"
  | "customs_agency"
  | "customs_officer";

export type EntityOperationalStatus = "active" | "suspended" | "under_investigation";

export interface FeeConfig {
  id: string; // e.g. 'fee_customs_clearance'
  code: string; // e.g. 'FEE_CUSTOMS_CLEARANCE', 'FEE_CERTIFICATE_TRANSFER'
  name: string;
  description: string;
  amount: number;
  currency: "NGN" | "USD";
  isPercentage: boolean;
  applicableActorTypes: string[];
  lastUpdatedBy: string; // Admin userId
  updatedAt: string;
}

export interface EntityStatusControlRecord {
  id: string;
  entityType: ManagedEntityType;
  entityId: string;
  entityName: string;
  status: EntityOperationalStatus;
  reason?: string;
  updatedBy: string; // Admin userId
  updatedAt: string;
}

export interface AdminAuditRecord {
  id: string;
  action: string;
  targetEntityType?: string;
  targetEntityId?: string;
  details: Record<string, unknown>;
  adminUserId: string;
  adminEmail?: string;
  timestamp: string;
}

export interface AdminSystemMetrics {
  totalCooperatives: number;
  totalAgents: number;
  totalWarehouses: number;
  totalCustomsRequests: number;
  activeFarmersCount: number;
  totalPlatformTonnageKg: number;
  systemStatus: PlatformSystemStatus;
}

export interface AdminDashboardData {
  systemStatus: PlatformSystemStatus;
  metrics: AdminSystemMetrics;
  feeConfigs: FeeConfig[];
  recentAuditLogs: AdminAuditRecord[];
  suspendedEntities: EntityStatusControlRecord[];
}
