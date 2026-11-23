"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { extractQrValueFromInput } from "@/lib/qrUrl";
import {
  QrCode,
  Search,
  CheckCircle2,
  Leaf,
  FileSearch,
  ShieldCheck,
} from "lucide-react";

export default function TraceabilityPortalPage() {
  const router = useRouter();
  const [searchValue, setSearchValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const extracted = extractQrValueFromInput(searchValue);
    if (!extracted) {
      setError("Please enter or paste a valid QR verification link, QR identifier, or package number.");
      return;
    }
    setError(null);
    router.push(`/traceability/qr/${encodeURIComponent(extracted)}`);
  };

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <Navbar />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
        <div className="text-center space-y-3">
          <p className="text-xs font-semibold tracking-wider text-emerald-800 uppercase flex items-center justify-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-emerald-700" />
            Official Cameroon Cocoa Provenance Portal
          </p>

          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-stone-900 text-balance max-w-2xl mx-auto">
            Verify Cocoa Origin & Lot Traceability
          </h1>

          <p className="text-base text-stone-600 max-w-2xl mx-auto">
            Scan a physical bag QR code or paste its verification link or package identifier to inspect the full lot chain, remaining cocoa balance, and whether the QR code is still active and current.
          </p>
        </div>

        {/* Search Box */}
        <div className="mt-8 bg-white p-6 sm:p-8 rounded-2xl border border-stone-200 shadow-xs">
          <form onSubmit={handleSearch} className="space-y-4">
            <div>
              <label htmlFor="qr-input" className="block text-xs font-semibold text-stone-700 mb-2">
                Verification URL, QR Identifier, or Package Number
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
                  placeholder="https://.../traceability/qr/QRV-... or QRV-... or LOT-...-PKG-001"
                  className="w-full pl-11 pr-4 py-3.5 border border-stone-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 font-mono"
                />
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-stone-400" />
              </div>
              {error && <p className="text-xs text-red-700 mt-1.5 font-medium">{error}</p>}
            </div>

            <button
              type="submit"
              className="w-full py-3.5 px-4 bg-emerald-800 hover:bg-emerald-900 text-white font-semibold rounded-xl text-sm transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <QrCode className="h-4 w-4" />
              Verify Cocoa Chain & Freshness
            </button>
          </form>

          <div className="mt-5 pt-5 border-t border-stone-100 text-xs text-stone-500 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span>Supports scanned URL links, QRV identifiers, and bag package numbers.</span>
            <span className="font-mono text-stone-600">Non-reusable once sold or transferred</span>
          </div>
        </div>

        {/* Feature Overview */}
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="p-5 bg-white rounded-xl border border-stone-200">
            <CheckCircle2 className="h-5 w-5 text-emerald-700 mb-2.5" />
            <h2 className="text-sm font-bold text-stone-900">Single-Custody Anti-Reuse</h2>
            <p className="text-xs text-stone-600 mt-1 leading-relaxed">
              Sold or transferred QR codes retire permanently. Each new owner must generate a fresh QR code for their custody holding.
            </p>
          </div>

          <div className="p-5 bg-white rounded-xl border border-stone-200">
            <Leaf className="h-5 w-5 text-emerald-700 mb-2.5" />
            <h2 className="text-sm font-bold text-stone-900">Remaining Lot Balance</h2>
            <p className="text-xs text-stone-600 mt-1 leading-relaxed">
              Live mass-balance accounting reveals how much cocoa remains unsold at origin and held across downstream custody units.
            </p>
          </div>

          <div className="p-5 bg-white rounded-xl border border-stone-200">
            <FileSearch className="h-5 w-5 text-emerald-700 mb-2.5" />
            <h2 className="text-sm font-bold text-stone-900">Full Origin-to-Buyer Chain</h2>
            <p className="text-xs text-stone-600 mt-1 leading-relaxed">
              Traces the complete path from farm plot, production season, and harvest through every transfer and sale.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
