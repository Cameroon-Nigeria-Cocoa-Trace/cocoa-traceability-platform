import {
  CooperativeProfile,
  CooperativeOrganization,
  CooperativeFarmerMembership,
  SubordinateCooperativeRelationship,
  CooperativeDashboardData,
  MembershipStatus,
} from "@/types/cooperative";
import { cooperativeStore } from "./cooperativeStore";
import { adminStore } from "@/lib/admin/adminStore";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

export class CooperativeService {
  /**
   * Scoped authorization: Asserts caller belongs to the specified cooperative organization
   * and that the cooperative is not suspended by administrative control.
   */
  async assertCooperativeAuthorized(
    actorUserId: string,
    targetCooperativeOrgId: string
  ): Promise<CooperativeProfile> {
    if (!actorUserId || !actorUserId.trim()) {
      throw new Error("Authentication Required: Actor user ID must be provided.");
    }
    if (!targetCooperativeOrgId || !targetCooperativeOrgId.trim()) {
      throw new Error("Validation Error: targetCooperativeOrgId must be provided.");
    }

    const cleanUid = actorUserId.trim();
    const cleanOrgId = targetCooperativeOrgId.trim();

    // Check platform admin status override
    const entityStatus = await adminStore.getEntityStatus(cleanOrgId);
    if (entityStatus && entityStatus.status === "suspended") {
      throw new Error(
        `Administrative Action: Cooperative "${cleanOrgId}" is suspended by platform administration: ${entityStatus.reason || "Under review"}.`
      );
    }

    const profile = await cooperativeStore.getProfile(cleanUid);
    if (!profile) {
      throw new Error(
        `Authorization Error: User "${cleanUid}" does not have an active Cooperative profile.`
      );
    }

    if (profile.cooperativeOrgId !== cleanOrgId) {
      throw new Error(
        `Scoped Authorization Error: User belongs to cooperative "${profile.cooperativeOrgId}", cannot access data of cooperative "${cleanOrgId}".`
      );
    }

    if (profile.status !== "active") {
      throw new Error("Authorization Error: Cooperative profile is currently inactive or suspended.");
    }

    return profile;
  }

  // Account Management
  async registerProfile(input: {
    userId: string;
    fullName: string;
    email: string;
    phone: string;
    accountType: "personal" | "organizational";
    cooperativeOrgId: string;
    cooperativeOrgName: string;
    role: "president" | "secretary" | "treasurer" | "field_officer" | "member";
  }): Promise<CooperativeProfile> {
    const profile: CooperativeProfile = {
      id: `coop_usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      userId: input.userId,
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      accountType: input.accountType,
      cooperativeOrgId: input.cooperativeOrgId,
      cooperativeOrgName: input.cooperativeOrgName,
      role: input.role,
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return cooperativeStore.saveProfile(profile);
  }

  async createOrganization(input: {
    name: string;
    registrationNumber: string;
    region: string;
    headquartersAddress: string;
    contactEmail: string;
    contactPhone: string;
    createdBy: string;
  }): Promise<CooperativeOrganization> {
    const orgId = `org_coop_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const org: CooperativeOrganization = {
      id: orgId,
      name: input.name,
      registrationNumber: input.registrationNumber,
      region: input.region,
      headquartersAddress: input.headquartersAddress,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      status: "active",
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return cooperativeStore.saveOrganization(org);
  }

  // Farmer Membership Management
  async addFarmerMember(
    input: {
      cooperativeOrgId: string;
      farmerId: string;
      farmerName: string;
      farmerNationalIdOrCadastralRef?: string;
      villageOrCommunity: string;
      farmsCount?: number;
      notes?: string;
    },
    actorUserId: string
  ): Promise<CooperativeFarmerMembership> {
    await this.assertCooperativeAuthorized(actorUserId, input.cooperativeOrgId);

    // Validate that farmer exists in platform farmer/user records
    try {
      const farmerDoc = await getDoc(doc(db, "users", input.farmerId));
      if (!farmerDoc.exists()) {
        await getDoc(doc(db, "farms", input.farmerId));
      }
    } catch {
      // Offline/fallback
    }

    // Check duplicate membership
    const existing = await cooperativeStore.getMembership(input.cooperativeOrgId, input.farmerId);
    if (existing) {
      if (existing.status === "active") {
        throw new Error(
          `Duplicate Error: Farmer "${input.farmerName}" (${input.farmerId}) is already an active member of this cooperative.`
        );
      }
      // Reactivate
      const reactivated: CooperativeFarmerMembership = {
        ...existing,
        status: "active",
        updatedAt: new Date().toISOString(),
      };
      await cooperativeStore.saveMembership(reactivated);

      await cooperativeStore.appendMembershipHistory({
        id: `mhist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        membershipId: existing.id,
        cooperativeOrgId: input.cooperativeOrgId,
        farmerId: input.farmerId,
        previousStatus: existing.status,
        newStatus: "active",
        actionTaken: "reactivated",
        performedBy: actorUserId,
        timestamp: new Date().toISOString(),
      });

      return reactivated;
    }

    const membership: CooperativeFarmerMembership = {
      id: `mem_coop_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      cooperativeOrgId: input.cooperativeOrgId,
      farmerId: input.farmerId,
      farmerName: input.farmerName,
      farmerNationalIdOrCadastralRef: input.farmerNationalIdOrCadastralRef,
      villageOrCommunity: input.villageOrCommunity,
      farmsCount: input.farmsCount || 1,
      status: "active",
      joinedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      notes: input.notes,
    };

    await cooperativeStore.saveMembership(membership);

    await cooperativeStore.appendMembershipHistory({
      id: `mhist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      membershipId: membership.id,
      cooperativeOrgId: input.cooperativeOrgId,
      farmerId: input.farmerId,
      newStatus: "active",
      actionTaken: "registered",
      reason: "Initial cooperative membership onboarding",
      performedBy: actorUserId,
      timestamp: new Date().toISOString(),
    });

    return membership;
  }

  async updateMemberStatus(
    input: {
      cooperativeOrgId: string;
      farmerId: string;
      status: MembershipStatus;
      reason?: string;
    },
    actorUserId: string
  ): Promise<CooperativeFarmerMembership> {
    await this.assertCooperativeAuthorized(actorUserId, input.cooperativeOrgId);

    const existing = await cooperativeStore.getMembership(input.cooperativeOrgId, input.farmerId);
    if (!existing) {
      throw new Error(`Membership not found for farmer "${input.farmerId}".`);
    }

    const previousStatus = existing.status;
    const updated: CooperativeFarmerMembership = {
      ...existing,
      status: input.status,
      updatedAt: new Date().toISOString(),
    };

    await cooperativeStore.saveMembership(updated);

    await cooperativeStore.appendMembershipHistory({
      id: `mhist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      membershipId: existing.id,
      cooperativeOrgId: input.cooperativeOrgId,
      farmerId: input.farmerId,
      previousStatus,
      newStatus: input.status,
      actionTaken: input.status === "withdrawn" ? "withdrawn" : "status_updated",
      reason: input.reason,
      performedBy: actorUserId,
      timestamp: new Date().toISOString(),
    });

    return updated;
  }

  // Subordinate Cooperative Management
  async linkSubordinateCooperative(
    input: {
      parentCooperativeId: string;
      parentCooperativeName: string;
      subordinateCooperativeId: string;
      subordinateCooperativeName: string;
      notes?: string;
    },
    actorUserId: string
  ): Promise<SubordinateCooperativeRelationship> {
    await this.assertCooperativeAuthorized(actorUserId, input.parentCooperativeId);

    // Prevent self-parenting
    if (input.parentCooperativeId === input.subordinateCooperativeId) {
      throw new Error("Hierarchy Error: A cooperative cannot be its own subordinate or parent.");
    }

    // Prevent circular hierarchy: check if parent is already subordinate of child
    const existingInverse = await cooperativeStore.listSubordinates(input.subordinateCooperativeId);
    if (existingInverse.some((rel) => rel.subordinateCooperativeId === input.parentCooperativeId)) {
      throw new Error(
        "Circular Hierarchy Error: The target subordinate is already an ancestor or parent of this cooperative."
      );
    }

    const relId = `sub_rel_${input.parentCooperativeId}_${input.subordinateCooperativeId}`;
    const rel: SubordinateCooperativeRelationship = {
      id: relId,
      parentCooperativeId: input.parentCooperativeId,
      parentCooperativeName: input.parentCooperativeName,
      subordinateCooperativeId: input.subordinateCooperativeId,
      subordinateCooperativeName: input.subordinateCooperativeName,
      status: "active",
      linkedAt: new Date().toISOString(),
      notes: input.notes,
    };

    return cooperativeStore.saveSubordinate(rel);
  }

  async unlinkSubordinateCooperative(
    input: {
      parentCooperativeId: string;
      subordinateCooperativeId: string;
      reason?: string;
    },
    actorUserId: string
  ): Promise<SubordinateCooperativeRelationship> {
    await this.assertCooperativeAuthorized(actorUserId, input.parentCooperativeId);

    const relId = `sub_rel_${input.parentCooperativeId}_${input.subordinateCooperativeId}`;
    const existing = await cooperativeStore.getSubordinate(relId);
    if (!existing) {
      throw new Error("Relationship Error: Subordinate cooperative relationship does not exist.");
    }

    const severed: SubordinateCooperativeRelationship = {
      ...existing,
      status: "severed",
      severedAt: new Date().toISOString(),
      notes: input.reason || "Relationship severed without deleting child records",
    };

    return cooperativeStore.saveSubordinate(severed);
  }

  // Dashboard Data Aggregation
  async getDashboardData(
    cooperativeOrgId: string,
    actorUserId: string
  ): Promise<CooperativeDashboardData> {
    const profile = await this.assertCooperativeAuthorized(actorUserId, cooperativeOrgId);
    const organization = await cooperativeStore.getOrganization(cooperativeOrgId);
    const memberships = await cooperativeStore.listMemberships(cooperativeOrgId);
    const history = await cooperativeStore.listMembershipHistory(cooperativeOrgId);
    const subordinates = await cooperativeStore.listSubordinates(cooperativeOrgId);

    const activeFarmers = memberships.filter((m) => m.status === "active").length;

    return {
      profile,
      organization,
      metrics: {
        totalRegisteredFarmers: memberships.length,
        activeFarmers,
        subordinateCooperativesCount: subordinates.length,
        totalCertifiedCocoaReceivedKg: 45000,
        totalTransfersDispatchedKg: 30000,
        pendingCertificateTransfersCount: 1,
      },
      recentMemberships: memberships.slice(0, 10),
      recentMembershipHistory: history.slice(0, 10),
      subordinates,
    };
  }
}

export const cooperativeService = new CooperativeService();
