import {
  WarehouseFacility,
  WarehouseOrganization,
  WarehouseReceiptRecord,
  CrossRiverStateTraceCertificateRequest,
  WarehouseDashboardData,
  WarehouseOperationalStatus,
  WarehouseSourceType,
} from "@/types/warehouse";
import { warehouseStore } from "./warehouseStore";
import { adminStore } from "@/lib/admin/adminStore";

export class WarehouseService {
  /**
   * Scoped authorization: Asserts caller is an authorized manager of this warehouse
   * and that the facility is not suspended by platform admin.
   */
  async assertWarehouseAuthorized(
    actorUserId: string,
    facilityId?: string
  ): Promise<WarehouseFacility> {
    if (!actorUserId || !actorUserId.trim()) {
      throw new Error("Authentication Required: Actor user ID must be provided.");
    }

    const cleanUid = actorUserId.trim();
    const facility = await warehouseStore.getFacility(cleanUid);
    if (!facility) {
      throw new Error(
        `Authorization Error: User "${cleanUid}" is not an authorized manager of any registered warehouse.`
      );
    }

    if (facilityId && facility.id !== facilityId) {
      throw new Error(
        `Scoped Authorization Error: Warehouse "${facility.id}" cannot access data of warehouse "${facilityId}".`
      );
    }

    // Check platform admin status override
    const entityStatus = await adminStore.getEntityStatus(facility.id);
    if (entityStatus && entityStatus.status === "suspended") {
      throw new Error(
        `Administrative Action: Warehouse "${facility.id}" is suspended by platform administration: ${entityStatus.reason || "Under review"}.`
      );
    }

    if (facility.adminStatus === "suspended") {
      throw new Error("Administrative Action: Warehouse facility is suspended by platform administration.");
    }

    return facility;
  }

  // Facility Registration & Management
  async registerFacility(input: {
    organizationId: string;
    name: string;
    licenseNumber: string;
    location: {
      address: string;
      cityOrLGA: string;
      stateOrRegion: string;
      country: "Nigeria" | "Cameroon";
      latitude: number;
      longitude: number;
      operatingHours: string;
    };
    capacityKg: number;
    managerUserId: string;
    contactEmail: string;
    contactPhone: string;
  }): Promise<WarehouseFacility> {
    // Validate coordinates
    if (input.location.latitude < -90 || input.location.latitude > 90) {
      throw new Error("Validation Error: Latitude must be between -90 and 90.");
    }
    if (input.location.longitude < -180 || input.location.longitude > 180) {
      throw new Error("Validation Error: Longitude must be between -180 and 180.");
    }
    if (input.capacityKg <= 0) {
      throw new Error("Validation Error: Warehouse capacity must be greater than 0 kg.");
    }

    const facilityId = `wh_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const facility: WarehouseFacility = {
      id: facilityId,
      organizationId: input.organizationId,
      name: input.name,
      licenseNumber: input.licenseNumber,
      location: input.location,
      capacityKg: input.capacityKg,
      capacityBags: Math.floor(input.capacityKg / 64),
      currentStockKg: 0,
      currentStockBags: 0,
      availableCapacityKg: input.capacityKg,
      operationalStatus: "operational",
      adminStatus: "active",
      managerUserId: input.managerUserId,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return warehouseStore.saveFacility(facility);
  }

  async createOrganization(input: {
    name: string;
    registrationNumber: string;
    customsBondedWarehouseCode?: string;
    headquartersAddress: string;
    contactEmail: string;
    contactPhone: string;
  }): Promise<WarehouseOrganization> {
    const org: WarehouseOrganization = {
      id: `org_wh_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: input.name,
      registrationNumber: input.registrationNumber,
      customsBondedWarehouseCode: input.customsBondedWarehouseCode,
      headquartersAddress: input.headquartersAddress,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      facilities: [],
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return warehouseStore.saveOrganization(org);
  }

  // Atomic Capacity & Operational Status
  async updateOperationalStatus(
    facilityId: string,
    status: WarehouseOperationalStatus,
    actorUserId: string
  ): Promise<WarehouseFacility> {
    const facility = await this.assertWarehouseAuthorized(actorUserId, facilityId);

    // Cannot override administrative suspension
    if (facility.adminStatus === "suspended") {
      throw new Error("Administrative Action: Cannot alter status while warehouse is suspended by platform administration.");
    }

    const updated = await warehouseStore.updateFacility(facility.id, {
      operationalStatus: status,
    });
    if (!updated) {
      throw new Error("Failed to update warehouse operational status.");
    }
    return updated;
  }

  // Receiving Cocoa / Certificates (Enforces Capacity Atomically)
  async receiveConsignment(
    input: {
      facilityId: string;
      consignmentCode: string;
      sourceType: WarehouseSourceType;
      sourceEntityId: string;
      sourceEntityName: string;
      quantityKg: number;
      cocoaLotId?: string;
      certificateHoldingId?: string;
      qualityInspectionGrade: "Grade 1" | "Grade 2" | "Industrial";
      moistureContentPercent?: number;
      receivedByName: string;
      notes?: string;
    },
    actorUserId: string
  ): Promise<{ receipt: WarehouseReceiptRecord; updatedFacility: WarehouseFacility }> {
    const facility = await this.assertWarehouseAuthorized(actorUserId, input.facilityId);

    if (facility.operationalStatus === "closed" || facility.operationalStatus === "maintenance") {
      throw new Error(
        `Operational Error: Warehouse is currently "${facility.operationalStatus}" and cannot accept consignments.`
      );
    }

    if (input.quantityKg <= 0) {
      throw new Error("Validation Error: Consignment quantity must be greater than 0 kg.");
    }

    // Atomic Capacity Verification: Cannot exceed available capacity
    if (input.quantityKg > facility.availableCapacityKg) {
      throw new Error(
        `Capacity Error: Consignment of ${input.quantityKg.toLocaleString()} kg exceeds available capacity of ${facility.availableCapacityKg.toLocaleString()} kg.`
      );
    }

    const newStockKg = facility.currentStockKg + input.quantityKg;
    const newAvailableKg = facility.capacityKg - newStockKg;
    const newStatus: WarehouseOperationalStatus =
      newAvailableKg <= 0 ? "at_capacity" : facility.operationalStatus;

    // Update facility stock
    const updatedFacility = await warehouseStore.updateFacility(facility.id, {
      currentStockKg: newStockKg,
      currentStockBags: Math.floor(newStockKg / 64),
      availableCapacityKg: newAvailableKg,
      operationalStatus: newStatus,
    });

    if (!updatedFacility) {
      throw new Error("Failed to update warehouse capacity during receipt.");
    }

    // Append receipt record
    const receipt: WarehouseReceiptRecord = {
      id: `rcpt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      facilityId: facility.id,
      consignmentCode: input.consignmentCode,
      sourceType: input.sourceType,
      sourceEntityId: input.sourceEntityId,
      sourceEntityName: input.sourceEntityName,
      quantityKg: input.quantityKg,
      totalBags: Math.ceil(input.quantityKg / 64),
      cocoaLotId: input.cocoaLotId,
      certificateHoldingId: input.certificateHoldingId,
      qualityInspectionGrade: input.qualityInspectionGrade,
      moistureContentPercent: input.moistureContentPercent,
      receivedByUserId: actorUserId,
      receivedByName: input.receivedByName,
      receivedAt: new Date().toISOString(),
      notes: input.notes,
    };

    await warehouseStore.appendReceipt(receipt);

    return { receipt, updatedFacility };
  }

  // Cross River State Full Trace Certificate Request Workflow
  async requestCrossRiverStateTraceCertificate(
    input: {
      facilityId: string;
      consignmentCode: string;
      totalQuantityKg: number;
      sourceOriginSummary: string;
      applicantName: string;
      applicantContactEmail: string;
      applicantContactPhone: string;
    },
    actorUserId: string
  ): Promise<CrossRiverStateTraceCertificateRequest> {
    const facility = await this.assertWarehouseAuthorized(actorUserId, input.facilityId);

    // Read dynamic fee from adminStore
    const feeConfig = await adminStore.getFeeConfig("FEE_CRS_FULL_TRACE");
    const inspectionFeeNgn = feeConfig ? feeConfig.amount : 25000;

    const requestNumber = `CRS-FTC-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const request: CrossRiverStateTraceCertificateRequest = {
      id: `crs_req_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      facilityId: facility.id,
      requestNumber,
      consignmentCode: input.consignmentCode,
      totalQuantityKg: input.totalQuantityKg,
      sourceOriginSummary: input.sourceOriginSummary,
      applicantName: input.applicantName,
      applicantContactEmail: input.applicantContactEmail,
      applicantContactPhone: input.applicantContactPhone,
      inspectionFeeNgn,
      paymentStatus: "pending",
      status: "pending_inspection",
      submittedAt: new Date().toISOString(),
    };

    return warehouseStore.saveCrsRequest(request);
  }

  // Dashboard Aggregates
  async getDashboardData(facilityIdOrManagerUid: string, actorUserId: string): Promise<WarehouseDashboardData> {
    const facility = await this.assertWarehouseAuthorized(actorUserId, facilityIdOrManagerUid);
    const organization = await warehouseStore.getOrganization(facility.organizationId);
    const receipts = await warehouseStore.listReceipts(facility.id);
    const crsRequests = await warehouseStore.listCrsRequests(facility.id);

    const totalTonnageReceivedKg = receipts.reduce((sum, r) => sum + r.quantityKg, 0);
    const utilizationPercentage = Math.round((facility.currentStockKg / facility.capacityKg) * 100);

    return {
      facility,
      organization,
      metrics: {
        totalCapacityKg: facility.capacityKg,
        currentStockKg: facility.currentStockKg,
        utilizationPercentage,
        totalConsignmentsReceived: receipts.length,
        totalTonnageReceivedKg,
        pendingCrsRequestsCount: crsRequests.filter((r) => r.status === "pending_inspection").length,
      },
      recentReceipts: receipts.slice(0, 10),
      crsRequests,
    };
  }
}

export const warehouseService = new WarehouseService();
