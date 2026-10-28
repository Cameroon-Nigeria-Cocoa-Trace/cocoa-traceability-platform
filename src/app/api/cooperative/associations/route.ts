import { NextRequest, NextResponse } from "next/server";
import { cooperativeStore } from "@/lib/cooperative/cooperativeStore";
import { FarmerCooperativeAssociation } from "@/types/cooperative";
import { firebaseAdminDb } from "@/lib/firebaseAdmin";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const farmerId = searchParams.get("farmerId");
    const cooperativeOrgId = searchParams.get("cooperativeOrgId");
    const listCooperatives = searchParams.get("listCooperatives");

    const searchQueryParam = searchParams.get("searchQuery");

    if (searchQueryParam !== null || listCooperatives === "true") {
      const orgs = await cooperativeStore.searchOrganizations(searchQueryParam || "");
      // Also fetch from firebaseAdminDb cooperatives and cooperative_organizations
      const allOrgsMap = new Map<string, any>();
      orgs.forEach((o) => allOrgsMap.set(o.id, o));
      try {
        const snap = await firebaseAdminDb.collection("cooperative_organizations").get();
        snap.forEach((d) => allOrgsMap.set(d.id, { ...d.data(), id: d.id }));
        const coopSnap = await firebaseAdminDb.collection("cooperatives").get();
        coopSnap.forEach((d) => {
          const c = d.data();
          if (!allOrgsMap.has(d.id)) {
            allOrgsMap.set(d.id, {
              id: d.id,
              name: c.name || "Cooperative Society",
              registrationNumber: c.registrationNumber || "COOP-CMR",
              region: c.region || "South-West Region",
              headquartersAddress: c.headquartersAddress || "",
              contactEmail: c.contactEmail || "",
              contactPhone: c.contactPhone || "",
              status: c.status || "active",
            });
          }
        });
      } catch {
        // Fallback to in-memory
      }
      return NextResponse.json({ success: true, organizations: Array.from(allOrgsMap.values()) });
    }

    if (cooperativeOrgId) {
      let associations = await cooperativeStore.listAssociationsForCooperative(cooperativeOrgId);
      if (associations.length === 0) {
        try {
          const snap = await firebaseAdminDb
            .collection("farmerCooperativeAssociations")
            .where("cooperativeOrgId", "==", cooperativeOrgId)
            .get();
          if (!snap.empty) {
            associations = snap.docs.map((d) => d.data() as FarmerCooperativeAssociation);
          }
        } catch {
          // Continue
        }
      }
      return NextResponse.json({ success: true, associations });
    }

    if (farmerId) {
      let associations = await cooperativeStore.listAssociationsForFarmer(farmerId);
      if (associations.length === 0) {
        try {
          const snap = await firebaseAdminDb
            .collection("farmerCooperativeAssociations")
            .where("farmerId", "==", farmerId)
            .get();
          if (!snap.empty) {
            associations = snap.docs.map((d) => d.data() as FarmerCooperativeAssociation);
          }
        } catch {
          // Continue
        }
      }
      return NextResponse.json({ success: true, associations });
    }

    return NextResponse.json({ success: false, error: "farmerId, cooperativeOrgId, or search query is required." }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      action,
      farmerId,
      farmerName,
      cooperativeOrgId,
      cooperativeOrgName,
      cooperativeEmail,
      cooperativePhone,
      permissions,
      associationId,
      farmScope,
      delegatedFarmIds,
      delegatedFarmNames,
      manageEverything,
    } = body;

    if (action === "associate") {
      const now = new Date().toISOString();
      const assoc: FarmerCooperativeAssociation = {
        associationId: associationId || `assoc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        farmerId,
        farmerName: farmerName || "Farmer",
        cooperativeOrgId,
        cooperativeOrgName,
        cooperativeEmail: cooperativeEmail || "",
        cooperativePhone: cooperativePhone || "",
        farmScope: farmScope || "all",
        delegatedFarmIds: Array.isArray(delegatedFarmIds) ? delegatedFarmIds : ["ALL"],
        delegatedFarmNames: Array.isArray(delegatedFarmNames) ? delegatedFarmNames : [],
        manageEverything: manageEverything !== undefined ? Boolean(manageEverything) : true,
        permissions: permissions || {
          farmsManagement: true,
          certificatesManagement: true,
          productionInventory: true,
          tradingManagement: true,
        },
        status: "active",
        associatedAt: now,
        updatedAt: now,
      };
      await cooperativeStore.saveAssociation(assoc);
      try {
        const key = `${assoc.farmerId}_${assoc.cooperativeOrgId}`;
        await firebaseAdminDb.collection("farmerCooperativeAssociations").doc(key).set(assoc);
      } catch {
        // Fallback already handled
      }
      return NextResponse.json({ success: true, association: assoc });
    }

    if (action === "update_permissions") {
      const assoc: FarmerCooperativeAssociation = {
        associationId,
        farmerId,
        farmerName,
        cooperativeOrgId,
        cooperativeOrgName,
        cooperativeEmail,
        cooperativePhone,
        farmScope: farmScope || "all",
        delegatedFarmIds: Array.isArray(delegatedFarmIds) ? delegatedFarmIds : ["ALL"],
        delegatedFarmNames: Array.isArray(delegatedFarmNames) ? delegatedFarmNames : [],
        manageEverything: manageEverything !== undefined ? Boolean(manageEverything) : true,
        permissions: permissions || {
          farmsManagement: true,
          certificatesManagement: true,
          productionInventory: true,
          tradingManagement: true,
        },
        status: "active",
        associatedAt: body.associatedAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await cooperativeStore.saveAssociation(assoc);
      try {
        const key = `${assoc.farmerId}_${assoc.cooperativeOrgId}`;
        await firebaseAdminDb.collection("farmerCooperativeAssociations").doc(key).set(assoc);
      } catch {
        // Fallback already handled
      }
      return NextResponse.json({ success: true, association: assoc });
    }

    if (action === "unlink") {
      const key = `${farmerId}_${cooperativeOrgId}`;
      try {
        await firebaseAdminDb.collection("farmerCooperativeAssociations").doc(key).delete();
      } catch (err) {
        console.warn("Notice deleting association in admin DB:", err);
      }
      return NextResponse.json({ success: true, message: "Association unlinked successfully." });
    }

    return NextResponse.json({ success: false, error: "Invalid action." }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
