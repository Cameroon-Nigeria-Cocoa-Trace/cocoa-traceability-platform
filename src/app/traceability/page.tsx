"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import jsQR from "jsqr";
import { Navbar } from "@/components/Navbar";
import {
  extractQrValueFromInput,
  isTraceTradeNetworkQrInput,
} from "@/lib/qrUrl";
import { PublicQRTraceabilityResult } from "@/types/traceability";
import {
  QrCode,
  Search,
  Camera,
  Upload,
  CheckCircle2,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  ExternalLink,
  X,
  Scale,
  MapPin,
  Layers,
  Award,
  Sprout,
} from "lucide-react";

type VerifyMode = "search" | "scan";

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

export default function TraceabilityPortalPage() {
  const [mode, setMode] = useState<VerifyMode>("search");
  const [searchValue, setSearchValue] = useState("");
  const [activeQuery, setActiveQuery] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonPlatformNotice, setNonPlatformNotice] = useState<string | null>(null);
  const [traceData, setTraceData] = useState<PublicQRTraceabilityResult | null>(
    null
  );

  // Camera scanner state
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [lastScannedRaw, setLastScannedRaw] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastDecodeAttemptRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const fetchTraceability = useCallback(async (qrIdentifier: string) => {
    const clean = qrIdentifier.trim();
    if (!clean) return;

    setLoading(true);
    setError(null);
    setNonPlatformNotice(null);
    setTraceData(null);
    setActiveQuery(clean);

    try {
      const res = await fetch(
        `/api/traceability/qr/${encodeURIComponent(clean)}`
      );
      const json = await res.json();

      if (!res.ok || !json.success || !json.traceability) {
        throw new Error(
          json.error ||
            `No TraceTradeNetwork cocoa record was found for "${clean}".`
        );
      }

      setTraceData(json.traceability as PublicQRTraceabilityResult);

      // Record read-only scan audit non-blockingly
      fetch("/api/qr-scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qrValue: clean,
          scannerType: "public",
        }),
      }).catch(() => {
        // Non-blocking audit log
      });
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to verify this QR code right now."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const processScannedPayload = useCallback(
    (rawPayload: string) => {
      const trimmed = rawPayload.trim();
      if (!trimmed) return;

      stopCamera();
      setLastScannedRaw(trimmed);

      if (!isTraceTradeNetworkQrInput(trimmed)) {
        setTraceData(null);
        setError(null);
        setNonPlatformNotice(
          "This QR code does not belong to TraceTradeNetwork. Only official TraceTradeNetwork cocoa provenance QR codes or verification links can be verified here."
        );
        return;
      }

      const extracted = extractQrValueFromInput(trimmed);
      if (!extracted) {
        setNonPlatformNotice(
          "Could not extract a valid TraceTradeNetwork QR identifier from this code."
        );
        return;
      }

      setSearchValue(extracted);
      void fetchTraceability(extracted);
    },
    [fetchTraceability, stopCamera]
  );

  const startCamera = async () => {
    setCameraError(null);
    setNonPlatformNotice(null);
    setError(null);
    setLastScannedRaw(null);

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setCameraError(
        "Camera access is not available in this browser or context. You can upload a QR image below or type the QR Code ID manually."
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      setCameraActive(true);

      const tick = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || !streamRef.current) return;

        const now = performance.now();
        if (now - lastDecodeAttemptRef.current >= 120) {
          lastDecodeAttemptRef.current = now;
          if (
            video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA &&
            video.videoWidth > 0 &&
            video.videoHeight > 0
          ) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext("2d", { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const imageData = ctx.getImageData(
                0,
                0,
                canvas.width,
                canvas.height
              );
              const decoded = jsQR(
                imageData.data,
                imageData.width,
                imageData.height,
                { inversionAttempts: "attemptBoth" }
              );
              if (decoded && decoded.data) {
                processScannedPayload(decoded.data);
                return;
              }
            }
          }
        }

        rafRef.current = requestAnimationFrame(tick);
      };

      // Attach stream once video element mounts
      requestAnimationFrame(() => {
        if (videoRef.current && streamRef.current) {
          videoRef.current.srcObject = streamRef.current;
          videoRef.current
            .play()
            .then(() => {
              rafRef.current = requestAnimationFrame(tick);
            })
            .catch(() => {
              setCameraError(
                "Unable to start camera preview. Please check camera permissions."
              );
              stopCamera();
            });
        }
      });
    } catch {
      setCameraError(
        "Camera permission was denied or no camera device was found. Please allow camera access or upload a QR code image."
      );
      stopCamera();
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setCameraError(null);
    setNonPlatformNotice(null);
    setError(null);
    setLastScannedRaw(null);

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          setCameraError("Failed to inspect the uploaded image.");
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const decoded = jsQR(
          imageData.data,
          imageData.width,
          imageData.height,
          { inversionAttempts: "attemptBoth" }
        );

        if (!decoded || !decoded.data) {
          setCameraError(
            "No QR code could be detected in that image. Make sure the QR code is sharp and unobstructed."
          );
          return;
        }

        processScannedPayload(decoded.data);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setCameraError("Could not read the selected image file.");
    };
    img.src = objectUrl;
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const extracted = extractQrValueFromInput(searchValue);
    if (!extracted) {
      setError(
        "Enter the QR Code ID printed below the barcode (e.g. QRV-...), package number, or verification URL."
      );
      return;
    }
    void fetchTraceability(extracted);
  };

  const handleModeSwitch = (nextMode: VerifyMode) => {
    if (nextMode !== "scan") {
      stopCamera();
    }
    setMode(nextMode);
    setCameraError(null);
    setNonPlatformNotice(null);
  };

  const resetResults = () => {
    setTraceData(null);
    setError(null);
    setNonPlatformNotice(null);
    setActiveQuery("");
    setSearchValue("");
    setLastScannedRaw(null);
  };

  const freshness = traceData?.freshness;
  const lotBalance = traceData?.lotBalance;
  const lotMovements = traceData?.lotMovements || [];
  const verdictCode =
    freshness?.verdictCode ||
    (traceData?.package.status === "active"
      ? "MOST_UPDATED_ACTIVE"
      : "REVOKED_OR_INACTIVE");

  const originalLotKg =
    lotBalance?.originalLotQuantityKg ??
    traceData?.quantities.originalLotQuantityKg ??
    0;
  const certifiedKg =
    lotBalance?.certifiedQuantityKg ??
    traceData?.quantities.certifiedQuantityKg ??
    0;
  const soldFromOriginKg = lotBalance?.soldOrTransferredFromOriginKg ?? 0;
  const remainingInLotKg = lotBalance?.totalRemainingInLotKg ?? certifiedKg;
  const remainingAtOriginKg = lotBalance?.remainingAtOriginCertifiedKg ?? 0;

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <Navbar />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-16">
        {/* Hero Header */}
        <header className="text-center max-w-3xl mx-auto space-y-3">
          <p className="text-xs font-semibold tracking-wider text-emerald-800 uppercase flex items-center justify-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-emerald-700" />
            TraceTradeNetwork Public Verification Registry
          </p>

          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-stone-900 text-balance">
            Verify Cocoa Lot &amp; QR Traceability
          </h1>

          <p className="text-base text-stone-600 leading-relaxed">
            Enter the QR Code ID printed beneath the barcode or scan a physical
            bag QR code to verify lot authenticity, remaining cocoa balance, and
            full Cameroon origin custody.
          </p>
        </header>

        {/* Verification Workbench Card */}
        <section className="mt-8 bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
          {/* Interactive Mode Switcher */}
          <div className="p-4 sm:px-6 bg-stone-50 border-b border-stone-200 flex flex-wrap items-center justify-between gap-3">
            <div
              className="inline-flex items-center gap-1 p-1 bg-stone-200/70 rounded-xl"
              role="tablist"
              aria-label="Traceability lookup method"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mode === "search"}
                onClick={() => handleModeSwitch("search")}
                className={`px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap ${
                  mode === "search"
                    ? "bg-white text-stone-900 shadow-xs"
                    : "text-stone-600 hover:text-stone-900"
                }`}
              >
                <Search className="h-4 w-4" />
                Search by QR ID
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={mode === "scan"}
                onClick={() => handleModeSwitch("scan")}
                className={`px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap ${
                  mode === "scan"
                    ? "bg-white text-stone-900 shadow-xs"
                    : "text-stone-600 hover:text-stone-900"
                }`}
              >
                <Camera className="h-4 w-4" />
                Scan QR Code
              </button>
            </div>

            <span className="text-xs text-stone-500 font-medium">
              Open public access · No login required
            </span>
          </div>

          <div className="p-6 sm:p-8">
            {mode === "search" ? (
              <form onSubmit={handleSearchSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="qr-id-input"
                    className="block text-xs font-semibold text-stone-700 mb-2"
                  >
                    QR Code ID, Package Number, or TraceTradeNetwork URL
                  </label>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                      <input
                        id="qr-id-input"
                        type="text"
                        value={searchValue}
                        onChange={(e) => {
                          setSearchValue(e.target.value);
                          if (error) setError(null);
                          if (nonPlatformNotice) setNonPlatformNotice(null);
                        }}
                        placeholder="e.g. QRV-LOT-2026-001-001-AB12CD or LOT-2026-001-PKG-001"
                        className="w-full pl-11 pr-4 py-3.5 border border-stone-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700 font-mono"
                      />
                      <QrCode className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-stone-400" />
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="py-3.5 px-6 bg-emerald-800 hover:bg-emerald-900 disabled:opacity-60 text-white font-semibold rounded-xl text-sm transition-colors flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
                    >
                      {loading ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          Verifying...
                        </>
                      ) : (
                        <>
                          <Search className="h-4 w-4" />
                          Check Traceability
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="pt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
                  <span>
                    Type the ID printed directly below any generated bag QR code.
                  </span>
                  <button
                    type="button"
                    onClick={() => handleModeSwitch("scan")}
                    className="text-emerald-800 font-semibold hover:underline flex items-center gap-1"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    Prefer to scan with your camera?
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
                  {/* Live Camera Scanner */}
                  <div className="rounded-xl border border-stone-200 bg-stone-50 p-5 flex flex-col justify-between">
                    <div>
                      <h2 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                        <Camera className="h-4 w-4 text-emerald-700" />
                        Live Camera QR Scanner
                      </h2>
                      <p className="text-xs text-stone-600 mt-1 leading-relaxed">
                        Point your camera at a TraceTradeNetwork cocoa bag QR
                        label to verify it immediately.
                      </p>
                    </div>

                    <div className="my-4">
                      {cameraActive ? (
                        <div className="relative rounded-xl overflow-hidden bg-stone-900 border border-stone-800 aspect-video flex items-center justify-center">
                          <video
                            ref={videoRef}
                            playsInline
                            muted
                            autoPlay
                            className="w-full h-full object-cover"
                          />
                          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                            <div className="w-44 h-44 border-2 border-emerald-400/90 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-stone-300 bg-white aspect-video flex flex-col items-center justify-center p-6 text-center">
                          <QrCode className="h-10 w-10 text-stone-400 mb-2" />
                          <p className="text-xs text-stone-500 max-w-xs">
                            Camera preview is idle. Start the scanner when ready
                            to read a QR label.
                          </p>
                        </div>
                      )}
                      <canvas ref={canvasRef} className="hidden" />
                    </div>

                    {cameraActive ? (
                      <button
                        type="button"
                        onClick={stopCamera}
                        className="w-full py-2.5 px-4 border border-stone-300 bg-white hover:bg-stone-100 text-stone-800 font-semibold rounded-xl text-xs transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
                      >
                        <X className="h-4 w-4" />
                        Stop Camera
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={startCamera}
                        className="w-full py-2.5 px-4 bg-emerald-800 hover:bg-emerald-900 text-white font-semibold rounded-xl text-xs transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
                      >
                        <Camera className="h-4 w-4" />
                        Start Camera Scanner
                      </button>
                    )}
                  </div>

                  {/* Upload QR Code Image */}
                  <div className="rounded-xl border border-stone-200 bg-stone-50 p-5 flex flex-col justify-between">
                    <div>
                      <h2 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                        <Upload className="h-4 w-4 text-emerald-700" />
                        Scan from QR Image File
                      </h2>
                      <p className="text-xs text-stone-600 mt-1 leading-relaxed">
                        Upload a PNG, JPG, or screenshot of a QR code to decode
                        and verify its TraceTradeNetwork lot record.
                      </p>
                    </div>

                    <div className="my-4 rounded-xl border border-dashed border-stone-300 bg-white aspect-video flex flex-col items-center justify-center p-6 text-center">
                      <Upload className="h-9 w-9 text-stone-400 mb-2" />
                      <p className="text-xs font-medium text-stone-700">
                        Select a QR photo or label screenshot
                      </p>
                      <p className="text-[11px] text-stone-500 mt-1">
                        Only TraceTradeNetwork QR codes will resolve lot history
                      </p>
                    </div>

                    <div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full py-2.5 px-4 border border-stone-300 bg-white hover:bg-stone-100 text-stone-900 font-semibold rounded-xl text-xs transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
                      >
                        <Upload className="h-4 w-4" />
                        Choose QR Image to Scan
                      </button>
                    </div>
                  </div>
                </div>

                {cameraError && (
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3 text-xs text-amber-900">
                    <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                    <span>{cameraError}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Non-TraceTradeNetwork QR Warning */}
        {nonPlatformNotice && (
          <section className="mt-6 bg-white rounded-2xl border border-amber-300 p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-stone-900">
                    Not a TraceTradeNetwork QR Code
                  </h2>
                  <p className="text-sm text-stone-600 mt-1 leading-relaxed">
                    {nonPlatformNotice}
                  </p>
                  {lastScannedRaw && (
                    <p className="text-xs font-mono text-stone-500 mt-2 break-all">
                      Scanned content: {lastScannedRaw.slice(0, 120)}
                      {lastScannedRaw.length > 120 ? "..." : ""}
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={resetResults}
                className="px-4 py-2 rounded-lg border border-stone-300 text-xs font-semibold text-stone-700 hover:bg-stone-50 shrink-0 whitespace-nowrap"
              >
                Scan Another QR
              </button>
            </div>
          </section>
        )}

        {/* Loading State */}
        {loading && (
          <section className="mt-6 bg-white rounded-2xl border border-stone-200 p-12 text-center shadow-xs">
            <RefreshCw className="h-8 w-8 text-emerald-700 animate-spin mx-auto mb-3" />
            <h2 className="text-base font-bold text-stone-900">
              Checking Lot Traceability &amp; Custody Status...
            </h2>
            <p className="text-xs text-stone-500 mt-1 font-mono">
              Querying ID: {activeQuery}
            </p>
          </section>
        )}

        {/* Error / Not Found State */}
        {!loading && error && (
          <section className="mt-6 bg-white rounded-2xl border border-red-200 p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-red-50 text-red-700 border border-red-200 shrink-0">
                  <AlertCircle className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-stone-900">
                    Verification Failed
                  </h2>
                  <p className="text-sm text-stone-600 mt-1">{error}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={resetResults}
                className="px-4 py-2 rounded-lg border border-stone-300 text-xs font-semibold text-stone-700 hover:bg-stone-50 shrink-0 whitespace-nowrap"
              >
                Try Another ID
              </button>
            </div>
          </section>
        )}

        {/* Resolved Traceability Result */}
        {!loading && traceData && (
          <div className="mt-6 space-y-6">
            {/* 1. Primary Verdict & Freshness Card */}
            <section
              className={`rounded-2xl p-6 border ${
                verdictCode === "MOST_UPDATED_ACTIVE"
                  ? "bg-emerald-950 text-white border-emerald-900"
                  : verdictCode === "OLDER_ACTIVE_LOT_QR"
                    ? "bg-amber-950 text-white border-amber-900"
                    : "bg-red-950 text-white border-red-900"
              }`}
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
                        Active Package · Newer QR Exists on Lot
                      </span>
                    )}
                    {(verdictCode === "RETIRED_AFTER_SALE" ||
                      verdictCode === "REVOKED_OR_INACTIVE") && (
                      <span className="inline-flex items-center gap-1.5 text-red-200">
                        <ShieldAlert className="h-4 w-4" />
                        Retired / Non-Reusable QR Code
                      </span>
                    )}
                    <span className="text-white/40" aria-hidden="true">
                      ·
                    </span>
                    <span className="text-white/80 tabular-nums">
                      QR #{freshness?.qrSequenceNumber ?? 1} of{" "}
                      {freshness?.totalLotQRCodes ?? 1} on Lot
                    </span>
                    <span className="text-white/40" aria-hidden="true">
                      ·
                    </span>
                    <span className="text-white/80">
                      {traceData.origin.eudrCompliant
                        ? "EUDR Verified"
                        : "Cameroon Origin"}
                    </span>
                  </div>

                  <h2 className="text-2xl font-bold tracking-tight text-white">
                    {freshness?.statusHeadline ||
                      "Verified Cocoa Traceability Status"}
                  </h2>

                  <p className="text-sm text-white/85 max-w-3xl leading-relaxed">
                    {freshness?.statusDetail}
                  </p>

                  <p className="text-xs text-white/75 font-mono tabular-nums pt-1">
                    ID: {activeQuery} · Package {traceData.package.packageNumber}{" "}
                    · Lot {traceData.origin.lotNumber}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <Link
                    href={`/traceability/qr/${encodeURIComponent(activeQuery)}`}
                    className="px-4 py-2 bg-white hover:bg-stone-100 text-stone-900 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
                  >
                    Full Passport <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                  <button
                    type="button"
                    onClick={resetResults}
                    className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-medium rounded-lg transition-colors border border-white/20 whitespace-nowrap"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </section>

            {/* 2. Remaining Lot Balance & Origin Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Lot Mass Balance */}
              <section className="bg-white rounded-2xl border border-stone-200 p-6">
                <div className="flex items-center justify-between pb-3 border-b border-stone-100">
                  <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                    <Scale className="h-4 w-4 text-emerald-700" />
                    Remaining Cocoa Lot Balance
                  </h3>
                  <span className="text-xs font-mono text-stone-500">
                    Bag: {traceData.package.packageQuantityKg.toLocaleString()}{" "}
                    kg
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 tabular-nums">
                  <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200">
                    <span className="text-xs text-stone-500 block">
                      Original Lot Weight
                    </span>
                    <span className="text-xl font-bold text-stone-900 mt-0.5 block">
                      {originalLotKg.toLocaleString()} kg
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200">
                    <span className="text-xs text-stone-500 block">
                      Sold / Transferred
                    </span>
                    <span className="text-xl font-bold text-stone-900 mt-0.5 block">
                      {soldFromOriginKg.toLocaleString()} kg
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200">
                    <span className="text-xs text-emerald-900 font-medium block">
                      Remaining in Lot
                    </span>
                    <span className="text-xl font-bold text-emerald-900 mt-0.5 block">
                      {remainingInLotKg.toLocaleString()} kg
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200">
                    <span className="text-xs text-stone-500 block">
                      Remaining at Origin
                    </span>
                    <span className="text-xl font-bold text-stone-900 mt-0.5 block">
                      {remainingAtOriginKg.toLocaleString()} kg
                    </span>
                  </div>
                </div>
              </section>

              {/* Origin & Current Holder Summary */}
              <section className="bg-white rounded-2xl border border-stone-200 p-6">
                <div className="flex items-center justify-between pb-3 border-b border-stone-100">
                  <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                    <Sprout className="h-4 w-4 text-emerald-700" />
                    Origin &amp; Custody Summary
                  </h3>
                  <span className="text-xs text-stone-500 flex items-center gap-1">
                    <Award className="h-3.5 w-3.5 text-amber-600" />
                    Cert #{traceData.origin.certificateNumber}
                  </span>
                </div>

                <dl className="mt-4 space-y-2.5 text-xs tabular-nums">
                  <div className="flex justify-between py-1 border-b border-stone-100">
                    <dt className="text-stone-500">Origin Farm</dt>
                    <dd className="font-semibold text-stone-900 text-right">
                      {traceData.origin.farmName}
                      {traceData.origin.region
                        ? `, ${traceData.origin.region}`
                        : ""}
                    </dd>
                  </div>
                  <div className="flex justify-between py-1 border-b border-stone-100">
                    <dt className="text-stone-500">Production Period</dt>
                    <dd className="font-semibold text-stone-900">
                      {traceData.origin.productionPeriod || "Cameroon Crop"}
                      {traceData.origin.qualityGrade
                        ? ` · ${traceData.origin.qualityGrade}`
                        : ""}
                    </dd>
                  </div>
                  <div className="flex justify-between py-1 border-b border-stone-100">
                    <dt className="text-stone-500">Current Holder</dt>
                    <dd className="font-semibold text-stone-900 text-right">
                      {traceData.current.currentHolderPublicName}
                    </dd>
                  </div>
                  <div className="flex justify-between py-1 border-b border-stone-100">
                    <dt className="text-stone-500">QR Status</dt>
                    <dd
                      className={`font-bold ${
                        freshness?.isValidAndActive
                          ? "text-emerald-800"
                          : "text-red-700"
                      }`}
                    >
                      {freshness?.isRetiredAfterSale
                        ? "Retired After Sale (Non-Reusable)"
                        : traceData.package.status.toUpperCase()}
                    </dd>
                  </div>
                  <div className="flex justify-between py-1">
                    <dt className="text-stone-500">Generated Date</dt>
                    <dd className="font-medium text-stone-800">
                      {formatDate(traceData.package.generatedAt)}
                    </dd>
                  </div>
                </dl>
              </section>
            </div>

            {/* 3. Custody Movements */}
            <section className="bg-white rounded-2xl border border-stone-200 p-6">
              <div className="flex items-center justify-between pb-3 border-b border-stone-200">
                <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                  <Layers className="h-4 w-4 text-emerald-700" />
                  Lot Custody &amp; Sales History
                </h3>
                <span className="text-xs text-stone-500 tabular-nums">
                  {lotMovements.length} Recorded Movement
                  {lotMovements.length === 1 ? "" : "s"}
                </span>
              </div>

              {lotMovements.length === 0 ? (
                <p className="py-6 text-center text-xs text-stone-500">
                  No downstream sales or custody transfers recorded yet — cocoa
                  remains with the origin grower.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {lotMovements.map((move) => (
                    <div
                      key={`${move.stepOrder}-${move.timestamp}`}
                      className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="h-5 w-5 rounded-full bg-stone-900 text-white text-[11px] font-bold flex items-center justify-center shrink-0 tabular-nums">
                          {move.stepOrder}
                        </span>
                        <span className="font-semibold text-stone-900">
                          {move.fromHolderLabel}
                          <ArrowRight className="inline h-3.5 w-3.5 text-stone-500 mx-1" />
                          {move.toHolderLabel}
                        </span>
                      </div>
                      <div className="text-stone-600 tabular-nums flex items-center gap-3">
                        <span className="font-bold text-stone-900">
                          {move.quantityKg.toLocaleString()} kg
                        </span>
                        <span>{formatDate(move.timestamp)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* Default Info Strip when no search has been executed */}
        {!loading && !traceData && !error && !nonPlatformNotice && (
          <section className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-5 bg-white rounded-xl border border-stone-200">
              <CheckCircle2 className="h-5 w-5 text-emerald-700 mb-2.5" />
              <h2 className="text-sm font-bold text-stone-900">
                Anti-Reuse Safeguard
              </h2>
              <p className="text-xs text-stone-600 mt-1 leading-relaxed">
                Sold or transferred QR codes retire permanently. New buyers
                generate their own QR code from their custody holding.
              </p>
            </div>

            <div className="p-5 bg-white rounded-xl border border-stone-200">
              <MapPin className="h-5 w-5 text-emerald-700 mb-2.5" />
              <h2 className="text-sm font-bold text-stone-900">
                Origin-to-Port Lineage
              </h2>
              <p className="text-xs text-stone-600 mt-1 leading-relaxed">
                Inspect farm origin, EUDR compliance, production season, lot
                certification, and every downstream transfer.
              </p>
            </div>

            <div className="p-5 bg-white rounded-xl border border-stone-200">
              <Scale className="h-5 w-5 text-emerald-700 mb-2.5" />
              <h2 className="text-sm font-bold text-stone-900">
                Live Remaining Balance
              </h2>
              <p className="text-xs text-stone-600 mt-1 leading-relaxed">
                Audits exact remaining unsold cocoa in the lot versus volume
                already sold or moved along the supply chain.
              </p>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
