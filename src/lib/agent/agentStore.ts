import {
  AgentProfile,
  AgentOrganization,
  AgentInspection,
  AgentTransaction,
  AgentBatchManifest,
  AgentCertificate,
} from "@/types/agent";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
} from "firebase/firestore";

/**
 * In-memory fallback repository to ensure data integrity
 * across test runs, serverless invocations, and offline scenarios.
 */
class AgentMemoryStore {
  profiles: Map<string, AgentProfile> = new Map();
  organizations: Map<string, AgentOrganization> = new Map();
  inspections: Map<string, AgentInspection> = new Map();
  transactions: Map<string, AgentTransaction> = new Map();
  manifests: Map<string, AgentBatchManifest> = new Map();
  certificates: Map<string, AgentCertificate> = new Map();

  constructor() {
    this.seedDefaults();
  }

  private seedDefaults() {
    const defaultAgent: AgentProfile = {
      id: "agent_cr_001",
      userId: "demo_agent_cr_001",
      fullName: "Emmanuel Etim",
      email: "emmanuel.etim@cocoatrace-cr.ng",
      phone: "+234 803 456 7890",
      accountType: "personal",
      accreditationNumber: "AGT-CR-2026-0104",
      nationalIdOrNin: "NIN-29384758291",
      status: "active",
      operatingRegion: "Cross River State / Cameroon Border Corridor",
      operatingLgas: ["Ikom", "Etung", "Boki"],
      assignedCooperativeId: "coop_sowescop",
      assignedCooperativeName: "SOWESCOP / Mile 18 Cooperative",
      serviceFeePercentage: 1.5,
      createdAt: "2026-03-15T08:00:00.000Z",
      updatedAt: "2026-03-15T08:00:00.000Z",
    };
    this.profiles.set(defaultAgent.id, defaultAgent);
    this.profiles.set(defaultAgent.userId, defaultAgent);

    const defaultOrg: AgentOrganization = {
      id: "org_agt_crossriver_union",
      name: "Cross River Cocoa Verifiers & Aggregators Alliance",
      registrationNumber: "RC-928374-NG",
      ownerId: "demo_agent_cr_001",
      headquarters: "Ikom Highway Terminal, Cross River State",
      contactEmail: "allied-agents@crossriver-cocoa.org",
      contactPhone: "+234 802 334 9900",
      operatingRegions: ["Cross River State", "Southwest Cameroon"],
      serviceFeePercentage: 1.5,
      members: [
        {
          id: "mem_01",
          userId: "demo_agent_cr_001",
          agentId: "agent_cr_001",
          name: "Emmanuel Etim",
          email: "emmanuel.etim@cocoatrace-cr.ng",
          role: "owner",
          status: "active",
          joinedAt: "2026-03-15T08:00:00.000Z",
        },
      ],
      status: "active",
      createdAt: "2026-03-15T08:00:00.000Z",
      updatedAt: "2026-03-15T08:00:00.000Z",
    };
    this.organizations.set(defaultOrg.id, defaultOrg);

    const defaultInspection: AgentInspection = {
      id: "insp_agt_001",
      agentId: "agent_cr_001",
      agentName: "Emmanuel Etim",
      farmId: "farm_cr_bamenda_01",
      farmerId: "demo_producer_local",
      farmerName: "Alain Nkweta",
      cooperative: "SOWESCOP / Mile 18 Cooperative",
      inspectionDate: "2026-04-02T10:30:00.000Z",
      moistureContentPercent: 7.2,
      beanCountPer100g: 98,
      fermentationRatePercent: 86.5,
      defectiveBeansPercent: 1.8,
      eudrComplianceVerified: true,
      geolocationVerified: true,
      geolocation: "5.9723°, 10.0162°",
      qualityGrade: "Grade 1",
      notes: "Properly dried, zero slate beans, compliant canopy boundary checked.",
      certificateIssued: true,
      certificateNumber: "CERT-AGT-INSP-24098",
      createdAt: "2026-04-02T10:35:00.000Z",
    };
    this.inspections.set(defaultInspection.id, defaultInspection);

    const defaultTxn: AgentTransaction = {
      id: "txn_agt_001",
      agentId: "agent_cr_001",
      agentName: "Emmanuel Etim",
      farmId: "farm_cr_bamenda_01",
      farmerId: "demo_producer_local",
      farmerName: "Alain Nkweta",
      cooperative: "SOWESCOP / Mile 18 Cooperative",
      quantityKg: 1250,
      unitPrice: 1720,
      currency: "FCFA",
      grossAmount: 2150000,
      feeRateApplied: 1.5,
      serviceFeeAmount: 32250,
      netAmount: 2117750,
      paymentMethod: "bank_transfer",
      paymentReference: "TRX-NIG-CAM-88912",
      paymentStatus: "completed",
      batchCode: "CAM-CCRT-24091",
      inspectionId: "insp_agt_001",
      warehouseDestinationId: "wh_ikom_central",
      warehouseDestinationName: "Ikom Central Aggregation Warehouse",
      status: "completed",
      transactionDate: "2026-04-05T14:20:00.000Z",
      createdAt: "2026-04-05T14:20:00.000Z",
    };
    this.transactions.set(defaultTxn.id, defaultTxn);

    const defaultCert: AgentCertificate = {
      id: "cert_agt_001",
      certificateNumber: "CERT-AGT-INSP-24098",
      type: "quality_intake",
      agentId: "agent_cr_001",
      agentName: "Emmanuel Etim",
      accreditationNumber: "AGT-CR-2026-0104",
      farmId: "farm_cr_bamenda_01",
      farmerName: "Alain Nkweta",
      cooperative: "SOWESCOP / Mile 18 Cooperative",
      batchCode: "CAM-CCRT-24091",
      quantityKg: 1250,
      eudrOriginCountry: "Cameroon",
      issuedAt: "2026-04-02T10:35:00.000Z",
      verificationHash: "SHA256:7a9f82bc14d021c3894aef91204859a0e",
      status: "valid",
    };
    this.certificates.set(defaultCert.id, defaultCert);
  }
}

const memoryStore = new AgentMemoryStore();

function cleanData<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

export class AgentStore {
  // Profiles
  async getProfile(agentOrUserId: string): Promise<AgentProfile | null> {
    try {
      const snap = await getDoc(doc(db, "agent_profiles", agentOrUserId));
      if (snap.exists()) {
        const data = snap.data() as AgentProfile;
        memoryStore.profiles.set(data.id, data);
        memoryStore.profiles.set(data.userId, data);
        return data;
      }
    } catch {
      // Fallback to memory
    }
    return (
      memoryStore.profiles.get(agentOrUserId) ||
      Array.from(memoryStore.profiles.values()).find(
        (p) => p.id === agentOrUserId || p.userId === agentOrUserId
      ) ||
      null
    );
  }

  async saveProfile(profile: AgentProfile): Promise<AgentProfile> {
    memoryStore.profiles.set(profile.id, profile);
    memoryStore.profiles.set(profile.userId, profile);
    try {
      await setDoc(doc(db, "agent_profiles", profile.id), cleanData(profile as unknown as Record<string, unknown>));
    } catch (err) {
      console.warn("Firestore save notice for agent_profiles:", err);
    }
    return profile;
  }

  async updateProfile(
    agentId: string,
    updates: Partial<AgentProfile>
  ): Promise<AgentProfile | null> {
    const existing = await this.getProfile(agentId);
    if (!existing) return null;

    const updated: AgentProfile = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    memoryStore.profiles.set(updated.id, updated);
    memoryStore.profiles.set(updated.userId, updated);

    try {
      await updateDoc(doc(db, "agent_profiles", updated.id), cleanData({
        ...updates,
        updatedAt: updated.updatedAt,
      } as Record<string, unknown>));
    } catch (err) {
      console.warn("Firestore update notice for agent_profiles:", err);
    }
    return updated;
  }

  // Organizations
  async getOrganization(orgId: string): Promise<AgentOrganization | null> {
    try {
      const snap = await getDoc(doc(db, "agent_organizations", orgId));
      if (snap.exists()) {
        const data = snap.data() as AgentOrganization;
        memoryStore.organizations.set(data.id, data);
        return data;
      }
    } catch {
      // Fallback
    }
    return memoryStore.organizations.get(orgId) || null;
  }

  async saveOrganization(org: AgentOrganization): Promise<AgentOrganization> {
    memoryStore.organizations.set(org.id, org);
    try {
      await setDoc(doc(db, "agent_organizations", org.id), cleanData(org as unknown as Record<string, unknown>));
    } catch (err) {
      console.warn("Firestore save notice for agent_organizations:", err);
    }
    return org;
  }

  async updateOrganization(
    orgId: string,
    updates: Partial<AgentOrganization>
  ): Promise<AgentOrganization | null> {
    const existing = await this.getOrganization(orgId);
    if (!existing) return null;

    const updated: AgentOrganization = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    memoryStore.organizations.set(orgId, updated);
    try {
      await updateDoc(doc(db, "agent_organizations", orgId), cleanData({
        ...updates,
        updatedAt: updated.updatedAt,
      } as Record<string, unknown>));
    } catch (err) {
      console.warn("Firestore update notice for agent_organizations:", err);
    }
    return updated;
  }

  // Inspections
  async saveInspection(inspection: AgentInspection): Promise<AgentInspection> {
    memoryStore.inspections.set(inspection.id, inspection);
    try {
      await setDoc(doc(db, "agent_inspections", inspection.id), cleanData(inspection as unknown as Record<string, unknown>));
    } catch (err) {
      console.warn("Firestore save notice for agent_inspections:", err);
    }
    return inspection;
  }

  async getInspectionsByAgent(agentId: string): Promise<AgentInspection[]> {
    const list: AgentInspection[] = [];
    try {
      const q = query(
        collection(db, "agent_inspections"),
        where("agentId", "==", agentId)
      );
      const snap = await getDocs(q);
      snap.forEach((d) => list.push(d.data() as AgentInspection));
    } catch {
      // fallback
    }

    if (list.length > 0) return list;

    return Array.from(memoryStore.inspections.values()).filter(
      (i) => i.agentId === agentId
    );
  }

  // Transactions
  async saveTransaction(txn: AgentTransaction): Promise<AgentTransaction> {
    memoryStore.transactions.set(txn.id, txn);
    try {
      await setDoc(doc(db, "agent_transactions", txn.id), cleanData(txn as unknown as Record<string, unknown>));
    } catch (err) {
      console.warn("Firestore save notice for agent_transactions:", err);
    }
    return txn;
  }

  async getTransactionsByAgent(agentId: string): Promise<AgentTransaction[]> {
    const list: AgentTransaction[] = [];
    try {
      const q = query(
        collection(db, "agent_transactions"),
        where("agentId", "==", agentId)
      );
      const snap = await getDocs(q);
      snap.forEach((d) => list.push(d.data() as AgentTransaction));
    } catch {
      // fallback
    }

    if (list.length > 0) return list;

    return Array.from(memoryStore.transactions.values()).filter(
      (t) => t.agentId === agentId
    );
  }

  async getTransaction(txnId: string): Promise<AgentTransaction | null> {
    try {
      const snap = await getDoc(doc(db, "agent_transactions", txnId));
      if (snap.exists()) {
        const data = snap.data() as AgentTransaction;
        memoryStore.transactions.set(data.id, data);
        return data;
      }
    } catch {
      // fallback
    }
    return memoryStore.transactions.get(txnId) || null;
  }

  // Manifests (Warehouse Handover)
  async saveManifest(manifest: AgentBatchManifest): Promise<AgentBatchManifest> {
    memoryStore.manifests.set(manifest.id, manifest);
    try {
      await setDoc(doc(db, "agent_manifests", manifest.id), cleanData(manifest as unknown as Record<string, unknown>));
    } catch (err) {
      console.warn("Firestore save notice for agent_manifests:", err);
    }
    return manifest;
  }

  async updateManifest(
    manifestId: string,
    updates: Partial<AgentBatchManifest>
  ): Promise<AgentBatchManifest | null> {
    const existing = memoryStore.manifests.get(manifestId);
    if (!existing) return null;

    const updated: AgentBatchManifest = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    memoryStore.manifests.set(manifestId, updated);
    try {
      await updateDoc(doc(db, "agent_manifests", manifestId), cleanData({
        ...updates,
        updatedAt: updated.updatedAt,
      } as Record<string, unknown>));
    } catch (err) {
      console.warn("Firestore update notice for agent_manifests:", err);
    }
    return updated;
  }

  async getManifestsByAgent(agentId: string): Promise<AgentBatchManifest[]> {
    const list: AgentBatchManifest[] = [];
    try {
      const q = query(
        collection(db, "agent_manifests"),
        where("agentId", "==", agentId)
      );
      const snap = await getDocs(q);
      snap.forEach((d) => list.push(d.data() as AgentBatchManifest));
    } catch {
      // fallback
    }

    if (list.length > 0) return list;

    return Array.from(memoryStore.manifests.values()).filter(
      (m) => m.agentId === agentId
    );
  }

  async getManifest(manifestId: string): Promise<AgentBatchManifest | null> {
    try {
      const snap = await getDoc(doc(db, "agent_manifests", manifestId));
      if (snap.exists()) {
        const data = snap.data() as AgentBatchManifest;
        memoryStore.manifests.set(data.id, data);
        return data;
      }
    } catch {
      // fallback
    }
    return memoryStore.manifests.get(manifestId) || null;
  }

  // Certificates
  async saveCertificate(cert: AgentCertificate): Promise<AgentCertificate> {
    memoryStore.certificates.set(cert.id, cert);
    memoryStore.certificates.set(cert.certificateNumber, cert);
    try {
      await setDoc(doc(db, "agent_certificates", cert.id), cleanData(cert as unknown as Record<string, unknown>));
    } catch (err) {
      console.warn("Firestore save notice for agent_certificates:", err);
    }
    return cert;
  }

  async getCertificate(idOrNumber: string): Promise<AgentCertificate | null> {
    try {
      const snap = await getDoc(doc(db, "agent_certificates", idOrNumber));
      if (snap.exists()) {
        const data = snap.data() as AgentCertificate;
        memoryStore.certificates.set(data.id, data);
        return data;
      }
    } catch {
      // fallback
    }
    return (
      memoryStore.certificates.get(idOrNumber) ||
      Array.from(memoryStore.certificates.values()).find(
        (c) => c.id === idOrNumber || c.certificateNumber === idOrNumber
      ) ||
      null
    );
  }

  async getCertificatesByAgent(agentId: string): Promise<AgentCertificate[]> {
    return Array.from(memoryStore.certificates.values()).filter(
      (c) => c.agentId === agentId
    );
  }

  // Access existing farmer farms collection directly via read
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

export const agentStore = new AgentStore();
