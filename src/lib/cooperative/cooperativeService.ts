import {
  CooperativeProfile,
  CooperativeRegistrationInput,
  CooperativeOrganization,
  CooperativeOrgMember,
  CooperativeRoleInOrg,
  CooperativeMembershipHistoryRecord,
  SubordinateCooperativeRelationship,
  CooperativeFarmerAffiliation,
  CooperativeAffiliationHistoryRecord,
  AffiliationStatus,
  CooperativeCertificate,
  CooperativeIntakeBatch,
  CooperativeDashboardData,
  CooperativeDashboardSummary,
  QualityGrade,
} from "@/types/cooperative";
import { cooperativeStore } from "./cooperativeStore";
import { adminStore } from "@/lib/admin/adminStore";

export class CooperativeService {
  // ==========================================
  // 1. COOPERATIVE ACCOUNT & REGISTRATION
  // ==========================================

  async registerCooperativeAccount(
    input: CooperativeRegistrationInput
  ): Promise<CooperativeProfile> {
    if (!input.userId) {
      throw new Error("Missing required field: userId");
    }
    if (!input.fullName || !input.email || !input.phone) {
      throw new Error("Missing required contact details (fullName, email, phone)");
    }

    // Check if profile already exists for this user
    const existing = await cooperativeStore.getProfile(input.userId);
    if (existing) {
      return existing;
    }

    const timestamp = Date.now();
    const profileId = `coop_usr_${timestamp}_${Math.random().toString(36).substring(2, 7)}`;

    const profile: CooperativeProfile = {
      id: profileId,
      userId: input.userId,
      fullName: input.fullName.trim(),
      email: input.email.trim().toLowerCase(),
      phone: input.phone.trim(),
      accountType: input.accountType || "personal",
      officerRole: input.officerRole || "member",
      cooperativeId: input.cooperativeId || "org_coop_sowescop",
      cooperativeName:
        input.cooperativeName ||
        "Southwest Farmers Cocoa Cooperative Society (SOWESCOP)",
      nationalIdOrNin: input.nationalIdOrNin?.trim(),
      operatingRegion: input.operatingRegion || "Southwest Cameroon / Cross River Corridor",
      operatingLgas:
        input.operatingLgas && input.operatingLgas.length > 0
          ? input.operatingLgas
          : ["Manyu", "Mamfe", "Ikom Border Corridor"],
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: input.metadata,
    };

    return await cooperativeStore.saveProfile(profile);
  }

  async getProfile(idOrUserId: string): Promise<CooperativeProfile | null> {
    return await cooperativeStore.getProfile(idOrUserId);
  }

  async updateProfile(
    profileId: string,
    updates: Partial<CooperativeProfile>
  ): Promise<CooperativeProfile | null> {
    return await cooperativeStore.updateProfile(profileId, updates);
  }

  // ==========================================
  // 2. COOPERATIVE ORGANIZATION & MEMBERSHIP
  // ==========================================

  async createOrganization(
    ownerUserId: string,
    data: {
      name: string;
      registrationNumber: string;
      tier?: "apex_union" | "primary_society";
      parentCooperativeId?: string;
      headquarters: string;
      contactEmail: string;
      contactPhone: string;
      operatingRegions?: string[];
      operatingLgas?: string[];
      bankSettlementInfo?: {
        bankName: string;
        accountNumber: string;
        accountName: string;
      };
    }
  ): Promise<CooperativeOrganization> {
    if (!data.name || !data.registrationNumber) {
      throw new Error("Organization name and official registration number are required");
    }

    const orgId = `org_coop_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const founderMember: CooperativeOrgMember = {
      id: `mem_coop_${Date.now()}_1`,
      userId: ownerUserId,
      name: data.name,
      email: data.contactEmail,
      phone: data.contactPhone,
      role: "president",
      status: "active",
      joinedAt: now,
    };

    const organization: CooperativeOrganization = {
      id: orgId,
      name: data.name.trim(),
      registrationNumber: data.registrationNumber.trim(),
      tier: data.tier || "primary_society",
      parentCooperativeId: data.parentCooperativeId,
      subordinateCooperativeIds: [],
      ownerUserId,
      headquarters: data.headquarters.trim(),
      contactEmail: data.contactEmail.trim().toLowerCase(),
      contactPhone: data.contactPhone.trim(),
      operatingRegions: data.operatingRegions || ["Cross River State Corridor"],
      operatingLgas: data.operatingLgas || ["Ikom"],
      status: "active",
      bankSettlementInfo: data.bankSettlementInfo,
      members: [founderMember],
      memberCount: 1,
      farmerCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    // If a parent apex cooperative was specified, register subordinate relationship
    if (data.parentCooperativeId) {
      const parentOrg = await cooperativeStore.getOrganization(data.parentCooperativeId);
      if (parentOrg) {
        const subs = parentOrg.subordinateCooperativeIds || [];
        if (!subs.includes(orgId)) {
          subs.push(orgId);
          await cooperativeStore.updateOrganization(parentOrg.id, {
            subordinateCooperativeIds: subs,
          });
        }

        await cooperativeStore.saveSubordinateRelationship({
          id: `rel_${parentOrg.id}_${orgId}`,
          apexCooperativeId: parentOrg.id,
          apexCooperativeName: parentOrg.name,
          subordinateCooperativeId: orgId,
          subordinateCooperativeName: organization.name,
          relationshipStatus: "active",
          affiliationDate: now,
          notes: "Affiliated during organization registration",
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    return await cooperativeStore.saveOrganization(organization);
  }

  async getOrganization(orgId: string): Promise<CooperativeOrganization | null> {
    return await cooperativeStore.getOrganization(orgId);
  }

  async updateOrganization(
    orgId: string,
    updates: Partial<CooperativeOrganization>
  ): Promise<CooperativeOrganization | null> {
    return await cooperativeStore.updateOrganization(orgId, updates);
  }

  async addMember(
    orgId: string,
    memberData: {
      userId: string;
      name: string;
      email: string;
      phone?: string;
      role: CooperativeRoleInOrg;
      notes?: string;
    },
    addedBy: string
  ): Promise<CooperativeOrganization> {
    const org = await cooperativeStore.getOrganization(orgId);
    if (!org) {
      throw new Error(`Cooperative organization not found: ${orgId}`);
    }

    // Check if user is already an active member
    const existing = org.members.find((m) => m.userId === memberData.userId);
    if (existing && existing.status !== "removed") {
      throw new Error(`User ${memberData.userId} is already a member of this cooperative.`);
    }

    const now = new Date().toISOString();
    const newMemberId = `mem_coop_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;

    const newMember: CooperativeOrgMember = {
      id: newMemberId,
      userId: memberData.userId,
      name: memberData.name.trim(),
      email: memberData.email.trim().toLowerCase(),
      phone: memberData.phone?.trim(),
      role: memberData.role,
      status: "active",
      joinedAt: now,
      notes: memberData.notes,
    };

    const updatedMembers = existing
      ? org.members.map((m) => (m.userId === memberData.userId ? newMember : m))
      : [...org.members, newMember];

    const updatedOrg = await cooperativeStore.updateOrganization(orgId, {
      members: updatedMembers,
      memberCount: updatedMembers.filter((m) => m.status === "active").length,
    });

    // Record historical membership audit log
    await cooperativeStore.appendMembershipHistory({
      id: `memhist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      organizationId: orgId,
      memberId: newMemberId,
      userId: memberData.userId,
      newRole: memberData.role,
      newStatus: "active",
      changedBy: addedBy,
      reason: "Member added to cooperative executive/staff roster",
      timestamp: now,
    });

    return updatedOrg!;
  }

  async updateMemberRole(
    orgId: string,
    memberId: string,
    newRole: CooperativeRoleInOrg,
    changedBy: string,
    reason?: string
  ): Promise<CooperativeOrganization> {
    const org = await cooperativeStore.getOrganization(orgId);
    if (!org) throw new Error(`Cooperative organization not found: ${orgId}`);

    const member = org.members.find((m) => m.id === memberId || m.userId === memberId);
    if (!member) throw new Error(`Member not found: ${memberId}`);

    const previousRole = member.role;
    const now = new Date().toISOString();

    const updatedMembers = org.members.map((m) => {
      if (m.id === member.id) {
        return { ...m, role: newRole, updatedAt: now };
      }
      return m;
    });

    const updatedOrg = await cooperativeStore.updateOrganization(orgId, {
      members: updatedMembers,
    });

    await cooperativeStore.appendMembershipHistory({
      id: `memhist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      organizationId: orgId,
      memberId: member.id,
      userId: member.userId,
      previousRole,
      newRole,
      previousStatus: member.status,
      newStatus: member.status,
      changedBy,
      reason: reason || `Updated member role from ${previousRole} to ${newRole}`,
      timestamp: now,
    });

    return updatedOrg!;
  }

  async updateMemberStatus(
    orgId: string,
    memberId: string,
    newStatus: "active" | "suspended" | "removed",
    changedBy: string,
    reason?: string
  ): Promise<CooperativeOrganization> {
    const org = await cooperativeStore.getOrganization(orgId);
    if (!org) throw new Error(`Cooperative organization not found: ${orgId}`);

    const member = org.members.find((m) => m.id === memberId || m.userId === memberId);
    if (!member) throw new Error(`Member not found: ${memberId}`);

    const previousStatus = member.status;
    const now = new Date().toISOString();

    const updatedMembers = org.members.map((m) => {
      if (m.id === member.id) {
        return { ...m, status: newStatus, updatedAt: now };
      }
      return m;
    });

    const activeCount = updatedMembers.filter((m) => m.status === "active").length;

    const updatedOrg = await cooperativeStore.updateOrganization(orgId, {
      members: updatedMembers,
      memberCount: activeCount,
    });

    // Mandatory rule: Preserves historical records using status changes instead of hard deletes
    await cooperativeStore.appendMembershipHistory({
      id: `memhist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      organizationId: orgId,
      memberId: member.id,
      userId: member.userId,
      previousRole: member.role,
      newRole: member.role,
      previousStatus,
      newStatus,
      changedBy,
      reason: reason || `Member status transitioned from ${previousStatus} to ${newStatus}`,
      timestamp: now,
    });

    return updatedOrg!;
  }

  async removeMember(
    orgId: string,
    memberId: string,
    changedBy: string,
    reason?: string
  ): Promise<CooperativeOrganization> {
    // Soft removal through status change to preserve history
    return await this.updateMemberStatus(
      orgId,
      memberId,
      "removed",
      changedBy,
      reason || "Member removed from active cooperative roster"
    );
  }

  async getMembershipHistory(orgId: string): Promise<CooperativeMembershipHistoryRecord[]> {
    return await cooperativeStore.getMembershipHistory(orgId);
  }

  // ==========================================
  // 3. SUBORDINATE COOPERATIVE RELATIONSHIPS
  // ==========================================

  async linkSubordinateCooperative(
    apexCooperativeId: string,
    subordinateCooperativeId: string,
    notes?: string
  ): Promise<SubordinateCooperativeRelationship> {
    const apex = await cooperativeStore.getOrganization(apexCooperativeId);
    if (!apex) throw new Error(`Apex cooperative not found: ${apexCooperativeId}`);

    const subordinate = await cooperativeStore.getOrganization(subordinateCooperativeId);
    if (!subordinate) {
      throw new Error(`Subordinate cooperative not found: ${subordinateCooperativeId}`);
    }

    const relId = `rel_${apexCooperativeId}_${subordinateCooperativeId}`;
    const now = new Date().toISOString();

    const rel: SubordinateCooperativeRelationship = {
      id: relId,
      apexCooperativeId: apex.id,
      apexCooperativeName: apex.name,
      subordinateCooperativeId: subordinate.id,
      subordinateCooperativeName: subordinate.name,
      relationshipStatus: "active",
      affiliationDate: now,
      notes: notes || "Primary society linked under regional apex union",
      createdAt: now,
      updatedAt: now,
    };

    // Update subordinate's parent pointer
    await cooperativeStore.updateOrganization(subordinate.id, {
      parentCooperativeId: apex.id,
      tier: "primary_society",
    });

    // Update apex's subordinate list
    const subs = apex.subordinateCooperativeIds || [];
    if (!subs.includes(subordinate.id)) {
      subs.push(subordinate.id);
      await cooperativeStore.updateOrganization(apex.id, {
        subordinateCooperativeIds: subs,
        tier: "apex_union",
      });
    }

    return await cooperativeStore.saveSubordinateRelationship(rel);
  }

  async delinkSubordinateCooperative(
    relationshipId: string,
    reason: string
  ): Promise<SubordinateCooperativeRelationship> {
    const existing = await cooperativeStore.getSubordinateRelationship(relationshipId);
    if (!existing) {
      throw new Error(`Subordinate cooperative relationship not found: ${relationshipId}`);
    }

    const now = new Date().toISOString();
    const updated = await cooperativeStore.updateSubordinateRelationship(relationshipId, {
      relationshipStatus: "dissolved",
      dissolutionDate: now,
      notes: `${existing.notes ? existing.notes + " | " : ""}Dissolved: ${reason}`,
    });

    // Remove from apex subordinate array
    const apex = await cooperativeStore.getOrganization(existing.apexCooperativeId);
    if (apex && apex.subordinateCooperativeIds) {
      await cooperativeStore.updateOrganization(apex.id, {
        subordinateCooperativeIds: apex.subordinateCooperativeIds.filter(
          (id) => id !== existing.subordinateCooperativeId
        ),
      });
    }

    // Clear parent pointer on subordinate
    await cooperativeStore.updateOrganization(existing.subordinateCooperativeId, {
      parentCooperativeId: undefined,
    });

    return updated!;
  }

  async listSubordinateCooperatives(
    apexCooperativeId: string
  ): Promise<SubordinateCooperativeRelationship[]> {
    return await cooperativeStore.listSubordinateRelationships(apexCooperativeId);
  }

  // ==========================================
  // 4. WORKING WITH FARMERS (AFFILIATION & MGMT)
  // ==========================================

  async linkFarmerToCooperative(
    cooperativeId: string,
    farmId: string,
    farmerId: string,
    farmerName: string,
    options?: {
      farmerPhone?: string;
      farmerEmail?: string;
      farmName?: string;
      farmRegion?: string;
      farmVillage?: string;
      farmLga?: string;
      sizeHectares?: number;
      cocoaVariety?: string;
      estimatedAnnualYieldKg?: number;
      eudrCompliant?: boolean;
      autoVerify?: boolean;
      verifiedBy?: string;
      notes?: string;
    }
  ): Promise<CooperativeFarmerAffiliation> {
    const coop = await cooperativeStore.getOrganization(cooperativeId);
    if (!coop) throw new Error(`Cooperative organization not found: ${cooperativeId}`);

    // Check if existing farm record is in Firestore
    const existingFarm = await cooperativeStore.getFarmRecord(farmId);

    const resolvedFarmName =
      options?.farmName ||
      (existingFarm && typeof existingFarm.farmName === "string"
        ? existingFarm.farmName
        : "Registered Cocoa Farm");

    const resolvedRegion =
      options?.farmRegion ||
      (existingFarm && typeof existingFarm.region === "string"
        ? existingFarm.region
        : coop.operatingRegions[0] || "Cross River Corridor");

    const resolvedSize =
      options?.sizeHectares ??
      (existingFarm && typeof existingFarm.sizeHectares === "number"
        ? existingFarm.sizeHectares
        : 2.5);

    const resolvedYield =
      options?.estimatedAnnualYieldKg ??
      (existingFarm && typeof existingFarm.estimatedAnnualYieldKg === "number"
        ? existingFarm.estimatedAnnualYieldKg
        : resolvedSize * 800);

    const resolvedEudr =
      options?.eudrCompliant ??
      (existingFarm && typeof existingFarm.eudrCompliant === "boolean"
        ? existingFarm.eudrCompliant
        : true);

    const affId = `aff_coop_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const affiliation: CooperativeFarmerAffiliation = {
      id: affId,
      cooperativeId: coop.id,
      cooperativeName: coop.name,
      farmerId,
      farmerName: farmerName.trim(),
      farmerPhone: options?.farmerPhone || (existingFarm?.farmerPhone as string | undefined),
      farmerEmail: options?.farmerEmail || (existingFarm?.farmerEmail as string | undefined),
      farmId,
      farmName: resolvedFarmName,
      farmRegion: resolvedRegion,
      farmVillage: options?.farmVillage || (existingFarm?.village as string | undefined),
      farmLga: options?.farmLga || (existingFarm?.lga as string | undefined),
      sizeHectares: resolvedSize,
      cocoaVariety: options?.cocoaVariety || (existingFarm?.cocoaVariety as string | undefined) || "Forastero Hybrid",
      estimatedAnnualYieldKg: resolvedYield,
      eudrCompliant: resolvedEudr,
      status: options?.autoVerify ? "active" : "pending_verification",
      affiliationDate: now,
      verifiedBy: options?.autoVerify ? options?.verifiedBy || coop.ownerUserId : undefined,
      verifiedAt: options?.autoVerify ? now : undefined,
      notes: options?.notes || "Affiliation initiated with cooperative society",
      createdAt: now,
      updatedAt: now,
    };

    const saved = await cooperativeStore.saveAffiliation(affiliation);

    // Record audit trail in affiliation history
    await cooperativeStore.appendAffiliationHistory({
      id: `affhist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      affiliationId: affId,
      cooperativeId: coop.id,
      farmerId,
      farmId,
      action: "affiliated",
      newStatus: saved.status,
      changedBy: options?.verifiedBy || farmerId,
      reason: "Farmer plot registered with cooperative",
      timestamp: now,
    });

    // Update cooperative active farmer count
    const affiliations = await cooperativeStore.listAffiliationsByCooperative(coop.id);
    await cooperativeStore.updateOrganization(coop.id, {
      farmerCount: affiliations.filter((a) => a.status === "active").length,
    });

    return saved;
  }

  async verifyFarmerAffiliation(
    affiliationId: string,
    officerId: string,
    notes?: string
  ): Promise<CooperativeFarmerAffiliation> {
    const existing = await cooperativeStore.getAffiliation(affiliationId);
    if (!existing) {
      throw new Error(`Farmer affiliation record not found: ${affiliationId}`);
    }

    const now = new Date().toISOString();
    const updated = await cooperativeStore.updateAffiliation(affiliationId, {
      status: "active",
      verifiedBy: officerId,
      verifiedAt: now,
      notes: notes || "Affiliation credentials and EUDR canopy verified by cooperative officer",
    });

    await cooperativeStore.appendAffiliationHistory({
      id: `affhist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      affiliationId,
      cooperativeId: existing.cooperativeId,
      farmerId: existing.farmerId,
      farmId: existing.farmId,
      action: "verified",
      previousStatus: existing.status,
      newStatus: "active",
      changedBy: officerId,
      reason: notes || "Farmer affiliation approved and verified",
      timestamp: now,
    });

    // Update farmerCount on organization
    const affiliations = await cooperativeStore.listAffiliationsByCooperative(existing.cooperativeId);
    await cooperativeStore.updateOrganization(existing.cooperativeId, {
      farmerCount: affiliations.filter((a) => a.status === "active").length,
    });

    return updated!;
  }

  async updateAffiliationStatus(
    affiliationId: string,
    newStatus: AffiliationStatus,
    changedBy: string,
    reason?: string
  ): Promise<CooperativeFarmerAffiliation> {
    const existing = await cooperativeStore.getAffiliation(affiliationId);
    if (!existing) {
      throw new Error(`Farmer affiliation record not found: ${affiliationId}`);
    }

    const previousStatus = existing.status;
    const now = new Date().toISOString();

    const updates: Partial<CooperativeFarmerAffiliation> = {
      status: newStatus,
      statusReason: reason,
      updatedAt: now,
    };

    if (newStatus === "ended") {
      updates.terminationDate = now;
    }

    const updated = await cooperativeStore.updateAffiliation(affiliationId, updates);

    // Preserve historical log
    await cooperativeStore.appendAffiliationHistory({
      id: `affhist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      affiliationId,
      cooperativeId: existing.cooperativeId,
      farmerId: existing.farmerId,
      farmId: existing.farmId,
      action:
        newStatus === "suspended"
          ? "suspended"
          : newStatus === "ended"
          ? "terminated"
          : "reinstated",
      previousStatus,
      newStatus,
      changedBy,
      reason: reason || `Status changed from ${previousStatus} to ${newStatus}`,
      timestamp: now,
    });

    const affiliations = await cooperativeStore.listAffiliationsByCooperative(existing.cooperativeId);
    await cooperativeStore.updateOrganization(existing.cooperativeId, {
      farmerCount: affiliations.filter((a) => a.status === "active").length,
    });

    return updated!;
  }

  async listAffiliatedFarmers(
    cooperativeId: string,
    statusFilter?: string
  ): Promise<CooperativeFarmerAffiliation[]> {
    return await cooperativeStore.listAffiliationsByCooperative(cooperativeId, statusFilter);
  }

  async getAffiliationHistory(
    cooperativeId: string
  ): Promise<CooperativeAffiliationHistoryRecord[]> {
    return await cooperativeStore.getAffiliationHistory(cooperativeId);
  }

  // ==========================================
  // 5. COOPERATIVE CERTIFICATE-RELATED OPERATIONS
  // ==========================================

  /**
   * Approved Workflow 1:
   * Endorse/Verify member farmer EUDR authenticity certificate
   */
  async endorseFarmEudrCertificate(data: {
    cooperativeId: string;
    officerId: string;
    farmId: string;
    farmerId: string;
    farmerName: string;
    farmAuditCertificateNumber?: string;
    originCorridor?: string;
    notes?: string;
  }): Promise<CooperativeCertificate> {
    const coop = await cooperativeStore.getOrganization(data.cooperativeId);
    if (!coop) throw new Error(`Cooperative not found: ${data.cooperativeId}`);

    const officer = await cooperativeStore.getProfile(data.officerId);
    const officerName = officer?.fullName || "Cooperative Quality Officer";

    const certNumber = `CERT-COOP-EUDR-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;
    const now = new Date().toISOString();

    const certificate: CooperativeCertificate = {
      id: `cert_coop_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      certificateNumber: certNumber,
      type: "farm_eudr_endorsement",
      cooperativeId: coop.id,
      cooperativeName: coop.name,
      issuedByOfficerId: data.officerId,
      issuedByOfficerName: officerName,
      farmId: data.farmId,
      farmerId: data.farmerId,
      farmerName: data.farmerName,
      originCorridor: data.originCorridor || coop.operatingRegions[0] || "Cross River State Corridor",
      eudrComplianceVerified: true,
      verificationHash: `SHA256:${Math.random().toString(36).substring(2, 10)}${Date.now()}`,
      status: "valid",
      issuedAt: now,
      metadata: {
        farmAuditCertificateNumber: data.farmAuditCertificateNumber,
        notes: data.notes,
      },
    };

    return await cooperativeStore.saveCertificate(certificate);
  }

  /**
   * Approved Workflow 2:
   * Issue Cooperative Origin & EUDR Batch Declaration
   */
  async issueCooperativeOriginDeclaration(data: {
    cooperativeId: string;
    officerId: string;
    batchCode: string;
    quantityKg: number;
    farmId: string;
    farmerId: string;
    farmerName: string;
    originCorridor?: string;
  }): Promise<CooperativeCertificate> {
    const coop = await cooperativeStore.getOrganization(data.cooperativeId);
    if (!coop) throw new Error(`Cooperative not found: ${data.cooperativeId}`);

    const officer = await cooperativeStore.getProfile(data.officerId);
    const officerName = officer?.fullName || "Cooperative Delegate";

    // Read configured cooperative levy fee from Administrator module
    const feeConfig = await adminStore.getFeeConfig("FEE_COOPERATIVE_LEVY");
    let feeAmount = 0;
    if (feeConfig && feeConfig.isActive) {
      if (feeConfig.feeType === "per_kg_naira") {
        feeAmount = data.quantityKg * feeConfig.rate;
      } else if (feeConfig.feeType === "flat_naira") {
        feeAmount = feeConfig.rate;
      }
    }

    const certNumber = `CERT-COOP-ORIGIN-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;
    const now = new Date().toISOString();

    const certificate: CooperativeCertificate = {
      id: `cert_coop_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      certificateNumber: certNumber,
      type: "cooperative_origin_declaration",
      cooperativeId: coop.id,
      cooperativeName: coop.name,
      issuedByOfficerId: data.officerId,
      issuedByOfficerName: officerName,
      batchCode: data.batchCode,
      quantityKg: data.quantityKg,
      farmId: data.farmId,
      farmerId: data.farmerId,
      farmerName: data.farmerName,
      originCorridor: data.originCorridor || "Southwest Cameroon / Cross River Corridor",
      eudrComplianceVerified: true,
      feeConfigIdApplied: feeConfig?.id,
      feeCodeApplied: feeConfig?.feeCode,
      feeAmountPaid: feeAmount,
      verificationHash: `SHA256:${Math.random().toString(36).substring(2, 10)}${Date.now()}`,
      status: "valid",
      issuedAt: now,
    };

    return await cooperativeStore.saveCertificate(certificate);
  }

  /**
   * Approved Workflow 3:
   * Cross River State Full Trace Certificate request & bulk aggregation seal
   */
  async requestCrossRiverFullTraceCertificate(data: {
    cooperativeId: string;
    officerId: string;
    batchCode: string;
    totalLotsCount: number;
    quantityKg: number;
    originCorridor: string;
    destinationWarehouseOrAgent: string;
  }): Promise<CooperativeCertificate> {
    const coop = await cooperativeStore.getOrganization(data.cooperativeId);
    if (!coop) throw new Error(`Cooperative not found: ${data.cooperativeId}`);

    const officer = await cooperativeStore.getProfile(data.officerId);
    const officerName = officer?.fullName || "Cooperative Secretary";

    // Read dynamic EUDR certification fee from Administrator module
    const feeConfig = await adminStore.getFeeConfig("FEE_EUDR_AUDIT");
    let calculatedFee = 0;
    if (feeConfig && feeConfig.isActive) {
      if (feeConfig.feeType === "percentage") {
        // Assume baseline market rate 1800 NGN/kg
        const baselineValue = data.quantityKg * 1800;
        calculatedFee = baselineValue * (feeConfig.rate / 100);
      } else if (feeConfig.feeType === "flat_naira") {
        calculatedFee = feeConfig.rate;
      }
    }

    const certNumber = `CERT-CRS-FULLTRACE-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;
    const now = new Date().toISOString();

    const certificate: CooperativeCertificate = {
      id: `cert_coop_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      certificateNumber: certNumber,
      type: "cross_river_full_trace_request",
      cooperativeId: coop.id,
      cooperativeName: coop.name,
      issuedByOfficerId: data.officerId,
      issuedByOfficerName: officerName,
      batchCode: data.batchCode,
      totalLotsCount: data.totalLotsCount,
      quantityKg: data.quantityKg,
      originCorridor: data.originCorridor,
      eudrComplianceVerified: true,
      feeConfigIdApplied: feeConfig?.id,
      feeCodeApplied: feeConfig?.feeCode,
      feeAmountPaid: calculatedFee,
      verificationHash: `SHA256:${Math.random().toString(36).substring(2, 10)}${Date.now()}`,
      status: "valid",
      issuedAt: now,
      metadata: {
        destinationWarehouseOrAgent: data.destinationWarehouseOrAgent,
        corridorValidation: "Cross River State EUDR Full Trace Corridor Protocol Compliant",
      },
    };

    return await cooperativeStore.saveCertificate(certificate);
  }

  async verifyCertificate(
    idOrNumber: string
  ): Promise<{ valid: boolean; certificate?: CooperativeCertificate; message: string }> {
    const cert = await cooperativeStore.getCertificate(idOrNumber);
    if (!cert) {
      return { valid: false, message: "Certificate not found in registry." };
    }

    if (cert.status !== "valid") {
      return {
        valid: false,
        certificate: cert,
        message: `Certificate is currently ${cert.status}: ${cert.statusReason || "Non-operational"}`,
      };
    }

    return {
      valid: true,
      certificate: cert,
      message: `Certificate ${cert.certificateNumber} is authentic, valid, and registered to ${cert.cooperativeName}.`,
    };
  }

  async revokeCertificate(
    idOrNumber: string,
    reason: string,
    revokedBy: string
  ): Promise<CooperativeCertificate> {
    const existing = await cooperativeStore.getCertificate(idOrNumber);
    if (!existing) throw new Error(`Certificate not found: ${idOrNumber}`);

    const updated = await cooperativeStore.updateCertificate(existing.id, {
      status: "revoked",
      statusReason: `Revoked by ${revokedBy}: ${reason}`,
    });

    return updated!;
  }

  async listCertificates(cooperativeId: string): Promise<CooperativeCertificate[]> {
    return await cooperativeStore.listCertificatesByCooperative(cooperativeId);
  }

  // ==========================================
  // 6. OPERATIONAL RECORDS: COCOA INTAKE & DISPATCH
  // ==========================================

  async recordIntakeBatch(data: {
    cooperativeId: string;
    officerId: string;
    farmerId: string;
    farmerName: string;
    farmId: string;
    farmName: string;
    quantityKg: number;
    qualityGrade?: QualityGrade;
    moistureContentPercent?: number;
    eudrCompliant?: boolean;
    farmAuditCertificateNumber?: string;
    unitPricePerKg: number;
    currency?: "NGN" | "XAF" | "USD";
    paymentReference?: string;
  }): Promise<CooperativeIntakeBatch> {
    const coop = await cooperativeStore.getOrganization(data.cooperativeId);
    if (!coop) throw new Error(`Cooperative not found: ${data.cooperativeId}`);

    const officer = await cooperativeStore.getProfile(data.officerId);
    const officerName = officer?.fullName || "Cooperative Depot Officer";

    // Dynamic Fee Integration: Read community development levy from Administrator config
    const feeConfig = await adminStore.getFeeConfig("FEE_COOPERATIVE_LEVY");
    const levyRate = feeConfig && feeConfig.isActive && feeConfig.rate ? feeConfig.rate : 15;

    const grossAmount = data.quantityKg * data.unitPricePerKg;
    const levyAmount = data.quantityKg * levyRate;
    const netPayout = Math.max(0, grossAmount - levyAmount);

    const intakeId = `intake_coop_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const batchNumber = `COOP-INTAKE-${Date.now().toString().slice(-4)}-${Math.floor(100 + Math.random() * 900)}`;
    const now = new Date().toISOString();

    const batch: CooperativeIntakeBatch = {
      id: intakeId,
      intakeBatchNumber: batchNumber,
      cooperativeId: coop.id,
      cooperativeName: coop.name,
      receivedByOfficerId: data.officerId,
      receivedByOfficerName: officerName,
      farmerId: data.farmerId,
      farmerName: data.farmerName.trim(),
      farmId: data.farmId,
      farmName: data.farmName.trim(),
      quantityKg: data.quantityKg,
      qualityGrade: data.qualityGrade || "Grade 1",
      moistureContentPercent: data.moistureContentPercent ?? 7.4,
      eudrCompliant: data.eudrCompliant ?? true,
      farmAuditCertificateNumber: data.farmAuditCertificateNumber,
      unitPricePerKg: data.unitPricePerKg,
      currency: data.currency || "NGN",
      grossAmount,
      levyFeeRatePerKg: levyRate,
      levyAmountDeducted: levyAmount,
      netPayoutToFarmer: netPayout,
      paymentStatus: data.paymentReference ? "paid" : "pending",
      paymentReference: data.paymentReference,
      intakeDate: now,
      status: "stored_in_depot",
      createdAt: now,
      updatedAt: now,
    };

    return await cooperativeStore.saveIntakeBatch(batch);
  }

  async dispatchIntakeBatch(
    intakeId: string,
    target: "agent" | "warehouse",
    dispatchReference: string
  ): Promise<CooperativeIntakeBatch> {
    const existing = await cooperativeStore.getIntakeBatch(intakeId);
    if (!existing) throw new Error(`Intake batch not found: ${intakeId}`);

    const newStatus =
      target === "agent" ? "handed_over_to_agent" : "transferred_to_warehouse";

    const updated = await cooperativeStore.updateIntakeBatch(intakeId, {
      status: newStatus,
      dispatchReference,
    });

    return updated!;
  }

  async listIntakes(cooperativeId: string): Promise<CooperativeIntakeBatch[]> {
    return await cooperativeStore.listIntakesByCooperative(cooperativeId);
  }

  // ==========================================
  // 7. DASHBOARD DATA & OPERATIONAL RECORDS
  // ==========================================

  async getDashboardData(cooperativeIdOrUserId: string): Promise<CooperativeDashboardData> {
    // 1. Resolve organization
    let org = await cooperativeStore.getOrganization(cooperativeIdOrUserId);
    let profile: CooperativeProfile | null = null;

    if (!org) {
      // Check if it's a profile/user ID
      profile = await cooperativeStore.getProfile(cooperativeIdOrUserId);
      if (profile && profile.cooperativeId) {
        org = await cooperativeStore.getOrganization(profile.cooperativeId);
      }
    }

    const cooperativeId = org ? org.id : cooperativeIdOrUserId;

    // 2. Fetch all related collections
    const affiliations = await cooperativeStore.listAffiliationsByCooperative(cooperativeId);
    const intakes = await cooperativeStore.listIntakesByCooperative(cooperativeId);
    const certificates = await cooperativeStore.listCertificatesByCooperative(cooperativeId);
    const subordinates = await cooperativeStore.listSubordinateRelationships(cooperativeId);

    // 3. Aggregate metrics
    const activeAffiliations = affiliations.filter((a) => a.status === "active");
    const uniqueFarmers = new Set(activeAffiliations.map((a) => a.farmerId)).size;
    const totalHectares = activeAffiliations.reduce((sum, a) => sum + (a.sizeHectares || 0), 0);
    const totalEstimatedYield = activeAffiliations.reduce(
      (sum, a) => sum + (a.estimatedAnnualYieldKg || 0),
      0
    );
    const eudrCompliantCount = activeAffiliations.filter((a) => a.eudrCompliant).length;
    const eudrPercentage =
      activeAffiliations.length > 0
        ? Math.round((eudrCompliantCount / activeAffiliations.length) * 100)
        : 100;

    const totalIntakeRecordedKg = intakes.reduce((sum, i) => sum + (i.quantityKg || 0), 0);
    const totalLevyCollected = intakes.reduce(
      (sum, i) => sum + (i.levyAmountDeducted || 0),
      0
    );
    const activeCerts = certificates.filter((c) => c.status === "valid").length;

    const summary: CooperativeDashboardSummary = {
      totalMemberFarmers: uniqueFarmers || (org?.farmerCount ?? 0),
      totalAffiliatedFarms: activeAffiliations.length,
      totalHectaresManaged: Math.round(totalHectares * 10) / 10,
      totalEstimatedYieldKg: Math.round(totalEstimatedYield),
      totalIntakeRecordedKg,
      eudrCompliantFarmsCount: eudrCompliantCount,
      eudrCompliancePercentage: eudrPercentage,
      totalLevyCollectedAmount: totalLevyCollected,
      activeCertificatesCount: activeCerts,
      subordinateSocietiesCount: subordinates.filter((s) => s.relationshipStatus === "active").length,
    };

    return {
      cooperative: org,
      profile,
      summary,
      recentAffiliations: affiliations.slice(0, 10),
      recentIntakes: intakes.slice(0, 10),
      activeCertificates: certificates.slice(0, 10),
      subordinateSocieties: subordinates,
    };
  }
}

export const cooperativeService = new CooperativeService();
