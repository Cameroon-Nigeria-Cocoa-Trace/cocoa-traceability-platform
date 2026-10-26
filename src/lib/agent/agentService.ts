import {
  AgentProfile,
  AgentOrganization,
  AgentLinkageRecord,
  AgentCocoaOperation,
  AgentDashboardData,
  AgentLinkageType,
} from "@/types/agent";
import { agentStore } from "./agentStore";
import { adminStore } from "@/lib/admin/adminStore";

export class AgentService {
  /**
   * Scoped authorization: Asserts caller is an authorized active agent
   * and that the agency is not suspended by administrative control.
   */
  async assertAgentAuthorized(actorUserId: string, agentId?: string): Promise<AgentProfile> {
    if (!actorUserId || !actorUserId.trim()) {
      throw new Error("Authentication Required: Actor user ID must be provided.");
    }

    const cleanUid = actorUserId.trim();
    const profile = await agentStore.getProfile(cleanUid);
    if (!profile) {
      throw new Error(`Authorization Error: User "${cleanUid}" does not have an active Agent profile.`);
    }

    if (agentId && profile.id !== agentId && profile.userId !== agentId) {
      throw new Error(
        `Scoped Authorization Error: Agent "${profile.id}" cannot access records of agent "${agentId}".`
      );
    }

    // Check admin status override
    const entityStatus = await adminStore.getEntityStatus(profile.agencyId);
    if (entityStatus && entityStatus.status === "suspended") {
      throw new Error(
        `Administrative Action: Agent Agency "${profile.agencyId}" is suspended by platform administration: ${entityStatus.reason || "Under review"}.`
      );
    }

    if (profile.status !== "active") {
      throw new Error("Authorization Error: Agent profile is currently suspended or inactive.");
    }

    return profile;
  }

  // Account & Registration
  async registerAgent(input: {
    userId: string;
    fullName: string;
    email: string;
    phone: string;
    accountType: "personal" | "organizational";
    agencyId: string;
    agencyName: string;
    role: "licensed_buying_agent" | "field_aggregating_officer" | "logistics_coordinator" | "operations_manager";
    licenseNumber: string;
    primaryCorridor: string;
  }): Promise<AgentProfile> {
    const profile: AgentProfile = {
      id: `agt_usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      userId: input.userId,
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      accountType: input.accountType,
      agencyId: input.agencyId,
      agencyName: input.agencyName,
      role: input.role,
      licenseNumber: input.licenseNumber,
      primaryCorridor: input.primaryCorridor,
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return agentStore.saveProfile(profile);
  }

  async createAgency(input: {
    name: string;
    registrationNumber: string;
    licenseCode: string;
    headquarters: string;
    contactEmail: string;
    contactPhone: string;
    operatingCorridors: string[];
  }): Promise<AgentOrganization> {
    const org: AgentOrganization = {
      id: `org_agt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: input.name,
      registrationNumber: input.registrationNumber,
      licenseCode: input.licenseCode,
      headquarters: input.headquarters,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      operatingCorridors: input.operatingCorridors,
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return agentStore.saveOrganization(org);
  }

  // Working with Farmers, Cooperatives, and Warehouses (Linkages)
  async establishLinkage(
    input: {
      agentId: string;
      linkageType: AgentLinkageType;
      partnerId: string;
      partnerName: string;
      partnerLocation: string;
      notes?: string;
    },
    actorUserId: string
  ): Promise<AgentLinkageRecord> {
    const profile = await this.assertAgentAuthorized(actorUserId, input.agentId);

    const linkId = `link_${profile.id}_${input.partnerId}`;
    const linkage: AgentLinkageRecord = {
      id: linkId,
      agentId: profile.id,
      linkageType: input.linkageType,
      partnerId: input.partnerId,
      partnerName: input.partnerName,
      partnerLocation: input.partnerLocation,
      status: "active",
      linkedAt: new Date().toISOString(),
      notes: input.notes,
    };
    return agentStore.saveLinkage(linkage);
  }

  // Cocoa Operations & Transfers
  async recordCocoaOperation(
    input: {
      agentId: string;
      operationType: "purchase_from_farmer" | "receive_from_coop" | "deliver_to_warehouse";
      partnerId: string;
      partnerType: "farmer" | "cooperative" | "warehouse";
      quantityKg: number;
      cocoaLotId?: string;
      certificateHoldingId?: string;
    },
    actorUserId: string
  ): Promise<AgentCocoaOperation> {
    const profile = await this.assertAgentAuthorized(actorUserId, input.agentId);

    let feePaidNgn = 0;
    // Farmer -> Agent is charged statutory transfer fee
    if (input.operationType === "purchase_from_farmer") {
      const feeConfig = await adminStore.getFeeConfig("FEE_CERTIFICATE_TRANSFER");
      feePaidNgn = feeConfig ? feeConfig.amount : 15000;
    }
    // Agent -> Warehouse is FREE certificate transfer

    const op: AgentCocoaOperation = {
      id: `op_agt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      agentId: profile.id,
      operationType: input.operationType,
      partnerId: input.partnerId,
      partnerType: input.partnerType,
      quantityKg: input.quantityKg,
      totalBags: Math.ceil(input.quantityKg / 64),
      cocoaLotId: input.cocoaLotId,
      certificateHoldingId: input.certificateHoldingId,
      feePaidNgn,
      timestamp: new Date().toISOString(),
      status: "completed",
    };

    return agentStore.appendOperation(op);
  }

  // Dashboard Aggregates
  async getDashboardData(agentIdOrUserId: string, actorUserId: string): Promise<AgentDashboardData> {
    const profile = await this.assertAgentAuthorized(actorUserId, agentIdOrUserId);
    const agency = await agentStore.getOrganization(profile.agencyId);
    const linkages = await agentStore.listLinkages(profile.id);
    const operations = await agentStore.listOperations(profile.id);

    const totalLinkedFarmers = linkages.filter((l) => l.linkageType === "farmer").length;
    const totalLinkedCooperatives = linkages.filter((l) => l.linkageType === "cooperative").length;
    const totalLinkedWarehouses = linkages.filter((l) => l.linkageType === "warehouse").length;

    const totalVolumeAggregatedKg = operations
      .filter((op) => op.operationType !== "deliver_to_warehouse")
      .reduce((sum, op) => sum + op.quantityKg, 0);

    const totalVolumeDeliveredToWarehousesKg = operations
      .filter((op) => op.operationType === "deliver_to_warehouse")
      .reduce((sum, op) => sum + op.quantityKg, 0);

    const totalFeesPaidNgn = operations.reduce((sum, op) => sum + (op.feePaidNgn || 0), 0);

    return {
      profile,
      agency,
      metrics: {
        totalLinkedFarmers,
        totalLinkedCooperatives,
        totalLinkedWarehouses,
        totalVolumeAggregatedKg,
        totalVolumeDeliveredToWarehousesKg,
        totalFeesPaidNgn,
      },
      recentLinkages: linkages.slice(0, 10),
      recentOperations: operations.slice(0, 10),
    };
  }
}

export const agentService = new AgentService();
