/* eslint-disable react-hooks/set-state-in-effect, @typescript-eslint/no-unused-vars */
"use client";

import React, { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { DashboardWorkflowNav } from "@/components/DashboardWorkflowNav";
import { useFirebase } from "@/context/FirebaseContext";
import { createCocoaApiClient, CocoaApiError } from "@/lib/cocoaApiClient";
import {
  CertificateTransfer,
  CertificateHolding,
  SupportedTransferRoute,
  CertificateHolderType,
  TransferFeePolicy,
} from "@/types/traceability";
import {
  ArrowLeftRight,
  ShieldCheck,
  Building2,
  BadgeCheck,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  Search,
  Filter,
  DollarSign,
  Plus,
  X,
  ChevronRight,
  HelpCircle,
  Layers,
} from "lucide-react";

// Fee schedule matrix definitions according to business rules
const ROUTE_FEE_POLICIES: Record<
  SupportedTransferRoute,
  {
    policy: TransferFeePolicy;
    treatmentText: string;
    description: string;
  }
> = {
  "Farmer -> Cooperative": {
    policy: "EXEMPT",
    treatmentText: "Zero-Fee (Free)",
    description: "Confirmed policy: Direct cooperative aggregations are free of platform transfer fees.",
  },
  "Agent -> Warehouse": {
    policy: "EXEMPT",
    treatmentText: "Zero-Fee (Free)",
    description: "Confirmed policy: Delivery into licensed export warehouse is free of transfer fees.",
  },
  "Farmer -> Agent": {
    policy: "APPLIED",
    treatmentText: "Charged Fee",
    description: "Confirmed policy: Commercial transfer to an intermediary agent incurs a configurable transfer fee.",
  },
  "Cooperative -> Agent": {
    policy: "APPLIED",
    treatmentText: "Charged Fee",
    description: "Confirmed policy: Commercial offloading to trading agents incurs a transfer fee.",
  },
  "Farmer -> Warehouse": {
    policy: "PENDING_BUSINESS_CONFIRMATION",
    treatmentText: "Pending Business Confirmation",
    description: "Unconfirmed business policy: Neither exempt nor actively charged until cross-border rules finalize.",
  },
  "Cooperative -> Warehouse": {
    policy: "PENDING_BUSINESS_CONFIRMATION",
    treatmentText: "Pending Business Confirmation",
    description: "Unconfirmed business policy: Direct cooperative terminal delivery fee treatment is pending confirmation.",
  },
};

function TransfersContent() {
  const { user } = useFirebase();
  const searchParams = useSearchParams();
  const preselectedSourceHoldingId = searchParams.get("sourceHoldingId");

  const apiClient = useMemo(() => {
    return createCocoaApiClient(async () => {
      if (!user) return null;
      return await user.getIdToken();
    });
  }, [user]);

  const [transfers, setTransfers] = useState<CertificateTransfer[]>([]);
  const [holdings, setHoldings] = useState<CertificateHolding[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Transfer Initiation Modal State
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [sourceHoldingId, setSourceHoldingId] = useState(preselectedSourceHoldingId || "");
  const [destinationHolderId, setDestinationHolderId] = useState("");
  const [destinationHolderType, setDestinationHolderType] = useState<CertificateHolderType>("cooperative");
  const [quantityKg, setQuantityKg] = useState("");
  const [initiating, setInitiating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [routeFilter, setRouteFilter] = useState<string>("all");

  // Load Holdings for selection in transfer modal
  const loadHoldings = useCallback(async () => {
    if (!user) return;
    try {
      const res = await apiClient.get<{
        success: boolean;
        holdings: CertificateHolding[];
      }>("/api/certificate-holdings", {
        params: { holderId: user.uid },
      });
      if (res && res.holdings) {
        setHoldings(res.holdings);
      }
    } catch {
      // Continue
    }
  }, [user, apiClient]);

  // Load Transfers
  const loadTransfers = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<{
        success: boolean;
        transfers: CertificateTransfer[];
      }>("/api/certificate-transfers", {
        params: { holderId: user.uid },
      });
      if (res && res.transfers) {
        setTransfers(res.transfers);
      } else {
        setTransfers([]);
      }
    } catch (err: unknown) {
      if (err instanceof CocoaApiError) {
        setError(err.message);
      } else {
        setError("Failed to load certificate transfers.");
      }
      setTransfers([]);
    } finally {
      setLoading(false);
    }
  }, [user, apiClient]);

  useEffect(() => {
    if (user) {
      loadTransfers();
      loadHoldings();
    }
  }, [user, loadTransfers, loadHoldings]);

  useEffect(() => {
    if (preselectedSourceHoldingId) {
      setSourceHoldingId(preselectedSourceHoldingId);
      setShowTransferModal(true);
    }
  }, [preselectedSourceHoldingId]);

  // Selected source holding object
  const selectedSourceHolding = useMemo(() => {
    return holdings.find((h) => h.holdingId === sourceHoldingId) || null;
  }, [holdings, sourceHoldingId]);

  // Determine prospective route & fee policy
  const prospectiveRoute = useMemo(() => {
    if (!selectedSourceHolding || !destinationHolderType) return null;
    const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    const candidate = `${capitalize(selectedSourceHolding.holderType)} -> ${capitalize(destinationHolderType)}` as SupportedTransferRoute;
    return ROUTE_FEE_POLICIES[candidate] ? { routeName: candidate, ...ROUTE_FEE_POLICIES[candidate] } : null;
  }, [selectedSourceHolding, destinationHolderType]);

  // Initiate Transfer Submit Handler
  const handleInitiateTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceHoldingId) {
      setFormError("Please select a source holding.");
      return;
    }
    if (!destinationHolderId.trim()) {
      setFormError("Please enter the Destination Entity ID.");
      return;
    }
    const transferAmount = parseFloat(quantityKg);
    if (isNaN(transferAmount) || transferAmount <= 0) {
      setFormError("Please enter a valid transfer quantity greater than 0.");
      return;
    }
    if (selectedSourceHolding && transferAmount > selectedSourceHolding.availableQuantityKg) {
      setFormError(
        `Transfer quantity (${transferAmount} kg) exceeds available holding balance (${selectedSourceHolding.availableQuantityKg} kg).`
      );
      return;
    }

    setInitiating(true);
    setFormError(null);
    setFormSuccess(null);

    try {
      const payload = {
        sourceHoldingId,
        destinationHolderId: destinationHolderId.trim(),
        destinationHolderType,
        quantityKg: transferAmount,
      };

      const res = await apiClient.post<{
        success: boolean;
        transfer: CertificateTransfer;
      }>("/api/certificate-transfers", payload);

      if (res && res.success) {
        setFormSuccess(`Transfer of ${res.transfer.quantityKg} kg executed successfully!`);
        await loadTransfers();
        await loadHoldings();
        setTimeout(() => {
          setShowTransferModal(false);
          setFormSuccess(null);
          setQuantityKg("");
          setDestinationHolderId("");
        }, 1500);
      }
    } catch (err: unknown) {
      if (err instanceof CocoaApiError) {
        setFormError(err.message);
      } else {
        setFormError("Failed to execute certificate transfer.");
      }
    } finally {
      setInitiating(false);
    }
  };

  // Filtered transfers
  const filteredTransfers = useMemo(() => {
    return transfers.filter((t) => {
      const matchesRoute = routeFilter === "all" || t.route === routeFilter;
      const matchesSearch =
        !searchQuery.trim() ||
        t.transferId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.certificateNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.route.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.destinationHolderId.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesRoute && matchesSearch;
    });
  }, [transfers, routeFilter, searchQuery]);

  return (
    <div className="min-h-screen bg-[#f7f8f3] text-[#10251d]">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 pt-28 pb-16 sm:px-6 sm:pt-32 lg:px-8">
        <DashboardWorkflowNav currentTab="traceability-certification" />

        {/* Top Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[#edf7e8] px-3 py-1 text-xs font-bold text-[#2d6130] uppercase tracking-wider">
                Traceability & Certification
              </span>
              <span className="text-xs font-semibold text-[#57655d]">
                Atomic Route Execution
              </span>
            </div>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-[#10251d] sm:text-4xl">
              Cocoa Transfers
            </h1>
            <p className="mt-1 text-sm text-[#57655d]">
              Atomic supply-chain certificate transfers across the 6 verified routes with immutable fee policy snapshots.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setShowTransferModal(true);
                setFormError(null);
                setFormSuccess(null);
              }}
              className="inline-flex items-center gap-2 rounded-full bg-[#0b3528] px-5 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-[#07241b] cursor-pointer"
            >
              <Plus size={16} /> Execute Certificate Transfer
            </button>
            <Link
              href="/dashboard/holdings"
              className="inline-flex items-center gap-2 rounded-full border border-[#dfe7d8] bg-white px-4 py-3 text-xs font-bold text-[#10251d] shadow-2xs hover:bg-[#fafcf9]"
            >
              <Building2 size={15} /> View Holdings
            </Link>
          </div>
        </div>

        {/* Confirmed Route Fee Treatment Matrix */}
        <div className="mb-8 rounded-3xl border border-[#dfe7d8] bg-white p-5 sm:p-6 shadow-2xs">
          <div className="flex items-center gap-2 text-xs font-bold text-[#6f7e73] uppercase mb-4">
            <ShieldCheck size={16} className="text-[#2d6130]" />
            <span>Supported Transfer Routes & Fee Treatment Policy</span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(ROUTE_FEE_POLICIES).map(([route, info]) => (
              <div
                key={route}
                className="rounded-2xl border border-[#edf1ea] bg-[#fafcf9] p-3.5 text-xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between font-bold text-[#10251d]">
                    <span>{route}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${
                        info.policy === "EXEMPT"
                          ? "bg-[#edf7e8] text-[#2d6130]"
                          : info.policy === "APPLIED"
                          ? "bg-amber-100 text-amber-900"
                          : "bg-blue-50 text-blue-800"
                      }`}
                    >
                      {info.policy === "EXEMPT"
                        ? "FREE (0 fee)"
                        : info.policy === "APPLIED"
                        ? "CHARGED"
                        : "PENDING"}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[11px] text-[#57655d] leading-normal">
                    {info.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Toolbar & Filter */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-[#6f7e73]">Filter Route:</label>
            <select
              value={routeFilter}
              onChange={(e) => setRouteFilter(e.target.value)}
              className="rounded-xl border border-[#dfe7d8] bg-white px-3 py-1.5 text-xs font-bold text-[#10251d] outline-none focus:border-[#2d6130] cursor-pointer"
            >
              <option value="all">All 6 Routes</option>
              {Object.keys(ROUTE_FEE_POLICIES).map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search
                size={15}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6f7e73]"
              />
              <input
                type="text"
                placeholder="Search transfer, cert, or recipient..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-64 rounded-xl border border-[#dfe7d8] bg-white pl-9 pr-3 py-2 text-xs font-medium text-[#10251d] outline-none focus:border-[#2d6130]"
              />
            </div>
            <button
              type="button"
              onClick={() => loadTransfers()}
              className="p-2.5 rounded-xl border border-[#dfe7d8] bg-white text-[#57655d] hover:text-[#10251d] hover:bg-[#fafcf9] transition cursor-pointer"
              title="Refresh Transfers"
            >
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* Transfers List */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-[#dfe7d8]">
            <div className="h-8 w-8 rounded-full border-2 border-[#062d22] border-t-[#b8f58b] animate-spin" />
            <p className="mt-3 text-xs text-[#57655d] font-medium">Loading transfer records...</p>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-xs text-red-800">
            <AlertCircle size={24} className="mx-auto text-red-600 mb-2" />
            <p className="font-bold text-sm">Failed to Load Transfers</p>
            <p className="mt-1 text-red-700">{error}</p>
          </div>
        ) : filteredTransfers.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-[#dfe7d8] bg-white p-12 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#edf7e8] text-[#2d6130] mb-3">
              <ArrowLeftRight size={28} />
            </div>
            <h3 className="text-base font-bold text-[#10251d]">No Transfers Recorded Yet</h3>
            <p className="mt-1 text-xs text-[#57655d] max-w-md mx-auto">
              Execute partial or full transfers of certified cocoa across registered supply chain entities. Transfers generate immutable custody units and preserve historical lineage.
            </p>
            <button
              type="button"
              onClick={() => setShowTransferModal(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#0b3528] px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#07241b] cursor-pointer"
            >
              <Plus size={14} /> Execute First Transfer
            </button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-3xl border border-[#dfe7d8] bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#f7f8f3] text-[11px] font-bold uppercase text-[#6f7e73] border-b border-[#dfe7d8]">
                  <tr>
                    <th className="py-3.5 px-4 sm:px-6">Transfer ID</th>
                    <th className="py-3.5 px-4">Certificate</th>
                    <th className="py-3.5 px-4">Route</th>
                    <th className="py-3.5 px-4">Transferred Weight</th>
                    <th className="py-3.5 px-4">Fee Treatment</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf1ea] text-[#10251d]">
                  {filteredTransfers.map((t) => (
                    <tr key={t.transferId} className="hover:bg-[#fafcf9] transition">
                      <td className="py-3.5 px-4 sm:px-6 font-mono font-bold text-[#10251d]">
                        {t.transferId.slice(0, 16)}...
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-[#2d6130]">
                        {t.certificateNumber}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-[#10251d]">
                        {t.route}
                      </td>
                      <td className="py-3.5 px-4 font-bold">
                        {t.quantityKg.toLocaleString()} kg
                        {t.isPartialTransfer && (
                          <span className="ml-1 text-[10px] font-normal text-[#6f7e73]">
                            (partial)
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                            t.feeApplied?.policyStatus === "EXEMPT"
                              ? "bg-[#edf7e8] text-[#2d6130]"
                              : t.feeApplied?.policyStatus === "APPLIED"
                              ? "bg-amber-100 text-amber-900"
                              : "bg-blue-50 text-blue-800"
                          }`}
                        >
                          {t.feeApplied?.policyStatus || "EXEMPT"}
                        </span>
                        {t.feeApplied?.calculatedAmount !== undefined && (
                          <span className="block text-[10px] text-[#57655d] mt-0.5">
                            {t.feeApplied.calculatedAmount} {t.feeApplied.currency}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="rounded-full bg-[#edf7e8] px-2.5 py-0.5 text-[10px] font-bold text-[#2d6130] uppercase">
                          {t.transferStatus}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-[#57655d]">
                        {t.completedAt || t.initiatedAt
                          ? new Date(t.completedAt || t.initiatedAt).toLocaleDateString()
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Transfer Execution Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-3xl border border-[#dfe7d8] bg-white p-6 sm:p-8 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-[#edf1ea]">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#edf7e8] text-[#2d6130]">
                  <ArrowLeftRight size={22} />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[#10251d]">
                    Execute Certificate Transfer
                  </h3>
                  <p className="text-xs text-[#57655d]">
                    Atomic partial or full transfer of certified custody
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowTransferModal(false)}
                className="p-1.5 text-[#57655d] hover:text-[#10251d] rounded-lg cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleInitiateTransfer} className="mt-5 space-y-4">
              {formError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                  {formError}
                </div>
              )}
              {formSuccess && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 size={16} /> {formSuccess}
                </div>
              )}

              {/* Source Holding */}
              <div>
                <label className="block text-xs font-bold text-[#6f7e73] uppercase mb-1">
                  Source Custody Unit <span className="text-red-500">*</span>
                </label>
                <select
                  value={sourceHoldingId}
                  onChange={(e) => {
                    setSourceHoldingId(e.target.value);
                    const selected = holdings.find((h) => h.holdingId === e.target.value);
                    if (selected && !quantityKg) {
                      setQuantityKg(String(selected.availableQuantityKg));
                    }
                  }}
                  required
                  className="w-full rounded-xl border border-[#dfe7d8] bg-[#fafcf9] px-3 py-2 text-xs font-medium text-[#10251d] outline-none focus:border-[#2d6130] cursor-pointer"
                >
                  <option value="">-- Select Source Holding Unit --</option>
                  {holdings
                    .filter((h) => h.availableQuantityKg > 0)
                    .map((h) => (
                      <option key={h.holdingId} value={h.holdingId}>
                        {h.certificateNumber} — Available: {h.availableQuantityKg} kg (Role: {h.holderType})
                      </option>
                    ))}
                </select>
              </div>

              {/* Destination Role */}
              <div>
                <label className="block text-xs font-bold text-[#6f7e73] uppercase mb-1">
                  Destination Entity Role <span className="text-red-500">*</span>
                </label>
                <select
                  value={destinationHolderType}
                  onChange={(e) => setDestinationHolderType(e.target.value as CertificateHolderType)}
                  className="w-full rounded-xl border border-[#dfe7d8] bg-[#fafcf9] px-3 py-2 text-xs font-medium text-[#10251d] outline-none focus:border-[#2d6130] cursor-pointer"
                >
                  <option value="cooperative">Cooperative Organization</option>
                  <option value="agent">Licensed Buying Agent</option>
                  <option value="warehouse">Terminal Export Warehouse</option>
                </select>
              </div>

              {/* Destination Entity ID */}
              <div>
                <label className="block text-xs font-bold text-[#6f7e73] uppercase mb-1">
                  Destination Entity ID / UID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. coop_mamfe_01 or verified Agent UID"
                  value={destinationHolderId}
                  onChange={(e) => setDestinationHolderId(e.target.value)}
                  required
                  className="w-full rounded-xl border border-[#dfe7d8] bg-[#fafcf9] px-3 py-2 text-xs font-medium text-[#10251d] outline-none focus:border-[#2d6130]"
                />
              </div>

              {/* Quantity */}
              <div>
                <label className="block text-xs font-bold text-[#6f7e73] uppercase mb-1">
                  Transfer Quantity (kg) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 250"
                  value={quantityKg}
                  onChange={(e) => setQuantityKg(e.target.value)}
                  required
                  className="w-full rounded-xl border border-[#dfe7d8] bg-[#fafcf9] px-3 py-2 text-xs font-medium text-[#10251d] outline-none focus:border-[#2d6130]"
                />
                {selectedSourceHolding && (
                  <p className="mt-1 text-[11px] text-[#6f7e73]">
                    Max available in this holding: <strong className="text-[#10251d]">{selectedSourceHolding.availableQuantityKg} kg</strong>
                  </p>
                )}
              </div>

              {/* Route & Fee Policy Card */}
              {prospectiveRoute && (
                <div className="rounded-xl border border-[#dfe7d8] bg-[#fafcf9] p-3.5 text-xs">
                  <div className="flex items-center justify-between font-bold">
                    <span className="text-[#10251d]">Detected Route: {prospectiveRoute.routeName}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        prospectiveRoute.policy === "EXEMPT"
                          ? "bg-[#edf7e8] text-[#2d6130]"
                          : prospectiveRoute.policy === "APPLIED"
                          ? "bg-amber-100 text-amber-900"
                          : "bg-blue-50 text-blue-800"
                      }`}
                    >
                      {prospectiveRoute.treatmentText}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-[#57655d]">
                    {prospectiveRoute.description}
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-[#edf1ea]">
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="rounded-full px-4 py-2 text-xs font-bold text-[#57655d] hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={initiating}
                  className="rounded-full bg-[#0b3528] px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#07241b] disabled:opacity-50 cursor-pointer"
                >
                  {initiating ? "Executing..." : "Execute Transfer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CocoaTransfersPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#f7f8f3] flex items-center justify-center">
          <div className="h-8 w-8 rounded-full border-2 border-[#062d22] border-t-[#b8f58b] animate-spin" />
        </div>
      }
    >
      <TransfersContent />
    </Suspense>
  );
}
