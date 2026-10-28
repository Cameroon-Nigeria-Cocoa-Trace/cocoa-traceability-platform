import { NextRequest, NextResponse } from "next/server";
import { cooperativeService } from "@/lib/cooperative/cooperativeService";
import { cooperativeStore } from "@/lib/cooperative/cooperativeStore";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId") || req.headers.get("x-user-uid");
    if (!userId) {
      return NextResponse.json({ success: false, error: "userId parameter is required." }, { status: 400 });
    }
    const profile = await cooperativeStore.getProfile(userId);
    return NextResponse.json({ success: true, profile });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.action === "create_organization") {
      const org = await cooperativeService.createOrganization(body);
      // Persist to Firestore via firebaseAdminDb as well
      try {
        const { firebaseAdminDb } = await import("@/lib/firebaseAdmin");
        const orgData = {
          ...org,
          country: body.country || "Cameroon",
          division: body.division || "Manyu Division",
          locality: body.locality || "Mamfe Central",
          accountType: body.accountType || "organizational",
          updatedAt: new Date().toISOString(),
        };
        await firebaseAdminDb.collection("cooperative_organizations").doc(org.id).set(orgData, { merge: true });
        await firebaseAdminDb.collection("cooperatives").doc(org.id).set(orgData, { merge: true });
      } catch (adminErr) {
        console.warn("firebaseAdmin notice saving organization:", adminErr);
      }
      return NextResponse.json({ success: true, organization: org });
    }

    const profile = await cooperativeService.registerProfile(body);
    // Persist to Firestore via firebaseAdminDb as well
    try {
      const { firebaseAdminDb } = await import("@/lib/firebaseAdmin");
      const profileData = {
        ...profile,
        updatedAt: new Date().toISOString(),
      };
      await firebaseAdminDb.collection("cooperative_profiles").doc(profile.id).set(profileData, { merge: true });
      await firebaseAdminDb.collection("cooperative_profiles").doc(`coop_usr_${profile.userId}`).set(profileData, { merge: true });
      // Update user document to explicitly set role: "cooperative"
      await firebaseAdminDb.collection("users").doc(profile.userId).set({
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
      }, { merge: true });
    } catch (adminErr) {
      console.warn("firebaseAdmin notice saving profile & user:", adminErr);
    }

    return NextResponse.json({ success: true, profile });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
