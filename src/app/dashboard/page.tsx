"use client";

import Link from "next/link";
import { useState, Suspense } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { useFirebase, FarmRecord } from "@/context/FirebaseContext";
import FarmCertificateModal from "@/components/FarmCertificateModal";
import {
  MapPin,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  UserCheck,
  Layers,
  Truck,
  Search,
  Eye,
  X,
  TrendingUp,
  Coins,
  Plus,
  PackageCheck,
  BarChart3,
  ExternalLink,
  Compass,
  QrCode,
} from "lucide-react";

// Dynamic import of Mapbox map for SSR safety
const MapboxGeofenceMap = dynamic(() => import("@/components/MapboxGeofenceMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[380px] w-full items-center justify-center rounded-3xl bg-[#062d22] text-white">
      <div className="flex items-center gap-2 text-xs text-[#b8f58b]">
        <Compass className="animate-spin" size={18} /> Loading map...
      </div>
    </div>
  ),
});

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f7f8f3]" />}>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const onboarded = searchParams.get("onboarded") === "true";
  const newFarmName = searchParams.get("newFarm");

  const { user, farms, updateFarm } = useFirebase();

  const [selectedFarm, setSelectedFarm] = useState<FarmRecord | null>(null);
  const [showBatchModal, setShowBatchModal] = useState<FarmRecord | null>(null);
  const [batchQty, setBatchQty] = useState("");
  const [batchCode, setBatchCode] = useState("");
  const [batchSuccess, setBatchSuccess] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [highlightedPlotId, setHighlightedPlotId] = useState<string | null>(null);
  const [certificateModalFarm, setCertificateModalFarm] = useState<FarmRecord | null>(null);

  // Filter farmer's plots (or display default plots if newly registered)
  const userFarms = farms.filter((f) => !user || f.farmerId === user.uid || farms.length <= 4);

  // Map polygon data for all registered plots
  const mapPlots = userFarms.map((f, i) => {
    let poly = f.geofencePolygon;
    if (!poly || poly.length < 3) {
      const centerLng = 9.1245 + i * 0.007;
      const centerLat = 4.5912 + i * 0.005;
      poly = [
        [centerLng - 0.0018, centerLat - 0.001],
        [centerLng + 0.0022, centerLat - 0.0012],
        [centerLng + 0.0025, centerLat + 0.0016],
        [centerLng - 0.0015, centerLat + 0.0018],
      ];
    }
    return {
      id: f.id,
      name: f.farmName,
      polygon: poly,
      areaHa: f.geofenceAreaHa || f.sizeHectares || 3.5,
      region: f.region,
      color: highlightedPlotId === f.id ? "#b8f58b" : i === 0 ? "#2a7a33" : "#10b981",
    };
  });

  // Calculate stats (live + baseline dummy values)
  const totalPlots = userFarms.length || 3;
  const totalHectares = (
    userFarms.reduce((acc, f) => acc + (f.sizeHectares || 0), 0) || 12.8
  ).toFixed(1);
  const totalHarvestKg =
    userFarms.reduce((acc, f) => acc + (f.quantityHarvestedKg || 0), 0) || 14850;
  const estAnnualYield =
    userFarms.reduce((acc, f) => acc + (f.estimatedAnnualYieldKg || 0), 0) || 21500;
  const estimatedRevenueFcfa = (totalHarvestKg * 1350).toLocaleString("en-US");

  const handleAddBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showBatchModal) return;

    const addKg = parseFloat(batchQty) || 0;
    const currentHarvest = showBatchModal.quantityHarvestedKg || 0;
    const updatedHarvest = currentHarvest + addKg;

    await updateFarm(showBatchModal.id, {
      quantityHarvestedKg: updatedHarvest,
      batchNumber: batchCode.trim() || `BATCH-CR-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
    });

    setBatchSuccess(true);
    setTimeout(() => {
      setBatchSuccess(false);
      setShowBatchModal(null);
      setBatchQty("");
      setBatchCode("");
    }, 1200);
  };

  return (
    <div className="min-h-screen bg-[#f7f8f3] text-[#10251d]">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 pt-28 pb-16 sm:px-6 sm:pt-32 lg:px-8">
        {/* Onboarding Success Alert Banner */}
        {(onboarded || newFarmName) && (
          <div className="mb-8 flex items-center justify-between rounded-3xl border border-[#c4ebb0] bg-[#eefae6] p-4 sm:p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#2a7a33] text-white">
                <CheckCircle2 size={20} />
              </div>
              <div>
                <h4 className="font-bold text-[#0c392b]">
                  {newFarmName
                    ? `Plot "${newFarmName}" Successfully Registered!`
                    : "Farm Onboarding Completed Successfully!"}
                </h4>
                <p className="text-xs text-[#2a5933]">
                  Your plot metadata and EUDR traceability record are now active in the platform registry.
                </p>
              </div>
            </div>
            <Link
              href="/signup"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-[#0b3528] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#07241b]"
            >
              <Plus size={14} /> Add Another Plot
            </Link>
          </div>
        )}

        {/* Dashboard Top Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[#edf7e8] px-3 py-1 text-xs font-bold text-[#2d6130] uppercase tracking-wider">
                Farmer Workspace
              </span>
              <span className="flex items-center gap-1 text-xs font-semibold text-[#57655d]">
                <ShieldCheck size={14} className="text-[#2a7a33]" /> EUDR Verified Producer
              </span>
            </div>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-[#10251d] sm:text-4xl">
              {user?.displayName ? `${user.displayName}'s Dashboard` : "Producer Dashboard"}
            </h1>
            <p className="mt-1 text-sm text-[#57655d]">
              Cooperative Union: <strong className="text-[#10251d]">SOWESCOP Agricultural Union (Ndian / Kumba Hub)</strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-full bg-[#0b3528] px-5 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-[#07241b]"
            >
              <Plus size={16} /> Register New Plot
            </Link>
            <Link
              href="/marketplace"
              className="inline-flex items-center gap-2 rounded-full border border-[#dfe7d8] bg-white px-5 py-3 text-xs font-bold text-[#10251d] shadow-sm transition hover:bg-[#f7f8f3]"
            >
              <ExternalLink size={14} /> View Marketplace Lots
            </Link>
          </div>
        </div>

        {/* 4 Key Metric Cards (Live + Dummy Baseline Stats) */}
        <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Metric 1: Total Registered Land */}
          <div className="rounded-3xl border border-[#dfe7d8] bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#57655d] uppercase tracking-wider">
                Total Land
              </span>
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#edf7e8] text-[#2d6130]">
                <MapPin size={16} />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-2xl font-black text-[#10251d] sm:text-3xl">
                {totalHectares}
              </span>
              <span className="ml-1 text-xs font-semibold text-[#57655d]">Hectares</span>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs text-[#2a7a33]">
              <CheckCircle2 size={13} />
              <span>{totalPlots} Registered Plot{totalPlots > 1 ? "s" : ""}</span>
            </div>
          </div>

          {/* Metric 2: Harvested Volume */}
          <div className="rounded-3xl border border-[#dfe7d8] bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#57655d] uppercase tracking-wider">
                Harvest 2026/27
              </span>
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#edf7e8] text-[#2d6130]">
                <Layers size={16} />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-2xl font-black text-[#10251d] sm:text-3xl">
                {totalHarvestKg.toLocaleString()}
              </span>
              <span className="ml-1 text-xs font-semibold text-[#57655d]">kg</span>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs text-[#2a7a33]">
              <TrendingUp size={13} />
              <span>Est. Season Target: {estAnnualYield.toLocaleString()} kg</span>
            </div>
          </div>

          {/* Metric 3: Active EUDR Batches */}
          <div className="rounded-3xl border border-[#dfe7d8] bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#57655d] uppercase tracking-wider">
                Traceable Batches
              </span>
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#edf7e8] text-[#2d6130]">
                <PackageCheck size={16} />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-2xl font-black text-[#10251d] sm:text-3xl">
                {Math.max(userFarms.length, 3)}
              </span>
              <span className="ml-1 text-xs font-semibold text-[#57655d]">Active Lots</span>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs text-[#2a7a33]">
              <ShieldCheck size={13} />
              <span>100% Zero Deforestation Cleared</span>
            </div>
          </div>

          {/* Metric 4: Estimated Farm-Gate Value */}
          <div className="rounded-3xl border border-[#dfe7d8] bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#57655d] uppercase tracking-wider">
                Farm-Gate Value
              </span>
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#edf7e8] text-[#2d6130]">
                <Coins size={16} />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-2xl font-black text-[#10251d] sm:text-3xl">
                FCFA {estimatedRevenueFcfa}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs text-[#57655d]">
              <span>Avg. Rate: FCFA 1,350 / kg FOB Ref</span>
            </div>
          </div>
        </section>

        {/* Main Content Layout: Plots Grid + Analytics Sidebar */}
        <div className="mt-10 grid gap-8 lg:grid-cols-[1.3fr_0.7fr]">
          {/* Left Column: Interactive Map & Registered Plots */}
          <section className="space-y-6">
            {/* Interactive Mapbox Geofence Card */}
            <div className="rounded-[32px] border border-[#dfe7d8] bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[#edf1ea] pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-[#edf7e8] px-2.5 py-0.5 text-[0.68rem] font-bold text-[#2d6130] uppercase tracking-wider">
                      Mapbox Satellite View
                    </span>
                    <span className="flex items-center gap-1 text-[0.68rem] font-semibold text-[#2a7a33]">
                      <ShieldCheck size={13} /> {mapPlots.length} Plots Geofenced
                    </span>
                  </div>
                  <h2 className="mt-1 text-xl font-bold text-[#10251d]">
                    Farm Plot Geofences & Canopy Boundaries
                  </h2>
                </div>

                {/* Plot Selector Buttons */}
                <div className="flex flex-wrap gap-1.5">
                  {mapPlots.slice(0, 4).map((p, idx) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setHighlightedPlotId(p.id === highlightedPlotId ? null : p.id)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition cursor-pointer ${
                        highlightedPlotId === p.id
                          ? "bg-[#0b3528] text-[#b8f58b]"
                          : "bg-[#f7f8f3] text-[#57655d] hover:bg-[#dfe7d8]"
                      }`}
                    >
                      Plot #{idx + 1}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mapbox Satellite Component */}
              <div className="mt-4">
                <MapboxGeofenceMap
                  initialCenter={[9.1245, 4.5912]}
                  initialZoom={15}
                  existingPlots={mapPlots}
                  selectedPlotId={highlightedPlotId}
                  heightClass="h-[360px]"
                  onSelectPlot={(id) => setHighlightedPlotId(id)}
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-bold text-[#10251d]">
                  My Registered Cocoa Plots
                </h2>
                <p className="text-xs text-[#57655d]">
                  Overview of all registered farm plots, GPS polygon anchors, and batch intakes.
                </p>
              </div>

              {/* Search input */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-3 text-[#57655d]" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search plot or village..."
                  className="rounded-full border border-[#dfe7d8] bg-white py-2 pl-9 pr-4 text-xs text-[#10251d] outline-none transition focus:border-[#2d6130]"
                />
              </div>
            </div>

            {/* Farm Cards Grid */}
            <div className="grid gap-5">
              {userFarms
                .filter((f) => {
                  if (!searchTerm) return true;
                  const term = searchTerm.toLowerCase();
                  return (
                    f.farmName.toLowerCase().includes(term) ||
                    (f.village && f.village.toLowerCase().includes(term)) ||
                    f.region.toLowerCase().includes(term)
                  );
                })
                .map((farm, index) => (
                  <div
                    key={farm.id || index}
                    className="rounded-3xl border border-[#dfe7d8] bg-white p-6 shadow-sm transition hover:shadow-md"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between border-b border-[#edf1ea] pb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-[#edf7e8] px-2.5 py-0.5 text-[0.68rem] font-bold text-[#2d6130]">
                            PLOT #{index + 1}
                          </span>
                          <span className="font-mono text-xs text-[#57655d]">
                            {farm.id}
                          </span>
                        </div>
                        <h3 className="mt-1.5 text-lg font-bold text-[#10251d]">
                          {farm.farmName}
                        </h3>
                        <p className="text-xs text-[#57655d] flex items-center gap-1 mt-0.5">
                          <MapPin size={13} className="text-[#2d6130]" />
                          {farm.village ? `${farm.village}, ` : ""}
                          {farm.lga ? `${farm.lga} • ` : ""}
                          {farm.region}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setCertificateModalFarm(farm)}
                          className="inline-flex items-center gap-1.5 rounded-full border border-[#2d6130]/30 bg-[#edf7e8] px-3.5 py-1.5 text-xs font-bold text-[#1b4e28] transition hover:bg-[#dff0d8] cursor-pointer"
                        >
                          <QrCode size={13} /> Certificate
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedFarm(farm)}
                          className="inline-flex items-center gap-1 rounded-full border border-[#dfe7d8] bg-[#f7f8f3] px-3.5 py-1.5 text-xs font-semibold text-[#10251d] transition hover:bg-[#edf3ea] cursor-pointer"
                        >
                          <Eye size={13} /> View Dossier
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowBatchModal(farm);
                            setBatchCode(`BATCH-CR-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`);
                          }}
                          className="inline-flex items-center gap-1 rounded-full bg-[#0b3528] px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-[#07241b] cursor-pointer"
                        >
                          <Plus size={13} /> Record Batch
                        </button>
                      </div>
                    </div>

                    {/* Plot Quick Spec Grid */}
                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
                      <div className="rounded-2xl bg-[#fafcf9] p-3 border border-[#edf1ea]">
                        <span className="block text-[0.65rem] text-[#6f7e73] uppercase font-semibold">
                          GPS Coordinates
                        </span>
                        <span className="font-mono text-xs font-bold text-[#2d6130] truncate block mt-0.5">
                          {farm.geolocation || "4.5821° N, 9.0432° E"}
                        </span>
                      </div>

                      <div className="rounded-2xl bg-[#fafcf9] p-3 border border-[#edf1ea]">
                        <span className="block text-[0.65rem] text-[#6f7e73] uppercase font-semibold">
                          Farm Area
                        </span>
                        <strong className="text-xs font-bold text-[#10251d] block mt-0.5">
                          {farm.sizeHectares || 3.5} Hectares
                        </strong>
                      </div>

                      <div className="rounded-2xl bg-[#fafcf9] p-3 border border-[#edf1ea]">
                        <span className="block text-[0.65rem] text-[#6f7e73] uppercase font-semibold">
                          Current Batch
                        </span>
                        <span className="font-mono text-xs font-bold text-[#10251d] block mt-0.5">
                          {farm.batchNumber || "BATCH-01"}
                        </span>
                      </div>

                      <div className="rounded-2xl bg-[#fafcf9] p-3 border border-[#edf1ea]">
                        <span className="block text-[0.65rem] text-[#6f7e73] uppercase font-semibold">
                          Harvest Volume
                        </span>
                        <strong className="text-xs font-bold text-[#2a7a33] block mt-0.5">
                          {(farm.quantityHarvestedKg || 1850).toLocaleString()} kg
                        </strong>
                      </div>
                    </div>

                    {/* Custody Route Footer */}
                    {farm.batchMovementRoute && (
                      <div className="mt-3 flex items-center gap-2 rounded-2xl bg-[#f0f6eb] px-3.5 py-2 text-[0.72rem] text-[#2a5933]">
                        <Truck size={14} className="shrink-0 text-[#2d6130]" />
                        <span className="truncate">
                          <strong>Route:</strong> {farm.batchMovementRoute}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </section>

          {/* Right Column: Essential Compliance & Market Intelligence */}
          <aside className="space-y-6">
            {/* Card 1: EUDR Compliance Status */}
            <div className="rounded-3xl border border-[#dfe7d8] bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2 text-[#2d6130]">
                <ShieldCheck size={20} />
                <h3 className="font-bold text-[#10251d]">EUDR Due-Diligence Status</h3>
              </div>
              <p className="mt-1 text-xs text-[#57655d]">
                European Union Deforestation Regulation (EUDR) Article 9 verification overview for your plots.
              </p>

              <div className="mt-4 space-y-2.5 text-xs">
                <div className="flex items-center justify-between rounded-2xl bg-[#fafcf9] p-3 border border-[#edf1ea]">
                  <span className="text-[#57655d]">Deforestation Baseline (Post-2020)</span>
                  <span className="rounded-full bg-[#edf7e8] px-2.5 py-0.5 text-[0.68rem] font-bold text-[#2a7a33]">
                    100% Compliant
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-2xl bg-[#fafcf9] p-3 border border-[#edf1ea]">
                  <span className="text-[#57655d]">GPS Polygon Boundary</span>
                  <span className="rounded-full bg-[#edf7e8] px-2.5 py-0.5 text-[0.68rem] font-bold text-[#2a7a33]">
                    Geocoded
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-2xl bg-[#fafcf9] p-3 border border-[#edf1ea]">
                  <span className="text-[#57655d]">Customary Land Attestation</span>
                  <span className="rounded-full bg-[#edf7e8] px-2.5 py-0.5 text-[0.68rem] font-bold text-[#2a7a33]">
                    Validated
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-2xl bg-[#fafcf9] p-3 border border-[#edf1ea]">
                  <span className="text-[#57655d]">Traceability Ledger Hash</span>
                  <span className="font-mono text-[0.68rem] text-[#10251d]">
                    0x7a89f...b42c
                  </span>
                </div>
              </div>
            </div>

            {/* Card 2: Market & Spot Price Reference */}
            <div className="rounded-3xl border border-[#dfe7d8] bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2 text-[#2d6130]">
                <BarChart3 size={20} />
                <h3 className="font-bold text-[#10251d]">Cocoa Price Intelligence</h3>
              </div>
              <p className="mt-1 text-xs text-[#57655d]">
                Live farm-gate market rates and quality premiums in Southwest & Centre regions.
              </p>

              <div className="mt-4 space-y-3">
                <div className="rounded-2xl bg-[#062d22] p-4 text-white">
                  <span className="text-[0.68rem] uppercase font-semibold text-white/70">
                    Cameroon Farm-Gate Index
                  </span>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-2xl font-black text-[#b8f58b]">
                      FCFA 1,350
                    </span>
                    <span className="text-xs text-white/80">/ kg</span>
                  </div>
                  <span className="mt-1 block text-[0.68rem] text-[#b8f58b]">
                    ▲ +4.5% vs previous quarter (Main Crop)
                  </span>
                </div>

                <div className="rounded-2xl border border-[#edf1ea] bg-[#fafcf9] p-3 text-xs space-y-2">
                  <div className="flex justify-between">
                    <span className="text-[#57655d]">Grade 1 Fermented Premium</span>
                    <strong className="text-[#10251d]">+FCFA 120 / kg</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#57655d]">Rainforest Alliance Bonus</span>
                    <strong className="text-[#10251d]">+FCFA 85 / kg</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 3: Quick Action Resources */}
            <div className="rounded-3xl border border-[#dfe7d8] bg-white p-6 shadow-sm">
              <h3 className="font-bold text-[#10251d]">Farmer Support Resources</h3>
              <p className="mt-1 text-xs text-[#57655d]">
                Tools and guidance for complying with international export mandates.
              </p>

              <div className="mt-4 space-y-2 text-xs">
                <Link
                  href="/signup"
                  className="flex items-center justify-between rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-3 font-semibold text-[#10251d] hover:bg-[#edf3ea] transition"
                >
                  <span>Register Additional Farm Plot</span>
                  <ArrowRight size={14} />
                </Link>
                <Link
                  href="/marketplace"
                  className="flex items-center justify-between rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-3 font-semibold text-[#10251d] hover:bg-[#edf3ea] transition"
                >
                  <span>Browse Export Off-take Contracts</span>
                  <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </main>

      {/* Modal: Full Farm Dossier */}
      {selectedFarm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[32px] border border-[#dfe7d8] bg-white p-6 shadow-2xl sm:p-8">
            <div className="flex items-start justify-between border-b border-[#edf1ea] pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-[#edf7e8] px-2.5 py-0.5 text-[0.65rem] font-bold text-[#2d6130]">
                    EUDR TRACEABILITY DOSSIER
                  </span>
                  <span className="font-mono text-xs text-[#57655d]">
                    {selectedFarm.id}
                  </span>
                </div>
                <h2 className="mt-2 text-2xl font-bold text-[#10251d]">
                  {selectedFarm.farmName}
                </h2>
                <p className="text-xs text-[#57655d]">
                  {selectedFarm.village ? `${selectedFarm.village}, ` : ""}
                  {selectedFarm.lga || ""} • {selectedFarm.region}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedFarm(null)}
                className="rounded-full p-2 text-[#57655d] hover:bg-[#f7f8f3] cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mt-6 space-y-4 text-xs">
              {/* Section 1: Farmer & Co-op */}
              <div className="rounded-2xl bg-[#fafcf9] p-4 border border-[#edf1ea]">
                <h4 className="font-bold text-[#10251d] uppercase tracking-wider text-[0.68rem] mb-2 flex items-center gap-1.5">
                  <UserCheck size={14} className="text-[#2d6130]" /> Farmer Identity & Affiliation
                </h4>
                <div className="grid grid-cols-2 gap-3 text-[#394a41]">
                  <div>
                    <span className="text-[#6f7e73] block text-[0.65rem]">Farmer Full Name</span>
                    <strong className="text-[#10251d] text-sm">{selectedFarm.farmerName || "Registered Producer"}</strong>
                  </div>
                  <div>
                    <span className="text-[#6f7e73] block text-[0.65rem]">Cooperative Union</span>
                    <strong className="text-[#10251d] text-sm">{selectedFarm.cooperative || "SOWESCOP Cooperative"}</strong>
                  </div>
                  <div>
                    <span className="text-[#6f7e73] block text-[0.65rem]">Contact Phone</span>
                    <span className="text-[#10251d]">{selectedFarm.farmerPhone || "N/A"}</span>
                  </div>
                  <div>
                    <span className="text-[#6f7e73] block text-[0.65rem]">Contact Email</span>
                    <span className="text-[#10251d]">{selectedFarm.farmerEmail || "farmer@cocoatrace.cm"}</span>
                  </div>
                </div>
              </div>

              {/* Section 2: Farm Coordinates & Specs */}
              <div className="rounded-2xl bg-[#fafcf9] p-4 border border-[#edf1ea]">
                <h4 className="font-bold text-[#10251d] uppercase tracking-wider text-[0.68rem] mb-2 flex items-center gap-1.5">
                  <MapPin size={14} className="text-[#2d6130]" /> Geolocation & Physical Area
                </h4>
                <div className="grid grid-cols-2 gap-3 text-[#394a41]">
                  <div>
                    <span className="text-[#6f7e73] block text-[0.65rem]">GPS Coordinates</span>
                    <span className="font-mono font-bold text-[#2d6130]">{selectedFarm.geolocation}</span>
                  </div>
                  <div>
                    <span className="text-[#6f7e73] block text-[0.65rem]">Farm Area (Hectares)</span>
                    <strong className="text-[#10251d]">{selectedFarm.sizeHectares || 3.5} Ha</strong>
                  </div>
                  <div>
                    <span className="text-[#6f7e73] block text-[0.65rem]">Division & Locality</span>
                    <span className="text-[#10251d]">{selectedFarm.lga || "Ndian"}, {selectedFarm.village || "Ekondo-Titi"}</span>
                  </div>
                  <div>
                    <span className="text-[#6f7e73] block text-[0.65rem]">Region</span>
                    <span className="text-[#10251d]">{selectedFarm.region}</span>
                  </div>
                </div>
              </div>

              {/* Section 3: Harvest & Batches */}
              <div className="rounded-2xl bg-[#fafcf9] p-4 border border-[#edf1ea]">
                <h4 className="font-bold text-[#10251d] uppercase tracking-wider text-[0.68rem] mb-2 flex items-center gap-1.5">
                  <Layers size={14} className="text-[#2d6130]" /> Harvest Yield & Current Lot Code
                </h4>
                <div className="grid grid-cols-2 gap-3 text-[#394a41]">
                  <div>
                    <span className="text-[#6f7e73] block text-[0.65rem]">Current Batch Code</span>
                    <span className="font-mono font-bold text-[#2d6130]">{selectedFarm.batchNumber || "BATCH-01"}</span>
                  </div>
                  <div>
                    <span className="text-[#6f7e73] block text-[0.65rem]">Quantity Harvested</span>
                    <strong className="text-[#10251d]">{(selectedFarm.quantityHarvestedKg || 0).toLocaleString()} kg</strong>
                  </div>
                  <div>
                    <span className="text-[#6f7e73] block text-[0.65rem]">Cocoa Variety</span>
                    <span className="text-[#10251d]">{selectedFarm.cocoaVariety || "High-Yield F1 Hybrid"}</span>
                  </div>
                  <div>
                    <span className="text-[#6f7e73] block text-[0.65rem]">Harvest Season</span>
                    <span className="text-[#10251d]">{selectedFarm.harvestSeason || "Main Crop 2026/2027"}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-[#6f7e73] block text-[0.65rem]">Custody Route Corridor</span>
                    <p className="mt-0.5 text-xs text-[#10251d]">{selectedFarm.batchMovementRoute || "Farm Gate → Buying Station → Douala Port"}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setCertificateModalFarm(selectedFarm);
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#2d6130]/40 bg-[#edf7e8] px-5 py-2.5 text-xs font-bold text-[#1b4e28] transition hover:bg-[#dff0d8] cursor-pointer"
              >
                <QrCode size={14} /> Download Authenticity Certificate
              </button>

              <button
                type="button"
                onClick={() => setSelectedFarm(null)}
                className="rounded-full bg-[#0b3528] px-6 py-2.5 text-xs font-bold text-white transition hover:bg-[#07241b] cursor-pointer"
              >
                Close Dossier
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Official Downloadable Farm Authenticity Certificate Modal */}
      <FarmCertificateModal
        farm={certificateModalFarm}
        isOpen={Boolean(certificateModalFarm)}
        onClose={() => setCertificateModalFarm(null)}
      />

      {/* Modal: Add Batch Intake */}
      {showBatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[32px] border border-[#dfe7d8] bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#edf1ea] pb-3">
              <div>
                <span className="text-[0.68rem] font-bold uppercase tracking-wider text-[#2d6130]">
                  Harvest Intake
                </span>
                <h3 className="text-lg font-bold text-[#10251d]">
                  Record Harvest for {showBatchModal.farmName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowBatchModal(null)}
                className="rounded-full p-1.5 text-[#57655d] hover:bg-[#f7f8f3] cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {batchSuccess ? (
              <div className="my-6 rounded-2xl bg-[#edf7e8] p-4 text-center text-xs text-[#1a4936]">
                <CheckCircle2 size={24} className="mx-auto mb-2 text-[#2a7a33]" />
                <p className="font-bold">Harvest Batch Successfully Recorded!</p>
                <p className="text-[0.7rem] text-[#2a5933] mt-0.5">Updated farm total volume.</p>
              </div>
            ) : (
              <form onSubmit={handleAddBatch} className="mt-4 space-y-4 text-xs">
                <label className="block text-sm font-medium text-[#10251d]">
                  <span className="mb-1 block text-xs font-semibold text-[#48574c]">Batch / Lot Code</span>
                  <input
                    type="text"
                    required
                    value={batchCode}
                    onChange={(e) => setBatchCode(e.target.value)}
                    placeholder="e.g. BATCH-CR-2026-088"
                    className="w-full rounded-2xl border border-[#dfe7d8] bg-white px-3.5 py-2.5 font-mono text-xs text-[#10251d] outline-none"
                  />
                </label>

                <label className="block text-sm font-medium text-[#10251d]">
                  <span className="mb-1 block text-xs font-semibold text-[#48574c]">Additional Quantity Harvested (kg) *</span>
                  <input
                    type="number"
                    required
                    min="1"
                    value={batchQty}
                    onChange={(e) => setBatchQty(e.target.value)}
                    placeholder="e.g. 750"
                    className="w-full rounded-2xl border border-[#dfe7d8] bg-white px-3.5 py-2.5 text-xs text-[#10251d] outline-none"
                  />
                </label>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowBatchModal(null)}
                    className="flex-1 rounded-2xl border border-[#dfe7d8] px-4 py-2.5 font-semibold text-[#57655d] hover:bg-[#f7f8f3] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 rounded-2xl bg-[#0b3528] px-4 py-2.5 font-bold text-white transition hover:bg-[#07241b] cursor-pointer"
                  >
                    Save Batch
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
