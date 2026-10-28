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
  BarChart3,
  ExternalLink,
  Trees,
  Truck,
  Check,
  Filter,
  Info,
} from "lucide-react";
import {
  FarmerCooperativeAssociation,
} from "@/types/cooperative";
import { TradeRecord, CertificateHolding } from "@/types/traceability";
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
    "farms" | "farmers" | "production" | "lots" | "certificates" | "trades"
  >("farms");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Cooperative Identity
  const coopOrgId = useMemo(() => {
    return (
      cooperativeProfile?.cooperativeOrgId ||
      userProfile?.cooperativeOrgId ||
      (user ? `org_coop_${user.uid.slice(0, 8)}` : "org_coop_mamfe_central")
    );
  }, [cooperativeProfile, userProfile, user]);

  const coopOrgName = useMemo(() => {
    return (
      cooperativeProfile?.cooperativeOrgName ||
      userProfile?.cooperativeOrgName ||
      (user?.displayName ? `${user.displayName} Cooperative Society` : "Mamfe Central Farmers Multi-Purpose Cooperative Society")
    );
  }, [cooperativeProfile, userProfile, user]);

  // Cooperative Associations & Farmers
  const [associations, setAssociations] = useState<FarmerCooperativeAssociation[]>([]);
  const [selectedFarmerIdFilter, setSelectedFarmerIdFilter] = useState<string>("ALL");

  // Farms / Plots State (Scoped to associations & permissions)
  const [farms, setFarms] = useState<FarmRecord[]>([]);
  const [selectedFarm, setSelectedFarm] = useState<FarmRecord | null>(null);
  const [certificateModalFarm, setCertificateModalFarm] = useState<FarmRecord | null>(null);
  const [highlightedPlotId, setHighlightedPlotId] = useState<string | null>(null);
  const [plotSearchTerm, setPlotSearchTerm] = useState("");



  // Modal: Register Farm Plot (delegated)
  const [showRegisterFarmModal, setShowRegisterFarmModal] = useState(false);
  const [farmNameInput, setFarmNameInput] = useState("");
  const [farmFarmerIdInput, setFarmFarmerIdInput] = useState("");
  const [farmRegionInput, setFarmRegionInput] = useState("South-West Region");
  const [farmVillageInput, setFarmVillageInput] = useState("");
  const [farmSizeInput, setFarmSizeInput] = useState<number | "">(2.5);
  const [farmSubmitting, setFarmSubmitting] = useState(false);

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

  // Trades & Holdings State
  const [trades, setTrades] = useState<TradeRecord[]>([]);

  // Load Cooperative Associations & Delegated Farms
  const loadCooperativeData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch real associations from Firestore API
      const res = await fetch(`/api/cooperative/associations?cooperativeOrgId=${coopOrgId}`);
      const json = await res.json();
      let assocs: FarmerCooperativeAssociation[] = [];
      if (json.success && Array.isArray(json.associations)) {
        assocs = json.associations;
      }

      setAssociations(assocs);

      // 2. Fetch Farms for all active associations with management permissions
      const loadedFarms: FarmRecord[] = [];
      for (const a of assocs) {
        if (a.status !== "active") continue;
        // Check permission to manage everything or farmsManagement
        if (!a.manageEverything && !a.permissions?.farmsManagement) continue;

        try {
          const q = query(collection(db, "farms"), where("farmerId", "==", a.farmerId));
          const snap = await getDocs(q);
          const farmerFarms = snap.docs.map((d) => ({ ...d.data(), id: d.id } as FarmRecord));

          // If delegated to a single farm only, filter strictly by delegatedFarmIds
          if (a.farmScope === "single_farm" && Array.isArray(a.delegatedFarmIds) && a.delegatedFarmIds.length > 0) {
            const singleFarms = farmerFarms.filter((f) => a.delegatedFarmIds!.includes(f.id));
            if (singleFarms.length > 0) {
              loadedFarms.push(...singleFarms);
            } else if (a.delegatedFarmNames && a.delegatedFarmNames[0]) {
              // Synthetic placeholder farm for the delegated single farm if not in Firestore yet
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

      setFarms(loadedFarms);

      // 3. Fetch Trades
      const tradesRes = await fetch("/api/marketplace/trades");
      const tradesJson = await tradesRes.json().catch(() => ({}));
      if (tradesJson.success && Array.isArray(tradesJson.trades)) {
        setTrades(tradesJson.trades);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [coopOrgId, coopOrgName]);

  useEffect(() => {
    loadCooperativeData();
  }, [loadCooperativeData]);

  // Selected association based on filter
  const activeAssociation = useMemo(() => {
    if (selectedFarmerIdFilter === "ALL") return null;
    return associations.find((a) => a.farmerId === selectedFarmerIdFilter) || null;
  }, [associations, selectedFarmerIdFilter]);

  // Filtered Farms based on selected Farmer Filter
  const filteredFarms = useMemo(() => {
    let result = farms;
    if (selectedFarmerIdFilter !== "ALL") {
      result = result.filter((f: any) => f.farmerId === selectedFarmerIdFilter);
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
  }, [farms, selectedFarmerIdFilter, plotSearchTerm]);

  // Metrics
  const totalAssociatedFarmers = associations.length;
  const hasActiveAssociations = totalAssociatedFarmers > 0;
  const totalPlots = filteredFarms.length;
  const totalHectares = filteredFarms
    .reduce((acc: number, f: any) => acc + (f.geofenceAreaHa ?? f.sizeHectares ?? 0), 0)
    .toFixed(1);
  const totalHarvestKg = filteredFarms.reduce((acc: number, f: any) => acc + (f.quantityHarvestedKg || 0), 0);
  const compliantCount = filteredFarms.filter((f: any) => f.eudrCompliant).length;

  // Map plots
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
                    Farmer Association &amp; Farm Delegation Required
                  </h2>
                  <span className="rounded-full bg-amber-200 px-2.5 py-0.5 text-[10px] font-black uppercase text-amber-900">
                    Action Locked
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-amber-900">
                  You are currently logged in as a cooperative, but no farmers have associated with your cooperative or granted farm management permissions yet.
                  Cooperatives cannot register plots, record harvests, manage cocoa lots, apply for certificates, or trade cocoa until an associated farmer delegates permission to manage either a <strong>single farm</strong> or <strong>all their farms</strong>.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveTab('farmers')}
                    className="inline-flex items-center gap-2 rounded-full bg-[#0b3528] px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#144737] cursor-pointer"
                  >
                    <Plus size={15} />
                    Link Member Farmer &amp; Grant Delegation
                  </button>
                  <span className="text-xs text-amber-800">
                    (Configure &quot;Single Farm&quot; or &quot;All Farms&quot; with &quot;Manage Everything&quot; permission)
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

        {/* Associated Member Farmer Filter Bar */}
        <section className="mb-8 rounded-3xl border border-[#dfe7d8] bg-white p-4 sm:p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              <span className="text-xs font-bold uppercase tracking-wider text-[#2d6130] flex items-center gap-1.5">
                <Filter size={15} /> Associated Farmer Filter:
              </span>
              <span className="text-xs text-[#57655d]">
                {hasActiveAssociations
                  ? "Select a member farmer to isolate their delegated farm(s) and operations"
                  : "No farmers associated yet"}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <select
                disabled={!hasActiveAssociations}
                value={selectedFarmerIdFilter}
                onChange={(e) => setSelectedFarmerIdFilter(e.target.value)}
                className="rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] px-4 py-2 text-xs font-bold text-[#10251d] outline-none focus:border-[#2d6130] disabled:opacity-50"
              >
                <option value="ALL">All Associated Farmers ({totalAssociatedFarmers})</option>
                {associations.map((a) => (
                  <option key={a.farmerId} value={a.farmerId}>
                    {a.farmerName} ({a.farmScope === "single_farm" ? "Single Farm" : "All Farms"})
                  </option>
                ))}
              </select>

              {activeAssociation && (
                <span className="rounded-full bg-[#edf7e8] border border-[#cdebc2] px-3 py-1 text-[11px] font-bold text-[#2d6130]">
                  {activeAssociation.farmScope === "single_farm"
                    ? `Delegation: Single Farm (${activeAssociation.delegatedFarmNames?.[0] || activeAssociation.delegatedFarmIds?.[0] || "1 Farm"})`
                    : "Delegation: All Farms (Full Management)"}
                </span>
              )}
            </div>
          </div>
        </section>

        {/* Metric Cards (Matching Farmer Dashboard) */}
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
                Showing polygons for {selectedFarmerIdFilter === "ALL" ? "all associated member farmers" : activeAssociation?.farmerName || "selected farmer"}.
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

        {/* Subsection Tabs */}
        <div className="mb-6 flex border-b border-[#dfe7d8] gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab("farms")}
            className={`flex items-center gap-2 border-b-2 px-6 py-3.5 text-sm font-bold transition cursor-pointer whitespace-nowrap ${
              activeTab === "farms" ? "border-[#2d6130] text-[#0b3528]" : "border-transparent text-[#57655d] hover:text-[#10251d]"
            }`}
          >
            <MapPin size={16} /> Cooperative Farm Plots ({filteredFarms.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("farmers")}
            className={`flex items-center gap-2 border-b-2 px-6 py-3.5 text-sm font-bold transition cursor-pointer whitespace-nowrap ${
              activeTab === "farmers" ? "border-[#2d6130] text-[#0b3528]" : "border-transparent text-[#57655d] hover:text-[#10251d]"
            }`}
          >
            <Users size={16} /> Member Farmer Roster ({associations.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("production")}
            className={`flex items-center gap-2 border-b-2 px-6 py-3.5 text-sm font-bold transition cursor-pointer whitespace-nowrap ${
              activeTab === "production" ? "border-[#2d6130] text-[#0b3528]" : "border-transparent text-[#57655d] hover:text-[#10251d]"
            }`}
          >
            <Layers size={16} /> Production &amp; Harvests
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("lots")}
            className={`flex items-center gap-2 border-b-2 px-6 py-3.5 text-sm font-bold transition cursor-pointer whitespace-nowrap ${
              activeTab === "lots" ? "border-[#2d6130] text-[#0b3528]" : "border-transparent text-[#57655d] hover:text-[#10251d]"
            }`}
          >
            <FileText size={16} /> Cocoa Lots
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("certificates")}
            className={`flex items-center gap-2 border-b-2 px-6 py-3.5 text-sm font-bold transition cursor-pointer whitespace-nowrap ${
              activeTab === "certificates" ? "border-[#2d6130] text-[#0b3528]" : "border-transparent text-[#57655d] hover:text-[#10251d]"
            }`}
          >
            <ShieldCheck size={16} /> Certificates &amp; Holdings
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("trades")}
            className={`flex items-center gap-2 border-b-2 px-6 py-3.5 text-sm font-bold transition cursor-pointer whitespace-nowrap ${
              activeTab === "trades" ? "border-[#2d6130] text-[#0b3528]" : "border-transparent text-[#57655d] hover:text-[#10251d]"
            }`}
          >
            <Handshake size={16} /> Commercial Trades ({trades.length})
          </button>
        </div>

        {/* Tab 1: Cooperative Farm Plots */}
        {activeTab === "farms" && (
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="relative w-full sm:w-72">
                <Search size={16} className="absolute left-3.5 top-3 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search plot by name, village, farmer..."
                  value={plotSearchTerm}
                  onChange={(e) => setPlotSearchTerm(e.target.value)}
                  className="w-full rounded-2xl border border-[#dfe7d8] bg-white py-2 pl-10 pr-4 text-xs font-medium outline-none focus:border-[#2d6130]"
                />
              </div>

              <span className="text-xs text-[#57655d]">
                Showing {filteredFarms.length} plot{filteredFarms.length === 1 ? "" : "s"} under cooperative delegation
              </span>
            </div>

            {filteredFarms.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-[#dfe7d8] bg-white p-12 text-center">
                <MapPin className="mx-auto text-gray-300 mb-3" size={36} />
                <h3 className="text-base font-bold text-[#10251d]">No Farm Plots Found</h3>
                <p className="mt-1 text-xs text-[#57655d] max-w-md mx-auto">
                  {!hasActiveAssociations
                    ? "Associate a member farmer first to gain delegation rights and manage farm plots."
                    : "No farm plots match the current filter. Click \"Register Plot\" to register a plot on behalf of an associated farmer."}
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

        {/* Tab 2: Associated Farmer Roster */}
        {activeTab === "farmers" && (
          <section className="rounded-3xl border border-[#dfe7d8] bg-white p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#edf1ea] pb-5">
              <div>
                <h3 className="text-lg font-bold text-[#10251d]">Associated Member Farmers &amp; Delegation Roster</h3>
                <p className="text-xs text-[#57655d]">
                  Farmers associated with {coopOrgName} with explicit permission for either a single farm or all farms.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('farmers')}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#0b3528] px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#144737] cursor-pointer"
              >
                <Plus size={15} /> + Link Member Farmer
              </button>
            </div>

            {associations.length === 0 ? (
              <div className="py-12 text-center">
                <Users className="mx-auto text-gray-300 mb-3" size={40} />
                <h4 className="text-base font-bold text-[#10251d]">No Associated Farmers</h4>
                <p className="mt-1 text-xs text-[#57655d] max-w-md mx-auto">
                  Your cooperative currently has no member farmers associated. Link a farmer to delegate farm management permissions.
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
                            setSelectedFarmerIdFilter(assoc.farmerId);
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

        {/* Tab 3: Production & Harvests */}
        {activeTab === "production" && (
          <section className="rounded-3xl border border-[#dfe7d8] bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between border-b border-[#edf1ea] pb-4">
              <div>
                <h3 className="text-lg font-bold text-[#10251d]">Production &amp; Harvest Management</h3>
                <p className="text-xs text-[#57655d]">Record and inspect harvest intake from delegated member farms.</p>
              </div>
              <button
                type="button"
                disabled={!hasActiveAssociations}
                onClick={() => {
                  if (!hasActiveAssociations) return;
                  setProdFarmerIdInput(associations[0]?.farmerId || "");
                  setShowProductionModal(true);
                }}
                className="rounded-full bg-[#0b3528] px-4 py-2 text-xs font-bold text-white hover:bg-[#144737] disabled:opacity-50 cursor-pointer"
              >
                + Record Harvest
              </button>
            </div>

            <div className="mt-6">
              {filteredFarms.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-8">No harvest records available for the selected filter.</p>
              ) : (
                <div className="divide-y divide-[#edf1ea]">
                  {filteredFarms.map((farm) => (
                    <div key={farm.id} className="py-3.5 flex items-center justify-between">
                      <div>
                        <strong className="text-xs font-bold text-[#10251d]">{farm.farmName}</strong>
                        <div className="text-[11px] text-gray-500">
                          Farmer: {farm.farmerName} • Batch: {farm.batchNumber || "BATCH-COOP-AUTO"}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-bold text-[#2d6130]">{farm.quantityHarvestedKg || 0} kg</span>
                        <div className="text-[10px] text-gray-400">Recorded Intake</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Tab 4: Cocoa Lots */}
        {activeTab === "lots" && (
          <section className="rounded-3xl border border-[#dfe7d8] bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between border-b border-[#edf1ea] pb-4">
              <div>
                <h3 className="text-lg font-bold text-[#10251d]">Traceable Cocoa Lots</h3>
                <p className="text-xs text-[#57655d]">Aggregated cocoa lots managed on behalf of associated farmers.</p>
              </div>
              <button
                type="button"
                disabled={!hasActiveAssociations}
                onClick={() => {
                  if (!hasActiveAssociations) return;
                  setLotFarmerIdInput(associations[0]?.farmerId || "");
                  setShowLotModal(true);
                }}
                className="rounded-full bg-[#0b3528] px-4 py-2 text-xs font-bold text-white hover:bg-[#144737] disabled:opacity-50 cursor-pointer"
              >
                + Create Lot
              </button>
            </div>
            <div className="mt-6 text-center py-8 text-xs text-gray-500">
              Click &quot;+ Create Lot&quot; above to allocate verified cocoa inventory into commercial lots.
            </div>
          </section>
        )}

        {/* Tab 5: Certificates & Holdings */}
        {activeTab === "certificates" && (
          <section className="rounded-3xl border border-[#dfe7d8] bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between border-b border-[#edf1ea] pb-4">
              <div>
                <h3 className="text-lg font-bold text-[#10251d]">EUDR Origin Trace Certificates</h3>
                <p className="text-xs text-[#57655d]">Official Cameroon certificates issued for delegated member farms.</p>
              </div>
              <button
                type="button"
                disabled={!hasActiveAssociations}
                onClick={() => {
                  if (!hasActiveAssociations) return;
                  setCertFarmerIdInput(associations[0]?.farmerId || "");
                  setShowCertModal(true);
                }}
                className="rounded-full bg-[#0b3528] px-4 py-2 text-xs font-bold text-white hover:bg-[#144737] disabled:opacity-50 cursor-pointer"
              >
                + Apply Certificate
              </button>
            </div>
            <div className="mt-6 text-center py-8 text-xs text-gray-500">
              Certificates applied under cooperative oversight ensure EUDR deforestation-free verification for export.
            </div>
          </section>
        )}

        {/* Tab 6: Commercial Trades */}
        {activeTab === "trades" && (
          <section className="rounded-3xl border border-[#dfe7d8] bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between border-b border-[#edf1ea] pb-4">
              <div>
                <h3 className="text-lg font-bold text-[#10251d]">Commercial Sales &amp; Counterparty Trades</h3>
                <p className="text-xs text-[#57655d]">Marketplace and off-platform sales conducted by {coopOrgName}.</p>
              </div>
              <Link
                href="/dashboard/trades"
                className="rounded-full border border-[#dfe7d8] bg-[#f7f8f3] px-4 py-2 text-xs font-bold text-[#10251d] hover:bg-[#edf7e8]"
              >
                Open Trade Hub →
              </Link>
            </div>
            <div className="mt-6">
              {trades.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-8">No commercial trade records found.</p>
              ) : (
                <div className="divide-y divide-[#edf1ea]">
                  {trades.map((t) => (
                    <div key={t.tradeId} className="py-3 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-mono font-bold text-[#10251d]">{t.tradeNumber}</span>
                        <div className="text-gray-500 mt-0.5">
                          Lot: {t.lotId} • Qty: {t.quantityKg} kg • Total: {t.totalAmount} {t.currency}
                        </div>
                      </div>
                      <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-bold text-emerald-800 uppercase text-[10px]">
                        {t.tradeStatus}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
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
