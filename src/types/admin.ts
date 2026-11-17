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
  | "customs_officer"
  | "user"
  | "farmer";

export type EntityOperationalStatus = "active" | "suspended" | "under_investigation";

export interface FeeConfig {
  id: string;
  code: string;
  name: string;
  description: string;
  amount: number;
  currency: "NGN" | "USD";
  isPercentage: boolean;
  applicableActorTypes: string[];
  lastUpdatedBy: string;
  updatedAt: string;
}

export interface EntityStatusControlRecord {
  id: string;
  entityType: ManagedEntityType;
  entityId: string;
  entityName: string;
  status: EntityOperationalStatus;
  reason?: string;
  updatedBy: string;
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
  totalUsers?: number;
  totalFarms?: number;
  eudrCompliantFarms?: number;
  totalHectares?: number;
  totalCertificates?: number;
  pendingCertApplications?: number;
  pendingCustomsRequests?: number;
  totalLots?: number;
  totalTrades?: number;
}

export interface AdminDashboardData {
  systemStatus: PlatformSystemStatus;
  metrics: AdminSystemMetrics;
  feeConfigs: FeeConfig[];
  recentAuditLogs: AdminAuditRecord[];
  suspendedEntities: EntityStatusControlRecord[];
}

export interface AdminManagedEntity {
  id: string;
  name: string;
  entityType: ManagedEntityType;
  sourceCollection: string;
  region: string;
  subtitle: string;
  operationalStatus: EntityOperationalStatus;
  statusReason?: string;
  role?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminFarmSummary {
  id: string;
  farmUniqueId?: string;
  farmName: string;
  farmerName: string;
  farmerEmail?: string;
  region: string;
  sizeHectares: number;
  eudrCompliant: boolean;
  auditStatus: string;
  deforestationRisk: string;
  createdAt?: string;
}

export interface AdminCertificateSummary {
  id: string;
  certificateNumber: string;
  holderName: string;
  holderType: string;
  originRegion: string;
  weightKg: number;
  status: string;
  eudrCompliant: boolean;
  issuedAt?: string;
}

export interface AdminCertApplicationSummary {
  id: string;
  farmName: string;
  applicantName: string;
  applicantEmail?: string;
  status: string;
  requestedWeightKg: number;
  region: string;
  submittedAt?: string;
}

export interface AdminCustomsSummary {
  id: string;
  consignmentCode: string;
  exporterName: string;
  corridor: string;
  destinationPort: string;
  weightKg: number;
  status: string;
  clearanceFeePaid: boolean;
  createdAt?: string;
}

export interface AdminLotTradeSummary {
  id: string;
  kind: "lot" | "trade";
  referenceCode: string;
  partyName: string;
  grade: string;
  weightKg: number;
  amount: number;
  currency: string;
  status: string;
  createdAt?: string;
}

export interface AdminFullSnapshot {
  dashboard: AdminDashboardData;
  entities: AdminManagedEntity[];
  farms: AdminFarmSummary[];
  certificates: AdminCertificateSummary[];
  certificateApplications: AdminCertApplicationSummary[];
  customsRequests: AdminCustomsSummary[];
  lotsAndTrades: AdminLotTradeSummary[];
  auditLogs: AdminAuditRecord[];
}
