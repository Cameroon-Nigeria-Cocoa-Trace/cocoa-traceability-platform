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
import { useFirebase, FarmRecord } from "@/context/FirebaseContext";
import { createCocoaApiClient, CocoaApiError } from "@/lib/cocoaApiClient";
import { ProductionRecord } from "@/types/traceability";
import {
  Sprout,
  Plus,
  Calendar,
  Layers,
  TrendingUp,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  RefreshCw,
  X,
  FileSpreadsheet,
} from "lucide-react";

export default function ProductionRecordsPage() {
  const { user, farms, loading: authLoading } = useFirebase();

  const requestVersion = useRef(0);

  const apiClient = useMemo(() => {
    return createCocoaApiClient(async () => {
      if (!user) return null;
      return await user.getIdToken();
    });
  }, [user]);

  // Show only farms belonging to the authenticated Firebase UID.
  // Never fall back to displaying all farms.
  const userFarms = useMemo(() => {
    if (!user || user.uid.startsWith("demo_producer_")) {
      return [];
    }

    return farms.filter((farm) => farm.farmerId === user.uid);
  }, [farms, user]);

  const [selectedFarmId, setSelectedFarmId] = useState<string>("");
  const [records, setRecords] = useState<ProductionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Form State
  const [seasonYear, setSeasonYear] = useState("2026/2027");
  const [productionPeriod, setProductionPeriod] = useState("Main Crop 2026-2027");
  const [startDate, setStartDate] = useState("2026-10-01");
  const [endDate, setEndDate] = useState("2027-03-31");
  const [estimatedQuantityKg, setEstimatedQuantityKg] = useState("");
  const [expectedNumberOfHarvests, setExpectedNumberOfHarvests] = useState("4");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Clear production data when the authenticated account changes.
  useEffect(() => {
    requestVersion.current += 1;
    setRecords([]);
    setError(null);
    setSelectedFarmId("");
    setLoading(false);
  }, [user?.uid]);

  // Set default selected farm
  useEffect(() => {
    if (!selectedFarmId && userFarms.length > 0) {
      setSelectedFarmId(userFarms[0].id);
    }
  }, [userFarms, selectedFarmId]);

  const selectedFarm = useMemo(() => {
    return userFarms.find((f) => f.id === selectedFarmId) || userFarms[0] || null;
  }, [userFarms, selectedFarmId]);

  // Fetch production records
  const loadProductionRecords = useCallback(async () => {
    const requestId = ++requestVersion.current;
    const ownerUid = user?.uid;

    const selectedFarmIsOwned =
      !!ownerUid &&
      userFarms.some(
        (farm) =>
          farm.id === selectedFarmId &&
          farm.farmerId === ownerUid
      );

    if (
      !ownerUid ||
      ownerUid.startsWith("demo_producer_") ||
      !selectedFarmId ||
      !selectedFarmIsOwned
    ) {
      setRecords([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.get<{
        success: boolean;
        productionRecords: ProductionRecord[];
      }>("/api/production", {
        params: { farmId: selectedFarmId },
      });

      // Ignore results from an older request.
      if (requestId !== requestVersion.current) {
        return;
      }

      if (response?.success && response.productionRecords) {
        setRecords(response.productionRecords);
      } else {
        setRecords([]);
      }
    } catch (err: unknown) {
      if (requestId !== requestVersion.current) {
        return;
      }

      if (err instanceof CocoaApiError) {
        setError(err.message);
      } else {
        setError(
          "Failed to load production records for the selected farm."
        );
      }

      setRecords([]);
    } finally {
      if (requestId === requestVersion.current) {
        setLoading(false);
      }
    }
  }, [selectedFarmId, apiClient, user, userFarms]);

  useEffect(() => {
    if (selectedFarmId) {
      loadProductionRecords();
    }
  }, [selectedFarmId, loadProductionRecords]);

  // Submit new production record
  const handleCreateRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFarmId) {
      setFormError("Please select a farm plot first.");
      return;
    }
    setFormError(null);
    setSubmitting(true);

    try {
      const payload = {
        farmId: selectedFarmId,
        seasonYear: seasonYear.trim(),
        productionPeriod: productionPeriod.trim(),
        startDate: startDate.trim(),
        endDate: endDate.trim() || undefined,
        estimatedQuantityKg: estimatedQuantityKg ? parseFloat(estimatedQuantityKg) : undefined,
        expectedNumberOfHarvests: expectedNumberOfHarvests
          ? parseInt(expectedNumberOfHarvests, 10)
          : undefined,
        notes: notes.trim() || undefined,
      };

      const res = await apiClient.post<{
        success: boolean;
        productionRecord: ProductionRecord;
      }>("/api/production", payload);

      if (res && res.success) {
        setSuccessMessage(`Production record for ${seasonYear} created successfully!`);
        setShowModal(false);
        // Reset form
        setNotes("");
        setEstimatedQuantityKg("");
        await loadProductionRecords();
        setTimeout(() => setSuccessMessage(null), 4000);
      }
    } catch (err: unknown) {
      if (err instanceof CocoaApiError) {
        setFormError(err.message);
      } else {
        setFormError("An unexpected error occurred while saving the production record.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f8f3] text-[#10251d]">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 pt-28 pb-16 sm:px-6 sm:pt-32 lg:px-8">
        {/* Workspace Hub Navigation */}
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
              Production Records
            </h1>
            <p className="mt-1 text-sm text-[#57655d]">
              Manage seasonal cocoa production campaigns, target yield estimates, and harvest cycles.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-2 rounded-full bg-[#0b3528] px-5 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-[#07241b] cursor-pointer"
            >
              <Plus size={16} /> New Production Season
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

        {/* Farm Selector Banner */}
        <div className="mb-8 rounded-3xl border border-[#dfe7d8] bg-white p-5 sm:p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#edf7e8] text-[#2d6130]">
                <MapPin size={22} />
              </div>
              <div>
                <label htmlFor="farmSelect" className="block text-xs font-bold text-[#6f7e73] uppercase tracking-wider">
                  Target Cameroon Farm Plot
                </label>
                <select
                  id="farmSelect"
                  value={selectedFarmId}
                  onChange={(e) => setSelectedFarmId(e.target.value)}
                  className="mt-1 rounded-xl border border-[#dfe7d8] bg-[#fafcf9] px-3 py-1.5 text-sm font-bold text-[#10251d] outline-none focus:border-[#2d6130] cursor-pointer"
                >
                  {userFarms.map((farm) => (
                    <option key={farm.id} value={farm.id}>
                      {farm.farmName} ({farm.region}) — {farm.sizeHectares || 3.5} Ha
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs text-[#57655d]">
              <div>
                <span className="block text-[10px] text-[#6f7e73] uppercase">Plot Location</span>
                <span className="font-semibold text-[#10251d]">{selectedFarm?.region || "Southwest Region"}</span>
              </div>
              <div className="h-6 w-px bg-[#edf1ea]" />
              <div>
                <span className="block text-[10px] text-[#6f7e73] uppercase">Coordinates</span>
                <span className="font-mono text-[#2d6130]">{selectedFarm?.geolocation || "4.59° N, 9.12° E"}</span>
              </div>
              <button
                type="button"
                onClick={() => loadProductionRecords()}
                className="p-2 text-[#57655d] hover:text-[#10251d] hover:bg-slate-100 rounded-xl transition"
                title="Refresh Records"
              >
                <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
              </button>
            </div>
          </div>
        </div>

        {/* Records Listing */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-[#dfe7d8]">
            <div className="h-8 w-8 rounded-full border-2 border-[#062d22] border-t-[#b8f58b] animate-spin" />
            <p className="mt-3 text-xs text-[#57655d] font-medium">Loading seasonal production records...</p>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-xs text-red-800">
            <AlertCircle size={24} className="mx-auto text-red-600 mb-2" />
            <p className="font-bold text-sm">Failed to Load Records</p>
            <p className="mt-1 text-red-700">{error}</p>
            <button
              type="button"
              onClick={() => loadProductionRecords()}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg font-bold"
            >
              Retry
            </button>
          </div>
        ) : records.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-[#dfe7d8] bg-white p-12 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#edf7e8] text-[#2d6130] mb-3">
              <Sprout size={28} />
            </div>
            <h3 className="text-base font-bold text-[#10251d]">No Production Records Yet</h3>
            <p className="mt-1 text-xs text-[#57655d] max-w-md mx-auto">
              Create the first seasonal production record for {selectedFarm?.farmName || "this farm"} to begin logging harvests and allocating traceable cocoa lots.
            </p>
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#0b3528] px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#07241b]"
            >
              <Plus size={14} /> Create Season Record
            </button>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {records.map((record) => (
              <div
                key={record.productionRecordId}
                className="rounded-3xl border border-[#dfe7d8] bg-white p-6 shadow-sm transition hover:shadow-md flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between border-b border-[#edf1ea] pb-3 mb-4">
                    <span className="font-mono text-[11px] font-bold text-[#2d6130] bg-[#edf7e8] px-2.5 py-0.5 rounded-full">
                      {record.seasonYear}
                    </span>
                    <span
                      className={`text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full ${
                        record.status === "active"
                          ? "bg-[#edf7e8] text-[#2d6130]"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {record.status}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-[#10251d]">
                    {record.productionPeriod}
                  </h3>

                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl bg-[#fafcf9] p-3 border border-[#edf1ea]">
                      <span className="block text-[10px] text-[#6f7e73] uppercase font-semibold">
                        Estimated Yield
                      </span>
                      <strong className="text-sm font-black text-[#10251d] block mt-0.5">
                        {record.estimatedQuantityKg ? `${record.estimatedQuantityKg.toLocaleString()} kg` : "Not specified"}
                      </strong>
                    </div>

                    <div className="rounded-xl bg-[#fafcf9] p-3 border border-[#edf1ea]">
                      <span className="block text-[10px] text-[#6f7e73] uppercase font-semibold">
                        Actual Harvested
                      </span>
                      <strong className="text-sm font-black text-[#2a7a33] block mt-0.5">
                        {(record.actualQuantityKg || 0).toLocaleString()} kg
                      </strong>
                    </div>
                  </div>

                  <div className="mt-3 space-y-1.5 text-xs text-[#57655d]">
                    <div className="flex items-center justify-between">
                      <span>Season Start:</span>
                      <strong className="text-[#10251d]">{record.startDate}</strong>
                    </div>
                    {record.endDate && (
                      <div className="flex items-center justify-between">
                        <span>Season End:</span>
                        <strong className="text-[#10251d]">{record.endDate}</strong>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span>Harvest Cycles:</span>
                      <strong className="text-[#10251d]">
                        {record.numberOfHarvests || 0} event(s) logged
                      </strong>
                    </div>
                  </div>

                  {record.notes && (
                    <p className="mt-3 text-[11px] text-[#57655d] italic border-t border-[#edf1ea] pt-2">
                      “{record.notes}”
                    </p>
                  )}
                </div>

                <div className="mt-6 pt-3 border-t border-[#edf1ea] flex items-center justify-between">
                  <Link
                    href={`/dashboard/harvests?farmId=${record.farmId}&productionRecordId=${record.productionRecordId}`}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0b3528] hover:text-[#2d6130] transition"
                  >
                    <span>Manage Harvests</span>
                    <ArrowRight size={13} />
                  </Link>

                  <span className="text-[10px] font-mono text-[#6f7e73]">
                    {record.productionRecordId.slice(-8)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Creation Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-[32px] border border-[#dfe7d8] bg-white p-6 shadow-2xl sm:p-8">
              <div className="flex items-center justify-between border-b border-[#edf1ea] pb-4">
                <div>
                  <span className="text-[10px] font-bold text-[#2d6130] uppercase tracking-wider">
                    New Season Period
                  </span>
                  <h3 className="text-xl font-bold text-[#10251d]">
                    Log Production Record
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

              <form onSubmit={handleCreateRecord} className="mt-5 space-y-4 text-xs">
                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">
                    Season Year <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={seasonYear}
                    onChange={(e) => setSeasonYear(e.target.value)}
                    placeholder="e.g. 2026/2027"
                    className="w-full rounded-xl border border-[#dfe7d8] bg-[#fafcf9] p-3 text-sm font-medium text-[#10251d] outline-none focus:border-[#2d6130]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">
                    Production Period Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={productionPeriod}
                    onChange={(e) => setProductionPeriod(e.target.value)}
                    placeholder="e.g. Main Crop 2026-2027 or Mid Crop"
                    className="w-full rounded-xl border border-[#dfe7d8] bg-[#fafcf9] p-3 text-sm font-medium text-[#10251d] outline-none focus:border-[#2d6130]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-[#10251d] mb-1">
                      Start Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full rounded-xl border border-[#dfe7d8] bg-[#fafcf9] p-2.5 text-xs text-[#10251d] outline-none focus:border-[#2d6130]"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-[#10251d] mb-1">
                      End Date (Optional)
                    </label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full rounded-xl border border-[#dfe7d8] bg-[#fafcf9] p-2.5 text-xs text-[#10251d] outline-none focus:border-[#2d6130]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-[#10251d] mb-1">
                      Estimated Volume (kg)
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="1"
                      value={estimatedQuantityKg}
                      onChange={(e) => setEstimatedQuantityKg(e.target.value)}
                      placeholder="e.g. 5000"
                      className="w-full rounded-xl border border-[#dfe7d8] bg-[#fafcf9] p-2.5 text-xs text-[#10251d] outline-none focus:border-[#2d6130]"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-[#10251d] mb-1">
                      Expected Harvests
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={expectedNumberOfHarvests}
                      onChange={(e) => setExpectedNumberOfHarvests(e.target.value)}
                      placeholder="e.g. 4"
                      className="w-full rounded-xl border border-[#dfe7d8] bg-[#fafcf9] p-2.5 text-xs text-[#10251d] outline-none focus:border-[#2d6130]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">
                    Season Notes / Weather Observations
                  </label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Strong early rainfall, expected high fermentation quality."
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
                    {submitting ? "Saving..." : "Save Season Record"}
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
