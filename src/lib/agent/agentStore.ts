import {
  AgentProfile,
  AgentOrganization,
  AgentLinkageRecord,
  AgentCocoaOperation,
} from "@/types/agent";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, collection, query, where, getDocs } from "firebase/firestore";

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
    // Memory store holds only live active session data, no demo seed data
  }
}

const memoryStore = new AgentMemoryStore();

export class AgentStore {
  // Profiles
  async getProfile(idOrUserId: string): Promise<AgentProfile | null> {
    if (!idOrUserId) return null;

    try {
      // 1. Direct document check in agent_profiles
      let snap = await getDoc(doc(db, "agent_profiles", idOrUserId));
      if (snap.exists()) {
        const data = snap.data() as AgentProfile;
        memoryStore.profiles.set(data.id, data);
        memoryStore.profiles.set(data.userId, data);
        return data;
      }

      // 2. Try prefix agt_usr_
      if (!idOrUserId.startsWith("agt_usr_")) {
        snap = await getDoc(doc(db, "agent_profiles", `agt_usr_${idOrUserId}`));
        if (snap.exists()) {
          const data = snap.data() as AgentProfile;
          memoryStore.profiles.set(data.id, data);
          memoryStore.profiles.set(data.userId, data);
          return data;
        }
      } else {
        // Try stripping prefix
        const rawUid = idOrUserId.replace("agt_usr_", "");
        snap = await getDoc(doc(db, "agent_profiles", rawUid));
        if (snap.exists()) {
          const data = snap.data() as AgentProfile;
          memoryStore.profiles.set(data.id, data);
          memoryStore.profiles.set(data.userId, data);
          return data;
        }
      }

      // 3. Query by userId in Firestore
      const q = query(collection(db, "agent_profiles"), where("userId", "==", idOrUserId));
      const qs = await getDocs(q);
      if (!qs.empty) {
        const data = qs.docs[0].data() as AgentProfile;
        memoryStore.profiles.set(data.id, data);
        memoryStore.profiles.set(data.userId, data);
        return data;
      }

      // 4. Query users collection for registered agent accounts
      const rawUserUid = idOrUserId.replace("agt_usr_", "");
      const userSnap = await getDoc(doc(db, "users", rawUserUid));
      if (userSnap.exists()) {
        const uData = userSnap.data();
        if (uData.role === "agent" || uData.accountType === "agent") {
          const profile: AgentProfile = {
            id: `agt_usr_${userSnap.id}`,
            userId: userSnap.id,
            fullName: uData.displayName || "Licensed Buying Agent",
            email: uData.email || "",
            phone: uData.phone || "",
            accountType: uData.accountType === "personal" ? "personal" : "organizational",
            agencyId: uData.agencyId || `org_agt_${userSnap.id}`,
            agencyName: uData.agencyName || "Licensed Buying Agency",
            role: uData.agentRole || "licensed_buying_agent",
            licenseNumber: uData.licenseNumber || `CRS-LBA-2026-${userSnap.id.slice(-4)}`,
            primaryCorridor: uData.primaryCorridor || "Ikom-Etung-Mamfe Cross-Border Corridor",
            status: "active",
            createdAt: uData.createdAt || new Date().toISOString(),
            updatedAt: uData.updatedAt || new Date().toISOString(),
          };
          memoryStore.profiles.set(profile.id, profile);
          memoryStore.profiles.set(profile.userId, profile);
          return profile;
        }
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
      const payload = cleanData(profile as unknown as Record<string, unknown>);
      await setDoc(doc(db, "agent_profiles", profile.id), payload);
      if (profile.userId && profile.userId !== profile.id) {
        await setDoc(doc(db, "agent_profiles", profile.userId), payload);
      }
    } catch (err) {
      console.warn("Firestore notice saving agent_profile:", err);
    }
    return profile;
  }

  // Organizations
  async getOrganization(orgId: string): Promise<AgentOrganization | null> {
    if (!orgId) return null;
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
    if (!agentId) return [];
    const listMap = new Map<string, AgentLinkageRecord>();

    const candidateIds = [agentId];
    if (agentId.startsWith("agt_usr_")) {
      candidateIds.push(agentId.replace("agt_usr_", ""));
    } else {
      candidateIds.push(`agt_usr_${agentId}`);
    }

    // Check memoryStore first
    Array.from(memoryStore.linkages.values())
      .filter((l) => candidateIds.includes(l.agentId) && l.status === "active")
      .forEach((l) => listMap.set(l.id, l));

    // Also query Firestore for all candidate IDs
    for (const cid of candidateIds) {
      try {
        const q = query(collection(db, "agent_linkages"), where("agentId", "==", cid));
        const qs = await getDocs(q);
        qs.forEach((d) => {
          const record = d.data() as AgentLinkageRecord;
          if (record.status === "active") {
            listMap.set(record.id, record);
            memoryStore.linkages.set(record.id, record);
          }
        });
      } catch {
        // Return memory results
      }
    }

    return Array.from(listMap.values());
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
    if (!agentId) return [];
    const opsMap = new Map<string, AgentCocoaOperation>();

    const candidateIds = [agentId];
    if (agentId.startsWith("agt_usr_")) {
      candidateIds.push(agentId.replace("agt_usr_", ""));
    } else {
      candidateIds.push(`agt_usr_${agentId}`);
    }

    // Check memoryStore
    memoryStore.operations
      .filter((op) => candidateIds.includes(op.agentId))
      .forEach((op) => opsMap.set(op.id, op));

    // Also query Firestore for all candidate IDs
    for (const cid of candidateIds) {
      try {
        const q = query(collection(db, "agent_operations"), where("agentId", "==", cid));
        const qs = await getDocs(q);
        qs.forEach((d) => {
          const op = d.data() as AgentCocoaOperation;
          opsMap.set(op.id, op);
        });
      } catch {
        // Return memory results
      }
    }

    const allOps = Array.from(opsMap.values());
    allOps.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return allOps;
  }
}

export const agentStore = new AgentStore();
