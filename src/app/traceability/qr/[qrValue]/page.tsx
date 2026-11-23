"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { useFirebase } from "@/context/FirebaseContext";
import { PublicQRTraceabilityResult } from "@/types/traceability";
import { buildQRVerificationUrl } from "@/lib/qrUrl";
import QRCodeLib from "qrcode";
import {
  QrCode,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
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
  Sprout,
  Calendar,
  Package,
  Copy,
  Check,
} from "lucide-react";

function formatDate(iso?: string): string {
  if (!iso) return "N/A";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function PublicQRTraceabilityVerificationPage() {
  const params = useParams();
  const rawQrValue = params?.qrValue ? String(params.qrValue) : "";
  let qrValue = rawQrValue;
  try {
    qrValue = decodeURIComponent(rawQrValue);
  } catch {
    qrValue = rawQrValue;
  }

  const { user } = useFirebase();

  const [traceData, setTraceData] = useState<PublicQRTraceabilityResult | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(qrValue));
  const [error, setError] = useState<string | null>(
    qrValue ? null : "No QR value provided in route."
  );
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  const scanLoggedRef = useRef<boolean>(false);

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

        const res = await fetch(
          `/api/traceability/qr/${encodeURIComponent(qrValue)}`,
          { headers }
        );

        const json = await res.json();
        if (!json.success || !json.traceability) {
          throw new Error(
            json.error ||
              `Traceability record for "${qrValue}" could not be verified.`
          );
        }

        if (isMounted) {
          setTraceData(json.traceability);
        }

        if (!scanLoggedRef.current) {
          scanLoggedRef.current = true;
          fetch("/api/qr-scans", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(headers["Authorization"]
                ? { Authorization: headers["Authorization"] }
                : {}),
            },
            body: JSON.stringify({
              qrValue,
              scannerType: user ? "authenticated" : "public",
            }),
          }).catch((scanErr) =>
            console.warn("Could not log scan event:", scanErr)
          );
        }
      } catch (err: unknown) {
        if (isMounted) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load traceability record."
          );
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

  useEffect(() => {
    if (!qrValue) return;

    let isMounted = true;
    const verificationUrl = buildQRVerificationUrl(
      qrValue,
      typeof window !== "undefined" ? window.location.origin : undefined
    );

    QRCodeLib.toDataURL(verificationUrl, {
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

  const verificationUrl = buildQRVerificationUrl(
    qrValue,
    typeof window !== "undefined" ? window.location.origin : undefined
  );

  const handleShare = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(verificationUrl || window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const freshness = traceData?.freshness;
  const lotBalance = traceData?.lotBalance;
  const upstreamChain = traceData?.upstreamChain;
  const lotMovements = traceData?.lotMovements || [];

  const verdictCode = freshness?.verdictCode || (
    traceData?.package.status === "active"
      ? "MOST_UPDATED_ACTIVE"
      : "REVOKED_OR_INACTIVE"
  );

  const originalLotKg =
    lotBalance?.originalLotQuantityKg ??
    traceData?.quantities.originalLotQuantityKg ??
    0;
  const certifiedKg =
    lotBalance?.certifiedQuantityKg ??
    traceData?.quantities.certifiedQuantityKg ??
    0;
  const soldFromOriginKg = lotBalance?.soldOrTransferredFromOriginKg ?? 0;
  const remainingAtOriginKg = lotBalance?.remainingAtOriginCertifiedKg ?? 0;
  const uncertifiedRemainingKg = lotBalance?.uncertifiedRemainingKg ?? 0;
  const totalRemainingLotKg =
    lotBalance?.totalRemainingInLotKg ?? certifiedKg;

  const soldPct =
    originalLotKg > 0
      ? Math.min(100, Math.round((soldFromOriginKg / originalLotKg) * 100))
      : 0;
  const originRemainPct =
    originalLotKg > 0
      ? Math.min(100, Math.round((remainingAtOriginKg / originalLotKg) * 100))
      : 0;

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900 print:bg-white">
      <div className="print:hidden">
        <Navbar />
      </div>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 print:p-0 print:max-w-none">
        {loading ? (
          <div className="bg-white rounded-2xl p-16 text-center border border-stone-200 shadow-xs my-12">
            <RefreshCw className="h-10 w-10 text-emerald-700 animate-spin mx-auto mb-4" />
            <h2 className="text-lg font-bold text-stone-900">
              Verifying Cocoa Chain & Lot Status...
            </h2>
            <p className="text-sm text-stone-500 mt-1 max-w-sm mx-auto">
              Checking QR freshness, remaining lot balance, and complete Cameroon origin custody lineage.
            </p>
          </div>
        ) : error || !traceData ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-red-200 shadow-xs my-12">
            <div className="p-3 bg-red-50 text-red-700 rounded-full w-14 h-14 mx-auto flex items-center justify-center mb-4">
              <AlertCircle className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-bold text-stone-900">
              Traceability Verification Failed
            </h2>
            <p className="text-sm text-stone-600 mt-2 max-w-md mx-auto">
              {error ||
                `No verified cocoa provenance record matches QR identifier "${qrValue}".`}
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
            {/* 1. Primary Authenticity, Freshness & Anti-Reuse Verdict */}
            <section
              className={`rounded-2xl p-6 border ${
                verdictCode === "MOST_UPDATED_ACTIVE"
                  ? "bg-emerald-950 text-white border-emerald-900"
                  : verdictCode === "OLDER_ACTIVE_LOT_QR"
                    ? "bg-amber-950 text-white border-amber-900"
                    : "bg-red-950 text-white border-red-900"
              } print:border-stone-300 print:shadow-none print:p-4`}
            >
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                    {verdictCode === "MOST_UPDATED_ACTIVE" && (
                      <span className="inline-flex items-center gap-1.5 text-emerald-300">
                        <ShieldCheck className="h-4 w-4" />
                        Most Updated Active Lot QR
                      </span>
                    )}
                    {verdictCode === "OLDER_ACTIVE_LOT_QR" && (
                      <span className="inline-flex items-center gap-1.5 text-amber-300">
                        <AlertTriangle className="h-4 w-4" />
                        Active Package · Newer QR Generated on Lot
                      </span>
                    )}
                    {(verdictCode === "RETIRED_AFTER_SALE" ||
                      verdictCode === "REVOKED_OR_INACTIVE") && (
                      <span className="inline-flex items-center gap-1.5 text-red-200">
                        <ShieldAlert className="h-4 w-4" />
                        Retired / Non-Reusable QR Code
                      </span>
                    )}
                    <span className="text-white/40" aria-hidden="true">·</span>
                    <span className="text-white/80 tabular-nums">
                      QR #{freshness?.qrSequenceNumber ?? 1} of {freshness?.totalLotQRCodes ?? 1} on Lot
                    </span>
                    <span className="text-white/40" aria-hidden="true">·</span>
                    <span className="text-white/80">
                      {traceData.origin.eudrCompliant ? "EUDR Verified" : "Cameroon Origin"}
                    </span>
                  </div>

                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white text-balance">
                    {freshness?.statusHeadline || "Cameroon Cocoa Provenance Passport"}
                  </h1>

                  <p className="text-sm text-white/85 max-w-3xl leading-relaxed">
                    {freshness?.statusDetail ||
                      `Official provenance record for bag ${traceData.package.packageNumber}.`}
                  </p>

                  <p className="text-xs text-white/75 font-mono tabular-nums pt-1">
                    Package {traceData.package.packageNumber} · Lot {traceData.origin.lotNumber} · Cert #{traceData.origin.certificateNumber}
                  </p>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2 shrink-0 print:hidden">
                  <button
                    type="button"
                    onClick={handleShare}
                    className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 border border-white/20 whitespace-nowrap"
                  >
                    {copiedLink ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
                    {copiedLink ? "Link Copied" : "Share Link"}
                  </button>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="px-4 py-2 bg-white hover:bg-stone-100 text-stone-900 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Print Slip
                  </button>
                </div>
              </div>

              {/* Explicit Freshness / Non-Reuse Strip */}
              <div className="mt-5 pt-4 border-t border-white/15 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div>
                  <span className="text-white/60 block">Most Updated Lot QR?</span>
                  <span className="font-semibold text-white mt-0.5 block">
                    {freshness?.isMostUpdatedForLot
                      ? "Yes — This is the latest QR for this lot"
                      : freshness?.isRetiredAfterSale
                        ? "No — Retired after sale / custody transfer"
                        : `No — ${freshness?.newerQRsGeneratedCount ?? 0} newer QR(s) exist${
                            freshness?.latestActivePackageNumber
                              ? ` (Latest: ${freshness.latestActivePackageNumber})`
                              : ""
                          }`}
                  </span>
                </div>

                <div>
                  <span className="text-white/60 block">Can This QR Be Reused After Sale?</span>
                  <span className="font-semibold text-white mt-0.5 block">
                    No — QR codes lock to one holder &amp; retire on transfer; the buyer must generate a new QR.
                  </span>
                </div>

                <div>
                  <span className="text-white/60 block">Replacement / Recipient QR Status</span>
                  <span className="font-semibold text-white mt-0.5 block">
                    {freshness?.isRetiredAfterSale
                      ? freshness.buyerHasGeneratedReplacementQR
                        ? "Recipient has already generated a new QR code."
                        : "Awaiting recipient to generate their own new QR code."
                      : "Active under current custody holder."}
                  </span>
                </div>
              </div>
            </section>

            {/* 2. How Much Cocoa Is Left in This Lot */}
            <section className="bg-white rounded-2xl border border-stone-200 p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-stone-200">
                <div>
                  <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
                    <Scale className="h-4 w-4 text-emerald-700" />
                    How Much Cocoa Is Left in Lot {traceData.origin.lotNumber}
                  </h2>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Real-time mass-balance accounting across origin harvest, sold/transferred volumes, and active holdings
                  </p>
                </div>
                <span className="text-xs font-semibold text-emerald-800 tabular-nums whitespace-nowrap">
                  {freshness?.activeLotQRCodes ?? 0} Active Bag QR(s) on Lot
                </span>
              </div>

              {/* 5-Column Mass Balance KPI Grid */}
              <div className="mt-5 grid grid-cols-2 lg:grid-cols-5 gap-4 tabular-nums">
                <div className="p-4 rounded-xl bg-stone-50 border border-stone-200">
                  <span className="text-xs text-stone-500 block">Original Lot Yield</span>
                  <p className="text-2xl font-bold text-stone-900 mt-1">
                    {originalLotKg.toLocaleString()} <span className="text-xs font-normal text-stone-500">kg</span>
                  </p>
                  <span className="text-[11px] text-stone-500 block mt-0.5">
                    Certified: {certifiedKg.toLocaleString()} kg
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-stone-50 border border-stone-200">
                  <span className="text-xs text-stone-500 block">Sold / Transferred Out</span>
                  <p className="text-2xl font-bold text-stone-900 mt-1">
                    {soldFromOriginKg.toLocaleString()} <span className="text-xs font-normal text-stone-500">kg</span>
                  </p>
                  <span className="text-[11px] text-stone-500 block mt-0.5">
                    Moved downstream from origin
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                  <span className="text-xs font-semibold text-emerald-800 block">Remaining Left in Lot</span>
                  <p className="text-2xl font-bold text-emerald-950 mt-1">
                    {totalRemainingLotKg.toLocaleString()} <span className="text-xs font-normal text-emerald-800">kg</span>
                  </p>
                  <span className="text-[11px] text-emerald-800 block mt-0.5">
                    Total active certified + uncertified
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-stone-50 border border-stone-200">
                  <span className="text-xs text-stone-500 block">Unsold at Origin Farm</span>
                  <p className="text-2xl font-bold text-stone-900 mt-1">
                    {remainingAtOriginKg.toLocaleString()} <span className="text-xs font-normal text-stone-500">kg</span>
                  </p>
                  <span className="text-[11px] text-stone-500 block mt-0.5">
                    + {uncertifiedRemainingKg.toLocaleString()} kg uncertified
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 col-span-2 lg:col-span-1">
                  <span className="text-xs font-semibold text-amber-900 block">This Bag / Holding</span>
                  <p className="text-2xl font-bold text-amber-950 mt-1">
                    {traceData.quantities.thisPackageQuantityKg.toLocaleString()} <span className="text-xs font-normal text-amber-800">kg</span>
                  </p>
                  <span className="text-[11px] text-amber-900 block mt-0.5">
                    Holding avail: {(lotBalance?.currentHoldingAvailableKg ?? traceData.quantities.currentHoldingQuantityKg).toLocaleString()} kg
                  </span>
                </div>
              </div>

              {/* Distribution Bar */}
              {originalLotKg > 0 && (
                <div className="mt-5 pt-4 border-t border-stone-100">
                  <div className="flex items-center justify-between text-xs text-stone-600 mb-2 tabular-nums">
                    <span>Lot Volume Distribution ({originalLotKg.toLocaleString()} kg original)</span>
                    <span>
                      {soldPct}% moved downstream · {originRemainPct}% certified unsold at origin
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-stone-200 rounded-full overflow-hidden flex">
                    <div
                      className="bg-amber-600 h-full"
                      style={{ width: `${soldPct}%` }}
                      title={`Sold / Transferred from origin: ${soldFromOriginKg} kg`}
                    />
                    <div
                      className="bg-emerald-700 h-full"
                      style={{ width: `${originRemainPct}%` }}
                      title={`Remaining certified at origin: ${remainingAtOriginKg} kg`}
                    />
                  </div>
                </div>
              )}

              {/* Per-Holder Lot Balance Table */}
              {lotBalance && lotBalance.lotHolderBalances.length > 0 && (
                <div className="mt-5 pt-4 border-t border-stone-100">
                  <h3 className="text-xs font-semibold text-stone-700 uppercase tracking-wider mb-3">
                    Current Cocoa Allocation Across Lot Holders
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs text-left divide-y divide-stone-200">
                      <thead className="bg-stone-50 text-stone-600 font-semibold">
                        <tr>
                          <th className="px-3 py-2.5">Custody Holder</th>
                          <th className="px-3 py-2.5">Status</th>
                          <th className="px-3 py-2.5 text-right">Assigned</th>
                          <th className="px-3 py-2.5 text-right">Remaining Available</th>
                          <th className="px-3 py-2.5 text-right">Packaged (Active QRs)</th>
                          <th className="px-3 py-2.5 text-right">Unpackaged Bulk</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100 tabular-nums">
                        {lotBalance.lotHolderBalances.map((hb, idx) => (
                          <tr key={`${hb.holderLabel}-${idx}`} className="hover:bg-stone-50">
                            <td className="px-3 py-2.5 font-medium text-stone-900">
                              {hb.holderLabel}
                              {hb.isOrigin && (
                                <span className="ml-2 text-[11px] font-normal text-emerald-700">
                                  (Origin)
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-stone-600 capitalize">
                              {hb.status.replace(/_/g, " ")}
                            </td>
                            <td className="px-3 py-2.5 text-right text-stone-700">
                              {hb.quantityKg.toLocaleString()} kg
                            </td>
                            <td className="px-3 py-2.5 text-right font-semibold text-stone-900">
                              {hb.availableKg.toLocaleString()} kg
                            </td>
                            <td className="px-3 py-2.5 text-right text-stone-700">
                              {hb.packagedKg.toLocaleString()} kg
                            </td>
                            <td className="px-3 py-2.5 text-right text-emerald-800 font-medium">
                              {hb.unpackagedKg.toLocaleString()} kg
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>

            {/* 3. Physical Package & Origin Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Column 1: Physical Package & Scannable Code */}
              <div className="bg-white rounded-2xl border border-stone-200 p-6 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-stone-100">
                    <span className="text-xs font-semibold text-stone-600 uppercase tracking-wider flex items-center gap-1.5">
                      <QrCode className="h-4 w-4 text-emerald-700" />
                      Scanned QR Package
                    </span>
                    <span
                      className={`text-xs font-semibold ${
                        freshness?.isValidAndActive
                          ? "text-emerald-800"
                          : "text-red-700"
                      }`}
                    >
                      {freshness?.isRetiredAfterSale
                        ? "RETIRED (SOLD)"
                        : traceData.package.status.toUpperCase()}
                    </span>
                  </div>

                  <div className="my-4 text-center">
                    {qrDataUrl ? (
                      <img
                        src={qrDataUrl}
                        alt={`QR Code for ${traceData.package.packageNumber}`}
                        className="w-40 h-40 mx-auto rounded-xl border border-stone-200 p-2 bg-stone-50"
                      />
                    ) : (
                      <div className="w-40 h-40 mx-auto bg-stone-100 rounded-xl flex items-center justify-center text-xs text-stone-400">
                        Rendering QR...
                      </div>
                    )}
                  </div>

                  <div className="space-y-2.5 text-xs text-stone-600 tabular-nums">
                    <div className="flex justify-between py-1 border-b border-stone-100">
                      <span className="text-stone-500">Package Number</span>
                      <span className="font-semibold text-stone-900">
                        {traceData.package.packageNumber}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-stone-100">
                      <span className="text-stone-500">Lot QR Sequence</span>
                      <span className="font-semibold text-stone-900">
                        #{freshness?.qrSequenceNumber ?? 1} of {freshness?.totalLotQRCodes ?? 1}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-stone-100">
                      <span className="text-stone-500">Bag Net Weight</span>
                      <span className="font-bold text-emerald-800 text-sm">
                        {traceData.package.packageQuantityKg.toLocaleString()} kg
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-stone-100">
                      <span className="text-stone-500">Packaged By</span>
                      <span className="font-medium text-stone-800">
                        {traceData.package.isPackagedAtOrigin
                          ? "Origin Farm / Grower"
                          : "Downstream Holder"}
                      </span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-stone-500">Generated Date</span>
                      <span className="font-medium text-stone-800">
                        {formatDate(traceData.package.generatedAt)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-stone-100">
                  <button
                    type="button"
                    onClick={handleShare}
                    className="w-full py-2 px-3 rounded-lg border border-stone-200 hover:bg-stone-50 text-xs font-medium text-stone-700 flex items-center justify-center gap-1.5 transition-colors"
                  >
                    {copiedLink ? <Check className="h-3.5 w-3.5 text-emerald-700" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedLink ? "Copied Verification URL" : "Copy Verification URL"}
                  </button>
                  <p className="mt-2 text-[11px] text-stone-400 font-mono truncate text-center" title={verificationUrl}>
                    {qrValue}
                  </p>
                </div>
              </div>

              {/* Column 2 & 3: Complete Upstream Chain of This Lot */}
              <div className="md:col-span-2 bg-white rounded-2xl border border-stone-200 p-6 space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-stone-100">
                  <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
                    <Sprout className="h-4 w-4 text-emerald-700" />
                    Upstream Origin Chain (Farm to Certificate)
                  </h2>
                  <span className="text-xs text-stone-500">
                    {traceData.origin.country} Verified Origin
                  </span>
                </div>

                {/* Vertical Upstream Chain Stepper */}
                <div className="space-y-4">
                  {/* Stage 1: Farm */}
                  <div className="flex items-start gap-3 pb-4 border-b border-stone-100">
                    <div className="p-2 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 shrink-0">
                      <MapPin className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-bold text-stone-900">
                          1. Farm Origin — {upstreamChain?.farm.farmName || traceData.origin.farmName}
                        </h3>
                        <span className="text-xs font-medium text-emerald-800 flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {(upstreamChain?.farm.eudrCompliant ?? traceData.origin.eudrCompliant)
                            ? "EUDR Deforestation-Free"
                            : "Registered Origin Farm"}
                        </span>
                      </div>
                      <p className="text-xs text-stone-600 mt-1">
                        {[
                          upstreamChain?.farm.village,
                          upstreamChain?.farm.region || traceData.origin.region,
                          traceData.origin.country,
                        ]
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                    </div>
                  </div>

                  {/* Stage 2: Production Season */}
                  {upstreamChain?.production && (
                    <div className="flex items-start gap-3 pb-4 border-b border-stone-100">
                      <div className="p-2 rounded-lg bg-stone-100 text-stone-700 border border-stone-200 shrink-0">
                        <Calendar className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="text-sm font-bold text-stone-900">
                            2. Production Season — {upstreamChain.production.seasonYear}
                          </h3>
                          <span className="text-xs text-stone-600 capitalize">
                            {upstreamChain.production.status}
                          </span>
                        </div>
                        <p className="text-xs text-stone-600 mt-1 tabular-nums">
                          {upstreamChain.production.productionPeriod} · Window:{" "}
                          {formatDate(upstreamChain.production.startDate)}
                          {upstreamChain.production.endDate
                            ? ` to ${formatDate(upstreamChain.production.endDate)}`
                            : ""}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Stage 3: Harvest */}
                  {upstreamChain?.harvest && (
                    <div className="flex items-start gap-3 pb-4 border-b border-stone-100">
                      <div className="p-2 rounded-lg bg-stone-100 text-stone-700 border border-stone-200 shrink-0">
                        <Leaf className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="text-sm font-bold text-stone-900">
                            3. Recorded Harvest Batch
                          </h3>
                          <span className="text-xs font-semibold text-stone-800 tabular-nums">
                            {upstreamChain.harvest.quantityKg.toLocaleString()} kg harvested
                          </span>
                        </div>
                        <p className="text-xs text-stone-600 mt-1 tabular-nums">
                          Harvested on {formatDate(upstreamChain.harvest.harvestDate)}
                          {upstreamChain.harvest.qualityGrade
                            ? ` · Grade: ${upstreamChain.harvest.qualityGrade}`
                            : ""}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Stage 4: Cocoa Lot */}
                  <div className="flex items-start gap-3 pb-4 border-b border-stone-100">
                    <div className="p-2 rounded-lg bg-stone-100 text-stone-700 border border-stone-200 shrink-0">
                      <Package className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-bold text-stone-900">
                          4. Traceable Cocoa Lot — {upstreamChain?.lot.lotNumber || traceData.origin.lotNumber}
                        </h3>
                        <span className="text-xs font-semibold text-stone-800 tabular-nums">
                          {originalLotKg.toLocaleString()} kg initial lot
                        </span>
                      </div>
                      <p className="text-xs text-stone-600 mt-1 tabular-nums">
                        Period: {upstreamChain?.lot.productionPeriod || traceData.origin.productionPeriod || "Cameroon Crop"}
                        {(upstreamChain?.lot.qualityGrade || traceData.origin.qualityGrade)
                          ? ` · Grade: ${upstreamChain?.lot.qualityGrade || traceData.origin.qualityGrade}`
                          : ""}
                        {upstreamChain?.lot.lotStatus
                          ? ` · Status: ${upstreamChain.lot.lotStatus.replace(/_/g, " ")}`
                          : ""}
                      </p>
                    </div>
                  </div>

                  {/* Stage 5: Origin Trace Certificate */}
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
                      <Award className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-bold text-stone-900">
                          5. Origin Trace Certificate #{traceData.origin.certificateNumber}
                        </h3>
                        <span className="text-xs font-semibold text-emerald-800 tabular-nums">
                          {certifiedKg.toLocaleString()} kg certified
                        </span>
                      </div>
                      <p className="text-xs text-stone-600 mt-1 tabular-nums">
                        Issued {formatDate(traceData.origin.issueDate)} · Current Bag Holder:{" "}
                        <span className="font-semibold text-stone-900">
                          {traceData.current.currentHolderPublicName}
                        </span>
                      </p>
                    </div>
                  </div>
                </div>

                {traceData.origin.cocoaImage && traceData.origin.cocoaImage.secureUrl && (
                  <div className="border-t border-stone-100 pt-4">
                    <span className="text-xs font-semibold text-stone-600 block mb-2">
                      Lot Verification Photo
                    </span>
                    <img
                      src={traceData.origin.cocoaImage.secureUrl}
                      alt={`Cocoa Lot ${traceData.origin.lotNumber}`}
                      referrerPolicy="no-referrer"
                      className="w-full max-h-48 object-cover rounded-xl border border-stone-200"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* 4. Full Lot & QR Custody Movement Chain */}
            <section className="bg-white rounded-2xl border border-stone-200 p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-stone-200">
                <div>
                  <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
                    <Layers className="h-4 w-4 text-emerald-700" />
                    Complete Lot Transfer &amp; Sales Chain
                  </h2>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Every transfer and sale recorded for lot {traceData.origin.lotNumber}, highlighting this QR code&apos;s direct custody path and recipient QR regeneration status
                  </p>
                </div>
                <span className="text-xs font-semibold text-stone-600 tabular-nums whitespace-nowrap">
                  {lotMovements.length > 0
                    ? `${lotMovements.length} Recorded Movement${lotMovements.length === 1 ? "" : "s"}`
                    : `${traceData.custodyChain.length} Custody Hop${traceData.custodyChain.length === 1 ? "" : "s"}`}
                </span>
              </div>

              {lotMovements.length === 0 && traceData.custodyChain.length === 0 ? (
                <div className="p-6 text-center text-xs text-stone-500">
                  No downstream sales or transfers have occurred yet — cocoa remains with the origin holder.
                </div>
              ) : lotMovements.length > 0 ? (
                <div className="mt-5 space-y-4">
                  {lotMovements.map((move) => (
                    <div
                      key={`${move.stepOrder}-${move.timestamp}`}
                      className={`p-4 rounded-xl border ${
                        move.inThisQrLineage
                          ? "bg-emerald-50/50 border-emerald-200"
                          : "bg-stone-50 border-stone-200"
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="h-6 w-6 rounded-full bg-stone-900 text-white text-xs font-bold flex items-center justify-center shrink-0 tabular-nums">
                            {move.stepOrder}
                          </span>
                          <span className="text-sm font-bold text-stone-900">
                            {move.fromHolderLabel}
                            <ArrowRight className="inline h-3.5 w-3.5 text-stone-500 mx-1.5" />
                            {move.toHolderLabel}
                          </span>
                          {move.inThisQrLineage && (
                            <span className="text-xs font-semibold text-emerald-800">
                              · Direct Path of This QR
                            </span>
                          )}
                        </div>

                        <div className="text-xs text-stone-600 tabular-nums whitespace-nowrap">
                          {formatDate(move.timestamp)}
                        </div>
                      </div>

                      <div className="mt-2 pl-8 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-600 tabular-nums">
                        <span>
                          Volume Moved:{" "}
                          <strong className="text-stone-900">
                            {move.quantityKg.toLocaleString()} kg
                          </strong>
                        </span>
                        <span className="capitalize">
                          Type: {move.eventType === "trade" ? "Marketplace Sale" : "Certificate Transfer"} ({move.status})
                        </span>
                        <span>
                          Recipient QR Status:{" "}
                          <strong
                            className={
                              move.buyerGeneratedQrCount > 0
                                ? "text-emerald-800"
                                : "text-amber-800"
                            }
                          >
                            {move.buyerGeneratedQrCount > 0
                              ? `Recipient generated ${move.buyerGeneratedQrCount} new QR code(s)`
                              : "Seller QR retired · Recipient generates own new QR"}
                          </strong>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-5 space-y-4">
                  {traceData.custodyChain.map((hop) => (
                    <div
                      key={hop.stepOrder}
                      className="p-4 rounded-xl border bg-stone-50 border-stone-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="h-6 w-6 rounded-full bg-stone-900 text-white text-xs font-bold flex items-center justify-center shrink-0 tabular-nums">
                          {hop.stepOrder}
                        </span>
                        <div>
                          <p className="text-sm font-bold text-stone-900">
                            {hop.fromHolderPublicName}{" "}
                            <ArrowRight className="inline h-3.5 w-3.5 text-stone-500 mx-1" />{" "}
                            {hop.toHolderPublicName}
                          </p>
                          <p className="text-xs text-stone-600 tabular-nums">
                            Transfer Volume: <strong>{hop.transferredQuantityKg.toLocaleString()} kg</strong>
                          </p>
                        </div>
                      </div>
                      <time dateTime={hop.transferredAt} className="text-xs text-stone-500 tabular-nums">
                        {formatDate(hop.transferredAt)}
                      </time>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Privacy & Regulatory Sanitization Notice */}
            <div className="p-4 rounded-xl bg-white border border-stone-200 text-xs text-stone-600 flex items-start gap-3">
              <Lock className="h-4 w-4 text-stone-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-stone-800">
                  Public Sanitization &amp; Single-Use Anti-Reuse Guarantee:{" "}
                </span>
                Private user IDs, email addresses, telephone numbers, and commercial financial fees are redacted. Every QR code is bound to one holder&apos;s custody balance; once sold or transferred, it retires permanently so the buyer must issue their own QR code.
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
