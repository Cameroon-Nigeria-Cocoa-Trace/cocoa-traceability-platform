"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
} from "firebase/firestore";
import {
  auth,
  db,
  loginWithGoogle as authLoginWithGoogle,
  loginWithEmail as authLoginWithEmail,
  signUpWithEmail as authSignUpWithEmail,
  checkRedirectAuthResult,
  logoutUser,
  handleFirestoreError,
  OperationType,
} from "@/lib/firebase";
import { products as defaultProducts, Product } from "@/data/products";

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

interface FirebaseContextType {
  user: User | null;
  loading: boolean;
  login: () => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string, displayName?: string) => Promise<void>;
  loginAsDemo: (profile?: { displayName?: string; email?: string }) => void;
  logout: () => Promise<void>;
  lots: Product[];
  farms: FarmRecord[];
  registerFarm: (farm: Omit<FarmRecord, "id" | "farmerId" | "createdAt">) => Promise<FarmRecord>;
  updateFarm: (farmId: string, updates: Partial<Omit<FarmRecord, "id" | "farmerId" | "createdAt">>) => Promise<void>;
}

const FirebaseContext = createContext<FirebaseContextType>({
  user: null,
  loading: true,
  login: async () => {},
  loginWithGoogle: async () => {},
  loginWithEmail: async () => {},
  signUpWithEmail: async () => {},
  loginAsDemo: () => {},
  logout: async () => {},
  lots: defaultProducts,
  farms: [],
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
  const [lots, setLots] = useState<Product[]>(defaultProducts);
  const [farms, setFarms] = useState<FarmRecord[]>([]);

  // Auth Listener and Redirect Handler
  useEffect(() => {
    // Check redirect result
    checkRedirectAuthResult().catch((err) => {
      console.warn("Redirect result check warning:", err);
    });

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
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

        // Sync user document safely in Firestore adhering to security rules
        try {
          const userRef = doc(db, "users", currentUser.uid);
          const userSnap = await getDoc(userRef);

          if (!userSnap.exists()) {
            await setDoc(userRef, {
              id: currentUser.uid,
              displayName: currentUser.displayName || "User",
              email: currentUser.email || "",
              role: "farmer",
              createdAt: new Date().toISOString(),
            });
          } else {
            // Document already exists; update only displayName if changed
            const existingData = userSnap.data();
            if (
              currentUser.displayName &&
              existingData.displayName !== currentUser.displayName
            ) {
              await updateDoc(userRef, {
                displayName: currentUser.displayName,
              });
            }
          }
        } catch (err) {
          console.warn("Could not sync user profile to Firestore:", err);
        }
      } else {
        // If there is no live Firebase user and no manual demo session, clear
        if (typeof window !== "undefined" && !localStorage.getItem("cocoatrace_is_demo")) {
          setUser(null);
          localStorage.removeItem("cocoatrace_auth_user");
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Fetch or Seed Marketplace Lots from Firestore
  useEffect(() => {
    const lotsPath = "lots";
    const unsubscribe = onSnapshot(
      collection(db, lotsPath),
      async (snapshot) => {
        if (!snapshot.empty) {
          const fetchedLots: Product[] = [];
          snapshot.forEach((d) => {
            fetchedLots.push(d.data() as Product);
          });
          setLots(fetchedLots);
        } else {
          setLots(defaultProducts);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, lotsPath);
      }
    );

    return () => unsubscribe();
  }, []);

  // Fetch Farms from Firestore
  useEffect(() => {
    const farmsPath = "farms";
    const unsubscribe = onSnapshot(
      collection(db, farmsPath),
      (snapshot) => {
        const fetchedFarms: FarmRecord[] = [];
        snapshot.forEach((d) => {
          fetchedFarms.push(d.data() as FarmRecord);
        });
        setFarms((prev) => {
          // Merge fetched farms while preserving any locally registered ones
          const merged = [...fetchedFarms];
          for (const localFarm of prev) {
            if (!merged.some((f) => f.id === localFarm.id)) {
              merged.push(localFarm);
            }
          }
          return merged;
        });
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, farmsPath);
      }
    );

    return () => unsubscribe();
  }, []);

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
      }
      setUser(null);
      await logoutUser();
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const registerFarm = async (
    data: Omit<FarmRecord, "id" | "farmerId" | "createdAt">
  ): Promise<FarmRecord> => {
    const farmId = `farm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const uniqueSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
    const generatedUniqueId = `TTN-CM-2026-${uniqueSuffix}`;
    const nowIso = new Date().toISOString();
    const effectiveFarmerId = user?.uid || "demo_producer_local";
    
    // Construct clean farm object
    const newFarm: FarmRecord = {
      id: farmId,
      farmUniqueId: data.farmUniqueId || generatedUniqueId,
      farmerId: effectiveFarmerId,
      farmerName: data.farmerName || user?.displayName || "Registered Farmer",
      farmName: data.farmName,
      region: data.region,
      geolocation: data.geolocation,
      sizeHectares: Number(data.sizeHectares) || 2.5,
      createdAt: nowIso,
      registrationDate: data.registrationDate || nowIso.split("T")[0],
      eudrCompliant: data.eudrCompliant ?? true,
    };

    if (data.farmerPhone) newFarm.farmerPhone = data.farmerPhone;
    if (data.farmerEmail) newFarm.farmerEmail = data.farmerEmail;
    if (data.village) newFarm.village = data.village;
    if (data.lga) newFarm.lga = data.lga;
    if (data.state) newFarm.state = data.state;
    if (data.cooperative) newFarm.cooperative = data.cooperative;
    if (data.cocoaVariety) newFarm.cocoaVariety = data.cocoaVariety;
    if (data.harvestSeason) newFarm.harvestSeason = data.harvestSeason;
    if (data.estimatedAnnualYieldKg !== undefined && !isNaN(data.estimatedAnnualYieldKg)) {
      newFarm.estimatedAnnualYieldKg = Number(data.estimatedAnnualYieldKg);
    }
    if (data.quantityHarvestedKg !== undefined && !isNaN(data.quantityHarvestedKg)) {
      newFarm.quantityHarvestedKg = Number(data.quantityHarvestedKg);
    }
    if (data.batchNumber) newFarm.batchNumber = data.batchNumber;
    if (data.aggregatorCenter) newFarm.aggregatorCenter = data.aggregatorCenter;
    if (data.batchMovementRoute) newFarm.batchMovementRoute = data.batchMovementRoute;
    if (data.processorExporter) newFarm.processorExporter = data.processorExporter;
    if (data.designatedBuyer) newFarm.designatedBuyer = data.designatedBuyer;
    if (data.landDocType) newFarm.landDocType = data.landDocType;
    if (data.landDocReference) newFarm.landDocReference = data.landDocReference;
    if (data.deforestationRisk) newFarm.deforestationRisk = data.deforestationRisk;
    if (data.auditStatus) newFarm.auditStatus = data.auditStatus;
    if (data.auditCertificateNumber) newFarm.auditCertificateNumber = data.auditCertificateNumber;
    if (data.auditorName) newFarm.auditorName = data.auditorName;
    if (data.auditDate) newFarm.auditDate = data.auditDate;
    if (data.paymentMethod) newFarm.paymentMethod = data.paymentMethod;
    if (data.transactionReference) newFarm.transactionReference = data.transactionReference;
    if (data.transactionAmount) newFarm.transactionAmount = data.transactionAmount;
    if (data.geofencePolygon && data.geofencePolygon.length > 0) {
      newFarm.geofencePolygon = data.geofencePolygon;
      newFarm.geofencePointCount = data.geofencePointCount || data.geofencePolygon.length;
    }
    if (data.geofenceAreaHa !== undefined) {
      newFarm.geofenceAreaHa = Number(data.geofenceAreaHa);
    }

    try {
      if (user && !user.uid.startsWith("demo_producer_")) {
        await setDoc(doc(db, "farms", farmId), newFarm);
      }
      setFarms((prev) => {
        if (prev.some((f) => f.id === farmId)) return prev;
        return [newFarm, ...prev];
      });
      return newFarm;
    } catch (error) {
      console.warn("Firestore save error, saving locally:", error);
      setFarms((prev) => {
        if (prev.some((f) => f.id === farmId)) return prev;
        return [newFarm, ...prev];
      });
      return newFarm;
    }
  };

  const updateFarm = async (
    farmId: string,
    updates: Partial<Omit<FarmRecord, "id" | "farmerId" | "createdAt">>
  ): Promise<void> => {
    try {
      if (user && !user.uid.startsWith("demo_producer_")) {
        const sanitizedUpdates: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(updates)) {
          if (value !== undefined) {
            sanitizedUpdates[key] = value;
          }
        }
        await updateDoc(doc(db, "farms", farmId), sanitizedUpdates);
      }
      setFarms((prev) =>
        prev.map((f) => (f.id === farmId ? { ...f, ...updates } : f))
      );
    } catch (error) {
      console.warn("Firestore update error, saving locally:", error);
      setFarms((prev) =>
        prev.map((f) => (f.id === farmId ? { ...f, ...updates } : f))
      );
    }
  };

  return (
    <FirebaseContext.Provider
      value={{
        user,
        loading,
        login,
        loginWithGoogle,
        loginWithEmail,
        signUpWithEmail,
        loginAsDemo,
        logout,
        lots,
        farms,
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
