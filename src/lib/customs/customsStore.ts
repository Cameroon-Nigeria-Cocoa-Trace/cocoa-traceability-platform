import {
  CustomsAgentProfile,
  CustomsAgency,
  CustomsServiceRequest,
  CustomsProcessingHistoryRecord,
} from "@/types/customs";
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
 * In-memory fallback and test persistence store for Customs module
 */
class CustomsMemoryStore {
  profiles: Map<string, CustomsAgentProfile> = new Map();
  agencies: Map<string, CustomsAgency> = new Map();
  requests: Map<string, CustomsServiceRequest> = new Map();
  history: CustomsProcessingHistoryRecord[] = [];

  constructor() {
    this.seedDefaults();
  }

  private seedDefaults() {
    // 1. Default Agency: Calabar & Cross River Border Customs Brokerage Ltd
    const defaultAgency: CustomsAgency = {
      id: "org_customs_calabar_alliance",
      name: "Calabar & Cross River Maritime Customs Brokerage Alliance",
      registrationNumber: "RC-CUST-CR-2026-004",
      customsLicenceCode: "NCS-CORP-LIC-9901",
      headquarters: "Calabar Free Trade Zone Port Complex, Suite 10",
      contactEmail: "customs-brokerage@crossriver-cocoa.org",
      contactPhone: "+234 803 888 1122",
      operatingPortsAndBorders: [
        "Calabar Free Trade Zone Port",
        "Mfum Border Post",
        "Ikom Corridor Transit Terminal",
      ],
      members: [
        {
          id: "mem_cag_01",
          userId: "usr_customs_lead_01",
          name: "Alhaji Ibrahim Danjuma",
          email: "ibrahim.danjuma@crossriver-cocoa.org",
          role: "chief_customs_broker",
          status: "active",
          joinedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "mem_cag_02",
          userId: "usr_customs_insp_02",
          name: "Victoria Bassey",
          email: "victoria.bassey@crossriver-cocoa.org",
          role: "inspection_officer",
          status: "active",
          joinedAt: "2026-01-05T00:00:00.000Z",
        },
      ],
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    this.agencies.set(defaultAgency.id, defaultAgency);

    // 2. Default Officer Profile
    const defaultProfile: CustomsAgentProfile = {
      id: "cag_usr_lead_01",
      userId: "usr_customs_lead_01",
      fullName: "Alhaji Ibrahim Danjuma",
      email: "ibrahim.danjuma@crossriver-cocoa.org",
      phone: "+234 803 888 1122",
      agencyId: "org_customs_calabar_alliance",
      agencyName: "Calabar & Cross River Maritime Customs Brokerage Alliance",
      role: "chief_customs_broker",
      licenseNumber: "NCS-BRK-CR-2026-0091",
      stationedPortOrBorder: "Calabar Free Trade Zone Port",
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    this.profiles.set(defaultProfile.id, defaultProfile);
    this.profiles.set(defaultProfile.userId, defaultProfile);

    // 3. Seed Existing Cleared Request
    const defaultRequest: CustomsServiceRequest = {
      id: "req_cust_seed_001",
      requestNumber: "CSR-2026-0001",
      serviceType: "export_license_and_customs",
      submitterType: "warehouse",
      submitterId: "wh_calabar_port",
      submitterName: "Calabar Port Maritime Export Facility",
      submitterContactEmail: "port-facility@crossriver-cocoa.org",
      submitterContactPhone: "+234 803 777 6543",
      manifestOrBatchCode: "BATCH-EXP-CAL-2026-01",
      quantityKg: 150000,
      totalBags: Math.ceil(150000 / 64),
      commodityDescription: "Dried Fermented Cocoa Beans - Grade 1 EUDR Verified",
      originCorridor: "Cross River State / Cameroon Corridor",
      feeConfigIdApplied: "fee_customs_export_clearance",
      feeCodeApplied: "FEE_CUSTOMS_CLEARANCE",
      feeAmount: 45000,
      currency: "NGN",
      paymentStatus: "paid",
      paymentReference: "PAY-CUST-881293",
      paymentTimestamp: "2026-03-25T09:00:00.000Z",
      references: {
        singleGoodsDeclarationNumber: "SGD-CAL-2026-8812",
        nxpFormNumber: "NXP-FED-2026-04192",
        cleanCertificateOfInspectionNumber: "CCI-CR-2026-0081",
        eur1OrEudrCertificateNumber: "CERT-CRS-FULLTRACE-2026-0041",
        billOfLadingOrConsignmentNote: "BOL-CAL-ROT-2026-01",
        exitPortOrBorderPost: "Calabar Free Trade Zone Port",
        destinationCountry: "Netherlands (Port of Rotterdam)",
      },
      status: "cleared",
      assignedOfficerId: "cag_usr_lead_01",
      assignedOfficerName: "Alhaji Ibrahim Danjuma",
      assignedAgencyId: "org_customs_calabar_alliance",
      customsReleaseReference: "NCS-CR-REL-2026-09841",
      clearedAt: "2026-03-26T14:30:00.000Z",
      clearedByOfficerId: "cag_usr_lead_01",
      clearedByOfficerName: "Alhaji Ibrahim Danjuma",
      createdAt: "2026-03-25T09:00:00.000Z",
      updatedAt: "2026-03-26T14:30:00.000Z",
    };
    this.requests.set(defaultRequest.id, defaultRequest);
    this.requests.set(defaultRequest.requestNumber, defaultRequest);
  }
}

const memoryStore = new CustomsMemoryStore();

export class CustomsStore {
  // ==========================================
  // 1. PROFILES & AGENCIES
  // ==========================================

  async getProfile(idOrUserId: string): Promise<CustomsAgentProfile | null> {
    try {
      const snap = await getDoc(doc(db, "customs_profiles", idOrUserId));
      if (snap.exists()) {
        const data = snap.data() as CustomsAgentProfile;
        memoryStore.profiles.set(data.id, data);
        memoryStore.profiles.set(data.userId, data);
        return data;
      }
    } catch {
      // Fallback
    }
    return (
      memoryStore.profiles.get(idOrUserId) ||
      Array.from(memoryStore.profiles.values()).find(
        (p) => p.id === idOrUserId || p.userId === idOrUserId
      ) ||
      null
    );
  }

  async saveProfile(profile: CustomsAgentProfile): Promise<CustomsAgentProfile> {
    memoryStore.profiles.set(profile.id, profile);
    memoryStore.profiles.set(profile.userId, profile);
    try {
      await setDoc(
        doc(db, "customs_profiles", profile.id),
        cleanData(profile as unknown as Record<string, unknown>)
      );
    } catch (err) {
      console.warn("Firestore save notice for customs_profiles:", err);
    }
    return profile;
  }

  async updateProfile(
    profileId: string,
    updates: Partial<CustomsAgentProfile>
  ): Promise<CustomsAgentProfile | null> {
    const existing = await this.getProfile(profileId);
    if (!existing) return null;

    const updated: CustomsAgentProfile = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    memoryStore.profiles.set(updated.id, updated);
    memoryStore.profiles.set(updated.userId, updated);

    try {
      await updateDoc(
        doc(db, "customs_profiles", updated.id),
        cleanData({ ...updates, updatedAt: updated.updatedAt } as Record<string, unknown>)
      );
    } catch (err) {
      console.warn("Firestore update notice for customs_profiles:", err);
    }
    return updated;
  }

  async getAgency(agencyId: string): Promise<CustomsAgency | null> {
    try {
      const snap = await getDoc(doc(db, "customs_agencies", agencyId));
      if (snap.exists()) {
        const data = snap.data() as CustomsAgency;
        memoryStore.agencies.set(data.id, data);
        return data;
      }
    } catch {
      // Fallback
    }
    return memoryStore.agencies.get(agencyId) || null;
  }

  async saveAgency(agency: CustomsAgency): Promise<CustomsAgency> {
    memoryStore.agencies.set(agency.id, agency);
    try {
      await setDoc(
        doc(db, "customs_agencies", agency.id),
        cleanData(agency as unknown as Record<string, unknown>)
      );
    } catch (err) {
      console.warn("Firestore save notice for customs_agencies:", err);
    }
    return agency;
  }

  // ==========================================
  // 2. EXPORT & CUSTOMS REQUESTS
  // ==========================================

  async getRequest(idOrNumber: string): Promise<CustomsServiceRequest | null> {
    try {
      const snap = await getDoc(doc(db, "customs_requests", idOrNumber));
      if (snap.exists()) {
        const data = snap.data() as CustomsServiceRequest;
        memoryStore.requests.set(data.id, data);
        memoryStore.requests.set(data.requestNumber, data);
        return data;
      }
    } catch {
      // Fallback
    }
    return (
      memoryStore.requests.get(idOrNumber) ||
      Array.from(memoryStore.requests.values()).find(
        (r) => r.id === idOrNumber || r.requestNumber === idOrNumber
      ) ||
      null
    );
  }

  async saveRequest(request: CustomsServiceRequest): Promise<CustomsServiceRequest> {
    memoryStore.requests.set(request.id, request);
    memoryStore.requests.set(request.requestNumber, request);
    try {
      await setDoc(
        doc(db, "customs_requests", request.id),
        cleanData(request as unknown as Record<string, unknown>)
      );
    } catch (err) {
      console.warn("Firestore save notice for customs_requests:", err);
    }
    return request;
  }

  async updateRequest(
    idOrNumber: string,
    updates: Partial<CustomsServiceRequest>
  ): Promise<CustomsServiceRequest | null> {
    const existing = await this.getRequest(idOrNumber);
    if (!existing) return null;

    const updated: CustomsServiceRequest = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    memoryStore.requests.set(updated.id, updated);
    memoryStore.requests.set(updated.requestNumber, updated);

    try {
      await updateDoc(
        doc(db, "customs_requests", updated.id),
        cleanData({ ...updates, updatedAt: updated.updatedAt } as Record<string, unknown>)
      );
    } catch (err) {
      console.warn("Firestore update notice for customs_requests:", err);
    }
    return updated;
  }

  async listRequests(filter?: {
    status?: string;
    submitterId?: string;
    submitterType?: string;
    limit?: number;
  }): Promise<CustomsServiceRequest[]> {
    let list = Array.from(memoryStore.requests.values());

    if (filter?.status) {
      list = list.filter((r) => r.status === filter.status);
    }
    if (filter?.submitterId) {
      list = list.filter((r) => r.submitterId === filter.submitterId);
    }
    if (filter?.submitterType) {
      list = list.filter((r) => r.submitterType === filter.submitterType);
    }

    list.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const limit = filter?.limit || 100;
    return list.slice(0, limit);
  }

  // ==========================================
  // 3. APPEND-ONLY PROCESSING HISTORY
  // ==========================================

  async appendProcessingHistory(
    record: CustomsProcessingHistoryRecord
  ): Promise<CustomsProcessingHistoryRecord> {
    memoryStore.history.unshift(record);
    try {
      await setDoc(
        doc(db, "customs_processing_history", record.id),
        cleanData(record as unknown as Record<string, unknown>)
      );
    } catch (err) {
      console.warn("Firestore save notice for customs_processing_history:", err);
    }
    return record;
  }

  async getProcessingHistory(requestId: string): Promise<CustomsProcessingHistoryRecord[]> {
    return memoryStore.history.filter((h) => h.requestId === requestId);
  }
}

export const customsStore = new CustomsStore();
