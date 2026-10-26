import {
  AgentProfile,
  AgentOrganization,
  AgentLinkageRecord,
  AgentCocoaOperation,
} from "@/types/agent";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

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

class AgentMemoryStore {
  profiles: Map<string, AgentProfile> = new Map();
  organizations: Map<string, AgentOrganization> = new Map();
  linkages: Map<string, AgentLinkageRecord> = new Map();
  operations: AgentCocoaOperation[] = [];

  constructor() {
    this.seedDefaults();
  }

  private seedDefaults() {
    const defaultOrg: AgentOrganization = {
      id: "org_agt_crossriver_agg",
      name: "Cross River Border Commodities & Aggregation Agency",
      registrationNumber: "RC-AGT-CR-2026-009",
      licenseCode: "CRS-LBA-CORP-011",
      headquarters: "Ikom Cocoa Exchange Building, Ikom, Cross River State",
      contactEmail: "ops@crb-commodities.ng",
      contactPhone: "+234 802 334 5566",
      operatingCorridors: [
        "Ikom-Etung-Mamfe Corridor",
        "Mfum Border Transit Route",
        "Calabar Export Corridor",
      ],
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    this.organizations.set(defaultOrg.id, defaultOrg);

    const defaultProfile: AgentProfile = {
      id: "agt_usr_lead_01",
      userId: "usr_agent_lead_01",
      fullName: "Chief Bassey Ekpeyong",
      email: "bassey.ekpeyong@crb-commodities.ng",
      phone: "+234 802 334 5566",
      accountType: "organizational",
      agencyId: "org_agt_crossriver_agg",
      agencyName: "Cross River Border Commodities & Aggregation Agency",
      role: "licensed_buying_agent",
      licenseNumber: "CRS-LBA-2026-0042",
      primaryCorridor: "Ikom-Etung-Mamfe Corridor",
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    this.profiles.set(defaultProfile.id, defaultProfile);
    this.profiles.set(defaultProfile.userId, defaultProfile);
  }
}

const memoryStore = new AgentMemoryStore();

export class AgentStore {
  // Profiles
  async getProfile(idOrUserId: string): Promise<AgentProfile | null> {
    try {
      const snap = await getDoc(doc(db, "agent_profiles", idOrUserId));
      if (snap.exists()) {
        const data = snap.data() as AgentProfile;
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

  async saveProfile(profile: AgentProfile): Promise<AgentProfile> {
    memoryStore.profiles.set(profile.id, profile);
    memoryStore.profiles.set(profile.userId, profile);
    try {
      await setDoc(
        doc(db, "agent_profiles", profile.id),
        cleanData(profile as unknown as Record<string, unknown>)
      );
    } catch (err) {
      console.warn("Firestore notice saving agent_profile:", err);
    }
    return profile;
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
      await setDoc(
        doc(db, "agent_organizations", org.id),
        cleanData(org as unknown as Record<string, unknown>)
      );
    } catch (err) {
      console.warn("Firestore notice saving agent_organization:", err);
    }
    return org;
  }

  // Linkages
  async saveLinkage(link: AgentLinkageRecord): Promise<AgentLinkageRecord> {
    memoryStore.linkages.set(link.id, link);
    try {
      await setDoc(
        doc(db, "agent_linkages", link.id),
        cleanData(link as unknown as Record<string, unknown>)
      );
    } catch (err) {
      console.warn("Firestore notice saving agent_linkages:", err);
    }
    return link;
  }

  async listLinkages(agentId: string): Promise<AgentLinkageRecord[]> {
    return Array.from(memoryStore.linkages.values()).filter(
      (l) => l.agentId === agentId && l.status === "active"
    );
  }

  // Operations
  async appendOperation(op: AgentCocoaOperation): Promise<AgentCocoaOperation> {
    memoryStore.operations.unshift(op);
    try {
      await setDoc(
        doc(db, "agent_operations", op.id),
        cleanData(op as unknown as Record<string, unknown>)
      );
    } catch (err) {
      console.warn("Firestore notice saving agent_operations:", err);
    }
    return op;
  }

  async listOperations(agentId: string): Promise<AgentCocoaOperation[]> {
    return memoryStore.operations.filter((op) => op.agentId === agentId);
  }
}

export const agentStore = new AgentStore();
