/* eslint-disable react-hooks/set-state-in-effect, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
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
} from "lucide-react";
import {
  FarmerCooperativeAssociation,
  CooperativeOrganization,
} from "@/types/cooperative";
import { TradeRecord, CertificateHolding } from "@/types/traceability";

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
  const { user } = useFirebase();

  // Active Tab State
  const [activeTab, setActiveTab] = useState<
    "farmers" | "farms" | "production" | "lots" | "certificates" | "trades"
  >("farmers");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Cooperative Associations & Farmers
  const [coopOrgId] = useState("org_coop_mamfe_central");
  const [coopOrgName] = useState(
    "Mamfe Central Farmers Multi-Purpose Cooperative Society"
  );
  const [associations, setAssociations] = useState<FarmerCooperativeAssociation[]>([]);
  const [selectedFarmerIdFilter, setSelectedFarmerIdFilter] = useState<string>("ALL");

  // Farms / Plots State
  const [farms, setFarms] = useState<FarmRecord[]>([]);
  const [selectedFarm, setSelectedFarm] = useState<FarmRecord | null>(null);
  const [certificateModalFarm, setCertificateModalFarm] = useState<FarmRecord | null>(null);
  const [highlightedPlotId, setHighlightedPlotId] = useState<string | null>(null);

  // Modal: Register Farm Plot
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
  const [prodBatchInput, setProdBatchInput] = useState("");
  const [prodQtyInput, setProdQtyInput] = useState<number | "">(1000);
  const [prodSubmitting, setProdSubmitting] = useState(false);

  // Modal: Create Cocoa Lot
  const [showLotModal, setShowLotModal] = useState(false);
  const [lotFarmerIdInput, setLotFarmerIdInput] = useState("");
  const [lotQtyInput, setLotQtyInput] = useState<number | "">(1000);
  const [lotSubmitting, setLotSubmitting] = useState(false);

  // Modal: Apply Certificate
  const [showCertModal, setShowCertModal] = useState(false);
  const [certFarmerIdInput, setCertFarmerIdInput] = useState("");
  const [certSubmitting, setCertSubmitting] = useState(false);

  // Trades & Holdings State
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [holdings, setHoldings] = useState<CertificateHolding[]>([]);

  const loadCooperativeData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch Associated Farmers
      const res = await fetch(`/api/cooperative/associations?cooperativeOrgId=${coopOrgId}`);
      const json = await res.json();
      let assocs: FarmerCooperativeAssociation[] = [];
      if (json.success && Array.isArray(json.associations)) {
        assocs = json.associations;
      }
      if (assocs.length === 0) {
        assocs = [
          {
            associationId: "assoc_default_01",
            farmerId: "usr_farmer_sample_01",
            farmerName: "Agatha Mbenge",
            cooperativeOrgId: coopOrgId,
            cooperativeOrgName: coopOrgName,
            cooperativeEmail: "info@mamfecentral-coop.cm",
            cooperativePhone: "+237 677 889 900",
            permissions: { farmsManagement: true, certificatesManagement: true, productionInventory: true, tradingManagement: true },
            status: "active",
            associatedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            associationId: "assoc_default_02",
            farmerId: "usr_farmer_sample_02",
            farmerName: "Samuel Ojong",
            cooperativeOrgId: coopOrgId,
            cooperativeOrgName: coopOrgName,
            cooperativeEmail: "info@mamfecentral-coop.cm",
            cooperativePhone: "+237 677 889 900",
            permissions: { farmsManagement: true, certificatesManagement: true, productionInventory: true, tradingManagement: true },
            status: "active",
            associatedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ];
      }
      setAssociations(assocs);

      // 2. Fetch Farms
      const sampleFarms: FarmRecord[] = [
        {
          id: "farm_sample_01",
          farmName: "Mbenge Family Cocoa Plot",
          farmerId: "usr_farmer_sample_01",
          farmerName: "Agatha Mbenge",
          region: "South-West Region",
          village: "Ossing",
          lga: "Manyu",
          cooperative: coopOrgName,
          geolocation: "5.4521° N, 9.2431° E",
          sizeHectares: 3.2,
          geofenceAreaHa: 3.2,
          cocoaVariety: "F1 Hybrid Trinitario",
          quantityHarvestedKg: 1450,
          batchNumber: "BATCH-MBO-01",
          eudrCompliant: true,
          geofencePolygon: [
            [9.243, 5.452],
            [9.245, 5.453],
            [9.246, 5.451],
            [9.243, 5.452],
          ] as any,
          createdAt: new Date().toISOString(),
        },
        {
          id: "farm_sample_02",
          farmName: "Ojong Agro Plantation",
          farmerId: "usr_farmer_sample_02",
          farmerName: "Samuel Ojong",
          region: "South-West Region",
          village: "Ekok",
          lga: "Manyu",
          cooperative: coopOrgName,
          geolocation: "5.6812° N, 8.9823° E",
          sizeHectares: 5.0,
          geofenceAreaHa: 5.0,
          cocoaVariety: "Amelonado High-Yield",
          quantityHarvestedKg: 2800,
          batchNumber: "BATCH-OJO-02",
          eudrCompliant: true,
          geofencePolygon: [
            [8.982, 5.681],
            [8.985, 5.683],
            [8.986, 5.680],
            [8.982, 5.681],
          ] as any,
          createdAt: new Date().toISOString(),
        },
      ];
      setFarms(sampleFarms);

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

  // Filtered Farms based on selected Farmer Filter
  const filteredFarms = useMemo(() => {
    if (selectedFarmerIdFilter === "ALL") return farms;
    return farms.filter((f: any) => f.farmerId === selectedFarmerIdFilter);
  }, [farms, selectedFarmerIdFilter]);

  // Cooperative Metrics
  const totalAssociatedFarmers = associations.length;
  const totalPlots = filteredFarms.length;
  const totalHectares = filteredFarms.reduce((acc: number, f: any) => acc + (f.geofenceAreaHa ?? f.sizeHectares ?? 0), 0).toFixed(1);
  const totalHarvestKg = filteredFarms.reduce((acc: number, f: any) => acc + (f.quantityHarvestedKg || 0), 0);
  const compliantCount = filteredFarms.filter((f: any) => f.eudrCompliant).length;

  // Map plots
  const mapPlots = filteredFarms.flatMap((farm: any, idx: number) => {
    const poly = Array.isArray(farm.geofencePolygon) ? farm.geofencePolygon : [];
    const coords: [number, number][] = poly.map((p: any) => [p.lng || p[0] || 0, p.lat || p[1] || 0]);
    if (coords.length < 3) return [];
    return [
      {
        id: farm.id,
        name: `${farm.farmName} (${farm.farmerName || "Farmer"})`,
        polygon: coords,
        areaHa: farm.geofenceAreaHa ?? farm.sizeHectares ?? 0,
        region: farm.region,
        color: highlightedPlotId === farm.id ? "#b8f58b" : idx % 2 === 0 ? "#2a7a33" : "#10b981",
      },
    ];
  });

  // Handle Register Farm Plot on behalf of associated farmer
  const handleRegisterFarm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!farmFarmerIdInput) {
      setError("Please select an associated farmer for this farm plot.");
      return;
    }
    setFarmSubmitting(true);
    setError(null);
    try {
      const selectedAssoc = associations.find((a) => a.farmerId === farmFarmerIdInput);
      const farmerName = selectedAssoc ? selectedAssoc.farmerName : "Associated Farmer";

      const newFarm: FarmRecord = {
        id: `farm_coop_${Date.now()}`,
        farmName: farmNameInput.trim() || `${farmerName}'s Cooperative Cocoa Plot`,
        farmerId: farmFarmerIdInput,
        farmerName,
        region: farmRegionInput,
        village: farmVillageInput.trim() || "Cooperative Sector",
        lga: "Manyu",
        cooperative: coopOrgName,
        geolocation: "5.4512° N, 9.2415° E",
        sizeHectares: Number(farmSizeInput) || 2.5,
        geofenceAreaHa: Number(farmSizeInput) || 2.5,
        cocoaVariety: "F1 Hybrid Trinitario",
        quantityHarvestedKg: 500,
        batchNumber: `BATCH-COOP-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
        eudrCompliant: true,
        geofencePolygon: [
          [9.241, 5.451],
          [9.244, 5.452],
          [9.243, 5.450],
          [9.241, 5.451],
        ] as any,
        createdAt: new Date().toISOString(),
      };

      setFarms((prev) => [newFarm, ...prev]);
      setSuccessMsg(`Successfully registered farm plot for ${farmerName} operated on behalf of ${coopOrgName}!`);
      setShowRegisterFarmModal(false);
      setFarmNameInput("");
      setFarmVillageInput("");
      setTimeout(() => setSuccessMsg(null), 4000);
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
      setError("Please select an associated farmer.");
      return;
    }
    setProdSubmitting(true);
    setError(null);
    try {
      const selectedAssoc = associations.find((a) => a.farmerId === prodFarmerIdInput);
      const farmerName = selectedAssoc ? selectedAssoc.farmerName : "Associated Farmer";

      setSuccessMsg(`Recorded ${Number(prodQtyInput).toLocaleString()} kg harvest batch (${prodBatchInput || "BATCH-COOP-NEW"}) for ${farmerName} operated by ${coopOrgName}.`);
      setShowProductionModal(false);
      setProdBatchInput("");
      setTimeout(() => setSuccessMsg(null), 4000);
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
      setError("Please select an associated farmer.");
      return;
    }
    setLotSubmitting(true);
    setError(null);
    try {
      const selectedAssoc = associations.find((a) => a.farmerId === lotFarmerIdInput);
      const farmerName = selectedAssoc ? selectedAssoc.farmerName : "Associated Farmer";

      setSuccessMsg(`Successfully created traceable cocoa lot (${Number(lotQtyInput).toLocaleString()} kg) for ${farmerName} under cooperative custody (${coopOrgName}).`);
      setShowLotModal(false);
      setTimeout(() => setSuccessMsg(null), 4000);
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
      setError("Please select an associated farmer.");
      return;
    }
    setCertSubmitting(true);
    setError(null);
    try {
      const selectedAssoc = associations.find((a) => a.farmerId === certFarmerIdInput);
      const farmerName = selectedAssoc ? selectedAssoc.farmerName : "Associated Farmer";

      setSuccessMsg(`Origin Trace & EUDR Certificate application submitted successfully for ${farmerName} operated by ${coopOrgName}.`);
      setShowCertModal(false);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCertSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f8f3] text-[#10251d]">
      <Navbar />

      <main className="mx-auto max-w-[1360px] px-4 pt-28 pb-20 sm:px-6 sm:pt-32 lg:px-8">
        <div className="mb-6">
          <DashboardWorkflowNav currentTab="cooperative" />
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-6 rounded-2xl bg-red-50 p-4 text-xs text-red-800 flex items-center gap-2 border border-red-200 shadow-xs">
            <AlertCircle size={16} className="shrink-0" />
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="ml-auto text-red-600 hover:text-red-900 font-bold">×</button>
          </div>
        )}

        {successMsg && (
          <div className="mb-6 rounded-2xl bg-emerald-50 p-4 text-xs text-emerald-800 flex items-center gap-2 border border-emerald-200 shadow-xs">
            <CheckCircle2 size={16} className="shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Header & Cooperative Branding */}
        <section className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[#edf7e8] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#2d6130] border border-[#d2ecc8]">
                Cooperative Dashboard
              </span>
              <span className="flex items-center gap-1.5 text-xs font-bold text-[#0b3528]">
                <Building2 size={14} className="text-[#2a7a33]" />
                {coopOrgName}
              </span>
            </div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-[#10251d] sm:text-4xl">
              Cooperative Operations &amp; Farmer Management Hub
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#57655d]">
              All operations are officially recognized as <strong>cooperative-operated</strong> on behalf of associated member farmers. Manage farm plots, production harvests, cocoa lots, EUDR certificates, and commercial trade.
            </p>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setFarmFarmerIdInput(associations[0]?.farmerId || "");
                setShowRegisterFarmModal(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#0b3528] px-5 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-[#144737] cursor-pointer"
            >
              <Plus size={15} />
              Register Farmer Plot
            </button>
            <button
              type="button"
              onClick={() => {
                setProdFarmerIdInput(associations[0]?.farmerId || "");
                setShowProductionModal(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#dfe7d8] bg-white px-5 py-3 text-xs font-bold text-[#10251d] shadow-sm transition hover:bg-[#f7f8f3] cursor-pointer"
            >
              <Layers size={15} />
              Record Harvest Batch
            </button>
            <button
              type="button"
              onClick={() => {
                setLotFarmerIdInput(associations[0]?.farmerId || "");
                setShowLotModal(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#dfe7d8] bg-white px-5 py-3 text-xs font-bold text-[#10251d] shadow-sm transition hover:bg-[#f7f8f3] cursor-pointer"
            >
              <FileText size={15} />
              Create Traceable Lot
            </button>
          </div>
        </section>

        {/* Global Farmer Filter Bar */}
        <section className="mb-8 rounded-3xl border border-[#dfe7d8] bg-white p-4 sm:p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#2d6130] flex items-center gap-1.5">
                <Users size={15} /> Associated Farmer Filter:
              </span>
              <span className="text-xs text-[#57655d]">
                Filtering operations across all subsections by member farmer
              </span>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={selectedFarmerIdFilter}
                onChange={(e) => setSelectedFarmerIdFilter(e.target.value)}
                className="rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] px-4 py-2 text-xs font-bold text-[#10251d] outline-none focus:border-[#2d6130]"
              >
                <option value="ALL">All Associated Farmers ({totalAssociatedFarmers})</option>
                {associations.map((a) => (
                  <option key={a.farmerId} value={a.farmerId}>
                    {a.farmerName} ({a.farmerId})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Live Metric Cards */}
        <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Associated Farmers"
            value={totalAssociatedFarmers}
            unit="members"
            description="Active cooperative member farmers"
            icon={<Users size={16} />}
          />
          <MetricCard
            label="Managed Land Area"
            value={totalHectares}
            unit="hectares"
            description={`${totalPlots} registered cooperative plots`}
            icon={<MapPin size={16} />}
          />
          <MetricCard
            label="Cooperative Harvest Volume"
            value={totalHarvestKg.toLocaleString()}
            unit="kg"
            description="Aggregated harvest inventory"
            icon={<Layers size={16} />}
          />
          <MetricCard
            label="EUDR Compliant Plots"
            value={`${compliantCount} / ${totalPlots}`}
            unit="verified"
            description="Zero-deforestation compliance"
            icon={<ShieldCheck size={16} />}
          />
        </section>

        {/* Subsection Navigation Tabs */}
        <div className="mb-6 flex border-b border-[#dfe7d8] gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab("farmers")}
            className={`flex items-center gap-2 border-b-2 px-6 py-3.5 text-sm font-bold transition cursor-pointer whitespace-nowrap ${
              activeTab === "farmers" ? "border-[#2d6130] text-[#0b3528]" : "border-transparent text-[#57655d] hover:text-[#10251d]"
            }`}
          >
            <Users size={16} /> Associated Farmer Roster ({associations.length})
          </button>
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
            <FileText size={16} /> Cocoa Lots &amp; Traceability
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

        {/* Tab 1: Associated Farmers Roster */}
        {activeTab === "farmers" && (
          <div className="space-y-6">
            <div className="rounded-3xl border border-[#dfe7d8] bg-white p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-[#edf1ea] pb-4 mb-6">
                <div>
                  <h3 className="text-lg font-bold text-[#10251d]">Associated Member Farmers</h3>
                  <p className="text-xs text-[#57655d]">Farmers associated with {coopOrgName} granting cooperative management permissions.</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#f8f9f3] font-bold uppercase text-[#57655d] border-b border-[#dfe7d8]">
                    <tr>
                      <th className="py-3 px-4">Farmer ID</th>
                      <th className="py-3 px-4">Farmer Name</th>
                      <th className="py-3 px-4">Cooperative Association</th>
                      <th className="py-3 px-4">Management Permissions</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#edf1ea] text-[#394a41]">
                    {associations.map((assoc) => (
                      <tr key={assoc.associationId} className="hover:bg-[#fafbf8] transition">
                        <td className="py-3.5 px-4 font-mono font-bold text-[#10251d]">{assoc.farmerId}</td>
                        <td className="py-3.5 px-4 font-bold text-[#10251d]">{assoc.farmerName}</td>
                        <td className="py-3.5 px-4">{assoc.cooperativeOrgName}</td>
                        <td className="py-3.5 px-4">
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                            Full Management Delegated
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedFarmerIdFilter(assoc.farmerId)}
                            className="rounded-full bg-[#0b3528] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#144737] cursor-pointer"
                          >
                            Filter by Farmer
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Cooperative Farm Plots */}
        {activeTab === "farms" && (
          <div className="space-y-6">
            <div className="rounded-3xl border border-[#dfe7d8] bg-white p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-[#edf1ea] pb-4 mb-6">
                <div>
                  <h3 className="text-lg font-bold text-[#10251d]">Cooperative-Operated Farm Plots</h3>
                  <p className="text-xs text-[#57655d]">
                    Showing farm plots for {selectedFarmerIdFilter === "ALL" ? "all associated farmers" : selectedFarmerIdFilter}.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFarmFarmerIdInput(associations[0]?.farmerId || "");
                    setShowRegisterFarmModal(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#0b3528] px-4 py-2 text-xs font-bold text-white hover:bg-[#144737] cursor-pointer"
                >
                  <Plus size={14} /> Register Farm Plot
                </button>
              </div>

              {/* Geofence Map */}
              <div className="mb-6 rounded-3xl border border-[#dfe7d8] p-4 bg-[#fafcf9]">
                <div className="mb-3 flex items-center justify-between text-xs font-bold text-[#2d6130]">
                  <span className="flex items-center gap-1.5 uppercase tracking-wider">
                    <Trees size={15} /> Cooperative Geofencing &amp; Deforestation Map
                  </span>
                  <span className="rounded-full bg-[#edf7e8] px-2.5 py-0.5 text-[0.65rem] font-bold text-[#2a7a33] border border-[#c6e8ba]">
                    Cooperative Operated
                  </span>
                </div>
                {mapPlots.length > 0 ? (
                  <MapboxGeofenceMap
                    initialCenter={[9.1245, 4.5912]}
                    initialZoom={9}
                    existingPlots={mapPlots}
                    selectedPlotId={highlightedPlotId}
                    heightClass="h-[320px]"
                    onSelectPlot={(id: string) => setHighlightedPlotId(id)}
                  />
                ) : (
                  <div className="py-12 text-center text-xs text-[#57655d]">No geofenced plots found for current filter.</div>
                )}
              </div>

              {/* Farms List */}
              <div className="grid gap-4">
                {filteredFarms.map((farm: any, index: number) => (
                  <div key={farm.id || index} className="rounded-2xl border border-[#dfe7d8] bg-white p-5 shadow-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#edf1ea] pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-[#edf7e8] px-2.5 py-0.5 text-[10px] font-bold text-[#2d6130]">
                            FARMER: {farm.farmerName || "Associated Farmer"}
                          </span>
                          <span className="font-mono text-xs text-gray-400">{farm.id}</span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#eefae6] px-2 py-0.5 text-[10px] font-semibold text-[#2a7a33]">
                            <ShieldCheck size={11} /> EUDR Compliant
                          </span>
                        </div>
                        <h4 className="mt-1 text-base font-bold text-[#10251d]">{farm.farmName}</h4>
                        <p className="text-xs text-[#57655d]">
                          {farm.village}, {farm.region} • Operated by {coopOrgName}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setCertificateModalFarm(farm)}
                          className="inline-flex items-center gap-1 rounded-full border border-[#2d6130]/30 bg-[#edf7e8] px-3.5 py-1.5 text-xs font-bold text-[#1b4e28] hover:bg-[#dff0d8] cursor-pointer"
                        >
                          <ShieldCheck size={12} /> Trust Pass
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedFarm(farm)}
                          className="inline-flex items-center gap-1 rounded-full border border-[#dfe7d8] bg-[#f7f8f3] px-3.5 py-1.5 text-xs font-bold text-[#10251d] hover:bg-[#edf2ea] cursor-pointer"
                        >
                          <Eye size={12} /> View Dossier
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="rounded-xl bg-[#fafcf9] p-2.5">
                        <span className="text-[10px] uppercase font-semibold text-gray-400 block">Area</span>
                        <strong className="text-sm font-bold text-[#10251d]">{farm.geofenceAreaHa ?? farm.sizeHectares ?? 0} Ha</strong>
                      </div>
                      <div className="rounded-xl bg-[#fafcf9] p-2.5">
                        <span className="text-[10px] uppercase font-semibold text-gray-400 block">Harvest Volume</span>
                        <strong className="text-sm font-bold text-[#2a7a33]">{(farm.quantityHarvestedKg || 0).toLocaleString()} kg</strong>
                      </div>
                      <div className="rounded-xl bg-[#fafcf9] p-2.5">
                        <span className="text-[10px] uppercase font-semibold text-gray-400 block">Batch Code</span>
                        <span className="font-mono font-bold text-[#10251d]">{farm.batchNumber || "BATCH-01"}</span>
                      </div>
                      <div className="rounded-xl bg-[#fafcf9] p-2.5">
                        <span className="text-[10px] uppercase font-semibold text-gray-400 block">Coop Operator</span>
                        <span className="font-bold text-[#2d6130]">{coopOrgName}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Production & Harvests */}
        {activeTab === "production" && (
          <div className="space-y-6">
            <div className="rounded-3xl border border-[#dfe7d8] bg-white p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-[#edf1ea] pb-4 mb-6">
                <div>
                  <h3 className="text-lg font-bold text-[#10251d]">Cooperative Production &amp; Harvest Batches</h3>
                  <p className="text-xs text-[#57655d]">Record and track farmer harvest intake operated by {coopOrgName}.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setProdFarmerIdInput(associations[0]?.farmerId || "");
                    setShowProductionModal(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#0b3528] px-4 py-2 text-xs font-bold text-white hover:bg-[#144737] cursor-pointer"
                >
                  <Plus size={14} /> Record Harvest Batch
                </button>
              </div>

              <div className="space-y-3">
                {filteredFarms.map((farm: any, idx: number) => (
                  <div key={idx} className="flex flex-col sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-[#dfe7d8] bg-[#fafcf9] p-4 text-xs">
                    <div>
                      <div className="font-bold text-[#10251d] text-sm">{farm.farmName} — Harvest Intake</div>
                      <div className="text-gray-500 mt-0.5">
                        Farmer: <strong>{farm.farmerName}</strong> • Batch: <span className="font-mono">{farm.batchNumber || "BATCH-01"}</span> • Variety: {farm.cocoaVariety || "F1 Hybrid"}
                      </div>
                    </div>
                    <div className="mt-2 sm:mt-0 text-right">
                      <div className="font-bold text-sm text-[#2a7a33]">{(farm.quantityHarvestedKg || 0).toLocaleString()} kg</div>
                      <span className="text-[10px] text-gray-400">Cooperative Intake Verified</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Cocoa Lots & Traceability */}
        {activeTab === "lots" && (
          <div className="space-y-6">
            <div className="rounded-3xl border border-[#dfe7d8] bg-white p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-[#edf1ea] pb-4 mb-6">
                <div>
                  <h3 className="text-lg font-bold text-[#10251d]">Cocoa Lots &amp; Traceability Registry</h3>
                  <p className="text-xs text-[#57655d]">Manage traceable cocoa lots aggregated by {coopOrgName} on behalf of associated farmers.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setLotFarmerIdInput(associations[0]?.farmerId || "");
                    setShowLotModal(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#0b3528] px-4 py-2 text-xs font-bold text-white hover:bg-[#144737] cursor-pointer"
                >
                  <Plus size={14} /> Create Traceable Lot
                </button>
              </div>

              <div className="space-y-3">
                {filteredFarms.map((farm: any, idx: number) => (
                  <div key={idx} className="rounded-2xl border border-[#dfe7d8] bg-[#fafcf9] p-4 text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <div className="font-mono font-bold text-sm text-[#10251d]">LOT-CMR-2026-{idx + 101}</div>
                      <div className="text-gray-500 mt-1">
                        Farmer: <strong>{farm.farmerName}</strong> • Region: {farm.region} • Grade: Grade 1 Main Crop Fermented
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="font-bold text-[#10251d]">{(farm.quantityHarvestedKg || 1000).toLocaleString()} kg</div>
                        <span className="text-[10px] text-emerald-700 font-bold">Traceability Active</span>
                      </div>
                      <Link
                        href="/dashboard/lots"
                        className="rounded-full bg-[#0b3528] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#144737]"
                      >
                        Inspect Lot
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 5: Certificates & Holdings */}
        {activeTab === "certificates" && (
          <div className="space-y-6">
            <div className="rounded-3xl border border-[#dfe7d8] bg-white p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-[#edf1ea] pb-4 mb-6">
                <div>
                  <h3 className="text-lg font-bold text-[#10251d]">Certificates &amp; Custody Holdings</h3>
                  <p className="text-xs text-[#57655d]">Origin Trace &amp; EUDR certificates managed by {coopOrgName} for associated farmers.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCertFarmerIdInput(associations[0]?.farmerId || "");
                    setShowCertModal(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#0b3528] px-4 py-2 text-xs font-bold text-white hover:bg-[#144737] cursor-pointer"
                >
                  <ShieldCheck size={14} /> Apply for Origin Trace Certificate
                </button>
              </div>

              <div className="grid gap-4">
                {filteredFarms.map((farm: any, idx: number) => (
                  <div key={idx} className="rounded-2xl border border-[#dfe7d8] bg-[#fafcf9] p-5 text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm text-[#2d6130]">CERT-CMR-2026-{idx + 500}</span>
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">EUDR Article 9 Verified</span>
                      </div>
                      <div className="text-gray-500 mt-1">
                        Holder: <strong>{coopOrgName}</strong> (On behalf of Farmer: <em>{farm.farmerName}</em>)
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCertificateModalFarm(farm)}
                      className="rounded-full border border-[#2d6130] bg-[#edf7e8] px-4 py-2 text-xs font-bold text-[#2d6130] hover:bg-[#dff0d8] cursor-pointer"
                    >
                      View Trust Pass
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 6: Commercial Trades */}
        {activeTab === "trades" && (
          <div className="space-y-6">
            <div className="rounded-3xl border border-[#dfe7d8] bg-white p-6 shadow-sm">
              <div className="border-b border-[#edf1ea] pb-4 mb-6">
                <h3 className="text-lg font-bold text-[#10251d]">Cooperative Commercial Trades &amp; Orders</h3>
                <p className="text-xs text-[#57655d]">Marketplace sales and off-platform settlements operated by {coopOrgName}.</p>
              </div>

              {trades.length === 0 ? (
                <div className="py-12 text-center text-xs text-[#57655d]">No commercial trades recorded yet.</div>
              ) : (
                <div className="space-y-3">
                  {trades.map((t) => (
                    <div key={t.tradeId} className="rounded-2xl border border-[#dfe7d8] bg-[#fafcf9] p-4 text-xs flex items-center justify-between">
                      <div>
                        <span className="font-mono font-bold text-[#10251d]">{t.tradeNumber}</span>
                        <div className="text-gray-500 mt-0.5">Lot: {t.lotId} • Qty: {t.quantityKg} kg • Total: {t.totalAmount} {t.currency}</div>
                      </div>
                      <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-bold text-emerald-800 uppercase text-[10px]">
                        {t.tradeStatus}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </main>

      {/* Modal: Register Farm Plot (with Farmer Filter / Selector) */}
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
                      {a.farmerName} ({a.farmerId})
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

      {/* Modal: Record Harvest Batch (with Farmer Filter / Selector) */}
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
                  onChange={(e) => setProdFarmerIdInput(e.target.value)}
                  className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                >
                  <option value="">-- Choose Member Farmer --</option>
                  {associations.map((a) => (
                    <option key={a.farmerId} value={a.farmerId}>
                      {a.farmerName} ({a.farmerId})
                    </option>
                  ))}
                </select>
              </div>

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

      {/* Modal: Create Cocoa Lot (with Farmer Filter / Selector) */}
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
                  onChange={(e) => setLotFarmerIdInput(e.target.value)}
                  className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                >
                  <option value="">-- Choose Member Farmer --</option>
                  {associations.map((a) => (
                    <option key={a.farmerId} value={a.farmerId}>
                      {a.farmerName} ({a.farmerId})
                    </option>
                  ))}
                </select>
              </div>

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

      {/* Modal: Apply Certificate (with Farmer Filter / Selector) */}
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
                  onChange={(e) => setCertFarmerIdInput(e.target.value)}
                  className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                >
                  <option value="">-- Choose Member Farmer --</option>
                  {associations.map((a) => (
                    <option key={a.farmerId} value={a.farmerId}>
                      {a.farmerName} ({a.farmerId})
                    </option>
                  ))}
                </select>
              </div>

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
