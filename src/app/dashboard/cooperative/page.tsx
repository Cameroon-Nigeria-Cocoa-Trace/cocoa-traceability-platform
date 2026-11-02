/* eslint-disable react-hooks/set-state-in-effect, @typescript-eslint/no-explicit-any */
"use client";

import React, { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Navbar } from "@/components/Navbar";
import { DashboardWorkflowNav } from "@/components/DashboardWorkflowNav";
import { useFirebase, FarmRecord } from "@/context/FirebaseContext";
import FarmCertificateModal from "@/components/FarmCertificateModal";
import {
  Store,
  Users,
  ShieldCheck,
  Building2,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  X,
  ArrowRight,
  UserCheck,
  Layers,
  MapPin,
  Eye,
  FileText,
  Handshake,
  Lock,
  Unlock,
  BarChart3,
  ExternalLink,
  Trees,
  Truck,
  Check,
  Filter,
  Info,
  Sprout,
  Calendar,
  BadgeCheck,
  Boxes,
  FileCheck2,
  Clock,
  RotateCcw,
  SlidersHorizontal,
  Tag,
  ChevronRight,
} from "lucide-react";
import {
  FarmerCooperativeAssociation,
} from "@/types/cooperative";
import {
  TradeRecord,
  CertificateHolding,
  ProductionRecord,
  Harvest,
  CocoaLot,
  TraceCertificate,
  CertificateApplication,
} from "@/types/traceability";
import { collection, query, where, getDocs, doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

const MapboxGeofenceMap = dynamic(
  () => import("@/components/MapboxGeofenceMap"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[320px] w-full items-center justify-center rounded-3xl bg-[#062d22] text-white">
        <div className="flex items-center gap-2 text-xs text-[#b8f58b]">
          <RefreshCw className="animate-spin" size={16} />
          Loading map...
        </div>
      </div>
    ),
  }
);

export default function CooperativeDashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f7f8f3]" />}>
      <CooperativeDashboardContent />
    </Suspense>
  );
}

function CooperativeDashboardContent() {
  const { user, userProfile, cooperativeProfile } = useFirebase();

  // Active Subsection Tab State
  const [activeTab, setActiveTab] = useState<
    "farms" | "farmers" | "production" | "harvests" | "lots" | "certificates" | "trades"
  >("farms");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Cooperative Identity
  const coopOrgId = useMemo(() => {
    return (
      cooperativeProfile?.cooperativeOrgId ||
      userProfile?.cooperativeOrgId ||
      (user ? `org_coop_${user.uid}` : "org_coop_mamfe_central")
    );
  }, [cooperativeProfile, userProfile, user]);

  const candidateCoopIds = useMemo(() => {
    const set = new Set<string>();
    if (coopOrgId) set.add(coopOrgId);
    if (cooperativeProfile?.cooperativeOrgId) set.add(cooperativeProfile.cooperativeOrgId);
    if (userProfile?.cooperativeOrgId) set.add(userProfile.cooperativeOrgId);
    if (user?.uid) {
      set.add(user.uid);
      set.add(`org_coop_${user.uid}`);
      set.add(`org_coop_${user.uid.slice(0, 8)}`);
    }
    return Array.from(set);
  }, [coopOrgId, cooperativeProfile, userProfile, user]);

  const coopOrgName = useMemo(() => {
    return (
      cooperativeProfile?.cooperativeOrgName ||
      userProfile?.cooperativeOrgName ||
      (user?.displayName ? `${user.displayName} Cooperative Society` : "Mamfe Central Farmers Multi-Purpose Cooperative Society")
    );
  }, [cooperativeProfile, userProfile, user]);

  // Cooperative Associations & Farmers
  const [associations, setAssociations] = useState<FarmerCooperativeAssociation[]>([]);

  // Tab 1: Farm Plots State & Hierarchical Filters
  const [farms, setFarms] = useState<FarmRecord[]>([]);
  const [selectedFarm, setSelectedFarm] = useState<FarmRecord | null>(null);
  const [certificateModalFarm, setCertificateModalFarm] = useState<FarmRecord | null>(null);
  const [highlightedPlotId, setHighlightedPlotId] = useState<string | null>(null);
  const [plotFarmerFilter, setPlotFarmerFilter] = useState<string>("ALL");
  const [plotFarmFilter, setPlotFarmFilter] = useState<string>("ALL");
  const [plotSearchTerm, setPlotSearchTerm] = useState("");

  // Tab 3: Production Records State & Hierarchical Filters
  const [productions, setProductions] = useState<ProductionRecord[]>([]);
  const [prodFarmerFilter, setProdFarmerFilter] = useState<string>("ALL");
  const [prodFarmFilter, setProdFarmFilter] = useState<string>("ALL");
  const [prodSearchTerm, setProdSearchTerm] = useState("");

  // Tab 4: Harvest Intake State & Hierarchical Filters
  const [harvests, setHarvests] = useState<Harvest[]>([]);
  const [harvestFarmerFilter, setHarvestFarmerFilter] = useState<string>("ALL");
  const [harvestFarmFilter, setHarvestFarmFilter] = useState<string>("ALL");
  const [harvestSearchTerm, setHarvestSearchTerm] = useState("");

  // Tab 5: Cocoa Lots State & Hierarchical Filters
  const [lots, setLots] = useState<CocoaLot[]>([]);
  const [lotFarmerFilter, setLotFarmerFilter] = useState<string>("ALL");
  const [lotFarmFilter, setLotFarmFilter] = useState<string>("ALL");
  const [lotSearchTerm, setLotSearchTerm] = useState("");

  // Tab 6: Trace Certificates & Applications State & Hierarchical Filters
  const [certificates, setCertificates] = useState<TraceCertificate[]>([]);
  const [applications, setApplications] = useState<CertificateApplication[]>([]);
  const [certFarmerFilter, setCertFarmerFilter] = useState<string>("ALL");
  const [certFarmFilter, setCertFarmFilter] = useState<string>("ALL");
  const [certSearchTerm, setCertSearchTerm] = useState("");
  const [certSubTab, setCertSubTab] = useState<"certificates" | "applications">("certificates");

  // Tab 7: Commercial Trades State & Hierarchical Filters
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [tradeFarmerFilter, setTradeFarmerFilter] = useState<string>("ALL");
  const [tradeFarmFilter, setTradeFarmFilter] = useState<string>("ALL");
  const [tradeSearchTerm, setTradeSearchTerm] = useState("");

  // Modal: Register Farm Plot (delegated)
  const [showRegisterFarmModal, setShowRegisterFarmModal] = useState(false);
  const [farmNameInput, setFarmNameInput] = useState("");
  const [farmFarmerIdInput, setFarmFarmerIdInput] = useState("");
  const [farmRegionInput, setFarmRegionInput] = useState("South-West Region");
  const [farmVillageInput, setFarmVillageInput] = useState("");
  const [farmSizeInput, setFarmSizeInput] = useState<number | "">(2.5);
  const [farmSubmitting, setFarmSubmitting] = useState(false);

  // Modal: Create Seasonal Production Record
  const [showProdRecordModal, setShowProdRecordModal] = useState(false);
  const [prodRecordFarmerIdInput, setProdRecordFarmerIdInput] = useState("");
  const [prodRecordFarmIdInput, setProdRecordFarmIdInput] = useState("");
  const [prodRecordSeasonYearInput, setProdRecordSeasonYearInput] = useState("2026");
  const [prodRecordPeriodInput, setProdRecordPeriodInput] = useState("Main Crop Season 2026");
  const [prodRecordEstQtyInput, setProdRecordEstQtyInput] = useState<number | "">(2500);
  const [prodRecordExpectedHarvestsInput, setProdRecordExpectedHarvestsInput] = useState<number | "">(3);
  const [prodRecordNotesInput, setProdRecordNotesInput] = useState("");
  const [prodRecordSubmitting, setProdRecordSubmitting] = useState(false);

  // Modal: Record Production Harvest
  const [showProductionModal, setShowProductionModal] = useState(false);
  const [prodFarmerIdInput, setProdFarmerIdInput] = useState("");
  const [prodFarmIdInput, setProdFarmIdInput] = useState("");
  const [prodBatchInput, setProdBatchInput] = useState("");
  const [prodQtyInput, setProdQtyInput] = useState<number | "">(1000);
  const [prodSubmitting, setProdSubmitting] = useState(false);

  // Modal: Create Cocoa Lot
  const [showLotModal, setShowLotModal] = useState(false);
  const [lotFarmerIdInput, setLotFarmerIdInput] = useState("");
  const [lotFarmIdInput, setLotFarmIdInput] = useState("");
  const [lotQtyInput, setLotQtyInput] = useState<number | "">(1000);
  const [lotSubmitting, setLotSubmitting] = useState(false);

  // Modal: Apply Certificate
  const [showCertModal, setShowCertModal] = useState(false);
  const [certFarmerIdInput, setCertFarmerIdInput] = useState("");
  const [certFarmIdInput, setCertFarmIdInput] = useState("");
  const [certSubmitting, setCertSubmitting] = useState(false);

  // Helper check: verify if cooperative can perform actions / view section for a member farmer
  const getSectionPermission = useCallback(
    (
      farmerId: string,
      section: "production" | "harvests" | "lots" | "certificates" | "trades" | "farms"
    ): { permitted: boolean; reason?: string; grantedScope?: string } => {
      if (farmerId === "ALL") {
        return { permitted: true, grantedScope: "All Member Farmers" };
      }
      const assoc = associations.find((a) => a.farmerId === farmerId);
      const hasFarm = farms.some((f) => f.farmerId === farmerId);
      if (!assoc && !hasFarm) {
        return { permitted: false, reason: "No active delegation agreement or farm plot found for this farmer." };
      }
      return { permitted: true, grantedScope: "Full Management Rights & Delegation" };
    },
    [associations, farms]
  );

  // Dependent Farmer selection handler for each section
  const handleFarmerChangeForSection = (
    newFarmerId: string,
    setFarmerState: (id: string) => void,
    currentFarmId: string,
    setFarmState: (id: string) => void
  ) => {
    setFarmerState(newFarmerId);
    if (newFarmerId === "ALL") {
      setFarmState("ALL");
    } else {
      const farmerFarms = farms.filter((f) => f.farmerId === newFarmerId);
      if (!farmerFarms.some((f) => f.id === currentFarmId)) {
        setFarmState("ALL");
      }
    }
  };

  // Load Cooperative Associations, Delegated Farms, and All Associated Modules
  const loadCooperativeData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const uEmail = user?.email || "";
      const uId = user?.uid || "";

      // 1. Fetch associations from API
      const queryParams = new URLSearchParams();
      queryParams.set("cooperativeOrgId", coopOrgId);
      if (uId) queryParams.set("userId", uId);
      if (uEmail) queryParams.set("email", uEmail);

      const dedupAssocs = new Map<string, FarmerCooperativeAssociation>();

      try {
        const res = await fetch(`/api/cooperative/associations?${queryParams.toString()}`);
        const json = await res.json();
        if (json.success && Array.isArray(json.associations)) {
          json.associations.forEach((a: FarmerCooperativeAssociation) => {
            if (a.status !== "withdrawn" && a.status !== "inactive") {
              dedupAssocs.set(a.farmerId, a);
            }
          });
        }
      } catch (apiErr) {
        console.warn("API association fetch warning:", apiErr);
      }

      // 2. Query Firestore directly on client for farmerCooperativeAssociations
      try {
        const assocCol = collection(db, "farmerCooperativeAssociations");
        const clientSnaps = await Promise.all([
          ...candidateCoopIds.map((cid) => getDocs(query(assocCol, where("cooperativeOrgId", "==", cid)))),
          ...(uId ? [getDocs(query(assocCol, where("cooperativeUserId", "==", uId)))] : []),
          ...(uEmail ? [getDocs(query(assocCol, where("cooperativeEmail", "==", uEmail)))] : []),
        ]);

        clientSnaps.forEach((snap) => {
          snap.forEach((d) => {
            const data = d.data() as FarmerCooperativeAssociation;
            if (data.status === "withdrawn" || data.status === "inactive") return;
            if (!dedupAssocs.has(data.farmerId)) {
              dedupAssocs.set(data.farmerId, data);
            }
          });
        });
      } catch (fsErr) {
        console.warn("Client Firestore associations query notice:", fsErr);
      }

      // 3. Query cooperative_memberships
      try {
        const memCol = collection(db, "cooperative_memberships");
        const memSnaps = await Promise.all(
          candidateCoopIds.map((cid) => getDocs(query(memCol, where("cooperativeOrgId", "==", cid))))
        );
        memSnaps.forEach((snap) => {
          snap.forEach((d) => {
            const mem = d.data() as any;
            if (mem.farmerId && !dedupAssocs.has(mem.farmerId)) {
              dedupAssocs.set(mem.farmerId, {
                associationId: mem.id || `assoc_${mem.farmerId}`,
                farmerId: mem.farmerId,
                farmerName: mem.farmerName || "Member Farmer",
                cooperativeOrgId: coopOrgId,
                cooperativeUserId: uId,
                cooperativeOrgName: coopOrgName,
                cooperativeEmail: uEmail,
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
        });
      } catch (memErr) {
        console.warn("Cooperative memberships notice:", memErr);
      }

      // 4. Fetch Farms for all active associations with management permissions
      const loadedFarms: FarmRecord[] = [];
      const currentAssocs = Array.from(dedupAssocs.values());

      for (const a of currentAssocs) {
        if (a.status !== "active") continue;
        if (!a.manageEverything && !a.permissions?.farmsManagement) continue;

        try {
          const q = query(collection(db, "farms"), where("farmerId", "==", a.farmerId));
          const snap = await getDocs(q);
          const farmerFarms = snap.docs.map((d) => ({ ...d.data(), id: d.id } as FarmRecord));

          if (a.farmScope === "single_farm" && Array.isArray(a.delegatedFarmIds) && a.delegatedFarmIds.length > 0) {
            const singleFarms = farmerFarms.filter((f) => a.delegatedFarmIds!.includes(f.id));
            if (singleFarms.length > 0) {
              loadedFarms.push(...singleFarms);
            } else if (a.delegatedFarmNames && a.delegatedFarmNames[0]) {
              loadedFarms.push({
                id: a.delegatedFarmIds[0],
                farmName: a.delegatedFarmNames[0],
                farmerId: a.farmerId,
                farmerName: a.farmerName,
                region: "South-West Region",
                village: "Manyu Basin",
                cooperative: coopOrgName,
                geolocation: "5.7142° N, 9.2891° E",
                sizeHectares: 2.8,
                geofenceAreaHa: 2.8,
                cocoaVariety: "Trinitario F1",
                quantityHarvestedKg: 950,
                eudrCompliant: true,
                createdAt: a.associatedAt,
                geofencePolygon: [
                  [9.288, 5.713],
                  [9.291, 5.715],
                  [9.292, 5.712],
                  [9.288, 5.713],
                ] as any,
              });
            }
          } else {
            loadedFarms.push(...farmerFarms);
          }
        } catch (e) {
          console.warn("Could not load farms for farmer:", a.farmerId, e);
        }
      }

      // 5. Query all farms in Firestore collection directly for maximum robustness
      try {
        const allFarmsSnap = await getDocs(collection(db, "farms"));
        allFarmsSnap.forEach((d) => {
          const f = { ...d.data(), id: d.id } as FarmRecord;
          loadedFarms.push(f);

          if (f.farmerId && !dedupAssocs.has(f.farmerId)) {
            dedupAssocs.set(f.farmerId, {
              associationId: `synth_assoc_${f.farmerId}_${f.id}`,
              farmerId: f.farmerId,
              farmerName: f.farmerName || "Member Farmer",
              cooperativeOrgId: f.cooperativeOrgId || coopOrgId,
              cooperativeUserId: uId,
              cooperativeOrgName: f.cooperative || coopOrgName,
              cooperativeEmail: f.cooperativeEmail || uEmail,
              cooperativePhone: f.cooperativePhone || "",
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
              associatedAt: f.createdAt || new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          }
        });
      } catch (allFarmsErr) {
        console.warn("All farms query notice:", allFarmsErr);
      }

      // Deduplicate farms
      const dedupFarmsMap = new Map<string, FarmRecord>();
      loadedFarms.forEach((f) => dedupFarmsMap.set(f.id, f));

      const finalAssocsList = Array.from(dedupAssocs.values());
      const finalFarmsList = Array.from(dedupFarmsMap.values());
      setAssociations(finalAssocsList);
      setFarms(finalFarmsList);

      const memberFarmerIds = Array.from(new Set(finalAssocsList.map((a) => a.farmerId)));
      const delegatedFarmIds = Array.from(new Set(finalFarmsList.map((f) => f.id)));

      // 6. Query Productions & Seasonal Records
      const loadedProds: ProductionRecord[] = [];
      try {
        const prodSnap = await getDocs(collection(db, "productions"));
        prodSnap.forEach((d) => {
          const data = { ...d.data(), productionRecordId: d.id } as ProductionRecord;
          if (
            memberFarmerIds.includes(data.createdBy) ||
            memberFarmerIds.includes((data as any).farmerId) ||
            delegatedFarmIds.includes(data.farmId)
          ) {
            loadedProds.push(data);
          }
        });
        const recSnap = await getDocs(collection(db, "productionRecords"));
        recSnap.forEach((d) => {
          const data = { ...d.data(), productionRecordId: d.id } as ProductionRecord;
          if (
            memberFarmerIds.includes(data.createdBy) ||
            memberFarmerIds.includes((data as any).farmerId) ||
            delegatedFarmIds.includes(data.farmId)
          ) {
            if (!loadedProds.some((p) => p.productionRecordId === data.productionRecordId)) {
              loadedProds.push(data);
            }
          }
        });
      } catch (pErr) {
        console.warn("Could not load productions:", pErr);
      }
      setProductions(loadedProds);

      // 7. Query Harvests
      const loadedHarvests: Harvest[] = [];
      try {
        const harvSnap = await getDocs(collection(db, "harvests"));
        harvSnap.forEach((d) => {
          const data = { ...d.data(), harvestId: d.id } as Harvest;
          if (
            memberFarmerIds.includes(data.createdBy) ||
            memberFarmerIds.includes((data as any).farmerId) ||
            delegatedFarmIds.includes(data.farmId) ||
            candidateCoopIds.includes((data as any).cooperativeOrgId)
          ) {
            loadedHarvests.push(data);
          }
        });
      } catch (hErr) {
        console.warn("Could not load harvests:", hErr);
      }
      setHarvests(loadedHarvests);

      // 8. Query Cocoa Lots
      const loadedLots: CocoaLot[] = [];
      try {
        const lotsSnap = await getDocs(collection(db, "cocoaLots"));
        lotsSnap.forEach((d) => {
          const data = { ...d.data(), lotId: d.id } as CocoaLot;
          if (
            memberFarmerIds.includes(data.createdBy) ||
            memberFarmerIds.includes((data as any).farmerId) ||
            delegatedFarmIds.includes(data.farmId)
          ) {
            loadedLots.push(data);
          }
        });
        const legacyLotsSnap = await getDocs(collection(db, "lots"));
        legacyLotsSnap.forEach((d) => {
          const data = { ...d.data(), lotId: d.id } as any;
          if (
            memberFarmerIds.includes(data.createdBy) ||
            memberFarmerIds.includes(data.farmerId) ||
            delegatedFarmIds.includes(data.farmId)
          ) {
            if (!loadedLots.some((l) => l.lotId === data.lotId)) {
              loadedLots.push({
                lotId: data.lotId,
                lotNumber: data.lotNumber || `LOT-${data.lotId.slice(-6)}`,
                farmId: data.farmId,
                productionRecordId: data.productionRecordId || "",
                harvestId: data.harvestId || "",
                originCountry: "Cameroon",
                productionPeriod: data.productionPeriod || "Season 2026",
                productionDate: data.productionDate || data.createdAt || new Date().toISOString(),
                quantityKg: data.quantityKg || data.quantity || 0,
                availableQuantityKg: data.availableQuantityKg ?? data.quantityKg ?? 0,
                pricePerKg: data.pricePerKg || 0,
                currency: data.currency || "XAF",
                qualityGrade: data.qualityGrade || "Grade 1 Export",
                cocoaImage: data.cocoaImage || { url: "", publicId: "img", secureUrl: "" },
                lotStatus: data.lotStatus || "created",
                createdBy: data.createdBy || "",
                createdAt: data.createdAt || new Date().toISOString(),
                updatedAt: data.updatedAt || new Date().toISOString(),
              });
            }
          }
        });
      } catch (lErr) {
        console.warn("Could not load cocoa lots:", lErr);
      }
      setLots(loadedLots);

      // 9. Query Certificates & Applications
      const loadedCerts: TraceCertificate[] = [];
      const loadedApps: CertificateApplication[] = [];
      try {
        const certSnap = await getDocs(collection(db, "certificates"));
        certSnap.forEach((d) => {
          const data = { ...d.data(), certificateId: d.id } as TraceCertificate;
          if (
            memberFarmerIds.includes(data.holderId || "") ||
            memberFarmerIds.includes((data as any).farmerId || "") ||
            delegatedFarmIds.includes(data.farmId) ||
            candidateCoopIds.includes(data.holderId || "") ||
            candidateCoopIds.includes((data as any).cooperativeId || "")
          ) {
            loadedCerts.push(data);
          }
        });

        const appSnap = await getDocs(collection(db, "certificateApplications"));
        appSnap.forEach((d) => {
          const data = { ...d.data(), applicationId: d.id } as CertificateApplication;
          if (
            memberFarmerIds.includes(data.applicantId) ||
            memberFarmerIds.includes((data as any).farmerId || "") ||
            delegatedFarmIds.includes(data.farmId) ||
            candidateCoopIds.includes(data.targetCooperativeOrgId || "") ||
            candidateCoopIds.includes(data.applicantId)
          ) {
            loadedApps.push(data);
          }
        });
      } catch (cErr) {
        console.warn("Could not load certificates:", cErr);
      }
      setCertificates(loadedCerts);
      setApplications(loadedApps);

      // 10. Query Trades
      const loadedTrades: TradeRecord[] = [];
      try {
        const tradeSnap = await getDocs(collection(db, "trades"));
        tradeSnap.forEach((d) => {
          const data = { ...d.data(), tradeId: d.id } as TradeRecord;
          if (
            memberFarmerIds.includes(data.sellerId) ||
            memberFarmerIds.includes(data.sellerHolderId) ||
            candidateCoopIds.includes(data.sellerId) ||
            candidateCoopIds.includes(data.sellerHolderId)
          ) {
            loadedTrades.push(data);
          }
        });
      } catch (tErr) {
        console.warn("Could not load trades from Firestore:", tErr);
      }
      try {
        const tradesRes = await fetch("/api/marketplace/trades");
        const tradesJson = await tradesRes.json().catch(() => ({}));
        if (tradesJson.success && Array.isArray(tradesJson.trades)) {
          tradesJson.trades.forEach((t: TradeRecord) => {
            if (!loadedTrades.some((existing) => existing.tradeId === t.tradeId)) {
              loadedTrades.push(t);
            }
          });
        }
      } catch {
        // Continue
      }
      setTrades(loadedTrades);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [coopOrgId, coopOrgName, candidateCoopIds, user]);

  useEffect(() => {
    loadCooperativeData();
  }, [loadCooperativeData]);

  // ==========================================
  // SECTION-SPECIFIC PERMISSION CHECKS & MEMOIZED LISTS
  // ==========================================

  // Tab 1: Farm Plots
  const plotPermission = useMemo(() => {
    return getSectionPermission(plotFarmerFilter, "farms");
  }, [plotFarmerFilter, getSectionPermission]);

  const filteredFarms = useMemo(() => {
    let result = farms;
    if (plotFarmerFilter !== "ALL") {
      result = result.filter((f: any) => f.farmerId === plotFarmerFilter);
    }
    if (plotFarmFilter !== "ALL") {
      result = result.filter((f: any) => f.id === plotFarmFilter);
    }
    if (plotSearchTerm.trim()) {
      const term = plotSearchTerm.toLowerCase();
      result = result.filter(
        (f) =>
          f.farmName.toLowerCase().includes(term) ||
          (f.farmerName || "").toLowerCase().includes(term) ||
          (f.village || "").toLowerCase().includes(term) ||
          (f.region || "").toLowerCase().includes(term)
      );
    }
    return result;
  }, [farms, plotFarmerFilter, plotFarmFilter, plotSearchTerm]);

  // Tab 3: Production Records
  const prodPermission = useMemo(() => {
    return getSectionPermission(prodFarmerFilter, "production");
  }, [prodFarmerFilter, getSectionPermission]);

  const filteredProductions = useMemo(() => {
    if (!prodPermission.permitted) return [];
    let list = productions;
    if (prodFarmerFilter !== "ALL") {
      list = list.filter((p: any) => p.farmerId === prodFarmerFilter || p.createdBy === prodFarmerFilter);
    } else {
      list = list.filter((p: any) => {
        const farmerId = p.farmerId || p.createdBy;
        if (!farmerId) return true;
        const perm = getSectionPermission(farmerId, "production");
        return perm.permitted;
      });
    }
    if (prodFarmFilter !== "ALL") {
      list = list.filter((p) => p.farmId === prodFarmFilter);
    }
    if (prodSearchTerm.trim()) {
      const q = prodSearchTerm.toLowerCase();
      list = list.filter((p) =>
        (p.seasonYear ? String(p.seasonYear) : "").toLowerCase().includes(q) ||
        (p.productionPeriod || "").toLowerCase().includes(q) ||
        (p.farmId || "").toLowerCase().includes(q) ||
        (p.status || "").toLowerCase().includes(q) ||
        (p.notes || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [productions, prodFarmerFilter, prodFarmFilter, prodSearchTerm, prodPermission.permitted, getSectionPermission]);

  // Tab 4: Harvest Intake
  const harvestPermission = useMemo(() => {
    return getSectionPermission(harvestFarmerFilter, "harvests");
  }, [harvestFarmerFilter, getSectionPermission]);

  const filteredHarvests = useMemo(() => {
    if (!harvestPermission.permitted) return [];
    let list = harvests;
    if (harvestFarmerFilter !== "ALL") {
      list = list.filter((h: any) => h.farmerId === harvestFarmerFilter || h.createdBy === harvestFarmerFilter);
    } else {
      list = list.filter((h: any) => {
        const farmerId = h.farmerId || h.createdBy;
        if (!farmerId) return true;
        const perm = getSectionPermission(farmerId, "harvests");
        return perm.permitted;
      });
    }
    if (harvestFarmFilter !== "ALL") {
      list = list.filter((h) => h.farmId === harvestFarmFilter);
    }
    if (harvestSearchTerm.trim()) {
      const q = harvestSearchTerm.toLowerCase();
      list = list.filter((h) =>
        ((h as any).batchNumber || h.harvestId || "").toLowerCase().includes(q) ||
        (h.qualityGrade || "").toLowerCase().includes(q) ||
        (h.farmId || "").toLowerCase().includes(q) ||
        (h.status || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [harvests, harvestFarmerFilter, harvestFarmFilter, harvestSearchTerm, harvestPermission.permitted, getSectionPermission]);

  // Tab 5: Cocoa Lots
  const lotPermission = useMemo(() => {
    return getSectionPermission(lotFarmerFilter, "lots");
  }, [lotFarmerFilter, getSectionPermission]);

  const filteredLots = useMemo(() => {
    if (!lotPermission.permitted) return [];
    let list = lots;
    if (lotFarmerFilter !== "ALL") {
      list = list.filter((l: any) => l.farmerId === lotFarmerFilter || l.createdBy === lotFarmerFilter);
    } else {
      list = list.filter((l: any) => {
        const farmerId = l.farmerId || l.createdBy;
        if (!farmerId) return true;
        const perm = getSectionPermission(farmerId, "lots");
        return perm.permitted;
      });
    }
    if (lotFarmFilter !== "ALL") {
      list = list.filter((l) => l.farmId === lotFarmFilter);
    }
    if (lotSearchTerm.trim()) {
      const q = lotSearchTerm.toLowerCase();
      list = list.filter((l) =>
        (l.lotNumber || "").toLowerCase().includes(q) ||
        (l.qualityGrade || "").toLowerCase().includes(q) ||
        (l.farmId || "").toLowerCase().includes(q) ||
        (l.lotStatus || "").toLowerCase().includes(q) ||
        (l.productionPeriod || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [lots, lotFarmerFilter, lotFarmFilter, lotSearchTerm, lotPermission.permitted, getSectionPermission]);

  // Tab 6: Trace Certificates & Applications
  const certPermission = useMemo(() => {
    return getSectionPermission(certFarmerFilter, "certificates");
  }, [certFarmerFilter, getSectionPermission]);

  const filteredCertificates = useMemo(() => {
    if (!certPermission.permitted) return [];
    let list = certificates;
    if (certFarmerFilter !== "ALL") {
      list = list.filter((c: any) => c.holderId === certFarmerFilter || c.farmerId === certFarmerFilter);
    } else {
      list = list.filter((c: any) => {
        const farmerId = (c as any).farmerId || c.holderId;
        if (!farmerId) return true;
        const perm = getSectionPermission(farmerId, "certificates");
        return perm.permitted;
      });
    }
    if (certFarmFilter !== "ALL") {
      list = list.filter((c) => c.farmId === certFarmFilter);
    }
    if (certSearchTerm.trim()) {
      const q = certSearchTerm.toLowerCase();
      list = list.filter((c) =>
        (c.certificateNumber || c.certificateId || "").toLowerCase().includes(q) ||
        (c.lotId || "").toLowerCase().includes(q) ||
        (c.farmId || "").toLowerCase().includes(q) ||
        (c.status || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [certificates, certFarmerFilter, certFarmFilter, certSearchTerm, certPermission.permitted, getSectionPermission]);

  const filteredApplications = useMemo(() => {
    if (!certPermission.permitted) return [];
    let list = applications;
    if (certFarmerFilter !== "ALL") {
      list = list.filter((a: any) => a.applicantId === certFarmerFilter || (a as any).farmerId === certFarmerFilter);
    } else {
      list = list.filter((a: any) => {
        const farmerId = (a as any).farmerId || a.applicantId;
        if (!farmerId) return true;
        const perm = getSectionPermission(farmerId, "certificates");
        return perm.permitted;
      });
    }
    if (certFarmFilter !== "ALL") {
      list = list.filter((a) => a.farmId === certFarmFilter);
    }
    if (certSearchTerm.trim()) {
      const q = certSearchTerm.toLowerCase();
      list = list.filter((a) =>
        (a.applicationNumber || a.applicationId || "").toLowerCase().includes(q) ||
        (a.lotId || "").toLowerCase().includes(q) ||
        (a.farmId || "").toLowerCase().includes(q) ||
        (a.status || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [applications, certFarmerFilter, certFarmFilter, certSearchTerm, certPermission.permitted, getSectionPermission]);

  // Tab 7: Commercial Trades
  const tradePermission = useMemo(() => {
    return getSectionPermission(tradeFarmerFilter, "trades");
  }, [tradeFarmerFilter, getSectionPermission]);

  const filteredTrades = useMemo(() => {
    if (!tradePermission.permitted) return [];
    let list = trades;
    if (tradeFarmerFilter !== "ALL") {
      list = list.filter((t: any) => t.sellerId === tradeFarmerFilter || t.sellerHolderId === tradeFarmerFilter);
    } else {
      list = list.filter((t: any) => {
        const farmerId = t.sellerId || t.sellerHolderId;
        if (!farmerId) return true;
        const perm = getSectionPermission(farmerId, "trades");
        return perm.permitted;
      });
    }
    if (tradeFarmFilter !== "ALL") {
      const farmLotIds = new Set(lots.filter((l) => l.farmId === tradeFarmFilter).map((l) => l.lotId));
      list = list.filter((t) => farmLotIds.has(t.lotId) || (t as any).farmId === tradeFarmFilter);
    }
    if (tradeSearchTerm.trim()) {
      const q = tradeSearchTerm.toLowerCase();
      list = list.filter((t) =>
        (t.tradeNumber || t.tradeId || "").toLowerCase().includes(q) ||
        (t.lotId || "").toLowerCase().includes(q) ||
        (t.tradeStatus || "").toLowerCase().includes(q) ||
        (t.currency || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [trades, tradeFarmerFilter, tradeFarmFilter, tradeSearchTerm, tradePermission.permitted, getSectionPermission, lots]);

  // Metrics
  const totalAssociatedFarmers = associations.length;
  const hasActiveAssociations = totalAssociatedFarmers > 0 || farms.length > 0;
  const totalPlots = farms.length;
  const totalHectares = farms
    .reduce((acc: number, f: any) => acc + (f.geofenceAreaHa ?? f.sizeHectares ?? 0), 0)
    .toFixed(1);
  const totalHarvestKg = harvests.reduce((acc: number, h: any) => acc + (h.quantityHarvestedKg || (h as any).quantityKg || 0), 0);
  const compliantCount = farms.filter((f: any) => f.eudrCompliant).length;

  // Map plots based on plot filter
  const mapPlots = useMemo(() => {
    return filteredFarms.flatMap((farm: any, idx: number) => {
      const poly = Array.isArray(farm.geofencePolygon) ? farm.geofencePolygon : [];
      const coords: [number, number][] = poly.map((p: any) => [
        p.lng || p[0] || 0,
        p.lat || p[1] || 0,
      ]);
      if (coords.length < 3) return [];
      return [
        {
          id: farm.id,
          name: `${farm.farmName} (${farm.farmerName || "Member Plot"})`,
          polygon: coords,
          areaHa: farm.geofenceAreaHa ?? farm.sizeHectares ?? 0,
          region: farm.region || "South-West Region",
          color: highlightedPlotId === farm.id ? "#b8f58b" : idx === 0 ? "#2a7a33" : "#10b981",
        },
      ];
    });
  }, [filteredFarms, highlightedPlotId]);



  // Helper check: verify if cooperative can perform actions for a farmer/farm
  const verifyFarmManagementPermission = (farmerId: string, farmId?: string): boolean => {
    const assoc = associations.find((a) => a.farmerId === farmerId);
    if (!assoc || assoc.status !== "active") return false;
    if (!assoc.manageEverything && !assoc.permissions?.farmsManagement) return false;
    if (assoc.farmScope === "single_farm" && farmId && Array.isArray(assoc.delegatedFarmIds)) {
      return assoc.delegatedFarmIds.includes(farmId);
    }
    return true;
  };

  // Handle Register Farm Plot on Behalf of Farmer
  const handleRegisterFarm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!farmFarmerIdInput) {
      setError("Please select an associated member farmer.");
      return;
    }

    if (!verifyFarmManagementPermission(farmFarmerIdInput)) {
      setError("Permission Denied: Your cooperative does not have farm management permission for this farmer.");
      return;
    }

    const selectedAssoc = associations.find((a) => a.farmerId === farmFarmerIdInput);
    if (selectedAssoc?.farmScope === "single_farm" && farms.some((f) => f.farmerId === farmFarmerIdInput)) {
      setError("Permission Denied: This farmer has only delegated a single farm to this cooperative. Cannot register additional plots.");
      return;
    }

    setFarmSubmitting(true);
    setError(null);
    try {
      const farmId = `farm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const newFarm: FarmRecord = {
        id: farmId,
        farmName: farmNameInput.trim(),
        farmerId: farmFarmerIdInput,
        farmerName: selectedAssoc?.farmerName || "Associated Farmer",
        region: farmRegionInput,
        village: farmVillageInput.trim() || "Manyu Basin",
        cooperative: coopOrgName,
        geolocation: "5.4521° N, 9.2431° E",
        sizeHectares: Number(farmSizeInput) || 2.5,
        geofenceAreaHa: Number(farmSizeInput) || 2.5,
        cocoaVariety: "Trinitario F1",
        quantityHarvestedKg: 0,
        eudrCompliant: true,
        createdAt: new Date().toISOString(),
        geofencePolygon: [
          [9.243, 5.452],
          [9.246, 5.454],
          [9.247, 5.451],
          [9.243, 5.452],
        ] as any,
      };

      await setDoc(doc(db, "farms", farmId), newFarm);
      setSuccessMsg(`Farm Plot "${newFarm.farmName}" successfully registered on behalf of ${newFarm.farmerName}!`);
      setShowRegisterFarmModal(false);
      setFarmNameInput("");
      setFarmVillageInput("");
      await loadCooperativeData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setFarmSubmitting(false);
    }
  };

  // Handle Create Seasonal Production Record on Behalf of Farmer
  const handleCreateProductionRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodRecordFarmerIdInput) {
      setError("Please select an associated member farmer.");
      return;
    }
    const perm = getSectionPermission(prodRecordFarmerIdInput, "production");
    if (!perm.permitted) {
      setError(`Permission Denied: ${perm.reason || "No production planning permission."}`);
      return;
    }
    setProdRecordSubmitting(true);
    setError(null);
    try {
      const recId = `prod_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const newRec: ProductionRecord = {
        productionRecordId: recId,
        farmId: prodRecordFarmIdInput || (farms.find((f) => f.farmerId === prodRecordFarmerIdInput)?.id || `farm_${prodRecordFarmerIdInput}`),
        seasonYear: String(prodRecordSeasonYearInput) || "2026",
        productionPeriod: prodRecordPeriodInput.trim() || "Main Crop Season 2026",
        startDate: new Date().toISOString().split("T")[0],
        endDate: new Date(Date.now() + 180 * 24 * 3600 * 1000).toISOString().split("T")[0],
        estimatedQuantityKg: Number(prodRecordEstQtyInput) || 2500,
        actualQuantityKg: 0,
        expectedNumberOfHarvests: Number(prodRecordExpectedHarvestsInput) || 3,
        numberOfHarvests: 0,
        status: "in_progress",
        notes: prodRecordNotesInput.trim() || `Cooperative seasonal management under ${coopOrgName}`,
        createdBy: user?.uid || coopOrgId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await setDoc(doc(db, "productions", recId), newRec);
      setSuccessMsg(`Seasonal Production Record "${newRec.productionPeriod}" created successfully for member farm!`);
      setShowProdRecordModal(false);
      setProdRecordNotesInput("");
      await loadCooperativeData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProdRecordSubmitting(false);
    }
  };

  // Handle Record Production Harvest
  const handleRecordProduction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodFarmerIdInput) {
      setError("Please select an associated member farmer.");
      return;
    }

    if (!verifyFarmManagementPermission(prodFarmerIdInput, prodFarmIdInput)) {
      setError("Permission Denied: Your cooperative does not have management rights for this farm.");
      return;
    }

    setProdSubmitting(true);
    setError(null);
    try {
      const harvestId = `harv_${Date.now()}`;
      await setDoc(doc(db, "harvests", harvestId), {
        harvestId,
        farmId: prodFarmIdInput || `farm_delegated_${prodFarmerIdInput}`,
        farmerId: prodFarmerIdInput,
        operatorRole: "cooperative",
        cooperativeOrgId: coopOrgId,
        batchNumber: prodBatchInput.trim() || `BATCH-COOP-${Date.now().toString().slice(-4)}`,
        quantityHarvestedKg: Number(prodQtyInput) || 1000,
        harvestDate: new Date().toISOString(),
        qualityGrade: "Grade 1 Export (Fine Cocoa)",
        createdAt: new Date().toISOString(),
      });

      setSuccessMsg(`Harvest batch recorded for member farmer (${prodQtyInput} kg) under ${coopOrgName} custody!`);
      setShowProductionModal(false);
      setProdBatchInput("");
      await loadCooperativeData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProdSubmitting(false);
    }
  };

  // Handle Create Cocoa Lot
  const handleCreateLot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lotFarmerIdInput) {
      setError("Please select an associated member farmer.");
      return;
    }

    if (!verifyFarmManagementPermission(lotFarmerIdInput, lotFarmIdInput)) {
      setError("Permission Denied: Your cooperative does not have management rights for this farm.");
      return;
    }

    setLotSubmitting(true);
    setError(null);
    try {
      const lotId = `lot_${Date.now()}`;
      await setDoc(doc(db, "cocoaLots", lotId), {
        lotId,
        lotNumber: `LOT-COOP-${Date.now().toString().slice(-5)}`,
        farmId: lotFarmIdInput || `farm_delegated_${lotFarmerIdInput}`,
        farmerId: lotFarmerIdInput,
        operatorRole: "cooperative",
        cooperativeOrgId: coopOrgId,
        weightKg: Number(lotQtyInput) || 1000,
        certificationStatus: "eudr_verified",
        qualityGrade: "Grade 1 Export",
        originRegion: "South-West Region, Cameroon",
        createdAt: new Date().toISOString(),
      });

      setSuccessMsg(`Traceable cocoa lot created (${lotQtyInput} kg) for associated member farmer!`);
      setShowLotModal(false);
      await loadCooperativeData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLotSubmitting(false);
    }
  };

  // Handle Apply Certificate
  const handleApplyCertificate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!certFarmerIdInput) {
      setError("Please select an associated member farmer.");
      return;
    }

    if (!verifyFarmManagementPermission(certFarmerIdInput, certFarmIdInput)) {
      setError("Permission Denied: Your cooperative does not have management rights for this farm.");
      return;
    }

    setCertSubmitting(true);
    setError(null);
    try {
      const certId = `CERT-CM-${Date.now().toString().slice(-6)}`;
      await setDoc(doc(db, "certificates", certId), {
        certificateId: certId,
        lotId: `lot_delegated_${certFarmerIdInput}`,
        farmId: certFarmIdInput || `farm_delegated_${certFarmerIdInput}`,
        farmerId: certFarmerIdInput,
        operatorRole: "cooperative",
        cooperativeOrgId: coopOrgId,
        cooperativeOrgName: coopOrgName,
        status: "active",
        issuedAt: new Date().toISOString(),
        eudrDueDiligenceVerified: true,
        countryOfOrigin: "Cameroon",
      });

      setSuccessMsg(`Origin Trace Certificate ${certId} issued on behalf of associated farmer!`);
      setShowCertModal(false);
      await loadCooperativeData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCertSubmitting(false);
    }
  };

  // Filtered farms for a chosen farmer in modals
  const getFarmsForFarmerModal = (farmerId: string) => {
    return farms.filter((f) => f.farmerId === farmerId);
  };

  return (
    <div className="min-h-screen bg-[#f7f8f3] text-[#10251d]">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 pb-16 pt-28 sm:px-6 sm:pt-32 lg:px-8">
        
        {/* Top Header Badge & Workspace Identity */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[#edf7e8] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#2d6130] border border-[#cdebc2]">
                Cooperative Workspace
              </span>

              <span className="flex items-center gap-1.5 text-xs font-bold text-[#0b3528]">
                <Building2 size={14} className="text-[#2a7a33]" />
                {coopOrgName}
              </span>

              {user && (
                <span className="flex items-center gap-1 text-xs font-semibold text-[#57655d]">
                  <UserCheck size={14} className="text-[#2a7a33]" />
                  Operator: {user.displayName || user.email}
                </span>
              )}
            </div>

            <h1 className="mt-3 text-2xl font-bold tracking-tight text-[#10251d] sm:text-3xl">
              Cooperative Farm Plots &amp; Operations Overview
            </h1>
            <p className="mt-1 text-sm text-[#57655d]">
              Manage member farmer plots, georeferenced polygon boundaries, EUDR compliance, and commercial trade operations under cooperative delegation.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setActiveTab("farmers")}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#2d6130] bg-[#edf7e8] px-4 py-2.5 text-xs font-bold text-[#2d6130] transition hover:bg-[#d8eed0] cursor-pointer"
            >
              <Users size={14} />
              Associated Farmers ({associations.length})
            </button>

            <button
              type="button"
              disabled={!hasActiveAssociations}
              onClick={() => {
                if (!hasActiveAssociations) return;
                setFarmFarmerIdInput(associations[0]?.farmerId || "");
                setShowRegisterFarmModal(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#0b3528] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#144737] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              title={!hasActiveAssociations ? "Requires active farmer association" : undefined}
            >
              <Plus size={14} />
              Register Plot
            </button>

            <button
              type="button"
              disabled={!hasActiveAssociations}
              onClick={() => {
                if (!hasActiveAssociations) return;
                setProdFarmerIdInput(associations[0]?.farmerId || "");
                setShowProductionModal(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#dfe7d8] bg-white px-4 py-2.5 text-xs font-bold text-[#10251d] shadow-sm transition hover:bg-[#f7f8f3] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              title={!hasActiveAssociations ? "Requires active farmer association" : undefined}
            >
              <Layers size={14} />
              Record Harvest
            </button>

            <button
              type="button"
              disabled={!hasActiveAssociations}
              onClick={() => {
                if (!hasActiveAssociations) return;
                setLotFarmerIdInput(associations[0]?.farmerId || "");
                setShowLotModal(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#dfe7d8] bg-white px-4 py-2.5 text-xs font-bold text-[#10251d] shadow-sm transition hover:bg-[#f7f8f3] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              title={!hasActiveAssociations ? "Requires active farmer association" : undefined}
            >
              <FileText size={14} />
              Create Lot
            </button>
          </div>
        </div>

        {/* Global Feedback Messages */}
        {error && (
          <div className="mb-6 rounded-2xl bg-red-50 p-4 text-xs text-red-800 flex items-center justify-between gap-2 border border-red-200 shadow-xs">
            <div className="flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 cursor-pointer">
              <X size={16} />
            </button>
          </div>
        )}

        {successMsg && (
          <div className="mb-6 rounded-2xl bg-emerald-50 p-4 text-xs text-emerald-800 flex items-center justify-between gap-2 border border-emerald-200 shadow-xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
            <button onClick={() => setSuccessMsg(null)} className="text-emerald-500 hover:text-emerald-700 cursor-pointer">
              <X size={16} />
            </button>
          </div>
        )}

        {/* Permission Gate Warning if Zero Farmer Associations */}
        {!hasActiveAssociations && (
          <div className="mb-8 rounded-3xl border border-amber-300 bg-amber-50/90 p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white">
                <Lock size={22} />
              </div>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-bold text-amber-950">
                    Awaiting Farmer Farm Delegation
                  </h2>
                  <span className="rounded-full bg-amber-200 px-2.5 py-0.5 text-[10px] font-black uppercase text-amber-900">
                    Delegation Required
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-amber-900">
                  You are logged into your cooperative workspace. Farmers link their farms and grant management delegations from their <strong>Farmer Dashboard &rarr; Cooperative Hub</strong>. They can search for your cooperative using:
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-mono font-medium text-amber-950">
                  <span className="rounded-lg bg-amber-200/80 px-2.5 py-1">Name: {coopOrgName}</span>
                  {user?.email && <span className="rounded-lg bg-amber-200/80 px-2.5 py-1">Email: {user.email}</span>}
                  {coopOrgId && <span className="rounded-lg bg-amber-200/80 px-2.5 py-1">Coop ID: {coopOrgId}</span>}
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => loadCooperativeData()}
                    className="inline-flex items-center gap-2 rounded-full bg-[#0b3528] px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#144737] cursor-pointer"
                  >
                    <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                    Refresh Delegated Farms
                  </button>
                  <span className="text-xs text-amber-800">
                    Once a farmer links and delegates a farm, it will appear here immediately.
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Workflow Navigation (Matching Farmer Dashboard Structure) */}
        <div className="mb-8">
          <DashboardWorkflowNav currentTab="farm-management" />
        </div>

        {/* Metric Cards */}
        <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Total Plots"
            value={totalPlots}
            unit="plots"
            description="Georeferenced plots of member farmers"
            icon={<MapPin size={16} />}
          />
          <MetricCard
            label="Total Area"
            value={totalHectares}
            unit="hectares"
            description="Active cultivated cocoa land"
            icon={<Trees size={16} />}
          />
          <MetricCard
            label="Total Recorded Harvest"
            value={totalHarvestKg.toLocaleString()}
            unit="kg"
            description="Intake volume from member farms"
            icon={<Layers size={16} />}
          />
          <MetricCard
            label="EUDR Compliant Plots"
            value={`${compliantCount} / ${totalPlots}`}
            unit="compliant"
            description="Zero-deforestation verified"
            icon={<ShieldCheck size={16} />}
          />
        </section>

        {/* Mapbox Geofence Map */}
        <section className="mb-8 overflow-hidden rounded-3xl border border-[#dfe7d8] bg-white p-4 sm:p-6 shadow-sm">
          <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-[#10251d] flex items-center gap-2">
                <MapPin size={18} className="text-[#2d6130]" />
                Cooperative Geofenced Farm Plots Map
              </h2>
              <p className="text-xs text-[#57655d]">
                Showing polygons for {plotFarmerFilter === "ALL" ? "all member farm plots under cooperative delegation" : associations.find((a) => a.farmerId === plotFarmerFilter)?.farmerName || "selected farmer"}.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-[#57655d]">
                <span className="h-3 w-3 rounded-full bg-[#2a7a33] inline-block" /> EUDR Compliant Plots
              </span>
            </div>
          </div>

          <MapboxGeofenceMap
            existingPlots={mapPlots}
            selectedPlotId={highlightedPlotId}
            onSelectPlot={(id) => setHighlightedPlotId(id)}
          />
        </section>

        {/* Subsection 7 Tabs Navigation */}
        <div className="mb-6 flex border-b border-[#dfe7d8] gap-1 sm:gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab("farms")}
            className={`flex items-center gap-2 border-b-2 px-4 sm:px-5 py-3.5 text-xs sm:text-sm font-bold transition cursor-pointer whitespace-nowrap ${
              activeTab === "farms" ? "border-[#2d6130] text-[#0b3528]" : "border-transparent text-[#57655d] hover:text-[#10251d]"
            }`}
          >
            <MapPin size={15} /> Farm Plots ({filteredFarms.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("farmers")}
            className={`flex items-center gap-2 border-b-2 px-4 sm:px-5 py-3.5 text-xs sm:text-sm font-bold transition cursor-pointer whitespace-nowrap ${
              activeTab === "farmers" ? "border-[#2d6130] text-[#0b3528]" : "border-transparent text-[#57655d] hover:text-[#10251d]"
            }`}
          >
            <Users size={15} /> Member Roster ({associations.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("production")}
            className={`flex items-center gap-2 border-b-2 px-4 sm:px-5 py-3.5 text-xs sm:text-sm font-bold transition cursor-pointer whitespace-nowrap ${
              activeTab === "production" ? "border-[#2d6130] text-[#0b3528]" : "border-transparent text-[#57655d] hover:text-[#10251d]"
            }`}
          >
            <Sprout size={15} /> Production Records ({filteredProductions.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("harvests")}
            className={`flex items-center gap-2 border-b-2 px-4 sm:px-5 py-3.5 text-xs sm:text-sm font-bold transition cursor-pointer whitespace-nowrap ${
              activeTab === "harvests" ? "border-[#2d6130] text-[#0b3528]" : "border-transparent text-[#57655d] hover:text-[#10251d]"
            }`}
          >
            <Layers size={15} /> Harvest Intake ({filteredHarvests.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("lots")}
            className={`flex items-center gap-2 border-b-2 px-4 sm:px-5 py-3.5 text-xs sm:text-sm font-bold transition cursor-pointer whitespace-nowrap ${
              activeTab === "lots" ? "border-[#2d6130] text-[#0b3528]" : "border-transparent text-[#57655d] hover:text-[#10251d]"
            }`}
          >
            <Boxes size={15} /> Cocoa Lots ({filteredLots.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("certificates")}
            className={`flex items-center gap-2 border-b-2 px-4 sm:px-5 py-3.5 text-xs sm:text-sm font-bold transition cursor-pointer whitespace-nowrap ${
              activeTab === "certificates" ? "border-[#2d6130] text-[#0b3528]" : "border-transparent text-[#57655d] hover:text-[#10251d]"
            }`}
          >
            <BadgeCheck size={15} /> Trace Certificates ({filteredCertificates.length + filteredApplications.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("trades")}
            className={`flex items-center gap-2 border-b-2 px-4 sm:px-5 py-3.5 text-xs sm:text-sm font-bold transition cursor-pointer whitespace-nowrap ${
              activeTab === "trades" ? "border-[#2d6130] text-[#0b3528]" : "border-transparent text-[#57655d] hover:text-[#10251d]"
            }`}
          >
            <Handshake size={15} /> Commercial Trades ({filteredTrades.length})
          </button>
        </div>

        {/* ============================================================ */}
        {/* TAB 1: COOPERATIVE FARM PLOTS */}
        {/* ============================================================ */}
        {activeTab === "farms" && (
          <section className="space-y-4">
            {/* Hierarchical Filter Bar */}
            <div className="mb-6 rounded-3xl border border-[#dfe7d8] bg-white p-4 sm:p-5 shadow-xs">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[#edf7e8] text-[#2d6130]">
                    <SlidersHorizontal size={16} />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#2d6130]">Farm Plots Filter</h3>
                    <p className="text-[11px] text-[#57655d]">
                      {plotFarmerFilter === "ALL"
                        ? `Showing plots across all ${associations.length} associated member farmers`
                        : `Filtered for ${associations.find((a) => a.farmerId === plotFarmerFilter)?.farmerName || "selected farmer"}`}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {/* 1. Primary Filter: Farmer */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-[#10251d] whitespace-nowrap">1. Farmer:</span>
                    <select
                      value={plotFarmerFilter}
                      onChange={(e) =>
                        handleFarmerChangeForSection(
                          e.target.value,
                          setPlotFarmerFilter,
                          plotFarmFilter,
                          setPlotFarmFilter
                        )
                      }
                      className="rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] px-3 py-2 text-xs font-bold text-[#10251d] outline-none focus:border-[#2d6130]"
                    >
                      <option value="ALL">All Associated Farmers ({associations.length})</option>
                      {associations.map((a) => (
                        <option key={a.farmerId} value={a.farmerId}>
                          {a.farmerName} ({a.farmScope === "single_farm" ? "Single Farm" : "All Farms"})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 2. Secondary Filter: Dependent Farm */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-[#10251d] whitespace-nowrap">2. Farm Plot:</span>
                    <select
                      value={plotFarmFilter}
                      onChange={(e) => setPlotFarmFilter(e.target.value)}
                      className="rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] px-3 py-2 text-xs font-bold text-[#10251d] outline-none focus:border-[#2d6130]"
                    >
                      <option value="ALL">
                        {plotFarmerFilter === "ALL"
                          ? `All Member Farms (${farms.length})`
                          : `All Farms of this Farmer (${farms.filter((f) => f.farmerId === plotFarmerFilter).length})`}
                      </option>
                      {(plotFarmerFilter === "ALL" ? farms : farms.filter((f) => f.farmerId === plotFarmerFilter)).map(
                        (f) => (
                          <option key={f.id} value={f.id}>
                            {f.farmName} ({f.village || f.region || "Cameroon"})
                          </option>
                        )
                      )}
                    </select>
                  </div>

                  {/* 3. Search Keyword */}
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search plot by name, village..."
                      value={plotSearchTerm}
                      onChange={(e) => setPlotSearchTerm(e.target.value)}
                      className="w-44 sm:w-52 rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] py-2 pl-8 pr-3 text-xs outline-none focus:border-[#2d6130]"
                    />
                  </div>

                  {/* Reset */}
                  {(plotFarmerFilter !== "ALL" || plotFarmFilter !== "ALL" || plotSearchTerm) && (
                    <button
                      type="button"
                      onClick={() => {
                        setPlotFarmerFilter("ALL");
                        setPlotFarmFilter("ALL");
                        setPlotSearchTerm("");
                      }}
                      className="inline-flex items-center gap-1 rounded-2xl border border-[#dfe7d8] bg-white px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 cursor-pointer"
                      title="Reset Section Filters"
                    >
                      <RotateCcw size={12} />
                      Reset
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={!hasActiveAssociations}
                    onClick={() => {
                      if (!hasActiveAssociations) return;
                      setFarmFarmerIdInput(plotFarmerFilter !== "ALL" ? plotFarmerFilter : associations[0]?.farmerId || "");
                      setShowRegisterFarmModal(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#0b3528] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#144737] disabled:opacity-40 cursor-pointer"
                  >
                    <Plus size={14} /> Register Plot
                  </button>
                </div>
              </div>
            </div>

            {/* Permission Check for Plots */}
            {!plotPermission.permitted ? (
              <div className="rounded-3xl border border-amber-300 bg-amber-50/80 p-8 text-center my-6 shadow-xs">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-800">
                  <Lock size={22} />
                </div>
                <h3 className="text-base font-bold text-[#10251d]">Farm Plot Management Restricted</h3>
                <p className="mt-1.5 text-xs text-[#57655d] max-w-lg mx-auto leading-relaxed">
                  {plotPermission.reason || "The selected member farmer has not granted permission for the cooperative to manage farm plots."}
                </p>
                <div className="mt-5 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setPlotFarmerFilter("ALL")}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#0b3528] px-5 py-2 text-xs font-bold text-white hover:bg-[#144737] cursor-pointer"
                  >
                    <Users size={14} /> Show All Permitted Farmers
                  </button>
                </div>
              </div>
            ) : filteredFarms.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-[#dfe7d8] bg-white p-12 text-center">
                <MapPin className="mx-auto text-gray-300 mb-3" size={36} />
                <h3 className="text-base font-bold text-[#10251d]">No Farm Plots Found</h3>
                <p className="mt-1 text-xs text-[#57655d] max-w-md mx-auto">
                  {!hasActiveAssociations
                    ? "Awaiting farm delegation from member farmers. Once a farmer links their farm in their Cooperative Hub, it will appear here."
                    : "No farm plots match the current filter selection."}
                </p>
                {hasActiveAssociations && (
                  <button
                    type="button"
                    onClick={() => {
                      setFarmFarmerIdInput(associations[0]?.farmerId || "");
                      setShowRegisterFarmModal(true);
                    }}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#0b3528] px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#144737] cursor-pointer"
                  >
                    <Plus size={14} /> Register First Plot
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredFarms.map((farm) => {
                  const assoc = associations.find((a) => a.farmerId === farm.farmerId);
                  return (
                    <div
                      key={farm.id}
                      className="group flex flex-col justify-between rounded-3xl border border-[#dfe7d8] bg-white p-5 shadow-xs transition hover:border-[#2d6130] hover:shadow-md"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="rounded-full bg-[#edf7e8] px-2.5 py-0.5 text-[10px] font-bold text-[#2d6130]">
                              {assoc?.farmScope === "single_farm" ? "Delegated (Single Farm)" : "Delegated (All Farms)"}
                            </span>
                            <h3 className="mt-2 text-base font-bold text-[#10251d]">{farm.farmName}</h3>
                            <p className="text-xs text-[#57655d]">
                              Farmer: <strong className="text-[#10251d]">{farm.farmerName || farm.farmerId}</strong>
                            </p>
                          </div>
                          {farm.eudrCompliant && (
                            <span className="rounded-full bg-emerald-100 p-1 text-emerald-700" title="EUDR Compliant">
                              <ShieldCheck size={16} />
                            </span>
                          )}
                        </div>

                        <div className="mt-4 space-y-1.5 text-xs text-[#57655d] border-t border-[#edf1ea] pt-3">
                          <div className="flex justify-between">
                            <span>Location:</span>
                            <span className="font-semibold text-[#10251d]">{farm.village || "Manyu Basin"}, {farm.region}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Area:</span>
                            <span className="font-semibold text-[#10251d]">{farm.geofenceAreaHa ?? farm.sizeHectares ?? 0} Ha</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Harvest Volume:</span>
                            <span className="font-semibold text-[#10251d]">{farm.quantityHarvestedKg || 0} kg</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Variety:</span>
                            <span className="font-semibold text-[#10251d]">{farm.cocoaVariety || "Trinitario F1"}</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-5 flex items-center justify-between border-t border-[#edf1ea] pt-3">
                        <button
                          type="button"
                          onClick={() => setHighlightedPlotId(farm.id)}
                          className="text-xs font-bold text-[#2d6130] hover:underline cursor-pointer"
                        >
                          Highlight on Map
                        </button>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedFarm(farm)}
                            className="rounded-full border border-[#dfe7d8] bg-[#f7f8f3] px-3 py-1.5 text-xs font-semibold text-[#10251d] hover:bg-[#edf7e8] cursor-pointer"
                          >
                            Dossier
                          </button>
                          <button
                            type="button"
                            onClick={() => setCertificateModalFarm(farm)}
                            className="rounded-full bg-[#0b3528] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#144737] cursor-pointer"
                          >
                            Certificate
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ============================================================ */}
        {/* TAB 2: MEMBER FARMER ROSTER */}
        {/* ============================================================ */}
        {activeTab === "farmers" && (
          <section className="rounded-3xl border border-[#dfe7d8] bg-white p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#edf1ea] pb-5">
              <div>
                <h3 className="text-lg font-bold text-[#10251d]">Associated Member Farmers &amp; Delegation Roster</h3>
                <p className="text-xs text-[#57655d]">
                  Active farmers associated with {coopOrgName} with explicit permission for single or all farms.
                </p>
              </div>
              <button
                type="button"
                onClick={() => loadCooperativeData()}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#0b3528] px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#144737] cursor-pointer"
              >
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh Roster
              </button>
            </div>

            {associations.length === 0 ? (
              <div className="py-12 text-center">
                <Users className="mx-auto text-gray-300 mb-3" size={40} />
                <h4 className="text-base font-bold text-[#10251d]">No Associated Farmers</h4>
                <p className="mt-1 text-xs text-[#57655d] max-w-md mx-auto">
                  Your cooperative currently has no member farmers associated. Farmers can link their farms to your cooperative from their Cooperative Hub by searching for &quot;{coopOrgName}&quot; or &quot;{user?.email}&quot;.
                </p>
              </div>
            ) : (
              <div className="mt-6 divide-y divide-[#edf1ea]">
                {associations.map((assoc) => {
                  const farmerFarmsCount = farms.filter((f) => f.farmerId === assoc.farmerId).length;
                  return (
                    <div key={assoc.associationId} className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div className="flex items-start gap-3.5">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#edf7e8] text-[#2d6130] font-bold">
                          {assoc.farmerName ? assoc.farmerName.charAt(0) : "F"}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <strong className="text-sm font-bold text-[#10251d]">{assoc.farmerName}</strong>
                            <span className="font-mono text-[10px] text-gray-400">({assoc.farmerId})</span>
                            <span className="rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5">
                              {assoc.status}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-[#57655d]">
                            Contact: {assoc.cooperativePhone || "Not specified"} • Associated: {new Date(assoc.associatedAt).toLocaleDateString()}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-[#f7f8f3] border border-[#dfe7d8] px-2.5 py-0.5 text-[10px] font-bold text-[#10251d]">
                              Scope: {assoc.farmScope === "single_farm" ? `Single Farm (${assoc.delegatedFarmNames?.[0] || assoc.delegatedFarmIds?.[0] || "1 Farm"})` : "All Member Farms"}
                            </span>
                            <span className="rounded-full bg-[#edf7e8] px-2.5 py-0.5 text-[10px] font-bold text-[#2d6130]">
                              Permission: {assoc.manageEverything ? "Manage Everything (Full Rights)" : "Custom Permissions"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setPlotFarmerFilter(assoc.farmerId);
                            setActiveTab("farms");
                          }}
                          className="rounded-full border border-[#2d6130] bg-[#edf7e8] px-4 py-1.5 text-xs font-bold text-[#2d6130] hover:bg-[#d8eed0] cursor-pointer"
                        >
                          View Plots ({farmerFarmsCount})
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ============================================================ */}
        {/* TAB 3: PRODUCTION RECORDS */}
        {/* ============================================================ */}
        {activeTab === "production" && (
          <section className="space-y-4">
            {/* Hierarchical Filter Bar */}
            <div className="mb-6 rounded-3xl border border-[#dfe7d8] bg-white p-4 sm:p-5 shadow-xs">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[#edf7e8] text-[#2d6130]">
                    <SlidersHorizontal size={16} />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#2d6130]">Production Records Filter</h3>
                    <p className="text-[11px] text-[#57655d]">
                      {prodFarmerFilter === "ALL"
                        ? `Showing seasonal production across all ${associations.length} associated member farmers`
                        : `Filtered for ${associations.find((a) => a.farmerId === prodFarmerFilter)?.farmerName || "selected farmer"}`}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {/* 1. Primary Filter: Farmer */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-[#10251d] whitespace-nowrap">1. Farmer:</span>
                    <select
                      value={prodFarmerFilter}
                      onChange={(e) =>
                        handleFarmerChangeForSection(
                          e.target.value,
                          setProdFarmerFilter,
                          prodFarmFilter,
                          setProdFarmFilter
                        )
                      }
                      className="rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] px-3 py-2 text-xs font-bold text-[#10251d] outline-none focus:border-[#2d6130]"
                    >
                      <option value="ALL">All Associated Farmers ({associations.length})</option>
                      {associations.map((a) => (
                        <option key={a.farmerId} value={a.farmerId}>
                          {a.farmerName} ({a.farmScope === "single_farm" ? "Single Farm" : "All Farms"})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 2. Secondary Filter: Dependent Farm */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-[#10251d] whitespace-nowrap">2. Farm Plot:</span>
                    <select
                      value={prodFarmFilter}
                      onChange={(e) => setProdFarmFilter(e.target.value)}
                      className="rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] px-3 py-2 text-xs font-bold text-[#10251d] outline-none focus:border-[#2d6130]"
                    >
                      <option value="ALL">
                        {prodFarmerFilter === "ALL"
                          ? `All Member Farms (${farms.length})`
                          : `All Farms of this Farmer (${farms.filter((f) => f.farmerId === prodFarmerFilter).length})`}
                      </option>
                      {(prodFarmerFilter === "ALL" ? farms : farms.filter((f) => f.farmerId === prodFarmerFilter)).map(
                        (f) => (
                          <option key={f.id} value={f.id}>
                            {f.farmName} ({f.village || f.region || "Cameroon"})
                          </option>
                        )
                      )}
                    </select>
                  </div>

                  {/* 3. Search Keyword */}
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search season, notes..."
                      value={prodSearchTerm}
                      onChange={(e) => setProdSearchTerm(e.target.value)}
                      className="w-44 sm:w-52 rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] py-2 pl-8 pr-3 text-xs outline-none focus:border-[#2d6130]"
                    />
                  </div>

                  {/* Reset */}
                  {(prodFarmerFilter !== "ALL" || prodFarmFilter !== "ALL" || prodSearchTerm) && (
                    <button
                      type="button"
                      onClick={() => {
                        setProdFarmerFilter("ALL");
                        setProdFarmFilter("ALL");
                        setProdSearchTerm("");
                      }}
                      className="inline-flex items-center gap-1 rounded-2xl border border-[#dfe7d8] bg-white px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 cursor-pointer"
                      title="Reset Section Filters"
                    >
                      <RotateCcw size={12} />
                      Reset
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={!hasActiveAssociations}
                    onClick={() => {
                      if (!hasActiveAssociations) return;
                      const initialFarmer = prodFarmerFilter !== "ALL" ? prodFarmerFilter : associations[0]?.farmerId || "";
                      setProdRecordFarmerIdInput(initialFarmer);
                      const farmerFarms = getFarmsForFarmerModal(initialFarmer);
                      setProdRecordFarmIdInput(farmerFarms[0]?.id || "");
                      setShowProdRecordModal(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#0b3528] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#144737] disabled:opacity-40 cursor-pointer"
                  >
                    <Plus size={14} /> Log Production Plan
                  </button>
                </div>
              </div>
            </div>

            {/* Permission Check for Production */}
            {!prodPermission.permitted ? (
              <div className="rounded-3xl border border-amber-300 bg-amber-50/80 p-8 text-center my-6 shadow-xs">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-800">
                  <Lock size={22} />
                </div>
                <h3 className="text-base font-bold text-[#10251d]">Production Records Access Restricted</h3>
                <p className="mt-1.5 text-xs text-[#57655d] max-w-lg mx-auto leading-relaxed">
                  {prodPermission.reason || "The selected member farmer has not granted permission for the cooperative to manage or inspect production records."}
                </p>
                <div className="mt-5 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setProdFarmerFilter("ALL")}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#0b3528] px-5 py-2 text-xs font-bold text-white hover:bg-[#144737] cursor-pointer"
                  >
                    <Users size={14} /> Show All Permitted Farmers
                  </button>
                </div>
              </div>
            ) : filteredProductions.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-[#dfe7d8] bg-white p-12 text-center">
                <Sprout className="mx-auto text-gray-300 mb-3" size={36} />
                <h3 className="text-base font-bold text-[#10251d]">No Production Records Found</h3>
                <p className="mt-1 text-xs text-[#57655d] max-w-md mx-auto">
                  No seasonal production plans or targets have been logged for the selected filter. Log a seasonal plan to track estimated yields and harvest timelines.
                </p>
                {hasActiveAssociations && (
                  <button
                    type="button"
                    onClick={() => {
                      const initialFarmer = prodFarmerFilter !== "ALL" ? prodFarmerFilter : associations[0]?.farmerId || "";
                      setProdRecordFarmerIdInput(initialFarmer);
                      const farmerFarms = getFarmsForFarmerModal(initialFarmer);
                      setProdRecordFarmIdInput(farmerFarms[0]?.id || "");
                      setShowProdRecordModal(true);
                    }}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#0b3528] px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#144737] cursor-pointer"
                  >
                    <Plus size={14} /> Log First Production Plan
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredProductions.map((prod) => {
                  const farm = farms.find((f) => f.id === prod.farmId);
                  const farmer = associations.find((a) => a.farmerId === (prod as any).farmerId || a.farmerId === prod.createdBy);
                  return (
                    <div
                      key={prod.productionRecordId}
                      className="rounded-3xl border border-[#dfe7d8] bg-white p-5 shadow-xs transition hover:border-[#2d6130] hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="rounded-full bg-[#edf7e8] px-2.5 py-0.5 text-[10px] font-bold text-[#2d6130]">
                            Season {prod.seasonYear}
                          </span>
                          <h4 className="mt-2 text-base font-bold text-[#10251d]">{prod.productionPeriod}</h4>
                          <p className="text-xs text-[#57655d]">
                            Farm: <strong className="text-[#10251d]">{farm?.farmName || prod.farmId}</strong>
                          </p>
                          {farmer && (
                            <p className="text-[11px] text-[#57655d]">
                              Farmer: <strong className="text-[#10251d]">{farmer.farmerName}</strong>
                            </p>
                          )}
                        </div>
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 uppercase">
                          {prod.status}
                        </span>
                      </div>

                      <div className="mt-4 space-y-1.5 text-xs text-[#57655d] border-t border-[#edf1ea] pt-3">
                        <div className="flex justify-between">
                          <span>Target Yield:</span>
                          <span className="font-semibold text-[#10251d]">{prod.estimatedQuantityKg?.toLocaleString() || 0} kg</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Actual Harvest:</span>
                          <span className="font-semibold text-[#2d6130]">{prod.actualQuantityKg?.toLocaleString() || 0} kg</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Expected Cycles:</span>
                          <span className="font-semibold text-[#10251d]">{prod.expectedNumberOfHarvests || 1} harvests</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Timeline:</span>
                          <span className="font-semibold text-[#10251d]">{prod.startDate} &rarr; {prod.endDate}</span>
                        </div>
                      </div>

                      {prod.notes && (
                        <p className="mt-3 text-[11px] text-[#57655d] bg-[#f7f8f3] p-2 rounded-xl italic">
                          &quot;{prod.notes}&quot;
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ============================================================ */}
        {/* TAB 4: HARVEST INTAKE */}
        {/* ============================================================ */}
        {activeTab === "harvests" && (
          <section className="space-y-4">
            {/* Hierarchical Filter Bar */}
            <div className="mb-6 rounded-3xl border border-[#dfe7d8] bg-white p-4 sm:p-5 shadow-xs">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[#edf7e8] text-[#2d6130]">
                    <SlidersHorizontal size={16} />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#2d6130]">Harvest Intake Filter</h3>
                    <p className="text-[11px] text-[#57655d]">
                      {harvestFarmerFilter === "ALL"
                        ? `Showing harvest batches across all ${associations.length} associated member farmers`
                        : `Filtered for ${associations.find((a) => a.farmerId === harvestFarmerFilter)?.farmerName || "selected farmer"}`}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {/* 1. Primary Filter: Farmer */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-[#10251d] whitespace-nowrap">1. Farmer:</span>
                    <select
                      value={harvestFarmerFilter}
                      onChange={(e) =>
                        handleFarmerChangeForSection(
                          e.target.value,
                          setHarvestFarmerFilter,
                          harvestFarmFilter,
                          setHarvestFarmFilter
                        )
                      }
                      className="rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] px-3 py-2 text-xs font-bold text-[#10251d] outline-none focus:border-[#2d6130]"
                    >
                      <option value="ALL">All Associated Farmers ({associations.length})</option>
                      {associations.map((a) => (
                        <option key={a.farmerId} value={a.farmerId}>
                          {a.farmerName} ({a.farmScope === "single_farm" ? "Single Farm" : "All Farms"})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 2. Secondary Filter: Dependent Farm */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-[#10251d] whitespace-nowrap">2. Farm Plot:</span>
                    <select
                      value={harvestFarmFilter}
                      onChange={(e) => setHarvestFarmFilter(e.target.value)}
                      className="rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] px-3 py-2 text-xs font-bold text-[#10251d] outline-none focus:border-[#2d6130]"
                    >
                      <option value="ALL">
                        {harvestFarmerFilter === "ALL"
                          ? `All Member Farms (${farms.length})`
                          : `All Farms of this Farmer (${farms.filter((f) => f.farmerId === harvestFarmerFilter).length})`}
                      </option>
                      {(harvestFarmerFilter === "ALL" ? farms : farms.filter((f) => f.farmerId === harvestFarmerFilter)).map(
                        (f) => (
                          <option key={f.id} value={f.id}>
                            {f.farmName} ({f.village || f.region || "Cameroon"})
                          </option>
                        )
                      )}
                    </select>
                  </div>

                  {/* 3. Search Keyword */}
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search batch code, grade..."
                      value={harvestSearchTerm}
                      onChange={(e) => setHarvestSearchTerm(e.target.value)}
                      className="w-44 sm:w-52 rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] py-2 pl-8 pr-3 text-xs outline-none focus:border-[#2d6130]"
                    />
                  </div>

                  {/* Reset */}
                  {(harvestFarmerFilter !== "ALL" || harvestFarmFilter !== "ALL" || harvestSearchTerm) && (
                    <button
                      type="button"
                      onClick={() => {
                        setHarvestFarmerFilter("ALL");
                        setHarvestFarmFilter("ALL");
                        setHarvestSearchTerm("");
                      }}
                      className="inline-flex items-center gap-1 rounded-2xl border border-[#dfe7d8] bg-white px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 cursor-pointer"
                      title="Reset Section Filters"
                    >
                      <RotateCcw size={12} />
                      Reset
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={!hasActiveAssociations}
                    onClick={() => {
                      if (!hasActiveAssociations) return;
                      const initialFarmer = harvestFarmerFilter !== "ALL" ? harvestFarmerFilter : associations[0]?.farmerId || "";
                      setProdFarmerIdInput(initialFarmer);
                      const farmerFarms = getFarmsForFarmerModal(initialFarmer);
                      setProdFarmIdInput(farmerFarms[0]?.id || "");
                      setShowProductionModal(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#0b3528] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#144737] disabled:opacity-40 cursor-pointer"
                  >
                    <Plus size={14} /> Record Harvest
                  </button>
                </div>
              </div>
            </div>

            {/* Permission Check for Harvests */}
            {!harvestPermission.permitted ? (
              <div className="rounded-3xl border border-amber-300 bg-amber-50/80 p-8 text-center my-6 shadow-xs">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-800">
                  <Lock size={22} />
                </div>
                <h3 className="text-base font-bold text-[#10251d]">Harvest Intake Access Restricted</h3>
                <p className="mt-1.5 text-xs text-[#57655d] max-w-lg mx-auto leading-relaxed">
                  {harvestPermission.reason || "The selected member farmer has not granted permission for the cooperative to manage harvest intake."}
                </p>
                <div className="mt-5 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setHarvestFarmerFilter("ALL")}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#0b3528] px-5 py-2 text-xs font-bold text-white hover:bg-[#144737] cursor-pointer"
                  >
                    <Users size={14} /> Show All Permitted Farmers
                  </button>
                </div>
              </div>
            ) : filteredHarvests.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-[#dfe7d8] bg-white p-12 text-center">
                <Layers className="mx-auto text-gray-300 mb-3" size={36} />
                <h3 className="text-base font-bold text-[#10251d]">No Harvest Intake Records Found</h3>
                <p className="mt-1 text-xs text-[#57655d] max-w-md mx-auto">
                  No harvest intake batches recorded under cooperative custody for this filter.
                </p>
                {hasActiveAssociations && (
                  <button
                    type="button"
                    onClick={() => {
                      const initialFarmer = harvestFarmerFilter !== "ALL" ? harvestFarmerFilter : associations[0]?.farmerId || "";
                      setProdFarmerIdInput(initialFarmer);
                      const farmerFarms = getFarmsForFarmerModal(initialFarmer);
                      setProdFarmIdInput(farmerFarms[0]?.id || "");
                      setShowProductionModal(true);
                    }}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#0b3528] px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#144737] cursor-pointer"
                  >
                    <Plus size={14} /> Record First Harvest
                  </button>
                )}
              </div>
            ) : (
              <div className="rounded-3xl border border-[#dfe7d8] bg-white p-5 shadow-sm">
                <div className="divide-y divide-[#edf1ea]">
                  {filteredHarvests.map((harvest) => {
                    const farm = farms.find((f) => f.id === harvest.farmId);
                    const farmer = associations.find((a) => a.farmerId === (harvest as any).farmerId || a.farmerId === harvest.createdBy);
                    const qty = harvest.quantityKg ?? (harvest as any).quantityHarvestedKg ?? 0;
                    const batchCode = (harvest as any).batchNumber || harvest.harvestId;
                    return (
                      <div key={harvest.harvestId} className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-[#10251d]">{batchCode}</span>
                            <span className="rounded-full bg-[#edf7e8] px-2 py-0.5 text-[10px] font-bold text-[#2d6130]">
                              {harvest.qualityGrade || "Grade 1 Export"}
                            </span>
                          </div>
                          <div className="text-xs text-[#57655d] mt-1">
                            Farm: <strong>{farm?.farmName || harvest.farmId}</strong>
                            {farmer && <span> • Farmer: <strong>{farmer.farmerName}</strong></span>}
                            <span> • Date: {harvest.harvestDate ? new Date(harvest.harvestDate).toLocaleDateString() : "Recent"}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 text-right">
                          <div>
                            <span className="text-base font-bold text-[#2d6130]">{qty.toLocaleString()} kg</span>
                            <div className="text-[10px] text-gray-400">Intake Volume</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        )}

        {/* ============================================================ */}
        {/* TAB 5: COCOA LOTS */}
        {/* ============================================================ */}
        {activeTab === "lots" && (
          <section className="space-y-4">
            {/* Hierarchical Filter Bar */}
            <div className="mb-6 rounded-3xl border border-[#dfe7d8] bg-white p-4 sm:p-5 shadow-xs">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[#edf7e8] text-[#2d6130]">
                    <SlidersHorizontal size={16} />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#2d6130]">Cocoa Lots Filter</h3>
                    <p className="text-[11px] text-[#57655d]">
                      {lotFarmerFilter === "ALL"
                        ? `Showing aggregated lots across all ${associations.length} associated member farmers`
                        : `Filtered for ${associations.find((a) => a.farmerId === lotFarmerFilter)?.farmerName || "selected farmer"}`}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {/* 1. Primary Filter: Farmer */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-[#10251d] whitespace-nowrap">1. Farmer:</span>
                    <select
                      value={lotFarmerFilter}
                      onChange={(e) =>
                        handleFarmerChangeForSection(
                          e.target.value,
                          setLotFarmerFilter,
                          lotFarmFilter,
                          setLotFarmFilter
                        )
                      }
                      className="rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] px-3 py-2 text-xs font-bold text-[#10251d] outline-none focus:border-[#2d6130]"
                    >
                      <option value="ALL">All Associated Farmers ({associations.length})</option>
                      {associations.map((a) => (
                        <option key={a.farmerId} value={a.farmerId}>
                          {a.farmerName} ({a.farmScope === "single_farm" ? "Single Farm" : "All Farms"})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 2. Secondary Filter: Dependent Farm */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-[#10251d] whitespace-nowrap">2. Farm Plot:</span>
                    <select
                      value={lotFarmFilter}
                      onChange={(e) => setLotFarmFilter(e.target.value)}
                      className="rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] px-3 py-2 text-xs font-bold text-[#10251d] outline-none focus:border-[#2d6130]"
                    >
                      <option value="ALL">
                        {lotFarmerFilter === "ALL"
                          ? `All Member Farms (${farms.length})`
                          : `All Farms of this Farmer (${farms.filter((f) => f.farmerId === lotFarmerFilter).length})`}
                      </option>
                      {(lotFarmerFilter === "ALL" ? farms : farms.filter((f) => f.farmerId === lotFarmerFilter)).map(
                        (f) => (
                          <option key={f.id} value={f.id}>
                            {f.farmName} ({f.village || f.region || "Cameroon"})
                          </option>
                        )
                      )}
                    </select>
                  </div>

                  {/* 3. Search Keyword */}
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search lot number, grade..."
                      value={lotSearchTerm}
                      onChange={(e) => setLotSearchTerm(e.target.value)}
                      className="w-44 sm:w-52 rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] py-2 pl-8 pr-3 text-xs outline-none focus:border-[#2d6130]"
                    />
                  </div>

                  {/* Reset */}
                  {(lotFarmerFilter !== "ALL" || lotFarmFilter !== "ALL" || lotSearchTerm) && (
                    <button
                      type="button"
                      onClick={() => {
                        setLotFarmerFilter("ALL");
                        setLotFarmFilter("ALL");
                        setLotSearchTerm("");
                      }}
                      className="inline-flex items-center gap-1 rounded-2xl border border-[#dfe7d8] bg-white px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 cursor-pointer"
                      title="Reset Section Filters"
                    >
                      <RotateCcw size={12} />
                      Reset
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={!hasActiveAssociations}
                    onClick={() => {
                      if (!hasActiveAssociations) return;
                      const initialFarmer = lotFarmerFilter !== "ALL" ? lotFarmerFilter : associations[0]?.farmerId || "";
                      setLotFarmerIdInput(initialFarmer);
                      const farmerFarms = getFarmsForFarmerModal(initialFarmer);
                      setLotFarmIdInput(farmerFarms[0]?.id || "");
                      setShowLotModal(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#0b3528] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#144737] disabled:opacity-40 cursor-pointer"
                  >
                    <Plus size={14} /> Create Cocoa Lot
                  </button>
                </div>
              </div>
            </div>

            {/* Permission Check for Lots */}
            {!lotPermission.permitted ? (
              <div className="rounded-3xl border border-amber-300 bg-amber-50/80 p-8 text-center my-6 shadow-xs">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-800">
                  <Lock size={22} />
                </div>
                <h3 className="text-base font-bold text-[#10251d]">Cocoa Lot Management Restricted</h3>
                <p className="mt-1.5 text-xs text-[#57655d] max-w-lg mx-auto leading-relaxed">
                  {lotPermission.reason || "The selected member farmer has not granted permission for the cooperative to manage cocoa lots."}
                </p>
                <div className="mt-5 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setLotFarmerFilter("ALL")}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#0b3528] px-5 py-2 text-xs font-bold text-white hover:bg-[#144737] cursor-pointer"
                  >
                    <Users size={14} /> Show All Permitted Farmers
                  </button>
                </div>
              </div>
            ) : filteredLots.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-[#dfe7d8] bg-white p-12 text-center">
                <Boxes className="mx-auto text-gray-300 mb-3" size={36} />
                <h3 className="text-base font-bold text-[#10251d]">No Cocoa Lots Found</h3>
                <p className="mt-1 text-xs text-[#57655d] max-w-md mx-auto">
                  No aggregated cocoa lots created for the selected filter. Group harvested batches into certified commercial lots.
                </p>
                {hasActiveAssociations && (
                  <button
                    type="button"
                    onClick={() => {
                      const initialFarmer = lotFarmerFilter !== "ALL" ? lotFarmerFilter : associations[0]?.farmerId || "";
                      setLotFarmerIdInput(initialFarmer);
                      const farmerFarms = getFarmsForFarmerModal(initialFarmer);
                      setLotFarmIdInput(farmerFarms[0]?.id || "");
                      setShowLotModal(true);
                    }}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#0b3528] px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#144737] cursor-pointer"
                  >
                    <Plus size={14} /> Create First Lot
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredLots.map((lot) => {
                  const farm = farms.find((f) => f.id === lot.farmId);
                  const farmer = associations.find((a) => a.farmerId === (lot as any).farmerId || a.farmerId === lot.createdBy);
                  const totalKg = lot.quantityKg || (lot as any).weightKg || 0;
                  const availKg = lot.availableQuantityKg ?? totalKg;
                  return (
                    <div
                      key={lot.lotId}
                      className="rounded-3xl border border-[#dfe7d8] bg-white p-5 shadow-xs transition hover:border-[#2d6130] hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="font-mono text-xs font-bold text-[#0b3528]">{lot.lotNumber}</span>
                          <h4 className="mt-1 text-sm font-bold text-[#10251d]">{lot.qualityGrade || "Grade 1 Export"}</h4>
                          <p className="text-xs text-[#57655d]">
                            Farm: <strong>{farm?.farmName || lot.farmId}</strong>
                          </p>
                          {farmer && (
                            <p className="text-[11px] text-[#57655d]">
                              Farmer: <strong>{farmer.farmerName}</strong>
                            </p>
                          )}
                        </div>
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 uppercase">
                          {lot.lotStatus || "active"}
                        </span>
                      </div>

                      <div className="mt-4 space-y-1.5 text-xs text-[#57655d] border-t border-[#edf1ea] pt-3">
                        <div className="flex justify-between">
                          <span>Total Lot Weight:</span>
                          <span className="font-semibold text-[#10251d]">{totalKg.toLocaleString()} kg</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Available Quantity:</span>
                          <span className="font-semibold text-[#2d6130]">{availKg.toLocaleString()} kg</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Price Reference:</span>
                          <span className="font-semibold text-[#10251d]">{lot.pricePerKg ? `${lot.pricePerKg} ${lot.currency || "XAF"}/kg` : "Market Rate"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Origin:</span>
                          <span className="font-semibold text-[#10251d]">{lot.originCountry || "Cameroon"}</span>
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-end gap-2 border-t border-[#edf1ea] pt-3">
                        <button
                          type="button"
                          onClick={() => {
                            if (farmer) setCertFarmerIdInput(farmer.farmerId);
                            setCertFarmIdInput(lot.farmId);
                            setShowCertModal(true);
                          }}
                          className="rounded-full bg-[#0b3528] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#144737] cursor-pointer"
                        >
                          Apply Certificate
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ============================================================ */}
        {/* TAB 6: TRACE CERTIFICATES & APPLICATIONS */}
        {/* ============================================================ */}
        {activeTab === "certificates" && (
          <section className="space-y-4">
            {/* Hierarchical Filter Bar */}
            <div className="mb-6 rounded-3xl border border-[#dfe7d8] bg-white p-4 sm:p-5 shadow-xs">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[#edf7e8] text-[#2d6130]">
                    <SlidersHorizontal size={16} />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#2d6130]">Trace Certificates Filter</h3>
                    <p className="text-[11px] text-[#57655d]">
                      {certFarmerFilter === "ALL"
                        ? `Showing certificates across all ${associations.length} associated member farmers`
                        : `Filtered for ${associations.find((a) => a.farmerId === certFarmerFilter)?.farmerName || "selected farmer"}`}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {/* 1. Primary Filter: Farmer */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-[#10251d] whitespace-nowrap">1. Farmer:</span>
                    <select
                      value={certFarmerFilter}
                      onChange={(e) =>
                        handleFarmerChangeForSection(
                          e.target.value,
                          setCertFarmerFilter,
                          certFarmFilter,
                          setCertFarmFilter
                        )
                      }
                      className="rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] px-3 py-2 text-xs font-bold text-[#10251d] outline-none focus:border-[#2d6130]"
                    >
                      <option value="ALL">All Associated Farmers ({associations.length})</option>
                      {associations.map((a) => (
                        <option key={a.farmerId} value={a.farmerId}>
                          {a.farmerName} ({a.farmScope === "single_farm" ? "Single Farm" : "All Farms"})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 2. Secondary Filter: Dependent Farm */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-[#10251d] whitespace-nowrap">2. Farm Plot:</span>
                    <select
                      value={certFarmFilter}
                      onChange={(e) => setCertFarmFilter(e.target.value)}
                      className="rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] px-3 py-2 text-xs font-bold text-[#10251d] outline-none focus:border-[#2d6130]"
                    >
                      <option value="ALL">
                        {certFarmerFilter === "ALL"
                          ? `All Member Farms (${farms.length})`
                          : `All Farms of this Farmer (${farms.filter((f) => f.farmerId === certFarmerFilter).length})`}
                      </option>
                      {(certFarmerFilter === "ALL" ? farms : farms.filter((f) => f.farmerId === certFarmerFilter)).map(
                        (f) => (
                          <option key={f.id} value={f.id}>
                            {f.farmName} ({f.village || f.region || "Cameroon"})
                          </option>
                        )
                      )}
                    </select>
                  </div>

                  {/* 3. Search Keyword */}
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search certificate #, status..."
                      value={certSearchTerm}
                      onChange={(e) => setCertSearchTerm(e.target.value)}
                      className="w-44 sm:w-52 rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] py-2 pl-8 pr-3 text-xs outline-none focus:border-[#2d6130]"
                    />
                  </div>

                  {/* Reset */}
                  {(certFarmerFilter !== "ALL" || certFarmFilter !== "ALL" || certSearchTerm) && (
                    <button
                      type="button"
                      onClick={() => {
                        setCertFarmerFilter("ALL");
                        setCertFarmFilter("ALL");
                        setCertSearchTerm("");
                      }}
                      className="inline-flex items-center gap-1 rounded-2xl border border-[#dfe7d8] bg-white px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 cursor-pointer"
                      title="Reset Section Filters"
                    >
                      <RotateCcw size={12} />
                      Reset
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={!hasActiveAssociations}
                    onClick={() => {
                      if (!hasActiveAssociations) return;
                      const initialFarmer = certFarmerFilter !== "ALL" ? certFarmerFilter : associations[0]?.farmerId || "";
                      setCertFarmerIdInput(initialFarmer);
                      const farmerFarms = getFarmsForFarmerModal(initialFarmer);
                      setCertFarmIdInput(farmerFarms[0]?.id || "");
                      setShowCertModal(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#0b3528] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#144737] disabled:opacity-40 cursor-pointer"
                  >
                    <Plus size={14} /> Apply Certificate
                  </button>
                </div>
              </div>
            </div>

            {/* Sub-tab toggle: Issued Certificates vs Applications */}
            <div className="flex items-center gap-2 border-b border-[#edf1ea] pb-3">
              <button
                type="button"
                onClick={() => setCertSubTab("certificates")}
                className={`rounded-full px-4 py-1.5 text-xs font-bold transition cursor-pointer ${
                  certSubTab === "certificates"
                    ? "bg-[#0b3528] text-white shadow-xs"
                    : "bg-white border border-[#dfe7d8] text-[#57655d] hover:text-[#10251d]"
                }`}
              >
                Issued Certificates ({filteredCertificates.length})
              </button>
              <button
                type="button"
                onClick={() => setCertSubTab("applications")}
                className={`rounded-full px-4 py-1.5 text-xs font-bold transition cursor-pointer ${
                  certSubTab === "applications"
                    ? "bg-[#0b3528] text-white shadow-xs"
                    : "bg-white border border-[#dfe7d8] text-[#57655d] hover:text-[#10251d]"
                }`}
              >
                Pending &amp; Reviewed Applications ({filteredApplications.length})
              </button>
            </div>

            {/* Permission Check for Certificates */}
            {!certPermission.permitted ? (
              <div className="rounded-3xl border border-amber-300 bg-amber-50/80 p-8 text-center my-6 shadow-xs">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-800">
                  <Lock size={22} />
                </div>
                <h3 className="text-base font-bold text-[#10251d]">Certificates Management Restricted</h3>
                <p className="mt-1.5 text-xs text-[#57655d] max-w-lg mx-auto leading-relaxed">
                  {certPermission.reason || "The selected member farmer has not granted permission for the cooperative to manage certificates."}
                </p>
                <div className="mt-5 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setCertFarmerFilter("ALL")}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#0b3528] px-5 py-2 text-xs font-bold text-white hover:bg-[#144737] cursor-pointer"
                  >
                    <Users size={14} /> Show All Permitted Farmers
                  </button>
                </div>
              </div>
            ) : certSubTab === "certificates" ? (
              filteredCertificates.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-[#dfe7d8] bg-white p-12 text-center">
                  <BadgeCheck className="mx-auto text-gray-300 mb-3" size={36} />
                  <h3 className="text-base font-bold text-[#10251d]">No Certificates Issued Yet</h3>
                  <p className="mt-1 text-xs text-[#57655d] max-w-md mx-auto">
                    Certificates issued under cooperative oversight will appear here. Click &quot;+ Apply Certificate&quot; to issue certification.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {filteredCertificates.map((cert) => {
                    const farm = farms.find((f) => f.id === cert.farmId);
                    const farmer = associations.find((a) => a.farmerId === (cert as any).farmerId || a.farmerId === cert.holderId);
                    return (
                      <div
                        key={cert.certificateId}
                        className="rounded-3xl border border-[#dfe7d8] bg-white p-5 shadow-xs transition hover:border-[#2d6130] hover:shadow-md"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="font-mono text-xs font-bold text-[#2d6130]">
                              {cert.certificateNumber || cert.certificateId}
                            </span>
                            <h4 className="mt-1 text-sm font-bold text-[#10251d]">EUDR Origin Trace Certificate</h4>
                            <p className="text-xs text-[#57655d]">
                              Farm: <strong>{farm?.farmName || cert.farmId}</strong>
                            </p>
                            {farmer && (
                              <p className="text-[11px] text-[#57655d]">
                                Farmer: <strong>{farmer.farmerName}</strong>
                              </p>
                            )}
                          </div>
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 uppercase">
                            {cert.status || "active"}
                          </span>
                        </div>

                        <div className="mt-4 space-y-1.5 text-xs text-[#57655d] border-t border-[#edf1ea] pt-3">
                          <div className="flex justify-between">
                            <span>Certified Weight:</span>
                            <span className="font-semibold text-[#10251d]">{cert.certifiedQuantityKg?.toLocaleString() || (cert as any).weightKg || 1000} kg</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Issue Date:</span>
                            <span className="font-semibold text-[#10251d]">{cert.issueDate || (cert as any).issuedAt?.split("T")[0] || "Active"}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Origin:</span>
                            <span className="font-semibold text-[#10251d]">{cert.originCountry || "Cameroon"}</span>
                          </div>
                        </div>

                        <div className="mt-4 flex items-center justify-between border-t border-[#edf1ea] pt-3">
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                            <ShieldCheck size={14} /> EUDR Verified
                          </span>
                          {farm && (
                            <button
                              type="button"
                              onClick={() => setCertificateModalFarm(farm)}
                              className="rounded-full bg-[#f7f8f3] border border-[#dfe7d8] px-3 py-1 text-xs font-bold text-[#10251d] hover:bg-[#edf7e8] cursor-pointer"
                            >
                              Inspect Dossier
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              /* Applications List */
              filteredApplications.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-[#dfe7d8] bg-white p-12 text-center">
                  <FileCheck2 className="mx-auto text-gray-300 mb-3" size={36} />
                  <h3 className="text-base font-bold text-[#10251d]">No Certificate Applications</h3>
                  <p className="mt-1 text-xs text-[#57655d] max-w-md mx-auto">
                    No certificate applications currently on record for this filter.
                  </p>
                </div>
              ) : (
                <div className="rounded-3xl border border-[#dfe7d8] bg-white p-5 shadow-sm">
                  <div className="divide-y divide-[#edf1ea]">
                    {filteredApplications.map((app) => (
                      <div key={app.applicationId} className="py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
                        <div>
                          <span className="font-mono font-bold text-[#10251d]">{app.applicationNumber}</span>
                          <div className="text-gray-500 mt-0.5">
                            Lot: <strong>{app.lotId}</strong> • Farm: <strong>{app.farmId}</strong> • Applicant: {app.applicantId}
                          </div>
                          <div className="text-[11px] text-gray-400 mt-0.5">
                            Requested: {app.requestedQuantityKg} kg • Submitted: {app.createdAt ? new Date(app.createdAt).toLocaleDateString() : "Recent"}
                          </div>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 font-bold text-[10px] uppercase self-start sm:self-auto ${
                          app.status === "approved"
                            ? "bg-emerald-100 text-emerald-800"
                            : app.status === "declined"
                            ? "bg-red-100 text-red-800"
                            : "bg-amber-100 text-amber-800"
                        }`}>
                          {app.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            )}
          </section>
        )}

        {/* ============================================================ */}
        {/* TAB 7: COMMERCIAL TRADES */}
        {/* ============================================================ */}
        {activeTab === "trades" && (
          <section className="space-y-4">
            {/* Hierarchical Filter Bar */}
            <div className="mb-6 rounded-3xl border border-[#dfe7d8] bg-white p-4 sm:p-5 shadow-xs">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[#edf7e8] text-[#2d6130]">
                    <SlidersHorizontal size={16} />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#2d6130]">Commercial Trades Filter</h3>
                    <p className="text-[11px] text-[#57655d]">
                      {tradeFarmerFilter === "ALL"
                        ? `Showing sales across all ${associations.length} associated member farmers & cooperative trades`
                        : `Filtered for ${associations.find((a) => a.farmerId === tradeFarmerFilter)?.farmerName || "selected farmer"}`}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {/* 1. Primary Filter: Farmer */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-[#10251d] whitespace-nowrap">1. Farmer:</span>
                    <select
                      value={tradeFarmerFilter}
                      onChange={(e) =>
                        handleFarmerChangeForSection(
                          e.target.value,
                          setTradeFarmerFilter,
                          tradeFarmFilter,
                          setTradeFarmFilter
                        )
                      }
                      className="rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] px-3 py-2 text-xs font-bold text-[#10251d] outline-none focus:border-[#2d6130]"
                    >
                      <option value="ALL">All Associated Farmers ({associations.length})</option>
                      {associations.map((a) => (
                        <option key={a.farmerId} value={a.farmerId}>
                          {a.farmerName} ({a.farmScope === "single_farm" ? "Single Farm" : "All Farms"})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 2. Secondary Filter: Dependent Farm */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-[#10251d] whitespace-nowrap">2. Farm Plot:</span>
                    <select
                      value={tradeFarmFilter}
                      onChange={(e) => setTradeFarmFilter(e.target.value)}
                      className="rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] px-3 py-2 text-xs font-bold text-[#10251d] outline-none focus:border-[#2d6130]"
                    >
                      <option value="ALL">
                        {tradeFarmerFilter === "ALL"
                          ? `All Member Farms (${farms.length})`
                          : `All Farms of this Farmer (${farms.filter((f) => f.farmerId === tradeFarmerFilter).length})`}
                      </option>
                      {(tradeFarmerFilter === "ALL" ? farms : farms.filter((f) => f.farmerId === tradeFarmerFilter)).map(
                        (f) => (
                          <option key={f.id} value={f.id}>
                            {f.farmName} ({f.village || f.region || "Cameroon"})
                          </option>
                        )
                      )}
                    </select>
                  </div>

                  {/* 3. Search Keyword */}
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search trade #, status..."
                      value={tradeSearchTerm}
                      onChange={(e) => setTradeSearchTerm(e.target.value)}
                      className="w-44 sm:w-52 rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] py-2 pl-8 pr-3 text-xs outline-none focus:border-[#2d6130]"
                    />
                  </div>

                  {/* Reset */}
                  {(tradeFarmerFilter !== "ALL" || tradeFarmFilter !== "ALL" || tradeSearchTerm) && (
                    <button
                      type="button"
                      onClick={() => {
                        setTradeFarmerFilter("ALL");
                        setTradeFarmFilter("ALL");
                        setTradeSearchTerm("");
                      }}
                      className="inline-flex items-center gap-1 rounded-2xl border border-[#dfe7d8] bg-white px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 cursor-pointer"
                      title="Reset Section Filters"
                    >
                      <RotateCcw size={12} />
                      Reset
                    </button>
                  )}

                  <Link
                    href="/dashboard/trades"
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#0b3528] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#144737]"
                  >
                    Open Trade Hub &rarr;
                  </Link>
                </div>
              </div>
            </div>

            {/* Permission Check for Trades */}
            {!tradePermission.permitted ? (
              <div className="rounded-3xl border border-amber-300 bg-amber-50/80 p-8 text-center my-6 shadow-xs">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-800">
                  <Lock size={22} />
                </div>
                <h3 className="text-base font-bold text-[#10251d]">Commercial Trading Access Restricted</h3>
                <p className="mt-1.5 text-xs text-[#57655d] max-w-lg mx-auto leading-relaxed">
                  {tradePermission.reason || "The selected member farmer has not granted commercial trading permission to the cooperative."}
                </p>
                <div className="mt-5 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setTradeFarmerFilter("ALL")}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#0b3528] px-5 py-2 text-xs font-bold text-white hover:bg-[#144737] cursor-pointer"
                  >
                    <Users size={14} /> Show All Permitted Farmers
                  </button>
                </div>
              </div>
            ) : filteredTrades.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-[#dfe7d8] bg-white p-12 text-center">
                <Handshake className="mx-auto text-gray-300 mb-3" size={36} />
                <h3 className="text-base font-bold text-[#10251d]">No Commercial Trade Records Found</h3>
                <p className="mt-1 text-xs text-[#57655d] max-w-md mx-auto">
                  No completed sales or purchase contracts match the current filter.
                </p>
                <Link
                  href="/dashboard/trades"
                  className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#0b3528] px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#144737]"
                >
                  Create Contract in Trade Hub &rarr;
                </Link>
              </div>
            ) : (
              <div className="rounded-3xl border border-[#dfe7d8] bg-white p-5 shadow-sm">
                <div className="divide-y divide-[#edf1ea]">
                  {filteredTrades.map((t) => (
                    <div key={t.tradeId} className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-[#10251d]">{t.tradeNumber}</span>
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 uppercase">
                            {t.tradeStatus}
                          </span>
                        </div>
                        <div className="text-gray-500 mt-1">
                          Lot ID: <strong>{t.lotId}</strong> • Buyer: <strong>{t.buyerId}</strong> • Seller: {t.sellerId}
                        </div>
                        <div className="text-[11px] text-gray-400 mt-0.5">
                          Date: {t.tradeDate ? new Date(t.tradeDate).toLocaleDateString() : "Recent"} • Channel: {t.paymentChannel}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-base font-bold text-[#2d6130]">
                          {t.totalAmount?.toLocaleString()} {t.currency}
                        </div>
                        <div className="text-[11px] text-[#57655d]">
                          {t.quantityKg?.toLocaleString()} kg @ {t.negotiatedPricePerKg} {t.currency}/kg
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
      </main>



      {/* Modal: Register Farm Plot on Behalf of Farmer */}
      {showRegisterFarmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="relative my-8 w-full max-w-lg rounded-[32px] border border-[#dfe7d8] bg-white p-6 shadow-2xl sm:p-8">
            <button
              type="button"
              onClick={() => setShowRegisterFarmModal(false)}
              className="absolute right-5 top-5 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 cursor-pointer"
            >
              <X size={20} />
            </button>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#2d6130]">
              <Building2 size={14} /> Cooperative Operated
            </div>
            <h2 className="mt-1 text-2xl font-bold text-[#10251d]">Register Farm Plot on Behalf of Farmer</h2>
            <p className="mt-1 text-xs text-[#57655d]">
              Select the associated member farmer for whom you are registering this cocoa plot under {coopOrgName}.
            </p>

            <form onSubmit={handleRegisterFarm} className="mt-5 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-[#10251d] mb-1">Select Associated Farmer *</label>
                <select
                  required
                  value={farmFarmerIdInput}
                  onChange={(e) => setFarmFarmerIdInput(e.target.value)}
                  className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                >
                  <option value="">-- Choose Member Farmer --</option>
                  {associations.map((a) => (
                    <option key={a.farmerId} value={a.farmerId}>
                      {a.farmerName} ({a.farmScope === "single_farm" ? "Single Farm Delegation" : "All Farms"})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-[#10251d] mb-1">Farm / Plot Name *</label>
                <input
                  type="text"
                  required
                  value={farmNameInput}
                  onChange={(e) => setFarmNameInput(e.target.value)}
                  placeholder="e.g. Mbenge Family Cocoa Plot"
                  className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">Village / Locality</label>
                  <input
                    type="text"
                    value={farmVillageInput}
                    onChange={(e) => setFarmVillageInput(e.target.value)}
                    placeholder="e.g. Ossing"
                    className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">Size (Hectares) *</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.5"
                    required
                    value={farmSizeInput}
                    onChange={(e) => setFarmSizeInput(e.target.value ? Number(e.target.value) : "")}
                    className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                  />
                </div>
              </div>

              <div className="mt-5 flex items-center justify-end gap-3 pt-3 border-t border-[#edf1ea]">
                <button
                  type="button"
                  onClick={() => setShowRegisterFarmModal(false)}
                  className="rounded-full px-5 py-2 font-bold text-gray-500 hover:bg-gray-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={farmSubmitting}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#0b3528] px-6 py-2.5 font-bold text-white shadow-sm hover:bg-[#144737] disabled:opacity-50 cursor-pointer"
                >
                  {farmSubmitting ? "Registering..." : "Register Plot"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Log Seasonal Production Plan */}
      {showProdRecordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="relative my-8 w-full max-w-lg rounded-[32px] border border-[#dfe7d8] bg-white p-6 shadow-2xl sm:p-8">
            <button
              type="button"
              onClick={() => setShowProdRecordModal(false)}
              className="absolute right-5 top-5 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 cursor-pointer"
            >
              <X size={20} />
            </button>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#2d6130]">
              <Building2 size={14} /> Cooperative Operated
            </div>
            <h2 className="mt-1 text-2xl font-bold text-[#10251d]">Log Seasonal Production Plan</h2>
            <p className="mt-1 text-xs text-[#57655d]">
              Establish seasonal targets and cycle records on behalf of an associated member farmer under {coopOrgName}.
            </p>

            <form onSubmit={handleCreateProductionRecord} className="mt-5 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-[#10251d] mb-1">Select Associated Farmer *</label>
                <select
                  required
                  value={prodRecordFarmerIdInput}
                  onChange={(e) => {
                    setProdRecordFarmerIdInput(e.target.value);
                    const farmerFarms = getFarmsForFarmerModal(e.target.value);
                    setProdRecordFarmIdInput(farmerFarms[0]?.id || "");
                  }}
                  className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                >
                  <option value="">-- Choose Member Farmer --</option>
                  {associations.map((a) => (
                    <option key={a.farmerId} value={a.farmerId}>
                      {a.farmerName} ({a.farmScope === "single_farm" ? "Single Farm" : "All Farms"})
                    </option>
                  ))}
                </select>
              </div>

              {prodRecordFarmerIdInput && (
                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">Select Member Farm Plot *</label>
                  <select
                    required
                    value={prodRecordFarmIdInput}
                    onChange={(e) => setProdRecordFarmIdInput(e.target.value)}
                    className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                  >
                    {getFarmsForFarmerModal(prodRecordFarmerIdInput).length === 0 ? (
                      <option value="">Delegated Farm (Default)</option>
                    ) : (
                      getFarmsForFarmerModal(prodRecordFarmerIdInput).map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.farmName} ({f.id})
                        </option>
                      ))
                    )}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">Season Year *</label>
                  <input
                    type="number"
                    required
                    value={prodRecordSeasonYearInput}
                    onChange={(e) => setProdRecordSeasonYearInput(e.target.value)}
                    className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">Expected Cycles *</label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    required
                    value={prodRecordExpectedHarvestsInput}
                    onChange={(e) => setProdRecordExpectedHarvestsInput(e.target.value ? Number(e.target.value) : "")}
                    className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-[#10251d] mb-1">Production Period Name *</label>
                <input
                  type="text"
                  required
                  value={prodRecordPeriodInput}
                  onChange={(e) => setProdRecordPeriodInput(e.target.value)}
                  placeholder="e.g. Main Crop Season 2026"
                  className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#10251d] mb-1">Estimated Yield (kg) *</label>
                <input
                  type="number"
                  min={50}
                  required
                  value={prodRecordEstQtyInput}
                  onChange={(e) => setProdRecordEstQtyInput(e.target.value ? Number(e.target.value) : "")}
                  className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#10251d] mb-1">Operational Notes</label>
                <textarea
                  rows={2}
                  value={prodRecordNotesInput}
                  onChange={(e) => setProdRecordNotesInput(e.target.value)}
                  placeholder="Notes on agronomic inputs, weather conditions, or cooperative stewardship..."
                  className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                />
              </div>

              <div className="mt-5 flex items-center justify-end gap-3 pt-3 border-t border-[#edf1ea]">
                <button
                  type="button"
                  onClick={() => setShowProdRecordModal(false)}
                  className="rounded-full px-5 py-2 font-bold text-gray-500 hover:bg-gray-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={prodRecordSubmitting}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#0b3528] px-6 py-2.5 font-bold text-white shadow-sm hover:bg-[#144737] disabled:opacity-50 cursor-pointer"
                >
                  {prodRecordSubmitting ? "Saving..." : "Save Production Plan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Record Harvest Batch */}
      {showProductionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="relative my-8 w-full max-w-lg rounded-[32px] border border-[#dfe7d8] bg-white p-6 shadow-2xl sm:p-8">
            <button
              type="button"
              onClick={() => setShowProductionModal(false)}
              className="absolute right-5 top-5 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 cursor-pointer"
            >
              <X size={20} />
            </button>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#2d6130]">
              <Building2 size={14} /> Cooperative Operated
            </div>
            <h2 className="mt-1 text-2xl font-bold text-[#10251d]">Record Harvest Batch for Farmer</h2>
            <p className="mt-1 text-xs text-[#57655d]">Record harvest intake volume for an associated farmer under {coopOrgName}.</p>

            <form onSubmit={handleRecordProduction} className="mt-5 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-[#10251d] mb-1">Select Associated Farmer *</label>
                <select
                  required
                  value={prodFarmerIdInput}
                  onChange={(e) => {
                    setProdFarmerIdInput(e.target.value);
                    const farmerFarms = getFarmsForFarmerModal(e.target.value);
                    setProdFarmIdInput(farmerFarms[0]?.id || "");
                  }}
                  className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                >
                  <option value="">-- Choose Member Farmer --</option>
                  {associations.map((a) => (
                    <option key={a.farmerId} value={a.farmerId}>
                      {a.farmerName} ({a.farmScope === "single_farm" ? "Single Farm" : "All Farms"})
                    </option>
                  ))}
                </select>
              </div>

              {prodFarmerIdInput && (
                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">Select Delegated Farm *</label>
                  <select
                    required
                    value={prodFarmIdInput}
                    onChange={(e) => setProdFarmIdInput(e.target.value)}
                    className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                  >
                    {getFarmsForFarmerModal(prodFarmerIdInput).length === 0 ? (
                      <option value="">Delegated Farm (Default)</option>
                    ) : (
                      getFarmsForFarmerModal(prodFarmerIdInput).map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.farmName} ({f.id})
                        </option>
                      ))
                    )}
                  </select>
                </div>
              )}

              <div>
                <label className="block font-semibold text-[#10251d] mb-1">Batch Code Reference *</label>
                <input
                  type="text"
                  required
                  value={prodBatchInput}
                  onChange={(e) => setProdBatchInput(e.target.value)}
                  placeholder="e.g. BATCH-COOP-2026-01"
                  className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#10251d] mb-1">Harvest Quantity (kg) *</label>
                <input
                  type="number"
                  min={10}
                  required
                  value={prodQtyInput}
                  onChange={(e) => setProdQtyInput(e.target.value ? Number(e.target.value) : "")}
                  className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                />
              </div>

              <div className="mt-5 flex items-center justify-end gap-3 pt-3 border-t border-[#edf1ea]">
                <button
                  type="button"
                  onClick={() => setShowProductionModal(false)}
                  className="rounded-full px-5 py-2 font-bold text-gray-500 hover:bg-gray-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={prodSubmitting}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#0b3528] px-6 py-2.5 font-bold text-white shadow-sm hover:bg-[#144737] disabled:opacity-50 cursor-pointer"
                >
                  {prodSubmitting ? "Recording..." : "Record Harvest"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create Cocoa Lot */}
      {showLotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="relative my-8 w-full max-w-lg rounded-[32px] border border-[#dfe7d8] bg-white p-6 shadow-2xl sm:p-8">
            <button
              type="button"
              onClick={() => setShowLotModal(false)}
              className="absolute right-5 top-5 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 cursor-pointer"
            >
              <X size={20} />
            </button>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#2d6130]">
              <Building2 size={14} /> Cooperative Operated
            </div>
            <h2 className="mt-1 text-2xl font-bold text-[#10251d]">Create Traceable Cocoa Lot</h2>
            <p className="mt-1 text-xs text-[#57655d]">Aggregate harvest into a certified traceable cocoa lot for an associated farmer.</p>

            <form onSubmit={handleCreateLot} className="mt-5 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-[#10251d] mb-1">Select Associated Farmer *</label>
                <select
                  required
                  value={lotFarmerIdInput}
                  onChange={(e) => {
                    setLotFarmerIdInput(e.target.value);
                    const farmerFarms = getFarmsForFarmerModal(e.target.value);
                    setLotFarmIdInput(farmerFarms[0]?.id || "");
                  }}
                  className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                >
                  <option value="">-- Choose Member Farmer --</option>
                  {associations.map((a) => (
                    <option key={a.farmerId} value={a.farmerId}>
                      {a.farmerName} ({a.farmScope === "single_farm" ? "Single Farm" : "All Farms"})
                    </option>
                  ))}
                </select>
              </div>

              {lotFarmerIdInput && (
                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">Select Delegated Farm *</label>
                  <select
                    required
                    value={lotFarmIdInput}
                    onChange={(e) => setLotFarmIdInput(e.target.value)}
                    className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                  >
                    {getFarmsForFarmerModal(lotFarmerIdInput).length === 0 ? (
                      <option value="">Delegated Farm (Default)</option>
                    ) : (
                      getFarmsForFarmerModal(lotFarmerIdInput).map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.farmName} ({f.id})
                        </option>
                      ))
                    )}
                  </select>
                </div>
              )}

              <div>
                <label className="block font-semibold text-[#10251d] mb-1">Lot Quantity (kg) *</label>
                <input
                  type="number"
                  min={50}
                  required
                  value={lotQtyInput}
                  onChange={(e) => setLotQtyInput(e.target.value ? Number(e.target.value) : "")}
                  className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                />
              </div>

              <div className="mt-5 flex items-center justify-end gap-3 pt-3 border-t border-[#edf1ea]">
                <button
                  type="button"
                  onClick={() => setShowLotModal(false)}
                  className="rounded-full px-5 py-2 font-bold text-gray-500 hover:bg-gray-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={lotSubmitting}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#0b3528] px-6 py-2.5 font-bold text-white shadow-sm hover:bg-[#144737] disabled:opacity-50 cursor-pointer"
                >
                  {lotSubmitting ? "Creating..." : "Create Cocoa Lot"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Apply Certificate */}
      {showCertModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="relative my-8 w-full max-w-lg rounded-[32px] border border-[#dfe7d8] bg-white p-6 shadow-2xl sm:p-8">
            <button
              type="button"
              onClick={() => setShowCertModal(false)}
              className="absolute right-5 top-5 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 cursor-pointer"
            >
              <X size={20} />
            </button>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#2d6130]">
              <Building2 size={14} /> Cooperative Operated
            </div>
            <h2 className="mt-1 text-2xl font-bold text-[#10251d]">Apply for Origin Trace Certificate</h2>
            <p className="mt-1 text-xs text-[#57655d]">Issue origin trace and EUDR compliance certification on behalf of an associated farmer.</p>

            <form onSubmit={handleApplyCertificate} className="mt-5 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-[#10251d] mb-1">Select Associated Farmer *</label>
                <select
                  required
                  value={certFarmerIdInput}
                  onChange={(e) => {
                    setCertFarmerIdInput(e.target.value);
                    const farmerFarms = getFarmsForFarmerModal(e.target.value);
                    setCertFarmIdInput(farmerFarms[0]?.id || "");
                  }}
                  className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                >
                  <option value="">-- Choose Member Farmer --</option>
                  {associations.map((a) => (
                    <option key={a.farmerId} value={a.farmerId}>
                      {a.farmerName} ({a.farmScope === "single_farm" ? "Single Farm" : "All Farms"})
                    </option>
                  ))}
                </select>
              </div>

              {certFarmerIdInput && (
                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">Select Delegated Farm *</label>
                  <select
                    required
                    value={certFarmIdInput}
                    onChange={(e) => setCertFarmIdInput(e.target.value)}
                    className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                  >
                    {getFarmsForFarmerModal(certFarmerIdInput).length === 0 ? (
                      <option value="">Delegated Farm (Default)</option>
                    ) : (
                      getFarmsForFarmerModal(certFarmerIdInput).map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.farmName} ({f.id})
                        </option>
                      ))
                    )}
                  </select>
                </div>
              )}

              <div className="rounded-2xl bg-[#edf7e8] border border-[#cdebc2] p-3 text-[#1d6a45]">
                ✓ Compliance declaration verified under cooperative oversight ({coopOrgName}).
              </div>

              <div className="mt-5 flex items-center justify-end gap-3 pt-3 border-t border-[#edf1ea]">
                <button
                  type="button"
                  onClick={() => setShowCertModal(false)}
                  className="rounded-full px-5 py-2 font-bold text-gray-500 hover:bg-gray-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={certSubmitting}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#0b3528] px-6 py-2.5 font-bold text-white shadow-sm hover:bg-[#144737] disabled:opacity-50 cursor-pointer"
                >
                  {certSubmitting ? "Submitting..." : "Submit Application"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Full Farm Dossier Modal */}
      {selectedFarm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[32px] border border-[#dfe7d8] bg-white p-6 shadow-2xl sm:p-8">
            <div className="flex items-start justify-between border-b border-[#edf1ea] pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-[#edf7e8] px-2.5 py-0.5 text-[0.65rem] font-bold text-[#2d6130]">
                    COOPERATIVE OPERATED DOSSIER
                  </span>
                  <span className="font-mono text-xs text-gray-500">{selectedFarm.id}</span>
                </div>
                <h2 className="mt-2 text-2xl font-bold text-[#10251d]">{selectedFarm.farmName}</h2>
                <p className="text-xs text-[#57655d]">Farmer: {selectedFarm.farmerName} • {selectedFarm.village}, {selectedFarm.region}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedFarm(null)}
                className="cursor-pointer rounded-full p-2 text-gray-400 hover:bg-gray-100"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mt-6 space-y-4 text-xs">
              <div className="rounded-2xl border border-[#edf1ea] bg-[#fafcf9] p-4">
                <h4 className="mb-2 font-bold uppercase text-xs text-[#10251d]">Cooperative &amp; Farmer Management</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[10px] text-gray-400 block">Associated Farmer</span>
                    <strong className="text-sm font-bold text-[#10251d]">{selectedFarm.farmerName}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 block">Cooperative Operator</span>
                    <strong className="text-sm font-bold text-[#2d6130]">{coopOrgName}</strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedFarm(null)}
                className="cursor-pointer rounded-full bg-[#0b3528] px-6 py-2.5 text-xs font-bold text-white hover:bg-[#144737]"
              >
                Close Dossier
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Official Certificate Modal */}
      <FarmCertificateModal
        farm={certificateModalFarm}
        isOpen={Boolean(certificateModalFarm)}
        onClose={() => setCertificateModalFarm(null)}
      />
    </div>
  );
}

function MetricCard({
  label,
  value,
  unit,
  description,
  icon,
}: {
  label: string;
  value: string | number;
  unit?: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-[#dfe7d8] bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className="flex items-center justify-between text-[#57655d]">
        <span className="text-xs font-semibold">{label}</span>
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#edf7e8] text-[#2d6130]">
          {icon}
        </div>
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="text-2xl font-black text-[#10251d]">{value}</span>
        {unit && <span className="text-xs text-[#57655d]">{unit}</span>}
      </div>
      <p className="mt-1 text-[0.7rem] text-[#6f7e73]">{description}</p>
    </div>
  );
}
