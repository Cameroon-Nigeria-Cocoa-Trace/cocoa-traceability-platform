/* eslint-disable react-hooks/set-state-in-effect, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
"use client";

import React, { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { DashboardWorkflowNav } from "@/components/DashboardWorkflowNav";
import { useFirebase } from "@/context/FirebaseContext";
import { createCocoaApiClient, CocoaApiError } from "@/lib/cocoaApiClient";
import {
  TradeRecord,
  TradeStatus,
  MarketplaceListing,
  CertificateHolding,
  CertificateHolderType,
  SellerNegotiationItem,
} from "@/types/traceability";
import {
  Handshake,
  CreditCard,
  Plus,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Building2,
  DollarSign,
  ArrowRight,
  ExternalLink,
  Store,
  Layers,
  ChevronRight,
  X,
  FileText,
  Lock,
  Star,
  User,
  Mail,
  Phone,
  Calendar,
  XCircle,
  AlertTriangle,
  ShieldCheck,
  Tag,
  Scale,
  Info,
} from "lucide-react";
import { NegotiationsView } from "@/components/trades/NegotiationsView";


export default function TradeManagementPage() {
  const { user } = useFirebase();

  const apiClient = useMemo(() => {
    return createCocoaApiClient(async () => {
      if (!user) return null;
      return await user.getIdToken();
    });
  }, [user]);

  // Navigation Tab State: Completed Trades vs Active Negotiations
  const [activeTab, setActiveTab] = useState<"trades" | "negotiations">("trades");

  // Trades State
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Negotiations State (Sellers viewing lots where buyers paid to access info)
  const [negotiations, setNegotiations] = useState<SellerNegotiationItem[]>([]);
  const [loadingNegotiations, setLoadingNegotiations] = useState(false);
  const [negotiationsError, setNegotiationsError] = useState<string | null>(null);
  const [negotiationFilter, setNegotiationFilter] = useState<"all" | "active" | "concluded">("all");
  const [negotiationSearch, setNegotiationSearch] = useState("");

  // Conclude Sale Modal State
  const [concludeModalItem, setConcludeModalItem] = useState<SellerNegotiationItem | null>(null);
  const [concludeQuantityKg, setConcludeQuantityKg] = useState<number | "">("");
  const [concludeAgreedPricePerKg, setConcludeAgreedPricePerKg] = useState<number | "">("");
  const [concludeBuyerId, setConcludeBuyerId] = useState("");
  const [concludeBuyerHolderType, setConcludeBuyerHolderType] = useState<CertificateHolderType>("cooperative");
  const [concludeNotes, setConcludeNotes] = useState("");
  const [concludeSubmitting, setConcludeSubmitting] = useState(false);
  const [concludeError, setConcludeError] = useState<string | null>(null);
  const [concludeSuccess, setConcludeSuccess] = useState<string | null>(null);

  // Deal Fell Through Modal State
  const [fellThroughModalItem, setFellThroughModalItem] = useState<SellerNegotiationItem | null>(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const [fellThroughSubmitting, setFellThroughSubmitting] = useState(false);
  const [fellThroughError, setFellThroughError] = useState<string | null>(null);
  const [fellThroughSuccess, setFellThroughSuccess] = useState<string | null>(null);

  // Filters State
  const [roleFilter, setRoleFilter] = useState<"all" | "buyer" | "seller">("all");
  const [statusFilter, setStatusFilter] = useState<"ALL" | TradeStatus>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Inspect Trade Modal State
  const [selectedTrade, setSelectedTrade] = useState<TradeRecord | null>(null);

  // Declare Off-Platform Sale Modal State
  const [showDeclareModal, setShowDeclareModal] = useState(false);
  const [declareSubmitting, setDeclareSubmitting] = useState(false);
  const [declareError, setDeclareError] = useState<string | null>(null);
  const [declareSuccess, setDeclareSuccess] = useState<string | null>(null);

  // Off-platform form fields
  const [myListings, setMyListings] = useState<MarketplaceListing[]>([]);
  const [declareListingId, setDeclareListingId] = useState("");
  const [declareSellerHolderType, setDeclareSellerHolderType] = useState<CertificateHolderType>("cooperative");
  const [declareBuyerId, setDeclareBuyerId] = useState("");
  const [declareBuyerHolderType, setDeclareBuyerHolderType] = useState<CertificateHolderType>("agent");
  const [declareQuantityKg, setDeclareQuantityKg] = useState<number>(0);
  const [declarePricePerKg, setDeclarePricePerKg] = useState<number>(0);
  const [declareCurrency, setDeclareCurrency] = useState("XAF");
  const [declareNotes, setDeclareNotes] = useState("");

  // Review state for trade audit modal
  const [tradeReviewRating, setTradeReviewRating] = useState<number>(5);
  const [tradeReviewComment, setTradeReviewComment] = useState("");
  const [tradeReviewSubmitting, setTradeReviewSubmitting] = useState(false);
  const [tradeReviewSuccess, setTradeReviewSuccess] = useState<string | null>(null);
  const [tradeReviewError, setTradeReviewError] = useState<string | null>(null);
  const [hasReviewedSelectedTrade, setHasReviewedSelectedTrade] = useState<boolean>(false);
  const [confirmingTradeId, setConfirmingTradeId] = useState<string | null>(null);
  const [confirmSuccessMsg, setConfirmSuccessMsg] = useState<string | null>(null);

  const handleBuyerConfirmTrade = async (tradeId: string) => {
    setConfirmingTradeId(tradeId);
    try {
      const res = await apiClient.post<{ success: boolean; message: string; trade: TradeRecord }>(
        `/api/marketplace/trades/${tradeId}/confirm`,
        { action: "confirm" }
      );
      if (res && res.success) {
        setConfirmSuccessMsg("Trade confirmed successfully!");
        loadTrades();
        if (selectedTrade && selectedTrade.tradeId === tradeId) {
          setSelectedTrade(res.trade);
        }
        setTimeout(() => setConfirmSuccessMsg(null), 3000);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to confirm trade.");
    } finally {
      setConfirmingTradeId(null);
    }
  };

  useEffect(() => {
    if (selectedTrade && user && selectedTrade.buyerId === user.uid) {
      apiClient.get<{ success: boolean; reviews: any[] }>(`/api/marketplace/reviews?listingId=${selectedTrade.listingId}`)
        .then((res) => {
          if (res && res.success && Array.isArray(res.reviews)) {
            const reviewed = res.reviews.some((r) => r.tradeId === selectedTrade.tradeId);
            setHasReviewedSelectedTrade(reviewed);
          }
        })
        .catch(() => setHasReviewedSelectedTrade(false));
    }
  }, [selectedTrade, user, apiClient]);

  const handleTradeReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTrade) return;
    setTradeReviewError(null);
    setTradeReviewSuccess(null);
    setTradeReviewSubmitting(true);

    try {
      if (!tradeReviewComment.trim()) throw new Error("Please enter a review comment.");

      const res = await apiClient.post<{ success: boolean; review: any }>(
        "/api/marketplace/reviews",
        {
          listingId: selectedTrade.listingId,
          sellerId: selectedTrade.sellerId || selectedTrade.sellerHolderId,
          tradeId: selectedTrade.tradeId,
          rating: Number(tradeReviewRating),
          comment: tradeReviewComment.trim(),
        }
      );

      if (res && res.success) {
        setTradeReviewSuccess("Review submitted successfully!");
        setTradeReviewComment("");
        setTradeReviewRating(5);
        setHasReviewedSelectedTrade(true);
        setTimeout(() => setTradeReviewSuccess(null), 3000);
      }
    } catch (err: unknown) {
      if (err instanceof CocoaApiError) {
        setTradeReviewError(err.message);
      } else if (err instanceof Error) {
        setTradeReviewError(err.message);
      } else {
        setTradeReviewError("Failed to submit review.");
      }
    } finally {
      setTradeReviewSubmitting(false);
    }
  };

  // Load Trades
  const loadTrades = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      let endpoint = "/api/marketplace/trades";
      if (roleFilter !== "all") {
        endpoint += `?role=${roleFilter}`;
      }

      const res = await apiClient.get<{ success: boolean; trades: TradeRecord[] }>(endpoint);
      if (res && res.success && Array.isArray(res.trades)) {
        setTrades(res.trades);
      } else {
        setTrades([]);
      }
    } catch (err: unknown) {
      if (err instanceof CocoaApiError) {
        setError(err.message);
      } else {
        setError("Failed to fetch trade records.");
      }
      setTrades([]);
    } finally {
      setLoading(false);
    }
  }, [user, roleFilter, apiClient]);

  useEffect(() => {
    loadTrades();
  }, [loadTrades]);

  // Load Negotiations
  const loadNegotiations = useCallback(async () => {
    if (!user) return;
    setLoadingNegotiations(true);
    setNegotiationsError(null);

    try {
      const res = await apiClient.get<{ success: boolean; negotiations: SellerNegotiationItem[] }>(
        "/api/marketplace/negotiations"
      );
      if (res && res.success && Array.isArray(res.negotiations)) {
        setNegotiations(res.negotiations);
      } else {
        setNegotiations([]);
      }
    } catch (err: unknown) {
      if (err instanceof CocoaApiError) {
        setNegotiationsError(err.message);
      } else {
        setNegotiationsError("Failed to fetch buyer inquiries.");
      }
      setNegotiations([]);
    } finally {
      setLoadingNegotiations(false);
    }
  }, [user, apiClient]);

  useEffect(() => {
    loadNegotiations();
  }, [loadNegotiations]);

  // Open Conclude Sale Modal
  const openConcludeModal = (item: SellerNegotiationItem) => {
    setConcludeModalItem(item);
    setConcludeQuantityKg(item.listing.quantityAvailableKg);
    setConcludeAgreedPricePerKg(item.listing.pricePerKg);
    setConcludeBuyerId(item.accessRecord.buyerUid || item.accessRecord.buyerId || "");
    setConcludeBuyerHolderType("cooperative");
    setConcludeNotes("");
    setConcludeError(null);
    setConcludeSuccess(null);
  };

  // Open Fell Through Modal
  const openFellThroughModal = (item: SellerNegotiationItem) => {
    setFellThroughModalItem(item);
    setCancellationReason("");
    setFellThroughError(null);
    setFellThroughSuccess(null);
  };

  // Handle Conclude Sale
  const handleConcludeSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!concludeModalItem) return;
    setConcludeError(null);
    setConcludeSuccess(null);

    const qty = Number(concludeQuantityKg);
    if (!Number.isFinite(qty) || qty <= 0) {
      setConcludeError("Please enter a valid amount bought greater than 0 kg.");
      return;
    }
    if (qty > concludeModalItem.listing.quantityAvailableKg) {
      setConcludeError(
        `Amount bought (${qty} kg) cannot exceed the available quantity of this lot (${concludeModalItem.listing.quantityAvailableKg} kg).`
      );
      return;
    }

    const price = Number(concludeAgreedPricePerKg);
    if (!Number.isFinite(price) || price <= 0) {
      setConcludeError("Please enter a valid negotiated price per kg.");
      return;
    }

    setConcludeSubmitting(true);
    try {
      const res = await apiClient.post<{
        success: boolean;
        message: string;
        listing: MarketplaceListing;
        trade?: TradeRecord;
      }>("/api/marketplace/negotiations/conclude", {
        listingId: concludeModalItem.listing.listingId,
        accessId: concludeModalItem.accessRecord.accessId,
        dealOutcome: "sold",
        quantityKg: qty,
        agreedPricePerKg: price,
        buyerId: concludeBuyerId.trim() || concludeModalItem.accessRecord.buyerUid || concludeModalItem.accessRecord.buyerId,
        buyerHolderType: concludeBuyerHolderType,
        notes: concludeNotes.trim() || undefined,
      });

      if (res && res.success) {
        setConcludeSuccess(res.message || "Sale successfully recorded!");
        loadTrades();
        loadNegotiations();
        setTimeout(() => {
          setConcludeModalItem(null);
          setConcludeSuccess(null);
        }, 1500);
      }
    } catch (err: unknown) {
      if (err instanceof CocoaApiError) {
        setConcludeError(err.message);
      } else if (err instanceof Error) {
        setConcludeError(err.message);
      } else {
        setConcludeError("Failed to record negotiated sale.");
      }
    } finally {
      setConcludeSubmitting(false);
    }
  };

  // Handle Deal Fell Through
  const handleFellThrough = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fellThroughModalItem) return;
    setFellThroughError(null);
    setFellThroughSuccess(null);
    setFellThroughSubmitting(true);

    try {
      const res = await apiClient.post<{
        success: boolean;
        message: string;
        listing: MarketplaceListing;
      }>("/api/marketplace/negotiations/conclude", {
        listingId: fellThroughModalItem.listing.listingId,
        accessId: fellThroughModalItem.accessRecord.accessId,
        dealOutcome: "deal_fell_through",
        cancellationReason: cancellationReason.trim() || "Negotiation deal fell through with buyer",
      });

      if (res && res.success) {
        setFellThroughSuccess(res.message || "Lot released back to market!");
        loadTrades();
        loadNegotiations();
        setTimeout(() => {
          setFellThroughModalItem(null);
          setFellThroughSuccess(null);
        }, 1200);
      }
    } catch (err: unknown) {
      if (err instanceof CocoaApiError) {
        setFellThroughError(err.message);
      } else if (err instanceof Error) {
        setFellThroughError(err.message);
      } else {
        setFellThroughError("Failed to release lot back to market.");
      }
    } finally {
      setFellThroughSubmitting(false);
    }
  };

  // Filtered Negotiations
  const filteredNegotiations = useMemo(() => {
    return negotiations.filter((item) => {
      const isUnderNegotiation = item.listing.listingStatus === "under_negotiation";
      const isConcluded =
        item.accessRecord.accessStatus === "concluded_sold" ||
        item.accessRecord.accessStatus === "deal_fell_through";

      if (negotiationFilter === "active" && !isUnderNegotiation) return false;
      if (negotiationFilter === "concluded" && !isConcluded) return false;

      if (negotiationSearch.trim()) {
        const q = negotiationSearch.toLowerCase();
        const matchesTitle = item.listing.title?.toLowerCase().includes(q);
        const matchesNum = item.listing.listingNumber?.toLowerCase().includes(q);
        const matchesLot = item.listing.lotId?.toLowerCase().includes(q);
        const matchesBuyer = (
          item.buyerProfile?.displayName ||
          item.accessRecord.buyerUid ||
          item.accessRecord.buyerId ||
          ""
        ).toLowerCase().includes(q);
        const matchesEmail = (item.buyerProfile?.email || "").toLowerCase().includes(q);
        if (!matchesTitle && !matchesNum && !matchesLot && !matchesBuyer && !matchesEmail) {
          return false;
        }
      }

      return true;
    });
  }, [negotiations, negotiationFilter, negotiationSearch]);

  // Load user listings for off-platform sale declaration
  useEffect(() => {
    if (showDeclareModal && user) {
      apiClient
        .get<{ success: boolean; listings: MarketplaceListing[] }>(
          `/api/marketplace/listings?sellerHolderId=${encodeURIComponent(user.uid)}`
        )
        .then((res) => {
          if (res && res.success) {
            const avail = (res.listings || []).filter(
              (l) => l.listingStatus === "available" || l.listingStatus === "under_negotiation"
            );
            setMyListings(avail);
          }
        })
        .catch(() => setMyListings([]));
    }
  }, [showDeclareModal, user, apiClient]);

  // When listing is selected in off-platform modal, auto-fill price and currency
  useEffect(() => {
    if (declareListingId) {
      const l = myListings.find((x) => x.listingId === declareListingId);
      if (l) {
        setDeclarePricePerKg(l.pricePerKg);
        setDeclareCurrency(l.currency);
        setDeclareQuantityKg(l.quantityAvailableKg);
        setDeclareSellerHolderType(l.sellerHolderType);
      }
    }
  }, [declareListingId, myListings]);

  // Filtered Trades
  const filteredTrades = useMemo(() => {
    return trades.filter((t) => {
      if (statusFilter !== "ALL" && t.tradeStatus !== statusFilter) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesNum = t.tradeNumber?.toLowerCase().includes(q);
        const matchesLot = t.lotId?.toLowerCase().includes(q);
        const matchesListing = t.listingId?.toLowerCase().includes(q);
        const matchesBuyer = t.buyerId?.toLowerCase().includes(q);
        const matchesSeller = t.sellerId?.toLowerCase().includes(q);
        if (!matchesNum && !matchesLot && !matchesListing && !matchesBuyer && !matchesSeller) {
          return false;
        }
      }

      return true;
    });
  }, [trades, statusFilter, searchQuery]);

  // Handle Declare Off-Platform Sale
  const handleDeclareOffPlatformSale = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeclareError(null);
    setDeclareSuccess(null);
    setDeclareSubmitting(true);

    try {
      if (!declareListingId) throw new Error("Please select an active listing.");
      if (!declareBuyerId.trim()) throw new Error("Buyer Identifier / Name is required.");
      if (declareQuantityKg <= 0) throw new Error("Quantity in kilograms must be greater than 0.");
      if (declarePricePerKg <= 0) throw new Error("Price per kilogram must be greater than 0.");

      const selListing = myListings.find((l) => l.listingId === declareListingId);
      if (selListing && Number(declareQuantityKg) > selListing.quantityAvailableKg) {
        throw new Error(
          `Amount bought (${declareQuantityKg} kg) cannot exceed available quantity of this lot (${selListing.quantityAvailableKg} kg).`
        );
      }

      const res = await apiClient.post<{ success: boolean; trade: TradeRecord }>(
        "/api/marketplace/trades/declare-off-platform-sale",
        {
          listingId: declareListingId,
          sellerHolderId: user?.uid,
          sellerHolderType: declareSellerHolderType,
          buyerId: declareBuyerId.trim(),
          buyerHolderType: declareBuyerHolderType,
          quantityKg: Number(declareQuantityKg),
          negotiatedPricePerKg: Number(declarePricePerKg),
          currency: declareCurrency,
          notes: declareNotes.trim() || undefined,
        }
      );

      if (res && res.success) {
        setDeclareSuccess(`Off-platform trade recorded: ${res.trade.tradeNumber}`);
        setTimeout(() => {
          setShowDeclareModal(false);
          setDeclareSuccess(null);
          loadTrades();
          loadNegotiations();
        }, 1200);
      }
    } catch (err: unknown) {
      if (err instanceof CocoaApiError) {
        setDeclareError(err.message);
      } else if (err instanceof Error) {
        setDeclareError(err.message);
      } else {
        setDeclareError("Failed to record off-platform trade.");
      }
    } finally {
      setDeclareSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f8f3] text-[#10251d]">
      <Navbar />

      <main className="mx-auto max-w-[1360px] px-4 pt-28 pb-16 sm:px-6 sm:pt-32 lg:px-8">
        <div className="mb-6">
          <DashboardWorkflowNav currentTab="cocoa-trade" />
        </div>

        {/* Header & Controls */}
        <section className="mb-8 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-[0.22em] text-[#2d6130]">
                Commercial Exchange
              </span>
              <span className="flex items-center gap-1 rounded-full bg-[#edf7e8] px-2.5 py-0.5 text-[0.65rem] font-bold text-[#2d6130] border border-[#d2ecc8]">
                <Handshake size={12} />
                Trade Management
              </span>
            </div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-[#10251d] sm:text-4xl">
              Commercial Trades &amp; Orders
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#57655d]">
              Manage authenticated on-platform cocoa purchases, automatic service fee records,
              and off-platform negotiated sales across verified supply-chain participants.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setShowDeclareModal(true)}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-[#dfe7d8] bg-white px-5 py-3 text-sm font-bold text-[#10251d] shadow-sm transition hover:bg-[#edf2ea] cursor-pointer"
            >
              <FileText size={16} />
              Declare Off-Platform Sale
            </button>

            <Link
              href="/marketplace"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0b3528] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#144737]"
            >
              <Store size={16} />
              Browse Marketplace
            </Link>
          </div>
        </section>

        {/* Main View Switcher: Completed Trades vs Negotiations (Seller Info Unlocked) */}
        <div className="mb-6 flex border-b border-[#dfe7d8] gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("trades")}
            className={`flex items-center gap-2 border-b-2 px-6 py-3.5 text-sm font-bold transition cursor-pointer ${
              activeTab === "trades"
                ? "border-[#2d6130] text-[#0b3528]"
                : "border-transparent text-[#57655d] hover:text-[#10251d]"
            }`}
          >
            <Handshake size={18} />
            Completed Commercial Trades
            <span className="rounded-full bg-[#f0f4ec] px-2 py-0.5 text-xs text-[#2d6130]">
              {trades.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("negotiations")}
            className={`flex items-center gap-2 border-b-2 px-6 py-3.5 text-sm font-bold transition cursor-pointer ${
              activeTab === "negotiations"
                ? "border-[#2d6130] text-[#0b3528]"
                : "border-transparent text-[#57655d] hover:text-[#10251d]"
            }`}
          >
            <Lock size={18} />
            Buyer Inquiries &amp; Negotiations
            {negotiations.filter((n) => n.listing.listingStatus === "under_negotiation").length > 0 && (
              <span className="rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-xs text-amber-900 font-extrabold animate-pulse">
                {negotiations.filter((n) => n.listing.listingStatus === "under_negotiation").length} Active
              </span>
            )}
            <span className="rounded-full bg-[#f0f4ec] px-2 py-0.5 text-xs text-[#2d6130]">
              {negotiations.length}
            </span>
          </button>
        </div>

        {activeTab === "trades" && (
          <div>
            {/* Filter Bar */}
            <section className="mb-6 rounded-[24px] border border-[#dfe7d8] bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                {/* Role Filter Tabs */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setRoleFilter("all")}
                    className={`rounded-full px-4 py-2 text-xs font-bold transition ${
                      roleFilter === "all"
                        ? "bg-[#0b3528] text-white"
                        : "bg-[#f1f4ec] text-[#57655d] hover:bg-[#e4ebd9]"
                    }`}
                  >
                    All Roles ({trades.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRoleFilter("buyer")}
                    className={`rounded-full px-4 py-2 text-xs font-bold transition ${
                      roleFilter === "buyer"
                        ? "bg-[#0b3528] text-white"
                        : "bg-[#f1f4ec] text-[#57655d] hover:bg-[#e4ebd9]"
                    }`}
                  >
                    As Buyer
                  </button>
                  <button
                    type="button"
                    onClick={() => setRoleFilter("seller")}
                    className={`rounded-full px-4 py-2 text-xs font-bold transition ${
                      roleFilter === "seller"
                        ? "bg-[#0b3528] text-white"
                        : "bg-[#f1f4ec] text-[#57655d] hover:bg-[#e4ebd9]"
                    }`}
                  >
                    As Seller
                  </button>
            </div>

            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#79887e]" />
              <input
                type="text"
                placeholder="Search trade number, lot, or entity..."
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

            <button
              type="button"
              onClick={loadTrades}
              disabled={loading}
              className="inline-flex items-center justify-center gap-1.5 rounded-full border border-[#dfe7d8] bg-[#f8f9f3] px-3.5 py-2 text-xs font-bold text-[#2d6130] transition hover:bg-[#edf2ea] disabled:opacity-50"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              Refresh Trades
            </button>
          </div>

          {/* Status Filter */}
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#edf1ea] pt-3 text-xs">
            <span className="font-semibold text-[#57655d] flex items-center gap-1">
              <Filter size={12} /> Status:
            </span>
            {(["ALL", "completed", "pending", "confirmed", "cancelled"] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`rounded-full px-2.5 py-1 font-semibold capitalize ${
                  statusFilter === st
                    ? "bg-[#2d6130] text-white"
                    : "bg-[#edf1ea] text-[#57655d] hover:bg-[#e2e9dd]"
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </section>

        {/* Trades Table / List */}
        {loading && trades.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-[32px] border border-[#dfe7d8] bg-white p-16 text-center shadow-sm">
            <RefreshCw size={36} className="animate-spin text-[#2d6130]" />
            <h3 className="mt-4 text-base font-bold text-[#10251d]">Loading Trade History...</h3>
          </div>
        ) : error ? (
          <div className="rounded-[28px] border border-red-200 bg-red-50 p-6 text-red-800">
            <div className="flex items-center gap-2 font-bold text-sm">
              <AlertCircle size={18} /> Error Loading Trades
            </div>
            <p className="mt-1 text-xs">{error}</p>
            <button
              type="button"
              onClick={loadTrades}
              className="mt-3 rounded-full bg-red-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        ) : filteredTrades.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-[32px] border border-[#dfe7d8] bg-white p-16 text-center shadow-sm">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#f1f6ec] text-[#2d6130]">
              <Handshake size={28} />
            </div>
            <h3 className="mt-4 text-lg font-bold text-[#10251d]">No trade records found</h3>
            <p className="mt-1 max-w-sm text-xs text-[#57655d]">
              {searchQuery || statusFilter !== "ALL"
                ? "No trades match the current filters."
                : "You have not completed any cocoa purchases or off-platform sales yet."}
            </p>
            <Link
              href="/marketplace"
              className="mt-5 inline-flex items-center justify-center gap-1.5 rounded-full bg-[#0b3528] px-5 py-2.5 text-xs font-bold text-white"
            >
              Explore Marketplace Catalog
            </Link>
          </div>
        ) : (
          <div className="overflow-hidden rounded-[28px] border border-[#dfe7d8] bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#f8f9f3] text-[11px] font-bold uppercase tracking-wider text-[#57655d] border-b border-[#dfe7d8]">
                  <tr>
                    <th className="py-4 px-5">Trade Number</th>
                    <th className="py-4 px-4">Channel &amp; Type</th>
                    <th className="py-4 px-4">Cocoa Lot</th>
                    <th className="py-4 px-4">Counterparty</th>
                    <th className="py-4 px-4">Quantity</th>
                    <th className="py-4 px-4">Negotiated Price</th>
                    <th className="py-4 px-4">Total Amount</th>
                    <th className="py-4 px-4">Status</th>
                    <th className="py-4 px-5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf1ea] text-[#394a41]">
                  {filteredTrades.map((t) => {
                    const isBuyer = t.buyerId === user?.uid;
                    const isCertified = t.certificationType === "certified";

                    return (
                      <tr key={t.tradeId} className="hover:bg-[#fafbf8] transition">
                        <td className="py-4 px-5">
                          <span className="font-mono font-bold text-[#10251d]">{t.tradeNumber}</span>
                          <div className="text-[10px] text-gray-400">
                            {new Date(t.tradeDate || t.createdAt).toLocaleDateString()}
                          </div>
                        </td>

                        <td className="py-4 px-4">
                          <div className="flex flex-col gap-1">
                            <span
                              className={`inline-flex items-center gap-1 w-fit rounded-full px-2 py-0.5 text-[0.65rem] font-bold ${
                                t.paymentChannel === "on_platform"
                                  ? "bg-[#edf7e8] text-[#2d6130] border border-[#d2ecc8]"
                                  : "bg-[#f5f3e9] text-[#745f21] border border-[#e8e0c0]"
                              }`}
                            >
                              {t.paymentChannel === "on_platform" ? "On-Platform" : "Off-Platform"}
                            </span>
                            <span className="text-[10px] text-gray-500 capitalize">
                              {isCertified ? "Certified Origin" : "Uncertified"}
                            </span>
                          </div>
                        </td>

                        <td className="py-4 px-4 font-mono font-medium text-[#10251d]">
                          {t.lotId}
                          {t.certificateId && (
                            <div className="text-[10px] text-[#2d6130] font-normal truncate max-w-[120px]">
                              Cert: {t.certificateId}
                            </div>
                          )}
                        </td>

                        <td className="py-4 px-4">
                          <div className="flex items-center gap-1 font-semibold text-[#10251d]">
                            {isBuyer ? (
                              <span className="text-[#2d6130]">Bought from:</span>
                            ) : (
                              <span className="text-blue-700">Sold to:</span>
                            )}
                            <span className="truncate max-w-[120px] font-mono text-[11px]">
                              {isBuyer ? t.sellerHolderId : t.buyerId}
                            </span>
                          </div>
                          <div className="text-[10px] text-gray-400 capitalize">
                            Role: {isBuyer ? t.sellerHolderType : t.buyerHolderType || "Buyer"}
                          </div>
                        </td>

                        <td className="py-4 px-4 font-bold text-[#10251d]">
                          {t.quantityKg.toLocaleString()} kg
                          {t.purchasedQrPackageIds && t.purchasedQrPackageIds.length > 0 && (
                            <div className="text-[10px] text-[#2d6130] font-normal">
                              ({t.purchasedQrPackageIds.length} QR bags)
                            </div>
                          )}
                        </td>

                        <td className="py-4 px-4 font-semibold text-[#10251d]">
                          {t.negotiatedPricePerKg.toLocaleString()} {t.currency}
                        </td>

                        <td className="py-4 px-4 font-bold text-[#10251d]">
                          {t.totalAmount.toLocaleString()} {t.currency}
                          {t.platformFeeApplied && (
                            <div className="text-[10px] text-gray-500 font-normal">
                              Fee: {t.platformFeeApplied.calculatedAmount} {t.currency}
                            </div>
                          )}
                        </td>

                        <td className="py-4 px-4">
                          <div className="flex flex-col gap-1">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[0.65rem] font-bold capitalize w-fit ${
                                t.tradeStatus === "completed"
                                  ? "bg-[#eefbf3] text-[#1d6a45] border border-[#cdebc2]"
                                  : t.tradeStatus === "pending"
                                  ? "bg-amber-50 text-amber-800 border border-amber-300"
                                  : "bg-gray-100 text-gray-700 border border-gray-200"
                              }`}
                            >
                              {t.tradeStatus === "pending"
                                ? isBuyer
                                  ? "Action Required: Confirm Trade"
                                  : "Awaiting Buyer Confirmation"
                                : t.tradeStatus}
                            </span>
                            {t.buyerConfirmed && (
                              <span className="text-[10px] text-[#2d6130] font-semibold flex items-center gap-0.5">
                                <CheckCircle2 size={10} /> Confirmed by Buyer
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-4 px-5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {isBuyer && t.tradeStatus === "pending" && (
                              <button
                                type="button"
                                onClick={() => handleBuyerConfirmTrade(t.tradeId)}
                                disabled={confirmingTradeId === t.tradeId}
                                className="inline-flex items-center gap-1 rounded-full bg-[#0b3528] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#144737] cursor-pointer shadow-xs disabled:opacity-50"
                              >
                                <CheckCircle2 size={12} />
                                {confirmingTradeId === t.tradeId ? "Confirming..." : "Confirm & Accept"}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setSelectedTrade(t)}
                              className="inline-flex items-center gap-1 rounded-full border border-[#dfe7d8] bg-white px-3 py-1.5 text-xs font-bold text-[#10251d] hover:bg-[#edf2ea] cursor-pointer"
                            >
                              Audit Record <ChevronRight size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
          </div>
        )}
        {activeTab === "negotiations" ? (
          <div className="mt-8">
            <NegotiationsView
              negotiations={filteredNegotiations}
              loading={loadingNegotiations}
              error={negotiationsError}
              onConclude={openConcludeModal}
              onFellThrough={openFellThroughModal}
            />
          </div>
        ) : null}

        {/* Modal: Trade Record Audit */}
        {selectedTrade && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm overflow-y-auto">
            <div className="relative my-8 w-full max-w-xl rounded-[32px] border border-[#dfe7d8] bg-white p-6 shadow-2xl">
              <button
                type="button"
                onClick={() => setSelectedTrade(null)}
                className="absolute right-5 top-5 rounded-full p-1.5 text-gray-400 hover:bg-gray-100"
              >
                ✕
              </button>

              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#2d6130]">
                <Handshake size={14} /> Trade Audit Record
              </div>
              <h2 className="mt-1 text-2xl font-bold font-mono text-[#10251d]">
                {selectedTrade.tradeNumber}
              </h2>

              <div className="mt-5 space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-[#f8f9f3] p-3">
                    <span className="text-gray-500 block">Trade Status</span>
                    <strong className="text-sm font-bold capitalize text-[#10251d]">
                      {selectedTrade.tradeStatus === "pending" ? "Pending Confirmation" : selectedTrade.tradeStatus}
                    </strong>
                  </div>
                  <div className="rounded-2xl bg-[#f8f9f3] p-3">
                    <span className="text-gray-500 block">Payment Channel</span>
                    <strong className="text-sm font-bold capitalize text-[#10251d]">
                      {selectedTrade.paymentChannel.replace("_", " ")}
                    </strong>
                  </div>
                </div>

                {selectedTrade.tradeStatus === "pending" && (
                  <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900 space-y-2">
                    <div className="font-bold flex items-center gap-1.5 text-amber-950">
                      <AlertTriangle size={15} /> Awaiting Buyer Confirmation
                    </div>
                    {user && selectedTrade.buyerId === user.uid ? (
                      <div>
                        <p className="leading-relaxed">
                          The seller has declared this commercial sale. Please review the declared quantity ({selectedTrade.quantityKg} kg) and price ({selectedTrade.negotiatedPricePerKg} {selectedTrade.currency}/kg), and click confirm below to complete the trade.
                        </p>
                        <div className="mt-3 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleBuyerConfirmTrade(selectedTrade.tradeId)}
                            disabled={confirmingTradeId === selectedTrade.tradeId}
                            className="inline-flex items-center gap-1.5 rounded-full bg-[#0b3528] px-4 py-2 text-xs font-bold text-white hover:bg-[#144737] cursor-pointer shadow-xs disabled:opacity-50"
                          >
                            <CheckCircle2 size={14} />
                            {confirmingTradeId === selectedTrade.tradeId ? "Confirming..." : "Confirm & Accept Trade Terms"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="leading-relaxed text-[#57655d]">
                        This sale was recorded by the seller and is pending confirmation from the buyer ({selectedTrade.buyerId}) in their own Trade Management dashboard.
                      </p>
                    )}
                  </div>
                )}

                {selectedTrade.buyerConfirmed && (
                  <div className="rounded-2xl border border-[#cdebc2] bg-[#edf7e8] p-3 text-xs text-[#1d6a45] flex items-center gap-2">
                    <CheckCircle2 size={16} />
                    <span>
                      Confirmed by Buyer
                      {selectedTrade.buyerConfirmedAt && ` on ${new Date(selectedTrade.buyerConfirmedAt).toLocaleDateString()}`}
                    </span>
                  </div>
                )}

                <div className="rounded-2xl border border-[#dfe7d8] p-4 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Backing Cocoa Lot:</span>
                    <span className="font-mono font-bold text-[#10251d]">{selectedTrade.lotId}</span>
                  </div>
                  {selectedTrade.certificateId && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Certificate Reference:</span>
                      <span className="font-mono text-[#2d6130] font-bold">
                        {selectedTrade.certificateId}
                      </span>
                    </div>
                  )}
                  {selectedTrade.sourceHoldingId && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Source Holding:</span>
                      <span className="font-mono text-gray-700">{selectedTrade.sourceHoldingId}</span>
                    </div>
                  )}
                  {selectedTrade.destHoldingId && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Destination Custody Holding:</span>
                      <span className="font-mono text-blue-700 font-bold">
                        {selectedTrade.destHoldingId}
                      </span>
                    </div>
                  )}
                </div>

                {/* Financial Audit */}
                <div className="rounded-2xl bg-[#edf7e8] border border-[#cdebc2] p-4 space-y-2 text-[#10251d]">
                  <div className="flex justify-between">
                    <span>Traded Quantity:</span>
                    <strong className="font-bold">{selectedTrade.quantityKg.toLocaleString()} kg</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Negotiated Price:</span>
                    <span>
                      {selectedTrade.negotiatedPricePerKg.toLocaleString()} {selectedTrade.currency} / kg
                    </span>
                  </div>
                  <div className="flex justify-between font-bold pt-2 border-t border-[#c6e6bb]">
                    <span>Total Traded Value:</span>
                    <span>
                      {selectedTrade.totalAmount.toLocaleString()} {selectedTrade.currency}
                    </span>
                  </div>

                  {selectedTrade.platformFeeApplied && (
                    <div className="flex justify-between text-gray-600 pt-1 text-[11px]">
                      <span>Platform Fee:</span>
                      <span>
                        {selectedTrade.platformFeeApplied.calculatedAmount.toLocaleString()}{" "}
                        {selectedTrade.currency}
                      </span>
                    </div>
                  )}
                </div>

                {selectedTrade.purchasedQrPackageIds && selectedTrade.purchasedQrPackageIds.length > 0 && (
                  <div className="rounded-2xl border border-[#dfe7d8] p-3">
                    <span className="text-gray-500 block font-semibold mb-1">
                      Purchased Discrete QR Packages ({selectedTrade.purchasedQrPackageIds.length}):
                    </span>
                    <div className="flex flex-wrap gap-1.5 font-mono text-[11px]">
                      {selectedTrade.purchasedQrPackageIds.map((id) => (
                        <span key={id} className="rounded-lg bg-[#f1f4ee] px-2 py-0.5 font-bold">
                          {id}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Rate & Comment Section if user is buyer */}
                {user && selectedTrade.buyerId === user.uid && (
                  <div className="mt-4 rounded-2xl border border-[#dfe7d8] bg-[#f8f9f3] p-4 text-xs">
                    <h4 className="font-bold text-xs text-[#10251d] mb-2 flex items-center gap-1.5">
                      <Star size={15} className="fill-amber-400 text-amber-500" />
                      Rate &amp; Comment on Seller
                    </h4>
                    {hasReviewedSelectedTrade ? (
                      <div className="rounded-xl bg-[#edf7e8] border border-[#c5e4ba] p-3 text-xs text-[#1d6a45]">
                        ✓ You have already reviewed this purchase trade.
                      </div>
                    ) : (
                      <form onSubmit={handleTradeReviewSubmit} className="space-y-3">
                        {tradeReviewError && (
                          <div className="rounded-xl bg-red-50 p-2 text-red-700 flex items-center gap-1 border border-red-200">
                            <AlertCircle size={13} /> {tradeReviewError}
                          </div>
                        )}
                        {tradeReviewSuccess && (
                          <div className="rounded-xl bg-green-50 p-2 text-green-700 flex items-center gap-1 border border-green-200">
                            <CheckCircle2 size={13} /> {tradeReviewSuccess}
                          </div>
                        )}

                        <div>
                          <label className="block font-semibold mb-1 text-gray-600">Rating (Stars):</label>
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button
                                key={star}
                                type="button"
                                onClick={() => setTradeReviewRating(star)}
                                className="p-1 focus:outline-none cursor-pointer"
                              >
                                <Star
                                  size={20}
                                  className={star <= tradeReviewRating ? "fill-amber-400 text-amber-500" : "text-gray-300 hover:text-amber-400"}
                                />
                              </button>
                            ))}
                            <span className="ml-2 font-bold text-sm text-[#10251d]">{tradeReviewRating} Stars</span>
                          </div>
                        </div>

                        <div>
                          <label className="block font-semibold mb-1 text-gray-600">Your Comment:</label>
                          <textarea
                            rows={2}
                            required
                            value={tradeReviewComment}
                            onChange={(e) => setTradeReviewComment(e.target.value)}
                            placeholder="Share your experience regarding cocoa quality, fermentation, delivery, etc..."
                            className="w-full rounded-xl border border-[#dfe7d8] bg-white p-2.5 outline-none font-medium text-xs"
                          />
                        </div>

                        <button
                          type="submit"
                          disabled={tradeReviewSubmitting}
                          className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#0b3528] px-5 py-2 font-bold text-white transition hover:bg-[#144737] disabled:opacity-50 cursor-pointer"
                        >
                          {tradeReviewSubmitting ? "Submitting..." : "Submit Seller Review"}
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedTrade(null)}
                  className="rounded-full bg-[#0b3528] px-6 py-2.5 text-xs font-bold text-white"
                >
                  Close Record
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Declare Off-Platform Sale */}
        {showDeclareModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm overflow-y-auto">
            <div className="relative my-8 w-full max-w-xl rounded-[32px] border border-[#dfe7d8] bg-white p-6 shadow-2xl">
              <button
                type="button"
                onClick={() => setShowDeclareModal(false)}
                className="absolute right-5 top-5 rounded-full p-1.5 text-gray-400 hover:bg-gray-100"
              >
                ✕
              </button>

              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#2d6130]">
                <FileText size={14} /> Commercial Audit
              </div>
              <h2 className="mt-1 text-2xl font-bold text-[#10251d]">Declare Off-Platform Sale</h2>
              <p className="mt-1 text-xs text-[#57655d]">
                Record cocoa volumes settled off-platform to maintain accurate traceability, physical
                accounting balance, and prevent ghost inventory.
              </p>

              <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900 flex items-start gap-2.5">
                <AlertTriangle size={17} className="shrink-0 mt-0.5 text-amber-700" />
                <div>
                  <strong className="block font-bold">Buyer Confirmation Required:</strong>
                  Everything declared here (quantity, price, buyer details) must be confirmed by the buyer in their own Trade Management dashboard before this sale is finalized. The trade will be recorded in <em>&quot;Pending Confirmation&quot;</em> status until accepted.
                </div>
              </div>

              {declareError && (
                <div className="mt-4 rounded-2xl bg-red-50 p-3 text-xs text-red-700 border border-red-200">
                  {declareError}
                </div>
              )}

              {declareSuccess && (
                <div className="mt-4 rounded-2xl bg-green-50 p-3 text-xs text-green-700 border border-green-200">
                  {declareSuccess}
                </div>
              )}

              <form onSubmit={handleDeclareOffPlatformSale} className="mt-5 space-y-4 text-xs">
                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">
                    Select Your Marketplace Listing
                  </label>
                  <select
                    required
                    value={declareListingId}
                    onChange={(e) => setDeclareListingId(e.target.value)}
                    className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                  >
                    <option value="">-- Choose Listing --</option>
                    {myListings.map((l) => (
                      <option key={l.listingId} value={l.listingId}>
                        {l.listingNumber} — {l.title} ({l.quantityAvailableKg} kg available)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-[#10251d] mb-1">
                      Buyer Identifier / Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. buyer_uid_or_name"
                      value={declareBuyerId}
                      onChange={(e) => setDeclareBuyerId(e.target.value)}
                      className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-[#10251d] mb-1">
                      Buyer Entity Role
                    </label>
                    <select
                      value={declareBuyerHolderType}
                      onChange={(e) => setDeclareBuyerHolderType(e.target.value as CertificateHolderType)}
                      className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                    >
                      <option value="agent">Licensed Buying Agent</option>
                      <option value="warehouse">Licensed Export Warehouse</option>
                      <option value="cooperative">Cooperative Society</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-[#10251d] mb-1">
                      Traded Quantity (kg)
                    </label>
                    <input
                      type="number"
                      required
                      min={1}
                      value={declareQuantityKg || ""}
                      onChange={(e) => setDeclareQuantityKg(Number(e.target.value))}
                      className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-[#10251d] mb-1">
                      Negotiated Unit Price
                    </label>
                    <input
                      type="number"
                      required
                      min={1}
                      value={declarePricePerKg || ""}
                      onChange={(e) => setDeclarePricePerKg(Number(e.target.value))}
                      className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">Notes / Terms (Optional)</label>
                  <textarea
                    rows={2}
                    value={declareNotes}
                    onChange={(e) => setDeclareNotes(e.target.value)}
                    placeholder="e.g. Cash on delivery at Kumba Aggregation Center"
                    className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                  />
                </div>

                <div className="mt-5 flex items-center justify-end gap-3 pt-3 border-t border-[#edf1ea]">
                  <button
                    type="button"
                    onClick={() => setShowDeclareModal(false)}
                    className="rounded-full px-5 py-2 font-bold text-gray-500 hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={declareSubmitting}
                    className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#0b3528] px-6 py-2.5 font-bold text-white shadow-sm hover:bg-[#144737] disabled:opacity-50 cursor-pointer"
                  >
                    {declareSubmitting ? "Recording..." : "Declare Sale"}
                  </button>
                </div>
                </form>
            </div>
          </div>
        )}

        {/* Modal: Conclude Negotiated Sale */}
        {concludeModalItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm overflow-y-auto">
            <div className="relative my-8 w-full max-w-xl rounded-[32px] border border-[#dfe7d8] bg-white p-6 shadow-2xl">
              <button
                type="button"
                onClick={() => setConcludeModalItem(null)}
                className="absolute right-5 top-5 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 cursor-pointer"
              >
                ✕
              </button>

              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#2d6130]">
                <Handshake size={14} /> Negotiation Finalization
              </div>
              <h2 className="mt-1 text-2xl font-bold text-[#10251d]">Conclude Commercial Sale</h2>
              <p className="mt-1 text-xs text-[#57655d]">
                Record agreed transaction terms negotiated with the prospective buyer.
              </p>

              {/* Notice for the seller before concluding */}
              <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900 flex items-start gap-2.5">
                <AlertTriangle size={18} className="shrink-0 mt-0.5 text-amber-700" />
                <div>
                  <strong className="block font-bold">Buyer Confirmation Required:</strong>
                  Everything declared here (agreed price, quantity, buyer details) must be reviewed and confirmed by the buyer in their own Trade Management dashboard. The transaction will be saved in <em>&quot;Pending Confirmation&quot;</em> status until accepted by the buyer.
                </div>
              </div>

              {concludeError && (
                <div className="mt-4 rounded-2xl bg-red-50 p-3 text-xs text-red-700 border border-red-200">
                  {concludeError}
                </div>
              )}

              {concludeSuccess && (
                <div className="mt-4 rounded-2xl bg-green-50 p-3 text-xs text-green-700 border border-green-200 flex items-center gap-1.5">
                  <CheckCircle2 size={15} /> {concludeSuccess}
                </div>
              )}

              <form onSubmit={handleConcludeSale} className="mt-4 space-y-4 text-xs">
                {/* Read-only listing overview */}
                <div className="rounded-2xl border border-[#dfe7d8] bg-[#f8f9f3] p-3 space-y-1">
                  <div className="font-bold text-[#10251d] text-sm">{concludeModalItem.listing.title}</div>
                  <div className="flex justify-between text-gray-500">
                    <span>
                      Lot ID: <strong className="font-mono text-[#10251d]">{concludeModalItem.listing.lotId}</strong>
                    </span>
                    <span>
                      Available: <strong className="text-[#10251d]">{concludeModalItem.listing.quantityAvailableKg.toLocaleString()} kg</strong>
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-[#10251d] mb-1">Buyer Identifier / Name</label>
                    <input
                      type="text"
                      required
                      value={concludeBuyerId}
                      onChange={(e) => setConcludeBuyerId(e.target.value)}
                      placeholder="e.g. buyer_uid_or_name"
                      className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-[#10251d] mb-1">Buyer Entity Role</label>
                    <select
                      value={concludeBuyerHolderType}
                      onChange={(e) => setConcludeBuyerHolderType(e.target.value as CertificateHolderType)}
                      className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                    >
                      <option value="cooperative">Cooperative Organization</option>
                      <option value="agent">Licensed Buying Agent</option>
                      <option value="warehouse">Licensed Export Warehouse</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-[#10251d] mb-1">Amount Bought (kg) *</label>
                    <input
                      type="number"
                      required
                      min={1}
                      max={concludeModalItem.listing.quantityAvailableKg}
                      value={concludeQuantityKg}
                      onChange={(e) => setConcludeQuantityKg(e.target.value ? Number(e.target.value) : "")}
                      className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                    />
                    <span className="text-[10px] text-gray-400 mt-0.5 block">
                      Max available: {concludeModalItem.listing.quantityAvailableKg} kg
                    </span>
                  </div>

                  <div>
                    <label className="block font-semibold text-[#10251d] mb-1">
                      Agreed Price per kg ({concludeModalItem.listing.currency}) *
                    </label>
                    <input
                      type="number"
                      required
                      min={1}
                      value={concludeAgreedPricePerKg}
                      onChange={(e) => setConcludeAgreedPricePerKg(e.target.value ? Number(e.target.value) : "")}
                      className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                    />
                    <span className="text-[10px] text-gray-400 mt-0.5 block">
                      Catalog Price: {concludeModalItem.listing.pricePerKg} {concludeModalItem.listing.currency}
                    </span>
                  </div>
                </div>

                {/* Calculated Total */}
                {Number(concludeQuantityKg) > 0 && Number(concludeAgreedPricePerKg) > 0 && (
                  <div className="rounded-2xl bg-[#edf7e8] border border-[#cdebc2] p-3 flex justify-between items-center text-xs">
                    <span className="font-semibold text-[#10251d]">Total Transaction Value:</span>
                    <span className="font-bold text-sm text-[#0b3528]">
                      {(Number(concludeQuantityKg) * Number(concludeAgreedPricePerKg)).toLocaleString()} {concludeModalItem.listing.currency}
                    </span>
                  </div>
                )}

                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">Notes / Agreed Conditions (Optional)</label>
                  <textarea
                    rows={2}
                    value={concludeNotes}
                    onChange={(e) => setConcludeNotes(e.target.value)}
                    placeholder="e.g. Terms agreed via direct contact, cash payment upon physical inspection"
                    className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                  />
                </div>

                <div className="mt-5 flex items-center justify-end gap-3 pt-3 border-t border-[#edf1ea]">
                  <button
                    type="button"
                    onClick={() => setConcludeModalItem(null)}
                    className="rounded-full px-5 py-2 font-bold text-gray-500 hover:bg-gray-100 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={concludeSubmitting}
                    className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#0b3528] px-6 py-2.5 font-bold text-white shadow-sm hover:bg-[#144737] disabled:opacity-50 cursor-pointer"
                  >
                    {concludeSubmitting ? "Recording..." : "Record & Send to Buyer for Confirmation"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Deal Fell Through */}
        {fellThroughModalItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm overflow-y-auto">
            <div className="relative my-8 w-full max-w-lg rounded-[32px] border border-[#dfe7d8] bg-white p-6 shadow-2xl">
              <button
                type="button"
                onClick={() => setFellThroughModalItem(null)}
                className="absolute right-5 top-5 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 cursor-pointer"
              >
                ✕
              </button>

              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-red-700">
                <XCircle size={14} /> Negotiation Cancellation
              </div>
              <h2 className="mt-1 text-2xl font-bold text-[#10251d]">Mark Deal as Fell Through</h2>
              <p className="mt-1 text-xs text-[#57655d]">
                Cancel negotiation with this buyer and release the cocoa lot back to the marketplace.
              </p>

              {/* Informational notice */}
              <div className="mt-3 rounded-2xl border border-blue-200 bg-blue-50 p-3.5 text-xs text-blue-900 flex items-start gap-2.5">
                <Info size={18} className="shrink-0 mt-0.5 text-blue-700" />
                <div>
                  <strong className="block font-bold">Negotiation Status Update:</strong>
                  Marking this deal as fell through will update the status for both parties and restore the cocoa lot as available on the marketplace so other prospective buyers can explore it.
                </div>
              </div>

              {fellThroughError && (
                <div className="mt-4 rounded-2xl bg-red-50 p-3 text-xs text-red-700 border border-red-200">
                  {fellThroughError}
                </div>
              )}

              {fellThroughSuccess && (
                <div className="mt-4 rounded-2xl bg-green-50 p-3 text-xs text-green-700 border border-green-200 flex items-center gap-1.5">
                  <CheckCircle2 size={15} /> {fellThroughSuccess}
                </div>
              )}

              <form onSubmit={handleFellThrough} className="mt-4 space-y-4 text-xs">
                <div className="rounded-2xl border border-[#dfe7d8] bg-[#f8f9f3] p-3 space-y-1">
                  <div className="font-bold text-[#10251d] text-sm">{fellThroughModalItem.listing.title}</div>
                  <div className="text-gray-500 font-mono text-[11px]">
                    Buyer: {fellThroughModalItem.buyerProfile?.displayName || fellThroughModalItem.accessRecord.buyerUid || "Prospective Buyer"}
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">Reason for Deal Falling Through (Optional)</label>
                  <textarea
                    rows={3}
                    value={cancellationReason}
                    onChange={(e) => setCancellationReason(e.target.value)}
                    placeholder="e.g. Counterparty unable to agree on pricing or delivery timeline"
                    className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                  />
                </div>

                <div className="mt-5 flex items-center justify-end gap-3 pt-3 border-t border-[#edf1ea]">
                  <button
                    type="button"
                    onClick={() => setFellThroughModalItem(null)}
                    className="rounded-full px-5 py-2 font-bold text-gray-500 hover:bg-gray-100 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={fellThroughSubmitting}
                    className="inline-flex items-center justify-center gap-1.5 rounded-full bg-red-600 px-6 py-2.5 font-bold text-white shadow-sm hover:bg-red-700 disabled:opacity-50 cursor-pointer"
                  >
                    {fellThroughSubmitting ? "Releasing..." : "Confirm & Release Lot"}
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
