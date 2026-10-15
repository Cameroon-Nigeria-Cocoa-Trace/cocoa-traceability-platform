/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { DashboardWorkflowNav } from "@/components/DashboardWorkflowNav";
import { useFirebase } from "@/context/FirebaseContext";
import { createCocoaApiClient, CocoaApiError } from "@/lib/cocoaApiClient";
import {
  QRCode,
  CertificateHolding,
  HoldingPackagingState,
} from "@/types/traceability";
import QRCodeLib from "qrcode";
import {
  QrCode,
  Package,
  Layers,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Search,
  Filter,
  Download,
  Plus,
  Eye,
  X,
  Printer,
  Copy,
  ExternalLink,
  Ban,
  RotateCcw,
  Sparkles,
  ArrowRight,
  Boxes,
  Scale,
  Award,
  Calendar,
  Check,
  ChevronRight,
  Info,
} from "lucide-react";

export default function QRTraceabilityPage() {
  const { user } = useFirebase();

  const apiClient = useMemo(() => {
    return createCocoaApiClient(async () => {
      if (!user) return null;
      return await user.getIdToken();
    });
  }, [user]);

  // Holdings list for packaging selection
  const [holdings, setHoldings] = useState<CertificateHolding[]>([]);
  const [selectedHoldingId, setSelectedHoldingId] = useState<string>("");
  const [packagingState, setPackagingState] = useState<HoldingPackagingState | null>(null);

  // QR Packages
  const [qrPackages, setQrPackages] = useState<QRCode[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Search & Filtering
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Package Creation Modal State
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [createMode, setCreateMode] = useState<"single" | "batch">("single");
  const [singleWeightKg, setSingleWeightKg] = useState<string>("50");
  const [qrGroupId, setQrGroupId] = useState<string>("");
  const [batchQuantitiesInput, setBatchQuantitiesInput] = useState<string>("50, 50, 60, 60");
  const [submittingPackage, setSubmittingPackage] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Preview & Print QR Modal
  const [previewQR, setPreviewQR] = useState<QRCode | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [copiedValue, setCopiedValue] = useState<boolean>(false);

  // Action Modals: Revoke & Repackage
  const [revokingQR, setRevokingQR] = useState<QRCode | null>(null);
  const [revocationReason, setRevocationReason] = useState<string>("");
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  const [repackagingQR, setRepackagingQR] = useState<QRCode | null>(null);
  const [repackageNotes, setRepackageNotes] = useState<string>("");

  // 1. Load Holdings
  const loadHoldings = useCallback(async () => {
    if (!user) return;
    try {
      const res = await apiClient.get<{ success: boolean; holdings: CertificateHolding[] }>(
        "/api/certificate-holdings"
      );
      if (res && res.success && Array.isArray(res.holdings)) {
        setHoldings(res.holdings);
        if (res.holdings.length > 0 && !selectedHoldingId) {
          setSelectedHoldingId(res.holdings[0].holdingId);
        }
      }
    } catch (err: unknown) {
      console.warn("Could not fetch holdings:", err);
    }
  }, [apiClient, user, selectedHoldingId]);

  // 2. Load QR Packages & Packaging State for selected holding
  const loadQRPackages = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      let endpoint = "/api/qr-codes";
      if (selectedHoldingId) {
        endpoint = `/api/qr-codes?holdingId=${encodeURIComponent(selectedHoldingId)}`;
      }

      const res = await apiClient.get<{
        success: boolean;
        qrCodes: QRCode[];
        packagingState?: HoldingPackagingState;
      }>(endpoint);

      if (res && res.success) {
        setQrPackages(res.qrCodes || []);
        if (res.packagingState) {
          setPackagingState(res.packagingState);
        } else if (!selectedHoldingId) {
          setPackagingState(null);
        }
      } else {
        setQrPackages([]);
      }
    } catch (err: unknown) {
      if (err instanceof CocoaApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to load QR package records.");
      }
    } finally {
      setLoading(false);
    }
  }, [apiClient, user, selectedHoldingId]);

  useEffect(() => {
    if (user) {
      loadHoldings();
    }
  }, [user, loadHoldings]);

  useEffect(() => {
    if (user) {
      loadQRPackages();
    }
  }, [user, loadQRPackages]);

  // Selected Holding Object
  const currentHolding = useMemo(() => {
    return holdings.find((h) => h.holdingId === selectedHoldingId) || null;
  }, [holdings, selectedHoldingId]);

  // Generate QR Image Data URL when previewQR opens
  useEffect(() => {
    if (!previewQR) {
      setPreviewDataUrl(null);
      return;
    }

    let isMounted = true;
    QRCodeLib.toDataURL(previewQR.qrValue, {
      width: 320,
      margin: 2,
      errorCorrectionLevel: "H",
      color: {
        dark: "#14532d",
        light: "#ffffff",
      },
    })
      .then((url) => {
        if (isMounted) setPreviewDataUrl(url);
      })
      .catch((err) => {
        console.error("Failed to generate QR data URL:", err);
      });

    return () => {
      isMounted = false;
    };
  }, [previewQR]);

  // Calculate parsed batch quantities
  const parsedBatchQuantities = useMemo(() => {
    return batchQuantitiesInput
      .split(/[,;\s]+/)
      .map((s) => parseFloat(s.trim()))
      .filter((n) => !isNaN(n) && n > 0);
  }, [batchQuantitiesInput]);

  const totalBatchWeight = useMemo(() => {
    return parsedBatchQuantities.reduce((sum, n) => sum + n, 0);
  }, [parsedBatchQuantities]);

  // Single Package Creation Submission
  const handleCreateSinglePackage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedHoldingId) {
      setCreateError("Please select a Certificate Holding first.");
      return;
    }
    const weight = parseFloat(singleWeightKg);
    if (isNaN(weight) || weight <= 0) {
      setCreateError("Represented bag weight must be a positive number.");
      return;
    }
    if (packagingState && weight > packagingState.unpackagedQuantityKg) {
      setCreateError(
        `Requested package size (${weight} kg) exceeds remaining unpackaged cocoa (${packagingState.unpackagedQuantityKg} kg).`
      );
      return;
    }

    setSubmittingPackage(true);
    setCreateError(null);

    try {
      const res = await apiClient.post<{ success: boolean; qrCode: QRCode }>(
        "/api/qr-codes",
        {
          holdingId: selectedHoldingId,
          representedQuantityKg: weight,
          qrGroupId: qrGroupId.trim() || undefined,
        }
      );

      if (res && res.success) {
        setSuccessMessage(`Successfully generated package ${res.qrCode.packageNumber} (${res.qrCode.representedQuantityKg} kg)!`);
        setShowCreateModal(false);
        setQrGroupId("");
        await loadQRPackages();
      }
    } catch (err: unknown) {
      if (err instanceof CocoaApiError) {
        setCreateError(err.message);
      } else if (err instanceof Error) {
        setCreateError(err.message);
      } else {
        setCreateError("Failed to generate QR package.");
      }
    } finally {
      setSubmittingPackage(false);
    }
  };

  // Batch Package Creation Submission
  const handleCreateBatchPackages = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedHoldingId) {
      setCreateError("Please select a Certificate Holding first.");
      return;
    }
    if (parsedBatchQuantities.length === 0) {
      setCreateError("Please provide at least one valid package quantity in kg.");
      return;
    }
    if (packagingState && totalBatchWeight > packagingState.unpackagedQuantityKg) {
      setCreateError(
        `Total batch weight (${totalBatchWeight} kg) exceeds remaining unpackaged cocoa (${packagingState.unpackagedQuantityKg} kg).`
      );
      return;
    }

    setSubmittingPackage(true);
    setCreateError(null);

    try {
      const res = await apiClient.post<{ success: boolean; count: number; qrCodes: QRCode[] }>(
        "/api/qr-codes/batch",
        {
          holdingId: selectedHoldingId,
          packageQuantitiesKg: parsedBatchQuantities,
          qrGroupId: qrGroupId.trim() || undefined,
        }
      );

      if (res && res.success) {
        setSuccessMessage(`Successfully generated batch of ${res.count} packages (${totalBatchWeight} kg total)!`);
        setShowCreateModal(false);
        setQrGroupId("");
        await loadQRPackages();
      }
    } catch (err: unknown) {
      if (err instanceof CocoaApiError) {
        setCreateError(err.message);
      } else if (err instanceof Error) {
        setCreateError(err.message);
      } else {
        setCreateError("Failed to generate batch QR packages.");
      }
    } finally {
      setSubmittingPackage(false);
    }
  };

  // Deactivate QR
  const handleDeactivate = async (qr: QRCode) => {
    if (!confirm(`Are you sure you want to deactivate package ${qr.packageNumber}? This sets status to inactive while keeping packaging capacity allocated.`)) {
      return;
    }

    setActionLoading(true);
    try {
      const res = await apiClient.post<{ success: boolean; qrCode: QRCode }>(
        `/api/qr-codes/${qr.qrId}/deactivate`
      );
      if (res && res.success) {
        setSuccessMessage(`Package ${qr.packageNumber} deactivated.`);
        await loadQRPackages();
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to deactivate package.");
    } finally {
      setActionLoading(false);
    }
  };

  // Revoke QR
  const handleRevokeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revokingQR) return;
    if (!revocationReason.trim()) {
      alert("Revocation reason is required.");
      return;
    }

    setActionLoading(true);
    try {
      const res = await apiClient.post<{ success: boolean; qrCode: QRCode }>(
        `/api/qr-codes/${revokingQR.qrId}/revoke`,
        { reason: revocationReason.trim() }
      );
      if (res && res.success) {
        setSuccessMessage(`Package ${revokingQR.packageNumber} revoked.`);
        setRevokingQR(null);
        setRevocationReason("");
        await loadQRPackages();
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to revoke package.");
    } finally {
      setActionLoading(false);
    }
  };

  // Repackage / Return to Bulk
  const handleRepackageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repackagingQR) return;

    setActionLoading(true);
    try {
      const res = await apiClient.post<{ success: boolean; qrCode: QRCode }>(
        `/api/qr-codes/${repackagingQR.qrId}/repackage`,
        { notes: repackageNotes.trim() || undefined }
      );
      if (res && res.success) {
        setSuccessMessage(`Package ${repackagingQR.packageNumber} returned to bulk! Released ${repackagingQR.representedQuantityKg} kg back to unpackaged capacity.`);
        setRepackagingQR(null);
        setRepackageNotes("");
        await loadQRPackages();
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to return package to bulk.");
    } finally {
      setActionLoading(false);
    }
  };

  // Copy QR Value
  const handleCopyValue = (val: string) => {
    navigator.clipboard.writeText(val);
    setCopiedValue(true);
    setTimeout(() => setCopiedValue(false), 2000);
  };

  
  const handleDownloadQR = async (
    qr: QRCode,
    format: "svg" | "png" = "svg"
  ) => {
    setError(null);

    try {
      if (!user) {
        throw new Error("Please sign in to download this QR label.");
      }

      const token = await user.getIdToken();

      const response = await fetch(
        `/api/qr-codes/${encodeURIComponent(qr.qrId)}/download?format=${format}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        let message = `Download failed (${response.status}).`;

        try {
          const result = (await response.json()) as {
            error?: string;
          };
          message = result.error || message;
        } catch {
          // Keep the fallback error message.
        }

        throw new Error(message);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");

      anchor.href = objectUrl;
      anchor.download = `${qr.packageNumber}.${format}`;

      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      window.setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
      }, 1000);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to download the QR label."
      );
    }
  };

  // Filtered QR Packages
  const filteredQRs = useMemo(() => {
    return qrPackages.filter((qr) => {
      // Status filter
      if (statusFilter === "active" && qr.status !== "active") return false;
      if (statusFilter === "inactive" && qr.status !== "inactive") return false;
      if (statusFilter === "revoked" && (qr.status !== "revoked" || qr.returnedToBulk === true)) return false;
      if (statusFilter === "repackaged" && qr.returnedToBulk !== true) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesPkg = qr.packageNumber.toLowerCase().includes(q);
        const matchesVal = qr.qrValue.toLowerCase().includes(q);
        const matchesLot = qr.lotNumber.toLowerCase().includes(q);
        const matchesCert = qr.certificateNumber.toLowerCase().includes(q);
        const matchesGroup = qr.qrGroupId ? qr.qrGroupId.toLowerCase().includes(q) : false;
        return matchesPkg || matchesVal || matchesLot || matchesCert || matchesGroup;
      }
      return true;
    });
  }, [qrPackages, statusFilter, searchQuery]);

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Workflow Navigation */}
        <DashboardWorkflowNav currentTab="traceability-certification" />

        {/* Hero Section */}
        <div className="mt-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-stone-200">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                Stage 4: Bag-Level Traceability
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                EUDR Compliant
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-stone-900 mt-2 flex items-center gap-2.5">
              <QrCode className="h-7 w-7 text-emerald-700" />
              QR Package Management & Accounting
            </h1>
            <p className="mt-1 text-sm text-stone-600 max-w-3xl">
              Generate permanent, sequence-numbered QR codes for individual cocoa bags. Manage virtual packaging allocations, enforce strict bulk balance limits, and enable public consumer provenance tracking.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                loadHoldings();
                loadQRPackages();
              }}
              disabled={loading}
              className="inline-flex items-center px-3.5 py-2 border border-stone-300 shadow-sm text-sm font-medium rounded-lg text-stone-700 bg-white hover:bg-stone-50 transition-colors"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin text-emerald-600" : ""}`} />
              Refresh
            </button>

            <button
              onClick={() => {
                setCreateError(null);
                setShowCreateModal(true);
              }}
              disabled={!selectedHoldingId || Boolean(packagingState && packagingState.unpackagedQuantityKg <= 0)}
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-lg text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 transition-colors"
            >
              <Plus className="h-4 w-4 mr-2" />
              Generate QR Packages
            </button>
          </div>
        </div>

        {/* Notification Banners */}
        {error && (
          <div className="mt-4 p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
            <div className="text-sm text-red-800">
              <span className="font-semibold">Error: </span>
              {error}
            </div>
          </div>
        )}

        {successMessage && (
          <div className="mt-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-3 justify-between">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-sm text-emerald-900 font-medium">
                {successMessage}
              </div>
            </div>
            <button
              onClick={() => setSuccessMessage(null)}
              className="text-emerald-700 hover:text-emerald-900 text-sm font-medium"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Holding Selector & Unified Accounting Overview */}
        <div className="mt-6 bg-white border border-stone-200 rounded-2xl shadow-xs overflow-hidden">
          <div className="p-6 bg-gradient-to-r from-stone-900 to-stone-800 text-white">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <span className="text-xs font-semibold tracking-wider text-emerald-400 uppercase">
                  Source Custody Holding
                </span>
                <div className="mt-1 flex items-center gap-3">
                  <select
                    value={selectedHoldingId}
                    onChange={(e) => setSelectedHoldingId(e.target.value)}
                    className="bg-stone-800 border border-stone-700 text-white text-sm rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none min-w-[280px]"
                  >
                    {holdings.length === 0 ? (
                      <option value="">No active holdings found</option>
                    ) : (
                      holdings.map((h) => (
                        <option key={h.holdingId} value={h.holdingId}>
                          {h.holdingId} — Lot #{h.lotId} ({h.availableQuantityKg} kg available)
                        </option>
                      ))
                    )}
                  </select>

                  {currentHolding && (
                    <span className="text-xs text-stone-300">
                      Cert #{currentHolding.certificateNumber} • Holder: {currentHolding.holderType.toUpperCase()}
                    </span>
                  )}
                </div>
              </div>

              {packagingState && (
                <div className="flex items-center gap-2 bg-stone-800/80 px-4 py-2 rounded-xl border border-stone-700">
                  <Info className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span className="text-xs text-stone-300">
                    Packaging capacity is derived dynamically: <code className="text-emerald-300 font-mono">Unpackaged = Available - Active Bags</code>
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Unified Packaging Accounting Cards */}
          {packagingState ? (
            <div className="p-6 grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-4 bg-stone-50 border-b border-stone-200">
              <div className="bg-white p-4 rounded-xl border border-stone-200">
                <span className="text-xs font-medium text-stone-500 flex items-center gap-1.5">
                  <Boxes className="h-3.5 w-3.5 text-stone-400" />
                  Total Holding Balance
                </span>
                <p className="mt-1 text-2xl font-bold text-stone-900">
                  {packagingState.totalHoldingQuantityKg.toLocaleString()} <span className="text-xs font-normal text-stone-500">kg</span>
                </p>
                <span className="text-xs text-stone-400">Total assigned to holding</span>
              </div>

              <div className="bg-white p-4 rounded-xl border border-stone-200">
                <span className="text-xs font-medium text-stone-500 flex items-center gap-1.5">
                  <Scale className="h-3.5 w-3.5 text-stone-400" />
                  Available Holding
                </span>
                <p className="mt-1 text-2xl font-bold text-stone-900">
                  {packagingState.availableQuantityKg.toLocaleString()} <span className="text-xs font-normal text-stone-500">kg</span>
                </p>
                <span className="text-xs text-stone-400">Total uncommitted quantity</span>
              </div>

              <div className="bg-white p-4 rounded-xl border border-amber-200 bg-amber-50/30">
                <span className="text-xs font-medium text-amber-800 flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5 text-amber-600" />
                  Allocated to Packages
                </span>
                <p className="mt-1 text-2xl font-bold text-amber-900">
                  {packagingState.allocatedPackageQuantityKg.toLocaleString()} <span className="text-xs font-normal text-stone-500">kg</span>
                </p>
                <span className="text-xs text-amber-700">
                  {packagingState.allocatedPackageCount} bags ({packagingState.activePackageCount} active)
                </span>
              </div>

              <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/40">
                <span className="text-xs font-medium text-emerald-800 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                  Unpackaged Bulk Balance
                </span>
                <p className="mt-1 text-2xl font-bold text-emerald-900">
                  {packagingState.unpackagedQuantityKg.toLocaleString()} <span className="text-xs font-normal text-stone-500">kg</span>
                </p>
                <span className="text-xs text-emerald-700">Capacity available to bag</span>
              </div>

              <div className="bg-white p-4 rounded-xl border border-stone-200 flex flex-col justify-between">
                <div>
                  <span className="text-xs font-medium text-stone-500">Packaged vs Bulk</span>
                  <div className="mt-2 w-full bg-stone-200 rounded-full h-2.5 overflow-hidden flex">
                    <div
                      className="bg-amber-500 h-2.5 transition-all"
                      style={{
                        width: `${
                          packagingState.availableQuantityKg > 0
                            ? Math.min(100, (packagingState.allocatedPackageQuantityKg / packagingState.availableQuantityKg) * 100)
                            : 0
                        }%`,
                      }}
                      title="Packaged"
                    />
                    <div
                      className="bg-emerald-500 h-2.5 transition-all"
                      style={{
                        width: `${
                          packagingState.availableQuantityKg > 0
                            ? Math.min(100, (packagingState.unpackagedQuantityKg / packagingState.availableQuantityKg) * 100)
                            : 0
                        }%`,
                      }}
                      title="Unpackaged"
                    />
                  </div>
                </div>
                <div className="flex justify-between items-center text-xs text-stone-500 mt-2">
                  <span>
                    Packaged: {packagingState.availableQuantityKg > 0
                      ? Math.round((packagingState.allocatedPackageQuantityKg / packagingState.availableQuantityKg) * 100)
                      : 0}%
                  </span>
                  <span>
                    Bulk: {packagingState.availableQuantityKg > 0
                      ? Math.round((packagingState.unpackagedQuantityKg / packagingState.availableQuantityKg) * 100)
                      : 0}%
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6 text-center text-sm text-stone-500 bg-stone-50">
              Select a holding above to view real-time package allocations and packaging capacity.
            </div>
          )}
        </div>

        {/* Filters and Search Bar */}
        <div className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
            <input
              type="text"
              placeholder="Search by package number, QR value, lot number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-stone-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
            <span className="text-xs font-medium text-stone-500 flex items-center gap-1 shrink-0">
              <Filter className="h-3.5 w-3.5" /> Filter:
            </span>
            {[
              { id: "all", label: "All Packages" },
              { id: "active", label: "Active" },
              { id: "inactive", label: "Inactive" },
              { id: "revoked", label: "Revoked" },
              { id: "repackaged", label: "Returned to Bulk" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 ${
                  statusFilter === tab.id
                    ? "bg-stone-900 text-white"
                    : "bg-white border border-stone-200 text-stone-700 hover:bg-stone-100"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Packages Table & List */}
        <div className="mt-4 bg-white border border-stone-200 rounded-2xl shadow-xs overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <RefreshCw className="h-8 w-8 text-emerald-600 animate-spin mx-auto mb-3" />
              <p className="text-sm font-medium text-stone-700">Loading bag-level QR packages...</p>
              <p className="text-xs text-stone-500 mt-1">Deriving sequence counters and audit lineage...</p>
            </div>
          ) : filteredQRs.length === 0 ? (
            <div className="p-12 text-center">
              <Package className="h-12 w-12 text-stone-300 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-stone-800">No QR packages found</h3>
              <p className="text-sm text-stone-500 mt-1 max-w-md mx-auto">
                {searchQuery || statusFilter !== "all"
                  ? "No packages match your search filters. Try clearing the filter."
                  : "No physical packages have been generated for this holding yet. Click 'Generate QR Packages' to create official bag codes."}
              </p>
              {packagingState && packagingState.unpackagedQuantityKg > 0 && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="mt-4 inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg text-white bg-emerald-700 hover:bg-emerald-800"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Generate First Package
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-stone-200 text-sm text-left">
                <thead className="bg-stone-50 text-stone-600 font-medium text-xs uppercase tracking-wider">
                  <tr>
                    <th scope="col" className="px-6 py-3.5">
                      Package Number / QR ID
                    </th>
                    <th scope="col" className="px-6 py-3.5">
                      Weight (Kg)
                    </th>
                    <th scope="col" className="px-6 py-3.5">
                      Lot & Certificate
                    </th>
                    <th scope="col" className="px-6 py-3.5">
                      Status
                    </th>
                    <th scope="col" className="px-6 py-3.5">
                      Created
                    </th>
                    <th scope="col" className="px-6 py-3.5 text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {filteredQRs.map((qr) => {
                    const isReturnedToBulk = qr.returnedToBulk === true;

                    return (
                      <tr key={qr.qrId} className="hover:bg-stone-50/80 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-emerald-50 rounded-lg text-emerald-800 border border-emerald-200 shrink-0">
                              <QrCode className="h-5 w-5" />
                            </div>
                            <div>
                              <div className="font-semibold text-stone-900 flex items-center gap-1.5">
                                {qr.packageNumber}
                                <span className="text-[10px] bg-stone-100 text-stone-600 px-1.5 py-0.5 rounded font-mono">
                                  Seq #{qr.sequenceNumber}
                                </span>
                              </div>
                              <div className="text-xs text-stone-500 font-mono mt-0.5 max-w-[200px] truncate" title={qr.qrValue}>
                                {qr.qrValue}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-stone-100 text-stone-800 border border-stone-200">
                            <Scale className="h-3.5 w-3.5 mr-1 text-stone-500" />
                            {qr.representedQuantityKg} kg
                          </div>
                          {qr.qrGroupId && (
                            <div className="text-[11px] text-stone-500 mt-1">
                              Grp: <span className="font-medium text-stone-700">{qr.qrGroupId}</span>
                            </div>
                          )}
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-xs font-medium text-stone-900">
                            Lot: {qr.lotNumber}
                          </div>
                          <div className="text-xs text-stone-500 mt-0.5 flex items-center gap-1">
                            <Award className="h-3 w-3 text-amber-600 shrink-0" />
                            Cert #{qr.certificateNumber}
                          </div>
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap">
                          {isReturnedToBulk ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                              Returned to Bulk
                            </span>
                          ) : qr.status === "active" ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 mr-1.5" />
                              Active
                            </span>
                          ) : qr.status === "inactive" ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                              Inactive
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                              Revoked
                            </span>
                          )}
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap text-xs text-stone-500">
                          {new Date(qr.generatedAt).toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap text-right text-xs">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Preview & Print */}
                            <button
                              onClick={() => setPreviewQR(qr)}
                              title="View and print QR label"
                              className="p-1.5 text-stone-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-md transition-colors"
                            >
                              <Eye className="h-4 w-4" />
                            </button>

                            {/* Download SVG */}                            
                            <button
                              type="button"
                              onClick={() => handleDownloadQR(qr, "svg")}
                              title="Download SVG vector label"
                              className="p-1.5 text-stone-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-md transition-colors"
                            >
                              <Download className="h-4 w-4" />
                            </button>

                            {/* Public Trace View */}
                            <Link
                              href={`/traceability/qr/${encodeURIComponent(qr.qrValue)}`}
                              target="_blank"
                              title="Public consumer trace view"
                              className="p-1.5 text-stone-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-md transition-colors"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Link>

                            {/* Status Actions */}
                            {qr.status === "active" && (
                              <>
                                <button
                                  onClick={() => handleDeactivate(qr)}
                                  disabled={actionLoading}
                                  title="Deactivate package"
                                  className="p-1.5 text-stone-500 hover:text-amber-700 hover:bg-amber-50 rounded-md transition-colors"
                                >
                                  <Ban className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => {
                                    setRevokingQR(qr);
                                    setRevocationReason("");
                                  }}
                                  disabled={actionLoading}
                                  title="Revoke package"
                                  className="p-1.5 text-stone-500 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </>
                            )}

                            {/* Repackage / Return to Bulk if revoked and not yet returned */}
                            {qr.status === "revoked" && !isReturnedToBulk && (
                              <button
                                onClick={() => {
                                  setRepackagingQR(qr);
                                  setRepackageNotes("");
                                }}
                                disabled={actionLoading}
                                title="Repackage: Return capacity to bulk balance"
                                className="inline-flex items-center px-2 py-1 rounded bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 transition-colors font-medium text-[11px]"
                              >
                                <RotateCcw className="h-3 w-3 mr-1" />
                                Return to Bulk
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ============================================================== */}
        {/* MODAL 1: CREATE QR PACKAGE(S) */}
        {/* ============================================================== */}
        {showCreateModal && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-stone-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="p-6 bg-gradient-to-r from-emerald-800 to-emerald-950 text-white flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <QrCode className="h-5 w-5 text-emerald-400" />
                    Generate Physical QR Package
                  </h3>
                  <p className="text-xs text-emerald-200 mt-0.5">
                    Atomic bag allocation with sequence counter & permanent package number
                  </p>
                </div>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="text-emerald-300 hover:text-white transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Mode Toggle */}
              <div className="p-4 bg-stone-50 border-b border-stone-200 flex items-center justify-between">
                <div className="inline-flex rounded-lg border border-stone-300 p-0.5 bg-white">
                  <button
                    type="button"
                    onClick={() => setCreateMode("single")}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                      createMode === "single"
                        ? "bg-emerald-700 text-white"
                        : "text-stone-600 hover:text-stone-900"
                    }`}
                  >
                    Single Package
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateMode("batch")}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                      createMode === "batch"
                        ? "bg-emerald-700 text-white"
                        : "text-stone-600 hover:text-stone-900"
                    }`}
                  >
                    Batch Generation
                  </button>
                </div>

                {packagingState && (
                  <div className="text-xs text-right">
                    <span className="text-stone-500">Unpackaged Bulk: </span>
                    <span className="font-bold text-emerald-700">
                      {packagingState.unpackagedQuantityKg.toLocaleString()} kg
                    </span>
                  </div>
                )}
              </div>

              {createError && (
                <div className="m-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>{createError}</div>
                </div>
              )}

              {/* Single Mode Form */}
              {createMode === "single" ? (
                <form onSubmit={handleCreateSinglePackage} className="p-6 space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                      Represented Bag Quantity (kg) *
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      required
                      value={singleWeightKg}
                      onChange={(e) => setSingleWeightKg(e.target.value)}
                      placeholder="e.g. 50, 60, 65"
                      className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                    <div className="flex gap-2 mt-2">
                      {["50", "60", "65"].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setSingleWeightKg(preset)}
                          className="px-2.5 py-1 text-xs border border-stone-200 rounded-md bg-stone-50 hover:bg-stone-100 text-stone-700 font-medium"
                        >
                          {preset} kg export bag
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                      QR Group Identifier (Optional)
                    </label>
                    <input
                      type="text"
                      value={qrGroupId}
                      onChange={(e) => setQrGroupId(e.target.value)}
                      placeholder="e.g. BATCH-2026-EU-EXP"
                      className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                    <p className="text-[11px] text-stone-500 mt-1">
                      Optional packaging container or shipment grouping tag.
                    </p>
                  </div>

                  <div className="pt-4 border-t border-stone-200 flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setShowCreateModal(false)}
                      className="px-4 py-2 border border-stone-300 rounded-lg text-sm font-medium text-stone-700 hover:bg-stone-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submittingPackage}
                      className="px-5 py-2 rounded-lg text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 transition-colors flex items-center gap-2"
                    >
                      {submittingPackage ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <QrCode className="h-4 w-4" />
                          Generate Single Package
                        </>
                      )}
                    </button>
                  </div>
                </form>
              ) : (
                /* Batch Mode Form */
                <form onSubmit={handleCreateBatchPackages} className="p-6 space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                      Bag Quantities in kg (Comma or Space Separated) *
                    </label>
                    <textarea
                      rows={3}
                      required
                      value={batchQuantitiesInput}
                      onChange={(e) => setBatchQuantitiesInput(e.target.value)}
                      placeholder="e.g. 50, 50, 50, 60, 60"
                      className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none font-mono"
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => setBatchQuantitiesInput("60, 60, 60, 60, 60")}
                        className="px-2.5 py-1 text-xs border border-stone-200 rounded-md bg-stone-50 hover:bg-stone-100 text-stone-700 font-medium"
                      >
                        5 × 60kg bags
                      </button>
                      <button
                        type="button"
                        onClick={() => setBatchQuantitiesInput("50, 50, 50, 50, 50, 50, 50, 50, 50, 50")}
                        className="px-2.5 py-1 text-xs border border-stone-200 rounded-md bg-stone-50 hover:bg-stone-100 text-stone-700 font-medium"
                      >
                        10 × 50kg bags
                      </button>
                    </div>
                  </div>

                  <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs flex justify-between items-center">
                    <div>
                      <span className="text-stone-500">Packages count: </span>
                      <span className="font-bold text-stone-800">{parsedBatchQuantities.length} bags</span>
                    </div>
                    <div>
                      <span className="text-stone-500">Total batch weight: </span>
                      <span className={`font-bold ${
                        packagingState && totalBatchWeight > packagingState.unpackagedQuantityKg
                          ? "text-red-600"
                          : "text-emerald-700"
                      }`}>
                        {totalBatchWeight.toLocaleString()} kg
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                      QR Group Identifier (Optional)
                    </label>
                    <input
                      type="text"
                      value={qrGroupId}
                      onChange={(e) => setQrGroupId(e.target.value)}
                      placeholder="e.g. EXPORT-PALLET-01"
                      className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div className="pt-4 border-t border-stone-200 flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setShowCreateModal(false)}
                      className="px-4 py-2 border border-stone-300 rounded-lg text-sm font-medium text-stone-700 hover:bg-stone-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submittingPackage || parsedBatchQuantities.length === 0}
                      className="px-5 py-2 rounded-lg text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 transition-colors flex items-center gap-2"
                    >
                      {submittingPackage ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          Generating Batch...
                        </>
                      ) : (
                        <>
                          <QrCode className="h-4 w-4" />
                          Generate {parsedBatchQuantities.length} Packages
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* MODAL 2: HIGH-RES QR PREVIEW & PRINT LABEL */}
        {/* ============================================================== */}
        {previewQR && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-stone-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200 print:shadow-none print:border-none">
              <div className="p-4 bg-stone-900 text-white flex items-center justify-between print:hidden">
                <span className="text-xs font-semibold tracking-wider text-emerald-400 uppercase">
                  Physical Bag Label Preview
                </span>
                <button
                  onClick={() => setPreviewQR(null)}
                  className="text-stone-400 hover:text-white transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Printable Physical Tag Card */}
              <div className="p-6 text-center bg-white" id="printable-qr-tag">
                <div className="border-4 border-emerald-900 rounded-2xl p-5 shadow-xs bg-stone-50">
                  <div className="flex items-center justify-between pb-3 border-b-2 border-emerald-900 mb-4">
                    <div className="text-left">
                      <p className="text-[10px] font-bold tracking-wider text-emerald-900 uppercase">
                        REPUBLIC OF CAMEROON
                      </p>
                      <p className="text-xs font-black text-stone-900 tracking-tight">
                        COCOA EXPORT TRACE
                      </p>
                    </div>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-900 text-white">
                      EUDR VERIFIED
                    </span>
                  </div>

                  {/* QR Image Canvas */}
                  <div className="flex justify-center my-3 bg-white p-3 rounded-xl border border-stone-200 inline-block shadow-inner">
                    {previewDataUrl ? (
                      <img
                        src={previewDataUrl}
                        alt={`QR Code for ${previewQR.packageNumber}`}
                        className="w-48 h-48 mx-auto"
                      />
                    ) : (
                      <div className="w-48 h-48 flex items-center justify-center text-xs text-stone-400">
                        Generating QR Code...
                      </div>
                    )}
                  </div>

                  {/* Bag Metadata */}
                  <div className="mt-3 text-center">
                    <p className="text-lg font-black text-stone-900 tracking-tight">
                      {previewQR.packageNumber}
                    </p>
                    <p className="text-xs font-semibold text-emerald-800 mt-0.5">
                      NET WEIGHT: {previewQR.representedQuantityKg} KG
                    </p>
                    <p className="text-[11px] text-stone-600 mt-1 font-mono">
                      LOT: {previewQR.lotNumber} • CERT: #{previewQR.certificateNumber}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-stone-300 flex items-center justify-between text-[10px] text-stone-500">
                    <span>Seq #{previewQR.sequenceNumber}</span>
                    <span className="font-mono truncate max-w-[150px]">{previewQR.qrValue}</span>
                  </div>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="p-4 bg-stone-50 border-t border-stone-200 flex flex-col gap-2 print:hidden">
                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => handleCopyValue(previewQR.qrValue)}
                    className="flex-1 py-2 px-3 border border-stone-300 rounded-lg text-xs font-medium text-stone-700 bg-white hover:bg-stone-50 transition-colors flex items-center justify-center gap-1.5"
                  >
                    {copiedValue ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedValue ? "Copied!" : "Copy Value"}
                  </button>

                  <a
                    href={`/api/qr-codes/${previewQR.qrId}/download?format=png`}
                    download={`${previewQR.packageNumber}.png`}
                    className="flex-1 py-2 px-3 border border-stone-300 rounded-lg text-xs font-medium text-stone-700 bg-white hover:bg-stone-50 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download PNG
                  </a>

                  <button
                    onClick={() => window.print()}
                    className="flex-1 py-2 px-3 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Print Tag
                  </button>
                </div>

                <Link
                  href={`/traceability/qr/${encodeURIComponent(previewQR.qrValue)}`}
                  target="_blank"
                  className="w-full py-2 px-3 text-center text-xs font-medium text-emerald-800 hover:text-emerald-950 flex items-center justify-center gap-1"
                >
                  Open Public Traceability Page <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* MODAL 3: REVOKE QR PACKAGE */}
        {/* ============================================================== */}
        {revokingQR && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-stone-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="p-4 bg-red-800 text-white flex items-center justify-between">
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <X className="h-5 w-5" />
                  Revoke Package {revokingQR.packageNumber}
                </h3>
                <button
                  onClick={() => setRevokingQR(null)}
                  className="text-red-200 hover:text-white transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleRevokeSubmit} className="p-6 space-y-4">
                <div className="p-3 bg-red-50 rounded-xl border border-red-200 text-xs text-red-800">
                  <p className="font-semibold">Accounting Notice:</p>
                  <p className="mt-0.5">
                    Revoking this package marks it invalid for custody transfers. Standard revocation <strong>preserves packaging capacity</strong> ({revokingQR.representedQuantityKg} kg remains allocated). If physical cocoa is emptied back to bulk, you can execute a Return-to-Bulk repackage afterward.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                    Revocation Reason *
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={revocationReason}
                    onChange={(e) => setRevocationReason(e.target.value)}
                    placeholder="e.g. Bag damaged during handling, moisture defect, seal broken..."
                    className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:outline-none"
                  />
                </div>

                <div className="pt-4 border-t border-stone-200 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setRevokingQR(null)}
                    className="px-4 py-2 border border-stone-300 rounded-lg text-sm font-medium text-stone-700 hover:bg-stone-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="px-5 py-2 rounded-lg text-sm font-medium text-white bg-red-700 hover:bg-red-800 disabled:opacity-50 transition-colors"
                  >
                    {actionLoading ? "Revoking..." : "Confirm Revocation"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* MODAL 4: RETURN TO BULK / REPACKAGE */}
        {/* ============================================================== */}
        {repackagingQR && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-stone-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="p-4 bg-purple-900 text-white flex items-center justify-between">
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <RotateCcw className="h-5 w-5" />
                  Return Cocoa to Bulk State
                </h3>
                <button
                  onClick={() => setRepackagingQR(null)}
                  className="text-purple-200 hover:text-white transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleRepackageSubmit} className="p-6 space-y-4">
                <div className="p-3 bg-purple-50 rounded-xl border border-purple-200 text-xs text-purple-900">
                  <p className="font-semibold">Capacity Release Invariant:</p>
                  <p className="mt-0.5">
                    Executing this formal return-to-bulk releases <strong>{repackagingQR.representedQuantityKg} kg</strong> back to the holding&apos;s unpackaged bulk balance. The revoked QR package code remains permanently retired and will never be reused.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                    Repackaging / Warehouse Notes
                  </label>
                  <textarea
                    rows={3}
                    value={repackageNotes}
                    onChange={(e) => setRepackageNotes(e.target.value)}
                    placeholder="e.g. Physical cocoa dumped back into bulk warehouse hopper for re-bagging..."
                    className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  />
                </div>

                <div className="pt-4 border-t border-stone-200 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setRepackagingQR(null)}
                    className="px-4 py-2 border border-stone-300 rounded-lg text-sm font-medium text-stone-700 hover:bg-stone-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="px-5 py-2 rounded-lg text-sm font-medium text-white bg-purple-700 hover:bg-purple-800 disabled:opacity-50 transition-colors"
                  >
                    {actionLoading ? "Processing..." : `Release ${repackagingQR.representedQuantityKg} kg to Bulk`}
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
