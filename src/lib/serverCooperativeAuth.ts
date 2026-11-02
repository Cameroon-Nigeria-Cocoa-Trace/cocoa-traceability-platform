import { firebaseAdminAuth, firebaseAdminDb } from "@/lib/firebaseAdmin";

export interface CooperativeActorInfo {
  isCooperative: boolean;
  isAdmin: boolean;
  cooperativeOrgIds: string[];
  primaryOrgId?: string;
}

/**
 * Checks if a user has platform administrator privileges via custom claims or admin documents.
 */
export async function isPlatformAdmin(userId: string): Promise<boolean> {
  if (!userId || !userId.trim()) return false;
  const cleanUid = userId.trim();

  try {
    const userRecord = await firebaseAdminAuth.getUser(cleanUid);
    if (userRecord.customClaims?.admin === true) {
      return true;
    }
  } catch {
    // Continue to database check
  }

  try {
    const adminDoc = await firebaseAdminDb.collection("admins").doc(cleanUid).get();
    if (adminDoc.exists) return true;

    const userDoc = await firebaseAdminDb.collection("users").doc(cleanUid).get();
    if (userDoc.exists) {
      const role = userDoc.data()?.role || userDoc.data()?.accountType;
      if (role === "admin") return true;
    }
  } catch {
    // Fails safe
  }

  return false;
}

/**
 * Retrieves cooperative profile and associated cooperative organization IDs for an actor.
 */
export async function getCooperativeActorInfo(userId: string): Promise<CooperativeActorInfo> {
  if (!userId || !userId.trim()) {
    return { isCooperative: false, isAdmin: false, cooperativeOrgIds: [] };
  }
  const cleanUid = userId.trim();

  const isAdmin = await isPlatformAdmin(cleanUid);

  const orgIds = new Set<string>();
  let isCoop = false;
  let primaryOrgId: string | undefined;

  try {
    // Check users collection
    const userDoc = await firebaseAdminDb.collection("users").doc(cleanUid).get();
    if (userDoc.exists) {
      const uData = userDoc.data();
      const role = uData?.role || uData?.accountType;
      if (
        role === "cooperative" ||
        uData?.isCooperative === true ||
        uData?.accountType === "cooperative"
      ) {
        isCoop = true;
        // The user ID itself can act as a direct cooperative holder ID
        orgIds.add(cleanUid);
      }
      if (uData?.cooperativeOrgId) {
        orgIds.add(String(uData.cooperativeOrgId));
        primaryOrgId = String(uData.cooperativeOrgId);
      }
      if (uData?.cooperativeId) {
        orgIds.add(String(uData.cooperativeId));
      }
      if (uData?.organizationId) {
        orgIds.add(String(uData.organizationId));
      }
    }
  } catch {
    // Continue
  }

  try {
    // Check cooperative_profiles collection
    const profileSnap = await firebaseAdminDb.collection("cooperative_profiles").doc(cleanUid).get();
    if (profileSnap.exists) {
      const pData = profileSnap.data();
      isCoop = true;
      orgIds.add(cleanUid);
      if (pData?.cooperativeOrgId) {
        orgIds.add(String(pData.cooperativeOrgId));
        if (!primaryOrgId) primaryOrgId = String(pData.cooperativeOrgId);
      }
    }

    const altProfileSnap = await firebaseAdminDb
      .collection("cooperative_profiles")
      .doc(`coop_usr_${cleanUid}`)
      .get();
    if (altProfileSnap.exists) {
      const pData = altProfileSnap.data();
      isCoop = true;
      orgIds.add(cleanUid);
      if (pData?.cooperativeOrgId) {
        orgIds.add(String(pData.cooperativeOrgId));
        if (!primaryOrgId) primaryOrgId = String(pData.cooperativeOrgId);
      }
    }
  } catch {
    // Continue
  }

  try {
    // Check cooperatives or cooperative_organizations created by or associated with user
    const coopCreatedSnap = await firebaseAdminDb
      .collection("cooperatives")
      .where("createdBy", "==", cleanUid)
      .get();
    coopCreatedSnap.forEach((doc) => {
      isCoop = true;
      orgIds.add(doc.id);
    });

    const orgCreatedSnap = await firebaseAdminDb
      .collection("cooperative_organizations")
      .where("createdBy", "==", cleanUid)
      .get();
    orgCreatedSnap.forEach((doc) => {
      isCoop = true;
      orgIds.add(doc.id);
    });
  } catch {
    // Continue
  }

  return {
    isCooperative: isCoop,
    isAdmin,
    cooperativeOrgIds: Array.from(orgIds),
    primaryOrgId,
  };
}

/**
 * Checks whether an actor is authorized for a specific farmer (either owner, admin, or affiliated cooperative).
 */
export async function isCooperativeAuthorizedForFarmer(
  actorUserId: string,
  farmerId: string
): Promise<boolean> {
  if (!actorUserId || !farmerId) return false;
  const cleanActor = actorUserId.trim();
  const cleanFarmer = farmerId.trim();

  if (cleanActor === cleanFarmer) return true;

  const actorInfo = await getCooperativeActorInfo(cleanActor);
  if (actorInfo.isAdmin) return true;
  if (!actorInfo.isCooperative && actorInfo.cooperativeOrgIds.length === 0) return false;

  const coopIds = new Set<string>([cleanActor, ...actorInfo.cooperativeOrgIds]);

  try {
    // 1. Direct composite key lookup in farmerCooperativeAssociations
    for (const cId of coopIds) {
      const directKey = `${cleanFarmer}_${cId}`;
      const assocSnap = await firebaseAdminDb
        .collection("farmerCooperativeAssociations")
        .doc(directKey)
        .get();
      if (assocSnap.exists && assocSnap.data()?.status === "active") {
        return true;
      }
    }

    // 2. Query farmerCooperativeAssociations by farmerId
    const assocQuery = await firebaseAdminDb
      .collection("farmerCooperativeAssociations")
      .where("farmerId", "==", cleanFarmer)
      .where("status", "==", "active")
      .get();

    for (const doc of assocQuery.docs) {
      const data = doc.data();
      if (
        coopIds.has(data.cooperativeUserId) ||
        coopIds.has(data.cooperativeOrgId) ||
        coopIds.has(data.cooperativeId)
      ) {
        return true;
      }
    }

    // 3. Query cooperative_memberships by farmerId
    const memQuery = await firebaseAdminDb
      .collection("cooperative_memberships")
      .where("farmerId", "==", cleanFarmer)
      .where("status", "==", "active")
      .get();

    for (const doc of memQuery.docs) {
      const data = doc.data();
      if (coopIds.has(data.cooperativeOrgId) || coopIds.has(data.cooperativeId)) {
        return true;
      }
    }

    // 4. Check user profile of the farmer
    const farmerUserDoc = await firebaseAdminDb.collection("users").doc(cleanFarmer).get();
    if (farmerUserDoc.exists) {
      const fData = farmerUserDoc.data();
      if (
        coopIds.has(fData?.cooperativeOrgId) ||
        coopIds.has(fData?.cooperativeId) ||
        coopIds.has(fData?.cooperativeUserId)
      ) {
        return true;
      }
    }

    // 5. Check if any farm registered to this farmer explicitly lists this cooperative
    const farmQuery = await firebaseAdminDb
      .collection("farms")
      .where("farmerId", "==", cleanFarmer)
      .limit(10)
      .get();

    for (const farmDoc of farmQuery.docs) {
      const f = farmDoc.data();
      if (
        coopIds.has(f.cooperativeUserId) ||
        coopIds.has(f.cooperativeOrgId) ||
        coopIds.has(f.cooperativeId)
      ) {
        return true;
      }
    }
  } catch (err) {
    console.warn("isCooperativeAuthorizedForFarmer check notice:", err);
  }

  return false;
}

/**
 * Checks whether an actor is authorized for a specific farm (as farmer, admin, or affiliated cooperative).
 */
export async function isCooperativeAuthorizedForFarm(
  actorUserId: string,
  farm: Record<string, unknown>
): Promise<boolean> {
  if (!actorUserId || !farm) return false;
  const cleanActor = actorUserId.trim();

  const farmerId = typeof farm.farmerId === "string" ? farm.farmerId.trim() : "";
  if (farmerId && cleanActor === farmerId) return true;

  const actorInfo = await getCooperativeActorInfo(cleanActor);
  if (actorInfo.isAdmin) return true;
  if (!actorInfo.isCooperative && actorInfo.cooperativeOrgIds.length === 0) return false;

  const coopIds = new Set<string>([cleanActor, ...actorInfo.cooperativeOrgIds]);

  // Check direct farm fields
  if (
    (typeof farm.cooperativeUserId === "string" && coopIds.has(farm.cooperativeUserId)) ||
    (typeof farm.cooperativeOrgId === "string" && coopIds.has(farm.cooperativeOrgId)) ||
    (typeof farm.cooperativeId === "string" && coopIds.has(farm.cooperativeId))
  ) {
    return true;
  }

  // Check if farm cooperativeOrgId contains cooperative ID string
  if (typeof farm.cooperativeOrgId === "string") {
    for (const cId of coopIds) {
      if (farm.cooperativeOrgId.includes(cId)) return true;
    }
  }

  // Check farmer affiliation
  if (farmerId) {
    return isCooperativeAuthorizedForFarmer(cleanActor, farmerId);
  }

  return false;
}

/**
 * Checks whether an actor is authorized to access or manage a CertificateHolding.
 */
export async function isCooperativeAuthorizedForHolding(
  actorUserId: string,
  holding: { holderId?: string; holderType?: string; lotId?: string }
): Promise<boolean> {
  if (!actorUserId || !holding || !holding.holderId) return false;
  const cleanActor = actorUserId.trim();
  const cleanHolderId = holding.holderId.trim();

  if (cleanActor === cleanHolderId) return true;

  const actorInfo = await getCooperativeActorInfo(cleanActor);
  if (actorInfo.isAdmin) return true;

  const coopIds = new Set<string>([cleanActor, ...actorInfo.cooperativeOrgIds]);
  if (coopIds.has(cleanHolderId)) return true;

  const holderType = (holding.holderType || "").toLowerCase();
  if (holderType === "farmer") {
    return isCooperativeAuthorizedForFarmer(cleanActor, cleanHolderId);
  }

  return false;
}

/**
 * Retrieves all affiliated member farmer IDs for a cooperative actor.
 */
export async function getAffiliatedFarmerIds(actorUserId: string): Promise<string[]> {
  const cleanActor = actorUserId.trim();
  const actorInfo = await getCooperativeActorInfo(cleanActor);
  if (!actorInfo.isCooperative && actorInfo.cooperativeOrgIds.length === 0) {
    return [];
  }

  const coopIds = new Set<string>([cleanActor, ...actorInfo.cooperativeOrgIds]);
  const farmerIds = new Set<string>();

  try {
    // 1. Query farmerCooperativeAssociations
    const [assocByCoopUser, assocByOrg] = await Promise.all([
      firebaseAdminDb
        .collection("farmerCooperativeAssociations")
        .where("cooperativeUserId", "==", cleanActor)
        .where("status", "==", "active")
        .get(),
      Promise.all(
        actorInfo.cooperativeOrgIds.map((orgId) =>
          firebaseAdminDb
            .collection("farmerCooperativeAssociations")
            .where("cooperativeOrgId", "==", orgId)
            .where("status", "==", "active")
            .get()
        )
      ),
    ]);

    assocByCoopUser.forEach((doc) => {
      const fid = doc.data().farmerId;
      if (fid) farmerIds.add(fid);
    });

    for (const snap of assocByOrg) {
      snap.forEach((doc) => {
        const fid = doc.data().farmerId;
        if (fid) farmerIds.add(fid);
      });
    }

    // 2. Query cooperative_memberships
    const memSnaps = await Promise.all(
      Array.from(coopIds).map((id) =>
        firebaseAdminDb
          .collection("cooperative_memberships")
          .where("cooperativeOrgId", "==", id)
          .where("status", "==", "active")
          .get()
      )
    );

    for (const snap of memSnaps) {
      snap.forEach((doc) => {
        const fid = doc.data().farmerId;
        if (fid) farmerIds.add(fid);
      });
    }

    // 3. Query farms affiliated with this cooperative
    const farmSnaps = await Promise.all([
      firebaseAdminDb.collection("farms").where("cooperativeUserId", "==", cleanActor).get(),
      ...actorInfo.cooperativeOrgIds.map((orgId) =>
        firebaseAdminDb.collection("farms").where("cooperativeOrgId", "==", orgId).get()
      ),
    ]);

    for (const snap of farmSnaps) {
      snap.forEach((doc) => {
        const fid = doc.data().farmerId;
        if (fid) farmerIds.add(fid);
      });
    }
  } catch (err) {
    console.warn("Error resolving affiliated farmer IDs for cooperative:", err);
  }

  return Array.from(farmerIds);
}

/**
 * Retrieves all affiliated farm IDs for a cooperative actor.
 */
export async function getAffiliatedFarmIds(actorUserId: string): Promise<string[]> {
  const cleanActor = actorUserId.trim();
  const actorInfo = await getCooperativeActorInfo(cleanActor);
  if (!actorInfo.isCooperative && actorInfo.cooperativeOrgIds.length === 0) {
    return [];
  }

  const farmIds = new Set<string>();

  try {
    // 1. Direct cooperative links on farms
    const farmSnaps = await Promise.all([
      firebaseAdminDb.collection("farms").where("cooperativeUserId", "==", cleanActor).get(),
      ...actorInfo.cooperativeOrgIds.map((orgId) =>
        firebaseAdminDb.collection("farms").where("cooperativeOrgId", "==", orgId).get()
      ),
    ]);

    for (const snap of farmSnaps) {
      snap.forEach((doc) => farmIds.add(doc.id));
    }

    // 2. Farms belonging to affiliated farmers
    const memberFarmerIds = await getAffiliatedFarmerIds(cleanActor);
    const chunkedFarmers: string[][] = [];
    for (let i = 0; i < memberFarmerIds.length; i += 10) {
      chunkedFarmers.push(memberFarmerIds.slice(i, i + 10));
    }

    for (const chunk of chunkedFarmers) {
      if (chunk.length === 0) continue;
      const snap = await firebaseAdminDb
        .collection("farms")
        .where("farmerId", "in", chunk)
        .get();
      snap.forEach((doc) => farmIds.add(doc.id));
    }
  } catch (err) {
    console.warn("Error resolving affiliated farm IDs for cooperative:", err);
  }

  return Array.from(farmIds);
}
