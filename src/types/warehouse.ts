export type WarehouseOperationalStatus =
  | "operational"
  | "at_capacity"
  | "maintenance"
  | "closed";

export type WarehouseSourceType = "agent" | "cooperative" | "farmer";

export interface WarehouseLocation {
  address: string;
  cityOrLGA: string; // e.g. 'Calabar South' or 'Ikom'
  stateOrRegion: string; // e.g. 'Cross River State'
  country: "Nigeria" | "Cameroon";
  latitude: number;
  longitude: number;
  operatingHours: string; // e.g. '07:00 - 18:00 WAT'
}

export interface WarehouseFacility {
  id: string; // e.g. 'wh_facility_...'
  organizationId: string;
  name: string;
  licenseNumber: string; // e.g. 'NCS-WH-CAL-2026-01'
  location: WarehouseLocation;
  // Capacity: Defined in both kg and standard 64kg export jute bags
  capacityKg: number;
  capacityBags: number; // Derived as capacityKg / 64
  currentStockKg: number;
  currentStockBags: number; // Derived as currentStockKg / 64
  availableCapacityKg: number; // capacityKg - currentStockKg
  // Operational status managed by warehouse manager
  operationalStatus: WarehouseOperationalStatus;
  // Administrative status strictly managed by platform admin (cannot be overridden by warehouse)
  adminStatus: "active" | "suspended";
  managerUserId: string; // Firebase Auth UID
  contactEmail: string;
  contactPhone: string;
  createdAt: string;
  updatedAt: string;
}

export interface WarehouseOrganization {
  id: string; // e.g. 'org_wh_...'
  name: string;
  registrationNumber: string; // Corporate CAC
  customsBondedWarehouseCode?: string; // If customs bonded export terminal
  headquartersAddress: string;
  contactEmail: string;
  contactPhone: string;
  facilities: string[]; // facility IDs
  status: "active" | "suspended";
  createdAt: string;
  updatedAt: string;
}

export interface WarehouseReceiptRecord {
  id: string;
  facilityId: string;
  consignmentCode: string; // e.g. 'CONSIGN-CAL-2026-0912'
  sourceType: WarehouseSourceType;
  sourceEntityId: string; // agentId, coopId, or farmerId
  sourceEntityName: string;
  quantityKg: number;
  totalBags: number;
  cocoaLotId?: string;
  certificateHoldingId?: string;
  qualityInspectionGrade: "Grade 1" | "Grade 2" | "Industrial";
  moistureContentPercent?: number; // e.g. 7.2% (standard <= 7.5%)
  receivedByUserId: string;
  receivedByName: string;
  receivedAt: string;
  notes?: string;
}

export interface CrossRiverStateTraceCertificateRequest {
  id: string; // e.g. 'crs_req_...'
  facilityId: string;
  requestNumber: string; // e.g. 'CRS-FTC-2026-0038'
  consignmentCode: string;
  totalQuantityKg: number;
  sourceOriginSummary: string; // e.g. 'Cameroon Mamfe Corridor via Ikom'
  applicantName: string;
  applicantContactEmail: string;
  applicantContactPhone: string;
  inspectionFeeNgn: number;
  paymentStatus: "pending" | "paid" | "waived";
  status: "pending_inspection" | "under_audit" | "approved" | "rejected";
  issuedCertificateReference?: string;
  submittedAt: string;
  reviewedAt?: string;
  reviewNotes?: string;
}

export interface WarehouseMetrics {
  totalCapacityKg: number;
  currentStockKg: number;
  utilizationPercentage: number;
  totalConsignmentsReceived: number;
  totalTonnageReceivedKg: number;
  pendingCrsRequestsCount: number;
}

export interface WarehouseDashboardData {
  facility?: WarehouseFacility | null;
  organization?: WarehouseOrganization | null;
  metrics: WarehouseMetrics;
  recentReceipts: WarehouseReceiptRecord[];
  crsRequests: CrossRiverStateTraceCertificateRequest[];
}
