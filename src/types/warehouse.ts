export type WarehouseFacilityType =
  | "central_aggregation"
  | "transit_terminal"
  | "port_export_facility"
  | "regional_depot";

export type WarehouseOperationalStatus =
  | "operational"
  | "at_capacity"
  | "maintenance"
  | "closed";

export type WarehouseAdminStatus = "active" | "suspended" | "deactivated";

export type WarehouseStaffRole =
  | "warehouse_manager"
  | "intake_officer"
  | "quality_inspector"
  | "inventory_clerk";

export type WarehouseAccountType = "personal" | "organizational";

export type ReceiptSourceType =
  | "agent_manifest"
  | "cooperative_intake"
  | "direct_lot";

export type ReceiptStatus = "received" | "reversal" | "adjusted";

export type QualityGrade = "Grade 1" | "Grade 2" | "Sub-standard";

/**
 * Scoped Actor Context for Warehouse operations
 */
export interface WarehouseActorContext {
  userId: string;
  warehouseId: string;
  role?: WarehouseStaffRole | "admin";
  isSuperAdmin?: boolean;
}

/**
 * Personal Account / Warehouse Officer Profile
 */
export interface WarehouseProfile {
  id: string; // e.g. 'wh_usr_...'
  userId: string; // Firebase Auth UID
  warehouseId: string; // Scoped facility ID
  warehouseName: string;
  fullName: string;
  email: string;
  phone: string;
  roleInWarehouse: WarehouseStaffRole;
  accountType: WarehouseAccountType;
  staffBadgeNumber?: string;
  status: "active" | "suspended" | "deactivated";
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

/**
 * Staff member inside the warehouse organization
 */
export interface WarehouseMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone?: string;
  role: WarehouseStaffRole;
  status: "active" | "invited" | "suspended" | "removed";
  joinedAt: string;
  updatedAt?: string;
  notes?: string;
}

/**
 * Historical Membership Transition Record
 */
export interface WarehouseMembershipHistoryRecord {
  id: string;
  warehouseId: string;
  memberId: string;
  userId: string;
  previousRole?: WarehouseStaffRole;
  newRole?: WarehouseStaffRole;
  previousStatus?: string;
  newStatus: string;
  changedBy: string;
  reason: string;
  timestamp: string;
}

/**
 * Physical Location and Coordinates (Pure validation; no geofencing mutation)
 */
export interface WarehouseLocationInfo {
  address: string;
  city: string;
  lga: string;
  state: string;
  country: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  operatingHours: string;
  customsZone?: string;
}

/**
 * Warehouse Organization and Facility Entity
 */
export interface WarehouseFacility {
  id: string; // e.g. 'wh_ikom_central'
  name: string;
  registrationNumber: string; // CAC / Export Depot License
  ownerUserId: string;
  facilityType: WarehouseFacilityType;
  contactEmail: string;
  contactPhone: string;
  location: WarehouseLocationInfo;
  maxCapacityKg: number; // e.g. 5,000,000 kg (5,000 tonnes)
  currentStockKg: number;
  availableCapacityKg: number;
  maxCapacityTons: number;
  currentStockTons: number;
  utilizationPercentage: number;
  totalBagsStored: number; // Standard 64kg export jute bags
  operationalStatus: WarehouseOperationalStatus;
  adminControlledStatus: WarehouseAdminStatus;
  statusReason?: string;
  acceptedCertificates: string[];
  members: WarehouseMember[];
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Input for registering a new warehouse facility
 */
export interface WarehouseRegistrationInput {
  id?: string;
  name: string;
  registrationNumber: string;
  ownerUserId: string;
  facilityType: WarehouseFacilityType;
  contactEmail: string;
  contactPhone: string;
  location: WarehouseLocationInfo;
  maxCapacityKg: number;
  acceptedCertificates?: string[];
  initialStockKg?: number;
}

/**
 * Append-Only Receipt Ledger Record
 */
export interface WarehouseReceiptRecord {
  id: string; // e.g. 'rcpt_wh_...'
  receiptNumber: string; // e.g. 'RCPT-IKOM-2026-0041'
  warehouseId: string;
  warehouseName: string;
  sourceType: ReceiptSourceType;
  sourceReferenceId: string; // e.g. manifestId, intakeId
  sourceBatchCode: string;
  traceCertificateNumber: string;
  senderId: string; // Agent ID or Cooperative ID
  senderName: string;
  quantityKg: number;
  bagCount: number;
  qualityGrade: QualityGrade;
  moistureContentPercent: number;
  eudrCompliant: boolean;
  receivedByOfficerId: string;
  receivedByOfficerName: string;
  receivedAt: string;
  status: ReceiptStatus;
  notes?: string;
  idempotencyKey: string; // Unique hash preventing duplicate intake
  reversalOfReceiptId?: string; // If this record reverses an earlier receipt
  reversalReason?: string;
}

/**
 * Input for receiving cocoa delivery/manifest
 */
export interface WarehouseReceiveInput {
  warehouseId: string;
  officerUserId: string;
  officerName: string;
  sourceType: ReceiptSourceType;
  sourceReferenceId: string; // Manifest ID or Cooperative Batch ID
  notes?: string;
  overrideQualityGrade?: QualityGrade;
  measuredMoistureContentPercent?: number;
}

/**
 * Warehouse Request for Cross River State Full Trace Certificate
 */
export interface WarehouseFullTraceRequest {
  id: string; // e.g. 'req_fulltrace_...'
  requestNumber: string; // e.g. 'REQ-CRS-TRC-2026-0012'
  warehouseId: string;
  warehouseName: string;
  officerId: string;
  officerName: string;
  batchCode: string;
  receiptIds: string[];
  totalLotsCount: number;
  totalQuantityKg: number;
  originCorridor: string;
  destinationPortOrBuyer: string;
  feeConfigIdApplied?: string;
  feeCodeApplied?: string;
  feeAmountPaid?: number;
  status: "pending" | "approved" | "issued" | "rejected";
  certificateNumber?: string;
  verificationHash?: string;
  statusReason?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Export and Customs Service Request submitted by Warehouse
 */
export interface WarehouseExportCustomsRequest {
  id: string;
  requestNumber: string;
  warehouseId: string;
  warehouseName: string;
  officerId: string;
  manifestOrBatchCode: string;
  quantityKg: number;
  destinationPort: string;
  exportLicenseNumber: string;
  feeCodeApplied: string;
  feeAmount: number;
  paymentStatus: "pending" | "paid";
  status: "pending_clearance" | "cleared" | "inspection_required";
  customsReferenceNumber?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Dashboard Metrics Contract
 */
export interface WarehouseDashboardMetrics {
  maxCapacityKg: number;
  currentStockKg: number;
  availableCapacityKg: number;
  maxCapacityTons: number;
  currentStockTons: number;
  utilizationPercentage: number;
  totalBagsStored: number;
  totalReceiptsCount: number;
  totalReversalsCount: number;
  totalActiveStockTonnage: number;
  operationalStatus: WarehouseOperationalStatus;
  adminControlledStatus: WarehouseAdminStatus;
  activeCertificatesCount: number;
  pendingFullTraceRequestsCount: number;
}

/**
 * Warehouse Complete Dashboard Data Contract
 */
export interface WarehouseDashboardData {
  warehouse: WarehouseFacility;
  profile?: WarehouseProfile | null;
  metrics: WarehouseDashboardMetrics;
  recentReceipts: WarehouseReceiptRecord[];
  pendingFullTraceRequests: WarehouseFullTraceRequest[];
  recentCustomsRequests: WarehouseExportCustomsRequest[];
}
