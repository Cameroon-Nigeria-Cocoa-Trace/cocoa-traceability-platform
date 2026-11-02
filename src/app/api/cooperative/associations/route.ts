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

    if (searchQueryParam !== null) {
      const q = (searchQueryParam || "").trim().toLowerCase();
      if (!q) {
        return NextResponse.json({ success: true, organizations: [] });
      }

      const qDigits = q.replace(/\D/g, "");
      const allOrgsMap = new Map<string, any>();

      // 1. Check in-memory store
      try {
        const memoryOrgs = await cooperativeStore.searchOrganizations(q);
        memoryOrgs.forEach((o) => allOrgsMap.set(o.id, o));
      } catch {
        // Continue
      }

      // 2. Fetch from cooperative_organizations
      try {
        const snap = await firebaseAdminDb.collection("cooperative_organizations").get();
        snap.forEach((d) => {
          const data = d.data();
          allOrgsMap.set(d.id, { ...data, id: d.id });
        });
      } catch {
        // Continue
      }

      // 3. Fetch from cooperatives
      try {
        const coopSnap = await firebaseAdminDb.collection("cooperatives").get();
        coopSnap.forEach((d) => {
          const c = d.data();
          if (!allOrgsMap.has(d.id)) {
            allOrgsMap.set(d.id, {
              id: d.id,
              name: c.name || "Cooperative Society",
              registrationNumber: c.registrationNumber || "COOP-CMR",
              region: c.region || "South-West Region, Cameroon",
              headquartersAddress: c.headquartersAddress || "",
              contactEmail: c.contactEmail || "",
              contactPhone: c.contactPhone || "",
              accountType: c.accountType === "personal" ? "farm_group" : (c.accountType || "organizational"),
              status: c.status || "active",
              adminId: c.adminId || c.createdBy || "",
            });
          }
        });
      } catch {
        // Continue
      }

      // 4. Fetch from users with cooperative role
      try {
        const usersSnap = await firebaseAdminDb
          .collection("users")
          .where("role", "==", "cooperative")
          .get();

        usersSnap.forEach((d) => {
          const u = d.data();
          const orgId = u.cooperativeOrgId || `org_coop_${u.id}`;
          if (!allOrgsMap.has(orgId)) {
            allOrgsMap.set(orgId, {
              id: orgId,
              name: u.cooperativeOrgName || (u.displayName ? `${u.displayName}'s Farm Group` : "Cooperative Society"),
              registrationNumber: u.registrationNumber || "COOP-CMR-MEMBER",
              region: u.region || "South-West Region, Cameroon",
              headquartersAddress: u.headquartersAddress || "",
              contactEmail: u.email || "",
              contactPhone: u.phone || "",
              accountType: u.accountType === "personal" ? "farm_group" : (u.accountType || "organizational"),
              status: "active",
              representativeName: u.displayName || "",
              userId: u.id,
            });
          }
        });
      } catch {
        // Continue
      }

      // 5. Fetch from cooperative_profiles
      try {
        const profSnap = await firebaseAdminDb.collection("cooperative_profiles").get();
        profSnap.forEach((d) => {
          const p = d.data();
          const orgId = p.cooperativeOrgId || `org_coop_${p.userId}`;
          if (!allOrgsMap.has(orgId)) {
            allOrgsMap.set(orgId, {
              id: orgId,
              name: p.cooperativeOrgName || (p.fullName ? `${p.fullName}'s Farm Group` : "Cooperative Society"),
              registrationNumber: "COOP-CMR-MEMBER",
              region: "South-West Region, Cameroon",
              headquartersAddress: "",
              contactEmail: p.email || "",
              contactPhone: p.phone || "",
              accountType: p.accountType === "personal" ? "farm_group" : (p.accountType || "organizational"),
              status: p.status || "active",
              representativeName: p.fullName || "",
              userId: p.userId,
            });
          }
        });
      } catch {
        // Continue
      }

      // Filter strictly by search query (name, email, phone, reg, id, rep)
      const matched = Array.from(allOrgsMap.values()).filter((org) => {
        const orgNameStr = (org.name || org.cooperativeOrgName || "").toLowerCase();
        const nameMatch = orgNameStr.includes(q);

        const repNameStr = (org.representativeName || org.fullName || org.displayName || "").toLowerCase();
        const repMatch = repNameStr.includes(q);

        const emailMatch =
          (typeof org.contactEmail === "string" && org.contactEmail.toLowerCase().includes(q)) ||
          (typeof org.email === "string" && org.email.toLowerCase().includes(q));

        const regMatch = typeof org.registrationNumber === "string" && org.registrationNumber.toLowerCase().includes(q);
        const idMatch = typeof org.id === "string" && org.id.toLowerCase() === q;

        const phoneStr = (org.contactPhone || org.phone || "").toString();
        const phoneMatch = phoneStr.toLowerCase().includes(q);
        const digits = phoneStr.replace(/\D/g, "");
        const digitsMatch = qDigits.length >= 5 && digits.includes(qDigits);

        return nameMatch || repMatch || emailMatch || phoneMatch || digitsMatch || regMatch || idMatch;
      });

      return NextResponse.json({ success: true, organizations: matched });
    }

    if (listCooperatives === "true") {
      return NextResponse.json({ success: true, organizations: [] });
    }

    if (cooperativeOrgId || searchParams.get("userId") || searchParams.get("email")) {
      const coopUserId = searchParams.get("userId");
      const coopEmail = searchParams.get("email");

      const candidateIds = new Set<string>();
      if (cooperativeOrgId) candidateIds.add(cooperativeOrgId);
      if (coopUserId) {
        candidateIds.add(coopUserId);
        candidateIds.add(`org_coop_${coopUserId}`);
        candidateIds.add(`org_coop_${coopUserId.slice(0, 8)}`);
      }

      const allFoundAssocs: FarmerCooperativeAssociation[] = [];

      // 1. Check in-memory store for all candidate IDs
      for (const cid of candidateIds) {
        try {
          const memAssocs = await cooperativeStore.listAssociationsForCooperative(cid);
          allFoundAssocs.push(...memAssocs);
        } catch {
          // Continue
        }
      }

      // 2. Query Firestore farmerCooperativeAssociations
      try {
        const queries: Promise<any>[] = [];
        for (const cid of candidateIds) {
          queries.push(
            firebaseAdminDb.collection("farmerCooperativeAssociations").where("cooperativeOrgId", "==", cid).get()
          );
        }
        if (coopUserId) {
          queries.push(
            firebaseAdminDb.collection("farmerCooperativeAssociations").where("cooperativeUserId", "==", coopUserId).get()
          );
        }
        if (coopEmail) {
          queries.push(
            firebaseAdminDb.collection("farmerCooperativeAssociations").where("cooperativeEmail", "==", coopEmail).get()
          );
        }

        const snaps = await Promise.all(queries);
        for (const snap of snaps) {
          if (!snap.empty) {
            snap.forEach((d: any) => {
              allFoundAssocs.push(d.data() as FarmerCooperativeAssociation);
            });
          }
        }
      } catch (e) {
        console.warn("Firestore association query notice:", e);
      }

      // 3. Query cooperative_memberships
      try {
        const memQueries: Promise<any>[] = [];
        for (const cid of candidateIds) {
          memQueries.push(
            firebaseAdminDb.collection("cooperative_memberships").where("cooperativeOrgId", "==", cid).get()
          );
        }
        const memSnaps = await Promise.all(memQueries);
        for (const mSnap of memSnaps) {
          if (!mSnap.empty) {
            mSnap.forEach((d: any) => {
              const mem = d.data();
              if (mem.farmerId) {
                allFoundAssocs.push({
                  associationId: mem.id || `assoc_${mem.farmerId}`,
                  farmerId: mem.farmerId,
                  farmerName: mem.farmerName || "Member Farmer",
                  cooperativeOrgId: cooperativeOrgId || mem.cooperativeOrgId,
                  cooperativeUserId: coopUserId || undefined,
                  cooperativeOrgName: mem.cooperativeOrgName || "Cooperative Society",
                  cooperativeEmail: coopEmail || "",
                  cooperativePhone: "",
                  farmScope: "all",
                  delegatedFarmIds: ["ALL"],
                  manageEverything: true,
                  permissions: {
                    farmsManagement: true,
                    certificatesManagement: true,
                    productionInventory: true,
                    tradingManagement: true,
                  },
                  status: "active",
                  associatedAt: mem.joinedAt || new Date().toISOString(),
                  updatedAt: mem.updatedAt || new Date().toISOString(),
                });
              }
            });
          }
        }
      } catch (e) {
        console.warn("Memberships query notice:", e);
      }

      // 4. Query farms collection directly for any delegated farms
      try {
        const farmQueries: Promise<any>[] = [];
        for (const cid of candidateIds) {
          farmQueries.push(
            firebaseAdminDb.collection("farms").where("cooperativeOrgId", "==", cid).get()
          );
        }
        if (coopUserId) {
          farmQueries.push(
            firebaseAdminDb.collection("farms").where("cooperativeUserId", "==", coopUserId).get()
          );
        }
        if (coopEmail) {
          farmQueries.push(
            firebaseAdminDb.collection("farms").where("cooperativeEmail", "==", coopEmail).get()
          );
        }

        const farmSnaps = await Promise.all(farmQueries);
        for (const fSnap of farmSnaps) {
          if (!fSnap.empty) {
            fSnap.forEach((d: any) => {
              const f = d.data();
              if (f.farmerId) {
                allFoundAssocs.push({
                  associationId: `synth_assoc_${f.farmerId}_${d.id}`,
                  farmerId: f.farmerId,
                  farmerName: f.farmerName || "Member Farmer",
                  cooperativeOrgId: f.cooperativeOrgId || cooperativeOrgId || `org_coop_${coopUserId}`,
                  cooperativeUserId: coopUserId || undefined,
                  cooperativeOrgName: f.cooperative || "Cooperative Society",
                  cooperativeEmail: f.cooperativeEmail || coopEmail || "",
                  cooperativePhone: f.cooperativePhone || "",
                  farmScope: "single_farm",
                  delegatedFarmIds: [d.id],
                  delegatedFarmNames: [f.farmName || "Delegated Farm"],
                  manageEverything: true,
                  permissions: {
                    farmsManagement: true,
                    certificatesManagement: true,
                    productionInventory: true,
                    tradingManagement: true,
                  },
                  status: "active",
                  associatedAt: f.delegatedAt || f.createdAt || new Date().toISOString(),
                  updatedAt: f.updatedAt || new Date().toISOString(),
                });
              }
            });
          }
        }
      } catch (e) {
        console.warn("Direct farms query notice:", e);
      }

      // Deduplicate by farmerId
      const dedupCoopMap = new Map<string, FarmerCooperativeAssociation>();
      for (const a of allFoundAssocs) {
        if (a.status === "withdrawn" || a.status === "inactive") continue;
        const key = a.farmerId;
        if (!dedupCoopMap.has(key)) {
          dedupCoopMap.set(key, a);
        }
      }

      return NextResponse.json({ success: true, associations: Array.from(dedupCoopMap.values()) });
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

      // Deduplicate by cooperativeOrgId or cooperativeOrgName
      const dedupFarmerMap = new Map<string, FarmerCooperativeAssociation>();
      for (const a of associations) {
        if (a.status === "withdrawn" || a.status === "inactive") continue;
        const key = a.cooperativeOrgId || a.cooperativeOrgName;
        if (!dedupFarmerMap.has(key)) {
          dedupFarmerMap.set(key, a);
        }
      }

      return NextResponse.json({ success: true, associations: Array.from(dedupFarmerMap.values()) });
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
      cooperativeUserId,
      permissions,
      associationId,
      farmScope,
      delegatedFarmIds,
      delegatedFarmNames,
      manageEverything,
    } = body;

    if (action === "associate") {
      const now = new Date().toISOString();
      const assoc: FarmerCooperativeAssociation & { cooperativeUserId?: string } = {
        associationId: associationId || `assoc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        farmerId,
        farmerName: farmerName || "Farmer",
        cooperativeOrgId,
        cooperativeUserId: cooperativeUserId || undefined,
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
        // Write single authoritative association document
        const key = `${assoc.farmerId}_${assoc.cooperativeOrgId}`;
        await firebaseAdminDb.collection("farmerCooperativeAssociations").doc(key).set(assoc);

        // Delete any legacy duplicate document keyed by userId
        if (cooperativeUserId && cooperativeUserId !== assoc.cooperativeOrgId) {
          const userKey = `${assoc.farmerId}_${cooperativeUserId}`;
          await firebaseAdminDb.collection("farmerCooperativeAssociations").doc(userKey).delete().catch(() => {});
        }

        // Also update the farms collection to register the cooperative linkage & permissions
        const targetFarmIds = assoc.farmScope === "single_farm" && Array.isArray(assoc.delegatedFarmIds)
          ? assoc.delegatedFarmIds.filter((id) => id !== "ALL")
          : [];

        if (targetFarmIds.length > 0) {
          for (const fId of targetFarmIds) {
            await firebaseAdminDb.collection("farms").doc(fId).set({
              cooperative: assoc.cooperativeOrgName,
              cooperativeOrgId: assoc.cooperativeOrgId,
              cooperativeUserId: assoc.cooperativeUserId || "",
              cooperativeEmail: assoc.cooperativeEmail,
              cooperativePhone: assoc.cooperativePhone,
              cooperativeDelegated: true,
              delegatedAt: now,
              updatedAt: now,
            }, { merge: true });
          }
        } else if (assoc.farmScope === "all") {
          const farmerFarmsSnap = await firebaseAdminDb.collection("farms").where("farmerId", "==", assoc.farmerId).get();
          for (const farmDoc of farmerFarmsSnap.docs) {
            await farmDoc.ref.set({
              cooperative: assoc.cooperativeOrgName,
              cooperativeOrgId: assoc.cooperativeOrgId,
              cooperativeUserId: assoc.cooperativeUserId || "",
              cooperativeEmail: assoc.cooperativeEmail,
              cooperativePhone: assoc.cooperativePhone,
              cooperativeDelegated: true,
              delegatedAt: now,
              updatedAt: now,
            }, { merge: true });
          }
        }
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
        if (body.cooperativeUserId) {
          await firebaseAdminDb.collection("farmerCooperativeAssociations").doc(`${farmerId}_${body.cooperativeUserId}`).delete().catch(() => {});
        }
        // Also delete any duplicate docs for this farmer and cooperative
        const leftovers = await firebaseAdminDb
          .collection("farmerCooperativeAssociations")
          .where("farmerId", "==", farmerId)
          .where("cooperativeOrgId", "==", cooperativeOrgId)
          .get();
        for (const d of leftovers.docs) {
          await d.ref.delete().catch(() => {});
        }
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
