export type CooperativeAccountType = "personal" | "organizational";

export type CooperativeMemberRole =
  | "president"
  | "secretary"
  | "treasurer"
  | "field_officer"
  | "member";

export type MembershipStatus = "active" | "inactive" | "suspended" | "withdrawn";

export interface CooperativeProfile {
  id: string; // e.g. 'coop_usr_...'
  userId: string; // Firebase Auth UID
  fullName: string;
  email: string;
  phone: string;
  accountType: CooperativeAccountType;
  cooperativeOrgId: string;
  cooperativeOrgName: string;
  role: CooperativeMemberRole;
  status: "active" | "suspended";
  createdAt: string;
  updatedAt: string;
}

export interface CooperativeOrganization {
  id: string; // e.g. 'org_coop_...'
  name: string;
  registrationNumber: string; // Ministry of Agriculture & Cooperatives registration
  region: string; // e.g. 'South-West Cameroon' or 'Cross River Border Basin'
  headquartersAddress: string;
  contactEmail: string;
  contactPhone: string;
  accountType?: "personal" | "organizational" | "farm_group" | string;
  representativeName?: string;
  userId?: string;
  adminId?: string;
  parentCooperativeId?: string; // For subordinate cooperative hierarchy
  parentCooperativeName?: string;
  status: "active" | "suspended";
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CooperativeFarmerMembership {
  id: string; // e.g. 'mem_coop_farm_...'
  cooperativeOrgId: string;
  farmerId: string; // Farmer's identifier / Firebase UID
  farmerName: string;
  farmerNationalIdOrCadastralRef?: string;
  villageOrCommunity: string;
  farmsCount: number;
  status: MembershipStatus;
  joinedAt: string;
  updatedAt: string;
  notes?: string;
}

export interface MembershipHistoryRecord {
  id: string;
  membershipId: string;
  cooperativeOrgId: string;
  farmerId: string;
  previousStatus?: MembershipStatus;
  newStatus: MembershipStatus;
  actionTaken: "registered" | "status_updated" | "withdrawn" | "suspended" | "reactivated";
  reason?: string;
  performedBy: string; // Cooperative officer userId
  timestamp: string;
}

export interface SubordinateCooperativeRelationship {
  id: string;
  parentCooperativeId: string;
  parentCooperativeName: string;
  subordinateCooperativeId: string;
  subordinateCooperativeName: string;
  status: "active" | "severed";
  linkedAt: string;
  severedAt?: string;
  notes?: string;
}

export interface CooperativeMetrics {
  totalRegisteredFarmers: number;
  activeFarmers: number;
  subordinateCooperativesCount: number;
  totalCertifiedCocoaReceivedKg: number;
  totalTransfersDispatchedKg: number;
  pendingCertificateTransfersCount: number;
}

export interface CooperativeDashboardData {
  profile?: CooperativeProfile | null;
  organization?: CooperativeOrganization | null;
  metrics: CooperativeMetrics;
  recentMemberships: CooperativeFarmerMembership[];
  recentMembershipHistory: MembershipHistoryRecord[];
  subordinates: SubordinateCooperativeRelationship[];
}

export interface FarmerCooperativeAssociation {
  associationId: string;
  farmerId: string;
  farmerName?: string;
  cooperativeOrgId: string;
  cooperativeOrgName: string;
  cooperativeEmail: string;
  cooperativePhone: string;
  farmScope?: "all" | "single_farm" | "specific_farms";
  delegatedFarmIds?: string[];
  delegatedFarmNames?: string[];
  manageEverything?: boolean;
  permissions: {
    farmsManagement: boolean;
    certificatesManagement: boolean;
    productionInventory: boolean;
    tradingManagement: boolean;
  };
  status: "active" | "suspended" | "withdrawn" | "inactive";
  associatedAt: string;
  updatedAt: string;
}

