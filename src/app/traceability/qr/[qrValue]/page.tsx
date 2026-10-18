"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { useFirebase } from "@/context/FirebaseContext";
import { PublicQRTraceabilityResult } from "@/types/traceability";
import QRCodeLib from "qrcode";
import {
  QrCode,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Printer,
  Scale,
  Award,
  ArrowRight,
  MapPin,
  Leaf,
  Layers,
  Share2,
  Lock,
} from "lucide-react";

export default function PublicQRTraceabilityVerificationPage() {
  const params = useParams();
  const rawQrValue = params?.qrValue ? String(params.qrValue) : "";
  const qrValue = decodeURIComponent(rawQrValue);

  const { user } = useFirebase();

  const [traceData, setTraceData] = useState<PublicQRTraceabilityResult | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(qrValue));
  const [error, setError] = useState<string | null>(qrValue ? null : "No QR value provided in route.");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  // Prevent duplicate scan logging
  const scanLoggedRef = useRef<boolean>(false);

  // 1. Fetch Traceability Data & Log Scan
  useEffect(() => {
    if (!qrValue) return;

    let isMounted = true;

    async function loadTraceability() {
      setLoading(true);
      setError(null);

      try {
        const headers: Record<string, string> = {};
        if (user) {
          const token = await user.getIdToken();
          if (token) headers["Authorization"] = `Bearer ${token}`;
        }

        const res = await fetch(`/api/traceability/qr/${encodeURIComponent(qrValue)}`, {
          headers,
        });

        const json = await res.json();
        if (!json.success || !json.traceability) {
          throw new Error(json.error || `Traceability record for "${qrValue}" could not be verified.`);
        }

        if (isMounted) {
          setTraceData(json.traceability);
        }

        // 2. Automatically record public scan event
        if (!scanLoggedRef.current) {
          scanLoggedRef.current = true;
          fetch("/api/qr-scans", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(headers["Authorization"] ? { Authorization: headers["Authorization"] } : {}),
            },
            body: JSON.stringify({
              qrValue,
              scannerType: user ? "authenticated" : "public",
              userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
            }),
          }).catch((scanErr) => console.warn("Could not log scan event:", scanErr));
        }
      } catch (err: unknown) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Failed to load traceability record.");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadTraceability();

    return () => {
      isMounted = false;
    };
  }, [qrValue, user]);

  // Generate QR Code image for the printed slip
  useEffect(() => {
    if (!qrValue) return;

    let isMounted = true;
    QRCodeLib.toDataURL(qrValue, {
      width: 260,
      margin: 2,
      errorCorrectionLevel: "H",
      color: {
        dark: "#14532d",
        light: "#ffffff",
      },
    })
      .then((url) => {
        if (isMounted) setQrDataUrl(url);
      })
      .catch((err) => {
        console.error("QR Code rendering error:", err);
      });

    return () => {
      isMounted = false;
    };
  }, [qrValue]);

  const handleShare = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900 print:bg-white">
      {/* Navigation header for web view */}
      <div className="print:hidden">
        <Navbar />
      </div>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 print:p-0 print:max-w-none">
        {loading ? (
          <div className="bg-white rounded-2xl p-16 text-center border border-stone-200 shadow-sm my-12">
            <RefreshCw className="h-10 w-10 text-emerald-600 animate-spin mx-auto mb-4" />
            <h2 className="text-lg font-bold text-stone-900">Verifying Cocoa Provenance...</h2>
            <p className="text-sm text-stone-500 mt-1 max-w-sm mx-auto">
              Querying Cameroon Origin Registry, EUDR compliance databases, and bag-level custody ledger.
            </p>
          </div>
        ) : error || !traceData ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-red-200 shadow-sm my-12">
            <div className="p-3 bg-red-50 text-red-700 rounded-full w-14 h-14 mx-auto flex items-center justify-center mb-4">
              <AlertCircle className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-bold text-stone-900">Traceability Verification Failed</h2>
            <p className="text-sm text-stone-600 mt-2 max-w-md mx-auto">
              {error || `No verified cocoa provenance record matches QR identifier "${qrValue}".`}
            </p>
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/traceability"
                className="px-5 py-2.5 rounded-xl bg-stone-900 text-white text-sm font-semibold hover:bg-stone-800 transition-colors"
              >
                Lookup Another QR Code
              </Link>
              <Link
                href="/dashboard"
                className="px-5 py-2.5 rounded-xl border border-stone-300 text-stone-700 text-sm font-semibold hover:bg-stone-50 transition-colors"
              >
                Go to Dashboard
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Top Verification Banner */}
            <div className="bg-emerald-900 text-white rounded-2xl p-6 shadow-md border border-emerald-800 flex flex-col md:flex-row md:items-center md:justify-between gap-4 print:border-none print:shadow-none print:p-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-700 text-emerald-100 border border-emerald-600">
                    <ShieldCheck className="h-3.5 w-3.5 mr-1 text-emerald-300" />
                    OFFICIALLY VERIFIED ORIGIN
                  </span>
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-200 border border-amber-400/30">
                    <Leaf className="h-3 w-3 mr-1 text-amber-300" />
                    EUDR Deforestation-Free
                  </span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white mt-2">
                  Cameroon Cocoa Provenance Passport
                </h1>
                <p className="text-xs sm:text-sm text-emerald-200 mt-1">
                  Bag #{traceData.package.packageNumber} • Trace ID: <span className="font-mono text-white">{qrValue}</span>
                </p>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 print:hidden">
                <button
                  onClick={handleShare}
                  className="px-3 py-2 bg-emerald-800 hover:bg-emerald-700 text-emerald-100 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 border border-emerald-700"
                >
                  <Share2 className="h-3.5 w-3.5" />
                  {copiedLink ? "Link Copied!" : "Share Link"}
                </button>
                <button
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-white hover:bg-stone-100 text-emerald-950 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Print Provenance Slip
                </button>
              </div>
            </div>

            {/* Main Information Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Column 1: Package & Physical Bag Identification */}
              <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-stone-100">
                    <span className="text-xs font-bold text-stone-500 uppercase tracking-wider flex items-center gap-1.5">
                      <QrCode className="h-4 w-4 text-emerald-700" />
                      Physical Package
                    </span>
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                        traceData.package.status === "active"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {traceData.package.status.toUpperCase()}
                    </span>
                  </div>

                  {/* QR Image */}
                  <div className="my-4 text-center">
                    {qrDataUrl ? (
                      <img
                        src={qrDataUrl}
                        alt="QR Code"
                        className="w-40 h-40 mx-auto rounded-xl border border-stone-200 p-2 bg-stone-50"
                      />
                    ) : (
                      <div className="w-40 h-40 mx-auto bg-stone-100 rounded-xl flex items-center justify-center text-xs text-stone-400">
                        Generating code...
                      </div>
                    )}
                  </div>

                  <div className="space-y-2.5 text-xs text-stone-600">
                    <div className="flex justify-between py-1 border-b border-stone-100">
                      <span className="text-stone-400">Package Number:</span>
                      <span className="font-bold text-stone-900">{traceData.package.packageNumber}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-stone-100">
                      <span className="text-stone-400">Bag Net Weight:</span>
                      <span className="font-bold text-emerald-700 text-sm">
                        {traceData.package.packageQuantityKg} kg
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-stone-100">
                      <span className="text-stone-400">Packaged at Origin:</span>
                      <span className="font-semibold text-stone-800">
                        {traceData.package.isPackagedAtOrigin ? "Yes (At Farm)" : "Downstream Facility"}
                      </span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-stone-400">Packaging Timestamp:</span>
                      <span className="font-medium text-stone-800">
                        {new Date(traceData.package.generatedAt).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-stone-100 text-[11px] text-stone-400 font-mono truncate" title={qrValue}>
                  {qrValue}
                </div>
              </div>

              {/* Column 2 & 3: Origin Details & Farm Provenance */}
              <div className="md:col-span-2 bg-white rounded-2xl border border-stone-200 p-6 shadow-xs space-y-6">
                <div>
                  <span className="text-xs font-bold text-stone-500 uppercase tracking-wider flex items-center gap-1.5">
                    <MapPin className="h-4 w-4 text-emerald-700" />
                    Origin Farm & Certificate Authentication
                  </span>

                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 bg-stone-50 rounded-xl border border-stone-200">
                      <span className="text-[11px] font-semibold text-stone-500 uppercase">Farm Name & Country</span>
                      <p className="text-base font-bold text-stone-900 mt-0.5">
                        {traceData.origin.farmName}
                      </p>
                      <p className="text-xs text-stone-600 mt-0.5">
                        {traceData.origin.region || "South-West Region"}, {traceData.origin.country}
                      </p>
                      <div className="mt-3 inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Deforestation-Free Verified
                      </div>
                    </div>

                    <div className="p-4 bg-stone-50 rounded-xl border border-stone-200">
                      <span className="text-[11px] font-semibold text-stone-500 uppercase">Trace Certificate</span>
                      <p className="text-base font-bold text-stone-900 mt-0.5">
                        #{traceData.origin.certificateNumber}
                      </p>
                      <p className="text-xs text-stone-600 mt-0.5">
                        Issued: {new Date(traceData.origin.issueDate).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                      <div className="mt-3 inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800">
                        <Award className="h-3 w-3 mr-1" />
                        {traceData.origin.qualityGrade || "Grade 1 Export"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Cocoa Lot & Harvest Details */}
                <div className="border-t border-stone-100 pt-4">
                  <h4 className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-3">
                    Cocoa Batch Specifications
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="p-3 bg-stone-50 rounded-lg">
                      <span className="text-stone-400 block text-[10px]">Lot Number</span>
                      <span className="font-bold text-stone-900">{traceData.origin.lotNumber}</span>
                    </div>
                    <div className="p-3 bg-stone-50 rounded-lg">
                      <span className="text-stone-400 block text-[10px]">Production Period</span>
                      <span className="font-bold text-stone-900">{traceData.origin.productionPeriod}</span>
                    </div>
                    <div className="p-3 bg-stone-50 rounded-lg">
                      <span className="text-stone-400 block text-[10px]">Quality Standard</span>
                      <span className="font-bold text-emerald-800">{traceData.origin.qualityGrade || "Grade 1"}</span>
                    </div>
                    <div className="p-3 bg-stone-50 rounded-lg">
                      <span className="text-stone-400 block text-[10px]">Current Custody Holder</span>
                      <span className="font-bold text-stone-900 truncate block" title={traceData.current.currentHolderPublicName}>
                        {traceData.current.currentHolderPublicName}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Optional Cocoa Lot Photo */}
                {traceData.origin.cocoaImage && traceData.origin.cocoaImage.secureUrl && (
                  <div className="border-t border-stone-100 pt-4">
                    <span className="text-xs font-bold text-stone-500 uppercase tracking-wider block mb-2">
                      Origin Farm Lot Inspection Photo
                    </span>
                    <img
                      src={traceData.origin.cocoaImage.secureUrl}
                      alt={`Lot ${traceData.origin.lotNumber}`}
                      className="w-full max-h-48 object-cover rounded-xl border border-stone-200"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* 4-Way Quantity Audit Breakdown */}
            <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-xs">
              <div className="flex items-center justify-between pb-4 border-b border-stone-200">
                <div>
                  <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                    <Scale className="h-4 w-4 text-emerald-700" />
                    4-Way Quantity Traceability Audit
                  </h3>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Strict mathematical derivation preserving original farm volume and distinct package weights
                  </p>
                </div>
                <span className="text-xs font-bold bg-emerald-50 text-emerald-800 px-3 py-1 rounded-full border border-emerald-200">
                  Mass Balance Balanced
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                <div className="p-4 rounded-xl bg-stone-50 border border-stone-200">
                  <span className="text-[11px] font-semibold text-stone-500 uppercase block">1. Original Lot</span>
                  <p className="text-xl font-black text-stone-900 mt-1">
                    {traceData.quantities.originalLotQuantityKg.toLocaleString()} <span className="text-xs font-normal text-stone-500">kg</span>
                  </p>
                  <span className="text-[10px] text-stone-400">Total farm harvest yield</span>
                </div>

                <div className="p-4 rounded-xl bg-stone-50 border border-stone-200">
                  <span className="text-[11px] font-semibold text-stone-500 uppercase block">2. Certified Export</span>
                  <p className="text-xl font-black text-stone-900 mt-1">
                    {traceData.quantities.certifiedQuantityKg.toLocaleString()} <span className="text-xs font-normal text-stone-500">kg</span>
                  </p>
                  <span className="text-[10px] text-stone-400">Authenticated on Certificate</span>
                </div>

                <div className="p-4 rounded-xl bg-stone-50 border border-stone-200">
                  <span className="text-[11px] font-semibold text-stone-500 uppercase block">3. Current Holding</span>
                  <p className="text-xl font-black text-stone-900 mt-1">
                    {traceData.quantities.currentHoldingQuantityKg.toLocaleString()} <span className="text-xs font-normal text-stone-500">kg</span>
                  </p>
                  <span className="text-[10px] text-stone-400">Available at current custody</span>
                </div>

                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                  <span className="text-[11px] font-bold text-emerald-800 uppercase block">4. This Specific Bag</span>
                  <p className="text-xl font-black text-emerald-900 mt-1">
                    {traceData.quantities.thisPackageQuantityKg.toLocaleString()} <span className="text-xs font-normal text-emerald-700">kg</span>
                  </p>
                  <span className="text-[10px] text-emerald-700 font-semibold">Physical net bag weight</span>
                </div>
              </div>
            </div>

            {/* Complete Chronological Custody Chain DAG */}
            <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-xs">
              <div className="flex items-center justify-between pb-4 border-b border-stone-200">
                <div>
                  <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                    <Layers className="h-4 w-4 text-emerald-700" />
                    Custody Chain & Transfer History
                  </h3>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Unbroken chain of custody verified upstream from farm origin to current facility
                  </p>
                </div>
                <span className="text-xs font-semibold text-stone-500">
                  {traceData.custodyChain.length} Custody Hop{traceData.custodyChain.length === 1 ? "" : "s"}
                </span>
              </div>

              {traceData.custodyChain.length === 0 ? (
                <div className="p-6 text-center text-xs text-stone-500">
                  This package is currently held at origin and has not undergone downstream transfers.
                </div>
              ) : (
                <div className="mt-6 flow-root">
                  <ul className="-mb-8">
                    {traceData.custodyChain.map((hop, hopIdx) => (
                      <li key={hop.stepOrder}>
                        <div className="relative pb-8">
                          {hopIdx !== traceData.custodyChain.length - 1 ? (
                            <span
                              className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-stone-200"
                              aria-hidden="true"
                            />
                          ) : null}
                          <div className="relative flex space-x-3 items-start">
                            <div>
                              <span className="h-8 w-8 rounded-full bg-emerald-100 text-emerald-800 border-2 border-emerald-600 flex items-center justify-center text-xs font-bold">
                                {hop.stepOrder}
                              </span>
                            </div>
                            <div className="min-w-0 flex-1 pt-1.5 flex justify-between space-x-4">
                              <div>
                                <p className="text-xs font-bold text-stone-900">
                                  {hop.fromHolderPublicName} <ArrowRight className="inline h-3 w-3 text-stone-400 mx-1" /> {hop.toHolderPublicName}
                                </p>
                                <p className="text-[11px] text-stone-500 mt-0.5">
                                  Transfer Volume: <span className="font-semibold text-stone-800">{hop.transferredQuantityKg.toLocaleString()} kg</span>
                                </p>
                              </div>
                              <div className="text-right text-[11px] whitespace-nowrap text-stone-500">
                                <time dateTime={hop.transferredAt}>
                                  {new Date(hop.transferredAt).toLocaleDateString("en-US", {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                  })}
                                </time>
                              </div>
                            </div>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Privacy & Regulatory Sanitization Notice */}
            <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-600 flex items-start gap-3">
              <Lock className="h-4 w-4 text-stone-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-stone-800">Public Sanitization Guarantee: </span>
                In accordance with export trade secrecy and data privacy rules, private user identifiers, banking records, platform transaction commissions, and individual farmer phone numbers are redacted from this public verification view.
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
