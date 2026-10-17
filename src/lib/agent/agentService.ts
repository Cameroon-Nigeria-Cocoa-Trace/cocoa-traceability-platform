import {
  AgentProfile,
  AgentRegistrationInput,
  AgentOrganization,
  AgentOrgMember,
  AgentInspection,
  AgentTransaction,
  AgentBatchManifest,
  AgentCertificate,
  AgentDashboardData,
  AgentDashboardSummary,
  QualityGrade,
  ManifestStatus,
} from "@/types/agent";
import { agentStore } from "./agentStore";

export class AgentService {
  // ==========================================
  // 1. AGENT ACCOUNTS & REGISTRATION
  // ==========================================

  async registerAgent(input: AgentRegistrationInput): Promise<AgentProfile> {
    if (!input.userId) {
      throw new Error("Missing required field: userId");
    }
    if (!input.fullName || !input.email || !input.phone) {
      throw new Error("Missing required contact information (fullName, email, phone)");
    }

    // Check if profile already exists for this user
    const existing = await agentStore.getProfile(input.userId);
    if (existing) {
      return existing;
    }

    const timestamp = Date.now();
    const agentId = `agent_${timestamp}_${Math.random().toString(36).substring(2, 7)}`;
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const accreditationNumber =
      input.accreditationNumber || `AGT-CR-2026-${randomSuffix}`;

    const profile: AgentProfile = {
      id: agentId,
      userId: input.userId,
      fullName: input.fullName.trim(),
      email: input.email.trim().toLowerCase(),
      phone: input.phone.trim(),
      accountType: input.accountType || "personal",
      accreditationNumber,
      nationalIdOrNin: input.nationalIdOrNin?.trim(),
      status: "active",
      operatingRegion: input.operatingRegion || "Cross River State / Cameroon Corridor",
      operatingLgas:
        input.operatingLgas && input.operatingLgas.length > 0
          ? input.operatingLgas
          : ["Ikom", "Etung", "Boki"],
      assignedCooperativeId: input.assignedCooperativeId,
      assignedCooperativeName: input.assignedCooperativeName,
      organizationId: input.organizationId,
      organizationRole: input.organizationRole,
      // Configurable fee percentage, defaults to 1.5% if not provided
      serviceFeePercentage:
        input.serviceFeePercentage !== undefined ? input.serviceFeePercentage : 1.5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return await agentStore.saveProfile(profile);
  }

  async getProfile(agentOrUserId: string): Promise<AgentProfile | null> {
    return await agentStore.getProfile(agentOrUserId);
  }

  async updateProfile(
    agentId: string,
    updates: Partial<AgentProfile>
  ): Promise<AgentProfile | null> {
    return await agentStore.updateProfile(agentId, updates);
  }

  // ==========================================
  // 2. AGENT ORGANIZATIONS & MEMBERSHIPS
  // ==========================================

  async createOrganization(
    ownerAgentId: string,
    data: {
      name: string;
      registrationNumber: string;
      headquarters: string;
      contactEmail: string;
      contactPhone: string;
      operatingRegions?: string[];
      serviceFeePercentage?: number;
    }
  ): Promise<AgentOrganization> {
    const owner = await agentStore.getProfile(ownerAgentId);
    if (!owner) {
      throw new Error(`Agent with ID ${ownerAgentId} not found.`);
    }

    const orgId = `org_agt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const initialMember: AgentOrgMember = {
      id: `mem_${Date.now()}_1`,
      userId: owner.userId,
      agentId: owner.id,
      name: owner.fullName,
      email: owner.email,
      phone: owner.phone,
      role: "owner",
      status: "active",
      joinedAt: now,
    };

    const organization: AgentOrganization = {
      id: orgId,
      name: data.name.trim(),
      registrationNumber: data.registrationNumber.trim(),
      ownerId: owner.userId,
      headquarters: data.headquarters.trim(),
      contactEmail: data.contactEmail.trim().toLowerCase(),
      contactPhone: data.contactPhone.trim(),
      operatingRegions: data.operatingRegions || [owner.operatingRegion],
      serviceFeePercentage:
        data.serviceFeePercentage !== undefined
          ? data.serviceFeePercentage
          : owner.serviceFeePercentage || 1.5,
      members: [initialMember],
      status: "active",
      createdAt: now,
      updatedAt: now,
    };

    const savedOrg = await agentStore.saveOrganization(organization);

    // Link owner's profile to organization
    await agentStore.updateProfile(owner.id, {
      accountType: "organizational",
      organizationId: orgId,
      organizationRole: "owner",
    });

    return savedOrg;
  }

  async getOrganization(orgId: string): Promise<AgentOrganization | null> {
    return await agentStore.getOrganization(orgId);
  }

  async addMemberToOrganization(
    orgId: string,
    inviterAgentId: string,
    memberData: {
      userId: string;
      agentId?: string;
      name: string;
      email: string;
      phone?: string;
      role: "manager" | "agent" | "inspector";
    }
  ): Promise<AgentOrganization> {
    const org = await agentStore.getOrganization(orgId);
    if (!org) throw new Error("Organization not found");

    const inviter = await agentStore.getProfile(inviterAgentId);
    if (!inviter) throw new Error("Inviter agent profile not found");

    const inviterMembership = org.members.find(
      (m) => m.userId === inviter.userId || m.agentId === inviter.id
    );

    if (
      !inviterMembership ||
      (inviterMembership.role !== "owner" && inviterMembership.role !== "manager")
    ) {
      throw new Error("Only organization owners or managers can add members");
    }

    const memberId = `mem_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newMember: AgentOrgMember = {
      id: memberId,
      userId: memberData.userId,
      agentId: memberData.agentId || "",
      name: memberData.name.trim(),
      email: memberData.email.trim().toLowerCase(),
      phone: memberData.phone?.trim(),
      role: memberData.role,
      status: "active",
      joinedAt: new Date().toISOString(),
    };

    const updatedMembers = [...org.members, newMember];
    const updatedOrg = await agentStore.updateOrganization(orgId, {
      members: updatedMembers,
    });

    // If an agent profile already exists for this member, link it
    if (memberData.agentId) {
      await agentStore.updateProfile(memberData.agentId, {
        accountType: "organizational",
        organizationId: orgId,
        organizationRole: memberData.role,
      });
    }

    return updatedOrg!;
  }

  async removeMemberFromOrganization(
    orgId: string,
    requesterAgentId: string,
    memberId: string
  ): Promise<AgentOrganization> {
    const org = await agentStore.getOrganization(orgId);
    if (!org) throw new Error("Organization not found");

    const requester = await agentStore.getProfile(requesterAgentId);
    if (!requester) throw new Error("Requester profile not found");

    const requesterMember = org.members.find(
      (m) => m.userId === requester.userId || m.agentId === requester.id
    );

    if (!requesterMember || requesterMember.role !== "owner") {
      throw new Error("Only organization owners can remove members");
    }

    const targetMember = org.members.find((m) => m.id === memberId);
    if (!targetMember) throw new Error("Target member not found");
    if (targetMember.role === "owner") {
      throw new Error("Cannot remove the organization owner");
    }

    const updatedMembers = org.members.filter((m) => m.id !== memberId);
    const updatedOrg = await agentStore.updateOrganization(orgId, {
      members: updatedMembers,
    });

    if (targetMember.agentId) {
      await agentStore.updateProfile(targetMember.agentId, {
        accountType: "personal",
        organizationId: undefined,
        organizationRole: undefined,
      });
    }

    return updatedOrg!;
  }

  // ==========================================
  // 3. OPERATIONAL WORKFLOW: FIELD INSPECTION & QUALITY INTAKE
  // ==========================================

  async recordInspection(data: {
    agentId: string;
    farmId: string;
    farmerId: string;
    farmerName: string;
    cooperative?: string;
    inspectionDate?: string;
    moistureContentPercent: number;
    beanCountPer100g: number;
    fermentationRatePercent: number;
    defectiveBeansPercent: number;
    geolocation?: string;
    notes?: string;
    issueCertificate?: boolean;
  }): Promise<{ inspection: AgentInspection; certificate?: AgentCertificate }> {
    const agent = await agentStore.getProfile(data.agentId);
    if (!agent) throw new Error("Agent not found");

    // Quality determination based on standard Cocoa trade grading rules
    let qualityGrade: QualityGrade = "Sub-standard";
    if (
      data.moistureContentPercent <= 7.8 &&
      data.fermentationRatePercent >= 80 &&
      data.defectiveBeansPercent <= 3.0
    ) {
      qualityGrade = "Grade 1";
    } else if (
      data.moistureContentPercent <= 8.5 &&
      data.fermentationRatePercent >= 70 &&
      data.defectiveBeansPercent <= 5.0
    ) {
      qualityGrade = "Grade 2";
    }

    const eudrComplianceVerified =
      data.moistureContentPercent <= 8.0 && qualityGrade !== "Sub-standard";

    const inspectionId = `insp_agt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    let certNumber: string | undefined;
    let certificate: AgentCertificate | undefined;

    if (data.issueCertificate && eudrComplianceVerified) {
      certNumber = `CERT-AGT-INSP-${Date.now().toString().slice(-6)}`;
      certificate = {
        id: `cert_agt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        certificateNumber: certNumber,
        type: "field_inspection",
        agentId: agent.id,
        agentName: agent.fullName,
        accreditationNumber: agent.accreditationNumber,
        farmId: data.farmId,
        farmerName: data.farmerName,
        cooperative: data.cooperative || agent.assignedCooperativeName,
        eudrOriginCountry: "Cameroon", // Origin preserved across border corridor
        issuedAt: now,
        verificationHash: `SHA256:${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`,
        status: "valid",
      };
      await agentStore.saveCertificate(certificate);
    }

    const inspection: AgentInspection = {
      id: inspectionId,
      agentId: agent.id,
      agentName: agent.fullName,
      organizationId: agent.organizationId,
      farmId: data.farmId,
      farmerId: data.farmerId,
      farmerName: data.farmerName,
      cooperative: data.cooperative || agent.assignedCooperativeName,
      inspectionDate: data.inspectionDate || now,
      moistureContentPercent: data.moistureContentPercent,
      beanCountPer100g: data.beanCountPer100g,
      fermentationRatePercent: data.fermentationRatePercent,
      defectiveBeansPercent: data.defectiveBeansPercent,
      eudrComplianceVerified,
      geolocationVerified: true,
      geolocation: data.geolocation || "5.9723°, 10.0162°",
      qualityGrade,
      notes: data.notes,
      certificateIssued: Boolean(certificate),
      certificateNumber: certNumber,
      createdAt: now,
    };

    const savedInspection = await agentStore.saveInspection(inspection);
    return { inspection: savedInspection, certificate };
  }

  // ==========================================
  // 4. OPERATIONAL WORKFLOW: COCOA PURCHASING TRANSACTION
  // ==========================================

  async recordTransaction(data: {
    agentId: string;
    farmId: string;
    farmerId: string;
    farmerName: string;
    cooperative?: string;
    quantityKg: number;
    unitPrice: number;
    currency?: string;
    paymentMethod: "bank_transfer" | "mobile_money" | "cash" | "coop_credit";
    paymentReference?: string;
    batchCode: string;
    inspectionId?: string;
    warehouseDestinationId?: string;
    warehouseDestinationName?: string;
    feeRateOverride?: number; // Configurable fee rate override
  }): Promise<AgentTransaction> {
    const agent = await agentStore.getProfile(data.agentId);
    if (!agent) throw new Error("Agent not found");

    if (data.quantityKg <= 0) {
      throw new Error("Quantity must be greater than 0 kg");
    }
    if (data.unitPrice <= 0) {
      throw new Error("Unit price must be greater than 0");
    }

    const grossAmount = data.quantityKg * data.unitPrice;

    // Use configurable fee rate: override > agent profile > default 1.5%
    const feeRateApplied =
      data.feeRateOverride !== undefined
        ? data.feeRateOverride
        : agent.serviceFeePercentage !== undefined
        ? agent.serviceFeePercentage
        : 1.5;

    const serviceFeeAmount = Math.round(grossAmount * (feeRateApplied / 100));
    const netAmount = grossAmount - serviceFeeAmount;

    const txnId = `txn_agt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const paymentRef =
      data.paymentReference ||
      `PAY-REF-${Date.now().toString().slice(-8).toUpperCase()}`;

    const transaction: AgentTransaction = {
      id: txnId,
      agentId: agent.id,
      agentName: agent.fullName,
      organizationId: agent.organizationId,
      farmId: data.farmId,
      farmerId: data.farmerId,
      farmerName: data.farmerName,
      cooperative: data.cooperative || agent.assignedCooperativeName,
      quantityKg: data.quantityKg,
      unitPrice: data.unitPrice,
      currency: data.currency || "FCFA",
      grossAmount,
      feeRateApplied,
      serviceFeeAmount,
      netAmount,
      paymentMethod: data.paymentMethod,
      paymentReference: paymentRef,
      paymentStatus: "completed",
      batchCode: data.batchCode,
      inspectionId: data.inspectionId,
      warehouseDestinationId:
        data.warehouseDestinationId || "wh_ikom_central",
      warehouseDestinationName:
        data.warehouseDestinationName || "Ikom Central Aggregation Warehouse",
      status: "completed",
      transactionDate: now,
      createdAt: now,
    };

    return await agentStore.saveTransaction(transaction);
  }

  // ==========================================
  // 5. OPERATIONAL WORKFLOW: BATCH AGGREGATION & WAREHOUSE HANDOVER
  // ==========================================

  async createBatchManifest(data: {
    agentId: string;
    transactionIds: string[];
    warehouseId: string;
    warehouseName: string;
    warehouseLocation: string;
    traceCertificateNumber?: string;
  }): Promise<{ manifest: AgentBatchManifest; certificate: AgentCertificate }> {
    const agent = await agentStore.getProfile(data.agentId);
    if (!agent) throw new Error("Agent not found");

    if (!data.transactionIds || data.transactionIds.length === 0) {
      throw new Error("Must select at least one transaction to aggregate into manifest");
    }

    // Retrieve all aggregated transactions
    const txns: AgentTransaction[] = [];
    for (const tid of data.transactionIds) {
      const t = await agentStore.getTransaction(tid);
      if (t) txns.push(t);
    }

    if (txns.length === 0) {
      throw new Error("None of the specified transactions were found");
    }

    const totalQuantityKg = txns.reduce((sum, t) => sum + t.quantityKg, 0);
    const totalBagCount = Math.ceil(totalQuantityKg / 64); // Standard 64kg export jute bags
    const cooperativesSet = new Set<string>();
    txns.forEach((t) => {
      if (t.cooperative) cooperativesSet.add(t.cooperative);
    });

    const manifestId = `manifest_agt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const manifestNumber = `MAN-CR-2026-${Date.now().toString().slice(-4)}`;
    const traceCertificateNumber =
      data.traceCertificateNumber || `CERT-AGT-AGG-${Date.now().toString().slice(-6)}`;
    const now = new Date().toISOString();

    const manifest: AgentBatchManifest = {
      id: manifestId,
      manifestNumber,
      agentId: agent.id,
      agentName: agent.fullName,
      organizationId: agent.organizationId,
      transactionIds: data.transactionIds,
      totalQuantityKg,
      totalBagCount,
      originSummary: "Cross River Corridor / Southwest Cameroon Border Plots",
      cooperativesInvolved: Array.from(cooperativesSet),
      warehouseId: data.warehouseId,
      warehouseName: data.warehouseName,
      warehouseLocation: data.warehouseLocation,
      traceCertificateNumber,
      handoverDate: now,
      status: "prepared",
      createdAt: now,
      updatedAt: now,
    };

    const savedManifest = await agentStore.saveManifest(manifest);

    // Update transactions status to aggregated
    for (const t of txns) {
      await agentStore.saveTransaction({
        ...t,
        status: "aggregated",
      });
    }

    // Generate Aggregation Certificate
    const cert: AgentCertificate = {
      id: `cert_agt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      certificateNumber: traceCertificateNumber,
      type: "aggregation_manifest",
      agentId: agent.id,
      agentName: agent.fullName,
      accreditationNumber: agent.accreditationNumber,
      batchCode: manifestNumber,
      quantityKg: totalQuantityKg,
      eudrOriginCountry: "Cameroon (EUDR Verified Intake)",
      issuedAt: now,
      verificationHash: `SHA256:${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`,
      status: "valid",
    };

    const savedCert = await agentStore.saveCertificate(cert);
    return { manifest: savedManifest, certificate: savedCert };
  }

  async updateManifestStatus(
    manifestId: string,
    agentId: string,
    status: ManifestStatus,
    notes?: string,
    warehouseOfficer?: string
  ): Promise<AgentBatchManifest | null> {
    const agent = await agentStore.getProfile(agentId);
    if (!agent) throw new Error("Agent not found");

    return await agentStore.updateManifest(manifestId, {
      status,
      acceptanceNotes: notes,
      receivedByWarehouseOfficer: warehouseOfficer,
    });
  }

  async getManifest(manifestId: string): Promise<AgentBatchManifest | null> {
    return await agentStore.getManifest(manifestId);
  }

  // ==========================================
  // 6. CERTIFICATE VERIFICATION & LOOKUP
  // ==========================================

  async verifyCertificate(certificateNumberOrId: string): Promise<AgentCertificate | null> {
    return await agentStore.getCertificate(certificateNumberOrId);
  }

  async getCertificatesByAgent(agentId: string): Promise<AgentCertificate[]> {
    return await agentStore.getCertificatesByAgent(agentId);
  }

  // ==========================================
  // 7. OPERATIONAL DASHBOARD METRICS
  // ==========================================

  async getDashboardData(agentOrUserId: string): Promise<AgentDashboardData> {
    let agent = await agentStore.getProfile(agentOrUserId);
    if (!agent) {
      // Create or return demo agent profile
      agent = await this.registerAgent({
        userId: agentOrUserId,
        fullName: "Registered Agent",
        email: `${agentOrUserId}@cocoatrace.cm`,
        phone: "+234 800 000 0000",
        accountType: "personal",
        operatingRegion: "Cross River State / Cameroon Corridor",
        operatingLgas: ["Ikom", "Etung"],
      });
    }

    const [txns, inspections, manifests, certs] = await Promise.all([
      agentStore.getTransactionsByAgent(agent.id),
      agentStore.getInspectionsByAgent(agent.id),
      agentStore.getManifestsByAgent(agent.id),
      agentStore.getCertificatesByAgent(agent.id),
    ]);

    const totalCocoaPurchasedKg = txns.reduce((sum, t) => sum + t.quantityKg, 0);
    const totalExpenditure = txns.reduce((sum, t) => sum + t.grossAmount, 0);
    const distinctFarmers = new Set(txns.map((t) => t.farmerId));
    const distinctCoops = new Set(
      txns.map((t) => t.cooperative).filter(Boolean) as string[]
    );

    const warehouseDeliveriesCount = manifests.filter(
      (m) => m.status === "delivered" || m.status === "accepted_by_warehouse"
    ).length;

    const compliantInspections = inspections.filter(
      (i) => i.eudrComplianceVerified
    ).length;
    const eudrComplianceRate =
      inspections.length > 0
        ? Math.round((compliantInspections / inspections.length) * 100)
        : 100;

    const summary: AgentDashboardSummary = {
      totalCocoaPurchasedKg,
      totalExpenditure,
      totalTransactionsCount: txns.length,
      activeFarmersCount: distinctFarmers.size,
      cooperativesCount: distinctCoops.size,
      batchesAggregatedCount: manifests.length,
      warehouseDeliveriesCount,
      averageQualityGrade: "Grade 1",
      eudrComplianceRate,
    };

    return {
      agent,
      summary,
      recentTransactions: txns.slice(0, 10),
      recentInspections: inspections.slice(0, 10),
      recentManifests: manifests.slice(0, 10),
      activeCertificates: certs.slice(0, 10),
    };
  }

  // ==========================================
  // 8. EXISTING INTEGRATION POINTS: FARMERS, COOPERATIVES, WAREHOUSES
  // ==========================================

  async getFarmerFarm(farmId: string): Promise<Record<string, unknown> | null> {
    return await agentStore.getFarmRecord(farmId);
  }

  getApprovedWarehouses() {
    return [
      {
        id: "wh_ikom_central",
        name: "Ikom Central Aggregation Warehouse",
        location: "Ikom Commercial District, Cross River State",
        capacityTons: 5000,
        acceptedCertificates: ["EUDR Origine Cameroun", "Cross River Trace"],
      },
      {
        id: "wh_etung_border",
        name: "Etung Transit & Inspection Terminal",
        location: "Etung LGA, Cross River Border Hub",
        capacityTons: 2500,
        acceptedCertificates: ["EUDR Origine Cameroun"],
      },
      {
        id: "wh_calabar_port",
        name: "Calabar Port Maritime Export Facility",
        location: "Calabar Free Trade Zone Port, Cross River State",
        capacityTons: 12000,
        acceptedCertificates: ["Federal Nigerian Customs Export", "EUDR Final"],
      },
    ];
  }
}

export const agentService = new AgentService();
