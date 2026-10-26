/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */
"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import dynamic from "next/dynamic";
import { Navbar } from "@/components/Navbar";
import { useFirebase } from "@/context/FirebaseContext";
import { createCocoaApiClient, CocoaApiError } from "@/lib/cocoaApiClient";
import {
  MarketplaceListing,
  CertificateHolding,
  CocoaLot,
  TraceCertificate,
  QRCode,
  CertificateHolderType,
  MarketplaceReview,
  TradeRecord,
} from "@/types/traceability";
import {
  ShieldCheck,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Building2,
  Calendar,
  Lock,
  ArrowLeft,
  Store,
  CreditCard,
  QrCode,
  Layers,
  Trees,
  Compass,
  FileCheck2,
  ExternalLink,
  ChevronRight,
  RefreshCw,
  Star,
  MessageSquare,
} from "lucide-react";
import { CocoaGradeCard } from "@/components/CocoaGradeInfo";

const MapboxGeofenceMap = dynamic(() => import("@/components/MapboxGeofenceMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[320px] w-full items-center justify-center rounded-3xl bg-[#062d22] text-white">
      <div className="flex items-center gap-2 text-xs text-[#b8f58b]">
        <Compass className="animate-spin" size={18} /> Loading map...
      </div>
    </div>
  ),
});

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Array.isArray(params?.id) ? params.id[0] : (params?.id as string);
  const { user, loginWithGoogle } = useFirebase();

  const apiClient = useMemo(() => {
    return createCocoaApiClient(async () => {
      if (!user) return null;
      return await user.getIdToken();
    });
  }, [user]);

  // Listing Data State
  const [listing, setListing] = useState<MarketplaceListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Associated Details (Lot, Certificate, QR packages, Seller info)
  const [backingLot, setBackingLot] = useState<CocoaLot | null>(null);
  const [backingCert, setBackingCert] = useState<TraceCertificate | null>(null);
  const [backingQRs, setBackingQRs] = useState<QRCode[]>([]);
  const [sellerInfo, setSellerInfo] = useState<any | null>(null);
  const [hasSellerAccess, setHasSellerAccess] = useState(false);

  // Seller Access Payment Modal State
  const [showSellerPayModal, setShowSellerPayModal] = useState(false);
  const [sellerPaySubmitting, setSellerPaySubmitting] = useState(false);
  const [sellerPayError, setSellerPayError] = useState<string | null>(null);

  // Purchase Modal State
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [purchaseQuantityKg, setPurchaseQuantityKg] = useState<number>(0);
  const [purchaseBuyerType, setPurchaseBuyerType] = useState<CertificateHolderType>("cooperative");
  const [purchaseSubmitting, setPurchaseSubmitting] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [purchaseSuccess, setPurchaseSuccess] = useState<string | null>(null);

  // Reviews & Ratings State
  const [reviews, setReviews] = useState<MarketplaceReview[]>([]);
  const [averageRating, setAverageRating] = useState<number>(0);
  const [totalReviews, setTotalReviews] = useState<number>(0);
  const [userPurchases, setUserPurchases] = useState<TradeRecord[]>([]);
  const [formRating, setFormRating] = useState<number>(5);
  const [formComment, setFormComment] = useState("");
  const [selectedTradeIdForReview, setSelectedTradeIdForReview] = useState<string>("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewSuccess, setReviewSuccess] = useState<string | null>(null);

  const loadReviewsAndPurchases = useCallback(async () => {
    if (!id) return;
    try {
      const res = await apiClient.get<{ success: boolean; reviews: MarketplaceReview[]; averageRating: number; totalReviews: number }>(
        `/api/marketplace/reviews?listingId=${id}`
      );
      if (res && res.success) {
        setReviews(res.reviews || []);
        setAverageRating(res.averageRating || 0);
        setTotalReviews(res.totalReviews || 0);
      }
    } catch (err) {
      console.warn("Could not load reviews:", err);
    }

    if (user) {
      try {
        const tradesRes = await apiClient.get<{ success: boolean; trades: TradeRecord[] }>("/api/marketplace/trades?role=buyer");
        if (tradesRes && tradesRes.success && Array.isArray(tradesRes.trades)) {
          const myListingTrades = tradesRes.trades.filter(
            (t) => t.listingId === id && (t.tradeStatus === "completed" || t.tradeStatus === "delivered" || !t.tradeStatus)
          );
          setUserPurchases(myListingTrades);
          if (myListingTrades.length > 0 && !selectedTradeIdForReview) {
            const reviewedTradeIds = new Set(reviews.map((r) => r.tradeId));
            const unreviewed = myListingTrades.find((t) => !reviewedTradeIds.has(t.tradeId));
            if (unreviewed) {
              setSelectedTradeIdForReview(unreviewed.tradeId);
            }
          }
        }
      } catch (err) {
        console.warn("Could not load user purchases:", err);
      }
    }
  }, [id, apiClient, user, reviews, selectedTradeIdForReview]);

  useEffect(() => {
    loadReviewsAndPurchases();
  }, [loadReviewsAndPurchases]);

  const reviewedTradeIds = useMemo(() => new Set(reviews.map((r) => r.tradeId)), [reviews]);
  const unreviewedPurchases = useMemo(() => {
    return userPurchases.filter((t) => !reviewedTradeIds.has(t.tradeId));
  }, [userPurchases, reviewedTradeIds]);

  const handleRateAndComment = async (e: React.FormEvent) => {
    e.preventDefault();
    setReviewError(null);
    setReviewSuccess(null);
    setReviewSubmitting(true);

    try {
      if (!selectedTradeIdForReview) throw new Error("Please select a purchase trade to review.");
      if (!formComment.trim()) throw new Error("Please enter a comment.");

      const res = await apiClient.post<{ success: boolean; review: MarketplaceReview }>(
        "/api/marketplace/reviews",
        {
          listingId: id,
          sellerId: listing?.sellerHolderId || listing?.createdByUid,
          tradeId: selectedTradeIdForReview,
          rating: Number(formRating),
          comment: formComment.trim(),
        }
      );

      if (res && res.success) {
        setReviewSuccess("Review submitted successfully!");
        setFormComment("");
        setFormRating(5);
        await loadReviewsAndPurchases();
        setTimeout(() => setReviewSuccess(null), 3000);
      }
    } catch (err: unknown) {
      if (err instanceof CocoaApiError) {
        setReviewError(err.message);
      } else if (err instanceof Error) {
        setReviewError(err.message);
      } else {
        setReviewError("Failed to submit review.");
      }
    } finally {
      setReviewSubmitting(false);
    }
  };

  // Load Listing Details
  const loadListingDetails = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);

    try {
      // 1. Fetch Listing
      const res = await apiClient.get<{ success: boolean; listing: MarketplaceListing }>(
        `/api/marketplace/listings/${id}`
      );

      if (!res || !res.listing) {
        throw new Error("Marketplace listing not found.");
      }

      const l = res.listing;
      setListing(l);
      setPurchaseQuantityKg(l.quantityAvailableKg);

      // 2. Fetch Backing Cocoa Lot if available
      if (l.lotId) {
        try {
          const lotRes = await apiClient.get<{ success: boolean; lot: CocoaLot }>(
            `/api/cocoa-lots/${l.lotId}`
          );
          if (lotRes && lotRes.lot) {
            setBackingLot(lotRes.lot);
          }
        } catch {
          // Continue if lot details aren't publicly exposed
        }
      }

      // 3. Fetch Certificate if certified
      if (l.certificateId) {
        try {
          const certRes = await apiClient.get<{ success: boolean; certificate: TraceCertificate }>(
            `/api/certificates/${l.certificateId}`
          );
          if (certRes && certRes.certificate) {
            setBackingCert(certRes.certificate);
          }
        } catch {
          // Continue
        }
      }

      // 4. Fetch QR Packages if QR mode
      if (l.inventoryMode === "QR_PACKAGES" && l.sourceHoldingId) {
        try {
          const qrRes = await apiClient.get<{ success: boolean; qrCodes: QRCode[] }>(
            `/api/qr-codes?holdingId=${encodeURIComponent(l.sourceHoldingId)}`
          );
          if (qrRes && qrRes.qrCodes) {
            const activeOnly = qrRes.qrCodes.filter((q) =>
              (l.currentQrPackageIds || []).includes(q.qrId)
            );
            setBackingQRs(activeOnly);
          }
        } catch {
          // Continue
        }
      }

      // 5. Check Seller Info access if user is logged in
      if (user) {
        try {
          const accessRes = await apiClient.get<{ success: boolean; sellerInfo: any }>(
            `/api/marketplace/seller-info/${l.listingId}`
          );
          if (accessRes && accessRes.success && accessRes.sellerInfo) {
            setSellerInfo(accessRes.sellerInfo);
            setHasSellerAccess(true);
          }
        } catch {
          setHasSellerAccess(false);
        }
      }
    } catch (err: unknown) {
      if (err instanceof CocoaApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to load listing details.");
      }
    } finally {
      setLoading(false);
    }
  }, [id, apiClient, user]);

  useEffect(() => {
    loadListingDetails();
  }, [loadListingDetails]);

  // Handle Flutterwave Seller Information Access Payment Initiation
  const handleInitiateSellerPayment = async () => {
    if (!listing) return;
    if (listing.listingStatus === "under_negotiation" || isUnderNegotiation) {
      setSellerPayError("This listing is currently under negotiation. Contact access fee payment is disabled.");
      return;
    }
    setSellerPaySubmitting(true);
    setSellerPayError(null);

    try {
      const res = await apiClient.post<{
        checkoutUrl: string;
        paymentReference: string;
        paymentId: string;
        amountCharged: number;
        currency: "NGN";
        expiresAt: string;
        isExistingSession?: boolean;
      }>("/api/payments/flutterwave/initiate", {
        listingId: listing.listingId,
        customerEmail: user?.email || undefined,
        customerName: user?.displayName || undefined,
      });

      if (res && res.checkoutUrl) {
        window.location.href = res.checkoutUrl;
      } else {
        throw new Error("Failed to obtain Flutterwave checkout URL.");
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setSellerPayError(err.message);
      } else {
        setSellerPayError("Failed to initiate payment.");
      }
    } finally {
      setSellerPaySubmitting(false);
    }
  };

  // Handle Google Sign-in to unlock seller contact & initiate payment
  const handleGoogleSignInToPay = async () => {
    try {
      setSellerPaySubmitting(true);
      setSellerPayError(null);
      await loginWithGoogle();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setSellerPayError(err.message);
      } else {
        setSellerPayError("Sign-in failed. Please try again.");
      }
    } finally {
      setSellerPaySubmitting(false);
    }
  };

  // Handle Purchase Finalization
  const handlePurchase = async () => {
    if (!listing) return;
    setPurchaseSubmitting(true);
    setPurchaseError(null);

    try {
      // 1. Get Purchase Intent
      const intentRes = await apiClient.post<{ success: boolean; intent: any }>(
        "/api/marketplace/trades/on-platform-purchase",
        {
          action: "intent",
          listingId: listing.listingId,
          buyerHolderType: purchaseBuyerType,
          requestedQuantityKg: purchaseQuantityKg,
          selectedQrPackageIds:
            listing.inventoryMode === "QR_PACKAGES" ? listing.currentQrPackageIds : undefined,
        }
      );

      if (!intentRes || !intentRes.intent) {
        throw new Error("Failed to initialize purchase intent.");
      }

      const intent = intentRes.intent;

      // 2. Finalize On-Platform Purchase
      const finalizeRes = await apiClient.post<{ success: boolean; trade: any; destHolding?: any }>(
        "/api/marketplace/trades/on-platform-purchase",
        {
          action: "finalize",
          paymentReference: intent.paymentReference,
          listingId: listing.listingId,
          buyerHolderType: purchaseBuyerType,
          purchasedQuantityKg: intent.quantityKg,
          selectedQrPackageIds: intent.selectedQrPackageIds,
          paymentMethod: "mtn_momo",
          externalTransactionReference: `MOMO-REF-${Date.now()}`,
        }
      );

      if (finalizeRes && finalizeRes.success) {
        setPurchaseSuccess(
          `Purchase finalized! Trade: ${finalizeRes.trade.tradeNumber}. Custody holding provisioned.`
        );
        setTimeout(() => {
          setShowPurchaseModal(false);
          setPurchaseSuccess(null);
          router.push("/dashboard/trades");
        }, 1500);
      }
    } catch (err: unknown) {
      if (err instanceof CocoaApiError) {
        setPurchaseError(err.message);
      } else if (err instanceof Error) {
        setPurchaseError(err.message);
      } else {
        setPurchaseError("Purchase failed to finalize.");
      }
    } finally {
      setPurchaseSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f7f8f3] text-[#10251d]">
        <Navbar />
        <main className="mx-auto max-w-[1280px] px-6 pt-32 pb-16 text-center">
          <RefreshCw size={36} className="mx-auto animate-spin text-[#2d6130]" />
          <h2 className="mt-4 text-lg font-bold">Loading Cocoa Offering...</h2>
        </main>
      </div>
    );
  }

  if (error || !listing) {
    return (
      <div className="min-h-screen bg-[#f7f8f3] text-[#10251d]">
        <Navbar />
        <main className="mx-auto max-w-[1280px] px-6 pt-32 pb-16">
          <div className="rounded-[28px] border border-red-200 bg-red-50 p-8 text-center text-red-900">
            <AlertCircle size={40} className="mx-auto text-red-600" />
            <h2 className="mt-3 text-xl font-bold">Listing Not Found</h2>
            <p className="mt-2 text-sm text-red-700">{error || "The requested listing does not exist."}</p>
            <Link
              href="/marketplace"
              className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-[#0b3528] px-6 py-2.5 text-xs font-bold text-white"
            >
              <ArrowLeft size={14} /> Back to Marketplace
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const isCertified = listing.certificationType === "certified";
  const isSold = listing.listingStatus === "sold" || listing.quantityAvailableKg <= 0;
  const isUnderNegotiation = listing.listingStatus === "under_negotiation";

  return (
    <div className="min-h-screen bg-[#f7f8f3] text-[#10251d]">
      <Navbar />

      <main className="mx-auto max-w-[1280px] px-6 pt-28 pb-16 sm:pt-32 lg:px-8">
        {/* Navigation Breadcrumb */}
        <div className="mb-6 flex items-center gap-2 text-xs font-medium text-[#57655d]">
          <Link href="/marketplace" className="hover:text-[#2d6130] flex items-center gap-1">
            <ArrowLeft size={13} /> Marketplace
          </Link>
          <span>/</span>
          <span className="font-mono text-[#10251d]">{listing.listingNumber}</span>
        </div>

        {/* Hero Section with Listing Image at Top Left */}
        <section className="mb-8 flex flex-col gap-6 rounded-[32px] border border-[#dfe7d8] bg-white p-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-5 max-w-2xl">
            {(listing.cocoaImage?.secureUrl || backingLot?.cocoaImage?.secureUrl) && (
              <div className="relative shrink-0 overflow-hidden rounded-2xl border border-[#dfe7d8] bg-[#f0f4ec]">
                <Image
                  src={listing.cocoaImage?.secureUrl || backingLot?.cocoaImage?.secureUrl || ""}
                  alt={listing.title}
                  width={listing.cocoaImage?.width || backingLot?.cocoaImage?.width || 300}
                  height={listing.cocoaImage?.height || backingLot?.cocoaImage?.height || 300}
                  className="h-24 w-24 sm:h-28 sm:w-28 object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold ${
                  isUnderNegotiation
                    ? "bg-amber-100 text-amber-800 border border-amber-300"
                    : isSold
                    ? "bg-red-50 text-red-700 border border-red-200"
                    : "bg-[#eefbf3] text-[#1d6a45]"
                }`}>
                  {listing.listingStatus.replace("_", " ").toUpperCase()}
                </span>
                {user && (listing.createdByUid === user.uid || listing.sellerHolderId === user.uid) && (
                  <span className="rounded-full bg-[#e8effd] border border-[#c5d9f8] px-2.5 py-0.5 text-[0.68rem] font-bold text-[#1e4bb5]">
                    Your Offering
                  </span>
                )}
              </div>

              <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#10251d] sm:text-3xl md:text-4xl">
                {listing.title}
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-[#57655d]">
                {listing.description ||
                  "Verified Cameroonian cocoa offering registered with authenticated single-origin traceability records and supply-chain custody integrity."}
              </p>
            </div>
          </div>

          <aside className="w-full max-w-md rounded-[24px] border border-[#dfe7d8] bg-[#f8f9f3] p-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs uppercase font-bold tracking-wider text-[#627064]">
                Unit Price
              </span>
              <strong className="text-2xl font-bold text-[#10251d]">
                {listing.pricePerKg.toLocaleString()} {listing.currency} / kg
              </strong>
            </div>

            <dl className="space-y-2.5 text-xs text-[#394a41] border-t border-[#edf1ea] pt-3">
              <div className="flex justify-between">
                <dt className="text-gray-500">Available Stock:</dt>
                <dd className="font-bold text-[#10251d]">
                  {listing.quantityAvailableKg.toLocaleString()} kg
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Seller Entity Role:</dt>
                <dd className="font-semibold text-[#10251d] capitalize">
                  {listing.sellerHolderType}
                </dd>
              </div>
              {listing.qualityGrade && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Quality Grade:</dt>
                  <dd className="font-semibold text-[#10251d]">{listing.qualityGrade}</dd>
                </div>
              )}
              {listing.inventoryMode && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Inventory Mode:</dt>
                  <dd className="font-bold text-[#2d6130]">{listing.inventoryMode}</dd>
                </div>
              )}
            </dl>

            <div className="mt-5 pt-3 border-t border-[#edf1ea]">
              {(() => {
                const isMyListing = user && listing && (listing.createdByUid === user.uid || listing.sellerHolderId === user.uid);
                if (isMyListing) {
                  return (
                    <div className="w-full py-2.5 text-center text-xs font-bold text-[#2d6130] bg-[#edf7e8] rounded-full">
                      Your Offering (Owned by You)
                    </div>
                  );
                }
                if (isUnderNegotiation) {
                  return (
                    <div className="space-y-2">
                      <button
                        type="button"
                        disabled
                        className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-amber-100 border border-amber-300 py-3 text-sm font-bold text-amber-900 shadow-none opacity-80 cursor-not-allowed"
                        title="This cocoa offering is currently under negotiation and cannot be purchased."
                      >
                        <Lock size={16} /> Under Negotiation (Purchase Disabled)
                      </button>
                      <p className="text-[11px] text-center text-amber-800 font-medium leading-relaxed">
                        A buyer is actively negotiating this cocoa offering. Direct purchase is disabled.
                      </p>
                    </div>
                  );
                }
                if (!isSold) {
                  return (
                    <button
                      type="button"
                      onClick={() => setShowPurchaseModal(true)}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-[#0b3528] py-3 text-sm font-bold text-white shadow-sm hover:bg-[#144737] cursor-pointer"
                    >
                      <CreditCard size={16} /> Purchase Cocoa
                    </button>
                  );
                }
                return (
                  <div className="w-full py-2.5 text-center text-xs font-bold text-red-700 bg-red-50 rounded-full">
                    Listing Fully Sold / Completed
                  </div>
                );
              })()}
            </div>
          </aside>
        </section>

        {/* Details Grid */}
        <section className="grid gap-6 lg:grid-cols-[1.8fr_0.9fr]">
          <div className="space-y-6">
            {/* Cocoa Lot Quality Grade Specifications for Agents & Buyers */}
            <CocoaGradeCard
              gradeStr={listing.qualityGrade || backingLot?.qualityGrade || "Grade 1"}
            />

            {/* Origin & Cocoa Lot Specifications */}
            <div className="rounded-[28px] border border-[#dfe7d8] bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-bold text-[#10251d]">Origin &amp; Batch Provenance</h2>
                <span className="font-mono text-xs text-gray-400">{listing.lotId}</span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 text-xs">
                <div className="rounded-2xl bg-[#f8f9f3] p-3.5">
                  <span className="text-gray-500 block">Production Country</span>
                  <strong className="mt-1 block text-sm font-bold text-[#10251d]">
                    {backingLot?.originCountry || "Cameroon"}
                  </strong>
                </div>

                <div className="rounded-2xl bg-[#f8f9f3] p-3.5">
                  <span className="text-gray-500 block">Origin Farm Identifier</span>
                  <strong className="mt-1 block text-sm font-bold text-[#10251d]">
                    {backingLot?.farmId || "Origin Smallholder Farm (Cameroon)"}
                  </strong>
                </div>

                <div className="rounded-2xl bg-[#f8f9f3] p-3.5">
                  <span className="text-gray-500 block">Backing Cocoa Lot</span>
                  <strong className="mt-1 block font-mono text-xs font-bold text-[#10251d]">
                    {listing.lotId}
                  </strong>
                </div>

                <div className="rounded-2xl bg-[#f8f9f3] p-3.5">
                  <span className="text-gray-500 block">Certificate Reference</span>
                  <strong className="mt-1 block font-mono text-xs font-bold text-[#2d6130]">
                    {listing.certificateId || "None (Uncertified Physical Commerce)"}
                  </strong>
                </div>
              </div>

              {/* Geolocation Map */}
              <div className="mt-6 rounded-3xl border border-[#dfe7d8] bg-[#fbfdfa] p-5">
                <div className="mb-3 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#2d6130]">
                    <Trees size={15} />
                    EUDR Canopy Geolocation &amp; Plot Geofence
                  </span>
                  <span className="rounded-full bg-[#edf7e8] px-2.5 py-0.5 text-[0.65rem] font-bold text-[#2a7a33] border border-[#c6e8ba]">
                    Zero-Deforestation Audited
                  </span>
                </div>

                <MapboxGeofenceMap
                  initialCenter={[9.1245, 4.5912]}
                  initialZoom={13}
                  activePolygon={[
                    [9.1225, 4.5902],
                    [9.1265, 4.5918],
                    [9.1278, 4.5892],
                    [9.1238, 4.5882],
                  ]}
                  heightClass="h-[300px]"
                  showForestReservesDefault={true}
                />
              </div>
            </div>

            {/* Discrete QR Packages if Mode is QR_PACKAGES */}
            {listing.inventoryMode === "QR_PACKAGES" && (
              <div className="rounded-[28px] border border-[#dfe7d8] bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-[#10251d] flex items-center gap-2">
                    <QrCode size={18} className="text-[#2d6130]" />
                    Allocated QR Packages ({backingQRs.length} Available)
                  </h3>
                  <span className="text-xs text-gray-500">Bag-level traceability</span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                  {backingQRs.map((qr) => (
                    <div
                      key={qr.qrId}
                      className="rounded-2xl border border-[#dfe7d8] bg-[#fbfcf9] p-3 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-[#10251d]">{qr.packageNumber || qr.qrId}</span>
                        <span className="rounded-full bg-[#edf7e8] px-2 py-0.5 text-[0.65rem] font-bold text-[#2d6130]">
                          {qr.status}
                        </span>
                      </div>
                      <div className="mt-2 text-gray-500">Weight:</div>
                      <strong className="text-base font-bold text-[#10251d]">
                        {qr.representedQuantityKg} kg
                      </strong>
                      <div className="mt-2 text-[10px] text-gray-400 font-mono truncate">
                        ID: {qr.qrId}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Seller Ratings & Comments Section */}
            <div className="rounded-[28px] border border-[#dfe7d8] bg-white p-6 shadow-sm">
              <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-[#edf1ea] pb-3">
                <div>
                  <h3 className="text-lg font-bold text-[#10251d] flex items-center gap-2">
                    <Star size={20} className="fill-amber-400 text-amber-500" />
                    Seller Ratings &amp; Reviews ({totalReviews})
                  </h3>
                  <p className="text-xs text-[#57655d]">
                    Authentic feedback from verified cocoa buyers.
                  </p>
                </div>
                {totalReviews > 0 && (
                  <div className="flex items-center gap-2 rounded-2xl bg-[#fdfbe8] border border-[#fae89c] px-3 py-1.5">
                    <div className="flex items-center text-amber-500">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          size={14}
                          className={star <= Math.round(averageRating) ? "fill-amber-400 text-amber-500" : "text-gray-300"}
                        />
                      ))}
                    </div>
                    <span className="font-extrabold text-sm text-[#10251d]">{averageRating}</span>
                    <span className="text-xs text-gray-500">/ 5.0</span>
                  </div>
                )}
              </div>

              {/* Review Submission Form for Buyers */}
              {user && (
                <div className="mb-6 rounded-2xl border border-[#dfe7d8] bg-[#f8f9f3] p-4">
                  <h4 className="font-bold text-xs text-[#10251d] mb-2">Leave a Rating &amp; Comment</h4>
                  {userPurchases.length === 0 ? (
                    <p className="text-xs text-gray-500">
                      You must purchase cocoa or have your purchase declared by the seller before leaving a rating and comment (if you unlocked seller info, please wait until your trade is completed or declared).
                    </p>
                  ) : unreviewedPurchases.length === 0 ? (
                    <div className="rounded-xl bg-[#edf7e8] border border-[#c5e4ba] p-3 text-xs text-[#1d6a45]">
                      ✓ You have reviewed your purchase(s) for this listing. <strong>Buy again to leave another review.</strong>
                    </div>
                  ) : (
                    <form onSubmit={handleRateAndComment} className="space-y-3 text-xs">
                      {reviewError && (
                        <div className="rounded-xl bg-red-50 p-2.5 text-red-700 flex items-center gap-1.5 border border-red-200">
                          <AlertCircle size={14} /> {reviewError}
                        </div>
                      )}
                      {reviewSuccess && (
                        <div className="rounded-xl bg-green-50 p-2.5 text-green-700 flex items-center gap-1.5 border border-green-200">
                          <CheckCircle2 size={14} /> {reviewSuccess}
                        </div>
                      )}

                      {unreviewedPurchases.length > 1 && (
                        <div>
                          <label className="block font-semibold mb-1 text-gray-600">Select Purchase Trade:</label>
                          <select
                            value={selectedTradeIdForReview}
                            onChange={(e) => setSelectedTradeIdForReview(e.target.value)}
                            className="w-full rounded-xl border border-[#dfe7d8] bg-white p-2 text-xs font-mono"
                          >
                            {unreviewedPurchases.map((t) => (
                              <option key={t.tradeId} value={t.tradeId}>
                                {t.tradeNumber} ({t.quantityKg || 0} kg)
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      <div>
                        <label className="block font-semibold mb-1 text-gray-600">Rating (Stars):</label>
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              type="button"
                              onClick={() => setFormRating(star)}
                              className="p-1 focus:outline-none cursor-pointer"
                            >
                              <Star
                                size={22}
                                className={star <= formRating ? "fill-amber-400 text-amber-500" : "text-gray-300 hover:text-amber-400"}
                              />
                            </button>
                          ))}
                          <span className="ml-2 font-bold text-sm text-[#10251d]">{formRating} Stars</span>
                        </div>
                      </div>

                      <div>
                        <label className="block font-semibold mb-1 text-gray-600">Your Comment:</label>
                        <textarea
                          rows={2}
                          required
                          value={formComment}
                          onChange={(e) => setFormComment(e.target.value)}
                          placeholder="Share your experience regarding cocoa quality, fermentation, delivery, etc..."
                          className="w-full rounded-xl border border-[#dfe7d8] bg-white p-2.5 outline-none font-medium"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={reviewSubmitting}
                        className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#0b3528] px-5 py-2 font-bold text-white transition hover:bg-[#144737] disabled:opacity-50 cursor-pointer"
                      >
                        {reviewSubmitting ? "Submitting..." : "Submit Review"}
                      </button>
                    </form>
                  )}
                </div>
              )}

              {/* Reviews List */}
              {reviews.length === 0 ? (
                <div className="text-center py-8 text-xs text-gray-500">
                  No reviews yet for this listing. Be the first verified buyer to leave a rating.
                </div>
              ) : (
                <div className="space-y-4">
                  {reviews.map((rev) => (
                    <div key={rev.reviewId} className="rounded-2xl border border-[#edf1ea] bg-[#fafcf9] p-4 text-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <strong className="text-[#10251d] text-sm">{rev.buyerName}</strong>
                          {/* Amount of cocoa bought indicated as a tag beside their name */}
                          <span className="rounded-full bg-[#edf7e8] border border-[#b8f58b] px-2 py-0.5 text-[10px] font-bold text-[#2d6130]">
                            Verified Buyer • {rev.purchasedQuantityKg} kg purchased
                          </span>
                        </div>
                        <span className="text-[10px] text-gray-400">
                          {new Date(rev.createdAt).toLocaleDateString()}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 text-amber-500">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            size={12}
                            className={star <= rev.rating ? "fill-amber-400 text-amber-500" : "text-gray-300"}
                          />
                        ))}
                        <span className="ml-1 font-bold text-xs text-[#10251d]">{rev.rating} / 5</span>
                      </div>

                      <p className="text-gray-700 leading-relaxed">{rev.comment}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Sidebar: Trace Certificate & Seller Details */}
          <aside className="space-y-6">
            {/* Certificate Lineage */}
            <div className="rounded-[28px] border border-[#dfe7d8] bg-white p-6 shadow-sm">
              <h3 className="text-lg font-bold text-[#10251d]">Certification Verification</h3>

              {isCertified && listing.certificateId ? (
                <div className="mt-4 space-y-3 text-xs">
                  <div className="rounded-2xl bg-[#edf7e8] border border-[#d2ecc8] p-4 text-[#10251d]">
                    <div className="flex items-center gap-2 font-bold text-sm text-[#2d6130]">
                      <ShieldCheck size={18} /> Official Origin Certificate
                    </div>
                    <p className="mt-1 text-xs text-[#394a41]">
                      This cocoa holds an authenticated Origin Trace Certificate issued under Cameroon
                      standards with verified deforestation due diligence.
                    </p>
                  </div>

                  <div className="space-y-2 border-t border-[#edf1ea] pt-3">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Certificate ID:</span>
                      <span className="font-mono font-bold">{listing.certificateId}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Source Holding:</span>
                      <span className="font-mono text-gray-700">{listing.sourceHoldingId}</span>
                    </div>
                  </div>

                  <Link
                    href={`/dashboard/certificates?certId=${listing.certificateId}`}
                    className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-[#dfe7d8] py-2 text-xs font-bold text-[#2d6130] hover:bg-[#f1f6ec]"
                  >
                    View Full Certificate Lineage <ExternalLink size={12} />
                  </Link>
                </div>
              ) : (
                <div className="mt-4 rounded-2xl bg-[#faf8f0] border border-[#e5e0cc] p-4 text-xs text-[#745f21]">
                  <strong>Uncertified Commercial Listing</strong>
                  <p className="mt-1">
                    This offering represents direct physical cocoa stock trading without an associated
                    Origin Trace Certificate.
                  </p>
                </div>
              )}
            </div>

            {/* Seller Contact & Verification */}
            <div className="rounded-[28px] border border-[#dfe7d8] bg-white p-6 shadow-sm">
              <h3 className="text-lg font-bold text-[#10251d]">Seller Information</h3>

              {(() => {
                const isMyListing = user && listing && (listing.createdByUid === user.uid || listing.sellerHolderId === user.uid);
                if (isMyListing) {
                  return (
                    <div className="mt-4 space-y-2.5 text-xs">
                      <div className="rounded-2xl bg-[#eefbf3] p-3 text-[#1d6a45] font-semibold">
                        ✓ Your Offering (Owned by You)
                      </div>
                      <p className="text-gray-500">
                        You are the seller of this listing. Contact access is automatically unlocked.
                      </p>
                    </div>
                  );
                }
                if (hasSellerAccess && sellerInfo) {
                  return (
                    <div className="mt-4 space-y-2.5 text-xs">
                      <div className="rounded-2xl bg-[#eefbf3] p-3 text-[#1d6a45] font-semibold">
                        ✓ Verified Contact Access Granted
                      </div>

                      {sellerInfo.contactName && (
                        <div>
                          <span className="text-gray-500">Contact Name:</span>
                          <strong className="block text-[#10251d]">
                            {sellerInfo.contactName}
                          </strong>
                        </div>
                      )}

                      {sellerInfo.phone && (
                        <div>
                          <span className="text-gray-500">Phone:</span>
                          <strong className="block text-[#10251d] font-mono">
                            {sellerInfo.phone}
                          </strong>
                        </div>
                      )}

                      {sellerInfo.email && (
                        <div>
                          <span className="text-gray-500">Email:</span>
                          <strong className="block text-[#10251d]">
                            {sellerInfo.email}
                          </strong>
                        </div>
                      )}

                      {sellerInfo.location && (
                        <div>
                          <span className="text-gray-500">Location:</span>
                          <strong className="block text-[#10251d]">
                            {sellerInfo.location}
                          </strong>
                        </div>
                      )}
                    </div>
                  );
                }
                if (isUnderNegotiation) {
                  return (
                    <div className="mt-4 space-y-3 text-xs text-gray-600">
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 space-y-1.5">
                        <div className="flex items-center gap-2 font-bold text-sm text-amber-800">
                          <Lock size={16} /> Contact Access Locked
                        </div>
                        <p className="text-[11px] text-amber-700 leading-relaxed">
                          This cocoa lot is currently <strong>under active negotiation</strong> with a verified buyer. Access to seller contact information is temporarily suspended until negotiations conclude or the lot returns to market.
                        </p>
                      </div>
                      <div className="flex items-center gap-2 font-mono text-[11px] text-gray-500 bg-[#f7f8f3] p-2.5 rounded-xl">
                        <Lock size={14} /> Protected Entity: {listing.sellerHolderType.toUpperCase()}
                      </div>
                      <button
                        type="button"
                        disabled
                        className="mt-2 w-full inline-flex items-center justify-center gap-2 rounded-full border border-amber-300 bg-amber-100 py-3 text-xs font-bold text-amber-800 shadow-none cursor-not-allowed opacity-80"
                        title="This cocoa offering is currently under negotiation. Contact access cannot be purchased."
                      >
                        <Lock size={14} /> Under Negotiation (Contact Access Disabled)
                      </button>
                    </div>
                  );
                }
                return (
                  <div className="mt-4 space-y-3 text-xs text-gray-600">
                    <p>
                      Seller direct contact information is protected. Request access to unlock direct seller credentials via Flutterwave secure payment.
                    </p>
                    <div className="flex items-center gap-2 font-mono text-[11px] text-gray-500 bg-[#f7f8f3] p-2.5 rounded-xl">
                      <Lock size={14} /> Protected Entity: {listing.sellerHolderType.toUpperCase()}
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowSellerPayModal(true)}
                      className="mt-2 w-full inline-flex items-center justify-center gap-2 rounded-full bg-[#0b3528] py-3 text-xs font-bold text-white shadow-sm hover:bg-[#144737] cursor-pointer"
                    >
                      <CreditCard size={14} /> Unlock Seller Contact (Fee in XAF, Converted to NGN at checkout)
                    </button>
                  </div>
                );
              })()}
            </div>
          </aside>
        </section>

        {/* Modal: Seller Information Access Payment via Flutterwave */}
        {showSellerPayModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm overflow-y-auto">
            <div className="relative my-8 w-full max-w-lg rounded-[32px] border border-[#dfe7d8] bg-white p-6 shadow-2xl">
              <button
                type="button"
                onClick={() => setShowSellerPayModal(false)}
                className="absolute right-5 top-5 rounded-full p-1.5 text-gray-400 hover:bg-gray-100"
              >
                ✕
              </button>

              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#2d6130]">
                <ShieldCheck size={14} /> Flutterwave Secure Gateway
              </div>
              <h2 className="mt-1 text-2xl font-bold text-[#10251d]">Seller Information Access Fee</h2>
              <div className="flex justify-between pt-2 border-t border-[#dfe7d8] font-bold text-sm text-[#2d6130]">
                <span>Seller Access Fee:</span>
                <span>Calculated in XAF (Converted to NGN at checkout)</span>
              </div>

              {isUnderNegotiation && (
                <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-900 flex items-start gap-2.5">
                  <Lock size={16} className="text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block font-bold">Contact Access Payment Disabled</strong>
                    This cocoa lot is currently under negotiation. Payment to unlock seller details cannot be initiated at this time.
                  </div>
                </div>
              )}

              {sellerPayError && (
                <div className="mt-4 rounded-2xl bg-red-50 p-3 text-xs text-red-700 border border-red-200">
                  {sellerPayError}
                </div>
              )}

              <div className="mt-5 rounded-2xl bg-[#f8f9f3] p-4 space-y-3 text-xs border border-[#dfe7d8]">
                <div className="flex justify-between">
                  <span className="text-gray-500">Listing Quantity:</span>
                  <span className="font-bold text-[#10251d]">{listing.quantityAvailableKg.toLocaleString()} kg</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Price per kg:</span>
                  <span className="font-bold text-[#10251d]">{listing.pricePerKg.toLocaleString()} {listing.currency}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Listing Total Value:</span>
                  <span className="font-bold text-[#10251d]">{(listing.quantityAvailableKg * listing.pricePerKg).toLocaleString()} {listing.currency}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-[#dfe7d8] font-bold text-sm text-[#2d6130]">
                  <span>Access Fee:</span>
                  <span>{Math.ceil(listing.quantityAvailableKg * listing.pricePerKg * 0.005).toLocaleString()} XAF (Converted at checkout)</span>
                </div>
              </div>

              {!user ? (
                <div className="mt-6 space-y-3 pt-3 border-t border-[#edf1ea]">
                  <div className="rounded-2xl border border-[#cdebc2] bg-[#edf7e8] p-3 text-xs text-[#1c4b2e]">
                    <div className="flex items-center gap-2 font-bold">
                      <ShieldCheck size={16} className="text-[#2a7a33]" />
                      Sign in to proceed with contact access fee
                    </div>
                    <p className="mt-1 text-[11px] text-[#426b52] leading-relaxed">
                      Your payment receipt, escrow protection, and unlocked seller contact credentials will be securely linked to your account.
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center justify-end gap-2.5">
                    <button
                      type="button"
                      onClick={() => setShowSellerPayModal(false)}
                      className="w-full sm:w-auto rounded-full px-5 py-2.5 font-bold text-xs text-gray-500 hover:bg-gray-100"
                    >
                      Cancel
                    </button>

                    <Link
                      href={`/login?redirect=${encodeURIComponent(`/product/${listing.listingId}`)}`}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-full border border-[#dfe7d8] bg-white px-5 py-2.5 font-bold text-xs text-[#10251d] hover:bg-[#edf2ea] transition"
                    >
                      Sign In with Email
                    </Link>

                    <button
                      type="button"
                      onClick={handleGoogleSignInToPay}
                      disabled={sellerPaySubmitting || isUnderNegotiation}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full bg-[#0b3528] px-6 py-2.5 font-bold text-xs text-white shadow-sm hover:bg-[#144737] disabled:opacity-50 cursor-pointer"
                    >
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] font-black text-[#0b3528]">
                        G
                      </span>
                      {sellerPaySubmitting ? "Connecting..." : "Sign In with Google to Pay"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-[#edf1ea]">
                  <button
                    type="button"
                    onClick={() => setShowSellerPayModal(false)}
                    className="rounded-full px-5 py-2.5 font-bold text-xs text-gray-500 hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleInitiateSellerPayment}
                    disabled={sellerPaySubmitting || isUnderNegotiation}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0b3528] px-6 py-2.5 font-bold text-xs text-white shadow-sm hover:bg-[#144737] disabled:opacity-50 cursor-pointer"
                  >
                    {isUnderNegotiation ? "Disabled (Under Negotiation)" : sellerPaySubmitting ? "Initializing Checkout..." : "Pay via Flutterwave"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Modal: Purchase Confirmation */}
        {showPurchaseModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm overflow-y-auto">
            <div className="relative my-8 w-full max-w-xl rounded-[32px] border border-[#dfe7d8] bg-white p-6 shadow-2xl">
              <button
                type="button"
                onClick={() => setShowPurchaseModal(false)}
                className="absolute right-5 top-5 rounded-full p-1.5 text-gray-400 hover:bg-gray-100"
              >
                ✕
              </button>

              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#2d6130]">
                <CreditCard size={14} /> Execute Cocoa Purchase
              </div>
              <h2 className="mt-1 text-2xl font-bold text-[#10251d]">Confirm Trade Order</h2>

              {isUnderNegotiation && (
                <div className="mt-4 rounded-2xl bg-amber-50 p-3 text-xs text-amber-800 border border-amber-300 flex items-start gap-2">
                  <Lock size={15} className="shrink-0 mt-0.5 text-amber-600" />
                  <span>This cocoa offering is currently under negotiation. Purchases are temporarily locked.</span>
                </div>
              )}

              {purchaseError && (
                <div className="mt-4 rounded-2xl bg-red-50 p-3 text-xs text-red-700 border border-red-200">
                  {purchaseError}
                </div>
              )}

              {purchaseSuccess && (
                <div className="mt-4 rounded-2xl bg-green-50 p-3 text-xs text-green-700 border border-green-200">
                  {purchaseSuccess}
                </div>
              )}

              <div className="mt-5 space-y-4 text-xs">
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

                {listing.inventoryMode !== "QR_PACKAGES" ? (
                  <div>
                    <label className="block font-semibold text-[#10251d] mb-1">Quantity (kg)</label>
                    <input
                      type="number"
                      min={1}
                      max={listing.quantityAvailableKg}
                      value={purchaseQuantityKg || ""}
                      onChange={(e) => setPurchaseQuantityKg(Number(e.target.value))}
                      className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                    />
                  </div>
                ) : (
                  <div className="rounded-2xl bg-[#f8f9f3] p-3 text-gray-600">
                    Purchasing all {listing.currentQrPackageIds?.length} active packages (
                    {listing.quantityAvailableKg} kg).
                  </div>
                )}

                <div className="rounded-2xl bg-[#edf7e8] p-4 space-y-1.5 font-medium text-xs text-[#10251d]">
                  <div className="flex justify-between">
                    <span>Base Value:</span>
                    <span>
                      {(purchaseQuantityKg * listing.pricePerKg).toLocaleString()} {listing.currency}
                    </span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Platform Fee:</span>
                    <span>
                      {Math.round(purchaseQuantityKg * listing.pricePerKg * 0.02).toLocaleString()}{" "}
                      {listing.currency}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-[#c5e4ba] font-bold text-sm">
                    <span>Total Amount Payable:</span>
                    <span>
                      {Math.round(purchaseQuantityKg * listing.pricePerKg * 1.02).toLocaleString()}{" "}
                      {listing.currency}
                    </span>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-end gap-3 pt-3 border-t border-[#edf1ea]">
                  <button
                    type="button"
                    onClick={() => setShowPurchaseModal(false)}
                    className="rounded-full px-5 py-2 font-bold text-gray-500 hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                  {!user ? (
                    <Link
                      href={`/login?redirect=${encodeURIComponent(`/product/${listing.listingId}`)}`}
                      className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#0b3528] px-6 py-2.5 font-bold text-white shadow-sm hover:bg-[#144737]"
                    >
                      Sign In to Confirm Trade
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={handlePurchase}
                      disabled={purchaseSubmitting || isUnderNegotiation}
                      className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#0b3528] px-6 py-2.5 font-bold text-white shadow-sm hover:bg-[#144737] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {purchaseSubmitting ? "Finalizing Trade..." : isUnderNegotiation ? "Under Negotiation" : "Confirm & Pay"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
