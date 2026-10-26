export type CustomsServiceType =
  | "export_license"
  | "customs_clearance"
  | "export_license_and_customs";

export type CustomsRequestStatus =
  | "submitted"
  | "under_review"
  | "documentation_verified"
  | "inspection_scheduled"
  | "inspection_completed"
  | "duty_assessed"
  | "cleared"
  | "query_raised"
  | "rejected"
  | "cancelled";

export type CustomsPaymentStatus = "pending" | "paid" | "waived" | "refunded";

export type SubmitterType = "agent" | "warehouse";

export type CustomsAgentRole =
  | "chief_customs_broker"
  | "inspection_officer"
  | "documentation_clerk"
  | "compliance_auditor";

/**
 * Customs Agent Personal Profile
 */
export interface CustomsAgentProfile {
  id: string; // e.g. 'cag_usr_...'
  userId: string; // Firebase Auth UID
  fullName: string;
  email: string;
  phone: string;
  agencyId: string;
  agencyName: string;
  role: CustomsAgentRole;
  licenseNumber: string; // e.g. 'NCS-BRK-CR-2026-081'
  stationedPortOrBorder: string; // e.g. 'Calabar Port Berth 4' or 'Mfum Border Post'
  status: "active" | "suspended" | "revoked";
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

/**
 * Customs Brokerage Agency Organization
 */
export interface CustomsAgency {
  id: string; // e.g. 'org_customs_agency_...'
  name: string;
  registrationNumber: string; // CAC & NCS Corporate License
  customsLicenceCode: string;
  headquarters: string;
  contactEmail: string;
  contactPhone: string;
  operatingPortsAndBorders: string[];
  members: {
    id: string;
    userId: string;
    name: string;
    email: string;
    role: CustomsAgentRole;
    status: "active" | "suspended";
    joinedAt: string;
  }[];
  status: "active" | "suspended";
  createdAt: string;
  updatedAt: string;
}

/**
 * Statutory Trade & Regulatory References for Export Clearance
 */
export interface CustomsStatutoryReferences {
  singleGoodsDeclarationNumber?: string; // SGD #
  nxpFormNumber?: string; // Nigerian Export Proceeds NXP #
  cleanCertificateOfInspectionNumber?: string; // CCI #
  eur1OrEudrCertificateNumber?: string; // EUDR / Origin Certificate #
  billOfLadingOrConsignmentNote?: string;
  exitPortOrBorderPost: string; // e.g. 'Calabar Free Trade Zone Port'
  destinationCountry: string; // e.g. 'Netherlands', 'Germany', 'Belgium'
}

/**
 * Export and Customs Service Request Record
 */
export interface CustomsServiceRequest {
  id: string; // e.g. 'req_customs_...'
  requestNumber: string; // e.g. 'CSR-2026-00412'
  serviceType: CustomsServiceType;
  submitterType: SubmitterType;
  submitterId: string; // agentId or warehouseId
  submitterName: string;
  submitterContactEmail: string;
  submitterContactPhone: string;
  manifestOrBatchCode: string;
  quantityKg: number;
  totalBags: number; // 64kg jute bags
  commodityDescription: string; // e.g. 'Dried Fermented Cocoa Beans - Grade 1 EUDR Verified'
  originCorridor: string; // e.g. 'Cross River State / Cameroon Corridor'
  // Applicable Fees & Payment
  feeConfigIdApplied?: string;
  feeCodeApplied: string; // e.g. 'FEE_CUSTOMS_CLEARANCE'
  feeAmount: number;
  currency: "NGN" | "USD";
  paymentStatus: CustomsPaymentStatus;
  paymentReference?: string;
  paymentTimestamp?: string;
  // Regulatory references
  references: CustomsStatutoryReferences;
  // Lifecycle & Clearance Information
  status: CustomsRequestStatus;
  assignedOfficerId?: string;
  assignedOfficerName?: string;
  assignedAgencyId?: string;
  // Clearance output
  customsReleaseReference?: string; // Official NCS clearance release reference
  clearedAt?: string;
  clearedByOfficerId?: string;
  clearedByOfficerName?: string;
  queryNotes?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Append-Only History of Processing Steps (Audit Trail)
 */
export interface CustomsProcessingHistoryRecord {
  id: string;
  requestId: string;
  requestNumber: string;
  previousStatus?: CustomsRequestStatus;
  newStatus: CustomsRequestStatus;
  actionTaken: string;
  officerId: string;
  officerName: string;
  comments?: string;
  timestamp: string;
}

/**
 * Input for submitting a new export/customs service request
 */
export interface CreateCustomsRequestInput {
  serviceType: CustomsServiceType;
  submitterType: SubmitterType;
  submitterId: string;
  submitterName: string;
  submitterContactEmail: string;
  submitterContactPhone: string;
  manifestOrBatchCode: string;
  quantityKg: number;
  commodityDescription?: string;
  originCorridor?: string;
  destinationCountry: string;
  exitPortOrBorderPost: string;
  eur1OrEudrCertificateNumber?: string;
  nxpFormNumber?: string;
  paymentReference?: string;
  notes?: string;
}

/**
 * Customs Agent Dashboard Summary Metrics
 */
export interface CustomsDashboardMetrics {
  totalRequests: number;
  pendingReviewCount: number;
  inspectionsActiveCount: number;
  clearedCount: number;
  queriedCount: number;
  totalClearedTonnageKg: number;
  totalFeesRecordedNgn: number;
  averageProcessingHours: number;
}

/**
 * Customs Agent Dashboard Data Contract
 */
export interface CustomsDashboardData {
  agentProfile?: CustomsAgentProfile | null;
  agency?: CustomsAgency | null;
  metrics: CustomsDashboardMetrics;
  recentRequests: CustomsServiceRequest[];
  pendingActions: CustomsServiceRequest[];
  recentClearances: CustomsServiceRequest[];
}
