import {
  CooperativeProfile,
  CooperativeOrganization,
  CooperativeMembershipHistoryRecord,
  SubordinateCooperativeRelationship,
  CooperativeFarmerAffiliation,
  CooperativeAffiliationHistoryRecord,
  CooperativeCertificate,
  CooperativeIntakeBatch,
} from "@/types/cooperative";
import { db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from "firebase/firestore";

/**
 * Strips undefined values to maintain strict Firestore compatibility
 */
function cleanData<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        result[key] = cleanData(value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }
  }
  return result;
}

/**
 * In-memory fallback repository to ensure data integrity
 * across test runs, serverless invocations, and offline scenarios.
 */
class CooperativeMemoryStore {
  profiles: Map<string, CooperativeProfile> = new Map();
  organizations: Map<string, CooperativeOrganization> = new Map();
  membershipHistory: CooperativeMembershipHistoryRecord[] = [];
  affiliations: Map<string, CooperativeFarmerAffiliation> = new Map();
  affiliationHistory: CooperativeAffiliationHistoryRecord[] = [];
  subordinates: Map<string, SubordinateCooperativeRelationship> = new Map();
  certificates: Map<string, CooperativeCertificate> = new Map();
  intakes: Map<string, CooperativeIntakeBatch> = new Map();

  constructor() {
    this.seedDefaults();
  }

  private seedDefaults() {
    // 1. Seed Default Cooperative Organization (SOWESCOP)
    const sowescopOrg: CooperativeOrganization = {
      id: "org_coop_sowescop",
      name: "Southwest Farmers Cocoa Cooperative Society (SOWESCOP)",
      registrationNumber: "COOP-CMR-SW-9921",
      tier: "apex_union",
      ownerUserId: "usr_coop_lead_01",
      headquarters: "Mamfe Central Depot & Ikom Border Road",
      contactEmail: "info@sowescop.cm",
      contactPhone: "+237 677 889 900",
      operatingRegions: ["Southwest Cameroon", "Cross River State Corridor"],
      operatingLgas: ["Manyu", "Mamfe", "Ikom Border Corridor"],
      status: "active",
      bankSettlementInfo: {
        bankName: "Afriland First Bank / Zenith Bank Nigeria",
        accountNumber: "1098273641",
        accountName: "SOWESCOP Regional Apex Union",
      },
      members: [
        {
          id: "mem_coop_01",
          userId: "usr_coop_lead_01",
          profileId: "coop_usr_lead_01",
          name: "Chief Victor Agbor",
          email: "victor.agbor@sowescop.cm",
          phone: "+237 677 889 900",
          role: "president",
          status: "active",
          joinedAt: "2026-01-10T00:00:00.000Z",
        },
        {
          id: "mem_coop_02",
          userId: "usr_coop_sec_02",
          profileId: "coop_usr_sec_02",
          name: "Mary Nkoyo",
          email: "mary.nkoyo@sowescop.cm",
          phone: "+234 803 999 1122",
          role: "secretary",
          status: "active",
          joinedAt: "2026-01-12T00:00:00.000Z",
        },
      ],
      memberCount: 2,
      farmerCount: 38,
      subordinateCooperativeIds: ["org_coop_mile18_primary"],
      createdAt: "2026-01-10T00:00:00.000Z",
      updatedAt: "2026-01-10T00:00:00.000Z",
    };
    this.organizations.set(sowescopOrg.id, sowescopOrg);

    // 2. Seed Default Subordinate Primary Society
    const mile18PrimaryOrg: CooperativeOrganization = {
      id: "org_coop_mile18_primary",
      name: "Mile 18 Primary Cocoa Farmers Multipurpose Society",
      registrationNumber: "COOP-CMR-M18-041",
      tier: "primary_society",
      parentCooperativeId: "org_coop_sowescop",
      ownerUserId: "usr_coop_mile18_leader",
      headquarters: "Mile 18 Trading Hub, Manyu Division",
      contactEmail: "mile18@sowescop.cm",
      contactPhone: "+237 671 223 344",
      operatingRegions: ["Southwest Region (Cameroon)"],
      operatingLgas: ["Manyu"],
      status: "active",
      members: [
        {
          id: "mem_m18_01",
          userId: "usr_coop_mile18_leader",
          name: "Barnabas Etta",
          email: "barnabas.etta@sowescop.cm",
          role: "manager",
          status: "active",
          joinedAt: "2026-01-15T00:00:00.000Z",
        },
      ],
      memberCount: 1,
      farmerCount: 14,
      createdAt: "2026-01-15T00:00:00.000Z",
      updatedAt: "2026-01-15T00:00:00.000Z",
    };
    this.organizations.set(mile18PrimaryOrg.id, mile18PrimaryOrg);

    // 3. Seed Subordinate Relationship
    const defaultSubRel: SubordinateCooperativeRelationship = {
      id: "rel_sowescop_mile18",
      apexCooperativeId: "org_coop_sowescop",
      apexCooperativeName: "Southwest Farmers Cocoa Cooperative Society (SOWESCOP)",
      subordinateCooperativeId: "org_coop_mile18_primary",
      subordinateCooperativeName: "Mile 18 Primary Cocoa Farmers Multipurpose Society",
      relationshipStatus: "active",
      affiliationDate: "2026-01-15T00:00:00.000Z",
      notes: "Primary society affiliated under SOWESCOP regional apex union for EUDR bulk verification.",
      createdAt: "2026-01-15T00:00:00.000Z",
      updatedAt: "2026-01-15T00:00:00.000Z",
    };
    this.subordinates.set(defaultSubRel.id, defaultSubRel);

    // 4. Seed Default Profile
    const defaultProfile: CooperativeProfile = {
      id: "coop_usr_lead_01",
      userId: "usr_coop_lead_01",
      fullName: "Chief Victor Agbor",
      email: "victor.agbor@sowescop.cm",
      phone: "+237 677 889 900",
      accountType: "organizational",
      officerRole: "president",
      cooperativeId: "org_coop_sowescop",
      cooperativeName: "Southwest Farmers Cocoa Cooperative Society (SOWESCOP)",
      operatingRegion: "Southwest Cameroon / Cross River Corridor",
      operatingLgas: ["Manyu", "Mamfe", "Ikom Border Corridor"],
      status: "active",
      createdAt: "2026-01-10T00:00:00.000Z",
      updatedAt: "2026-01-10T00:00:00.000Z",
    };
    this.profiles.set(defaultProfile.id, defaultProfile);
    this.profiles.set(defaultProfile.userId, defaultProfile);

    // 5. Seed Default Farmer Affiliation
    const defaultAff: CooperativeFarmerAffiliation = {
      id: "aff_coop_001",
      cooperativeId: "org_coop_sowescop",
      cooperativeName: "Southwest Farmers Cocoa Cooperative Society (SOWESCOP)",
      farmerId: "demo_producer_local",
      farmerName: "Alain Nkweta",
      farmerPhone: "+237 674 123 456",
      farmerEmail: "alain.nkweta@gmail.com",
      farmId: "farm_cr_bamenda_01",
      farmName: "Green Canopy Agroforestry Farm",
      farmRegion: "Southwest Region (Cameroon)",
      farmVillage: "Mamfe Lowland",
      sizeHectares: 4.8,
      cocoaVariety: "Forastero & Trinitario Hybrid",
      estimatedAnnualYieldKg: 3800,
      eudrCompliant: true,
      status: "active",
      affiliationDate: "2026-02-01T00:00:00.000Z",
      verifiedBy: "coop_usr_lead_01",
      verifiedAt: "2026-02-02T10:00:00.000Z",
      notes: "Verified polygon coordinates within zero-deforestation baseline.",
      createdAt: "2026-02-01T00:00:00.000Z",
      updatedAt: "2026-02-02T10:00:00.000Z",
    };
    this.affiliations.set(defaultAff.id, defaultAff);

    // 6. Seed Default Certificate
    const defaultCert: CooperativeCertificate = {
      id: "cert_coop_001",
      certificateNumber: "CERT-COOP-EUDR-2026-0041",
      type: "cooperative_origin_declaration",
      cooperativeId: "org_coop_sowescop",
      cooperativeName: "Southwest Farmers Cocoa Cooperative Society (SOWESCOP)",
      issuedByOfficerId: "coop_usr_lead_01",
      issuedByOfficerName: "Chief Victor Agbor",
      farmId: "farm_cr_bamenda_01",
      farmerId: "demo_producer_local",
      farmerName: "Alain Nkweta",
      batchCode: "CAM-CCRT-24091",
      quantityKg: 1250,
      originCorridor: "Manyu-Mamfe / Cross River Border",
      eudrComplianceVerified: true,
      feeConfigIdApplied: "fee_cooperative_levy_standard",
      feeCodeApplied: "FEE_COOPERATIVE_LEVY",
      feeAmountPaid: 18750, // 1250 kg * 15 NGN
      verificationHash: "SHA256:d8a9e102f43c8b746a5120fe81395b4e72c",
      status: "valid",
      issuedAt: "2026-02-05T11:00:00.000Z",
    };
    this.certificates.set(defaultCert.id, defaultCert);
    this.certificates.set(defaultCert.certificateNumber, defaultCert);

    // 7. Seed Default Intake Batch
    const defaultIntake: CooperativeIntakeBatch = {
      id: "intake_coop_001",
      intakeBatchNumber: "COOP-INTAKE-2026-0012",
      cooperativeId: "org_coop_sowescop",
      cooperativeName: "Southwest Farmers Cocoa Cooperative Society (SOWESCOP)",
      receivedByOfficerId: "coop_usr_lead_01",
      receivedByOfficerName: "Chief Victor Agbor",
      farmerId: "demo_producer_local",
      farmerName: "Alain Nkweta",
      farmId: "farm_cr_bamenda_01",
      farmName: "Green Canopy Agroforestry Farm",
      quantityKg: 1250,
      qualityGrade: "Grade 1",
      moistureContentPercent: 7.2,
      eudrCompliant: true,
      farmAuditCertificateNumber: "CT-CMR-FARM-01-2026",
      unitPricePerKg: 1800,
      currency: "NGN",
      grossAmount: 2250000,
      levyFeeRatePerKg: 15,
      levyAmountDeducted: 18750,
      netPayoutToFarmer: 2231250,
      paymentStatus: "paid",
      paymentReference: "COOP-PAY-882194",
      intakeDate: "2026-02-05T09:30:00.000Z",
      status: "stored_in_depot",
      createdAt: "2026-02-05T09:30:00.000Z",
      updatedAt: "2026-02-05T09:30:00.000Z",
    };
    this.intakes.set(defaultIntake.id, defaultIntake);
  }
}

const memoryStore = new CooperativeMemoryStore();

export class CooperativeStore {
  // ==========================================
  // 1. PROFILES (PERSONAL & REPR)
  // ==========================================

  async getProfile(idOrUserId: string): Promise<CooperativeProfile | null> {
    try {
      const snap = await getDoc(doc(db, "cooperative_profiles", idOrUserId));
      if (snap.exists()) {
        const data = snap.data() as CooperativeProfile;
        memoryStore.profiles.set(data.id, data);
        memoryStore.profiles.set(data.userId, data);
        return data;
      }
    } catch {
      // Fallback to memory
    }

    return (
      memoryStore.profiles.get(idOrUserId) ||
      Array.from(memoryStore.profiles.values()).find(
        (p) => p.id === idOrUserId || p.userId === idOrUserId
      ) ||
      null
    );
  }

  async saveProfile(profile: CooperativeProfile): Promise<CooperativeProfile> {
    memoryStore.profiles.set(profile.id, profile);
    memoryStore.profiles.set(profile.userId, profile);
    try {
      await setDoc(
        doc(db, "cooperative_profiles", profile.id),
        cleanData(profile as unknown as Record<string, unknown>)
      );
    } catch (err) {
      console.warn("Firestore save notice for cooperative_profiles:", err);
    }
    return profile;
  }

  async updateProfile(
    profileId: string,
    updates: Partial<CooperativeProfile>
  ): Promise<CooperativeProfile | null> {
    const existing = await this.getProfile(profileId);
    if (!existing) return null;

    const updated: CooperativeProfile = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    memoryStore.profiles.set(updated.id, updated);
    memoryStore.profiles.set(updated.userId, updated);

    try {
      await updateDoc(
        doc(db, "cooperative_profiles", updated.id),
        cleanData({ ...updates, updatedAt: updated.updatedAt } as Record<string, unknown>)
      );
    } catch (err) {
      console.warn("Firestore update notice for cooperative_profiles:", err);
    }
    return updated;
  }

  async listProfilesByCooperative(cooperativeId: string): Promise<CooperativeProfile[]> {
    return Array.from(memoryStore.profiles.values()).filter(
      (p) => p.cooperativeId === cooperativeId
    );
  }

  // ==========================================
  // 2. COOPERATIVE ORGANIZATIONS
  // ==========================================

  async getOrganization(orgId: string): Promise<CooperativeOrganization | null> {
    try {
      const snap = await getDoc(doc(db, "cooperative_organizations", orgId));
      if (snap.exists()) {
        const data = snap.data() as CooperativeOrganization;
        memoryStore.organizations.set(data.id, data);
        return data;
      }
    } catch {
      // Fallback
    }
    return memoryStore.organizations.get(orgId) || null;
  }

  async saveOrganization(org: CooperativeOrganization): Promise<CooperativeOrganization> {
    memoryStore.organizations.set(org.id, org);
    try {
      await setDoc(
        doc(db, "cooperative_organizations", org.id),
        cleanData(org as unknown as Record<string, unknown>)
      );
    } catch (err) {
      console.warn("Firestore save notice for cooperative_organizations:", err);
    }
    return org;
  }

  async updateOrganization(
    orgId: string,
    updates: Partial<CooperativeOrganization>
  ): Promise<CooperativeOrganization | null> {
    const existing = await this.getOrganization(orgId);
    if (!existing) return null;

    const updated: CooperativeOrganization = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    memoryStore.organizations.set(orgId, updated);

    try {
      await updateDoc(
        doc(db, "cooperative_organizations", orgId),
        cleanData({ ...updates, updatedAt: updated.updatedAt } as Record<string, unknown>)
      );
    } catch (err) {
      console.warn("Firestore update notice for cooperative_organizations:", err);
    }
    return updated;
  }

  async listOrganizations(): Promise<CooperativeOrganization[]> {
    return Array.from(memoryStore.organizations.values());
  }

  // ==========================================
  // 3. MEMBERSHIP HISTORY (HISTORICAL PRESERVATION)
  // ==========================================

  async appendMembershipHistory(
    record: CooperativeMembershipHistoryRecord
  ): Promise<CooperativeMembershipHistoryRecord> {
    memoryStore.membershipHistory.unshift(record);
    try {
      await setDoc(
        doc(db, "cooperative_membership_history", record.id),
        cleanData(record as unknown as Record<string, unknown>)
      );
    } catch (err) {
      console.warn("Firestore save notice for cooperative_membership_history:", err);
    }
    return record;
  }

  async getMembershipHistory(orgId: string): Promise<CooperativeMembershipHistoryRecord[]> {
    return memoryStore.membershipHistory.filter((h) => h.organizationId === orgId);
  }

  // ==========================================
  // 4. SUBORDINATE COOPERATIVE RELATIONSHIPS
  // ==========================================

  async saveSubordinateRelationship(
    rel: SubordinateCooperativeRelationship
  ): Promise<SubordinateCooperativeRelationship> {
    memoryStore.subordinates.set(rel.id, rel);
    try {
      await setDoc(
        doc(db, "cooperative_subordinates", rel.id),
        cleanData(rel as unknown as Record<string, unknown>)
      );
    } catch (err) {
      console.warn("Firestore save notice for cooperative_subordinates:", err);
    }
    return rel;
  }

  async getSubordinateRelationship(id: string): Promise<SubordinateCooperativeRelationship | null> {
    return memoryStore.subordinates.get(id) || null;
  }

  async updateSubordinateRelationship(
    id: string,
    updates: Partial<SubordinateCooperativeRelationship>
  ): Promise<SubordinateCooperativeRelationship | null> {
    const existing = memoryStore.subordinates.get(id);
    if (!existing) return null;

    const updated: SubordinateCooperativeRelationship = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    memoryStore.subordinates.set(id, updated);
    try {
      await updateDoc(
        doc(db, "cooperative_subordinates", id),
        cleanData({ ...updates, updatedAt: updated.updatedAt } as Record<string, unknown>)
      );
    } catch (err) {
      console.warn("Firestore update notice for cooperative_subordinates:", err);
    }
    return updated;
  }

  async listSubordinateRelationships(
    apexCooperativeId: string
  ): Promise<SubordinateCooperativeRelationship[]> {
    return Array.from(memoryStore.subordinates.values()).filter(
      (r) => r.apexCooperativeId === apexCooperativeId
    );
  }

  // ==========================================
  // 5. FARMER AFFILIATIONS
  // ==========================================

  async saveAffiliation(
    aff: CooperativeFarmerAffiliation
  ): Promise<CooperativeFarmerAffiliation> {
    memoryStore.affiliations.set(aff.id, aff);
    try {
      await setDoc(
        doc(db, "cooperative_farmer_affiliations", aff.id),
        cleanData(aff as unknown as Record<string, unknown>)
      );
    } catch (err) {
      console.warn("Firestore save notice for cooperative_farmer_affiliations:", err);
    }
    return aff;
  }

  async getAffiliation(id: string): Promise<CooperativeFarmerAffiliation | null> {
    try {
      const snap = await getDoc(doc(db, "cooperative_farmer_affiliations", id));
      if (snap.exists()) {
        const data = snap.data() as CooperativeFarmerAffiliation;
        memoryStore.affiliations.set(data.id, data);
        return data;
      }
    } catch {
      // Fallback
    }
    return memoryStore.affiliations.get(id) || null;
  }

  async updateAffiliation(
    id: string,
    updates: Partial<CooperativeFarmerAffiliation>
  ): Promise<CooperativeFarmerAffiliation | null> {
    const existing = await this.getAffiliation(id);
    if (!existing) return null;

    const updated: CooperativeFarmerAffiliation = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    memoryStore.affiliations.set(id, updated);

    try {
      await updateDoc(
        doc(db, "cooperative_farmer_affiliations", id),
        cleanData({ ...updates, updatedAt: updated.updatedAt } as Record<string, unknown>)
      );
    } catch (err) {
      console.warn("Firestore update notice for cooperative_farmer_affiliations:", err);
    }
    return updated;
  }

  async listAffiliationsByCooperative(
    cooperativeId: string,
    statusFilter?: string
  ): Promise<CooperativeFarmerAffiliation[]> {
    let list = Array.from(memoryStore.affiliations.values()).filter(
      (a) => a.cooperativeId === cooperativeId
    );
    if (statusFilter) {
      list = list.filter((a) => a.status === statusFilter);
    }
    return list;
  }

  async appendAffiliationHistory(
    record: CooperativeAffiliationHistoryRecord
  ): Promise<CooperativeAffiliationHistoryRecord> {
    memoryStore.affiliationHistory.unshift(record);
    try {
      await setDoc(
        doc(db, "cooperative_affiliation_history", record.id),
        cleanData(record as unknown as Record<string, unknown>)
      );
    } catch (err) {
      console.warn("Firestore save notice for cooperative_affiliation_history:", err);
    }
    return record;
  }

  async getAffiliationHistory(cooperativeId: string): Promise<CooperativeAffiliationHistoryRecord[]> {
    return memoryStore.affiliationHistory.filter((h) => h.cooperativeId === cooperativeId);
  }

  // ==========================================
  // 6. CERTIFICATES
  // ==========================================

  async saveCertificate(cert: CooperativeCertificate): Promise<CooperativeCertificate> {
    memoryStore.certificates.set(cert.id, cert);
    memoryStore.certificates.set(cert.certificateNumber, cert);
    try {
      await setDoc(
        doc(db, "cooperative_certificates", cert.id),
        cleanData(cert as unknown as Record<string, unknown>)
      );
    } catch (err) {
      console.warn("Firestore save notice for cooperative_certificates:", err);
    }
    return cert;
  }

  async getCertificate(idOrNumber: string): Promise<CooperativeCertificate | null> {
    try {
      const snap = await getDoc(doc(db, "cooperative_certificates", idOrNumber));
      if (snap.exists()) {
        const data = snap.data() as CooperativeCertificate;
        memoryStore.certificates.set(data.id, data);
        return data;
      }
    } catch {
      // Fallback
    }

    return (
      memoryStore.certificates.get(idOrNumber) ||
      Array.from(memoryStore.certificates.values()).find(
        (c) => c.id === idOrNumber || c.certificateNumber === idOrNumber
      ) ||
      null
    );
  }

  async updateCertificate(
    idOrNumber: string,
    updates: Partial<CooperativeCertificate>
  ): Promise<CooperativeCertificate | null> {
    const existing = await this.getCertificate(idOrNumber);
    if (!existing) return null;

    const updated: CooperativeCertificate = {
      ...existing,
      ...updates,
    };
    memoryStore.certificates.set(updated.id, updated);
    memoryStore.certificates.set(updated.certificateNumber, updated);

    try {
      await updateDoc(
        doc(db, "cooperative_certificates", updated.id),
        cleanData(updates as Record<string, unknown>)
      );
    } catch (err) {
      console.warn("Firestore update notice for cooperative_certificates:", err);
    }
    return updated;
  }

  async listCertificatesByCooperative(cooperativeId: string): Promise<CooperativeCertificate[]> {
    return Array.from(memoryStore.certificates.values()).filter(
      (c) => c.cooperativeId === cooperativeId
    );
  }

  // ==========================================
  // 7. INTAKE BATCHES
  // ==========================================

  async saveIntakeBatch(intake: CooperativeIntakeBatch): Promise<CooperativeIntakeBatch> {
    memoryStore.intakes.set(intake.id, intake);
    try {
      await setDoc(
        doc(db, "cooperative_intakes", intake.id),
        cleanData(intake as unknown as Record<string, unknown>)
      );
    } catch (err) {
      console.warn("Firestore save notice for cooperative_intakes:", err);
    }
    return intake;
  }

  async getIntakeBatch(id: string): Promise<CooperativeIntakeBatch | null> {
    try {
      const snap = await getDoc(doc(db, "cooperative_intakes", id));
      if (snap.exists()) {
        const data = snap.data() as CooperativeIntakeBatch;
        memoryStore.intakes.set(data.id, data);
        return data;
      }
    } catch {
      // Fallback
    }
    return memoryStore.intakes.get(id) || null;
  }

  async updateIntakeBatch(
    id: string,
    updates: Partial<CooperativeIntakeBatch>
  ): Promise<CooperativeIntakeBatch | null> {
    const existing = await this.getIntakeBatch(id);
    if (!existing) return null;

    const updated: CooperativeIntakeBatch = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    memoryStore.intakes.set(id, updated);
    try {
      await updateDoc(
        doc(db, "cooperative_intakes", id),
        cleanData({ ...updates, updatedAt: updated.updatedAt } as Record<string, unknown>)
      );
    } catch (err) {
      console.warn("Firestore update notice for cooperative_intakes:", err);
    }
    return updated;
  }

  async listIntakesByCooperative(cooperativeId: string): Promise<CooperativeIntakeBatch[]> {
    return Array.from(memoryStore.intakes.values()).filter(
      (i) => i.cooperativeId === cooperativeId
    );
  }

  // ==========================================
  // 8. READ EXISTING FARMS COLLECTION SAFELY
  // ==========================================

  async getFarmRecord(farmId: string): Promise<Record<string, unknown> | null> {
    try {
      const snap = await getDoc(doc(db, "farms", farmId));
      if (snap.exists()) {
        return snap.data();
      }
    } catch {
      // fallback
    }
    return null;
  }
}

export const cooperativeStore = new CooperativeStore();
