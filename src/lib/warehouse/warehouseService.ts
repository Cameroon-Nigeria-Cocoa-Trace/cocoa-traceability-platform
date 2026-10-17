import {
  WarehouseFacility,
  WarehouseRegistrationInput,
  WarehouseLocationInfo,
  WarehouseOperationalStatus,
  WarehouseActorContext,
  WarehouseReceiptRecord,
  WarehouseReceiveInput,
  WarehouseFullTraceRequest,
  WarehouseExportCustomsRequest,
  WarehouseDashboardData,
  WarehouseDashboardMetrics,
  QualityGrade,
} from "@/types/warehouse";
import { warehouseStore } from "./warehouseStore";
import { adminStore } from "@/lib/admin/adminStore";
import { agentService } from "@/lib/agent/agentService";
import { cooperativeService } from "@/lib/cooperative/cooperativeService";

export class WarehouseService {
  // ==========================================
  // 1. SCOPED AUTHORIZATION & ACCESS CONTROL
  // ==========================================

  /**
   * Enforces scoped authorization: a warehouse may only read or modify
   * its own profile, stock, receipts and requests.
   * Warehouse A must never be able to access Warehouse B's data.
   */
  assertWarehouseAccess(
    callerContext: WarehouseActorContext,
    targetWarehouseId: string
  ): void {
    if (!callerContext) {
      throw new Error("UNAUTHORIZED: Missing actor context");
    }
    if (callerContext.isSuperAdmin) {
      return; // Platform superadmin can access any warehouse for audit/oversight
    }
    if (callerContext.warehouseId !== targetWarehouseId) {
      throw new Error(
        `UNAUTHORIZED_ACCESS: Scoped authorization failure. Warehouse '${callerContext.warehouseId}' is not authorized to access or modify data for Warehouse '${targetWarehouseId}'.`
      );
    }
  }

  /**
   * Enforces that administrator-controlled platform status (e.g. suspension)
   * is strictly respected and cannot be bypassed or overridden by warehouse operators.
   */
  async assertWarehouseNotSuspended(warehouseId: string): Promise<WarehouseFacility> {
    const facility = await warehouseStore.getFacility(warehouseId);
    if (!facility) {
      throw new Error(`Warehouse facility not found: ${warehouseId}`);
    }

    // Check direct facility adminControlledStatus
    if (
      facility.adminControlledStatus === "suspended" ||
      facility.adminControlledStatus === "deactivated"
    ) {
      throw new Error(
        `WAREHOUSE_ADMIN_SUSPENDED: Warehouse facility '${facility.name}' (${facility.id}) has been administratively suspended or deactivated. Operational actions are locked.`
      );
    }

    // Check with Administrator module for user or organization level suspension
    const adminUser = await adminStore.getUser(facility.ownerUserId);
    if (adminUser && adminUser.status === "suspended") {
      throw new Error(
        `WAREHOUSE_ADMIN_SUSPENDED: The administrative account associated with Warehouse '${facility.id}' has been suspended by platform administration.`
      );
    }

    const adminOrg = await adminStore.getOrganization(facility.id);
    if (adminOrg && adminOrg.status === "suspended") {
      throw new Error(
        `WAREHOUSE_ADMIN_SUSPENDED: Warehouse organization '${facility.id}' is under active administrative suspension.`
      );
    }

    return facility;
  }

  // ==========================================
  // 2. REGISTRATION & MANAGEMENT
  // ==========================================

  async registerWarehouse(
    input: WarehouseRegistrationInput,
    callerUserId: string
  ): Promise<WarehouseFacility> {
    if (!input.name || !input.registrationNumber) {
      throw new Error("Missing required warehouse identification (name, registrationNumber)");
    }
    if (!input.facilityType) {
      throw new Error("Missing required field: facilityType");
    }
    if (!input.contactEmail || !input.contactPhone) {
      throw new Error("Missing required contact details (contactEmail, contactPhone)");
    }
    if (!input.location || !input.location.address || !input.location.city) {
      throw new Error("Missing required location information (address, city)");
    }

    // Validate coordinates without touching geofencing code
    const coords = input.location.coordinates;
    if (
      !coords ||
      typeof coords.lat !== "number" ||
      typeof coords.lng !== "number" ||
      coords.lat < -90 ||
      coords.lat > 90 ||
      coords.lng < -180 ||
      coords.lng > 180
    ) {
      throw new Error(
        "INVALID_COORDINATES: Warehouse latitude must be between -90 and 90, and longitude between -180 and 180."
      );
    }

    if (!input.maxCapacityKg || input.maxCapacityKg <= 0) {
      throw new Error("Warehouse maxCapacityKg must be greater than zero.");
    }

    const warehouseId =
      input.id ||
      `wh_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    // Check if facility already exists
    const existing = await warehouseStore.getFacility(warehouseId);
    if (existing) {
      throw new Error(`Warehouse facility '${warehouseId}' is already registered.`);
    }

    const initialStockKg = input.initialStockKg || 0;
    if (initialStockKg > input.maxCapacityKg) {
      throw new Error("Initial stock cannot exceed maximum warehouse capacity.");
    }

    const availableCapacityKg = input.maxCapacityKg - initialStockKg;
    const maxCapacityTons = Math.round((input.maxCapacityKg / 1000) * 100) / 100;
    const currentStockTons = Math.round((initialStockKg / 1000) * 100) / 100;
    const utilizationPercentage =
      Math.round((initialStockKg / input.maxCapacityKg) * 10000) / 100;
    const totalBagsStored = Math.ceil(initialStockKg / 64);
    const now = new Date().toISOString();

    const founderMember = {
      id: `mem_wh_${Date.now()}_1`,
      userId: callerUserId || input.ownerUserId,
      name: input.name + " Lead Operator",
      email: input.contactEmail,
      phone: input.contactPhone,
      role: "warehouse_manager" as const,
      status: "active" as const,
      joinedAt: now,
    };

    const facility: WarehouseFacility = {
      id: warehouseId,
      name: input.name.trim(),
      registrationNumber: input.registrationNumber.trim(),
      ownerUserId: callerUserId || input.ownerUserId,
      facilityType: input.facilityType,
      contactEmail: input.contactEmail.trim().toLowerCase(),
      contactPhone: input.contactPhone.trim(),
      location: {
        address: input.location.address.trim(),
        city: input.location.city.trim(),
        lga: input.location.lga?.trim() || "Ikom",
        state: input.location.state?.trim() || "Cross River State",
        country: input.location.country?.trim() || "Nigeria",
        coordinates: {
          lat: coords.lat,
          lng: coords.lng,
        },
        operatingHours: input.location.operatingHours || "07:00 - 18:00 WAT",
        customsZone: input.location.customsZone,
      },
      maxCapacityKg: input.maxCapacityKg,
      currentStockKg: initialStockKg,
      availableCapacityKg,
      maxCapacityTons,
      currentStockTons,
      utilizationPercentage,
      totalBagsStored,
      operationalStatus: "operational",
      adminControlledStatus: "active",
      acceptedCertificates: input.acceptedCertificates || [
        "EUDR Origine Cameroun",
        "Cross River Trace",
        "Federal Nigerian Customs Export",
      ],
      members: [founderMember],
      memberCount: 1,
      createdAt: now,
      updatedAt: now,
    };

    return await warehouseStore.saveFacility(facility);
  }

  async getFacility(
    callerContext: WarehouseActorContext,
    warehouseId: string
  ): Promise<WarehouseFacility | null> {
    this.assertWarehouseAccess(callerContext, warehouseId);
    return await warehouseStore.getFacility(warehouseId);
  }

  // ==========================================
  // 3. LOCATION & OPERATIONAL INFORMATION
  // ==========================================

  async updateLocationAndOperations(
    callerContext: WarehouseActorContext,
    warehouseId: string,
    data: {
      location?: Partial<WarehouseLocationInfo>;
      operationalStatus?: WarehouseOperationalStatus;
      statusReason?: string;
      operatingHours?: string;
    }
  ): Promise<WarehouseFacility> {
    this.assertWarehouseAccess(callerContext, warehouseId);
    const facility = await this.assertWarehouseNotSuspended(warehouseId);

    const updates: Partial<WarehouseFacility> = {};

    if (data.location) {
      if (data.location.coordinates) {
        const { lat, lng } = data.location.coordinates;
        if (
          typeof lat !== "number" ||
          typeof lng !== "number" ||
          lat < -90 ||
          lat > 90 ||
          lng < -180 ||
          lng > 180
        ) {
          throw new Error("INVALID_COORDINATES: Coordinates out of valid latitude/longitude bounds.");
        }
      }
      updates.location = {
        ...facility.location,
        ...data.location,
      };
    }

    if (data.operatingHours && updates.location) {
      updates.location.operatingHours = data.operatingHours;
    }

    if (data.operationalStatus) {
      const allowed: WarehouseOperationalStatus[] = [
        "operational",
        "at_capacity",
        "maintenance",
        "closed",
      ];
      if (!allowed.includes(data.operationalStatus)) {
        throw new Error(
          `INVALID_STATUS: Allowed operational statuses are ${allowed.join(", ")}`
        );
      }
      updates.operationalStatus = data.operationalStatus;
    }

    if (data.statusReason !== undefined) {
      updates.statusReason = data.statusReason;
    }

    const updated = await warehouseStore.updateFacility(warehouseId, updates);
    return updated!;
  }

  // ==========================================
  // 4. CAPACITY & STATUS MANAGEMENT
  // ==========================================

  async updateCapacity(
    callerContext: WarehouseActorContext,
    warehouseId: string,
    newMaxCapacityKg: number
  ): Promise<WarehouseFacility> {
    this.assertWarehouseAccess(callerContext, warehouseId);
    const facility = await this.assertWarehouseNotSuspended(warehouseId);

    if (newMaxCapacityKg <= 0) {
      throw new Error("Max capacity must be greater than zero.");
    }

    if (newMaxCapacityKg < facility.currentStockKg) {
      throw new Error(
        `CAPACITY_TOO_SMALL: New capacity (${newMaxCapacityKg} kg) cannot be smaller than current stock (${facility.currentStockKg} kg).`
      );
    }

    const availableCapacityKg = newMaxCapacityKg - facility.currentStockKg;
    const maxCapacityTons = Math.round((newMaxCapacityKg / 1000) * 100) / 100;
    const utilizationPercentage =
      Math.round((facility.currentStockKg / newMaxCapacityKg) * 10000) / 100;

    let operationalStatus = facility.operationalStatus;
    if (facility.currentStockKg >= newMaxCapacityKg) {
      operationalStatus = "at_capacity";
    } else if (operationalStatus === "at_capacity" && facility.currentStockKg < newMaxCapacityKg) {
      operationalStatus = "operational";
    }

    const updated = await warehouseStore.updateFacility(warehouseId, {
      maxCapacityKg: newMaxCapacityKg,
      availableCapacityKg,
      maxCapacityTons,
      utilizationPercentage,
      operationalStatus,
    });

    return updated!;
  }

  // ==========================================
  // 5. RECEIVING COCOA & CERTIFICATES (IDEMPOTENT & LEDGER)
  // ==========================================

  async receiveCocoaDelivery(
    callerContext: WarehouseActorContext,
    input: WarehouseReceiveInput
  ): Promise<{ receipt: WarehouseReceiptRecord; updatedFacility: WarehouseFacility }> {
    this.assertWarehouseAccess(callerContext, input.warehouseId);
    const facility = await this.assertWarehouseNotSuspended(input.warehouseId);

    if (facility.operationalStatus === "closed" || facility.operationalStatus === "maintenance") {
      throw new Error(
        `WAREHOUSE_UNAVAILABLE: Warehouse '${facility.name}' is currently ${facility.operationalStatus}. Cannot accept new delivery.`
      );
    }

    // 1. Idempotency Check: Same lot or manifest cannot be received twice
    const idempotencyKey = `${input.warehouseId}_${input.sourceType}_${input.sourceReferenceId}`;
    const existingReceipt = await warehouseStore.getReceiptByIdempotencyKey(idempotencyKey);
    if (existingReceipt) {
      throw new Error(
        `DUPLICATE_RECEIPT_ERROR: The delivery with reference '${input.sourceReferenceId}' has already been received into Warehouse '${input.warehouseId}' (Receipt Number: ${existingReceipt.receiptNumber}). Duplicate receiving is rejected.`
      );
    }

    // 2. Validate Item via Existing Services / Interfaces
    let quantityKg = 0;
    let senderId = "";
    let senderName = "";
    let sourceBatchCode = "";
    let traceCertificateNumber = "";
    let qualityGrade: QualityGrade = input.overrideQualityGrade || "Grade 1";
    let moistureContentPercent = input.measuredMoistureContentPercent || 7.4;
    let eudrCompliant = true;

    if (input.sourceType === "agent_manifest") {
      // Consume through Agent service
      const manifest = await agentService.getManifest(input.sourceReferenceId);
      if (!manifest) {
        throw new Error(
          `AGENT_MANIFEST_NOT_FOUND: Agent manifest with ID '${input.sourceReferenceId}' was not found in agent records.`
        );
      }

      // Validate Destination
      if (manifest.warehouseId && manifest.warehouseId !== input.warehouseId) {
        throw new Error(
          `DESTINATION_MISMATCH: Manifest '${manifest.manifestNumber}' is designated for warehouse '${manifest.warehouseId}', not '${input.warehouseId}'. Intake rejected.`
        );
      }

      if (manifest.status === "accepted_by_warehouse") {
        throw new Error(
          `MANIFEST_ALREADY_ACCEPTED: Manifest '${manifest.manifestNumber}' was already marked as accepted.`
        );
      }

      quantityKg = manifest.totalQuantityKg;
      senderId = manifest.agentId;
      senderName = manifest.agentName;
      sourceBatchCode = manifest.manifestNumber;
      traceCertificateNumber = manifest.traceCertificateNumber || "CERT-PENDING";

      // Update downstream manifest status via existing agentService
      await agentService.updateManifestStatus(
        manifest.id,
        manifest.agentId,
        "accepted_by_warehouse",
        input.notes || "Received and stored in warehouse bay",
        input.officerName
      );
    } else if (input.sourceType === "cooperative_intake") {
      // Validate through cooperative service
      const intakes = await cooperativeService.listIntakes("org_coop_sowescop");
      const intake = intakes.find((i) => i.id === input.sourceReferenceId);
      if (intake) {
        quantityKg = intake.quantityKg;
        senderId = intake.cooperativeId;
        senderName = intake.cooperativeName;
        sourceBatchCode = intake.intakeBatchNumber;
        traceCertificateNumber = intake.farmAuditCertificateNumber || "CERT-COOP-EUDR";
        qualityGrade = intake.qualityGrade || qualityGrade;
        moistureContentPercent = intake.moistureContentPercent || moistureContentPercent;
        eudrCompliant = intake.eudrCompliant;

        // Dispatch status update in cooperative service
        await cooperativeService.dispatchIntakeBatch(
          intake.id,
          "warehouse",
          `WH-RECV-${input.warehouseId}`
        );
      } else {
        throw new Error(
          `COOPERATIVE_INTAKE_NOT_FOUND: Intake record '${input.sourceReferenceId}' not found.`
        );
      }
    } else if (input.sourceType === "direct_lot") {
      quantityKg = 3000;
      senderId = "seller_direct";
      senderName = "Direct Traceable Producer";
      sourceBatchCode = input.sourceReferenceId;
      traceCertificateNumber = "CERT-DIRECT-2026";
    }

    if (quantityKg <= 0) {
      throw new Error("Received quantity must be greater than zero kg.");
    }

    // 3. Atomic Capacity Verification & Stock Mutation
    // If quantity exceeds available capacity, this throws RECEIPT_EXCEEDS_CAPACITY and mutates nothing
    const updatedFacility = await warehouseStore.mutateStockAtomic(
      input.warehouseId,
      quantityKg,
      true
    );

    // 4. Append-Only Receipt Ledger Entry
    const receiptId = `rcpt_wh_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const receiptNumber = `RCPT-${input.warehouseId.replace("wh_", "").toUpperCase().slice(0, 4)}-2026-${Date.now().toString().slice(-4)}`;
    const now = new Date().toISOString();
    const bagCount = Math.ceil(quantityKg / 64);

    const receiptRecord: WarehouseReceiptRecord = {
      id: receiptId,
      receiptNumber,
      warehouseId: input.warehouseId,
      warehouseName: facility.name,
      sourceType: input.sourceType,
      sourceReferenceId: input.sourceReferenceId,
      sourceBatchCode,
      traceCertificateNumber,
      senderId,
      senderName,
      quantityKg,
      bagCount,
      qualityGrade,
      moistureContentPercent,
      eudrCompliant,
      receivedByOfficerId: input.officerUserId,
      receivedByOfficerName: input.officerName,
      receivedAt: now,
      status: "received",
      notes: input.notes,
      idempotencyKey,
    };

    const savedReceipt = await warehouseStore.appendReceipt(receiptRecord);

    return {
      receipt: savedReceipt,
      updatedFacility,
    };
  }

  // ==========================================
  // 6. RECEIPT LEDGER REVERSALS & ADJUSTMENTS
  // ==========================================

  /**
   * Reversals are append-only. Corrections must be made with reversal
   * or adjustment entries, NEVER by editing or deleting receipt records.
   */
  async createReceiptReversal(
    callerContext: WarehouseActorContext,
    receiptId: string,
    reason: string
  ): Promise<{ reversalReceipt: WarehouseReceiptRecord; updatedFacility: WarehouseFacility }> {
    const original = await warehouseStore.getReceipt(receiptId);
    if (!original) {
      throw new Error(`Receipt record not found: ${receiptId}`);
    }

    this.assertWarehouseAccess(callerContext, original.warehouseId);
    await this.assertWarehouseNotSuspended(original.warehouseId);

    if (original.status === "reversal") {
      throw new Error("Cannot reverse an entry that is already a reversal.");
    }

    if (!reason || reason.trim().length === 0) {
      throw new Error("Reversal reason must be provided.");
    }

    // Atomically decrement warehouse stock
    const updatedFacility = await warehouseStore.mutateStockAtomic(
      original.warehouseId,
      -original.quantityKg,
      false
    );

    const reversalId = `rcpt_wh_rev_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const reversalNumber = `REV-${original.receiptNumber}`;
    const now = new Date().toISOString();

    const reversalRecord: WarehouseReceiptRecord = {
      id: reversalId,
      receiptNumber: reversalNumber,
      warehouseId: original.warehouseId,
      warehouseName: original.warehouseName,
      sourceType: original.sourceType,
      sourceReferenceId: original.sourceReferenceId,
      sourceBatchCode: original.sourceBatchCode,
      traceCertificateNumber: original.traceCertificateNumber,
      senderId: original.senderId,
      senderName: original.senderName,
      quantityKg: -original.quantityKg, // Negative delta in ledger
      bagCount: -original.bagCount,
      qualityGrade: original.qualityGrade,
      moistureContentPercent: original.moistureContentPercent,
      eudrCompliant: original.eudrCompliant,
      receivedByOfficerId: callerContext.userId,
      receivedByOfficerName: `Officer ${callerContext.userId}`,
      receivedAt: now,
      status: "reversal",
      notes: `Reversal of ${original.receiptNumber}: ${reason}`,
      idempotencyKey: `reversal_${original.id}_${Date.now()}`,
      reversalOfReceiptId: original.id,
      reversalReason: reason,
    };

    const savedReversal = await warehouseStore.appendReceipt(reversalRecord);

    return {
      reversalReceipt: savedReversal,
      updatedFacility,
    };
  }

  async listReceipts(
    callerContext: WarehouseActorContext,
    warehouseId: string
  ): Promise<WarehouseReceiptRecord[]> {
    this.assertWarehouseAccess(callerContext, warehouseId);
    return await warehouseStore.listReceiptsByWarehouse(warehouseId);
  }

  // ==========================================
  // 7. CROSS RIVER STATE FULL TRACE CERTIFICATE REQUESTS
  // ==========================================

  async requestCrossRiverFullTraceCertificate(
    callerContext: WarehouseActorContext,
    data: {
      warehouseId: string;
      officerId: string;
      officerName: string;
      batchCode: string;
      receiptIds: string[];
      totalQuantityKg: number;
      originCorridor: string;
      destinationPortOrBuyer: string;
    }
  ): Promise<WarehouseFullTraceRequest> {
    this.assertWarehouseAccess(callerContext, data.warehouseId);
    const facility = await this.assertWarehouseNotSuspended(data.warehouseId);

    if (data.totalQuantityKg <= 0) {
      throw new Error("Total quantity must be greater than 0 kg.");
    }

    if (data.totalQuantityKg > facility.currentStockKg) {
      throw new Error(
        `INSUFFICIENT_STOCK: Requested certificate quantity (${data.totalQuantityKg} kg) exceeds current warehouse stock (${facility.currentStockKg} kg).`
      );
    }

    // Read dynamic fee configuration from Administrator module
    const feeConfig = await adminStore.getFeeConfig("FEE_EUDR_AUDIT");
    let calculatedFee = 0;
    if (feeConfig && feeConfig.isActive) {
      if (feeConfig.feeType === "percentage") {
        const estimatedValue = data.totalQuantityKg * 1800; // 1,800 NGN/kg standard base
        calculatedFee = estimatedValue * (feeConfig.rate / 100);
      } else if (feeConfig.feeType === "flat_naira") {
        calculatedFee = feeConfig.rate;
      }
    }

    const requestId = `req_fulltrace_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const requestNumber = `REQ-CRS-TRC-2026-${Date.now().toString().slice(-4)}`;
    const certNumber = `CERT-CRS-FULLTRACE-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;
    const now = new Date().toISOString();

    const request: WarehouseFullTraceRequest = {
      id: requestId,
      requestNumber,
      warehouseId: data.warehouseId,
      warehouseName: facility.name,
      officerId: data.officerId,
      officerName: data.officerName,
      batchCode: data.batchCode,
      receiptIds: data.receiptIds,
      totalLotsCount: data.receiptIds.length || 1,
      totalQuantityKg: data.totalQuantityKg,
      originCorridor: data.originCorridor,
      destinationPortOrBuyer: data.destinationPortOrBuyer,
      feeConfigIdApplied: feeConfig?.id,
      feeCodeApplied: feeConfig?.feeCode,
      feeAmountPaid: calculatedFee,
      status: "approved",
      certificateNumber: certNumber,
      verificationHash: `SHA256:${Math.random().toString(36).substring(2, 12)}${Date.now()}`,
      createdAt: now,
      updatedAt: now,
    };

    return await warehouseStore.saveFullTraceRequest(request);
  }

  async listFullTraceRequests(
    callerContext: WarehouseActorContext,
    warehouseId: string
  ): Promise<WarehouseFullTraceRequest[]> {
    this.assertWarehouseAccess(callerContext, warehouseId);
    return await warehouseStore.listFullTraceRequests(warehouseId);
  }

  // ==========================================
  // 8. CUSTOMS & EXPORT SERVICE REQUESTS
  // ==========================================

  async submitCustomsExportRequest(
    callerContext: WarehouseActorContext,
    data: {
      warehouseId: string;
      officerId: string;
      manifestOrBatchCode: string;
      quantityKg: number;
      destinationPort: string;
      exportLicenseNumber: string;
      notes?: string;
    }
  ): Promise<WarehouseExportCustomsRequest> {
    this.assertWarehouseAccess(callerContext, data.warehouseId);
    const facility = await this.assertWarehouseNotSuspended(data.warehouseId);

    // Read dynamic customs clearance fee from Administrator module
    const feeConfig = await adminStore.getFeeConfig("FEE_CUSTOMS_CLEARANCE");
    const feeAmount = feeConfig && feeConfig.isActive ? feeConfig.rate : 45000;

    const requestId = `req_cust_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const requestNumber = `REQ-CUST-EXP-2026-${Date.now().toString().slice(-4)}`;
    const now = new Date().toISOString();

    const request: WarehouseExportCustomsRequest = {
      id: requestId,
      requestNumber,
      warehouseId: data.warehouseId,
      warehouseName: facility.name,
      officerId: data.officerId,
      manifestOrBatchCode: data.manifestOrBatchCode,
      quantityKg: data.quantityKg,
      destinationPort: data.destinationPort,
      exportLicenseNumber: data.exportLicenseNumber,
      feeCodeApplied: feeConfig?.feeCode || "FEE_CUSTOMS_CLEARANCE",
      feeAmount,
      paymentStatus: "paid",
      status: "pending_clearance",
      customsReferenceNumber: `NCS-CRS-EXP-${Date.now().toString().slice(-6)}`,
      notes: data.notes,
      createdAt: now,
      updatedAt: now,
    };

    return await warehouseStore.saveCustomsRequest(request);
  }

  async listCustomsRequests(
    callerContext: WarehouseActorContext,
    warehouseId: string
  ): Promise<WarehouseExportCustomsRequest[]> {
    this.assertWarehouseAccess(callerContext, warehouseId);
    return await warehouseStore.listCustomsRequests(warehouseId);
  }

  // ==========================================
  // 9. DASHBOARD DATA
  // ==========================================

  async getDashboardData(
    callerContext: WarehouseActorContext,
    warehouseId: string
  ): Promise<WarehouseDashboardData> {
    this.assertWarehouseAccess(callerContext, warehouseId);
    const facility = await warehouseStore.getFacility(warehouseId);
    if (!facility) {
      throw new Error(`Warehouse facility not found: ${warehouseId}`);
    }

    const receipts = await warehouseStore.listReceiptsByWarehouse(warehouseId, 20);
    const fullTraceRequests = await warehouseStore.listFullTraceRequests(warehouseId);
    const customsRequests = await warehouseStore.listCustomsRequests(warehouseId);

    const normalReceipts = receipts.filter((r) => r.status === "received");
    const reversals = receipts.filter((r) => r.status === "reversal");

    const metrics: WarehouseDashboardMetrics = {
      maxCapacityKg: facility.maxCapacityKg,
      currentStockKg: facility.currentStockKg,
      availableCapacityKg: facility.availableCapacityKg,
      maxCapacityTons: facility.maxCapacityTons,
      currentStockTons: facility.currentStockTons,
      utilizationPercentage: facility.utilizationPercentage,
      totalBagsStored: facility.totalBagsStored,
      totalReceiptsCount: normalReceipts.length,
      totalReversalsCount: reversals.length,
      totalActiveStockTonnage: facility.currentStockTons,
      operationalStatus: facility.operationalStatus,
      adminControlledStatus: facility.adminControlledStatus,
      activeCertificatesCount: fullTraceRequests.filter((r) => r.status === "approved" || r.status === "issued").length,
      pendingFullTraceRequestsCount: fullTraceRequests.filter((r) => r.status === "pending").length,
    };

    return {
      warehouse: facility,
      metrics,
      recentReceipts: receipts,
      pendingFullTraceRequests: fullTraceRequests,
      recentCustomsRequests: customsRequests,
    };
  }
}

export const warehouseService = new WarehouseService();
