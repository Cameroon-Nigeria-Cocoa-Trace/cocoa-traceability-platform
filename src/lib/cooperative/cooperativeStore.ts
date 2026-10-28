import {
  CooperativeProfile,
  CooperativeOrganization,
  CooperativeFarmerMembership,
  MembershipHistoryRecord,
  SubordinateCooperativeRelationship,
  FarmerCooperativeAssociation,
} from "@/types/cooperative";
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

class CooperativeMemoryStore {
  profiles: Map<string, CooperativeProfile> = new Map();
  organizations: Map<string, CooperativeOrganization> = new Map();
  memberships: Map<string, CooperativeFarmerMembership> = new Map();
  history: MembershipHistoryRecord[] = [];
  subordinates: Map<string, SubordinateCooperativeRelationship> = new Map();

  constructor() {
    this.seedDefaults();
  }

  private seedDefaults() {
    const defaultOrg: CooperativeOrganization = {
      id: "org_coop_mamfe_central",
      name: "Mamfe Central Farmers Multi-Purpose Cooperative Society",
      registrationNumber: "COOP-CMR-SW-2026-041",
      region: "Manyu Division, South-West Region, Cameroon",
      headquartersAddress: "Commercial Avenue, Mamfe",
      contactEmail: "info@mamfecentral-coop.cm",
      contactPhone: "+237 677 889 900",
      status: "active",
      createdBy: "usr_coop_lead_01",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    this.organizations.set(defaultOrg.id, defaultOrg);

    const defaultProfile: CooperativeProfile = {
      id: "coop_usr_lead_01",
      userId: "usr_coop_lead_01",
      fullName: "Eseme Emmanuel Tambe",
      email: "eseme.tambe@mamfecentral-coop.cm",
      phone: "+237 677 889 900",
      accountType: "organizational",
      cooperativeOrgId: "org_coop_mamfe_central",
      cooperativeOrgName: "Mamfe Central Farmers Multi-Purpose Cooperative Society",
      role: "president",
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    this.profiles.set(defaultProfile.id, defaultProfile);
    this.profiles.set(defaultProfile.userId, defaultProfile);
  }
}

const memoryStore = new CooperativeMemoryStore();

export class CooperativeStore {
  // Profiles
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

  async saveProfile(profile: CooperativeProfile): Promise<CooperativeProfile> {
    memoryStore.profiles.set(profile.id, profile);
    memoryStore.profiles.set(profile.userId, profile);
    try {
      await setDoc(
        doc(db, "cooperative_profiles", profile.id),
        cleanData(profile as unknown as Record<string, unknown>)
      );
      await setDoc(
        doc(db, "cooperative_profiles", `coop_usr_${profile.userId}`),
        cleanData(profile as unknown as Record<string, unknown>),
        { merge: true }
      );
      // Persist directly into users collection
      await setDoc(
        doc(db, "users", profile.userId),
        cleanData({
          id: profile.userId,
          displayName: profile.fullName,
          email: profile.email,
          phone: profile.phone,
          role: "cooperative",
          accountType: "cooperative",
          cooperativeOrgId: profile.cooperativeOrgId,
          cooperativeOrgName: profile.cooperativeOrgName,
          cooperativeRole: profile.role,
          updatedAt: new Date().toISOString(),
        }),
        { merge: true }
      );
    } catch (err) {
      console.warn("Firestore notice saving cooperative_profile:", err);
    }
    return profile;
  }

  // Organizations
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
      console.warn("Firestore notice saving cooperative_organization:", err);
    }
    return org;
  }

  // Memberships
  async getMembership(
    cooperativeOrgId: string,
    farmerId: string
  ): Promise<CooperativeFarmerMembership | null> {
    const key = `${cooperativeOrgId}_${farmerId}`;
    try {
      const snap = await getDoc(doc(db, "cooperative_memberships", key));
      if (snap.exists()) {
        const data = snap.data() as CooperativeFarmerMembership;
        memoryStore.memberships.set(key, data);
        return data;
      }
    } catch {
      // Fallback
    }
    return memoryStore.memberships.get(key) || null;
  }

  async saveMembership(membership: CooperativeFarmerMembership): Promise<CooperativeFarmerMembership> {
    const key = `${membership.cooperativeOrgId}_${membership.farmerId}`;
    memoryStore.memberships.set(key, membership);
    try {
      await setDoc(
        doc(db, "cooperative_memberships", key),
        cleanData(membership as unknown as Record<string, unknown>)
      );
    } catch (err) {
      console.warn("Firestore notice saving cooperative_membership:", err);
    }
    return membership;
  }

  async listMemberships(
    cooperativeOrgId: string,
    filter?: { status?: string }
  ): Promise<CooperativeFarmerMembership[]> {
    let list = Array.from(memoryStore.memberships.values()).filter(
      (m) => m.cooperativeOrgId === cooperativeOrgId
    );
    if (filter?.status) {
      list = list.filter((m) => m.status === filter.status);
    }
    return list;
  }

  // Membership History
  async appendMembershipHistory(record: MembershipHistoryRecord): Promise<MembershipHistoryRecord> {
    memoryStore.history.unshift(record);
    try {
      await setDoc(
        doc(db, "cooperative_membership_history", record.id),
        cleanData(record as unknown as Record<string, unknown>)
      );
    } catch (err) {
      console.warn("Firestore notice saving cooperative_membership_history:", err);
    }
    return record;
  }

  async listMembershipHistory(
    cooperativeOrgId: string,
    farmerId?: string
  ): Promise<MembershipHistoryRecord[]> {
    let list = memoryStore.history.filter((h) => h.cooperativeOrgId === cooperativeOrgId);
    if (farmerId) {
      list = list.filter((h) => h.farmerId === farmerId);
    }
    return list;
  }

  // Subordinates
  async saveSubordinate(
    rel: SubordinateCooperativeRelationship
  ): Promise<SubordinateCooperativeRelationship> {
    memoryStore.subordinates.set(rel.id, rel);
    try {
      await setDoc(
        doc(db, "cooperative_subordinates", rel.id),
        cleanData(rel as unknown as Record<string, unknown>)
      );
    } catch (err) {
      console.warn("Firestore notice saving cooperative_subordinates:", err);
    }
    return rel;
  }

  async getSubordinate(relId: string): Promise<SubordinateCooperativeRelationship | null> {
    return memoryStore.subordinates.get(relId) || null;
  }

  async listSubordinates(parentCoopId: string): Promise<SubordinateCooperativeRelationship[]> {
    return Array.from(memoryStore.subordinates.values()).filter(
      (s) => s.parentCooperativeId === parentCoopId && s.status === "active"
    );
  }

  // Associations
  async searchOrganizations(queryStr: string): Promise<CooperativeOrganization[]> {
    const q = queryStr.trim().toLowerCase();
    const orgs = Array.from(memoryStore.organizations.values());
    try {
      const snap = await getDocs(collection(db, "cooperative_organizations"));
      if (!snap.empty) {
        snap.forEach((d) => {
          const org = d.data() as CooperativeOrganization;
          memoryStore.organizations.set(org.id, org);
        });
      }
    } catch {
      // Use memory store fallback
    }
    const allOrgs = Array.from(memoryStore.organizations.values());
    return allOrgs.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.contactEmail.toLowerCase().includes(q) ||
        o.contactPhone.toLowerCase().includes(q) ||
        o.id.toLowerCase().includes(q)
    );
  }

  async saveAssociation(assoc: FarmerCooperativeAssociation): Promise<FarmerCooperativeAssociation> {
    const key = `${assoc.farmerId}_${assoc.cooperativeOrgId}`;
    try {
      await setDoc(doc(db, "farmerCooperativeAssociations", key), cleanData(assoc as unknown as Record<string, unknown>));
    } catch (err) {
      console.warn("Firestore notice saving farmerCooperativeAssociation:", err);
    }
    return assoc;
  }

  async listAssociationsForFarmer(farmerId: string): Promise<FarmerCooperativeAssociation[]> {
    try {
      const q = query(collection(db, "farmerCooperativeAssociations"), where("farmerId", "==", farmerId));
      const snap = await getDocs(q);
      if (!snap.empty) {
        return snap.docs.map((d) => d.data() as FarmerCooperativeAssociation);
      }
    } catch {
      // Fallback
    }
    return [];
  }

  async listAssociationsForCooperative(cooperativeOrgId: string): Promise<FarmerCooperativeAssociation[]> {
    try {
      const q = query(collection(db, "farmerCooperativeAssociations"), where("cooperativeOrgId", "==", cooperativeOrgId));
      const snap = await getDocs(q);
      if (!snap.empty) {
        return snap.docs.map((d) => d.data() as FarmerCooperativeAssociation);
      }
    } catch {
      // Fallback
    }
    // Return sample associations if none in DB for default org
    if (cooperativeOrgId === "org_coop_mamfe_central") {
      return [
        {
          associationId: "assoc_default_01",
          farmerId: "usr_farmer_sample_01",
          farmerName: "Agatha Mbenge",
          cooperativeOrgId: "org_coop_mamfe_central",
          cooperativeOrgName: "Mamfe Central Farmers Multi-Purpose Cooperative Society",
          cooperativeEmail: "info@mamfecentral-coop.cm",
          cooperativePhone: "+237 677 889 900",
          permissions: {
            farmsManagement: true,
            certificatesManagement: true,
            productionInventory: true,
            tradingManagement: true,
          },
          status: "active",
          associatedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          associationId: "assoc_default_02",
          farmerId: "usr_farmer_sample_02",
          farmerName: "Samuel Ojong",
          cooperativeOrgId: "org_coop_mamfe_central",
          cooperativeOrgName: "Mamfe Central Farmers Multi-Purpose Cooperative Society",
          cooperativeEmail: "info@mamfecentral-coop.cm",
          cooperativePhone: "+237 677 889 900",
          permissions: {
            farmsManagement: true,
            certificatesManagement: true,
            productionInventory: true,
            tradingManagement: true,
          },
          status: "active",
          associatedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
    }
    return [];
  }
}

export const cooperativeStore = new CooperativeStore();

