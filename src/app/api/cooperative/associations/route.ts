import { NextRequest, NextResponse } from "next/server";
import { cooperativeStore } from "@/lib/cooperative/cooperativeStore";
import { FarmerCooperativeAssociation } from "@/types/cooperative";
import { firebaseAdminDb } from "@/lib/firebaseAdmin";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const farmerId = searchParams.get("farmerId");
    const cooperativeOrgId = searchParams.get("cooperativeOrgId");
    const searchQuery = searchParams.get("search");

    if (searchQuery) {
      const orgs = await cooperativeStore.searchOrganizations(searchQuery);
      return NextResponse.json({ success: true, organizations: orgs });
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
    const { action, farmerId, farmerName, cooperativeOrgId, cooperativeOrgName, cooperativeEmail, cooperativePhone, permissions, associationId } = body;

    if (action === "associate") {
      const now = new Date().toISOString();
      const assoc: FarmerCooperativeAssociation = {
        associationId: associationId || `assoc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        farmerId,
        farmerName: farmerName || "Farmer",
        cooperativeOrgId,
        cooperativeOrgName,
        cooperativeEmail,
        cooperativePhone,
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
        permissions,
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

    return NextResponse.json({ success: false, error: "Invalid action." }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
