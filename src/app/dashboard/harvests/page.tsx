/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  Suspense,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { DashboardWorkflowNav } from "@/components/DashboardWorkflowNav";
import { useFirebase } from "@/context/FirebaseContext";
import { createCocoaApiClient, CocoaApiError } from "@/lib/cocoaApiClient";
import { Harvest, ProductionRecord, CocoaQualityGrade } from "@/types/traceability";
import {
  Layers,
  Plus,
  Calendar,
  Boxes,
  CheckCircle2,
  AlertCircle,
  MapPin,
  RefreshCw,
  X,
  ArrowRight,
  TrendingUp,
  Scale,
} from "lucide-react";

export default function HarvestsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f7f8f3]" />}>
      <HarvestsContent />
    </Suspense>
  );
}

function HarvestsContent() {
  const searchParams = useSearchParams();
  const initialFarmId = searchParams.get("farmId") || "";
  const initialProdId = searchParams.get("productionRecordId") || "";

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
    return farms.filter((farm) => farm.farmerId === user.uid);
  }, [farms, user]);

  const [selectedFarmId, setSelectedFarmId] = useState<string>(initialFarmId);
  const [productionRecords, setProductionRecords] = useState<ProductionRecord[]>([]);
  const [selectedProdId, setSelectedProdId] = useState<string>(initialProdId);
  const [harvests, setHarvests] = useState<Harvest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Form State
  const [harvestDate, setHarvestDate] = useState(new Date().toISOString().split("T")[0]);
  const [quantityKg, setQuantityKg] = useState("");
  const [qualityGrade, setQualityGrade] = useState<CocoaQualityGrade>("Grade 1");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Prevent outdated requests from overwriting newer account or selection data.
  const productionRequestVersion = useRef(0);
  const harvestRequestVersion = useRef(0);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Initialize farm
  // Keep the selected farm within the authenticated user's accessible farms.
  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setSelectedFarmId("");
      setSelectedProdId("");
      setProductionRecords([]);
      setHarvests([]);
      setError(null);
      setLoading(false);
      return;
    }

    const selectedFarmIsAccessible = userFarms.some(
      (farm) => farm.id === selectedFarmId
    );

    if (selectedFarmId && !selectedFarmIsAccessible) {
      const nextFarm =
        userFarms.find((farm) => farm.id === initialFarmId) ??
        userFarms[0];

      setSelectedFarmId(nextFarm?.id ?? "");
      setSelectedProdId("");
      setProductionRecords([]);
      setHarvests([]);
      setError(null);
      return;
    }

    if (!selectedFarmId && userFarms.length > 0) {
      const nextFarm =
        userFarms.find((farm) => farm.id === initialFarmId) ??
        userFarms[0];

      setSelectedFarmId(nextFarm.id);
    }
  }, [
    authLoading,
    user,
    userFarms,
    selectedFarmId,
    initialFarmId,
  ]);

  // Fetch production records through the authenticated API.
  const loadProductionRecords = useCallback(async () => {
    const requestId = ++productionRequestVersion.current;

    // Invalidate any harvest request associated with previous selections.
    harvestRequestVersion.current += 1;

    if (!selectedFarmId || !user?.uid) {
      setProductionRecords([]);
      setSelectedProdId("");
      setHarvests([]);
      setError(null);
      setLoading(false);
      return;
    }

    setProductionRecords([]);
    setHarvests([]);
    setError(null);

    try {
      const res = await apiClient.get<{
        success: boolean;
        productionRecords: ProductionRecord[];
      }>("/api/production", {
        params: { farmId: selectedFarmId },
      });

      if (requestId !== productionRequestVersion.current) return;

      const records = Array.isArray(res?.productionRecords)
        ? res.productionRecords
        : [];

      setProductionRecords(records);

      setSelectedProdId((currentSelectedId) => {
        // Preserve the current season if it belongs to this farm.
        if (
          currentSelectedId &&
          records.some(
            (record) =>
              record.productionRecordId === currentSelectedId
          )
        ) {
          return currentSelectedId;
        }

        // Otherwise, use the requested season if valid, or the first record.
        const requestedRecord = records.find(
          (record) =>
            record.productionRecordId === initialProdId
        );

        return (
          requestedRecord?.productionRecordId ??
          records[0]?.productionRecordId ??
          ""
        );
      });
    } catch {
      if (requestId !== productionRequestVersion.current) return;

      setProductionRecords([]);
      setSelectedProdId("");
      setHarvests([]);
    }
  }, [selectedFarmId, apiClient, user?.uid, initialProdId]);

  useEffect(() => {
    void loadProductionRecords();

    return () => {
      productionRequestVersion.current += 1;
    };
  }, [loadProductionRecords]);

  // Fetch harvest records through the authenticated API.
  const loadHarvests = useCallback(async () => {
    const requestId = ++harvestRequestVersion.current;

    if (!selectedProdId || !user?.uid) {
      setHarvests([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setHarvests([]);

    try {
      const res = await apiClient.get<{
        success: boolean;
        harvests: Harvest[];
      }>("/api/harvests", {
        params: { productionRecordId: selectedProdId },
      });

      if (requestId !== harvestRequestVersion.current) return;

      setHarvests(
        Array.isArray(res?.harvests) ? res.harvests : []
      );
    } catch (err: unknown) {
      if (requestId !== harvestRequestVersion.current) return;

      if (err instanceof CocoaApiError) {
        setError(err.message);
      } else {
        setError("Failed to load harvest records.");
      }

      setHarvests([]);
    } finally {
      if (requestId === harvestRequestVersion.current) {
        setLoading(false);
      }
    }
  }, [selectedProdId, apiClient, user?.uid]);

  useEffect(() => {
    void loadHarvests();

    return () => {
      harvestRequestVersion.current += 1;
    };
  }, [loadHarvests]);

  // Selected production record metadata
  const selectedProdRecord = useMemo(() => {
    return productionRecords.find((p) => p.productionRecordId === selectedProdId) || null;
  }, [productionRecords, selectedProdId]);

  // Calculated totals for this production record
  const totalHarvestKg = useMemo(() => {
    return harvests.reduce(
      (total, harvest) =>
        harvest.status === "archived"
          ? total
          : total + (harvest.quantityKg || 0),
      0
    );
  }, [harvests]);

  const totalAllocatedKg = useMemo(() => {
    return harvests.reduce(
      (total, harvest) =>
        harvest.status === "archived"
          ? total
          : total + (harvest.allocatedQuantityKg || 0),
      0
    );
  }, [harvests]);

  const totalAvailableKg = useMemo(() => {
    return harvests.reduce(
      (total, harvest) =>
        harvest.status === "archived"
          ? total
          : total + (harvest.availableQuantityKg || 0),
      0
    );
  }, [harvests]);

  // Handle harvest logging
  const handleLogHarvest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFarmId || !selectedProdId) {
      setFormError("A valid farm and production season must be selected.");
      return;
    }

    const qty = parseFloat(quantityKg);
    if (isNaN(qty) || qty <= 0) {
      setFormError("Harvest quantity must be a positive number greater than 0.");
      return;
    }

    // Client-side date boundary check against selected production record
    if (selectedProdRecord) {
      if (harvestDate < selectedProdRecord.startDate) {
        setFormError(
          `Harvest date (${harvestDate}) cannot be earlier than production season start date (${selectedProdRecord.startDate}).`
        );
        return;
      }
      if (selectedProdRecord.endDate && harvestDate > selectedProdRecord.endDate) {
        setFormError(
          `Harvest date (${harvestDate}) cannot be later than production season end date (${selectedProdRecord.endDate}).`
        );
        return;
      }
    }

    setFormError(null);
    setSubmitting(true);

    try {
      const payload = {
        farmId: selectedFarmId,
        productionRecordId: selectedProdId,
        harvestDate: harvestDate.trim(),
        quantityKg: qty,
        qualityGrade,
        notes: notes.trim() || undefined,
      };

      const res = await apiClient.post<{
        success: boolean;
        harvest: Harvest;
      }>("/api/harvests", payload);

      if (res && res.success) {
        setSuccessMessage(`Harvest event of ${qty.toLocaleString()} kg successfully logged!`);
        setShowModal(false);
        setQuantityKg("");
        setNotes("");
        await loadHarvests();
        await loadProductionRecords();
        setTimeout(() => setSuccessMessage(null), 4000);
      }
    } catch (err: unknown) {
      if (err instanceof CocoaApiError) {
        setFormError(err.message);
      } else {
        setFormError("Failed to record harvest. Please check input values.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f8f3] text-[#10251d]">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 pt-28 pb-16 sm:px-6 sm:pt-32 lg:px-8">
        <DashboardWorkflowNav />

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
              Harvest Management
            </h1>
            <p className="mt-1 text-sm text-[#57655d]">
              Record physical cocoa harvest events with date consistency, quality grades, and lot allocation headroom.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={!selectedProdId}
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-2 rounded-full bg-[#0b3528] px-5 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-[#07241b] disabled:opacity-50 cursor-pointer"
            >
              <Plus size={16} /> Log New Harvest
            </button>
          </div>
        </div>

        {/* Success Alert */}
        {successMessage && (
          <div className="mb-6 flex items-center gap-2.5 rounded-2xl bg-[#edf7e8] p-4 text-xs font-semibold text-[#1a4936] border border-[#c4ebb0]">
            <CheckCircle2 size={18} className="text-[#2a7a33] shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Farm & Season Selector */}
        <div className="mb-8 rounded-3xl border border-[#dfe7d8] bg-white p-5 sm:p-6 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="farmSelect" className="block text-xs font-bold text-[#6f7e73] uppercase tracking-wider mb-1">
                Select Farm Plot
              </label>
              <select
                id="farmSelect"
                value={selectedFarmId}
                onChange={(e) => {
                  setSelectedFarmId(e.target.value);
                  setSelectedProdId("");
                  setProductionRecords([]);
                  setHarvests([]);
                  setError(null);
                }}
                className="w-full rounded-xl border border-[#dfe7d8] bg-[#fafcf9] p-3 text-sm font-bold text-[#10251d] outline-none focus:border-[#2d6130]"
              >
                {userFarms.map((farm) => (
                  <option key={farm.id} value={farm.id}>
                    {farm.farmName} — {farm.region} ({farm.sizeHectares || 3.5} Ha)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="prodSelect" className="block text-xs font-bold text-[#6f7e73] uppercase tracking-wider mb-1">
                Select Production Season
              </label>
              <select
                id="prodSelect"
                value={selectedProdId}
                onChange={(e) => setSelectedProdId(e.target.value)}
                disabled={productionRecords.length === 0}
                className="w-full rounded-xl border border-[#dfe7d8] bg-[#fafcf9] p-3 text-sm font-bold text-[#10251d] outline-none focus:border-[#2d6130] disabled:bg-slate-100"
              >
                {productionRecords.length === 0 ? (
                  <option value="">No production records found for this farm</option>
                ) : (
                  productionRecords.map((p) => (
                    <option key={p.productionRecordId} value={p.productionRecordId}>
                      {p.productionPeriod} ({p.seasonYear}) — Started: {p.startDate}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {selectedProdRecord && (
            <div className="mt-4 pt-4 border-t border-[#edf1ea] flex flex-wrap items-center justify-between text-xs text-[#57655d] gap-2">
              <div className="flex items-center gap-2">
                <Calendar size={14} className="text-[#2d6130]" />
                <span>
                  Season Active Window: <strong className="text-[#10251d]">{selectedProdRecord.startDate}</strong> to{" "}
                  <strong className="text-[#10251d]">{selectedProdRecord.endDate || "Ongoing"}</strong>
                </span>
              </div>
              <div>
                <span>Target Estimate: </span>
                <strong className="text-[#10251d]">
                  {selectedProdRecord.estimatedQuantityKg
                    ? `${selectedProdRecord.estimatedQuantityKg.toLocaleString()} kg`
                    : "Not specified"}
                </strong>
              </div>
            </div>
          )}
        </div>

        {/* 3 Metric Cards for this Production Season */}
        {selectedProdRecord && (
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-[#dfe7d8] bg-white p-5 shadow-sm">
              <span className="text-[10px] font-bold text-[#6f7e73] uppercase tracking-wider">
                Total Harvested Volume
              </span>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-2xl font-black text-[#10251d]">
                  {totalHarvestKg.toLocaleString()}
                </span>
                <span className="text-xs font-semibold text-[#57655d]">kg</span>
              </div>
              <p className="mt-1 text-[11px] text-[#2a7a33]">
                {harvests.length} harvest event{harvests.length === 1 ? "" : "s"} logged
              </p>
            </div>

            <div className="rounded-2xl border border-[#dfe7d8] bg-white p-5 shadow-sm">
              <span className="text-[10px] font-bold text-[#6f7e73] uppercase tracking-wider">
                Allocated to Cocoa Lots
              </span>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-2xl font-black text-[#10251d]">
                  {totalAllocatedKg.toLocaleString()}
                </span>
                <span className="text-xs font-semibold text-[#57655d]">kg</span>
              </div>
              <p className="mt-1 text-[11px] text-[#57655d]">
                Committed to traceable lots
              </p>
            </div>

            <div className="rounded-2xl border border-[#dfe7d8] bg-white p-5 shadow-sm bg-gradient-to-br from-white to-[#edf7e8]/50">
              <span className="text-[10px] font-bold text-[#2d6130] uppercase tracking-wider">
                Available for New Lots
              </span>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-2xl font-black text-[#2d6130]">
                  {totalAvailableKg.toLocaleString()}
                </span>
                <span className="text-xs font-semibold text-[#2d6130]">kg</span>
              </div>
              <p className="mt-1 text-[11px] text-[#2d6130] font-semibold">
                Unallocated harvest capacity
              </p>
            </div>
          </div>
        )}

        {/* Harvest Records List */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-[#dfe7d8]">
            <div className="h-8 w-8 rounded-full border-2 border-[#062d22] border-t-[#b8f58b] animate-spin" />
            <p className="mt-3 text-xs text-[#57655d] font-medium">Loading harvest events...</p>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-xs text-red-800">
            <AlertCircle size={24} className="mx-auto text-red-600 mb-2" />
            <p className="font-bold text-sm">Failed to Load Harvests</p>
            <p className="mt-1 text-red-700">{error}</p>
          </div>
        ) : !selectedProdId ? (
          <div className="rounded-3xl border border-dashed border-[#dfe7d8] bg-white p-12 text-center text-xs text-[#57655d]">
            Select a farm and production record above to view or log harvests.
          </div>
        ) : harvests.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-[#dfe7d8] bg-white p-12 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#edf7e8] text-[#2d6130] mb-3">
              <Layers size={28} />
            </div>
            <h3 className="text-base font-bold text-[#10251d]">No Harvest Events Logged</h3>
            <p className="mt-1 text-xs text-[#57655d] max-w-md mx-auto">
              Record your first harvest batch for this production season to create traceable inventory.
            </p>
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#0b3528] px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#07241b]"
            >
              <Plus size={14} /> Log First Harvest
            </button>
          </div>
        ) : (
          <div className="rounded-3xl border border-[#dfe7d8] bg-white shadow-sm overflow-hidden">
            <div className="p-5 border-b border-[#edf1ea] flex items-center justify-between">
              <h3 className="font-bold text-[#10251d] text-sm">
                Harvest Logs ({harvests.length} Recorded Batches)
              </h3>
              <button
                type="button"
                onClick={() => loadHarvests()}
                className="p-1.5 text-[#57655d] hover:text-[#10251d] hover:bg-slate-100 rounded-lg transition"
              >
                <RefreshCw size={14} />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#fafcf9] border-b border-[#edf1ea] text-[#6f7e73] font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="p-4">Harvest ID</th>
                    <th className="p-4">Harvest Date</th>
                    <th className="p-4">Total Weight</th>
                    <th className="p-4">Available Capacity</th>
                    <th className="p-4">Quality Grade</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf1ea]">
                  {harvests.map((h) => (
                    <tr key={h.harvestId} className="hover:bg-[#fafcf9] transition">
                      <td className="p-4 font-mono font-bold text-[#10251d]">
                        {h.harvestId}
                      </td>
                      <td className="p-4 font-medium text-[#10251d]">
                        {h.harvestDate}
                      </td>
                      <td className="p-4 font-black text-[#10251d]">
                        {h.quantityKg.toLocaleString()} kg
                      </td>
                      <td className="p-4 font-black text-[#2a7a33]">
                        {(h.availableQuantityKg ?? h.quantityKg).toLocaleString()} kg
                      </td>
                      <td className="p-4">
                        <span className="rounded-full bg-[#edf7e8] px-2.5 py-0.5 text-[10px] font-bold text-[#2d6130]">
                          {h.qualityGrade || "Grade 1"}
                        </span>
                      </td>
                      <td className="p-4">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                            h.status === "allocated_to_lot"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-[#edf7e8] text-[#2d6130]"
                          }`}
                        >
                          {h.status}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        {(h.availableQuantityKg ?? h.quantityKg) > 0 ? (
                          <Link
                            href={`/dashboard/lots/create?farmId=${h.farmId}&productionRecordId=${h.productionRecordId}&harvestId=${h.harvestId}`}
                            className="inline-flex items-center gap-1 rounded-full bg-[#0b3528] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-[#07241b] transition"
                          >
                            <span>Allocate to Lot</span>
                            <ArrowRight size={11} />
                          </Link>
                        ) : (
                          <span className="text-[10px] font-bold text-slate-400">
                            Fully Allocated
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Harvest Creation Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-[32px] border border-[#dfe7d8] bg-white p-6 shadow-2xl sm:p-8">
              <div className="flex items-center justify-between border-b border-[#edf1ea] pb-4">
                <div>
                  <span className="text-[10px] font-bold text-[#2d6130] uppercase tracking-wider">
                    Harvest Intake
                  </span>
                  <h3 className="text-xl font-bold text-[#10251d]">
                    Log Harvest Batch
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-full p-2 text-[#57655d] hover:bg-slate-100"
                >
                  <X size={20} />
                </button>
              </div>

              {formError && (
                <div className="mt-4 rounded-xl bg-red-50 p-3 text-xs text-red-800 border border-red-200">
                  {formError}
                </div>
              )}

              <form onSubmit={handleLogHarvest} className="mt-5 space-y-4 text-xs">
                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">
                    Harvest Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={harvestDate}
                    onChange={(e) => setHarvestDate(e.target.value)}
                    className="w-full rounded-xl border border-[#dfe7d8] bg-[#fafcf9] p-3 text-sm font-medium text-[#10251d] outline-none focus:border-[#2d6130]"
                  />
                  {selectedProdRecord && (
                    <p className="mt-1 text-[10px] text-[#6f7e73]">
                      Must fall between {selectedProdRecord.startDate} and {selectedProdRecord.endDate || "now"}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">
                    Harvested Quantity (kg) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="1"
                    required
                    value={quantityKg}
                    onChange={(e) => setQuantityKg(e.target.value)}
                    placeholder="e.g. 1200"
                    className="w-full rounded-xl border border-[#dfe7d8] bg-[#fafcf9] p-3 text-sm font-medium text-[#10251d] outline-none focus:border-[#2d6130]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">
                    Cocoa Quality Grade <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={qualityGrade}
                    onChange={(e) => setQualityGrade(e.target.value as CocoaQualityGrade)}
                    className="w-full rounded-xl border border-[#dfe7d8] bg-[#fafcf9] p-3 text-sm font-medium text-[#10251d] outline-none focus:border-[#2d6130]"
                  >
                    <option value="Grade 1">Grade 1 (Properly Fermented, Premium)</option>
                    <option value="Grade 2">Grade 2 (Fair Fermented)</option>
                    <option value="Sub-standard">Sub-standard</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">
                    Batch Notes / Moisture & Fermentation Details
                  </label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Sun-dried on wooden mats, 7 days fermentation in plantain leaves."
                    className="w-full rounded-xl border border-[#dfe7d8] bg-[#fafcf9] p-2.5 text-xs text-[#10251d] outline-none focus:border-[#2d6130]"
                  />
                </div>

                <div className="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-[#edf1ea]">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2.5 rounded-xl border border-[#dfe7d8] text-xs font-bold text-[#57655d] hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2.5 rounded-xl bg-[#0b3528] text-xs font-bold text-white hover:bg-[#07241b] transition disabled:opacity-50 cursor-pointer"
                  >
                    {submitting ? "Logging..." : "Log Harvest"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
