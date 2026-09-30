"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import {
  collection,
  doc,
  setDoc,
  onSnapshot,
} from "firebase/firestore";
import {
  auth,
  db,
  loginWithGoogle,
  logoutUser,
  handleFirestoreError,
  OperationType,
} from "@/lib/firebase";
import { products as defaultProducts, Product } from "@/data/products";

export interface FarmRecord {
  id: string;
  farmerId: string;
  farmerName?: string;
  farmName: string;
  region: string;
  cooperative?: string;
  geolocation: string;
  sizeHectares?: number;
  eudrCompliant?: boolean;
  createdAt: string;
}

interface FirebaseContextType {
  user: User | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  lots: Product[];
  farms: FarmRecord[];
  registerFarm: (farm: Omit<FarmRecord, "id" | "farmerId" | "createdAt">) => Promise<FarmRecord>;
}

const FirebaseContext = createContext<FirebaseContextType>({
  user: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
  lots: defaultProducts,
  farms: [],
  registerFarm: async () => {
    throw new Error("Provider not initialized");
  },
});

export function FirebaseProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [lots, setLots] = useState<Product[]>(defaultProducts);
  const [farms, setFarms] = useState<FarmRecord[]>([]);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setLoading(false);

      if (currentUser) {
        // Sync user document safely
        try {
          const userRef = doc(db, "users", currentUser.uid);
          await setDoc(
            userRef,
            {
              id: currentUser.uid,
              displayName: currentUser.displayName || "User",
              email: currentUser.email || "",
              createdAt: new Date().toISOString(),
            },
            { merge: true }
          );
        } catch (err) {
          // Log or catch without crashing
          console.warn("Could not sync user profile to Firestore:", err);
        }
      }
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
          // Keep default products visible
          setLots(defaultProducts);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, lotsPath);
      }
    );

    return () => unsubscribe();
  }, []);

  // Fetch Farms
  useEffect(() => {
    const farmsPath = "farms";
    const unsubscribe = onSnapshot(
      collection(db, farmsPath),
      (snapshot) => {
        const fetchedFarms: FarmRecord[] = [];
        snapshot.forEach((d) => {
          fetchedFarms.push(d.data() as FarmRecord);
        });
        setFarms(fetchedFarms);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, farmsPath);
      }
    );

    return () => unsubscribe();
  }, []);

  const login = async () => {
    try {
      await loginWithGoogle();
    } catch (error) {
      console.error("Login failed:", error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await logoutUser();
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const registerFarm = async (
    data: Omit<FarmRecord, "id" | "farmerId" | "createdAt">
  ): Promise<FarmRecord> => {
    if (!user) {
      throw new Error("You must be logged in to register a farm");
    }

    const farmId = `farm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newFarm: FarmRecord = {
      id: farmId,
      farmerId: user.uid,
      farmerName: user.displayName || "Registered Farmer",
      farmName: data.farmName,
      region: data.region,
      cooperative: data.cooperative || "Independent Smallholder",
      geolocation: data.geolocation,
      sizeHectares: data.sizeHectares ?? 2.5,
      eudrCompliant: data.eudrCompliant ?? true,
      createdAt: new Date().toISOString(),
    };

    const path = `farms/${farmId}`;
    try {
      await setDoc(doc(db, "farms", farmId), newFarm);
      return newFarm;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
      throw error;
    }
  };

  return (
    <FirebaseContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        lots,
        farms,
        registerFarm,
      }}
    >
      {children}
    </FirebaseContext.Provider>
  );
}

export function useFirebase() {
  return useContext(FirebaseContext);
}
