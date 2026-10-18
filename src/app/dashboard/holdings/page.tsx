/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { DashboardWorkflowNav } from "@/components/DashboardWorkflowNav";
import { useFirebase } from "@/context/FirebaseContext";
import { createCocoaApiClient, CocoaApiError } from "@/lib/cocoaApiClient";
import {
  CertificateHolding,
  CertificateHoldingTraceHistory,
  CertificateHoldingStatus,
} from "@/types/traceability";
import {
  Building2,
  BadgeCheck,
  ArrowLeftRight,
  ShieldCheck,
  RefreshCw,
  Search,
  Filter,
  AlertCircle,
  Eye,
  X,
  Boxes,
  ArrowUpRight,
  ArrowDownLeft,
  CheckCircle2,
  Clock,
  Layers,
  ChevronRight,
  History,
} from "lucide-react";

export default function CertificateHoldingsPage() {
  const { user } = useFirebase();

  const apiClient = useMemo(() => {
    return createCocoaApiClient(async () => {
      if (!user) return null;
      return await user.getIdToken();
    });
  }, [user]);

  const [holdings, setHoldings] = useState<CertificateHolding[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Status Filter: "all" | "active" | "partially_transferred" | "depleted"
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Holding History Trace Modal
  const [selectedHoldingId, setSelectedHoldingId] = useState<string | null>(null);
  const [traceHistory, setTraceHistory] = useState<CertificateHoldingTraceHistory | null>(null);
  const [traceLoading, setTraceLoading] = useState(false);
  const [traceError, setTraceError] = useState<string | null>(null);

  // Load Holdings for the authenticated entity/user
  const loadHoldings = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<{
        success: boolean;
        holdings: CertificateHolding[];
      }>("/api/certificate-holdings", {
        params: { holderId: user.uid },
      });

      if (res && res.holdings) {
        setHoldings(res.holdings);
      } else {
        setHoldings([]);
      }
    } catch (err: unknown) {
      if (err instanceof CocoaApiError) {
        setError(err.message);
      } else {
        setError("Failed to load certificate holdings.");
      }
      setHoldings([]);
    } finally {
      setLoading(false);
    }
  }, [user, apiClient]);

  useEffect(() => {
    if (user) {
      loadHoldings();
    }
  }, [user, loadHoldings]);

  // Inspect Holding Trace History
  const handleInspectTrace = async (holdingId: string) => {
    setSelectedHoldingId(holdingId);
    setTraceLoading(true);
    setTraceError(null);
    setTraceHistory(null);
    try {
      const res = await apiClient.get<{
        success: boolean;
        holding: CertificateHolding;
        history: CertificateHoldingTraceHistory;
      }>(`/api/certificate-holdings/${holdingId}`, {
        params: { includeHistory: true },
      });

      if (res && res.history) {
        setTraceHistory(res.history);
      } else {
        setTraceError("No historical trace available for this custody unit.");
      }
    } catch (err: unknown) {
      if (err instanceof CocoaApiError) {
        setTraceError(err.message);
      } else {
        setTraceError("Failed to resolve holding trace history.");
      }
    } finally {
      setTraceLoading(false);
    }
  };

  // Filtered Holdings
  const filteredHoldings = useMemo(() => {
    return holdings.filter((h) => {
      const matchesStatus =
        statusFilter === "all" || h.status === statusFilter;
      const matchesSearch =
        !searchQuery.trim() ||
        h.holdingId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        h.certificateNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        h.lotId.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }, [holdings, statusFilter, searchQuery]);

  // Inventory Totals
  const activeVolume = useMemo(() => {
    return holdings
      .filter((h) => h.status === "active" || h.status === "partially_transferred")
      .reduce((sum, h) => sum + (h.availableQuantityKg || 0), 0);
  }, [holdings]);

  const totalCertifiedCustody = useMemo(() => {
    return holdings.reduce((sum, h) => sum + (h.quantityKg || 0), 0);
  }, [holdings]);

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
                Distinct Custody Units
              </span>
            </div>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-[#10251d] sm:text-4xl">
              Certificate Holdings
            </h1>
            <p className="mt-1 text-sm text-[#57655d]">
              Distinct certified custody units across supply-chain holders with immutable chain-of-custody provenance.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/transfers"
              className="inline-flex items-center gap-2 rounded-full bg-[#0b3528] px-5 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-[#07241b]"
            >
              <ArrowLeftRight size={16} /> Transfer Certified Cocoa
            </Link>
          </div>
        </div>

        {/* Aggregate Custody Stats Cards */}
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-3xl border border-[#dfe7d8] bg-white p-5 shadow-2xs">
            <div className="flex items-center justify-between text-xs font-bold text-[#6f7e73] uppercase">
              <span>Available Certified Stock</span>
              <Building2 size={16} className="text-[#2d6130]" />
            </div>
            <div className="mt-3 text-2xl font-black text-[#10251d]">
              {activeVolume.toLocaleString()} <span className="text-sm font-semibold text-[#57655d]">kg</span>
            </div>
            <p className="mt-1 text-[11px] text-[#57655d]">
              Available for immediate transfer or marketplace listing
            </p>
          </div>

          <div className="rounded-3xl border border-[#dfe7d8] bg-white p-5 shadow-2xs">
            <div className="flex items-center justify-between text-xs font-bold text-[#6f7e73] uppercase">
              <span>Custody Units Managed</span>
              <Layers size={16} className="text-[#2d6130]" />
            </div>
            <div className="mt-3 text-2xl font-black text-[#10251d]">
              {holdings.length} <span className="text-sm font-semibold text-[#57655d]">holding(s)</span>
            </div>
            <p className="mt-1 text-[11px] text-[#57655d]">
              Distinct holding anchors preserved permanently in ledger
            </p>
          </div>

          <div className="rounded-3xl border border-[#dfe7d8] bg-white p-5 shadow-2xs">
            <div className="flex items-center justify-between text-xs font-bold text-[#6f7e73] uppercase">
              <span>Historical Inward Certified</span>
              <History size={16} className="text-[#2d6130]" />
            </div>
            <div className="mt-3 text-2xl font-black text-[#2d6130]">
              {totalCertifiedCustody.toLocaleString()} <span className="text-sm font-semibold text-[#57655d]">kg</span>
            </div>
            <p className="mt-1 text-[11px] text-[#57655d]">
              Cumulative certified volume received into your custody
            </p>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1.5 rounded-2xl bg-white p-1.5 border border-[#dfe7d8] shadow-2xs">
            {(["all", "active", "partially_transferred", "depleted"] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-bold capitalize transition cursor-pointer ${
                  statusFilter === status
                    ? "bg-[#0b3528] text-white shadow-2xs"
                    : "text-[#57655d] hover:text-[#10251d]"
                }`}
              >
                {status.replace("_", " ")}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search
                size={15}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6f7e73]"
              />
              <input
                type="text"
                placeholder="Search holding or cert..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-64 rounded-xl border border-[#dfe7d8] bg-white pl-9 pr-3 py-2 text-xs font-medium text-[#10251d] outline-none focus:border-[#2d6130]"
              />
            </div>
            <button
              type="button"
              onClick={() => loadHoldings()}
              className="p-2.5 rounded-xl border border-[#dfe7d8] bg-white text-[#57655d] hover:text-[#10251d] hover:bg-[#fafcf9] transition cursor-pointer"
              title="Refresh Holdings"
            >
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* Holdings Grid */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-[#dfe7d8]">
            <div className="h-8 w-8 rounded-full border-2 border-[#062d22] border-t-[#b8f58b] animate-spin" />
            <p className="mt-3 text-xs text-[#57655d] font-medium">Loading certified custody units...</p>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-xs text-red-800">
            <AlertCircle size={24} className="mx-auto text-red-600 mb-2" />
            <p className="font-bold text-sm">Failed to Load Holdings</p>
            <p className="mt-1 text-red-700">{error}</p>
          </div>
        ) : filteredHoldings.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-[#dfe7d8] bg-white p-12 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#edf7e8] text-[#2d6130] mb-3">
              <Building2 size={28} />
            </div>
            <h3 className="text-base font-bold text-[#10251d]">No Certificate Holdings Found</h3>
            <p className="mt-1 text-xs text-[#57655d] max-w-md mx-auto">
              Holdings represent certified cocoa custody units. When an Origin Trace Certificate is issued or transferred to you, a distinct holding unit appears here.
            </p>
            <div className="mt-4 flex justify-center gap-3">
              <Link
                href="/dashboard/certificates"
                className="inline-flex items-center gap-1.5 rounded-full bg-[#0b3528] px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#07241b]"
              >
                <BadgeCheck size={14} /> Origin Certificates
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredHoldings.map((holding) => (
              <article
                key={holding.holdingId}
                className="rounded-3xl border border-[#dfe7d8] bg-white p-6 shadow-sm hover:shadow-md transition flex flex-col justify-between"
              >
                <div>
                  {/* Status & Identifiers */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] font-extrabold text-[#2d6130] bg-[#edf7e8] px-2.5 py-1 rounded-md">
                      {holding.certificateNumber}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                        holding.status === "active"
                          ? "bg-[#edf7e8] text-[#2d6130]"
                          : holding.status === "partially_transferred"
                          ? "bg-amber-100 text-amber-900"
                          : holding.status === "depleted"
                          ? "bg-slate-200 text-slate-700"
                          : "bg-blue-100 text-blue-900"
                      }`}
                    >
                      {holding.status.replace("_", " ")}
                    </span>
                  </div>

                  <div className="mt-3">
                    <span className="font-mono text-[10px] text-[#6f7e73] block truncate">
                      ID: {holding.holdingId}
                    </span>
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-[#57655d]">
                      <span className="capitalize font-semibold text-[#10251d]">
                        Holder Role: {holding.holderType}
                      </span>
                    </div>
                  </div>

                  {/* Quantity Breakdown */}
                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl bg-[#fafcf9] p-2.5 border border-[#edf1ea]">
                      <span className="block text-[10px] text-[#6f7e73] uppercase font-semibold">
                        Available Balance
                      </span>
                      <strong className="text-sm font-black text-[#2d6130] block mt-0.5">
                        {holding.availableQuantityKg.toLocaleString()} kg
                      </strong>
                    </div>
                    <div className="rounded-xl bg-[#fafcf9] p-2.5 border border-[#edf1ea]">
                      <span className="block text-[10px] text-[#6f7e73] uppercase font-semibold">
                        Original Batch
                      </span>
                      <strong className="text-sm font-black text-[#10251d] block mt-0.5">
                        {holding.quantityKg.toLocaleString()} kg
                      </strong>
                    </div>
                  </div>

                  {/* Upstream/Chain Identifiers */}
                  <div className="mt-4 space-y-1 text-[11px] text-[#57655d]">
                    <div className="flex justify-between">
                      <span>Origin Farm:</span>
                      <span className="font-mono text-[10px] text-[#10251d]">
                        {holding.farmId.slice(0, 14)}...
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Backing Lot:</span>
                      <span className="font-mono text-[10px] text-[#10251d]">
                        {holding.lotId.slice(0, 14)}...
                      </span>
                    </div>
                    {holding.sourceTransferId && (
                      <div className="flex justify-between pt-1 border-t border-[#edf1ea]">
                        <span>Inward Transfer:</span>
                        <span className="font-mono text-[10px] text-[#2d6130]">
                          {holding.sourceTransferId.slice(0, 16)}...
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="mt-6 pt-4 border-t border-[#edf1ea] flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => handleInspectTrace(holding.holdingId)}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0b3528] hover:text-[#2d6130] cursor-pointer"
                  >
                    <History size={14} /> Trace Provenance
                  </button>

                  {holding.availableQuantityKg > 0 ? (
                    <Link
                      href={`/dashboard/transfers?sourceHoldingId=${holding.holdingId}`}
                      className="inline-flex items-center gap-1 text-xs font-bold text-[#2d6130] hover:text-[#1a382d]"
                    >
                      <span>Transfer</span>
                      <ArrowLeftRight size={13} />
                    </Link>
                  ) : (
                    <span className="text-[11px] text-[#8e9d92] italic">
                      Fully Depleted
                    </span>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      {/* Custody Trace History Modal */}
      {selectedHoldingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl rounded-3xl border border-[#dfe7d8] bg-white p-6 sm:p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-[#edf1ea]">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#edf7e8] text-[#2d6130]">
                  <History size={22} />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[#10251d]">
                    Holding Chain-of-Custody Trace
                  </h3>
                  <p className="text-xs text-[#57655d]">
                    Authoritative provenance sequence for this specific custody unit
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedHoldingId(null)}
                className="p-1.5 text-[#57655d] hover:text-[#10251d] rounded-lg cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-6">
              {traceLoading ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="h-8 w-8 rounded-full border-2 border-[#062d22] border-t-[#b8f58b] animate-spin" />
                  <p className="mt-3 text-xs text-[#57655d]">Resolving upstream holding sequence...</p>
                </div>
              ) : traceError ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-xs text-red-800">
                  <AlertCircle size={24} className="mx-auto text-red-600 mb-2" />
                  <p className="font-bold text-sm">Trace Resolution Failed</p>
                  <p className="mt-1 text-red-700">{traceError}</p>
                </div>
              ) : traceHistory ? (
                <div className="space-y-6">
                  {/* Holding Summary Card */}
                  <div className="rounded-2xl bg-[#edf7e8] p-4 text-xs border border-[#2d6130]">
                    <div className="flex items-center justify-between font-mono text-[11px] text-[#2d6130] font-bold">
                      <span>{traceHistory.certificateNumber}</span>
                      <span>Holding: {traceHistory.holdingId.slice(0, 16)}...</span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-[#6f7e73] block text-[10px] uppercase font-semibold">
                          Current Held Balance:
                        </span>
                        <strong className="text-base text-[#10251d] font-black">
                          {traceHistory.currentQuantityKg.toLocaleString()} kg
                        </strong>
                      </div>
                      <div>
                        <span className="text-[#6f7e73] block text-[10px] uppercase font-semibold">
                          Available:
                        </span>
                        <strong className="text-base text-[#2d6130] font-black">
                          {traceHistory.availableQuantityKg.toLocaleString()} kg
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Upstream Custody Sequence */}
                  <div>
                    <h4 className="text-xs font-bold text-[#6f7e73] uppercase tracking-wider mb-3">
                      Upstream Chain of Custody Sequence
                    </h4>

                    {traceHistory.chronologicalTransferSequence.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-[#dfe7d8] p-4 text-center text-xs text-[#57655d]">
                        Root origin holding initialized directly upon certificate issuance. No prior transfer hops.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {traceHistory.chronologicalTransferSequence.map((t, idx) => (
                          <div
                            key={t.transferId}
                            className="rounded-2xl border border-[#dfe7d8] bg-[#fafcf9] p-4 text-xs"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-[#2d6130]">
                                Transfer #{idx + 1}: {t.route}
                              </span>
                              <span className="font-bold text-[#10251d]">
                                {t.quantityKg.toLocaleString()} kg
                              </span>
                            </div>
                            <div className="mt-1 flex items-center justify-between text-[11px] text-[#57655d]">
                              <span>Status: {t.transferStatus}</span>
                              <span>
                                {t.completedAt ? new Date(t.completedAt).toLocaleDateString() : "Completed"}
                              </span>
                            </div>
                            {t.feeApplied && (
                              <div className="mt-2 pt-2 border-t border-[#edf1ea] text-[10px] text-[#6f7e73] flex justify-between">
                                <span>Fee Policy: {t.feeApplied.policyStatus}</span>
                                <span>
                                  Amount: {t.feeApplied.calculatedAmount} {t.feeApplied.currency}
                                </span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-6 pt-4 border-t border-[#edf1ea] flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedHoldingId(null)}
                className="rounded-full bg-[#0b3528] px-5 py-2 text-xs font-bold text-white hover:bg-[#07241b] cursor-pointer"
              >
                Close Trace
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
