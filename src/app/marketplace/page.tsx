/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */
"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { Navbar } from "@/components/Navbar";
import { useFirebase } from "@/context/FirebaseContext";
import { createCocoaApiClient, CocoaApiError } from "@/lib/cocoaApiClient";
import {
  MarketplaceListing,
  MarketplaceCertificationType,
  MarketplaceInventoryMode,
  MarketplaceListingStatus,
  CertificateHolding,
  CocoaLot,
  QRCode,
  CertificateHolderType,
} from "@/types/traceability";
import {
  ShieldCheck,
  MapPin,
  Store,
  Plus,
  Filter,
  Search,
  RefreshCw,
  SlidersHorizontal,
  ChevronRight,
  Package,
  Layers,
  CheckCircle2,
  AlertCircle,
  X,
  CreditCard,
  Building2,
  BadgeCheck,
  Calendar,
  Lock,
  ArrowRight,
  Sparkles,
  HelpCircle,
} from "lucide-react";

export default function MarketplacePage() {
  const { user } = useFirebase();

  const apiClient = useMemo(() => {
    return createCocoaApiClient(async () => {
      if (!user) return null;
      return await user.getIdToken();
    });
  }, [user]);

  // Listings State
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters State
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCertification, setFilterCertification] = useState<"ALL" | "certified" | "uncertified">("ALL");
  const [filterStatus, setFilterStatus] = useState<"ALL" | MarketplaceListingStatus>("ALL");
  const [filterMode, setFilterMode] = useState<"ALL" | MarketplaceInventoryMode>("ALL");
  const [viewScope, setViewScope] = useState<"catalog" | "my-listings">("catalog");

  // Create Listing Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  // Available backing inventory for creation
  const [myHoldings, setMyHoldings] = useState<CertificateHolding[]>([]);
  const [myLots, setMyLots] = useState<CocoaLot[]>([]);
  const [holdingQRs, setHoldingQRs] = useState<QRCode[]>([]);
  const [loadingQRs, setLoadingQRs] = useState(false);

  // Create Form fields
  const [formCertificationType, setFormCertificationType] = useState<MarketplaceCertificationType>("certified");
  const [formSellerHolderType, setFormSellerHolderType] = useState<CertificateHolderType>("cooperative");
  const [formHoldingId, setFormHoldingId] = useState("");
  const [formLotId, setFormLotId] = useState("");
  const [formInventoryMode, setFormInventoryMode] = useState<MarketplaceInventoryMode>("BULK");
  const [formSelectedQrIds, setFormSelectedQrIds] = useState<string[]>([]);
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formQuantityKg, setFormQuantityKg] = useState<number>(0);
  const [formPricePerKg, setFormPricePerKg] = useState<number>(0);
  const [formCurrency, setFormCurrency] = useState("XAF");
  const [formQualityGrade, setFormQualityGrade] = useState("Grade 1 Export");

  // Quick Purchase Modal State
  const [purchaseListing, setPurchaseListing] = useState<MarketplaceListing | null>(null);
  const [purchaseQuantityKg, setPurchaseQuantityKg] = useState<number>(0);
  const [purchaseSelectedQrs, setPurchaseSelectedQrs] = useState<string[]>([]);
  const [purchaseBuyerType, setPurchaseBuyerType] = useState<CertificateHolderType>("cooperative");
  const [purchaseSubmitting, setPurchaseSubmitting] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [purchaseSuccess, setPurchaseSuccess] = useState<string | null>(null);
  const [calculatedIntent, setCalculatedIntent] = useState<any | null>(null);

  // Load Listings
  const loadListings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<{ success: boolean; listings: MarketplaceListing[] }>(
        "/api/marketplace/listings"
      );
      if (res && res.success && Array.isArray(res.listings)) {
        setListings(res.listings);
      } else {
        setListings([]);
      }
    } catch (err: unknown) {
      if (err instanceof CocoaApiError) {
        setError(err.message);
      } else {
        setError("Failed to fetch marketplace listings.");
      }
      setListings([]);
    } finally {
      setLoading(false);
    }
  }, [apiClient]);

  useEffect(() => {
    loadListings();
  }, [loadListings]);

  // Load Inventory for creating listings when modal opens
  const loadCreatorInventory = useCallback(async () => {
    if (!user) return;
    try {
      const [holdingsRes, lotsRes] = await Promise.all([
        apiClient.get<{ success: boolean; holdings: CertificateHolding[] }>("/api/certificate-holdings"),
        apiClient.get<{ success: boolean; lots: CocoaLot[] }>("/api/cocoa-lots"),
      ]);
      if (holdingsRes && holdingsRes.success) {
        setMyHoldings(holdingsRes.holdings || []);
      }
      if (lotsRes && lotsRes.success) {
        setMyLots(lotsRes.lots || []);
      }
    } catch (err) {
      console.warn("Could not fetch inventory:", err);
    }
  }, [apiClient, user]);

  useEffect(() => {
    if (showCreateModal && user) {
      loadCreatorInventory();
    }
  }, [showCreateModal, user, loadCreatorInventory]);

  // Load QR packages when a holding is selected in QR_PACKAGES mode
  useEffect(() => {
    if (formHoldingId && formInventoryMode === "QR_PACKAGES" && user) {
      setLoadingQRs(true);
      apiClient
        .get<{ success: boolean; qrCodes: QRCode[] }>(`/api/qr-codes?holdingId=${encodeURIComponent(formHoldingId)}`)
        .then((res) => {
          if (res && res.success) {
            const activeOnly = (res.qrCodes || []).filter(
              (q) => q.status === "active" && !q.returnedToBulk
            );
            setHoldingQRs(activeOnly);
          } else {
            setHoldingQRs([]);
          }
        })
        .catch(() => setHoldingQRs([]))
        .finally(() => setLoadingQRs(false));
    } else {
      setHoldingQRs([]);
    }
  }, [formHoldingId, formInventoryMode, user, apiClient]);

  // When holding is picked in certified mode, automatically sync Lot and Certificate
  useEffect(() => {
    if (formHoldingId && formCertificationType === "certified") {
      const h = myHoldings.find((x) => x.holdingId === formHoldingId);
      if (h) {
        setFormLotId(h.lotId);
        if (formInventoryMode === "BULK") {
          setFormQuantityKg(h.availableQuantityKg || 0);
        }
      }
    }
  }, [formHoldingId, formCertificationType, formInventoryMode, myHoldings]);

  // Automatically compute selected QR quantity in QR_PACKAGES mode
  useEffect(() => {
    if (formInventoryMode === "QR_PACKAGES") {
      const sum = formSelectedQrIds.reduce((total, id) => {
        const qr = holdingQRs.find((q) => q.qrId === id);
        return total + (qr ? qr.representedQuantityKg : 0);
      }, 0);
      setFormQuantityKg(sum);
    }
  }, [formSelectedQrIds, formInventoryMode, holdingQRs]);

  // Filtered Listings
  const filteredListings = useMemo(() => {
    return listings.filter((item) => {
      // User scope filter
      if (viewScope === "my-listings") {
        if (!user || (item.sellerHolderId !== user.uid && item.createdByUid !== user.uid)) {
          return false;
        }
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = item.title?.toLowerCase().includes(q);
        const matchesNum = item.listingNumber?.toLowerCase().includes(q);
        const matchesLot = item.lotId?.toLowerCase().includes(q);
        const matchesSeller = item.sellerHolderId?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesNum && !matchesLot && !matchesSeller) return false;
      }

      // Certification Filter
      if (filterCertification !== "ALL" && item.certificationType !== filterCertification) {
        return false;
      }

      // Status Filter
      if (filterStatus !== "ALL" && item.listingStatus !== filterStatus) {
        return false;
      }

      // Inventory Mode Filter
      if (filterMode !== "ALL" && item.inventoryMode !== filterMode) {
        return false;
      }

      return true;
    });
  }, [listings, searchQuery, filterCertification, filterStatus, filterMode, viewScope, user]);

  // Create Listing Handler
  const handleCreateListing = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreateSuccess(null);
    setCreateSubmitting(true);

    try {
      if (!formTitle.trim()) throw new Error("Listing Title is required.");
      if (formPricePerKg <= 0) throw new Error("Price per kg must be greater than 0.");
      if (formQuantityKg <= 0) throw new Error("Quantity in kilograms must be greater than 0.");

      const payload: any = {
        title: formTitle.trim(),
        description: formDescription.trim() || undefined,
        sellerHolderId: user?.uid,
        sellerHolderType: formSellerHolderType,
        certificationType: formCertificationType,
        pricePerKg: Number(formPricePerKg),
        quantityInitialKg: Number(formQuantityKg),
        currency: formCurrency.toUpperCase(),
        qualityGrade: formQualityGrade,
      };

      if (formCertificationType === "certified") {
        if (!formHoldingId) throw new Error("Please select a Certificate Holding.");
        const holding = myHoldings.find((h) => h.holdingId === formHoldingId);
        if (!holding) throw new Error("Selected holding not found.");

        payload.sourceHoldingId = holding.holdingId;
        payload.certificateId = holding.certificateId;
        payload.lotId = holding.lotId;
        payload.inventoryMode = formInventoryMode;

        if (formInventoryMode === "QR_PACKAGES") {
          if (formSelectedQrIds.length === 0) {
            throw new Error("Please select at least one active QR package.");
          }
          payload.initialQrPackageIds = formSelectedQrIds;
        }
      } else {
        // Uncertified
        if (!formLotId) throw new Error("Please select a Cocoa Lot.");
        payload.lotId = formLotId;
      }

      const res = await apiClient.post<{ success: boolean; listing: MarketplaceListing }>(
        "/api/marketplace/listings",
        payload
      );

      if (res && res.success) {
        setCreateSuccess(`Listing created successfully: ${res.listing.listingNumber}`);
        setTimeout(() => {
          setShowCreateModal(false);
          setCreateSuccess(null);
          loadListings();
        }, 1200);
      }
    } catch (err: unknown) {
      if (err instanceof CocoaApiError) {
        setCreateError(err.message);
      } else if (err instanceof Error) {
        setCreateError(err.message);
      } else {
        setCreateError("An unexpected error occurred while creating listing.");
      }
    } finally {
      setCreateSubmitting(false);
    }
  };

  // Open Purchase Modal
  const openPurchaseModal = async (listing: MarketplaceListing) => {
    setPurchaseListing(listing);
    setPurchaseError(null);
    setPurchaseSuccess(null);
    setCalculatedIntent(null);
    setPurchaseQuantityKg(listing.quantityAvailableKg);
    setPurchaseSelectedQrs(listing.currentQrPackageIds || []);

    // Precalculate intent
    if (user) {
      try {
        const intentRes = await apiClient.post<{ success: boolean; intent: any }>(
          "/api/marketplace/trades/on-platform-purchase",
          {
            action: "intent",
            listingId: listing.listingId,
            buyerHolderType: purchaseBuyerType,
            requestedQuantityKg: listing.quantityAvailableKg,
            selectedQrPackageIds: listing.inventoryMode === "QR_PACKAGES" ? listing.currentQrPackageIds : undefined,
          }
        );
        if (intentRes && intentRes.intent) {
          setCalculatedIntent(intentRes.intent);
        }
      } catch (err) {
        console.warn("Could not precalculate intent:", err);
      }
    }
  };

  // Execute Purchase
  const handleExecutePurchase = async () => {
    if (!purchaseListing) return;
    setPurchaseSubmitting(true);
    setPurchaseError(null);

    try {
      // 1. Get Purchase Intent
      const intentRes = await apiClient.post<{ success: boolean; intent: any }>(
        "/api/marketplace/trades/on-platform-purchase",
        {
          action: "intent",
          listingId: purchaseListing.listingId,
          buyerHolderType: purchaseBuyerType,
          requestedQuantityKg: purchaseQuantityKg,
          selectedQrPackageIds:
            purchaseListing.inventoryMode === "QR_PACKAGES" ? purchaseSelectedQrs : undefined,
        }
      );

      if (!intentRes || !intentRes.intent) {
        throw new Error("Failed to generate purchase intent.");
      }

      const intent = intentRes.intent;

      // 2. Finalize On-Platform Purchase
      const finalizeRes = await apiClient.post<{ success: boolean; trade: any; destHolding?: any }>(
        "/api/marketplace/trades/on-platform-purchase",
        {
          action: "finalize",
          paymentReference: intent.paymentReference,
          listingId: purchaseListing.listingId,
          buyerHolderType: purchaseBuyerType,
          purchasedQuantityKg: intent.quantityKg,
          selectedQrPackageIds: intent.selectedQrPackageIds,
          paymentMethod: "mtn_momo",
          externalTransactionReference: `MOMO-REF-${Date.now()}`,
        }
      );

      if (finalizeRes && finalizeRes.success) {
        setPurchaseSuccess(
          `Trade successfully finalized! Trade Number: ${finalizeRes.trade.tradeNumber}`
        );
        setTimeout(() => {
          setPurchaseListing(null);
          setPurchaseSuccess(null);
          loadListings();
        }, 1500);
      }
    } catch (err: unknown) {
      if (err instanceof CocoaApiError) {
        setPurchaseError(err.message);
      } else if (err instanceof Error) {
        setPurchaseError(err.message);
      } else {
        setPurchaseError("Purchase finalization failed.");
      }
    } finally {
      setPurchaseSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f8f3] text-[#10251d]">
      <Navbar />

      <main className="mx-auto max-w-[1360px] px-4 pt-28 pb-16 sm:px-6 sm:pt-32 lg:px-8">
        {/* Hero & Action Bar */}
        <section className="mb-8 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold uppercase tracking-[0.22em] text-[#2d6130]">
                Marketplace Exchange
              </span>
              <span className="flex items-center gap-1 rounded-full bg-[#edf7e8] px-2.5 py-0.5 text-[0.65rem] font-bold text-[#2d6130] border border-[#d2ecc8]">
                <ShieldCheck size={12} />
                Live Real-Data Catalog
              </span>
              <button
                type="button"
                onClick={() => setShowInfoModal(true)}
                className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-0.5 text-[0.65rem] font-bold text-[#0b3528] border border-[#dfe7d8] hover:bg-[#edf2ea] transition cursor-pointer shadow-xs"
                title="Marketplace Guide & Categories Info"
              >
                <HelpCircle size={12} className="text-[#2d6130]" />
                Guide &amp; Info
              </button>
            </div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-[#10251d] sm:text-4xl">
              Cameroon Cocoa Marketplace
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#57655d]">
              Explore verified Cameroonian cocoa offerings backed by immutable trace certificates,
              dedicated custody holdings, bag-level QR codes, and compliant export origin data.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {user && (
              <>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0b3528] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#144737] cursor-pointer"
                >
                  <Plus size={16} />
                  Create Cocoa Listing
                </button>
                <Link
                  href="/dashboard/trades"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-[#dfe7d8] bg-white px-5 py-3 text-sm font-bold text-[#10251d] shadow-sm transition hover:bg-[#edf2ea]"
                >
                  <CreditCard size={16} />
                  My Trades &amp; Orders
                </Link>
              </>
            )}
          </div>
        </section>

        {/* View Switcher & Search Bar */}
        <section className="mb-6 rounded-[24px] border border-[#dfe7d8] bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            {/* View Scope Tabs */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setViewScope("catalog")}
                className={`rounded-full px-4 py-2 text-xs font-bold transition ${
                  viewScope === "catalog"
                    ? "bg-[#0b3528] text-white"
                    : "bg-[#f1f4ec] text-[#57655d] hover:bg-[#e4ebd9]"
                }`}
              >
                Public Exchange ({listings.length})
              </button>
              {user && (
                <button
                  type="button"
                  onClick={() => setViewScope("my-listings")}
                  className={`rounded-full px-4 py-2 text-xs font-bold transition ${
                    viewScope === "my-listings"
                      ? "bg-[#0b3528] text-white"
                      : "bg-[#f1f4ec] text-[#57655d] hover:bg-[#e4ebd9]"
                  }`}
                >
                  My Offerings
                </button>
              )}
            </div>

            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#79887e]" />
              <input
                type="text"
                placeholder="Search by title, lot ID, or listing number..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-full border border-[#dfe7d8] bg-[#f7f8f3] py-2 pl-9 pr-4 text-xs font-medium text-[#10251d] outline-none transition focus:border-[#2d6130] focus:bg-white"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Quick Refresh */}
            <button
              type="button"
              onClick={loadListings}
              disabled={loading}
              className="inline-flex items-center justify-center gap-1.5 rounded-full border border-[#dfe7d8] bg-[#f8f9f3] px-3.5 py-2 text-xs font-bold text-[#2d6130] transition hover:bg-[#edf2ea] disabled:opacity-50"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              Refresh Catalog
            </button>
          </div>

          {/* Filter Pills */}
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#edf1ea] pt-3 text-xs">
            <span className="font-semibold text-[#57655d] flex items-center gap-1">
              <Filter size={12} /> Certification:
            </span>
            <button
              type="button"
              onClick={() => setFilterCertification("ALL")}
              className={`rounded-full px-2.5 py-1 font-semibold ${
                filterCertification === "ALL"
                  ? "bg-[#2d6130] text-white"
                  : "bg-[#edf1ea] text-[#57655d] hover:bg-[#e2e9dd]"
              }`}
            >
              All Types
            </button>
            <button
              type="button"
              onClick={() => setFilterCertification("certified")}
              className={`rounded-full px-2.5 py-1 font-semibold ${
                filterCertification === "certified"
                  ? "bg-[#2d6130] text-white"
                  : "bg-[#edf1ea] text-[#57655d] hover:bg-[#e2e9dd]"
              }`}
            >
              Certified Only
            </button>
            <button
              type="button"
              onClick={() => setFilterCertification("uncertified")}
              className={`rounded-full px-2.5 py-1 font-semibold ${
                filterCertification === "uncertified"
                  ? "bg-[#2d6130] text-white"
                  : "bg-[#edf1ea] text-[#57655d] hover:bg-[#e2e9dd]"
              }`}
            >
              Uncertified
            </button>

            <span className="ml-3 font-semibold text-[#57655d]">Status:</span>
            {(["ALL", "available", "under_negotiation", "sold"] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setFilterStatus(st)}
                className={`rounded-full px-2.5 py-1 font-semibold capitalize ${
                  filterStatus === st
                    ? "bg-[#0b3528] text-white"
                    : "bg-[#edf1ea] text-[#57655d] hover:bg-[#e2e9dd]"
                }`}
              >
                {st.replace("_", " ")}
              </button>
            ))}

            <span className="ml-3 font-semibold text-[#57655d]">Mode:</span>
            {(["ALL", "BULK", "QR_PACKAGES"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setFilterMode(m)}
                className={`rounded-full px-2.5 py-1 font-semibold ${
                  filterMode === m
                    ? "bg-[#0b3528] text-white"
                    : "bg-[#edf1ea] text-[#57655d] hover:bg-[#e2e9dd]"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </section>

        {/* Catalog Grid */}
        {loading && listings.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-[32px] border border-[#dfe7d8] bg-white p-16 text-center shadow-sm">
            <RefreshCw size={36} className="animate-spin text-[#2d6130]" />
            <h3 className="mt-4 text-base font-bold text-[#10251d]">Loading Live Cocoa Catalog...</h3>
            <p className="mt-1 text-xs text-[#57655d]">
              Fetching real marketplace listings and derived stock availability.
            </p>
          </div>
        ) : error ? (
          <div className="rounded-[28px] border border-red-200 bg-red-50 p-6 text-red-800">
            <div className="flex items-center gap-2 font-bold text-sm">
              <AlertCircle size={18} /> Error Loading Marketplace Catalog
            </div>
            <p className="mt-1 text-xs">{error}</p>
            <button
              type="button"
              onClick={loadListings}
              className="mt-3 rounded-full bg-red-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        ) : filteredListings.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-[32px] border border-[#dfe7d8] bg-white p-16 text-center shadow-sm">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#f1f6ec] text-[#2d6130]">
              <Store size={28} />
            </div>
            <h3 className="mt-4 text-lg font-bold text-[#10251d]">No cocoa listings found</h3>
            <p className="mt-1 max-w-sm text-xs text-[#57655d]">
              {searchQuery || filterCertification !== "ALL" || filterStatus !== "ALL"
                ? "No listings match the current filters. Try resetting your search parameters."
                : "No marketplace listings have been created yet. Be the first producer or cooperative to publish an offering."}
            </p>
            {user && (
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="mt-5 inline-flex items-center justify-center gap-1.5 rounded-full bg-[#0b3528] px-5 py-2.5 text-xs font-bold text-white"
              >
                <Plus size={14} /> Create Your First Listing
              </button>
            )}
          </div>
        ) : (
          <section className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredListings.map((item) => {
              const isCertified = item.certificationType === "certified";
              const isOwner = user && (user.uid === item.sellerHolderId || user.uid === item.createdByUid);
              const isSold = item.listingStatus === "sold" || item.quantityAvailableKg <= 0;
              const isUnderNegotiation = item.listingStatus === "under_negotiation";

              return (
                <article
                  key={item.listingId}
                  className="flex flex-col justify-between rounded-[28px] border border-[#dfe7d8] bg-white p-5 shadow-[0_18px_35px_rgba(16,37,29,0.06)] transition hover:shadow-md"
                >
                  <div>
                    {/* Header Badges */}
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold uppercase tracking-wider ${
                          isCertified
                            ? "bg-[#edf7e8] text-[#2d6130] border border-[#cdebc2]"
                            : "bg-[#f5f3e9] text-[#745f21] border border-[#e8e0c0]"
                        }`}
                      >
                        {isCertified ? "Certified Origin" : "Uncertified"}
                      </span>

                      <div className="flex items-center gap-1.5">
                        {item.inventoryMode && (
                          <span className="rounded-full bg-[#f1f4ee] px-2 py-0.5 text-[0.65rem] font-semibold text-[#48564e]">
                            {item.inventoryMode === "QR_PACKAGES" ? "QR Packages" : "Bulk Lot"}
                          </span>
                        )}
                        <span
                          className={`rounded-full px-2 py-0.5 text-[0.65rem] font-bold capitalize ${
                            isSold
                              ? "bg-red-50 text-red-700 border border-red-200"
                              : isUnderNegotiation
                              ? "bg-amber-50 text-amber-700 border border-amber-200"
                              : "bg-[#eefbf3] text-[#1d6a45] border border-[#caeed6]"
                          }`}
                        >
                          {item.listingStatus.replace("_", " ")}
                        </span>
                      </div>
                    </div>

                    {/* Image / Thumbnail placeholder if available */}
                    {item.cocoaImage?.secureUrl ? (
                      <div className="relative mb-3 h-40 w-full overflow-hidden rounded-2xl bg-[#f0f4ec]">
                        <Image
                          src={item.cocoaImage.secureUrl}
                          alt={item.title}
                          fill
                          className="object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    ) : (
                      <div className="mb-3 flex h-32 w-full items-center justify-center rounded-2xl bg-gradient-to-br from-[#12382c] to-[#08221a] text-white">
                        <div className="text-center">
                          <span className="text-2xl">🍫</span>
                          <div className="mt-1 text-[11px] font-semibold text-[#b8f58b]">
                            {item.qualityGrade || "Export Quality Cocoa"}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Title & Listing Number */}
                    <h2 className="text-lg font-bold leading-snug text-[#10251d]">{item.title}</h2>
                    <div className="mt-1 flex items-center gap-2 font-mono text-[11px] text-[#57655d]">
                      <span>{item.listingNumber}</span>
                      <span>•</span>
                      <span className="capitalize">{item.sellerHolderType} seller</span>
                    </div>

                    {item.description && (
                      <p className="mt-2 text-xs leading-relaxed text-[#57655d] line-clamp-2">
                        {item.description}
                      </p>
                    )}

                    {/* Technical Specifications */}
                    <dl className="mt-4 space-y-2 border-t border-[#edf1ea] pt-3 text-xs text-[#394a41]">
                      <div className="flex items-center justify-between pb-1">
                        <dt className="text-[#6c7b72]">Available Quantity</dt>
                        <dd className="font-bold text-[#10251d]">
                          {item.quantityAvailableKg.toLocaleString()} kg
                          {item.quantityInitialKg !== item.quantityAvailableKg && (
                            <span className="ml-1 text-[10px] text-gray-400 font-normal">
                              (of {item.quantityInitialKg.toLocaleString()} kg)
                            </span>
                          )}
                        </dd>
                      </div>

                      <div className="flex items-center justify-between pb-1">
                        <dt className="text-[#6c7b72]">Unit Price</dt>
                        <dd className="font-bold text-[#10251d]">
                          {item.pricePerKg.toLocaleString()} {item.currency} / kg
                        </dd>
                      </div>

                      {item.lotId && (
                        <div className="flex items-center justify-between pb-1">
                          <dt className="text-[#6c7b72]">Cocoa Lot</dt>
                          <dd className="font-mono text-[11px] font-medium text-[#10251d]">{item.lotId}</dd>
                        </div>
                      )}

                      {isCertified && item.certificateId && (
                        <div className="flex items-center justify-between pb-1">
                          <dt className="text-[#6c7b72]">Certificate</dt>
                          <dd className="font-mono text-[11px] font-medium text-[#2d6130]">
                            {item.certificateId}
                          </dd>
                        </div>
                      )}

                      {item.inventoryMode === "QR_PACKAGES" && (
                        <div className="flex items-center justify-between pb-1">
                          <dt className="text-[#6c7b72]">Active Packages</dt>
                          <dd className="font-bold text-[#10251d]">
                            {item.currentQrPackageIds?.length || 0} discrete bags
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>

                  {/* Pricing Total & Actions */}
                  <div className="mt-5 border-t border-[#edf1ea] pt-4">
                    <div className="mb-3 flex items-baseline justify-between">
                      <span className="text-xs text-[#6c7b72]">Estimated Lot Total</span>
                      <strong className="text-lg font-bold text-[#10251d]">
                        {(item.quantityAvailableKg * item.pricePerKg).toLocaleString()} {item.currency}
                      </strong>
                    </div>

                    <div className="flex items-center gap-2">
                      <Link
                        href={`/product/${item.listingId}`}
                        className="flex-1 inline-flex items-center justify-center rounded-full border border-[#dfe7d8] bg-white py-2 text-xs font-bold text-[#10251d] transition hover:bg-[#edf2ea]"
                      >
                        Details &amp; Trace
                      </Link>

                      {!isSold && (
                        <button
                          type="button"
                          onClick={() => openPurchaseModal(item)}
                          className="flex-1 inline-flex items-center justify-center rounded-full bg-[#0b3528] py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#144737] cursor-pointer"
                        >
                          Buy Cocoa
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}

        {/* Modal: Create Listing */}
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm overflow-y-auto">
            <div className="relative my-8 w-full max-w-2xl rounded-[32px] border border-[#dfe7d8] bg-white p-6 shadow-2xl">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="absolute right-5 top-5 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <X size={18} />
              </button>

              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#2d6130]">
                <Store size={14} /> New Marketplace Offering
              </div>
              <h2 className="mt-1 text-2xl font-bold text-[#10251d]">Create Cocoa Listing</h2>
              <p className="mt-1 text-xs text-[#57655d]">
                Publish certified or uncertified cocoa to the national marketplace with guaranteed 1-to-1 inventory provenance.
              </p>

              {createError && (
                <div className="mt-4 rounded-2xl bg-red-50 p-3 text-xs text-red-700 flex items-start gap-2 border border-red-200">
                  <AlertCircle size={15} className="shrink-0 mt-0.5" />
                  <span>{createError}</span>
                </div>
              )}

              {createSuccess && (
                <div className="mt-4 rounded-2xl bg-green-50 p-3 text-xs text-green-700 flex items-start gap-2 border border-green-200">
                  <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
                  <span>{createSuccess}</span>
                </div>
              )}

              <form onSubmit={handleCreateListing} className="mt-5 space-y-4 text-xs">
                {/* Certification Type Selector */}
                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">Certification Type</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setFormCertificationType("certified");
                        setFormHoldingId("");
                      }}
                      className={`rounded-2xl border p-3 text-left transition ${
                        formCertificationType === "certified"
                          ? "border-[#2d6130] bg-[#edf7e8]"
                          : "border-[#dfe7d8] bg-[#fbfcf9]"
                      }`}
                    >
                      <div className="font-bold text-[#10251d]">Certified Origin</div>
                      <div className="mt-0.5 text-[11px] text-[#57655d]">
                        Backed by Certificate Holding &amp; optional QR packages.
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFormCertificationType("uncertified");
                        setFormHoldingId("");
                        setFormInventoryMode("BULK");
                        setFormSelectedQrIds([]);
                      }}
                      className={`rounded-2xl border p-3 text-left transition ${
                        formCertificationType === "uncertified"
                          ? "border-[#2d6130] bg-[#edf7e8]"
                          : "border-[#dfe7d8] bg-[#fbfcf9]"
                      }`}
                    >
                      <div className="font-bold text-[#10251d]">Uncertified Cocoa</div>
                      <div className="mt-0.5 text-[11px] text-[#57655d]">
                        Direct physical lot balance (no certificate or holdings).
                      </div>
                    </button>
                  </div>
                </div>

                {/* Seller Holder Type */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block font-semibold text-[#10251d] mb-1">Seller Entity Role</label>
                    <select
                      value={formSellerHolderType}
                      onChange={(e) => setFormSellerHolderType(e.target.value as CertificateHolderType)}
                      className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                    >
                      <option value="farmer">Farmer (Producer)</option>
                      <option value="cooperative">Cooperative Society</option>
                      <option value="agent">Licensed Buying Agent</option>
                      <option value="warehouse">Licensed Export Warehouse</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-[#10251d] mb-1">Quality Grade</label>
                    <input
                      type="text"
                      value={formQualityGrade}
                      onChange={(e) => setFormQualityGrade(e.target.value)}
                      placeholder="e.g. Grade 1 Export, Standard Fermented"
                      className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                    />
                  </div>
                </div>

                {/* Source Selection depending on Certification */}
                {formCertificationType === "certified" ? (
                  <div className="rounded-2xl border border-[#d6e5d1] bg-[#f5f9f3] p-3 space-y-3">
                    <div>
                      <label className="block font-semibold text-[#10251d] mb-1">
                        Select Certificate Holding (Source Custody Unit)
                      </label>
                      <select
                        value={formHoldingId}
                        onChange={(e) => setFormHoldingId(e.target.value)}
                        className="w-full rounded-xl border border-[#dfe7d8] bg-white p-2.5 outline-none font-medium"
                      >
                        <option value="">-- Choose Eligible Holding --</option>
                        {myHoldings.map((h) => (
                          <option key={h.holdingId} value={h.holdingId}>
                            {h.holdingId} — Lot: {h.lotId} ({h.availableQuantityKg} kg available)
                          </option>
                        ))}
                      </select>
                      {myHoldings.length === 0 && (
                        <p className="mt-1 text-[11px] text-amber-700">
                          No certificate holdings available for this user. Create or transfer a holding first in Dashboard Holdings.
                        </p>
                      )}
                    </div>

                    {formHoldingId && (
                      <div className="pt-2 border-t border-[#e2edd8]">
                        <label className="block font-semibold text-[#10251d] mb-1">Inventory Mode</label>
                        <div className="flex gap-4">
                          <label className="flex items-center gap-2 cursor-pointer font-medium">
                            <input
                              type="radio"
                              name="invMode"
                              checked={formInventoryMode === "BULK"}
                              onChange={() => {
                                setFormInventoryMode("BULK");
                                setFormSelectedQrIds([]);
                              }}
                            />
                            BULK Cocoa (Continuous kg quantity)
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer font-medium">
                            <input
                              type="radio"
                              name="invMode"
                              checked={formInventoryMode === "QR_PACKAGES"}
                              onChange={() => setFormInventoryMode("QR_PACKAGES")}
                            />
                            QR_PACKAGES (Discrete scanned bag units)
                          </label>
                        </div>
                      </div>
                    )}

                    {/* QR Packages selector if QR mode */}
                    {formHoldingId && formInventoryMode === "QR_PACKAGES" && (
                      <div className="pt-2 border-t border-[#e2edd8]">
                        <label className="block font-semibold text-[#10251d] mb-1">
                          Select QR Packages to Include in Listing
                        </label>
                        {loadingQRs ? (
                          <div className="text-xs text-[#57655d] py-2">Loading active QR packages...</div>
                        ) : holdingQRs.length === 0 ? (
                          <div className="text-xs text-amber-700 py-2">
                            No active QR packages found for this holding. Generate packages first in QR Traceability.
                          </div>
                        ) : (
                          <div className="max-h-40 overflow-y-auto space-y-1.5 rounded-xl border border-[#dfe7d8] bg-white p-2">
                            {holdingQRs.map((qr) => {
                              const checked = formSelectedQrIds.includes(qr.qrId);
                              return (
                                <label
                                  key={qr.qrId}
                                  className="flex items-center justify-between rounded-lg p-1.5 hover:bg-[#f1f6ec] cursor-pointer"
                                >
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          setFormSelectedQrIds([...formSelectedQrIds, qr.qrId]);
                                        } else {
                                          setFormSelectedQrIds(formSelectedQrIds.filter((id) => id !== qr.qrId));
                                        }
                                      }}
                                    />
                                    <span className="font-mono text-[11px] font-bold">{qr.packageNumber || qr.qrId}</span>
                                    <span className="text-[10px] text-gray-400">({qr.qrId})</span>
                                  </div>
                                  <span className="font-semibold text-[#2d6130]">
                                    {qr.representedQuantityKg} kg
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                        <p className="mt-1 text-[11px] text-[#57655d]">
                          Selected: {formSelectedQrIds.length} bags ({formQuantityKg} kg total)
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  // Uncertified Mode: Cocoa Lot selector
                  <div className="rounded-2xl border border-[#e5e0cc] bg-[#faf8f0] p-3">
                    <label className="block font-semibold text-[#10251d] mb-1">
                      Select Physical Cocoa Lot
                    </label>
                    <select
                      value={formLotId}
                      onChange={(e) => {
                        setFormLotId(e.target.value);
                        const found = myLots.find((l) => l.lotId === e.target.value);
                        if (found) setFormQuantityKg(found.quantityKg || 0);
                      }}
                      className="w-full rounded-xl border border-[#dfe7d8] bg-white p-2.5 outline-none font-medium"
                    >
                      <option value="">-- Choose Cocoa Lot --</option>
                      {myLots.map((l) => (
                        <option key={l.lotId} value={l.lotId}>
                          {l.lotNumber || l.lotId} — Farm: {l.farmId} ({l.quantityKg} kg total physical)
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Title & Description */}
                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">Listing Headline / Title</label>
                  <input
                    type="text"
                    required
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="e.g. Export-Grade Cameroon Trinitario Cocoa (Mile 18 Cooperative)"
                    className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">Description (Optional)</label>
                  <textarea
                    rows={2}
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="Details regarding fermentation, drying, aroma profile, or harvest dates..."
                    className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                  />
                </div>

                {/* Quantity & Pricing */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block font-semibold text-[#10251d] mb-1">
                      Quantity (kg)
                    </label>
                    <input
                      type="number"
                      required
                      min={1}
                      disabled={formInventoryMode === "QR_PACKAGES"}
                      value={formQuantityKg || ""}
                      onChange={(e) => setFormQuantityKg(Number(e.target.value))}
                      className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium disabled:opacity-60"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-[#10251d] mb-1">Price per kg</label>
                    <input
                      type="number"
                      required
                      min={1}
                      value={formPricePerKg || ""}
                      onChange={(e) => setFormPricePerKg(Number(e.target.value))}
                      placeholder="e.g. 2400"
                      className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-[#10251d] mb-1">Currency</label>
                    <select
                      value={formCurrency}
                      onChange={(e) => setFormCurrency(e.target.value)}
                      className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                    >
                      <option value="XAF">XAF (FCFA)</option>
                      <option value="USD">USD ($)</option>
                      <option value="NGN">NGN (₦)</option>
                    </select>
                  </div>
                </div>

                {/* Total Preview */}
                <div className="rounded-2xl bg-[#edf7e8] p-3 text-xs flex items-center justify-between font-bold text-[#10251d]">
                  <span>Total Listing Value:</span>
                  <span>
                    {(formQuantityKg * formPricePerKg).toLocaleString()} {formCurrency}
                  </span>
                </div>

                <div className="mt-5 flex items-center justify-end gap-3 pt-3 border-t border-[#edf1ea]">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="rounded-full px-5 py-2 font-bold text-gray-500 hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createSubmitting}
                    className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#0b3528] px-6 py-2.5 font-bold text-white shadow-sm hover:bg-[#144737] disabled:opacity-50 cursor-pointer"
                  >
                    {createSubmitting ? "Publishing..." : "Publish Offering"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Quick Purchase / Buy Cocoa */}
        {purchaseListing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm overflow-y-auto">
            <div className="relative my-8 w-full max-w-xl rounded-[32px] border border-[#dfe7d8] bg-white p-6 shadow-2xl">
              <button
                type="button"
                onClick={() => setPurchaseListing(null)}
                className="absolute right-5 top-5 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <X size={18} />
              </button>

              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#2d6130]">
                <CreditCard size={14} /> Commercial Purchase
              </div>
              <h2 className="mt-1 text-2xl font-bold text-[#10251d]">Purchase Cocoa Offering</h2>
              <p className="mt-1 text-xs text-[#57655d]">
                Execute real on-platform trade execution with automated platform fees (2%) and atomic
                certificate transfer.
              </p>

              {purchaseError && (
                <div className="mt-4 rounded-2xl bg-red-50 p-3 text-xs text-red-700 flex items-start gap-2 border border-red-200">
                  <AlertCircle size={15} className="shrink-0 mt-0.5" />
                  <span>{purchaseError}</span>
                </div>
              )}

              {purchaseSuccess && (
                <div className="mt-4 rounded-2xl bg-green-50 p-3 text-xs text-green-700 flex items-start gap-2 border border-green-200">
                  <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
                  <span>{purchaseSuccess}</span>
                </div>
              )}

              <div className="mt-5 space-y-4 text-xs">
                {/* Offering Summary */}
                <div className="rounded-2xl border border-[#dfe7d8] bg-[#f8f9f3] p-4">
                  <h3 className="font-bold text-sm text-[#10251d]">{purchaseListing.title}</h3>
                  <div className="mt-1 text-gray-500 font-mono text-[11px]">
                    Listing: {purchaseListing.listingNumber} • Status: {purchaseListing.listingStatus}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-gray-500">Unit Price:</span>{" "}
                      <strong className="text-[#10251d]">
                        {purchaseListing.pricePerKg.toLocaleString()} {purchaseListing.currency} / kg
                      </strong>
                    </div>
                    <div>
                      <span className="text-gray-500">Available:</span>{" "}
                      <strong className="text-[#10251d]">
                        {purchaseListing.quantityAvailableKg.toLocaleString()} kg
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Buyer Entity Role */}
                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">Your Buyer Entity Role</label>
                  <select
                    value={purchaseBuyerType}
                    onChange={(e) => setPurchaseBuyerType(e.target.value as CertificateHolderType)}
                    className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                  >
                    <option value="cooperative">Cooperative Society</option>
                    <option value="agent">Licensed Buying Agent</option>
                    <option value="warehouse">Licensed Export Warehouse</option>
                  </select>
                </div>

                {/* Quantity Input if Bulk / Uncertified */}
                {purchaseListing.inventoryMode !== "QR_PACKAGES" ? (
                  <div>
                    <label className="block font-semibold text-[#10251d] mb-1">
                      Purchase Quantity (kg)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={purchaseListing.quantityAvailableKg}
                      value={purchaseQuantityKg || ""}
                      onChange={(e) => setPurchaseQuantityKg(Number(e.target.value))}
                      className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block font-semibold text-[#10251d] mb-1">
                      Discrete Packages ({purchaseListing.currentQrPackageIds?.length || 0} available)
                    </label>
                    <div className="rounded-xl border border-[#dfe7d8] bg-[#f8f9f3] p-3 text-gray-600">
                      Purchasing all {purchaseListing.currentQrPackageIds?.length} active packages (
                      {purchaseListing.quantityAvailableKg} kg).
                    </div>
                  </div>
                )}

                {/* Financial Summary */}
                <div className="rounded-2xl bg-[#edf7e8] border border-[#cdebc2] p-4 space-y-1.5 text-xs text-[#10251d]">
                  <div className="flex justify-between">
                    <span>Base Trade Value:</span>
                    <span>
                      {(purchaseQuantityKg * purchaseListing.pricePerKg).toLocaleString()}{" "}
                      {purchaseListing.currency}
                    </span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Platform Service Fee (2%):</span>
                    <span>
                      {Math.round(purchaseQuantityKg * purchaseListing.pricePerKg * 0.02).toLocaleString()}{" "}
                      {purchaseListing.currency}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-[#c6e6bb] font-bold text-sm">
                    <span>Total Amount Payable:</span>
                    <span>
                      {Math.round(purchaseQuantityKg * purchaseListing.pricePerKg * 1.02).toLocaleString()}{" "}
                      {purchaseListing.currency}
                    </span>
                  </div>
                </div>

                {/* Execute Button */}
                <div className="mt-5 flex items-center justify-end gap-3 pt-3 border-t border-[#edf1ea]">
                  <button
                    type="button"
                    onClick={() => setPurchaseListing(null)}
                    className="rounded-full px-5 py-2 font-bold text-gray-500 hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                  {!user ? (
                    <Link
                      href={`/login?redirect=${encodeURIComponent(`/marketplace`)}`}
                      className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#0b3528] px-6 py-2.5 font-bold text-white shadow-sm hover:bg-[#144737]"
                    >
                      Sign In to Complete Trade
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={handleExecutePurchase}
                      disabled={purchaseSubmitting}
                      className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#0b3528] px-6 py-2.5 font-bold text-white shadow-sm hover:bg-[#144737] disabled:opacity-50 cursor-pointer"
                    >
                      {purchaseSubmitting ? "Finalizing Transaction..." : "Confirm & Execute Trade"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        {/* Marketplace Info & Guide Modal */}
        {showInfoModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
            <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[28px] bg-white p-6 shadow-2xl sm:p-8">
              <div className="flex items-center justify-between pb-4 border-b border-[#edf1ea]">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#edf7e8] text-[#2d6130]">
                    <HelpCircle size={20} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-[#10251d]">Marketplace Guide &amp; Features</h3>
                    <p className="text-xs text-[#57655d]">Cameroon–Cross River Traceability &amp; Export Exchange</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowInfoModal(false)}
                  className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="mt-6 space-y-6 text-sm text-[#334139]">
                <div>
                  <h4 className="font-bold text-[#0b3528] flex items-center gap-2 text-base">
                    <ShieldCheck size={18} className="text-[#2d6130]" />
                    1. Certification Categories
                  </h4>
                  <p className="mt-1 text-xs leading-relaxed text-[#57655d]">
                    Listings are categorized based on origin verification and compliance standards:
                  </p>
                  <ul className="mt-2 space-y-2 text-xs text-[#57655d] list-disc pl-5">
                    <li><strong className="text-[#10251d]">Certified (Origin Trace):</strong> Backed by immutable Origin Trace Certificates, EUDR deforestation-risk compliance audits, and verified cooperative custody holdings.</li>
                    <li><strong className="text-[#10251d]">Uncertified:</strong> Standard commercial cocoa lots traded directly from registered farms or aggregators without origin certificate custody.</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-bold text-[#0b3528] flex items-center gap-2 text-base">
                    <Layers size={18} className="text-[#2d6130]" />
                    2. Inventory Modes
                  </h4>
                  <p className="mt-1 text-xs leading-relaxed text-[#57655d]">
                    Sellers list cocoa under two operational inventory modes:
                  </p>
                  <ul className="mt-2 space-y-2 text-xs text-[#57655d] list-disc pl-5">
                    <li><strong className="text-[#10251d]">BULK Mode:</strong> Traded by total weight in kilograms (kg) or metric tons, linked to bulk regional batches and cooperative supply agreements.</li>
                    <li><strong className="text-[#10251d]">QR_PACKAGES Mode:</strong> Bag-level traceable inventory where individual jute sacks carry unique QR codes for granular provenance tracking from farm to export port.</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-bold text-[#0b3528] flex items-center gap-2 text-base">
                    <Store size={18} className="text-[#2d6130]" />
                    3. Listing Statuses &amp; Trades
                  </h4>
                  <ul className="mt-2 space-y-2 text-xs text-[#57655d] list-disc pl-5">
                    <li><strong className="text-[#10251d]">Available:</strong> Active inventory ready for immediate purchase or trade negotiation.</li>
                    <li><strong className="text-[#10251d]">Under Negotiation:</strong> Currently locked in active buyer discussions or pending order finalization.</li>
                    <li><strong className="text-[#10251d]">Sold:</strong> Successfully transacted and transferred to buyer entity custody.</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-bold text-[#0b3528] flex items-center gap-2 text-base">
                    <CreditCard size={18} className="text-[#2d6130]" />
                    4. Seller Information Access &amp; Payments
                  </h4>
                  <p className="mt-1 text-xs leading-relaxed text-[#57655d]">
                    Buyers can inspect rich trace trees, compliance data, and request seller contact info. Seller contact details and negotiation channels are securely gated behind server-verified Flutterwave payment confirmation and escrow protection.
                  </p>
                </div>
              </div>

              <div className="mt-8 flex justify-end pt-4 border-t border-[#edf1ea]">
                <button
                  type="button"
                  onClick={() => setShowInfoModal(false)}
                  className="rounded-full bg-[#0b3528] px-6 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#144737] cursor-pointer"
                >
                  Got It, Close Guide
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
