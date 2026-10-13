"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import {
  QrCode,
  Search,
  ShieldCheck,
  CheckCircle2,
  Leaf,
  ArrowRight,
  Sparkles,
  FileSearch,
} from "lucide-react";

export default function TraceabilityPortalPage() {
  const router = useRouter();
  const [searchValue, setSearchValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = searchValue.trim();
    if (!clean) {
      setError("Please enter a valid QR code identifier or package number.");
      return;
    }
    setError(null);
    router.push(`/traceability/qr/${encodeURIComponent(clean)}`);
  };

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <Navbar />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Official Cameroon Cocoa Provenance Portal
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-stone-900">
            Verify Cocoa Origin & Bag-Level Traceability
          </h1>

          <p className="text-base text-stone-600 max-w-2xl mx-auto">
            Scan or enter a package QR code value to verify origin farm authenticity, deforestation-free compliance (EUDR), and complete custody chain history.
          </p>
        </div>

        {/* Search Box */}
        <div className="mt-8 bg-white p-6 sm:p-8 rounded-2xl border border-stone-200 shadow-sm">
          <form onSubmit={handleSearch} className="space-y-4">
            <div>
              <label htmlFor="qr-input" className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-2">
                Enter QR Identifier or Package Number
              </label>
              <div className="relative">
                <input
                  id="qr-input"
                  type="text"
                  value={searchValue}
                  onChange={(e) => {
                    setSearchValue(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="e.g. QRV-LOT-CMR-2026-0001-001-... or LOT-CMR-2026-0001-PKG-001"
                  className="w-full pl-11 pr-4 py-3.5 border border-stone-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                />
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-stone-400" />
              </div>
              {error && <p className="text-xs text-red-600 mt-1.5 font-medium">{error}</p>}
            </div>

            <button
              type="submit"
              className="w-full py-3.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-xl text-sm transition-colors flex items-center justify-center gap-2 shadow-xs"
            >
              <QrCode className="h-4 w-4" />
              Verify Bag Provenance
            </button>
          </form>

          {/* Quick Examples */}
          <div className="mt-6 pt-6 border-t border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-stone-500 gap-2">
            <span>Try sample package:</span>
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setSearchValue("QRV-LOT-CMR-2026-0001-001-sample")}
                className="font-mono bg-stone-100 hover:bg-stone-200 px-2 py-1 rounded text-stone-800 transition-colors"
              >
                QRV-LOT-CMR-2026-0001-001-sample
              </button>
            </div>
          </div>
        </div>

        {/* Feature Badges */}
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
          <div className="p-5 bg-white rounded-xl border border-stone-200">
            <CheckCircle2 className="h-6 w-6 text-emerald-600 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-stone-900">Immutable Bag Weights</h3>
            <p className="text-xs text-stone-500 mt-1">
              Every bag has permanent sequence numbers and non-reusable allocations.
            </p>
          </div>

          <div className="p-5 bg-white rounded-xl border border-stone-200">
            <Leaf className="h-6 w-6 text-emerald-600 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-stone-900">EUDR Deforestation Check</h3>
            <p className="text-xs text-stone-500 mt-1">
              Validates GPS plot geofencing against non-deforestation registries.
            </p>
          </div>

          <div className="p-5 bg-white rounded-xl border border-stone-200">
            <FileSearch className="h-6 w-6 text-emerald-600 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-stone-900">Full Custody DAG Chain</h3>
            <p className="text-xs text-stone-500 mt-1">
              Upstream lineage traversal through cooperatives, agents, and warehouses.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
