import {
  CustomsServiceRequest,
  CustomsAgentProfile,
  CustomsAgency,
  CreateCustomsRequestInput,
  CustomsDashboardData,
  CustomsRequestStatus,
  CustomsStatutoryReferences,
} from "@/types/customs";
import { customsStore } from "./customsStore";
import { adminStore } from "@/lib/admin/adminStore";

export class CustomsService {
  /**
   * Scoped authorization: Asserts caller is an active Platform Customs Officer/Broker.
   */
  async assertCustomsOfficerAuthorized(actorUserId: string): Promise<CustomsAgentProfile> {
    if (!actorUserId || !actorUserId.trim()) {
      throw new Error("Authentication Required: Customs officer user ID must be provided.");
    }

    const cleanUid = actorUserId.trim();
    const profile = await customsStore.getProfile(cleanUid);
    if (!profile) {
      throw new Error(
        `Authorization Error: User "${cleanUid}" does not have an active Platform Customs Agent profile.`
      );
    }

    // Check administrative status override
    const entityStatus = await adminStore.getEntityStatus(profile.agencyId);
    if (entityStatus && entityStatus.status === "suspended") {
      throw new Error(
        `Administrative Action: Customs Brokerage Agency "${profile.agencyId}" is suspended by platform administration: ${entityStatus.reason || "Under review"}.`
      );
    }

    if (profile.status !== "active") {
      throw new Error("Authorization Error: Customs officer profile is suspended or inactive.");
    }

    return profile;
  }

  // Customs Agent Profile & Agency
  async registerOfficerProfile(input: {
    userId: string;
    fullName: string;
    email: string;
    phone: string;
    agencyId: string;
    agencyName: string;
    role: "chief_customs_broker" | "inspection_officer" | "documentation_clerk" | "compliance_auditor";
    licenseNumber: string;
    stationedPortOrBorder: string;
  }): Promise<CustomsAgentProfile> {
    const profile: CustomsAgentProfile = {
      id: `cag_usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      userId: input.userId,
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      agencyId: input.agencyId,
      agencyName: input.agencyName,
      role: input.role,
      licenseNumber: input.licenseNumber,
      stationedPortOrBorder: input.stationedPortOrBorder,
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return customsStore.saveProfile(profile);
  }

  async createAgency(input: {
    name: string;
    registrationNumber: string;
    customsLicenceCode: string;
    headquarters: string;
    contactEmail: string;
    contactPhone: string;
    operatingPortsAndBorders: string[];
  }): Promise<CustomsAgency> {
    const agency: CustomsAgency = {
      id: `org_customs_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: input.name,
      registrationNumber: input.registrationNumber,
      customsLicenceCode: input.customsLicenceCode,
      headquarters: input.headquarters,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      operatingPortsAndBorders: input.operatingPortsAndBorders,
      members: [],
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return customsStore.saveAgency(agency);
  }

  // Request Submission by eligible Nigerian Agent or Warehouse
  async submitExportCustomsRequest(
    input: CreateCustomsRequestInput,
    submitterUserId: string
  ): Promise<CustomsServiceRequest> {
    if (!input.submitterId || !input.submitterName) {
      throw new Error("Validation Error: Submitter ID and Name are required.");
    }
    if (input.submitterType !== "agent" && input.submitterType !== "warehouse") {
      throw new Error(
        `Eligibility Error: Only licensed Nigerian Agents or Warehouses may submit customs requests. Submitter type "${input.submitterType}" is invalid.`
      );
    }
    if (input.quantityKg <= 0) {
      throw new Error("Validation Error: Export quantity must be greater than 0 kg.");
    }

    // Dynamic fee calculation from Administrator store
    const feeConfig = await adminStore.getFeeConfig("FEE_CUSTOMS_CLEARANCE");
    const feeAmount = feeConfig ? feeConfig.amount : 45000;
    const feeCurrency = feeConfig ? feeConfig.currency : "NGN";

    const requestId = `req_cust_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const requestNumber = `CSR-2026-${Math.floor(10000 + Math.random() * 90000)}`;

    const references: CustomsStatutoryReferences = {
      exitPortOrBorderPost: input.exitPortOrBorderPost,
      destinationCountry: input.destinationCountry,
      eur1OrEudrCertificateNumber: input.eur1OrEudrCertificateNumber,
      nxpFormNumber: input.nxpFormNumber,
    };

    const request: CustomsServiceRequest = {
      id: requestId,
      requestNumber,
      serviceType: input.serviceType,
      submitterType: input.submitterType,
      submitterId: input.submitterId,
      submitterName: input.submitterName,
      submitterContactEmail: input.submitterContactEmail,
      submitterContactPhone: input.submitterContactPhone,
      manifestOrBatchCode: input.manifestOrBatchCode,
      quantityKg: input.quantityKg,
      totalBags: Math.ceil(input.quantityKg / 64),
      commodityDescription:
        input.commodityDescription || "Dried Fermented Cocoa Beans - Grade 1 EUDR Verified",
      originCorridor: input.originCorridor || "Cross River State / Cameroon Corridor",
      feeConfigIdApplied: feeConfig?.id || "fee_customs_export_clearance",
      feeCodeApplied: "FEE_CUSTOMS_CLEARANCE",
      feeAmount,
      currency: feeCurrency,
      paymentStatus: input.paymentReference ? "paid" : "pending",
      paymentReference: input.paymentReference,
      paymentTimestamp: input.paymentReference ? new Date().toISOString() : undefined,
      references,
      status: "submitted",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await customsStore.saveRequest(request);

    // Initial audit history entry
    await customsStore.appendProcessingHistory({
      id: `chist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      requestId: request.id,
      requestNumber: request.requestNumber,
      newStatus: "submitted",
      actionTaken: "REQUEST_SUBMITTED",
      officerId: submitterUserId,
      officerName: input.submitterName,
      comments: input.notes || "Export & customs declaration submitted by eligible actor",
      timestamp: new Date().toISOString(),
    });

    return request;
  }

  // Status Progression & Statutory References Update
  async updateProcessingStage(
    input: {
      requestId: string;
      newStatus: CustomsRequestStatus;
      statutoryReferencesUpdate?: Partial<CustomsStatutoryReferences>;
      comments?: string;
    },
    officerUserId: string
  ): Promise<CustomsServiceRequest> {
    const officer = await this.assertCustomsOfficerAuthorized(officerUserId);

    const existing = await customsStore.getRequest(input.requestId);
    if (!existing) {
      throw new Error(`Customs request not found for ID/Number: "${input.requestId}".`);
    }

    if (existing.status === "cleared") {
      throw new Error("Operational Invariant: Cannot alter a request that has already been cleared.");
    }

    const previousStatus = existing.status;
    const updatedReferences: CustomsStatutoryReferences = {
      ...existing.references,
      ...(input.statutoryReferencesUpdate || {}),
    };

    const updated = await customsStore.updateRequest(existing.id, {
      status: input.newStatus,
      assignedOfficerId: officer.id,
      assignedOfficerName: officer.fullName,
      assignedAgencyId: officer.agencyId,
      references: updatedReferences,
    });

    if (!updated) {
      throw new Error("Failed to update customs request.");
    }

    // Append-only history record
    await customsStore.appendProcessingHistory({
      id: `chist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      requestId: existing.id,
      requestNumber: existing.requestNumber,
      previousStatus,
      newStatus: input.newStatus,
      actionTaken: `STAGE_UPDATED_TO_${input.newStatus.toUpperCase()}`,
      officerId: officer.id,
      officerName: officer.fullName,
      comments: input.comments,
      timestamp: new Date().toISOString(),
    });

    return updated;
  }

  // Record Applicable Fee Payment
  async recordFeePayment(
    requestId: string,
    paymentReference: string,
    officerUserId: string
  ): Promise<CustomsServiceRequest> {
    const officer = await this.assertCustomsOfficerAuthorized(officerUserId);

    const existing = await customsStore.getRequest(requestId);
    if (!existing) {
      throw new Error(`Customs request not found for: "${requestId}".`);
    }

    const updated = await customsStore.updateRequest(existing.id, {
      paymentStatus: "paid",
      paymentReference,
      paymentTimestamp: new Date().toISOString(),
    });

    if (!updated) {
      throw new Error("Failed to record customs payment.");
    }

    await customsStore.appendProcessingHistory({
      id: `chist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      requestId: existing.id,
      requestNumber: existing.requestNumber,
      newStatus: existing.status,
      actionTaken: "FEE_PAYMENT_CONFIRMED",
      officerId: officer.id,
      officerName: officer.fullName,
      comments: `Payment confirmed with reference: ${paymentReference}`,
      timestamp: new Date().toISOString(),
    });

    return updated;
  }

  // Mark Request as Cleared
  async markRequestCleared(
    input: {
      requestId: string;
      singleGoodsDeclarationNumber: string;
      cleanCertificateOfInspectionNumber?: string;
      billOfLadingOrConsignmentNote?: string;
      clearanceNotes?: string;
    },
    officerUserId: string
  ): Promise<CustomsServiceRequest> {
    const officer = await this.assertCustomsOfficerAuthorized(officerUserId);

    const existing = await customsStore.getRequest(input.requestId);
    if (!existing) {
      throw new Error(`Customs request not found for: "${input.requestId}".`);
    }

    if (existing.status === "cleared") {
      return existing; // idempotent
    }

    if (existing.paymentStatus !== "paid" && existing.paymentStatus !== "waived") {
      throw new Error("Clearance Precondition Error: Customs clearance fee must be paid before clearance release can be issued.");
    }

    const releaseReference = `NCS-CR-REL-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;

    const updatedReferences: CustomsStatutoryReferences = {
      ...existing.references,
      singleGoodsDeclarationNumber: input.singleGoodsDeclarationNumber,
      cleanCertificateOfInspectionNumber:
        input.cleanCertificateOfInspectionNumber || existing.references.cleanCertificateOfInspectionNumber,
      billOfLadingOrConsignmentNote:
        input.billOfLadingOrConsignmentNote || existing.references.billOfLadingOrConsignmentNote,
    };

    const updated = await customsStore.updateRequest(existing.id, {
      status: "cleared",
      references: updatedReferences,
      customsReleaseReference: releaseReference,
      clearedAt: new Date().toISOString(),
      clearedByOfficerId: officer.id,
      clearedByOfficerName: officer.fullName,
    });

    if (!updated) {
      throw new Error("Failed to clear customs request.");
    }

    await customsStore.appendProcessingHistory({
      id: `chist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      requestId: existing.id,
      requestNumber: existing.requestNumber,
      previousStatus: existing.status,
      newStatus: "cleared",
      actionTaken: "CUSTOMS_CLEARED_RELEASE_ISSUED",
      officerId: officer.id,
      officerName: officer.fullName,
      comments: `Official NCS Customs Release Issued: ${releaseReference}. ${input.clearanceNotes || ""}`.trim(),
      timestamp: new Date().toISOString(),
    });

    return updated;
  }

  // Raise Query or Reject
  async raiseQueryOrReject(
    input: {
      requestId: string;
      action: "query" | "reject";
      reason: string;
    },
    officerUserId: string
  ): Promise<CustomsServiceRequest> {
    const officer = await this.assertCustomsOfficerAuthorized(officerUserId);

    const existing = await customsStore.getRequest(input.requestId);
    if (!existing) {
      throw new Error(`Customs request not found for: "${input.requestId}".`);
    }

    const newStatus: CustomsRequestStatus = input.action === "query" ? "query_raised" : "rejected";

    const updated = await customsStore.updateRequest(existing.id, {
      status: newStatus,
      queryNotes: input.action === "query" ? input.reason : undefined,
      rejectionReason: input.action === "reject" ? input.reason : undefined,
    });

    if (!updated) {
      throw new Error("Failed to update customs query status.");
    }

    await customsStore.appendProcessingHistory({
      id: `chist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      requestId: existing.id,
      requestNumber: existing.requestNumber,
      previousStatus: existing.status,
      newStatus,
      actionTaken: input.action === "query" ? "QUERY_RAISED" : "REQUEST_REJECTED",
      officerId: officer.id,
      officerName: officer.fullName,
      comments: input.reason,
      timestamp: new Date().toISOString(),
    });

    return updated;
  }

  // Dashboard Aggregates
  async getDashboardData(officerUserId: string): Promise<CustomsDashboardData> {
    const officer = await this.assertCustomsOfficerAuthorized(officerUserId);
    const agency = await customsStore.getAgency(officer.agencyId);
    const allRequests = await customsStore.listRequests();

    const pendingReviewCount = allRequests.filter(
      (r) => r.status === "submitted" || r.status === "under_review"
    ).length;
    const inspectionsActiveCount = allRequests.filter(
      (r) =>
        r.status === "inspection_scheduled" ||
        r.status === "inspection_completed" ||
        r.status === "duty_assessed"
    ).length;
    const clearedList = allRequests.filter((r) => r.status === "cleared");
    const queriedCount = allRequests.filter((r) => r.status === "query_raised").length;

    const totalClearedTonnageKg = clearedList.reduce((sum, r) => sum + r.quantityKg, 0);
    const totalFeesRecordedNgn = allRequests.reduce((sum, r) => sum + r.feeAmount, 0);

    return {
      agentProfile: officer,
      agency,
      metrics: {
        totalRequests: allRequests.length,
        pendingReviewCount,
        inspectionsActiveCount,
        clearedCount: clearedList.length,
        queriedCount,
        totalClearedTonnageKg,
        totalFeesRecordedNgn,
        averageProcessingHours: 24,
      },
      recentRequests: allRequests.slice(0, 10),
      pendingActions: allRequests.filter((r) => r.status !== "cleared" && r.status !== "rejected").slice(0, 5),
      recentClearances: clearedList.slice(0, 5),
    };
  }
}

export const customsService = new CustomsService();
