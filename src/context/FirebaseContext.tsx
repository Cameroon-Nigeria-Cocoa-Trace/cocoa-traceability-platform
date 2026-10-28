/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { CooperativeProfile } from "@/types/cooperative";
import {
  auth,
  db,
  loginWithGoogle as authLoginWithGoogle,
  loginWithEmail as authLoginWithEmail,
  signUpWithEmail as authSignUpWithEmail,
  checkRedirectAuthResult,
  logoutUser,
} from "@/lib/firebase";
import { Product } from "@/data/products";
import { validateCameroonFarmLocation } from "@/lib/geo/cameroonBoundary";
import {
  savePendingFarmDraft,
  getPendingFarmDrafts,
  removePendingFarmDraft,
  PendingFarmDraft,
} from "@/lib/cocoaDb";

export interface FarmRecord {
  id: string;
  farmUniqueId?: string;
  farmerId: string;
  farmerName?: string;
  farmerPhone?: string;
  farmerEmail?: string;
  farmName: string;
  region: string;
  village?: string;
  lga?: string;
  state?: string;
  cooperative?: string;
  geolocation: string;
  sizeHectares?: number;
  registrationDate?: string;
  cocoaVariety?: string;
  harvestSeason?: string;
  estimatedAnnualYieldKg?: number;
  quantityHarvestedKg?: number;
  batchNumber?: string;
  aggregatorCenter?: string;
  batchMovementRoute?: string;
  processorExporter?: string;
  designatedBuyer?: string;
  landDocType?: string;
  landDocReference?: string;
  deforestationRisk?: string;
  auditStatus?: string;
  auditCertificateNumber?: string;
  auditorName?: string;
  auditDate?: string;
  paymentMethod?: string;
  transactionReference?: string;
  transactionAmount?: string;
  eudrCompliant?: boolean;
  geofencePolygon?: [number, number][];
  geofenceAreaHa?: number;
  geofencePointCount?: number;
  createdAt: string;
}

export interface UserProfileData {
  id: string;
  displayName: string;
  email: string;
  role: "farmer" | "cooperative" | "buyer" | "admin";
  accountType?: string;
  cooperativeOrgId?: string;
  cooperativeOrgName?: string;
}

interface FirebaseContextType {
  user: User | null;
  loading: boolean;
  userRole: "farmer" | "cooperative" | "buyer" | "admin";
  isCooperative: boolean;
  userProfile: UserProfileData | null;
  cooperativeProfile: CooperativeProfile | null;
  setUserRole: (role: "farmer" | "cooperative") => void;
  login: () => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string, displayName?: string) => Promise<void>;
  loginAsDemo: (profile?: { displayName?: string; email?: string }) => void;
  logout: () => Promise<void>;
  lots: Product[];
  farms: FarmRecord[];
  pendingDrafts: PendingFarmDraft[];
  syncPendingDrafts: () => Promise<void>;
  registerFarm: (farm: Omit<FarmRecord, "id" | "farmerId" | "createdAt">) => Promise<FarmRecord>;
  updateFarm: (farmId: string, updates: Partial<Omit<FarmRecord, "id" | "farmerId" | "createdAt">>) => Promise<void>;
}

const FirebaseContext = createContext<FirebaseContextType>({
  user: null,
  loading: true,
  userRole: "farmer",
  isCooperative: false,
  userProfile: null,
  cooperativeProfile: null,
  setUserRole: () => {},
  login: async () => {},
  loginWithGoogle: async () => {},
  loginWithEmail: async () => {},
  signUpWithEmail: async () => {},
  loginAsDemo: () => {},
  logout: async () => {},
  lots: [],
  farms: [],
  pendingDrafts: [],
  syncPendingDrafts: async () => {},
  registerFarm: async () => {
    throw new Error("Provider not initialized");
  },
  updateFarm: async () => {
    throw new Error("Provider not initialized");
  },
});

export function FirebaseProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRoleState] = useState<"farmer" | "cooperative" | "buyer" | "admin">(() => {
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem("cocoatrace_user_role");
      if (cached === "cooperative" || cached === "farmer" || cached === "buyer" || cached === "admin") {
        return cached;
      }
    }
    return "farmer";
  });
  const [userProfile, setUserProfile] = useState<UserProfileData | null>(null);
  const [cooperativeProfile, setCooperativeProfile] = useState<CooperativeProfile | null>(null);
  const [lots] = useState<Product[]>([]);
  const [farms, setFarms] = useState<FarmRecord[]>([]);
  const [pendingDrafts, setPendingDrafts] = useState<PendingFarmDraft[]>([]);

  const setUserRole = useCallback((newRole: "farmer" | "cooperative") => {
    setUserRoleState(newRole);
    if (typeof window !== "undefined") {
      localStorage.setItem("cocoatrace_user_role", newRole);
    }
    if (auth.currentUser?.uid) {
      updateDoc(doc(db, "users", auth.currentUser.uid), {
        role: newRole,
        accountType: newRole,
      }).catch(() => {});
    }
  }, []);

  // Auth Listener and Redirect Handler
  useEffect(() => {
    // Check redirect result
    checkRedirectAuthResult().catch((err) => {
      console.warn("Redirect result check warning:", err);
    });

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      // Never retain the previous account's farms across auth changes.
      setFarms([]);
      if (currentUser) {
        setUser(currentUser);
        if (typeof window !== "undefined") {
          localStorage.setItem(
            "cocoatrace_auth_user",
            JSON.stringify({
              uid: currentUser.uid,
              displayName: currentUser.displayName,
              email: currentUser.email,
            })
          );
        }

        // Check cooperative profile by userId or email in Firestore
        let coopProf: CooperativeProfile | null = null;
        let coopOrgId: string | undefined = undefined;
        let coopOrgName: string | undefined = undefined;

        try {
          // Direct cooperative_profiles lookup
          const coopProfSnap = await getDoc(doc(db, "cooperative_profiles", `coop_usr_${currentUser.uid}`));
          if (coopProfSnap.exists()) {
            coopProf = coopProfSnap.data() as CooperativeProfile;
          } else {
            const q = query(collection(db, "cooperative_profiles"), where("userId", "==", currentUser.uid));
            const qs = await getDocs(q);
            if (!qs.empty) {
              coopProf = qs.docs[0].data() as CooperativeProfile;
            }
          }
        } catch {
          // Fallback handled
        }

        if (!coopProf) {
          try {
            const orgQ = query(collection(db, "cooperative_organizations"), where("createdBy", "==", currentUser.uid));
            const orgQs = await getDocs(orgQ);
            if (!orgQs.empty) {
              const orgData = orgQs.docs[0].data();
              coopOrgId = orgData.id;
              coopOrgName = orgData.name;
            }
          } catch {
            // Fallback handled
          }
        }

        // Sync user document safely in Firestore adhering to security rules
        try {
          const userRef = doc(db, "users", currentUser.uid);
          const userSnap = await getDoc(userRef);

          const cachedRole = typeof window !== "undefined" ? localStorage.getItem("cocoatrace_user_role") : null;
          let roleToSet: "farmer" | "cooperative" | "buyer" | "admin" = "farmer";

          if (userSnap.exists()) {
            const existingData = userSnap.data();

            // Specifically repair user account if it was previously corrupted to cooperative
            if (currentUser.email === "afumbomboyo@gmail.com") {
              roleToSet = "farmer";
            } else if (existingData.role === "farmer" || existingData.accountType === "farmer") {
              roleToSet = "farmer";
            } else if (existingData.role === "cooperative" || existingData.accountType === "cooperative") {
              roleToSet = "cooperative";
            } else if (existingData.role) {
              roleToSet = existingData.role as "farmer" | "cooperative" | "buyer" | "admin";
            } else if (coopProf || coopOrgId) {
              roleToSet = "cooperative";
            } else {
              roleToSet = "farmer";
            }

            if (
              currentUser.displayName &&
              existingData.displayName !== currentUser.displayName
            ) {
              await updateDoc(userRef, {
                displayName: currentUser.displayName,
                role: roleToSet,
                accountType: roleToSet,
              });
            } else if (existingData.role !== roleToSet) {
              await updateDoc(userRef, {
                role: roleToSet,
                accountType: roleToSet,
              });
            }

            setUserProfile({
              id: currentUser.uid,
              displayName: currentUser.displayName || existingData.displayName || "User",
              email: currentUser.email || existingData.email || "",
              role: roleToSet,
              accountType: roleToSet,
              cooperativeOrgId: existingData.cooperativeOrgId || coopProf?.cooperativeOrgId || coopOrgId,
              cooperativeOrgName: existingData.cooperativeOrgName || coopProf?.cooperativeOrgName || coopOrgName,
            });
            const cachedPendingRole = typeof window !== "undefined" ? localStorage.getItem("cocoatrace_pending_role") : null;
            if (currentUser.email === "afumbomboyo@gmail.com") {
              roleToSet = "farmer";
            } else if (cachedRole === "cooperative" || cachedPendingRole === "cooperative" || coopProf || coopOrgId) {
              roleToSet = "cooperative";
            } else {
              roleToSet = "farmer";
            }

            const newProf: UserProfileData = {
              id: currentUser.uid,
              displayName: currentUser.displayName || "User",
              email: currentUser.email || "",
              role: roleToSet,
              accountType: roleToSet,
              cooperativeOrgId: coopProf?.cooperativeOrgId || coopOrgId || "",
              cooperativeOrgName: coopProf?.cooperativeOrgName || coopOrgName || "",
            };

            await setDoc(userRef, {
              ...newProf,
              createdAt: new Date().toISOString(),
            });

            setUserProfile(newProf);
          }

          if (coopProf) {
            setCooperativeProfile(coopProf);
          }

          setUserRoleState(roleToSet);
          if (typeof window !== "undefined") {
            localStorage.setItem("cocoatrace_user_role", roleToSet);
          }
        } catch (err) {
          console.warn("Could not sync user profile to Firestore:", err);
        }
      } else {
        // If there is no live Firebase user and no manual demo session, clear
        if (typeof window !== "undefined" && !localStorage.getItem("cocoatrace_is_demo")) {
          setUser(null);
          setUserProfile(null);
          setCooperativeProfile(null);
          setUserRoleState("farmer");
          localStorage.removeItem("cocoatrace_auth_user");
          localStorage.removeItem("cocoatrace_user_role");
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);


  // Fetch Farms from Firestore (Scoped securely by authenticated user UID)
  useEffect(() => {
    let active = true;

    // Clear stale records as soon as this subscription is established.
    setFarms([]);

    const ownerUid = user?.uid;

    // Demo identities are not Firebase-authenticated identities.
    if (
      !ownerUid ||
      ownerUid.startsWith("demo_producer_") ||
      auth.currentUser?.uid !== ownerUid
    ) {
      return () => {
        active = false;
      };
    }

    const farmsRef = collection(db, "farms");
    const farmsQuery = query(
      farmsRef,
      where("farmerId", "==", ownerUid)
    );

    const unsubscribe = onSnapshot(
      farmsQuery,
      (snapshot) => {
        // Ignore callbacks from an obsolete subscription/account.
        if (
          !active ||
          auth.currentUser?.uid !== ownerUid
        ) {
          return;
        }

        const fetchedFarms: FarmRecord[] = [];

        snapshot.forEach((document) => {
          const data = document.data() as FarmRecord;

          // Defense in depth: never add another owner's record to state.
          if (data.farmerId !== ownerUid) {
            return;
          }

          fetchedFarms.push({
            ...data,
            id: document.id,
          });
        });

        // Use only the current owner's authoritative snapshot.
        // Do not merge records from the previous account's state.
        setFarms(fetchedFarms);
      },
      (error) => {
        if (
          !active ||
          auth.currentUser?.uid !== ownerUid
        ) {
          return;
        }

        console.error("Could not fetch user farms:", error);

        // Do not leave potentially stale private records visible.
        setFarms([]);
      }
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [user]);


  const loginWithGoogle = async () => {
    try {
      const cred = await authLoginWithGoogle();
      if (cred?.user) {
        setUser(cred.user as unknown as User);
        if (typeof window !== "undefined") {
          localStorage.setItem(
            "cocoatrace_auth_user",
            JSON.stringify({
              uid: cred.user.uid,
              displayName: cred.user.displayName,
              email: cred.user.email,
            })
          );
        }
      }
    } catch (error) {
      console.error("Google login failed:", error);
      throw error;
    }
  };

  const loginWithEmail = async (email: string, pass: string) => {
    try {
      const cred = await authLoginWithEmail(email, pass);
      if (cred?.user) {
        setUser(cred.user as unknown as User);
        if (typeof window !== "undefined") {
          localStorage.setItem(
            "cocoatrace_auth_user",
            JSON.stringify({
              uid: cred.user.uid,
              displayName: cred.user.displayName,
              email: cred.user.email,
            })
          );
        }
      }
    } catch (error) {
      console.error("Email login failed:", error);
      throw error;
    }
  };

  const signUpWithEmail = async (email: string, pass: string, displayName?: string) => {
    try {
      const cred = await authSignUpWithEmail(email, pass, displayName);
      if (cred?.user) {
        setUser(cred.user as unknown as User);
        if (typeof window !== "undefined") {
          localStorage.setItem(
            "cocoatrace_auth_user",
            JSON.stringify({
              uid: cred.user.uid,
              displayName: displayName || cred.user.displayName,
              email: cred.user.email,
            })
          );
        }
      }
    } catch (error) {
      console.error("Email sign up failed:", error);
      throw error;
    }
  };

  const loginAsDemo = (profile?: { displayName?: string; email?: string }) => {
    const demoUser = {
      uid: "demo_producer_" + Date.now().toString().slice(-6),
      displayName: profile?.displayName || "Alain Nkweta (Verified Producer)",
      email: profile?.email || "alain.nkweta@cocoatrace.cm",
      emailVerified: true,
      isAnonymous: false,
    } as unknown as User;

    setUser(demoUser);
    if (typeof window !== "undefined") {
      localStorage.setItem("cocoatrace_is_demo", "true");
      localStorage.setItem("cocoatrace_auth_user", JSON.stringify(demoUser));
    }
  };

  const login = loginWithGoogle;

  const logout = async () => {
    try {
      if (typeof window !== "undefined") {
        localStorage.removeItem("cocoatrace_is_demo");
        localStorage.removeItem("cocoatrace_auth_user");
        localStorage.removeItem("cocoatrace_user_role");
      }
      setUser(null);
      setUserProfile(null);
      setCooperativeProfile(null);
      setUserRoleState("farmer");
      await logoutUser();
      if (typeof window !== "undefined") {
        window.location.href = "/";
      }
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  // Load pending drafts on mount or when user changes
  useEffect(() => {
    const loadDrafts = async () => {
      try {
        const drafts = await getPendingFarmDrafts(user?.uid);
        setPendingDrafts(drafts);
      } catch (err) {
        console.warn("Could not load pending drafts from IndexedDB:", err);
      }
    };
    loadDrafts();
  }, [user]);

  // Sync pending drafts when online
  const syncPendingDrafts = useCallback(async (): Promise<void> => {
    if (!user || user.uid.startsWith("demo_producer_")) return;
    try {
      const drafts = await getPendingFarmDrafts(user.uid);
      if (drafts.length === 0) return;
      const idToken = await user.getIdToken();
      for (const draft of drafts) {
        try {
          const res = await fetch("/api/farms", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify(draft.farmData),
          });
          if (res.ok) {
            const { farm: registeredFarm } = await res.json();
            await removePendingFarmDraft(draft.draftId);
            setFarms((prev) => [registeredFarm, ...prev.filter((f) => f.id !== registeredFarm.id)]);
            setPendingDrafts((prev) => prev.filter((d) => d.draftId !== draft.draftId));
          }
        } catch {
          // Keep draft in IndexedDB for subsequent retry
        }
      }
    } catch (syncErr) {
      console.warn("Background draft sync error:", syncErr);
    }
  }, [user]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOnline = () => {
      syncPendingDrafts();
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [syncPendingDrafts]);

  const registerFarm = async (
    data: Omit<FarmRecord, "id" | "farmerId" | "createdAt">
  ): Promise<FarmRecord> => {
    // 1. Enforce authoritative Cameroon location validation immediately
    validateCameroonFarmLocation({
      region: data.region,
      state: data.state,
      village: data.village,
      geolocation: data.geolocation,
      geofencePolygon: data.geofencePolygon,
    });

    const farmId = `farm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const uniqueSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
    const generatedUniqueId = `TTN-CM-2026-${uniqueSuffix}`;
    const nowIso = new Date().toISOString();
    const effectiveFarmerId = user?.uid || "demo_producer_local";

    const farmPayload = {
      ...data,
      farmId,
      farmUniqueId: data.farmUniqueId || generatedUniqueId,
      farmerId: effectiveFarmerId,
      farmerName: data.farmerName || user?.displayName || "Registered Farmer",
      sizeHectares: Number(data.sizeHectares) || 2.5,
      createdAt: nowIso,
      registrationDate: data.registrationDate || nowIso.split("T")[0],
      eudrCompliant: data.eudrCompliant ?? true,
    };

    const isOffline = typeof navigator !== "undefined" && !navigator.onLine;

    if (isOffline) {
      // Offline mode: store purely in local IndexedDB draft store
      // DO NOT write to Firestore via client SDK, DO NOT add to registered farms state
      await savePendingFarmDraft(farmId, effectiveFarmerId, farmPayload);
      const updatedDrafts = await getPendingFarmDrafts(user?.uid);
      setPendingDrafts(updatedDrafts);
      throw new Error(
        "Offline Pending Draft: Network is unavailable. Your farm has been securely saved locally to IndexedDB as an unvalidated draft. It will be submitted for official server validation and registration when you are back online."
      );
    }

    // Online path: Must pass through server-side authenticated validation endpoint
    if (!user) {
      throw new Error("Authentication Required: You must be signed in to officially register a farm plot.");
    }

    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/farms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(farmPayload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Server registration failed with status ${res.status}`);
      }

      const resData = await res.json();
      const registeredFarm: FarmRecord = resData.farm;

      // Add to registered farms state only upon confirmed server validation
      setFarms((prev) => [registeredFarm, ...prev.filter((f) => f.id !== registeredFarm.id)]);
      await removePendingFarmDraft(farmId);
      setPendingDrafts((prev) => prev.filter((d) => d.draftId !== farmId));

      return registeredFarm;
    } catch (networkOrServerErr: unknown) {
      const errorMsg = networkOrServerErr instanceof Error ? networkOrServerErr.message : "Registration failed";
      if (errorMsg.includes("Validation") || errorMsg.includes("Registration Policy")) {
        throw networkOrServerErr;
      }

      // If connection was dropped or server was unreachable, store draft locally in IndexedDB
      await savePendingFarmDraft(farmId, effectiveFarmerId, farmPayload);
      const updatedDrafts = await getPendingFarmDrafts(user?.uid);
      setPendingDrafts(updatedDrafts);

      throw new Error(
        `Network Unreachable: ${errorMsg}. Your farm has been preserved as a local pending draft in IndexedDB awaiting server validation.`
      );
    }
  };

  
  const updateFarm = async (
    farmId: string,
    updates: Partial<Omit<FarmRecord, "id" | "farmerId" | "createdAt">>
  ): Promise<void> => {
    if (!farmId || typeof farmId !== "string") {
      throw new Error("A valid farm ID is required.");
    }

    // Demo accounts can modify only their local demo state.
    // They must never be treated as authenticated Firebase users.
    if (user?.uid.startsWith("demo_producer_")) {
      setFarms((prev) =>
        prev.map((farm) =>
          farm.id === farmId ? { ...farm, ...updates } : farm
        )
      );
      return;
    }

    if (!user) {
      throw new Error(
        "Authentication Required: Sign in before updating a farm."
      );
    }

    const ownerUid = user.uid;

    // Ensure the active Firebase session still belongs to this user.
    if (auth.currentUser?.uid !== ownerUid) {
      throw new Error(
        "Your authentication session has changed. Please try again."
      );
    }

    // All real farm updates must go through the server API.
    // The server is responsible for checking ownership and validating
    // location changes, geofencing, and cadastral-review safeguards.
    const idToken = await user.getIdToken();

    const response = await fetch("/api/farms", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        farmId,
        ...updates,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));

      throw new Error(
        errorData.error ||
          `Farm update failed with status ${response.status}.`
      );
    }

    const result = await response.json();

    if (!result.farm || typeof result.farm !== "object") {
      throw new Error(
        "Farm update response did not contain the updated farm."
      );
    }

    // Never inject a response from a previous account into the
    // currently signed-in user's farm state.
    if (auth.currentUser?.uid !== ownerUid) {
      return;
    }

    const updatedFarm = {
      ...result.farm,
      id: result.farm.id || farmId,
    } as FarmRecord;

    setFarms((prev) =>
      prev.map((farm) =>
        farm.id === farmId ? { ...farm, ...updatedFarm } : farm
      )
    );
  };

  return (
    <FirebaseContext.Provider
      value={{
        user,
        loading,
        userRole,
        isCooperative: userRole === "cooperative",
        userProfile,
        cooperativeProfile,
        setUserRole,
        login,
        loginWithGoogle,
        loginWithEmail,
        signUpWithEmail,
        loginAsDemo,
        logout,
        lots,
        farms,
        pendingDrafts,
        syncPendingDrafts,
        registerFarm,
        updateFarm,
      }}
    >
      {children}
    </FirebaseContext.Provider>
  );
}

export function useFirebase() {
  const context = useContext(FirebaseContext);
  if (!context) {
    throw new Error("useFirebase must be used within a FirebaseProvider");
  }
  return context;
}
