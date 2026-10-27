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
import { ProductionRecord } from "@/types/traceability";
import {
  Sprout,
  Plus,
  Calendar,
  Layers,
  MapPin,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Clock,
  ArrowRight,
  RefreshCw,
  X,
  Edit2,
  Trash2,
  Lock,
  Info,
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
  const userFarms = useMemo(() => {
    if (!user) {
      return [];
    }
    return farms.filter((farm) => farm.farmerId === user.uid);
  }, [farms, user]);

  const [selectedFarmId, setSelectedFarmId] = useState<string>("");
  const [records, setRecords] = useState<ProductionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal States
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState<ProductionRecord | null>(null);
  const [deletingRecord, setDeletingRecord] = useState<ProductionRecord | null>(null);

  // Year options: from 2020 right to the current year
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const availableYears = useMemo(() => {
    const years: number[] = [];
    for (let y = 2020; y <= currentYear; y++) {
      years.push(y);
    }
    return years;
  }, [currentYear]);

  // Form State for Creating Record
  const [seasonYear, setSeasonYear] = useState<string>(String(currentYear));
  const [productionPeriod, setProductionPeriod] = useState<string>(`Production Season ${currentYear}`);
  const [estimatedQuantityKg, setEstimatedQuantityKg] = useState("");
  const [numberOfHarvestsInput, setNumberOfHarvestsInput] = useState("3");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form State for Editing Record
  const [editHarvestsCount, setEditHarvestsCount] = useState<string>("");
  const [editNotes, setEditNotes] = useState("");
  const [editEstimatedQuantityKg, setEditEstimatedQuantityKg] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Calculated start and end dates: always the beginning and ending of that year selected
  const calculatedStartDate = useMemo(() => `${seasonYear}-01-01`, [seasonYear]);
  const calculatedEndDate = useMemo(() => `${seasonYear}-12-31`, [seasonYear]);
  const isSelectedPreviousYear = useMemo(() => {
    const y = parseInt(seasonYear, 10);
    return !isNaN(y) && y < currentYear;
  }, [seasonYear, currentYear]);

  // Existing years on the currently selected farm (rule: cannot create 2 separate production records of the same year)
  const existingYears = useMemo(() => {
    return new Set(records.map((r) => r.seasonYear.trim()));
  }, [records]);

  // Rule: Must put all the harvests periods for that production before they can add another production record
  const incompleteRecord = useMemo(() => {
    return records.find((r) => {
      const target = Number(r.expectedNumberOfHarvests ?? 0);
      const logged = Number(r.numberOfHarvests ?? 0);
      return target > 0 && logged < target;
    });
  }, [records]);

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

  // When year changes in create form, auto-update the default production period label
  const handleYearChange = (year: string) => {
    setSeasonYear(year);
    setProductionPeriod(`Production Season ${year}`);
    setFormError(null);
  };

  // Open Create Modal
  const handleOpenCreateModal = () => {
    if (incompleteRecord) {
      setFormError(
        `All ${incompleteRecord.expectedNumberOfHarvests} harvest periods for production season ${incompleteRecord.seasonYear} must be logged before creating another production record (${incompleteRecord.numberOfHarvests || 0} of ${incompleteRecord.expectedNumberOfHarvests} logged).`
      );
      return;
    }

    // Default to the newest available year that doesn't yet exist
    const unusedYear = [...availableYears].reverse().find((y) => !existingYears.has(String(y)));
    const initialYear = unusedYear ? String(unusedYear) : String(currentYear);
    setSeasonYear(initialYear);
    setProductionPeriod(`Production Season ${initialYear}`);
    setEstimatedQuantityKg("");
    setNumberOfHarvestsInput("3");
    setNotes("");
    setFormError(null);
    setShowCreateModal(true);
  };

  // Submit new production record
  const handleCreateRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFarmId) {
      setFormError("Please select a farm plot first.");
      return;
    }

    // Rule: Cannot create 2 separate production records of the same year
    if (existingYears.has(seasonYear.trim())) {
      setFormError(
        `A production record for season year ${seasonYear} already exists on this farm. A farmer cannot create two separate production records of the same year.`
      );
      return;
    }

    // Rule: Must put all the harvest periods for prior production before adding another
    if (incompleteRecord) {
      setFormError(
        `You must log all ${incompleteRecord.expectedNumberOfHarvests} harvest periods for production season ${incompleteRecord.seasonYear} (${incompleteRecord.numberOfHarvests || 0} logged) before adding another production record.`
      );
      return;
    }

    const harvestsNum = parseInt(numberOfHarvestsInput, 10);
    if (isNaN(harvestsNum) || harvestsNum <= 0) {
      setFormError(
        isSelectedPreviousYear
          ? "Please specify the total number of harvests for this previous season (must be 1 or more)."
          : "Please specify the expected number of harvests for this season (must be 1 or more)."
      );
      return;
    }

    setFormError(null);
    setSubmitting(true);

    try {
      const payload = {
        farmId: selectedFarmId,
        seasonYear: seasonYear.trim(),
        productionPeriod: productionPeriod.trim() || `Production Season ${seasonYear}`,
        startDate: calculatedStartDate,
        endDate: calculatedEndDate,
        // No need for volume in previous years
        estimatedQuantityKg:
          !isSelectedPreviousYear && estimatedQuantityKg
            ? parseFloat(estimatedQuantityKg)
            : undefined,
        expectedNumberOfHarvests: harvestsNum,
        notes: notes.trim() || undefined,
      };

      const res = await apiClient.post<{
        success: boolean;
        productionRecord: ProductionRecord;
      }>("/api/production", payload);

      if (res && res.success) {
        setSuccessMessage(`Production record for ${seasonYear} created successfully!`);
        setShowCreateModal(false);
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

  // Open Edit Modal (Rule: season year cannot be edited, only harvests, and cannot reduce below logged amount)
  const handleOpenEditModal = (record: ProductionRecord) => {
    setEditingRecord(record);
    const initialHarvests = record.expectedNumberOfHarvests ?? record.numberOfHarvests ?? 1;
    setEditHarvestsCount(String(initialHarvests));
    setEditEstimatedQuantityKg(record.estimatedQuantityKg ? String(record.estimatedQuantityKg) : "");
    setEditNotes(record.notes || "");
    setEditError(null);
  };

  // Submit Edit Record
  const handleSaveEditRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;

    const newHarvestsCount = parseInt(editHarvestsCount, 10);
    const alreadyLoggedCount = Number(editingRecord.numberOfHarvests ?? 0);

    if (isNaN(newHarvestsCount) || newHarvestsCount <= 0) {
      setEditError("Harvests count must be a positive integer.");
      return;
    }

    // Rule: It cannot be reduced to less than the amount of harvests already present for that record
    if (newHarvestsCount < alreadyLoggedCount) {
      setEditError(
        `Number of harvests cannot be reduced to less than ${alreadyLoggedCount} because ${alreadyLoggedCount} harvest period(s) have already been logged for this season.`
      );
      return;
    }

    setEditError(null);
    setEditSubmitting(true);

    try {
      const isPastYear = parseInt(editingRecord.seasonYear, 10) < currentYear;
      const payload: Record<string, unknown> = {
        productionRecordId: editingRecord.productionRecordId,
        expectedNumberOfHarvests: newHarvestsCount,
        notes: editNotes.trim() || undefined,
      };

      if (!isPastYear && editEstimatedQuantityKg) {
        payload.estimatedQuantityKg = parseFloat(editEstimatedQuantityKg);
      }

      const res = await apiClient.patch<{
        success: boolean;
        productionRecord: ProductionRecord;
      }>("/api/production", payload);

      if (res && res.success) {
        setSuccessMessage(`Production record for ${editingRecord.seasonYear} updated successfully.`);
        setEditingRecord(null);
        await loadProductionRecords();
        setTimeout(() => setSuccessMessage(null), 4000);
      }
    } catch (err: unknown) {
      if (err instanceof CocoaApiError) {
        setEditError(err.message);
      } else {
        setEditError("Failed to update production record.");
      }
    } finally {
      setEditSubmitting(false);
    }
  };

  // Delete Record (Rule: cannot delete after harvests have been added under it)
  const handleDeleteRecord = async () => {
    if (!deletingRecord) return;

    const loggedCount = Number(deletingRecord.numberOfHarvests ?? 0);
    if (loggedCount > 0) {
      setDeleteError(`Cannot delete this production record because ${loggedCount} harvest(s) have already been logged under it.`);
      return;
    }

    setDeleteSubmitting(true);
    setDeleteError(null);

    try {
      const res = await apiClient.delete<{ success: boolean; message: string }>("/api/production", {
        params: { productionRecordId: deletingRecord.productionRecordId },
      });

      if (res && res.success) {
        setSuccessMessage(`Production record for season ${deletingRecord.seasonYear} deleted.`);
        setDeletingRecord(null);
        await loadProductionRecords();
        setTimeout(() => setSuccessMessage(null), 4000);
      }
    } catch (err: unknown) {
      if (err instanceof CocoaApiError) {
        setDeleteError(err.message);
      } else {
        setDeleteError("Failed to delete production record.");
      }
    } finally {
      setDeleteSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f8f3] text-[#10251d]">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 pt-28 pb-16 sm:px-6 sm:pt-32 lg:px-8">
        {/* Workspace Hub Navigation */}
        <DashboardWorkflowNav currentTab="cooperative-management" />

        {/* Top Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[#edf7e8] px-3 py-1 text-xs font-bold text-[#2d6130] uppercase tracking-wider">
                Production &amp; Inventory
              </span>
              <span className="text-xs font-semibold text-[#57655d]">
                Annual Calendar Campaigns (2020 – {currentYear})
              </span>
            </div>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-[#10251d] sm:text-4xl">
              Production Records
            </h1>
            <p className="mt-1 text-sm text-[#57655d]">
              Manage annual cocoa production cycles, sequential harvest periods, and immutable season records.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleOpenCreateModal}
              disabled={Boolean(incompleteRecord)}
              className={`inline-flex items-center gap-2 rounded-full px-5 py-3 text-xs font-bold text-white shadow-sm transition ${
                incompleteRecord
                  ? "bg-gray-400 cursor-not-allowed opacity-80"
                  : "bg-[#0b3528] hover:bg-[#07241b] cursor-pointer"
              }`}
              title={
                incompleteRecord
                  ? `Log all ${incompleteRecord.expectedNumberOfHarvests} harvests for ${incompleteRecord.seasonYear} before creating a new season.`
                  : "Create a new annual production record"
              }
            >
              <Plus size={16} /> New Production Season
            </button>
          </div>
        </div>

        {/* Incomplete Harvest Logging Requirement Alert */}
        {incompleteRecord && (
          <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 sm:p-5 text-amber-900 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-start gap-3">
                <AlertTriangle size={20} className="text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-sm text-amber-950">
                    Harvest Period Logging Required Before Adding New Season
                  </h4>
                  <p className="mt-1 text-xs text-amber-900 leading-relaxed">
                    Production record <strong>{incompleteRecord.seasonYear}</strong> ({incompleteRecord.productionPeriod}) requires{" "}
                    <strong>{incompleteRecord.expectedNumberOfHarvests}</strong> harvest periods, but only{" "}
                    <strong>{incompleteRecord.numberOfHarvests || 0}</strong> have been recorded so far. You must record all{" "}
                    {incompleteRecord.expectedNumberOfHarvests} harvest periods for this production before you can add another production record.
                  </p>
                </div>
              </div>

              <Link
                href={`/dashboard/harvests?farmId=${selectedFarmId}&productionRecordId=${incompleteRecord.productionRecordId}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-amber-900 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-amber-950 transition shrink-0 self-start sm:self-center"
              >
                <span>Log Harvests ({incompleteRecord.numberOfHarvests || 0}/{incompleteRecord.expectedNumberOfHarvests})</span>
                <ArrowRight size={13} />
              </Link>
            </div>
          </div>
        )}

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
                className="p-2 text-[#57655d] hover:text-[#10251d] hover:bg-slate-100 rounded-xl transition cursor-pointer"
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
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg font-bold cursor-pointer"
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
              Select an annual season from 2020 through {currentYear} for {selectedFarm?.farmName || "this farm"} to log your harvest batches.
            </p>
            <button
              type="button"
              onClick={handleOpenCreateModal}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#0b3528] px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#07241b] cursor-pointer"
            >
              <Plus size={14} /> Create Season Record
            </button>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {records.map((record) => {
              const targetHarvests = Number(record.expectedNumberOfHarvests ?? 0);
              const loggedHarvests = Number(record.numberOfHarvests ?? 0);
              const isComplete = targetHarvests > 0 && loggedHarvests >= targetHarvests;
              const hasHarvests = loggedHarvests > 0;
              const isPastYear = parseInt(record.seasonYear, 10) < currentYear;

              return (
                <div
                  key={record.productionRecordId}
                  className="rounded-3xl border border-[#dfe7d8] bg-white p-6 shadow-sm transition hover:shadow-md flex flex-col justify-between"
                >
                  <div>
                    {/* Header: Season Year & Status */}
                    <div className="flex items-center justify-between border-b border-[#edf1ea] pb-3 mb-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-extrabold text-[#2d6130] bg-[#edf7e8] px-3 py-1 rounded-full border border-[#cdebc2]">
                          Year {record.seasonYear}
                        </span>
                        {isPastYear && (
                          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                            Historical
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        {isComplete ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full bg-[#edf7e8] text-[#2d6130]">
                            <CheckCircle2 size={12} /> All Harvests Logged
                          </span>
                        ) : targetHarvests > 0 ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                            <Clock size={12} /> {loggedHarvests}/{targetHarvests} Harvests
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                            {record.status}
                          </span>
                        )}
                      </div>
                    </div>

                    <h3 className="text-base font-extrabold text-[#10251d]">
                      {record.productionPeriod}
                    </h3>

                    {/* Fixed start and end date (Jan 1 - Dec 31 of that year) */}
                    <div className="mt-2.5 flex items-center gap-1.5 text-xs text-[#57655d]">
                      <Calendar size={13} className="text-[#2d6130] shrink-0" />
                      <span>
                        Jan 1, {record.seasonYear} – Dec 31, {record.seasonYear}
                      </span>
                    </div>

                    {/* Stats Grid */}
                    <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-xl bg-[#fafcf9] p-3 border border-[#edf1ea]">
                        <span className="block text-[10px] text-[#6f7e73] uppercase font-semibold">
                          {isPastYear ? "Total Harvests" : "Expected Harvests"}
                        </span>
                        <strong className="text-sm font-black text-[#10251d] block mt-0.5">
                          {targetHarvests > 0 ? `${targetHarvests} period${targetHarvests === 1 ? "" : "s"}` : "Unspecified"}
                        </strong>
                      </div>

                      <div className="rounded-xl bg-[#fafcf9] p-3 border border-[#edf1ea]">
                        <span className="block text-[10px] text-[#6f7e73] uppercase font-semibold">
                          Harvests Logged
                        </span>
                        <strong className={`text-sm font-black block mt-0.5 ${loggedHarvests > 0 ? "text-[#2a7a33]" : "text-gray-400"}`}>
                          {loggedHarvests} event{loggedHarvests === 1 ? "" : "s"}
                        </strong>
                      </div>
                    </div>

                    {/* Yield / Actual Quantities */}
                    <div className="mt-3 space-y-1.5 text-xs text-[#57655d] border-t border-[#edf1ea] pt-3">
                      {!isPastYear && record.estimatedQuantityKg && (
                        <div className="flex items-center justify-between">
                          <span>Target Volume:</span>
                          <strong className="text-[#10251d]">
                            {record.estimatedQuantityKg.toLocaleString()} kg
                          </strong>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span>Actual Harvested Cocoa:</span>
                        <strong className="text-[#2a7a33] font-black">
                          {(record.actualQuantityKg || 0).toLocaleString()} kg
                        </strong>
                      </div>
                    </div>

                    {record.notes && (
                      <p className="mt-3 text-[11px] text-[#57655d] italic border-t border-[#edf1ea] pt-2">
                        “{record.notes}”
                      </p>
                    )}
                  </div>

                  {/* Actions Bar */}
                  <div className="mt-6 pt-3 border-t border-[#edf1ea] flex items-center justify-between">
                    <Link
                      href={`/dashboard/harvests?farmId=${record.farmId}&productionRecordId=${record.productionRecordId}`}
                      className="inline-flex items-center gap-1.5 rounded-full bg-[#edf7e8] px-3.5 py-1.5 text-xs font-bold text-[#0b3528] hover:bg-[#d8f0d0] transition cursor-pointer"
                    >
                      <span>Manage Harvests ({loggedHarvests})</span>
                      <ArrowRight size={13} />
                    </Link>

                    <div className="flex items-center gap-1.5">
                      {/* Edit Button: season year is locked; only harvests can be edited */}
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(record)}
                        className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-[#10251d] transition cursor-pointer"
                        title="Edit production harvests"
                      >
                        <Edit2 size={15} />
                      </button>

                      {/* Delete Button: rule: cannot delete if harvests have been added under it */}
                      {hasHarvests ? (
                        <span
                          className="inline-flex rounded-lg p-2 text-gray-300 cursor-not-allowed"
                          title="Cannot delete production record after harvests have been added under it"
                        >
                          <Lock size={15} />
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setDeletingRecord(record);
                            setDeleteError(null);
                          }}
                          className="rounded-lg p-2 text-red-500 hover:bg-red-50 hover:text-red-700 transition cursor-pointer"
                          title="Delete empty production record"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal: Create Production Season */}
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm overflow-y-auto">
            <div className="relative my-8 w-full max-w-lg rounded-[32px] border border-[#dfe7d8] bg-white p-6 shadow-2xl sm:p-8">
              <div className="flex items-center justify-between border-b border-[#edf1ea] pb-4">
                <div>
                  <span className="text-[10px] font-bold text-[#2d6130] uppercase tracking-wider">
                    New Annual Campaign
                  </span>
                  <h3 className="text-xl font-bold text-[#10251d]">
                    Create Production Record
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-full p-2 text-[#57655d] hover:bg-slate-100 cursor-pointer"
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
                {/* Season Year Dropdown starting from 2020 right to current year */}
                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">
                    Season Year <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={seasonYear}
                    onChange={(e) => handleYearChange(e.target.value)}
                    className="w-full rounded-xl border border-[#dfe7d8] bg-[#fafcf9] p-3 text-sm font-bold text-[#10251d] outline-none focus:border-[#2d6130] cursor-pointer"
                  >
                    {availableYears.map((yr) => {
                      const yrStr = String(yr);
                      const isAlreadyPresent = existingYears.has(yrStr);
                      return (
                        <option key={yr} value={yrStr} disabled={isAlreadyPresent}>
                          {yr} {isAlreadyPresent ? "(Record Already Exists)" : yr === currentYear ? "(Current Year)" : "(Previous Year)"}
                        </option>
                      );
                    })}
                  </select>
                  <p className="mt-1 text-[11px] text-[#6f7e73]">
                    Options span from 2020 to current year ({currentYear}). Each calendar year can only be created once per farm.
                  </p>
                </div>

                {/* Fixed Start and End Date: Beginning and Ending of the year */}
                <div className="rounded-2xl border border-[#dfe7d8] bg-[#f8f9f4] p-3.5">
                  <div className="flex items-center gap-2 font-bold text-[#10251d] text-xs">
                    <Calendar size={15} className="text-[#2d6130]" />
                    <span>Fixed Production Dates (Full Calendar Year)</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-white rounded-xl p-2.5 border border-[#edf1ea]">
                      <span className="text-[10px] text-gray-500 block uppercase">Start Date</span>
                      <strong className="text-xs text-[#10251d] font-mono block mt-0.5">
                        {calculatedStartDate} (Jan 1)
                      </strong>
                    </div>
                    <div className="bg-white rounded-xl p-2.5 border border-[#edf1ea]">
                      <span className="text-[10px] text-gray-500 block uppercase">End Date</span>
                      <strong className="text-xs text-[#10251d] font-mono block mt-0.5">
                        {calculatedEndDate} (Dec 31)
                      </strong>
                    </div>
                  </div>
                  <p className="mt-2 text-[10px] text-[#57655d]">
                    The production period automatically starts on January 1 and concludes on December 31 of {seasonYear}.
                  </p>
                </div>

                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">
                    Production Campaign Label
                  </label>
                  <input
                    type="text"
                    value={productionPeriod}
                    onChange={(e) => setProductionPeriod(e.target.value)}
                    placeholder={`e.g. Production Season ${seasonYear}`}
                    className="w-full rounded-xl border border-[#dfe7d8] bg-[#fafcf9] p-3 text-sm font-medium text-[#10251d] outline-none focus:border-[#2d6130]"
                  />
                </div>

                {/* Harvests field & conditional Volume */}
                <div className={isSelectedPreviousYear ? "space-y-4" : "grid grid-cols-2 gap-3"}>
                  <div>
                    <label className="block font-semibold text-[#10251d] mb-1">
                      {isSelectedPreviousYear ? (
                        <>
                          Number of Harvests <span className="text-red-500">*</span>
                        </>
                      ) : (
                        <>
                          Expected Harvests <span className="text-red-500">*</span>
                        </>
                      )}
                    </label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={numberOfHarvestsInput}
                      onChange={(e) => setNumberOfHarvestsInput(e.target.value)}
                      placeholder="e.g. 4"
                      className="w-full rounded-xl border border-[#dfe7d8] bg-[#fafcf9] p-2.5 text-xs text-[#10251d] outline-none focus:border-[#2d6130]"
                    />
                    <p className="mt-1 text-[10px] text-[#6f7e73]">
                      {isSelectedPreviousYear
                        ? "Total number of physical harvest periods. You must log each of these harvest periods before creating another season record."
                        : "Target harvest cycles planned for this current year."}
                    </p>
                  </div>

                  {/* Volume is only required/displayed for the present year */}
                  {!isSelectedPreviousYear ? (
                    <div>
                      <label className="block font-semibold text-[#10251d] mb-1">
                        Estimated Target Volume (kg)
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="1"
                        value={estimatedQuantityKg}
                        onChange={(e) => setEstimatedQuantityKg(e.target.value)}
                        placeholder="e.g. 4500"
                        className="w-full rounded-xl border border-[#dfe7d8] bg-[#fafcf9] p-2.5 text-xs text-[#10251d] outline-none focus:border-[#2d6130]"
                      />
                      <p className="mt-1 text-[10px] text-[#6f7e73]">
                        Optional yield forecast for current season.
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-[11px] text-blue-900 flex items-start gap-2">
                      <Info size={14} className="shrink-0 text-blue-700 mt-0.5" />
                      <div>
                        Volume specification is not required for previous years. Only the exact number of completed harvest periods is recorded.
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">
                    Season Notes / Weather Observations (Optional)
                  </label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Good rainfall distribution, steady flowering, healthy pods."
                    className="w-full rounded-xl border border-[#dfe7d8] bg-[#fafcf9] p-2.5 text-xs text-[#10251d] outline-none focus:border-[#2d6130]"
                  />
                </div>

                <div className="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-[#edf1ea]">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
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

        {/* Modal: Edit Production Record (Rule: season year is locked, only harvests can be edited with minimum = already logged) */}
        {editingRecord && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm overflow-y-auto">
            <div className="relative my-8 w-full max-w-lg rounded-[32px] border border-[#dfe7d8] bg-white p-6 shadow-2xl sm:p-8">
              <div className="flex items-center justify-between border-b border-[#edf1ea] pb-4">
                <div>
                  <span className="text-[10px] font-bold text-[#2d6130] uppercase tracking-wider">
                    Update Production Parameters
                  </span>
                  <h3 className="text-xl font-bold text-[#10251d]">
                    Edit Production Season {editingRecord.seasonYear}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingRecord(null)}
                  className="rounded-full p-2 text-[#57655d] hover:bg-slate-100 cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              {editError && (
                <div className="mt-4 rounded-xl bg-red-50 p-3 text-xs text-red-800 border border-red-200">
                  {editError}
                </div>
              )}

              <form onSubmit={handleSaveEditRecord} className="mt-5 space-y-4 text-xs">
                {/* Locked Season Year */}
                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">
                    Season Year (Locked)
                  </label>
                  <div className="flex items-center justify-between rounded-xl border border-[#dfe7d8] bg-gray-100 p-3 text-sm font-bold text-gray-600">
                    <span>Year {editingRecord.seasonYear}</span>
                    <span className="flex items-center gap-1 text-[11px] text-gray-500 font-normal">
                      <Lock size={13} /> Season year cannot be edited
                    </span>
                  </div>
                </div>

                {/* Fixed Dates */}
                <div className="rounded-xl border border-[#edf1ea] bg-[#fafcf9] p-3 text-xs text-[#57655d]">
                  <span className="block font-bold text-[#10251d] mb-0.5">
                    Production Duration
                  </span>
                  <span>Jan 1, {editingRecord.seasonYear} – Dec 31, {editingRecord.seasonYear}</span>
                </div>

                {/* Harvests Count input with strict minimum constraint */}
                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">
                    {parseInt(editingRecord.seasonYear, 10) < currentYear
                      ? "Number of Harvests"
                      : "Expected Harvests"}{" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={editingRecord.numberOfHarvests || 1}
                    required
                    value={editHarvestsCount}
                    onChange={(e) => setEditHarvestsCount(e.target.value)}
                    className="w-full rounded-xl border border-[#dfe7d8] bg-[#fafcf9] p-3 text-sm font-bold text-[#10251d] outline-none focus:border-[#2d6130]"
                  />
                  <p className="mt-1.5 text-[11px] text-[#6f7e73]">
                    {Number(editingRecord.numberOfHarvests ?? 0) > 0 ? (
                      <span className="text-amber-800 font-medium">
                        ⚠️ Cannot be reduced below <strong>{editingRecord.numberOfHarvests}</strong> because{" "}
                        {editingRecord.numberOfHarvests} harvest period(s) have already been logged for this season.
                      </span>
                    ) : (
                      "Set the required number of harvest cycles for this season."
                    )}
                  </p>
                </div>

                {/* Estimated Volume if current year */}
                {parseInt(editingRecord.seasonYear, 10) === currentYear && (
                  <div>
                    <label className="block font-semibold text-[#10251d] mb-1">
                      Estimated Target Volume (kg)
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="1"
                      value={editEstimatedQuantityKg}
                      onChange={(e) => setEditEstimatedQuantityKg(e.target.value)}
                      placeholder="e.g. 5000"
                      className="w-full rounded-xl border border-[#dfe7d8] bg-[#fafcf9] p-2.5 text-xs text-[#10251d] outline-none focus:border-[#2d6130]"
                    />
                  </div>
                )}

                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">
                    Season Notes / Weather Observations
                  </label>
                  <textarea
                    rows={2}
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    className="w-full rounded-xl border border-[#dfe7d8] bg-[#fafcf9] p-2.5 text-xs text-[#10251d] outline-none focus:border-[#2d6130]"
                  />
                </div>

                <div className="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-[#edf1ea]">
                  <button
                    type="button"
                    onClick={() => setEditingRecord(null)}
                    className="px-4 py-2.5 rounded-xl border border-[#dfe7d8] text-xs font-bold text-[#57655d] hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={editSubmitting}
                    className="px-5 py-2.5 rounded-xl bg-[#0b3528] text-xs font-bold text-white hover:bg-[#07241b] transition disabled:opacity-50 cursor-pointer"
                  >
                    {editSubmitting ? "Saving Changes..." : "Save Changes"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Confirm Deletion (Rule: only empty production records without harvests can be deleted) */}
        {deletingRecord && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-[32px] border border-red-200 bg-white p-6 shadow-2xl sm:p-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-red-700 mb-4">
                <Trash2 size={24} />
              </div>

              <h3 className="text-lg font-bold text-[#10251d]">
                Delete Production Record for {deletingRecord.seasonYear}?
              </h3>
              <p className="mt-2 text-xs text-[#57655d] leading-relaxed">
                Are you sure you want to delete this production season? This record contains 0 logged harvests and can be safely removed. This action cannot be undone.
              </p>

              {deleteError && (
                <div className="mt-4 rounded-xl bg-red-50 p-3 text-xs text-red-800 border border-red-200">
                  {deleteError}
                </div>
              )}

              <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-[#edf1ea]">
                <button
                  type="button"
                  onClick={() => setDeletingRecord(null)}
                  disabled={deleteSubmitting}
                  className="px-4 py-2 text-xs font-bold text-[#57655d] hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteRecord}
                  disabled={deleteSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-red-600 text-xs font-bold text-white hover:bg-red-700 transition disabled:opacity-50 cursor-pointer"
                >
                  {deleteSubmitting ? "Deleting..." : "Confirm Delete"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
