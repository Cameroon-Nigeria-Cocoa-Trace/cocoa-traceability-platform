export type CooperativeAccountType = "personal" | "organizational";

export type CooperativeStatus = "pending" | "active" | "suspended" | "archived";

export type CooperativeRoleInOrg =
  | "president"
  | "secretary"
  | "treasurer"
  | "manager"
  | "extension_officer"
  | "member";

export type CooperativeTier = "apex_union" | "primary_society";

export type AffiliationStatus =
  | "active"
  | "pending_verification"
  | "suspended"
  | "ended";

export type CooperativeCertType =
  | "farm_eudr_endorsement"
  | "cooperative_origin_declaration"
  | "cross_river_full_trace_request"
  | "aggregation_dispatch";

export type CooperativeCertStatus = "valid" | "revoked" | "superseded";

export type QualityGrade = "Grade 1" | "Grade 2" | "Sub-standard";

/**
 * Personal Cooperative Officer / Delegate Profile
 */
export interface CooperativeProfile {
  id: string; // e.g. 'coop_usr_...'
  userId: string; // Link to Firebase Auth User
  fullName: string;
  email: string;
  phone: string;
  accountType: CooperativeAccountType;
  officerRole: CooperativeRoleInOrg;
  cooperativeId: string; // Affiliated cooperative organization ID
  cooperativeName: string;
  nationalIdOrNin?: string;
  operatingRegion: string;
  operatingLgas: string[];
  status: CooperativeStatus;
  statusReason?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

/**
 * Cooperative Account / Registration Input
 */
export interface CooperativeRegistrationInput {
  userId: string;
  fullName: string;
  email: string;
  phone: string;
  accountType: CooperativeAccountType;
  officerRole?: CooperativeRoleInOrg;
  cooperativeId?: string;
  cooperativeName?: string;
  nationalIdOrNin?: string;
  operatingRegion: string;
  operatingLgas?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Executive & Operational Member of a Cooperative Organization
 */
export interface CooperativeOrgMember {
  id: string;
  userId: string;
  profileId?: string;
  name: string;
  email: string;
  phone?: string;
  role: CooperativeRoleInOrg;
  status: "active" | "invited" | "suspended" | "removed";
  joinedAt: string;
  updatedAt?: string;
  notes?: string;
}

/**
 * Historical record of member role or status changes (Preserves historical audit trail)
 */
export interface CooperativeMembershipHistoryRecord {
  id: string;
  organizationId: string;
  memberId: string;
  userId: string;
  previousRole?: CooperativeRoleInOrg;
  newRole?: CooperativeRoleInOrg;
  previousStatus?: string;
  newStatus: string;
  changedBy: string;
  reason: string;
  timestamp: string;
}

/**
 * Subordinate Cooperative Relationship Record
 */
export interface SubordinateCooperativeRelationship {
  id: string;
  apexCooperativeId: string;
  apexCooperativeName: string;
  subordinateCooperativeId: string;
  subordinateCooperativeName: string;
  relationshipStatus: "active" | "suspended" | "dissolved";
  affiliationDate: string;
  dissolutionDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Cooperative Organization (Society or Apex Union)
 */
export interface CooperativeOrganization {
  id: string; // e.g. 'org_coop_...'
  name: string;
  registrationNumber: string; // Cooperative Society registration / CAC
  tier: CooperativeTier; // 'apex_union' or 'primary_society'
  parentCooperativeId?: string; // If this is a primary society under an apex union
  subordinateCooperativeIds?: string[]; // If this is an apex union
  ownerUserId: string; // Founder / Registrar user ID
  headquarters: string;
  contactEmail: string;
  contactPhone: string;
  operatingRegions: string[];
  operatingLgas: string[];
  status: CooperativeStatus;
  statusReason?: string;
  bankSettlementInfo?: {
    bankName: string;
    accountNumber: string;
    accountName: string;
  };
  members: CooperativeOrgMember[];
  memberCount: number;
  farmerCount?: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Cooperative-Farmer Affiliation Record (Relationship management)
 */
export interface CooperativeFarmerAffiliation {
  id: string; // e.g. 'aff_coop_...'
  cooperativeId: string;
  cooperativeName: string;
  farmerId: string;
  farmerName: string;
  farmerPhone?: string;
  farmerEmail?: string;
  farmId: string;
  farmName: string;
  farmRegion: string;
  farmVillage?: string;
  farmLga?: string;
  sizeHectares: number;
  cocoaVariety?: string;
  estimatedAnnualYieldKg: number;
  eudrCompliant: boolean;
  status: AffiliationStatus;
  statusReason?: string;
  affiliationDate: string;
  terminationDate?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Farmer Affiliation History Record
 */
export interface CooperativeAffiliationHistoryRecord {
  id: string;
  affiliationId: string;
  cooperativeId: string;
  farmerId: string;
  farmId: string;
  action: "affiliated" | "verified" | "suspended" | "reinstated" | "terminated";
  previousStatus?: AffiliationStatus;
  newStatus: AffiliationStatus;
  changedBy: string;
  reason?: string;
  timestamp: string;
}

/**
 * Cooperative Certificate Record
 */
export interface CooperativeCertificate {
  id: string; // e.g. 'cert_coop_...'
  certificateNumber: string; // e.g. 'CERT-COOP-EUDR-2026-0041'
  type: CooperativeCertType;
  cooperativeId: string;
  cooperativeName: string;
  issuedByOfficerId: string;
  issuedByOfficerName: string;
  // Linkages
  farmId?: string;
  farmerId?: string;
  farmerName?: string;
  batchCode?: string;
  quantityKg?: number;
  totalLotsCount?: number;
  originCorridor: string;
  eudrComplianceVerified: boolean;
  feeConfigIdApplied?: string;
  feeCodeApplied?: string;
  feeAmountPaid?: number;
  verificationHash: string;
  status: CooperativeCertStatus;
  statusReason?: string;
  issuedAt: string;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Cooperative Intake Batch Record (Aggregation of farmer harvest)
 */
export interface CooperativeIntakeBatch {
  id: string; // e.g. 'intake_coop_...'
  intakeBatchNumber: string; // e.g. 'COOP-INTAKE-2026-0012'
  cooperativeId: string;
  cooperativeName: string;
  receivedByOfficerId: string;
  receivedByOfficerName: string;
  farmerId: string;
  farmerName: string;
  farmId: string;
  farmName: string;
  quantityKg: number;
  qualityGrade: QualityGrade;
  moistureContentPercent: number;
  eudrCompliant: boolean;
  farmAuditCertificateNumber?: string;
  unitPricePerKg: number;
  currency: "NGN" | "XAF" | "USD";
  grossAmount: number;
  // Dynamic Admin Fee Application
  levyFeeRatePerKg: number; // e.g. 15 NGN/kg from FEE_COOPERATIVE_LEVY
  levyAmountDeducted: number; // quantityKg * levyFeeRatePerKg
  netPayoutToFarmer: number; // grossAmount - levyAmountDeducted
  paymentStatus: "pending" | "paid" | "retained";
  paymentReference?: string;
  intakeDate: string;
  status: "stored_in_depot" | "batched_for_dispatch" | "handed_over_to_agent" | "transferred_to_warehouse";
  dispatchReference?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Cooperative Dashboard Summary Metrics
 */
export interface CooperativeDashboardSummary {
  totalMemberFarmers: number;
  totalAffiliatedFarms: number;
  totalHectaresManaged: number;
  totalEstimatedYieldKg: number;
  totalIntakeRecordedKg: number;
  eudrCompliantFarmsCount: number;
  eudrCompliancePercentage: number;
  totalLevyCollectedAmount: number;
  activeCertificatesCount: number;
  subordinateSocietiesCount: number;
}

/**
 * Cooperative Complete Dashboard Data
 */
export interface CooperativeDashboardData {
  cooperative: CooperativeOrganization | null;
  profile?: CooperativeProfile | null;
  summary: CooperativeDashboardSummary;
  recentAffiliations: CooperativeFarmerAffiliation[];
  recentIntakes: CooperativeIntakeBatch[];
  activeCertificates: CooperativeCertificate[];
  subordinateSocieties: SubordinateCooperativeRelationship[];
}
