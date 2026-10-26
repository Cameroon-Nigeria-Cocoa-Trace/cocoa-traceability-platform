export type AgentAccountType = "personal" | "organizational";

export type AgentRole =
  | "licensed_buying_agent"
  | "field_aggregating_officer"
  | "logistics_coordinator"
  | "operations_manager";

export type AgentLinkageType = "farmer" | "cooperative" | "warehouse";

export interface AgentProfile {
  id: string; // e.g. 'agt_usr_...'
  userId: string; // Firebase Auth UID
  fullName: string;
  email: string;
  phone: string;
  accountType: AgentAccountType;
  agencyId: string;
  agencyName: string;
  role: AgentRole;
  licenseNumber: string; // e.g. 'CRS-LBA-2026-0042'
  primaryCorridor: string; // e.g. 'Ikom-Etung-Mamfe Cross-Border Corridor'
  status: "active" | "suspended";
  createdAt: string;
  updatedAt: string;
}

export interface AgentOrganization {
  id: string; // e.g. 'org_agt_...'
  name: string;
  registrationNumber: string; // CAC / Nigerian Trade Register
  licenseCode: string;
  headquarters: string;
  contactEmail: string;
  contactPhone: string;
  operatingCorridors: string[];
  status: "active" | "suspended";
  createdAt: string;
  updatedAt: string;
}

export interface AgentLinkageRecord {
  id: string;
  agentId: string;
  linkageType: AgentLinkageType;
  partnerId: string; // farmerId, cooperativeOrgId, or warehouseId
  partnerName: string;
  partnerLocation: string;
  status: "active" | "inactive";
  linkedAt: string;
  notes?: string;
}

export interface AgentCocoaOperation {
  id: string;
  agentId: string;
  operationType: "purchase_from_farmer" | "receive_from_coop" | "deliver_to_warehouse";
  partnerId: string;
  partnerType: "farmer" | "cooperative" | "warehouse";
  quantityKg: number;
  totalBags: number;
  cocoaLotId?: string;
  certificateHoldingId?: string;
  feePaidNgn?: number;
  timestamp: string;
  status: "completed" | "pending" | "cancelled";
}

export interface AgentMetrics {
  totalLinkedFarmers: number;
  totalLinkedCooperatives: number;
  totalLinkedWarehouses: number;
  totalVolumeAggregatedKg: number;
  totalVolumeDeliveredToWarehousesKg: number;
  totalFeesPaidNgn: number;
}

export interface AgentDashboardData {
  profile?: AgentProfile | null;
  agency?: AgentOrganization | null;
  metrics: AgentMetrics;
  recentLinkages: AgentLinkageRecord[];
  recentOperations: AgentCocoaOperation[];
}
