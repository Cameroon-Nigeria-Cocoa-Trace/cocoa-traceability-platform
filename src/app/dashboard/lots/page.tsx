/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { DashboardWorkflowNav } from "@/components/DashboardWorkflowNav";
import { useFirebase } from "@/context/FirebaseContext";
import { createCocoaApiClient, CocoaApiError } from "@/lib/cocoaApiClient";
import { CocoaLot } from "@/types/traceability";
import {
  Boxes,
  Plus,
  MapPin,
  Calendar,
  Layers,
  ShieldCheck,
  Tag,
  RefreshCw,
  AlertCircle,
  ArrowRight,
  ExternalLink,
  Eye,
  CheckCircle2,
} from "lucide-react";

export default function CocoaLotsPage() {
  const { user, farms, loading: authLoading } = useFirebase();

  const apiClient = useMemo(() => {
    return createCocoaApiClient(async () => {
      if (!user) return null;
      return await user.getIdToken();
    });
  }, [user]);

  // Only display farms owned by the authenticated user.
  const userFarms = useMemo(() => {
    if (!user) return [];

    return farms.filter(
      (farm) => farm.farmerId === user.uid
    );
  }, [farms, user]);

  const [selectedFarmId, setSelectedFarmId] = useState<string>("");
  const [lots, setLots] = useState<CocoaLot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedLotForPreview, setSelectedLotForPreview] = useState<CocoaLot | null>(null);
  // Prevent older requests from overwriting newer selections.
  const lotsRequestVersion = useRef(0);

  // Initialize farm
  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setSelectedFarmId("");
      setLots([]);
      setSelectedLotForPreview(null);
      setError(null);
      setLoading(false);
      return;
    }

    const selectedFarmIsAccessible = userFarms.some(
      (farm) => farm.id === selectedFarmId
    );

    if (selectedFarmId && !selectedFarmIsAccessible) {
      setSelectedFarmId(userFarms[0]?.id ?? "");
      setLots([]);
      setSelectedLotForPreview(null);
      setError(null);
      return;
    }

    if (!selectedFarmId && userFarms.length > 0) {
      setSelectedFarmId(userFarms[0].id);
    }
  }, [
    authLoading,
    user,
    userFarms,
    selectedFarmId,
  ]);

  // Fetch cocoa lots for selected farm
  const loadLots = useCallback(async () => {
    const requestId = ++lotsRequestVersion.current;

    if (!selectedFarmId || !user?.uid) {
      setLots([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setLots([]);

    try {
      const res = await apiClient.get<{
        success: boolean;
        lots: CocoaLot[];
      }>("/api/cocoa-lots", {
        params: { farmId: selectedFarmId },
      });

      if (requestId !== lotsRequestVersion.current) return;

      setLots(
        Array.isArray(res?.lots) ? res.lots : []
      );
    } catch (err: unknown) {
      if (requestId !== lotsRequestVersion.current) return;

      if (err instanceof CocoaApiError) {
        setError(err.message);
      } else {
        setError("Failed to load cocoa lots for the selected farm.");
      }

      setLots([]);
    } finally {
      if (requestId === lotsRequestVersion.current) {
        setLoading(false);
      }
    }
  }, [selectedFarmId, apiClient, user?.uid]);

  useEffect(() => {
    void loadLots();

    return () => {
      lotsRequestVersion.current += 1;
    };
  }, [loadLots]);

  const selectedFarm = useMemo(() => {
    return userFarms.find((f) => f.id === selectedFarmId) || userFarms[0] || null;
  }, [userFarms, selectedFarmId]);

  return (
    <div className="min-h-screen bg-[#f7f8f3] text-[#10251d]">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 pt-28 pb-16 sm:px-6 sm:pt-32 lg:px-8">
        <DashboardWorkflowNav currentTab="production-inventory" />

        {/* Top Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[#edf7e8] px-3 py-1 text-xs font-bold text-[#2d6130] uppercase tracking-wider">
                Production & Inventory
              </span>
              <span className="text-xs font-semibold text-[#57655d]">
                Stage 2 Capability
              </span>
            </div>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-[#10251d] sm:text-4xl">
              Traceable Cocoa Lots
            </h1>
            <p className="mt-1 text-sm text-[#57655d]">
              Audited cocoa lots allocated from verified harvests with mandatory visual references and lot codes.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/lots/create"
              className="inline-flex items-center gap-2 rounded-full bg-[#0b3528] px-5 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-[#07241b]"
            >
              <Plus size={16} /> Register Cocoa Lot
            </Link>
          </div>
        </div>

        {/* Farm Selector Banner */}
        <div className="mb-8 rounded-3xl border border-[#dfe7d8] bg-white p-5 sm:p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#edf7e8] text-[#2d6130]">
                <MapPin size={22} />
              </div>
              <div>
                <label htmlFor="farmSelect" className="block text-xs font-bold text-[#6f7e73] uppercase tracking-wider">
                  Target Farm Plot
                </label>
                <select
                  id="farmSelect"
                  value={selectedFarmId}
                  onChange={(e) => {
                    setSelectedFarmId(e.target.value);
                    setLots([]);
                    setSelectedLotForPreview(null);
                    setError(null);
                  }}
                  className="mt-1 rounded-xl border border-[#dfe7d8] bg-[#fafcf9] px-3 py-1.5 text-sm font-bold text-[#10251d] outline-none focus:border-[#2d6130] cursor-pointer"
                >
                  {userFarms.map((farm) => (
                    <option key={farm.id} value={farm.id}>
                      {farm.farmName} — {farm.region} ({farm.sizeHectares || 3.5} Ha)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs text-[#57655d]">
              <div>
                <span className="block text-[10px] text-[#6f7e73] uppercase">Active Lots</span>
                <span className="font-bold text-[#10251d]">{lots.length} lot(s)</span>
              </div>
              <div className="h-6 w-px bg-[#edf1ea]" />
              <div>
                <span className="block text-[10px] text-[#6f7e73] uppercase">Total Inventory</span>
                <span className="font-bold text-[#2d6130]">
                  {lots.reduce((acc, l) => acc + (l.quantityKg || 0), 0).toLocaleString()} kg
                </span>
              </div>
              <button
                type="button"
                onClick={() => loadLots()}
                className="p-2 text-[#57655d] hover:text-[#10251d] hover:bg-slate-100 rounded-xl transition cursor-pointer"
                title="Refresh Lots"
              >
                <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
              </button>
            </div>
          </div>
        </div>

        {/* Cocoa Lots Grid */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-[#dfe7d8]">
            <div className="h-8 w-8 rounded-full border-2 border-[#062d22] border-t-[#b8f58b] animate-spin" />
            <p className="mt-3 text-xs text-[#57655d] font-medium">Loading traceable cocoa lots...</p>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-xs text-red-800">
            <AlertCircle size={24} className="mx-auto text-red-600 mb-2" />
            <p className="font-bold text-sm">Failed to Load Cocoa Lots</p>
            <p className="mt-1 text-red-700">{error}</p>
          </div>
        ) : lots.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-[#dfe7d8] bg-white p-12 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#edf7e8] text-[#2d6130] mb-3">
              <Boxes size={28} />
            </div>
            <h3 className="text-base font-bold text-[#10251d]">No Cocoa Lots Created Yet</h3>
            <p className="mt-1 text-xs text-[#57655d] max-w-md mx-auto">
              Allocate your harvested cocoa into identifiable, traceable lots with mandatory Cloudinary visual references for downstream certification and trade.
            </p>
            <Link
              href="/dashboard/lots/create"
              className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#0b3528] px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#07241b]"
            >
              <Plus size={14} /> Register Cocoa Lot
            </Link>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {lots.map((lot) => (
              <article
                key={lot.lotId}
                className="rounded-3xl border border-[#dfe7d8] bg-white overflow-hidden shadow-sm hover:shadow-md transition flex flex-col justify-between"
              >
                <div>
                  {/* Image Card Header */}
                  <div className="relative h-44 w-full bg-slate-900 overflow-hidden">
                    {lot.cocoaImage?.secureUrl || lot.cocoaImage?.url ? (
                      <img
                        src={lot.cocoaImage.secureUrl || lot.cocoaImage.url}
                        alt={lot.lotNumber}
                        className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-slate-800 text-white/50 text-xs">
                        No Image Available
                      </div>
                    )}
                    <div className="absolute top-3 left-3">
                      <span className="rounded-full bg-black/60 backdrop-blur-md px-3 py-1 font-mono text-[10px] font-bold text-white">
                        {lot.lotNumber}
                      </span>
                    </div>
                    <div className="absolute top-3 right-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase backdrop-blur-md ${
                          lot.lotStatus === "created"
                            ? "bg-[#edf7e8]/90 text-[#2d6130]"
                            : lot.lotStatus === "certified"
                            ? "bg-blue-100/90 text-blue-900"
                            : "bg-slate-100/90 text-slate-800"
                        }`}
                      >
                        {lot.lotStatus}
                      </span>
                    </div>
                  </div>

                  {/* Body Content */}
                  <div className="p-5">
                    <div className="flex items-center justify-between text-xs text-[#57655d] mb-1">
                      <span>{lot.originCountry} Origin</span>
                      <span className="font-semibold text-[#10251d]">
                        {lot.qualityGrade || "Grade 1"}
                      </span>
                    </div>

                    <h3 className="text-base font-extrabold text-[#10251d]">
                      {lot.productionPeriod}
                    </h3>

                    {/* Total Volume & Certification Status */}
                    <div className="mt-4 rounded-xl bg-[#fafcf9] p-3 border border-[#edf1ea] flex items-center justify-between">
                      <div>
                        <span className="block text-[10px] text-[#6f7e73] uppercase font-semibold">
                          Total Volume
                        </span>
                        <strong className="text-base font-black text-[#10251d] block mt-0.5">
                          {lot.quantityKg.toLocaleString()} kg
                        </strong>
                      </div>
                      <div className="text-right">
                        <span className="block text-[10px] text-[#6f7e73] uppercase font-semibold">
                          Trace Status
                        </span>
                        <span
                          className={`mt-1 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                            lot.lotStatus === "certified" || (lot.certifiedQuantityKg || 0) > 0
                              ? "bg-[#edf7e8] text-[#2d6130] border border-[#cdebc2]"
                              : "bg-slate-100 text-slate-700 border border-slate-200"
                          }`}
                        >
                          {lot.lotStatus === "certified" || (lot.certifiedQuantityKg || 0) > 0
                            ? "✓ Trace Certified"
                            : "Standard / Uncertified"}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 space-y-1 text-[11px] text-[#57655d]">
                      <div className="flex justify-between pt-1">
                        <span>Source Harvest:</span>
                        <span className="font-mono text-[10px] text-[#57655d]">
                          {lot.harvestId.slice(0, 16)}...
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className="p-5 pt-0">
                  <div className="pt-3 border-t border-[#edf1ea] flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setSelectedLotForPreview(lot)}
                      className="inline-flex items-center gap-1 text-xs font-bold text-[#57655d] hover:text-[#10251d] cursor-pointer"
                    >
                      <Eye size={13} /> View Photo
                    </button>

                    <Link
                      href={`/dashboard/lots/create?farmId=${lot.farmId}`}
                      className="inline-flex items-center gap-1 text-xs font-bold text-[#0b3528] hover:text-[#2d6130]"
                    >
                      <span>New Lot</span>
                      <ArrowRight size={12} />
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {/* Modal: Full Cocoa Image Preview */}
        {selectedLotForPreview && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
            <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between pb-3 border-b border-[#edf1ea]">
                <div>
                  <span className="font-mono text-xs font-bold text-[#2d6130]">
                    {selectedLotForPreview.lotNumber}
                  </span>
                  <h3 className="text-base font-bold text-[#10251d]">
                    Mandatory Cloudinary Visual Reference
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedLotForPreview(null)}
                  className="rounded-full p-1.5 text-[#57655d] hover:bg-slate-100 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="mt-4 rounded-2xl overflow-hidden max-h-[500px] bg-slate-900 flex items-center justify-center">
                <img
                  src={selectedLotForPreview.cocoaImage?.secureUrl || selectedLotForPreview.cocoaImage?.url}
                  alt={selectedLotForPreview.lotNumber}
                  className="max-h-[500px] w-auto object-contain"
                />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-[#57655d] bg-[#fafcf9] p-3 rounded-xl border border-[#edf1ea]">
                <div>
                  <span className="block text-[10px] uppercase font-bold text-[#6f7e73]">
                    Public ID
                  </span>
                  <span className="font-mono text-[11px] truncate block text-[#10251d]">
                    {selectedLotForPreview.cocoaImage?.publicId}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] uppercase font-bold text-[#6f7e73]">
                    Asset Dimensions & Format
                  </span>
                  <span className="font-mono text-[11px] block text-[#10251d]">
                    {selectedLotForPreview.cocoaImage?.width}x{selectedLotForPreview.cocoaImage?.height} (
                    {selectedLotForPreview.cocoaImage?.format?.toUpperCase() || "JPG"})
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
