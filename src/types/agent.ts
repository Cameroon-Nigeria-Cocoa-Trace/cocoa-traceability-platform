export type AgentAccountType = "personal" | "organizational";

export type AgentStatus = "pending" | "active" | "suspended" | "revoked";

export type AgentRoleInOrg = "owner" | "manager" | "agent" | "inspector";

export type QualityGrade = "Grade 1" | "Grade 2" | "Sub-standard";

export type PaymentMethod = "bank_transfer" | "mobile_money" | "cash" | "coop_credit";

export type PaymentStatus = "pending" | "completed" | "failed";

export type TransactionStatus = "completed" | "aggregated" | "cancelled";

export type ManifestStatus = "prepared" | "in_transit" | "delivered" | "accepted_by_warehouse";

export type CertificateType =
  | "field_inspection"
  | "quality_intake"
  | "chain_of_custody_intake"
  | "aggregation_manifest";

export type CertificateStatus = "valid" | "revoked" | "superseded";

/**
 * Agent Profile (Personal or Organizational representative)
 */
export interface AgentProfile {
  id: string; // Unique agent ID (e.g., 'agent_1728460000_abcde')
  userId: string; // Link to Firebase Auth User
  fullName: string;
  email: string;
  phone: string;
  accountType: AgentAccountType;
  accreditationNumber: string; // e.g., 'AGT-CR-2026-0891'
  nationalIdOrNin?: string;
  status: AgentStatus;
  operatingRegion: string; // e.g., 'Cross River State' or 'Southwest Cameroon'
  operatingLgas: string[]; // e.g., ['Ikom', 'Etung', 'Boki']
  assignedCooperativeId?: string;
  assignedCooperativeName?: string;
  organizationId?: string; // If organizational agent
  organizationRole?: AgentRoleInOrg;
  serviceFeePercentage?: number; // Configurable fee rate (e.g. 1.5%)
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Agent Registration Input
 */
export interface AgentRegistrationInput {
  userId: string;
  fullName: string;
  email: string;
  phone: string;
  accountType: AgentAccountType;
  accreditationNumber?: string;
  nationalIdOrNin?: string;
  operatingRegion: string;
  operatingLgas: string[];
  assignedCooperativeId?: string;
  assignedCooperativeName?: string;
  organizationId?: string;
  organizationRole?: AgentRoleInOrg;
  serviceFeePercentage?: number;
}

/**
 * Agent Organization Member
 */
export interface AgentOrgMember {
  id: string;
  userId: string;
  agentId: string;
  name: string;
  email: string;
  phone?: string;
  role: AgentRoleInOrg;
  status: "active" | "invited" | "inactive";
  joinedAt: string;
}

/**
 * Agent Organization
 */
export interface AgentOrganization {
  id: string; // e.g. 'org_agt_...'
  name: string;
  registrationNumber: string; // CAC / Commercial registration
  ownerId: string; // userId of founder
  headquarters: string;
  contactEmail: string;
  contactPhone: string;
  operatingRegions: string[];
  serviceFeePercentage?: number; // Default org fee rate
  members: AgentOrgMember[];
  status: AgentStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * Agent Quality Intake / Field Inspection Record
 */
export interface AgentInspection {
  id: string; // e.g. 'insp_agt_...'
  agentId: string;
  agentName: string;
  organizationId?: string;
  farmId: string; // Links to existing FarmRecord
  farmerId: string;
  farmerName: string;
  cooperative?: string;
  inspectionDate: string;
  moistureContentPercent: number; // Max EUDR standard ~ 7.5% - 8.0%
  beanCountPer100g: number; // e.g. 95-105 beans
  fermentationRatePercent: number; // Target > 80%
  defectiveBeansPercent: number; // Moldy/slate/insect damage < 3%
  eudrComplianceVerified: boolean;
  geolocationVerified: boolean;
  geolocation: string;
  qualityGrade: QualityGrade;
  notes?: string;
  certificateIssued: boolean;
  certificateNumber?: string;
  createdAt: string;
}

/**
 * Cocoa Purchasing / Aggregation Transaction
 */
export interface AgentTransaction {
  id: string; // e.g. 'txn_agt_...'
  agentId: string;
  agentName: string;
  organizationId?: string;
  farmId: string; // Source Farm plot
  farmerId: string;
  farmerName: string;
  cooperative?: string;
  quantityKg: number;
  unitPrice: number; // Price per kg
  currency: string; // 'FCFA' | 'NGN' | 'USD'
  grossAmount: number; // quantityKg * unitPrice
  feeRateApplied: number; // percentage (e.g. 1.5%)
  serviceFeeAmount: number; // grossAmount * (feeRateApplied / 100)
  netAmount: number; // grossAmount - serviceFeeAmount (or payout amount)
  paymentMethod: PaymentMethod;
  paymentReference: string;
  paymentStatus: PaymentStatus;
  batchCode: string; // Batch number from farmer or newly assigned
  inspectionId?: string; // Linked inspection record
  warehouseDestinationId?: string;
  warehouseDestinationName?: string;
  status: TransactionStatus;
  transactionDate: string;
  createdAt: string;
}

/**
 * Agent Batch Aggregation & Warehouse Handover Manifest
 */
export interface AgentBatchManifest {
  id: string; // e.g. 'manifest_agt_...'
  manifestNumber: string; // e.g. 'MAN-CR-2026-001'
  agentId: string;
  agentName: string;
  organizationId?: string;
  transactionIds: string[]; // Aggregated purchase transaction IDs
  totalQuantityKg: number;
  totalBagCount: number; // Standard 64kg jute bags
  originSummary: string; // e.g. 'Cross River Corridor / Southwest Cameroon'
  cooperativesInvolved: string[];
  warehouseId: string;
  warehouseName: string;
  warehouseLocation: string;
  traceCertificateNumber: string;
  handoverDate: string;
  status: ManifestStatus;
  receivedByWarehouseOfficer?: string;
  acceptanceNotes?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Agent Certificate Record
 */
export interface AgentCertificate {
  id: string; // e.g. 'cert_agt_...'
  certificateNumber: string; // e.g. 'CERT-AGT-INSP-24098'
  type: CertificateType;
  agentId: string;
  agentName: string;
  accreditationNumber: string;
  farmId?: string;
  farmerName?: string;
  cooperative?: string;
  batchCode?: string;
  quantityKg?: number;
  eudrOriginCountry: string; // 'Cameroon' | 'Nigeria (Cross River)'
  issuedAt: string;
  expiresAt?: string;
  verificationHash: string;
  status: CertificateStatus;
}

/**
 * Agent Dashboard Metrics & Operational Records
 */
export interface AgentDashboardSummary {
  totalCocoaPurchasedKg: number;
  totalExpenditure: number;
  totalTransactionsCount: number;
  activeFarmersCount: number;
  cooperativesCount: number;
  batchesAggregatedCount: number;
  warehouseDeliveriesCount: number;
  averageQualityGrade: QualityGrade;
  eudrComplianceRate: number; // Percentage 0 - 100
}

export interface AgentDashboardData {
  agent: AgentProfile;
  summary: AgentDashboardSummary;
  recentTransactions: AgentTransaction[];
  recentInspections: AgentInspection[];
  recentManifests: AgentBatchManifest[];
  activeCertificates: AgentCertificate[];
}
