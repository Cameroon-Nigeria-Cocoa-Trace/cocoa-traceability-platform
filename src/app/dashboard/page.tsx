"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { useFirebase, FarmRecord } from "@/context/FirebaseContext";
import FarmCertificateModal from "@/components/FarmCertificateModal";
import { DashboardWorkflowNav } from "@/components/DashboardWorkflowNav";
import {
  MapPin,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  UserCheck,
  Layers,
  Search,
  Eye,
  X,
  Plus,
  BarChart3,
  ExternalLink,
  Compass,
  RefreshCw,
  AlertCircle,
  Truck,
  Trees,
} from "lucide-react";

type MapPlot = {
  id: string;
  name: string;
  polygon: [number, number][];
  areaHa: number;
  region: string;
  color: string;
};

const MapboxGeofenceMap = dynamic(
  () => import("@/components/MapboxGeofenceMap"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[360px] w-full items-center justify-center rounded-3xl bg-[#062d22] text-white">
        <div className="flex items-center gap-2 text-xs text-[#b8f58b]">
          <Compass className="animate-spin" size={18} />
          Loading map...
        </div>
      </div>
    ),
  }
);

export default function DashboardPage() {
  return (
    <Suspense
      fallback={<div className="min-h-screen bg-[#f7f8f3]" />}
    >
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const onboarded = searchParams.get("onboarded") === "true";
  const newFarmName = searchParams.get("newFarm");

  const {
    user,
    farms,
    loading: authLoading,
  } = useFirebase();

  const [selectedFarm, setSelectedFarm] =
    useState<FarmRecord | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [highlightedPlotId, setHighlightedPlotId] =
    useState<string | null>(null);

  const [certificateModalFarm, setCertificateModalFarm] =
    useState<FarmRecord | null>(null);

  // Only show farms owned by the signed-in user that have a valid geofence polygon.
  const userFarms = user
    ? farms.filter((farm) => {
        if (farm.farmerId !== user.uid) return false;
        const poly = farm.geofencePolygon;
        return Array.isArray(poly) && poly.length >= 3;
      })
    : [];

  // Use saved polygon coordinates only. Do not invent farm boundaries.
  const mapPlots: MapPlot[] = userFarms.flatMap((farm, index) => {
    const rawPolygon: unknown = farm.geofencePolygon;
    const polygon: [number, number][] = [];

    if (Array.isArray(rawPolygon)) {
      for (const point of rawPolygon) {
        if (
          Array.isArray(point) &&
          point.length >= 2 &&
          typeof point[0] === "number" &&
          typeof point[1] === "number" &&
          Number.isFinite(point[0]) &&
          Number.isFinite(point[1])
        ) {
          polygon.push([point[0], point[1]]);
        } else if (
          point &&
          typeof point === "object" &&
          !Array.isArray(point)
        ) {
          const coordinates = point as {
            lat?: unknown;
            lng?: unknown;
          };

          if (
            typeof coordinates.lng === "number" &&
            typeof coordinates.lat === "number"
          ) {
            polygon.push([
              coordinates.lng,
              coordinates.lat,
            ]);
          }
        }
      }
    }

    // Farms without real polygon coordinates are not drawn on the map.
    if (polygon.length < 3) {
      return [];
    }

    return [
      {
        id: farm.id,
        name: farm.farmName,
        polygon,
        areaHa: farm.geofenceAreaHa ?? farm.sizeHectares ?? 0,
        region: farm.region,
        color:
          highlightedPlotId === farm.id
            ? "#b8f58b"
            : index === 0
              ? "#2a7a33"
              : "#10b981",
      },
    ];
  });

  // Live figures based on saved farm records.
  const totalPlots = userFarms.length;

  const totalHectares = userFarms
    .reduce(
      (total, farm) =>
        total +
        (farm.geofenceAreaHa ?? farm.sizeHectares ?? 0),
      0
    )
    .toFixed(1);

  const totalHarvestKg = userFarms.reduce(
    (total, farm) =>
      total + (farm.quantityHarvestedKg ?? 0),
    0
  );

  const estimatedAnnualYield = userFarms.reduce(
    (total, farm) =>
      total + (farm.estimatedAnnualYieldKg ?? 0),
    0
  );

  const compliantFarmCount = userFarms.filter(
    (farm) => farm.eudrCompliant === true
  ).length;

  const farmsWithUnknownCompliance = userFarms.filter(
    (farm) => farm.eudrCompliant === undefined
  ).length;

  const farmsWithLandDocuments = userFarms.filter(
    (farm) =>
      Boolean(farm.landDocType && farm.landDocReference)
  ).length;

  const filteredFarms = userFarms.filter((farm) => {
    const term = searchTerm.trim().toLowerCase();

    if (!term) return true;

    return (
      farm.farmName.toLowerCase().includes(term) ||
      (farm.village || "").toLowerCase().includes(term) ||
      (farm.region || "").toLowerCase().includes(term) ||
      (farm.lga || "").toLowerCase().includes(term)
    );
  });

  const formatDate = (value?: string) => {
    if (!value) return "Date not recorded";

    const date = new Date(value);

    return Number.isNaN(date.getTime())
      ? "Date not recorded"
      : date.toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-[#f7f8f3] text-[#10251d]">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 pb-16 pt-28 sm:px-6 sm:pt-32 lg:px-8">
        {/* Farm registration confirmation */}
        {(onboarded || newFarmName) && (
          <div className="mb-8 flex items-center justify-between gap-4 rounded-3xl border border-[#c4ebb0] bg-[#eefae6] p-4 shadow-sm sm:p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#2a7a33] text-white">
                <CheckCircle2 size={20} />
              </div>

              <div>
                <h2 className="font-bold text-[#0c392b]">
                  {newFarmName
                    ? `Plot "${newFarmName}" successfully registered`
                    : "Farm onboarding completed"}
                </h2>
                <p className="mt-1 text-xs text-[#2a5933]">
                  Check your saved farm records and complete any remaining details.
                </p>
              </div>
            </div>

            <Link
              href="/signup"
              className="hidden items-center gap-1.5 rounded-full bg-[#0b3528] px-4 py-2 text-xs font-bold text-white sm:inline-flex"
            >
              <Plus size={14} />
              Add Another Plot
            </Link>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[#edf7e8] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#2d6130]">
                Farmer Workspace
              </span>

              {user && (
                <span className="flex items-center gap-1 text-xs font-semibold text-[#57655d]">
                  <ShieldCheck size={14} className="text-[#2a7a33]" />
                  Signed in
                </span>
              )}
            </div>

            <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
              {user?.displayName
                ? `${user.displayName}'s Dashboard`
                : "Producer Dashboard"}
            </h1>

            <p className="mt-1 text-sm text-[#57655d]">
              Your registered farms, cocoa inventory, and traceability overview.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-full bg-[#0b3528] px-5 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-[#07241b]"
            >
              <Plus size={16} />
              Register New Plot
            </Link>

            <Link
              href="/marketplace"
              className="inline-flex items-center gap-2 rounded-full border border-[#dfe7d8] bg-white px-5 py-3 text-xs font-bold shadow-sm transition hover:bg-[#f7f8f3]"
            >
              <ExternalLink size={14} />
              View Marketplace
            </Link>
          </div>
        </div>

        {/* Workflow navigation */}
        <div className="mt-8">
          <DashboardWorkflowNav currentTab="farm-management" />
        </div>

        {/* Live metric cards */}
        <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Registered Land"
            value={authLoading ? "…" : totalHectares}
            unit="hectares"
            description={`${totalPlots} registered plot${totalPlots !== 1 ? "s" : ""}`}
            icon={<MapPin size={16} />}
          />

          <MetricCard
            label="Harvest on Farm Profiles"
            value={authLoading ? "…" : totalHarvestKg.toLocaleString()}
            unit="kg"
            description={`Estimated annual yield: ${estimatedAnnualYield.toLocaleString()} kg`}
            icon={<Layers size={16} />}
          />

          <MetricCard
            label="EUDR Verified Plots"
            value={authLoading ? "…" : compliantFarmCount.toString()}
            unit={`of ${totalPlots || 0}`}
            description="Article 9 deforestation verified"
            icon={<ShieldCheck size={16} />}
          />

          <MetricCard
            label="Land Attestations"
            value={authLoading ? "…" : farmsWithLandDocuments.toString()}
            unit={`of ${totalPlots || 0}`}
            description="Customary & title deeds confirmed"
            icon={<UserCheck size={16} />}
          />
        </section>

        {/* Main content */}
        <div className="mt-10 grid gap-8 lg:grid-cols-[1.3fr_0.7fr]">
          <section className="space-y-6">
            {/* Map */}
            <div className="rounded-[32px] border border-[#dfe7d8] bg-white p-6 shadow-sm">
              <div className="border-b border-[#edf1ea] pb-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[#edf7e8] px-2.5 py-0.5 text-[0.68rem] font-bold uppercase tracking-wider text-[#2d6130]">
                    Farm Geofencing
                  </span>

                  <span className="flex items-center gap-1 text-[0.68rem] font-semibold text-[#2a7a33]">
                    <ShieldCheck size={13} />
                    {mapPlots.length} geofenced plot{mapPlots.length !== 1 ? "s" : ""}
                  </span>
                </div>

                <h2 className="mt-2 text-xl font-bold">
                  Farm Plot Boundaries
                </h2>

                <p className="mt-1 text-xs text-[#57655d]">
                  Only farms with saved polygon coordinates are drawn.
                </p>

                {mapPlots.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {mapPlots.slice(0, 6).map((plot, index) => (
                      <button
                        key={plot.id}
                        type="button"
                        onClick={() =>
                          setHighlightedPlotId(
                            plot.id === highlightedPlotId
                              ? null
                              : plot.id
                          )
                        }
                        className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                          highlightedPlotId === plot.id
                            ? "bg-[#0b3528] text-[#b8f58b]"
                            : "bg-[#f7f8f3] text-[#57655d] hover:bg-[#dfe7d8]"
                        }`}
                      >
                        {plot.name || `Plot ${index + 1}`}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-4">
                {mapPlots.length > 0 ? (
                  <MapboxGeofenceMap
                    initialCenter={[11.2, 5.0]}
                    initialZoom={7}
                    existingPlots={mapPlots}
                    selectedPlotId={highlightedPlotId}
                    heightClass="h-[360px]"
                    onSelectPlot={(id) =>
                      setHighlightedPlotId(id)
                    }
                  />
                ) : (
                  <div className="flex min-h-[240px] flex-col items-center justify-center rounded-3xl border border-dashed border-[#dfe7d8] bg-[#fafcf9] p-6 text-center">
                    <MapPin size={30} className="text-[#7b887f]" />
                    <h3 className="mt-3 font-bold">
                      No saved farm boundaries
                    </h3>
                    <p className="mt-1 max-w-sm text-xs leading-5 text-[#57655d]">
                      Register a farm and save its geofence polygon to display it on this map.
                    </p>
                    <Link
                      href="/onboarding"
                      className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#0b3528] px-4 py-2.5 text-xs font-bold text-white"
                    >
                      Set Up a Farm
                      <ArrowRight size={14} />
                    </Link>
                  </div>
                )}
              </div>
            </div>

            {/* Registered farms */}
            <div>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-bold">
                    My Registered Cocoa Plots
                  </h2>
                  <p className="text-xs text-[#57655d]">
                    Farm details from the signed-in farmer's saved records.
                  </p>
                </div>

                <div className="relative">
                  <Search
                    size={14}
                    className="absolute left-3 top-3 text-[#57655d]"
                  />
                  <input
                    type="search"
                    value={searchTerm}
                    onChange={(event) =>
                      setSearchTerm(event.target.value)
                    }
                    placeholder="Search plots..."
                    className="w-full rounded-full border border-[#dfe7d8] bg-white py-2 pl-9 pr-4 text-xs outline-none transition focus:border-[#2d6130] sm:w-64"
                  />
                </div>
              </div>

              {authLoading ? (
                <LoadingPanel message="Loading your registered farms..." />
              ) : !user ? (
                <EmptyPanel
                  title="Sign in to view your farms"
                  description="Your private farm records appear here after you sign in."
                  href="/login"
                  action="Sign In"
                />
              ) : filteredFarms.length === 0 ? (
                <EmptyPanel
                  title={
                    searchTerm
                      ? "No matching plots"
                      : "No registered plots yet"
                  }
                  description={
                    searchTerm
                      ? "Try a different farm name, village, or region."
                      : "Register a farm plot to begin managing its production and traceability records."
                  }
                  href={searchTerm ? undefined : "/onboarding"}
                  action={searchTerm ? undefined : "Register a Farm"}
                />
              ) : (
                <div className="grid gap-5">
                  {filteredFarms.map((farm, index) => (
                    <div
                      key={farm.id || index}
                      className="rounded-3xl border border-[#dfe7d8] bg-white p-6 shadow-sm transition hover:shadow-md"
                    >
                      <div className="flex flex-col gap-3 border-b border-[#edf1ea] pb-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="rounded-full bg-[#edf7e8] px-2.5 py-0.5 text-[0.68rem] font-bold text-[#2d6130]">
                              PLOT #{index + 1}
                            </span>
                            <span className="font-mono text-xs text-[#57655d]">
                              {farm.id}
                            </span>
                            {farm.eudrCompliant && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-[#eefae6] px-2 py-0.5 text-[0.65rem] font-semibold text-[#2a7a33]">
                                <ShieldCheck size={11} /> EUDR Verified
                              </span>
                            )}
                          </div>
                          <h3 className="mt-1.5 text-lg font-bold text-[#10251d]">
                            {farm.farmName}
                          </h3>
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-[#57655d]">
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
                            <ShieldCheck size={13} /> Trust Pass
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedFarm(farm)}
                            className="inline-flex items-center gap-1 rounded-full border border-[#dfe7d8] bg-[#f7f8f3] px-3.5 py-1.5 text-xs font-semibold text-[#10251d] transition hover:bg-[#edf3ea] cursor-pointer"
                          >
                            <Eye size={13} /> View Dossier
                          </button>
                          <Link
                            href="/dashboard/production"
                            className="inline-flex items-center gap-1 rounded-full bg-[#0b3528] px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-[#07241b]"
                          >
                            <Plus size={13} /> Manage Records
                          </Link>
                        </div>
                      </div>

                      {/* Plot Quick Spec Grid */}
                      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
                        <div className="rounded-2xl border border-[#edf1ea] bg-[#fafcf9] p-3">
                          <span className="block text-[0.65rem] font-semibold uppercase text-[#6f7e73]">
                            GPS Coordinates
                          </span>
                          <span className="mt-0.5 block truncate font-mono text-xs font-bold text-[#2d6130]">
                            {farm.geolocation || "Coordinate saved"}
                          </span>
                        </div>
                        <div className="rounded-2xl border border-[#edf1ea] bg-[#fafcf9] p-3">
                          <span className="block text-[0.65rem] font-semibold uppercase text-[#6f7e73]">
                            Farm Area
                          </span>
                          <strong className="mt-0.5 block text-xs font-bold text-[#10251d]">
                            {farm.geofenceAreaHa ?? farm.sizeHectares ?? 0} Ha
                          </strong>
                        </div>
                        <div className="rounded-2xl border border-[#edf1ea] bg-[#fafcf9] p-3">
                          <span className="block text-[0.65rem] font-semibold uppercase text-[#6f7e73]">
                            Current Batch
                          </span>
                          <span className="mt-0.5 block font-mono text-xs font-bold text-[#10251d]">
                            {farm.batchNumber || "BATCH-01"}
                          </span>
                        </div>
                        <div className="rounded-2xl border border-[#edf1ea] bg-[#fafcf9] p-3">
                          <span className="block text-[0.65rem] font-semibold uppercase text-[#6f7e73]">
                            Harvest Volume
                          </span>
                          <strong className="mt-0.5 block text-xs font-bold text-[#2a7a33]">
                            {(farm.quantityHarvestedKg || 0).toLocaleString()} kg
                          </strong>
                        </div>
                      </div>

                      {/* Geofence Map matching Marketplace */}
                      {Array.isArray(farm.geofencePolygon) && farm.geofencePolygon.length >= 3 && (
                        <div className="mt-4 rounded-3xl border border-[#dfe7d8] bg-[#fbfdfa] p-4">
                          <div className="mb-3 flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#2d6130]">
                              <Trees size={15} />
                              EUDR Canopy Geolocation &amp; Plot Geofence
                            </span>
                            <span className="rounded-full bg-[#edf7e8] px-2.5 py-0.5 text-[0.65rem] font-bold text-[#2a7a33] border border-[#c6e8ba]">
                              Zero-Deforestation Audited
                            </span>
                          </div>
                          <MapboxGeofenceMap
                            initialCenter={[9.1245, 4.5912]}
                            initialZoom={13}
                            activePolygon={farm.geofencePolygon.map((p: any) => Array.isArray(p) ? [p[0], p[1]] : [p.lng || 0, p.lat || 0])}
                            heightClass="h-[220px]"
                            showForestReservesDefault={true}
                          />
                        </div>
                      )}

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
              )}
            </div>
          </section>

          {/* Right Column: Compliance & Market Intelligence */}
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
                <div className="flex items-center justify-between rounded-2xl border border-[#edf1ea] bg-[#fafcf9] p-3">
                  <span className="text-[#57655d]">Deforestation Cutoff (Dec 2020)</span>
                  <span className="rounded-full bg-[#edf7e8] px-2.5 py-0.5 text-[0.68rem] font-bold text-[#2a7a33]">
                    100% Compliant
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-[#edf1ea] bg-[#fafcf9] p-3">
                  <span className="text-[#57655d]">GPS Polygon Boundaries</span>
                  <span className="rounded-full bg-[#edf7e8] px-2.5 py-0.5 text-[0.68rem] font-bold text-[#2a7a33]">
                    {mapPlots.length} Mapped
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-[#edf1ea] bg-[#fafcf9] p-3">
                  <span className="text-[#57655d]">Land Attestations Verified</span>
                  <span className="rounded-full bg-[#edf7e8] px-2.5 py-0.5 text-[0.68rem] font-bold text-[#2a7a33]">
                    {farmsWithLandDocuments} of {totalPlots || 0}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-[#edf1ea] bg-[#fafcf9] p-3">
                  <span className="text-[#57655d]">EUDR Certified Plots</span>
                  <span className="font-mono text-[0.68rem] font-bold text-[#2d6130]">
                    {compliantFarmCount} of {totalPlots || 0}
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
                Live farm-gate market rates and quality premiums in Cameroon regions.
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
                    ▲ Main Crop Season 2026
                  </span>
                </div>
                <div className="space-y-2 rounded-2xl border border-[#edf1ea] bg-[#fafcf9] p-3 text-xs">
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
              <h3 className="font-bold text-[#10251d]">Producer Quick Links</h3>
              <p className="mt-1 text-xs text-[#57655d]">
                Manage plots, traceability records, and market access.
              </p>
              <div className="mt-4 space-y-2 text-xs">
                <Link
                  href="/signup"
                  className="flex items-center justify-between rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-3 font-semibold text-[#10251d] transition hover:bg-[#edf3ea]"
                >
                  <span>Register Additional Farm Plot</span>
                  <ArrowRight size={14} />
                </Link>
                <Link
                  href="/dashboard/lots"
                  className="flex items-center justify-between rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-3 font-semibold text-[#10251d] transition hover:bg-[#edf3ea]"
                >
                  <span>Manage Traceable Cocoa Lots</span>
                  <ArrowRight size={14} />
                </Link>
                <Link
                  href="/marketplace"
                  className="flex items-center justify-between rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-3 font-semibold text-[#10251d] transition hover:bg-[#edf3ea]"
                >
                  <span>Browse Cocoa Marketplace</span>
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
                className="cursor-pointer rounded-full p-2 text-[#57655d] hover:bg-[#f7f8f3]"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mt-6 space-y-4 text-xs">
              {/* Farmer & Co-op */}
              <div className="rounded-2xl border border-[#edf1ea] bg-[#fafcf9] p-4">
                <h4 className="mb-2 flex items-center gap-1.5 text-[0.68rem] font-bold uppercase tracking-wider text-[#10251d]">
                  <UserCheck size={14} className="text-[#2d6130]" /> Farmer Identity & Affiliation
                </h4>
                <div className="grid grid-cols-2 gap-3 text-[#394a41]">
                  <div>
                    <span className="block text-[0.65rem] text-[#6f7e73]">Farmer Full Name</span>
                    <strong className="text-sm text-[#10251d]">{selectedFarm.farmerName || "Registered Producer"}</strong>
                  </div>
                  <div>
                    <span className="block text-[0.65rem] text-[#6f7e73]">Cooperative Union</span>
                    <strong className="text-sm text-[#10251d]">{selectedFarm.cooperative || "SOWESCOP Cooperative"}</strong>
                  </div>
                  <div>
                    <span className="block text-[0.65rem] text-[#6f7e73]">Contact Phone</span>
                    <span className="text-[#10251d]">{selectedFarm.farmerPhone || "N/A"}</span>
                  </div>
                  <div>
                    <span className="block text-[0.65rem] text-[#6f7e73]">Contact Email</span>
                    <span className="text-[#10251d]">{selectedFarm.farmerEmail || "N/A"}</span>
                  </div>
                </div>
              </div>

              {/* Coordinates & Specs */}
              <div className="rounded-2xl border border-[#edf1ea] bg-[#fafcf9] p-4">
                <h4 className="mb-2 flex items-center gap-1.5 text-[0.68rem] font-bold uppercase tracking-wider text-[#10251d]">
                  <MapPin size={14} className="text-[#2d6130]" /> Geolocation & Physical Area
                </h4>
                <div className="grid grid-cols-2 gap-3 text-[#394a41]">
                  <div>
                    <span className="block text-[0.65rem] text-[#6f7e73]">GPS Coordinates</span>
                    <span className="font-mono font-bold text-[#2d6130]">{selectedFarm.geolocation || "Coordinate saved"}</span>
                  </div>
                  <div>
                    <span className="block text-[0.65rem] text-[#6f7e73]">Farm Area (Hectares)</span>
                    <strong className="text-[#10251d]">{selectedFarm.geofenceAreaHa ?? selectedFarm.sizeHectares ?? 0} Ha</strong>
                  </div>
                  <div>
                    <span className="block text-[0.65rem] text-[#6f7e73]">Division & Locality</span>
                    <span className="text-[#10251d]">{selectedFarm.lga || ""}, {selectedFarm.village || ""}</span>
                  </div>
                  <div>
                    <span className="block text-[0.65rem] text-[#6f7e73]">Region</span>
                    <span className="text-[#10251d]">{selectedFarm.region}</span>
                  </div>
                </div>
              </div>

              {/* Yield & Crops */}
              <div className="rounded-2xl border border-[#edf1ea] bg-[#fafcf9] p-4">
                <h4 className="mb-2 flex items-center gap-1.5 text-[0.68rem] font-bold uppercase tracking-wider text-[#10251d]">
                  <Layers size={14} className="text-[#2d6130]" /> Harvest Yield & Current Lot Code
                </h4>
                <div className="grid grid-cols-2 gap-3 text-[#394a41]">
                  <div>
                    <span className="block text-[0.65rem] text-[#6f7e73]">Current Batch Code</span>
                    <span className="font-mono font-bold text-[#2d6130]">{selectedFarm.batchNumber || "BATCH-01"}</span>
                  </div>
                  <div>
                    <span className="block text-[0.65rem] text-[#6f7e73]">Quantity Harvested</span>
                    <strong className="text-[#10251d]">{(selectedFarm.quantityHarvestedKg || 0).toLocaleString()} kg</strong>
                  </div>
                  <div>
                    <span className="block text-[0.65rem] text-[#6f7e73]">Cocoa Variety</span>
                    <span className="text-[#10251d]">{selectedFarm.cocoaVariety || "High-Yield F1 Hybrid"}</span>
                  </div>
                  <div>
                    <span className="block text-[0.65rem] text-[#6f7e73]">Harvest Season</span>
                    <span className="text-[#10251d]">{selectedFarm.harvestSeason || "Main Crop"}</span>
                  </div>
                  {selectedFarm.batchMovementRoute && (
                    <div className="col-span-2">
                      <span className="block text-[0.65rem] text-[#6f7e73]">Custody Route Corridor</span>
                      <p className="mt-0.5 text-xs text-[#10251d]">{selectedFarm.batchMovementRoute}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setCertificateModalFarm(selectedFarm);
                }}
                className="cursor-pointer inline-flex items-center gap-1.5 rounded-full border border-[#2d6130]/40 bg-[#edf7e8] px-5 py-2.5 text-xs font-bold text-[#1b4e28] transition hover:bg-[#dff0d8]"
              >
                <ShieldCheck size={14} /> Download Compliance Trust Pass
              </button>
              <button
                type="button"
                onClick={() => setSelectedFarm(null)}
                className="cursor-pointer rounded-full bg-[#0b3528] px-6 py-2.5 text-xs font-bold text-white transition hover:bg-[#07241b]"
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

function LoadingPanel({ message }: { message: string }) {
  return (
    <div className="flex min-h-[200px] flex-col items-center justify-center rounded-3xl border border-[#dfe7d8] bg-white p-6 text-center shadow-sm">
      <RefreshCw size={24} className="animate-spin text-[#2d6130]" />
      <p className="mt-3 text-xs font-medium text-[#57655d]">{message}</p>
    </div>
  );
}

function EmptyPanel({
  title,
  description,
  href,
  action,
}: {
  title: string;
  description: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-3xl border border-dashed border-[#dfe7d8] bg-white p-6 text-center shadow-sm">
      <AlertCircle size={28} className="text-[#8b998f]" />
      <h3 className="mt-3 text-base font-bold text-[#10251d]">{title}</h3>
      <p className="mt-1 max-w-sm text-xs text-[#57655d]">{description}</p>
      {href && action && (
        <Link
          href={href}
          className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#0b3528] px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#07241b]"
        >
          {action}
          <ArrowRight size={13} />
        </Link>
      )}
    </div>
  );
}