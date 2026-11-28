"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  FileText,
  FileCheck2,
  Receipt,
  Truck,
  Download,
  CheckCircle2,
  Clock,
  ShieldCheck,
  CreditCard,
  Upload,
  Search,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  X,
  Lock,
  ArrowRight,
  Split,
  Landmark,
} from "lucide-react";
import {
  OnPlatformPaymentMode,
  PurchaseOrderBundle,
  PurchaseOrderStatus,
} from "@/types/traceability";
import {
  downloadDeliveryNotePdf,
  downloadInvoicePdf,
  downloadPaymentReceiptPdf,
  downloadPurchaseOrderPdf,
} from "@/lib/tradePdfGenerator";
import { SignatureFieldState, SignaturePadField } from "./SignaturePadField";

interface PurchaseOrderPipelineViewProps {
  orders: PurchaseOrderBundle[];
  currentUserId: string;
  currentUserName?: string;
  loading: boolean;
  error: string | null;
  getAuthToken: () => Promise<string | null>;
  onRefresh: () => Promise<void> | void;
}

const STATUS_META: Record<
  PurchaseOrderStatus,
  { label: string; stepIndex: number; toneClass: string }
> = {
  po_submitted: {
    label: "Awaiting Seller Signature",
    stepIndex: 1,
    toneClass: "bg-amber-50 text-amber-800 border border-amber-300",
  },
  invoice_issued: {
    label: "Invoice Ready • Awaiting Buyer Payment",
    stepIndex: 2,
    toneClass: "bg-blue-50 text-blue-800 border border-blue-200",
  },
  off_platform_paid_pending_seller: {
    label: "Receipt Uploaded • Awaiting Seller Confirmation",
    stepIndex: 2,
    toneClass: "bg-amber-50 text-amber-800 border border-amber-300",
  },
  transfer_fee_pending: {
    label: "Transfer Initialized • Pay 0.5% Fee",
    stepIndex: 3,
    toneClass: "bg-purple-50 text-purple-800 border border-purple-200",
  },
  delivery_initialized: {
    label: "Transfer Done • Awaiting Delivery Confirmation",
    stepIndex: 3,
    toneClass: "bg-[#edf7e8] text-[#1d6a45] border border-[#cdebc2]",
  },
  completed: {
    label: "Delivered & Trade Closed",
    stepIndex: 4,
    toneClass: "bg-[#0b3528] text-white border border-[#0b3528]",
  },
  cancelled: {
    label: "Cancelled",
    stepIndex: 0,
    toneClass: "bg-red-50 text-red-700 border border-red-200",
  },
};

export function PurchaseOrderPipelineView({
  orders,
  currentUserId,
  currentUserName = "",
  loading,
  error,
  getAuthToken,
  onRefresh,
}: PurchaseOrderPipelineViewProps) {
  const [roleFilter, setRoleFilter] = useState<"all" | "buyer" | "seller">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [busyPdfKey, setBusyPdfKey] = useState<string | null>(null);
  const [bannerMessage, setBannerMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Modal 1: Seller Signs & Confirms PO
  const [sellerConfirmBundle, setSellerConfirmBundle] = useState<PurchaseOrderBundle | null>(null);
  const [sellerSig, setSellerSig] = useState<SignatureFieldState>({
    signerName: currentUserName,
    signerTitle: "",
    signatureFile: null,
    previewUrl: null,
  });
  const [sellerBankInstructions, setSellerBankInstructions] = useState("");
  const [sellerNotes, setSellerNotes] = useState("");
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Modal 2: Buyer Views Invoice & Chooses Payment (On-Platform vs Off-Platform)
  const [buyerPayBundle, setBuyerPayBundle] = useState<PurchaseOrderBundle | null>(null);
  const [payChannelTab, setPayChannelTab] = useState<"on_platform" | "off_platform">("on_platform");
  const [onPlatformMode, setOnPlatformMode] = useState<OnPlatformPaymentMode>("platform_escrow");
  const [offPlatformFile, setOffPlatformFile] = useState<File | null>(null);
  const [offPlatformMethod, setOffPlatformMethod] = useState("Bank Transfer");
  const [offPlatformRefNote, setOffPlatformRefNote] = useState("");

  // Modal 3: Seller Reviews Off-Platform Receipt & Initializes Transfer + Delivery Note
  const [sellerReceiptBundle, setSellerReceiptBundle] = useState<PurchaseOrderBundle | null>(null);
  const [sellerDeliveryNotes, setSellerDeliveryNotes] = useState("");

  // Modal 4: Buyer Confirms Delivery & Closes Trade
  const [buyerDeliveryBundle, setBuyerDeliveryBundle] = useState<PurchaseOrderBundle | null>(null);
  const [buyerDeliveryNotes, setBuyerDeliveryNotes] = useState("");

  // Direct 0.5% transfer fee loading tracker
  const [payingTransferFeePoId, setPayingTransferFeePoId] = useState<string | null>(null);

  const filteredOrders = useMemo(() => {
    return orders.filter((b) => {
      const po = b.purchaseOrder;
      if (roleFilter === "buyer" && po.buyerId !== currentUserId) return false;
      if (roleFilter === "seller" && po.sellerId !== currentUserId) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hay = [
          po.poNumber,
          po.invoiceNumber,
          po.deliveryNoteNumber,
          po.listingTitle,
          po.lotId,
          po.buyerLetterhead?.companyName,
          po.sellerContactName,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [orders, roleFilter, searchQuery, currentUserId]);

  const uploadTradeFile = async (
    file: File,
    kind: "signature" | "receipt",
    token: string
  ): Promise<{ secureUrl: string; publicId: string; fileName: string; mimeType: string }> => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", kind);
    const res = await fetch("/api/upload/trade-document", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    const data = await res.json();
    if (!res.ok || !data?.success || !data?.asset?.secureUrl) {
      throw new Error(data?.error || `Failed to upload ${kind} file.`);
    }
    return {
      secureUrl: data.asset.secureUrl,
      publicId: data.asset.publicId,
      fileName: data.fileName || file.name,
      mimeType: data.mimeType || file.type,
    };
  };

  const runPdfDownload = async (key: string, fn: () => Promise<void>) => {
    setBusyPdfKey(key);
    try {
      await fn();
    } catch (err: unknown) {
      setBannerMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Could not generate PDF document.",
      });
    } finally {
      setBusyPdfKey(null);
    }
  };

  // 1. Seller Signs & Confirms PO -> Auto-Invoice
  const handleSellerConfirmPo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sellerConfirmBundle) return;
    setModalError(null);

    if (!sellerSig.signerName.trim()) {
      setModalError("Please enter your authorized signer name.");
      return;
    }
    if (!sellerSig.signatureFile) {
      setModalError("Please draw or upload your signature before confirming.");
      return;
    }

    setModalSubmitting(true);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Authentication required.");

      const uploadedSig = await uploadTradeFile(sellerSig.signatureFile, "signature", token);

      const res = await fetch(
        `/api/marketplace/purchase-orders/${sellerConfirmBundle.purchaseOrder.poId}/confirm`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            sellerSignature: {
              signerName: sellerSig.signerName.trim(),
              signerTitle: sellerSig.signerTitle.trim() || undefined,
              signatureImageUrl: uploadedSig.secureUrl,
              signaturePublicId: uploadedSig.publicId,
            },
            sellerBankInstructions: sellerBankInstructions.trim() || undefined,
            sellerNotes: sellerNotes.trim() || undefined,
          }),
        }
      );

      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Failed to confirm Purchase Order.");
      }

      setSellerConfirmBundle(null);
      setSellerBankInstructions("");
      setSellerNotes("");
      setBannerMessage({
        type: "success",
        text: `Purchase Order signed! Commercial Invoice ${data.invoice?.invoiceNumber || ""} has been generated for the buyer.`,
      });
      await onRefresh();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : "Could not confirm Purchase Order.");
    } finally {
      setModalSubmitting(false);
    }
  };

  // 2A. Buyer Pays On-Platform (1.5% Escrow or Direct Split)
  const handlePayOnPlatform = async () => {
    if (!buyerPayBundle) return;
    setModalError(null);
    setModalSubmitting(true);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Authentication required.");

      const res = await fetch(
        `/api/marketplace/purchase-orders/${buyerPayBundle.purchaseOrder.poId}/pay-on-platform`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            onPlatformMode,
          }),
        }
      );

      const data = await res.json();
      if (!res.ok || !data?.success || !data?.checkoutUrl) {
        throw new Error(data?.error || "Could not initialize Flutterwave checkout.");
      }

      window.location.href = data.checkoutUrl;
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : "On-platform checkout failed.");
      setModalSubmitting(false);
    }
  };

  // 2B. Buyer Uploads Off-Platform Receipt & Marks Paid
  const handleMarkOffPlatformPaid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!buyerPayBundle) return;
    setModalError(null);

    if (!offPlatformFile) {
      setModalError("Please upload your payment receipt (PNG, JPG, WEBP, or PDF).");
      return;
    }

    setModalSubmitting(true);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Authentication required.");

      const uploadedReceipt = await uploadTradeFile(offPlatformFile, "receipt", token);

      const res = await fetch(
        `/api/marketplace/purchase-orders/${buyerPayBundle.purchaseOrder.poId}/off-platform-paid`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            receiptUrl: uploadedReceipt.secureUrl,
            receiptPublicId: uploadedReceipt.publicId,
            fileName: uploadedReceipt.fileName,
            mimeType: uploadedReceipt.mimeType,
            paymentMethodNote: offPlatformMethod.trim() || "Bank Transfer / Off-Platform",
            paymentReferenceNote: offPlatformRefNote.trim() || undefined,
          }),
        }
      );

      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Failed to upload payment receipt.");
      }

      setBuyerPayBundle(null);
      setOffPlatformFile(null);
      setOffPlatformRefNote("");
      setBannerMessage({
        type: "success",
        text: "Payment receipt uploaded and marked as paid. Awaiting seller confirmation to initialize certificate transfer and delivery note.",
      });
      await onRefresh();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : "Failed to mark off-platform payment.");
    } finally {
      setModalSubmitting(false);
    }
  };

  // 3. Seller Confirms Off-Platform Payment & Initializes Transfer + Delivery Note
  const handleSellerConfirmOffPlatform = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sellerReceiptBundle) return;
    setModalError(null);
    setModalSubmitting(true);

    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Authentication required.");

      const res = await fetch(
        `/api/marketplace/purchase-orders/${sellerReceiptBundle.purchaseOrder.poId}/seller-confirm-off-platform`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            deliveryNotes: sellerDeliveryNotes.trim() || undefined,
          }),
        }
      );

      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Failed to confirm off-platform payment.");
      }

      setSellerReceiptBundle(null);
      setSellerDeliveryNotes("");
      setBannerMessage({
        type: "success",
        text: `Off-platform payment confirmed! Certificate transfer and Delivery Note ${data.deliveryNote?.deliveryNoteNumber || ""} initialized. The buyer can now pay the 0.5% transfer fee.`,
      });
      await onRefresh();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : "Could not confirm payment.");
    } finally {
      setModalSubmitting(false);
    }
  };

  // 4. Buyer Pays 0.5% Transfer Fee (Off-Platform Flow)
  const handlePayTransferFee = async (poId: string) => {
    setBannerMessage(null);
    setPayingTransferFeePoId(poId);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Authentication required.");

      const res = await fetch(`/api/marketplace/purchase-orders/${poId}/pay-transfer-fee`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });

      const data = await res.json();
      if (!res.ok || !data?.success || !data?.checkoutUrl) {
        throw new Error(data?.error || "Could not initialize 0.5% transfer fee checkout.");
      }

      window.location.href = data.checkoutUrl;
    } catch (err: unknown) {
      setBannerMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Could not start transfer fee payment.",
      });
      setPayingTransferFeePoId(null);
    }
  };

  // 5. Buyer Marks Delivery Successful -> Closes Trade & Restores Remaining Cocoa Balance
  const handleBuyerConfirmDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!buyerDeliveryBundle) return;
    setModalError(null);
    setModalSubmitting(true);

    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Authentication required.");

      const res = await fetch(
        `/api/marketplace/purchase-orders/${buyerDeliveryBundle.purchaseOrder.poId}/confirm-delivery`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            deliveryNotes: buyerDeliveryNotes.trim() || undefined,
          }),
        }
      );

      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Could not confirm delivery.");
      }

      const rem = Number(data.remainingListingQuantityKg || 0);
      setBuyerDeliveryBundle(null);
      setBuyerDeliveryNotes("");
      setBannerMessage({
        type: "success",
        text:
          rem > 0
            ? `Delivery marked successful & trade closed! Remaining ${rem.toLocaleString()} kg returned to Available on the marketplace.`
            : "Delivery marked successful & trade closed! The cocoa listing is now fully sold.",
      });
      await onRefresh();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : "Failed to confirm delivery.");
    } finally {
      setModalSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Feedback Banner */}
      {bannerMessage && (
        <div
          className={`flex items-start justify-between gap-3 rounded-2xl border p-4 text-xs font-medium ${
            bannerMessage.type === "success"
              ? "border-[#cdebc2] bg-[#edf7e8] text-[#1d5e2e]"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          <div className="flex items-start gap-2">
            {bannerMessage.type === "success" ? (
              <CheckCircle2 size={16} className="shrink-0 mt-0.5 text-[#2d6130]" />
            ) : (
              <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-600" />
            )}
            <span>{bannerMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setBannerMessage(null)}
            className="text-current opacity-60 hover:opacity-100 cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Filter & Search Bar */}
      <section className="rounded-[24px] border border-[#dfe7d8] bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ["all", `All Orders (${orders.length})`],
                [
                  "buyer",
                  `As Buyer (${orders.filter((o) => o.purchaseOrder.buyerId === currentUserId).length})`,
                ],
                [
                  "seller",
                  `As Seller (${orders.filter((o) => o.purchaseOrder.sellerId === currentUserId).length})`,
                ],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setRoleFilter(val)}
                className={`rounded-full px-4 py-2 text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                  roleFilter === val
                    ? "bg-[#0b3528] text-white"
                    : "bg-[#f1f4ec] text-[#57655d] hover:bg-[#e4ebd9]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-1 max-w-md items-center gap-2">
            <div className="relative flex-1">
              <Search
                size={15}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#79887e]"
              />
              <input
                type="text"
                placeholder="Search PO, invoice, lot, or buyer company..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-full border border-[#dfe7d8] bg-[#f7f8f3] py-2 pl-9 pr-4 text-xs font-medium text-[#10251d] outline-none focus:border-[#2d6130] focus:bg-white"
              />
            </div>

            <button
              type="button"
              onClick={() => onRefresh()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#dfe7d8] bg-[#f8f9f3] px-3.5 py-2 text-xs font-bold text-[#2d6130] hover:bg-[#edf2ea] disabled:opacity-50 cursor-pointer whitespace-nowrap"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </div>
      </section>

      {/* Main Orders List */}
      {loading && orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[32px] border border-[#dfe7d8] bg-white p-16 text-center shadow-sm">
          <RefreshCw size={36} className="animate-spin text-[#2d6130]" />
          <h3 className="mt-4 text-base font-bold text-[#10251d]">Loading Purchase Orders...</h3>
        </div>
      ) : error ? (
        <div className="rounded-[28px] border border-red-200 bg-red-50 p-6 text-red-800 text-xs">
          <div className="font-bold text-sm flex items-center gap-2">
            <AlertCircle size={18} /> Error Loading Purchase Orders
          </div>
          <p className="mt-1">{error}</p>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[32px] border border-[#dfe7d8] bg-white p-14 text-center shadow-sm">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#f1f6ec] text-[#2d6130]">
            <FileText size={28} />
          </div>
          <h3 className="mt-4 text-lg font-bold text-[#10251d]">No purchase orders yet</h3>
          <p className="mt-1.5 max-w-md text-xs text-[#57655d] leading-relaxed">
            After paying for seller info on any marketplace cocoa listing, generate a signed
            Purchase Order to kick off automatic invoicing, on-platform or off-platform settlement,
            certificate custody transfer, and delivery confirmation.
          </p>
          <Link
            href="/marketplace"
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#0b3528] px-6 py-2.5 text-xs font-bold text-white hover:bg-[#144737]"
          >
            Browse Cocoa Marketplace <ArrowRight size={14} />
          </Link>
        </div>
      ) : (
        <div className="space-y-5">
          {filteredOrders.map((bundle) => {
            const { purchaseOrder: po, invoice, deliveryNote } = bundle;
            const isBuyer = po.buyerId === currentUserId;
            const isSeller = po.sellerId === currentUserId;
            const meta = STATUS_META[po.status] || STATUS_META.po_submitted;

            // Stage-gated PDF unlock checks (unlocked as soon as that stage has passed / confirmed)
            const canDownloadPoPdf = true; // Buyer confirmed & generated Stage 1
            const poIsSignedByBoth = Boolean(po.sellerConfirmedAt);
            const canDownloadInvoicePdf = Boolean(invoice && po.sellerConfirmedAt);
            const canDownloadOnPlatformReceiptPdf = Boolean(
              po.paymentChannel === "on_platform" &&
                (po.status === "delivery_initialized" || po.status === "completed") &&
                po.onPlatformPaidAt
            );
            const canDownloadOffPlatformReceiptPdf = Boolean(
              po.paymentChannel === "off_platform" &&
                po.offPlatformReceipt?.confirmedBySellerAt &&
                (po.status === "transfer_fee_pending" ||
                  po.status === "delivery_initialized" ||
                  po.status === "completed")
            );
            const canDownloadTransferFeeReceiptPdf = Boolean(
              po.paymentChannel === "off_platform" &&
                po.transferFeePaidAt &&
                (po.status === "delivery_initialized" || po.status === "completed")
            );
            const canDownloadDeliveryNotePdf = Boolean(
              deliveryNote &&
                (po.status === "transfer_fee_pending" ||
                  po.status === "delivery_initialized" ||
                  po.status === "completed")
            );

            const steps = [
              { num: 1, title: "Purchase Order", done: meta.stepIndex >= 1 },
              { num: 2, title: "Signed & Invoiced", done: meta.stepIndex >= 2 },
              { num: 3, title: "Payment & Transfer", done: meta.stepIndex >= 3 },
              { num: 4, title: "Delivery & Closed", done: meta.stepIndex >= 4 },
            ];

            return (
              <article
                key={po.poId}
                className="rounded-[28px] border border-[#dfe7d8] bg-white p-5 sm:p-6 shadow-sm space-y-5"
              >
                {/* Top Summary Header */}
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-[#0b3528] bg-[#f0f4ec] px-2.5 py-0.5 rounded-md">
                        {po.poNumber}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                          isBuyer
                            ? "bg-[#e8effd] text-[#1e4bb5]"
                            : "bg-[#f4eee2] text-[#7a5216]"
                        }`}
                      >
                        {isBuyer ? "You are Buyer" : "You are Seller"}
                      </span>
                      <span className={`rounded-full px-3 py-0.5 text-[11px] font-bold ${meta.toneClass}`}>
                        {meta.label}
                      </span>
                      {po.paymentChannel && (
                        <span className="rounded-full border border-[#dfe7d8] bg-[#fafcf9] px-2.5 py-0.5 text-[11px] font-semibold text-[#394a41]">
                          {po.paymentChannel === "on_platform"
                            ? po.onPlatformMode === "direct_split"
                              ? "On-Platform • Direct Split (1.5%)"
                              : "On-Platform • Escrow (1.5%)"
                            : "Off-Platform • 0.5% Transfer Fee"}
                        </span>
                      )}
                    </div>

                    <h3 className="text-lg font-bold text-[#10251d]">{po.listingTitle}</h3>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#57655d]">
                      <span>
                        Buyer:{" "}
                        <strong className="text-[#10251d]">
                          {po.buyerLetterhead.companyName}
                        </strong>{" "}
                        <span className="font-mono text-[11px]">
                          ({po.buyerLetterhead.businessRegistrationNumber})
                        </span>
                      </span>
                      <span>
                        Seller: <strong className="text-[#10251d]">{po.sellerContactName}</strong>
                      </span>
                      <span className="font-mono text-[11px]">Lot: {po.lotId}</span>
                    </div>
                  </div>

                  {/* Commercial Totals */}
                  <div className="flex flex-wrap sm:flex-nowrap items-center gap-4 rounded-2xl border border-[#edf1ea] bg-[#f8f9f3] px-4 py-3 text-xs tabular-nums">
                    <div>
                      <span className="block text-[10px] uppercase font-bold text-[#627064]">
                        Quantity
                      </span>
                      <strong className="text-sm font-bold text-[#10251d]">
                        {po.quantityKg.toLocaleString()} kg
                      </strong>
                    </div>
                    <div className="h-7 w-px bg-[#dfe7d8]" />
                    <div>
                      <span className="block text-[10px] uppercase font-bold text-[#627064]">
                        Unit Price
                      </span>
                      <strong className="text-sm font-bold text-[#10251d]">
                        {po.unitPricePerKg.toLocaleString()} {po.currency}
                      </strong>
                    </div>
                    <div className="h-7 w-px bg-[#dfe7d8]" />
                    <div>
                      <span className="block text-[10px] uppercase font-bold text-[#627064]">
                        Purchase Price
                      </span>
                      <strong className="text-base font-extrabold text-[#2d6130]">
                        {po.purchasePrice.toLocaleString()} {po.currency}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* 4-Stage Visual Stepper */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {steps.map((s) => (
                    <div
                      key={s.num}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${
                        s.done
                          ? "border-[#cdebc2] bg-[#edf7e8] text-[#1d5e2e]"
                          : "border-[#edf1ea] bg-[#fafbf8] text-[#7c8a80]"
                      }`}
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                          s.done
                            ? "bg-[#2d6130] text-white"
                            : "bg-[#e5ebe1] text-[#6d7c71]"
                        }`}
                      >
                        {s.done ? "✓" : s.num}
                      </span>
                      <span className="truncate">{s.title}</span>
                    </div>
                  ))}
                </div>

                {/* Stage-Gated PDF Downloads Bar */}
                <div className="rounded-2xl border border-[#edf1ea] bg-[#fafcf9] p-3.5">
                  <div className="mb-2 flex items-center justify-between text-[11px]">
                    <span className="font-bold uppercase tracking-wider text-[#57655d]">
                      Stage-Verified Trade Documents (PDF)
                    </span>
                    <span className="text-[#728277]">
                      Unlocks automatically as each stage is confirmed
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {/* 1. Purchase Order PDF */}
                    <button
                      type="button"
                      disabled={!canDownloadPoPdf || busyPdfKey === `po-${po.poId}`}
                      onClick={() =>
                        runPdfDownload(`po-${po.poId}`, () => downloadPurchaseOrderPdf(po))
                      }
                      className="inline-flex items-center gap-1.5 rounded-full border border-[#2d6130] bg-white px-3.5 py-1.5 text-xs font-bold text-[#1d5e2e] hover:bg-[#edf7e8] transition cursor-pointer whitespace-nowrap disabled:opacity-50"
                    >
                      <Download size={13} />
                      {busyPdfKey === `po-${po.poId}`
                        ? "Preparing..."
                        : poIsSignedByBoth
                        ? "Signed PO PDF"
                        : "Purchase Order PDF"}
                    </button>

                    {/* 2. Commercial Invoice PDF */}
                    {canDownloadInvoicePdf && invoice ? (
                      <button
                        type="button"
                        disabled={busyPdfKey === `inv-${po.poId}`}
                        onClick={() =>
                          runPdfDownload(`inv-${po.poId}`, () => downloadInvoicePdf(po, invoice))
                        }
                        className="inline-flex items-center gap-1.5 rounded-full border border-[#2d6130] bg-white px-3.5 py-1.5 text-xs font-bold text-[#1d5e2e] hover:bg-[#edf7e8] transition cursor-pointer whitespace-nowrap disabled:opacity-50"
                      >
                        <Download size={13} />
                        {busyPdfKey === `inv-${po.poId}`
                          ? "Preparing..."
                          : `Invoice PDF (${invoice.invoiceNumber})`}
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e5ebe1] bg-[#f4f6f2] px-3 py-1.5 text-[11px] font-medium text-[#8a988e]">
                        <Lock size={11} /> Invoice PDF (after seller signs PO)
                      </span>
                    )}

                    {/* 3A. On-Platform Payment Receipt PDF */}
                    {canDownloadOnPlatformReceiptPdf && (
                      <button
                        type="button"
                        disabled={busyPdfKey === `rcp-on-${po.poId}`}
                        onClick={() =>
                          runPdfDownload(`rcp-on-${po.poId}`, () =>
                            downloadPaymentReceiptPdf(po, invoice, "on_platform")
                          )
                        }
                        className="inline-flex items-center gap-1.5 rounded-full border border-[#2d6130] bg-white px-3.5 py-1.5 text-xs font-bold text-[#1d5e2e] hover:bg-[#edf7e8] transition cursor-pointer whitespace-nowrap disabled:opacity-50"
                      >
                        <Receipt size={13} />
                        {busyPdfKey === `rcp-on-${po.poId}`
                          ? "Preparing..."
                          : "Payment Receipt PDF (1.5% Incl.)"}
                      </button>
                    )}

                    {/* 3B. Off-Platform Cocoa Payment Receipt PDF (available once seller confirms) */}
                    {canDownloadOffPlatformReceiptPdf && (
                      <button
                        type="button"
                        disabled={busyPdfKey === `rcp-off-${po.poId}`}
                        onClick={() =>
                          runPdfDownload(`rcp-off-${po.poId}`, () =>
                            downloadPaymentReceiptPdf(po, invoice, "off_platform")
                          )
                        }
                        className="inline-flex items-center gap-1.5 rounded-full border border-[#2d6130] bg-white px-3.5 py-1.5 text-xs font-bold text-[#1d5e2e] hover:bg-[#edf7e8] transition cursor-pointer whitespace-nowrap disabled:opacity-50"
                      >
                        <Receipt size={13} />
                        {busyPdfKey === `rcp-off-${po.poId}`
                          ? "Preparing..."
                          : "Confirmed Payment Receipt PDF"}
                      </button>
                    )}

                    {/* 3C. Off-Platform 0.5% Transfer Fee Receipt PDF */}
                    {canDownloadTransferFeeReceiptPdf && (
                      <button
                        type="button"
                        disabled={busyPdfKey === `rcp-trf-${po.poId}`}
                        onClick={() =>
                          runPdfDownload(`rcp-trf-${po.poId}`, () =>
                            downloadPaymentReceiptPdf(po, invoice, "transfer_fee")
                          )
                        }
                        className="inline-flex items-center gap-1.5 rounded-full border border-[#2d6130] bg-white px-3.5 py-1.5 text-xs font-bold text-[#1d5e2e] hover:bg-[#edf7e8] transition cursor-pointer whitespace-nowrap disabled:opacity-50"
                      >
                        <Receipt size={13} />
                        {busyPdfKey === `rcp-trf-${po.poId}`
                          ? "Preparing..."
                          : "0.5% Transfer Fee Receipt PDF"}
                      </button>
                    )}

                    {/* 4. Delivery Note PDF */}
                    {canDownloadDeliveryNotePdf && deliveryNote && (
                      <button
                        type="button"
                        disabled={busyPdfKey === `dn-${po.poId}`}
                        onClick={() =>
                          runPdfDownload(`dn-${po.poId}`, () =>
                            downloadDeliveryNotePdf(po, deliveryNote)
                          )
                        }
                        className="inline-flex items-center gap-1.5 rounded-full border border-[#2d6130] bg-white px-3.5 py-1.5 text-xs font-bold text-[#1d5e2e] hover:bg-[#edf7e8] transition cursor-pointer whitespace-nowrap disabled:opacity-50"
                      >
                        <Truck size={13} />
                        {busyPdfKey === `dn-${po.poId}`
                          ? "Preparing..."
                          : `Delivery Note PDF (${deliveryNote.deliveryNoteNumber})`}
                      </button>
                    )}
                  </div>
                </div>

                {/* Contextual Role Action Footer */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-[#edf1ea] pt-4">
                  <div className="text-xs text-[#57655d]">
                    {po.status === "po_submitted" && isSeller && (
                      <span className="font-semibold text-amber-800">
                        Action Required: Review the buyer&apos;s Purchase Order, sign it, and
                        confirm to automatically issue the Commercial Invoice.
                      </span>
                    )}
                    {po.status === "po_submitted" && isBuyer && (
                      <span className="inline-flex items-center gap-1.5">
                        <Clock size={14} className="text-amber-600" />
                        Waiting for seller to view, sign, and confirm your Purchase Order.
                      </span>
                    )}
                    {po.status === "invoice_issued" && isBuyer && (
                      <span className="font-semibold text-blue-800">
                        Action Required: Commercial Invoice {po.invoiceNumber} is ready. Choose to
                        pay on-platform (1.5% service fee) or off-platform.
                      </span>
                    )}
                    {po.status === "invoice_issued" && isSeller && (
                      <span className="inline-flex items-center gap-1.5">
                        <Clock size={14} className="text-blue-600" />
                        Invoice {po.invoiceNumber} sent. Waiting for buyer to select on-platform or
                        off-platform payment.
                      </span>
                    )}
                    {po.status === "off_platform_paid_pending_seller" && isSeller && (
                      <span className="font-semibold text-amber-800">
                        Action Required: Buyer uploaded an off-platform payment receipt. Verify the
                        receipt to confirm payment and initialize certificate transfer &amp; delivery note.
                      </span>
                    )}
                    {po.status === "off_platform_paid_pending_seller" && isBuyer && (
                      <span className="inline-flex items-center gap-1.5">
                        <Clock size={14} className="text-amber-600" />
                        Receipt uploaded. Waiting for seller to confirm payment and initialize
                        certificate transfer.
                      </span>
                    )}
                    {po.status === "transfer_fee_pending" && isBuyer && (
                      <span className="font-semibold text-purple-800">
                        Action Required: Seller confirmed payment &amp; initialized certificate
                        transfer. Pay the 0.5% transfer fee (
                        {(po.transferFeeAmount || invoice?.offPlatformTransferFeeAmount || 0).toLocaleString()}{" "}
                        {po.currency}) to execute the transfer.
                      </span>
                    )}
                    {po.status === "transfer_fee_pending" && isSeller && (
                      <span className="inline-flex items-center gap-1.5">
                        <Clock size={14} className="text-purple-600" />
                        Transfer initialized. Waiting for buyer to complete the 0.5% certificate
                        transfer fee.
                      </span>
                    )}
                    {po.status === "delivery_initialized" && isBuyer && (
                      <span className="font-semibold text-[#1d6a45]">
                        Action Required: Certificate transfer completed &amp; Delivery Note{" "}
                        {po.deliveryNoteNumber} is active. Mark delivery as successful once you
                        receive the cocoa.
                      </span>
                    )}
                    {po.status === "delivery_initialized" && isSeller && (
                      <span className="inline-flex items-center gap-1.5 text-[#2d6130] font-medium">
                        <Truck size={14} /> Certificate transferred &amp; Delivery Note active.
                        Waiting for buyer to mark delivery as successful.
                      </span>
                    )}
                    {po.status === "completed" && (
                      <span className="inline-flex items-center gap-1.5 font-semibold text-[#1d6a45]">
                        <CheckCircle2 size={14} /> Trade closed on{" "}
                        {po.completedAt ? new Date(po.completedAt).toLocaleDateString() : "Completed"}
                        {typeof deliveryNote?.remainingListingQuantityRestoredKg === "number" &&
                          deliveryNote.remainingListingQuantityRestoredKg > 0 && (
                            <span className="text-[#57655d] font-normal">
                              • {deliveryNote.remainingListingQuantityRestoredKg.toLocaleString()} kg
                              returned to marketplace
                            </span>
                          )}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {/* Seller Confirm PO */}
                    {po.status === "po_submitted" && isSeller && (
                      <button
                        type="button"
                        onClick={() => {
                          setModalError(null);
                          setSellerSig({
                            signerName: currentUserName || po.sellerContactName || "",
                            signerTitle: "",
                            signatureFile: null,
                            previewUrl: null,
                          });
                          setSellerConfirmBundle(bundle);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-full bg-[#0b3528] px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#144737] transition cursor-pointer whitespace-nowrap"
                      >
                        <FileCheck2 size={14} /> Review, Sign &amp; Confirm PO
                      </button>
                    )}

                    {/* Buyer View Invoice & Choose Payment */}
                    {po.status === "invoice_issued" && isBuyer && (
                      <button
                        type="button"
                        onClick={() => {
                          setModalError(null);
                          setPayChannelTab("on_platform");
                          setOnPlatformMode("platform_escrow");
                          setOffPlatformFile(null);
                          setOffPlatformRefNote("");
                          setBuyerPayBundle(bundle);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-full bg-[#0b3528] px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#144737] transition cursor-pointer whitespace-nowrap"
                      >
                        <CreditCard size={14} /> View Invoice &amp; Pay
                      </button>
                    )}

                    {/* Seller Verify Off-Platform Receipt */}
                    {po.status === "off_platform_paid_pending_seller" && isSeller && (
                      <button
                        type="button"
                        onClick={() => {
                          setModalError(null);
                          setSellerDeliveryNotes("");
                          setSellerReceiptBundle(bundle);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-full bg-[#0b3528] px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#144737] transition cursor-pointer whitespace-nowrap"
                      >
                        <ShieldCheck size={14} /> Verify Receipt &amp; Initialize Transfer
                      </button>
                    )}

                    {/* Buyer Pay 0.5% Certificate Transfer Fee */}
                    {po.status === "transfer_fee_pending" && isBuyer && (
                      <button
                        type="button"
                        disabled={payingTransferFeePoId === po.poId}
                        onClick={() => handlePayTransferFee(po.poId)}
                        className="inline-flex items-center gap-1.5 rounded-full bg-[#0b3528] px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#144737] transition cursor-pointer whitespace-nowrap disabled:opacity-50"
                      >
                        <CreditCard size={14} />
                        {payingTransferFeePoId === po.poId
                          ? "Launching Checkout..."
                          : `Pay 0.5% Transfer Fee (${(
                              po.transferFeeAmount ||
                              invoice?.offPlatformTransferFeeAmount ||
                              0
                            ).toLocaleString()} ${po.currency})`}
                      </button>
                    )}

                    {/* Buyer Mark Delivery Successful */}
                    {po.status === "delivery_initialized" && isBuyer && (
                      <button
                        type="button"
                        onClick={() => {
                          setModalError(null);
                          setBuyerDeliveryNotes("");
                          setBuyerDeliveryBundle(bundle);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-full bg-[#0b3528] px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#144737] transition cursor-pointer whitespace-nowrap"
                      >
                        <CheckCircle2 size={14} /> Mark Delivery as Successful
                      </button>
                    )}

                    <Link
                      href={`/product/${po.listingId}`}
                      className="inline-flex items-center gap-1 rounded-full border border-[#dfe7d8] bg-white px-3.5 py-2 text-xs font-bold text-[#10251d] hover:bg-[#f1f5ee] whitespace-nowrap"
                    >
                      Listing <ExternalLink size={12} />
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 1: SELLER REVIEW, SIGN & CONFIRM PO -> AUTO-GENERATES INVOICE   */}
      {/* ===================================================================== */}
      {sellerConfirmBundle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="relative my-8 w-full max-w-2xl rounded-[32px] border border-[#dfe7d8] bg-white p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setSellerConfirmBundle(null)}
              className="absolute right-5 top-5 rounded-full p-2 text-gray-400 hover:bg-gray-100 cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="text-xs font-bold uppercase tracking-wider text-[#2d6130] flex items-center gap-1.5">
              <FileCheck2 size={14} /> Seller Confirmation • Auto-Invoice Generation
            </div>
            <h2 className="mt-1 text-2xl font-bold text-[#10251d]">
              Review &amp; Sign Purchase Order {sellerConfirmBundle.purchaseOrder.poNumber}
            </h2>

            {/* Buyer Letterhead Preview Card */}
            <div className="mt-4 rounded-2xl border border-[#dfe7d8] bg-[#f8f9f3] p-4 space-y-3 text-xs">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  {sellerConfirmBundle.purchaseOrder.buyerLetterhead.logoUrl && (
                    <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded-lg border border-[#dfe7d8] bg-white p-1">
                      <Image
                        src={sellerConfirmBundle.purchaseOrder.buyerLetterhead.logoUrl}
                        alt="Buyer letterhead logo"
                        fill
                        className="object-contain"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  )}
                  <div>
                    <div className="font-bold text-sm text-[#10251d]">
                      {sellerConfirmBundle.purchaseOrder.buyerLetterhead.companyName}
                    </div>
                    <div className="text-[#57655d]">
                      {sellerConfirmBundle.purchaseOrder.buyerLetterhead.address}
                    </div>
                    <div className="font-mono text-[11px] text-[#2d6130]">
                      Reg No: {sellerConfirmBundle.purchaseOrder.buyerLetterhead.businessRegistrationNumber}
                    </div>
                  </div>
                </div>
                <div className="text-right tabular-nums">
                  <div className="text-[10px] uppercase font-bold text-gray-500">Purchase Price</div>
                  <div className="text-lg font-extrabold text-[#2d6130]">
                    {sellerConfirmBundle.purchaseOrder.purchasePrice.toLocaleString()}{" "}
                    {sellerConfirmBundle.purchaseOrder.currency}
                  </div>
                  <div className="text-[11px] text-gray-600">
                    {sellerConfirmBundle.purchaseOrder.quantityKg.toLocaleString()} kg ×{" "}
                    {sellerConfirmBundle.purchaseOrder.unitPricePerKg.toLocaleString()}{" "}
                    {sellerConfirmBundle.purchaseOrder.currency}/kg
                  </div>
                </div>
              </div>

              {sellerConfirmBundle.purchaseOrder.buyerSignature?.signatureImageUrl && (
                <div className="flex items-center justify-between border-t border-[#dfe7d8] pt-3">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-gray-500 block">
                      Buyer Authorized Signature
                    </span>
                    <strong className="text-[#10251d]">
                      {sellerConfirmBundle.purchaseOrder.buyerSignature.signerName}
                    </strong>
                    {sellerConfirmBundle.purchaseOrder.buyerSignature.signerTitle && (
                      <span className="text-gray-500">
                        {" "}
                        • {sellerConfirmBundle.purchaseOrder.buyerSignature.signerTitle}
                      </span>
                    )}
                  </div>
                  <div className="relative h-12 w-32 rounded-lg border border-[#dfe7d8] bg-white p-1">
                    <Image
                      src={sellerConfirmBundle.purchaseOrder.buyerSignature.signatureImageUrl}
                      alt="Buyer signature"
                      fill
                      className="object-contain"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                </div>
              )}

              {sellerConfirmBundle.purchaseOrder.notes && (
                <div className="rounded-xl bg-white p-2.5 text-[#394a41] border border-[#edf1ea]">
                  <strong className="block text-[10px] uppercase text-gray-500">Buyer Notes</strong>
                  {sellerConfirmBundle.purchaseOrder.notes}
                </div>
              )}
            </div>

            {modalError && (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 flex items-start gap-2">
                <AlertCircle size={15} className="shrink-0 mt-0.5" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleSellerConfirmPo} className="mt-5 space-y-4 text-xs">
              <SignaturePadField
                label="Seller Authorized Signature *"
                value={sellerSig}
                onChange={setSellerSig}
                signerNamePlaceholder="Your full name or company representative"
              />

              <div>
                <label className="block font-semibold text-[#10251d] mb-1">
                  Bank / Off-Platform Payment Instructions (Optional)
                </label>
                <textarea
                  rows={2}
                  value={sellerBankInstructions}
                  onChange={(e) => setSellerBankInstructions(e.target.value)}
                  placeholder="Account name, bank / mobile money number, SWIFT/IBAN (shown on the generated Invoice if buyer pays off-platform)"
                  className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 text-xs outline-none focus:border-[#2d6130] focus:bg-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#10251d] mb-1">
                  Seller Notes (Optional)
                </label>
                <input
                  type="text"
                  value={sellerNotes}
                  onChange={(e) => setSellerNotes(e.target.value)}
                  placeholder="Optional pickup/dispatch schedule confirmation"
                  className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] px-3 py-2 text-xs outline-none focus:border-[#2d6130] focus:bg-white"
                />
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-[#edf1ea] pt-4">
                <button
                  type="button"
                  onClick={() => setSellerConfirmBundle(null)}
                  className="rounded-full px-5 py-2.5 font-bold text-gray-500 hover:bg-gray-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  className="inline-flex items-center gap-2 rounded-full bg-[#0b3528] px-6 py-2.5 font-bold text-white shadow-sm hover:bg-[#144737] disabled:opacity-50 cursor-pointer whitespace-nowrap"
                >
                  <FileCheck2 size={14} />
                  {modalSubmitting
                    ? "Signing & Generating Invoice..."
                    : "Sign PO & Generate Invoice"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 2: BUYER VIEW INVOICE & CHOOSE ON-PLATFORM OR OFF-PLATFORM PAY  */}
      {/* ===================================================================== */}
      {buyerPayBundle && buyerPayBundle.invoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="relative my-8 w-full max-w-2xl rounded-[32px] border border-[#dfe7d8] bg-white p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setBuyerPayBundle(null)}
              className="absolute right-5 top-5 rounded-full p-2 text-gray-400 hover:bg-gray-100 cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="flex flex-wrap items-center justify-between gap-2 pr-8">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-[#2d6130] flex items-center gap-1.5">
                  <Receipt size={14} /> Commercial Invoice {buyerPayBundle.invoice.invoiceNumber}
                </div>
                <h2 className="mt-1 text-2xl font-bold text-[#10251d]">Choose Payment Method</h2>
              </div>

              <button
                type="button"
                onClick={() =>
                  runPdfDownload(`modal-inv-${buyerPayBundle.purchaseOrder.poId}`, () =>
                    downloadInvoicePdf(buyerPayBundle.purchaseOrder, buyerPayBundle.invoice!)
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-full border border-[#2d6130] bg-[#edf7e8] px-4 py-2 text-xs font-bold text-[#1d5e2e] hover:bg-[#dff1d6] cursor-pointer whitespace-nowrap"
              >
                <Download size={13} /> Download Invoice PDF
              </button>
            </div>

            {/* Invoice Summary */}
            <div className="mt-4 rounded-2xl border border-[#dfe7d8] bg-[#f8f9f3] p-4 text-xs space-y-1.5 tabular-nums">
              <div className="flex justify-between">
                <span className="text-gray-500">Purchase Order:</span>
                <strong className="font-mono text-[#10251d]">
                  {buyerPayBundle.purchaseOrder.poNumber}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Agreed Cocoa Quantity:</span>
                <strong className="text-[#10251d]">
                  {buyerPayBundle.invoice.quantityKg.toLocaleString()} kg @{" "}
                  {buyerPayBundle.invoice.unitPricePerKg.toLocaleString()}{" "}
                  {buyerPayBundle.invoice.currency}/kg
                </strong>
              </div>
              <div className="flex justify-between border-t border-[#dfe7d8] pt-2 text-sm font-bold text-[#10251d]">
                <span>Invoice Purchase Price:</span>
                <span>
                  {buyerPayBundle.invoice.purchasePrice.toLocaleString()}{" "}
                  {buyerPayBundle.invoice.currency}
                </span>
              </div>
            </div>

            {/* Payment Channel Toggle */}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setPayChannelTab("on_platform");
                  setModalError(null);
                }}
                className={`rounded-2xl border p-3.5 text-left transition cursor-pointer ${
                  payChannelTab === "on_platform"
                    ? "border-[#0b3528] bg-[#edf7e8] ring-1 ring-[#0b3528]"
                    : "border-[#dfe7d8] bg-white hover:bg-[#f8f9f3]"
                }`}
              >
                <div className="flex items-center gap-2 text-xs font-bold text-[#10251d]">
                  <CreditCard size={15} className="text-[#2d6130]" /> Pay On-Platform
                </div>
                <p className="mt-1 text-[11px] text-[#57655d]">
                  1.5% service fee • Escrow or Direct Split • Automatic certificate transfer &amp;
                  delivery note
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPayChannelTab("off_platform");
                  setModalError(null);
                }}
                className={`rounded-2xl border p-3.5 text-left transition cursor-pointer ${
                  payChannelTab === "off_platform"
                    ? "border-[#0b3528] bg-[#edf7e8] ring-1 ring-[#0b3528]"
                    : "border-[#dfe7d8] bg-white hover:bg-[#f8f9f3]"
                }`}
              >
                <div className="flex items-center gap-2 text-xs font-bold text-[#10251d]">
                  <Landmark size={15} className="text-[#2d6130]" /> Pay Off-Platform
                </div>
                <p className="mt-1 text-[11px] text-[#57655d]">
                  Upload payment receipt • Seller confirms &amp; initializes transfer • Pay 0.5%
                  transfer fee later
                </p>
              </button>
            </div>

            {modalError && (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 flex items-start gap-2">
                <AlertCircle size={15} className="shrink-0 mt-0.5" />
                <span>{modalError}</span>
              </div>
            )}

            {payChannelTab === "on_platform" ? (
              <div className="mt-5 space-y-4 text-xs">
                <div className="space-y-2.5">
                  <span className="block font-bold text-[#10251d]">
                    Select On-Platform Settlement Option:
                  </span>

                  {/* Option 1: Platform Escrow */}
                  <label
                    className={`flex items-start gap-3 rounded-2xl border p-3.5 cursor-pointer transition ${
                      onPlatformMode === "platform_escrow"
                        ? "border-[#2d6130] bg-[#f4faf1]"
                        : "border-[#dfe7d8] bg-white"
                    }`}
                  >
                    <input
                      type="radio"
                      name="onPlatformMode"
                      checked={onPlatformMode === "platform_escrow"}
                      onChange={() => setOnPlatformMode("platform_escrow")}
                      className="mt-1 accent-[#0b3528]"
                    />
                    <div>
                      <div className="font-bold text-[#10251d] flex items-center gap-1.5">
                        <ShieldCheck size={14} className="text-[#2d6130]" />
                        Payment to TraceTradeNetwork Platform (Refund-Protected Escrow)
                      </div>
                      <p className="mt-0.5 text-[11px] text-[#57655d] leading-relaxed">
                        Funds are held safely by our platform so refunds can be processed if there
                        are cocoa quality issues or if negotiation falls through.
                      </p>
                    </div>
                  </label>

                  {/* Option 2: Direct to Seller with Split */}
                  <label
                    className={`flex items-start gap-3 rounded-2xl border p-3.5 cursor-pointer transition ${
                      onPlatformMode === "direct_split"
                        ? "border-[#2d6130] bg-[#f4faf1]"
                        : "border-[#dfe7d8] bg-white"
                    }`}
                  >
                    <input
                      type="radio"
                      name="onPlatformMode"
                      checked={onPlatformMode === "direct_split"}
                      onChange={() => setOnPlatformMode("direct_split")}
                      className="mt-1 accent-[#0b3528]"
                    />
                    <div>
                      <div className="font-bold text-[#10251d] flex items-center gap-1.5">
                        <Split size={14} className="text-[#2d6130]" />
                        Direct to Seller (1.5% Service Charge Auto-Split to Platform)
                      </div>
                      <p className="mt-0.5 text-[11px] text-[#57655d] leading-relaxed">
                        The cocoa purchase price settles directly to the seller while our 1.5%
                        platform service charge splits automatically to TraceTradeNetwork.
                      </p>
                    </div>
                  </label>
                </div>

                {/* Exact Fee Breakdown */}
                <div className="rounded-2xl border border-[#cdebc2] bg-[#edf7e8] p-4 space-y-1.5 tabular-nums">
                  <div className="flex justify-between text-[#394a41]">
                    <span>Cocoa Purchase Price:</span>
                    <span className="font-semibold">
                      {buyerPayBundle.invoice.purchasePrice.toLocaleString()}{" "}
                      {buyerPayBundle.invoice.currency}
                    </span>
                  </div>
                  <div className="flex justify-between text-[#394a41]">
                    <span>On-Platform Service Fee (1.5%):</span>
                    <span className="font-semibold">
                      {buyerPayBundle.invoice.onPlatformServiceFeeAmount.toLocaleString()}{" "}
                      {buyerPayBundle.invoice.currency}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-[#cbe6bf] pt-2 text-sm font-extrabold text-[#0b3528]">
                    <span>Total Payable via Flutterwave:</span>
                    <span>
                      {buyerPayBundle.invoice.onPlatformTotalAmount.toLocaleString()}{" "}
                      {buyerPayBundle.invoice.currency}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#355a3b] pt-1">
                    Immediately after payment is confirmed, certificate custody transfer executes
                    automatically and your Delivery Note is initialized.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setBuyerPayBundle(null)}
                    className="rounded-full px-5 py-2.5 font-bold text-gray-500 hover:bg-gray-100 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={modalSubmitting}
                    onClick={handlePayOnPlatform}
                    className="inline-flex items-center gap-2 rounded-full bg-[#0b3528] px-6 py-2.5 font-bold text-white shadow-sm hover:bg-[#144737] disabled:opacity-50 cursor-pointer whitespace-nowrap"
                  >
                    <CreditCard size={14} />
                    {modalSubmitting ? "Redirecting to Flutterwave..." : "Pay On-Platform via Flutterwave"}
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleMarkOffPlatformPaid} className="mt-5 space-y-4 text-xs">
                {buyerPayBundle.purchaseOrder.sellerBankInstructions && (
                  <div className="rounded-2xl border border-[#dfe7d8] bg-[#fafcf9] p-3.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#2d6130] block mb-1">
                      Seller Payment Instructions
                    </span>
                    <p className="text-[#10251d] whitespace-pre-line">
                      {buyerPayBundle.purchaseOrder.sellerBankInstructions}
                    </p>
                  </div>
                )}

                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-amber-900 text-[11px] leading-relaxed">
                  <strong>How Off-Platform Settlement Works:</strong> After paying the seller{" "}
                  <strong className="tabular-nums">
                    {buyerPayBundle.invoice.purchasePrice.toLocaleString()}{" "}
                    {buyerPayBundle.invoice.currency}
                  </strong>{" "}
                  directly, upload your payment receipt below. Once the seller confirms receipt and
                  initializes the certificate transfer &amp; delivery note, you will pay the{" "}
                  <strong>0.5% certificate transfer fee</strong> (
                  <span className="tabular-nums font-bold">
                    {buyerPayBundle.invoice.offPlatformTransferFeeAmount.toLocaleString()}{" "}
                    {buyerPayBundle.invoice.currency}
                  </span>
                  ) to complete the transfer.
                </div>

                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">
                    Upload Payment Receipt (PNG, JPG, WEBP, or PDF) *
                  </label>
                  <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-[#b6cab0] bg-[#fafcf9] p-5 text-center hover:bg-[#f1f6ec] transition">
                    <Upload size={20} className="text-[#2d6130]" />
                    <span className="mt-1.5 font-bold text-[#10251d]">
                      {offPlatformFile ? offPlatformFile.name : "Click to select payment receipt file"}
                    </span>
                    <span className="mt-0.5 text-[11px] text-[#57655d]">
                      Bank slip, transfer confirmation screenshot, or mobile money PDF (max 10 MB)
                    </span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,application/pdf"
                      onChange={(e) => setOffPlatformFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                  </label>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block font-semibold text-[#10251d] mb-1">
                      Payment Method
                    </label>
                    <input
                      type="text"
                      value={offPlatformMethod}
                      onChange={(e) => setOffPlatformMethod(e.target.value)}
                      placeholder="Bank Transfer, MTN MoMo, Wire..."
                      className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] px-3 py-2 text-xs outline-none focus:border-[#2d6130] focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-[#10251d] mb-1">
                      Payment / Transaction Reference
                    </label>
                    <input
                      type="text"
                      value={offPlatformRefNote}
                      onChange={(e) => setOffPlatformRefNote(e.target.value)}
                      placeholder="e.g. TRX-9920184"
                      className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] px-3 py-2 text-xs font-mono outline-none focus:border-[#2d6130] focus:bg-white"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 border-t border-[#edf1ea] pt-4">
                  <button
                    type="button"
                    onClick={() => setBuyerPayBundle(null)}
                    className="rounded-full px-5 py-2.5 font-bold text-gray-500 hover:bg-gray-100 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={modalSubmitting}
                    className="inline-flex items-center gap-2 rounded-full bg-[#0b3528] px-6 py-2.5 font-bold text-white shadow-sm hover:bg-[#144737] disabled:opacity-50 cursor-pointer whitespace-nowrap"
                  >
                    <Upload size={14} />
                    {modalSubmitting ? "Uploading Receipt..." : "Upload Receipt & Mark as Paid"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 3: SELLER VERIFIES OFF-PLATFORM RECEIPT & INITIALIZES TRANSFER  */}
      {/* ===================================================================== */}
      {sellerReceiptBundle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="relative my-8 w-full max-w-xl rounded-[32px] border border-[#dfe7d8] bg-white p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setSellerReceiptBundle(null)}
              className="absolute right-5 top-5 rounded-full p-2 text-gray-400 hover:bg-gray-100 cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="text-xs font-bold uppercase tracking-wider text-[#2d6130] flex items-center gap-1.5">
              <ShieldCheck size={14} /> Seller Payment Verification
            </div>
            <h2 className="mt-1 text-2xl font-bold text-[#10251d]">
              Confirm Off-Platform Payment
            </h2>
            <p className="mt-1 text-xs text-[#57655d]">
              Verify the buyer&apos;s uploaded payment proof below. Confirming will mark the invoice
              paid and initialize the certificate transfer and delivery note (prompting the buyer to
              pay the 0.5% transfer fee).
            </p>

            <div className="mt-4 rounded-2xl border border-[#dfe7d8] bg-[#f8f9f3] p-4 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-500">Expected Purchase Price:</span>
                <strong className="text-sm text-[#2d6130] tabular-nums">
                  {sellerReceiptBundle.purchaseOrder.purchasePrice.toLocaleString()}{" "}
                  {sellerReceiptBundle.purchaseOrder.currency}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Payment Method:</span>
                <strong className="text-[#10251d]">
                  {sellerReceiptBundle.purchaseOrder.offPlatformReceipt?.paymentMethodNote ||
                    "Off-Platform"}
                </strong>
              </div>
              {sellerReceiptBundle.purchaseOrder.offPlatformReceipt?.paymentReferenceNote && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Reference Note:</span>
                  <strong className="font-mono text-[#10251d]">
                    {sellerReceiptBundle.purchaseOrder.offPlatformReceipt.paymentReferenceNote}
                  </strong>
                </div>
              )}

              {sellerReceiptBundle.purchaseOrder.offPlatformReceipt?.receiptUrl && (
                <div className="pt-2 border-t border-[#dfe7d8] space-y-2">
                  <span className="block font-bold text-[#10251d]">Uploaded Receipt Proof:</span>
                  {sellerReceiptBundle.purchaseOrder.offPlatformReceipt.mimeType?.includes("pdf") ? (
                    <a
                      href={sellerReceiptBundle.purchaseOrder.offPlatformReceipt.receiptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl border border-[#2d6130] bg-white px-4 py-2.5 font-bold text-[#1d5e2e] hover:bg-[#edf7e8]"
                    >
                      <FileText size={15} /> Open Uploaded PDF Receipt <ExternalLink size={13} />
                    </a>
                  ) : (
                    <div className="space-y-2">
                      <div className="relative h-56 w-full overflow-hidden rounded-xl border border-[#dfe7d8] bg-white">
                        <Image
                          src={sellerReceiptBundle.purchaseOrder.offPlatformReceipt.receiptUrl}
                          alt="Buyer payment receipt"
                          fill
                          className="object-contain"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <a
                        href={sellerReceiptBundle.purchaseOrder.offPlatformReceipt.receiptUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-[#2d6130] underline"
                      >
                        Open full-size receipt image <ExternalLink size={11} />
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>

            {modalError && (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                {modalError}
              </div>
            )}

            <form onSubmit={handleSellerConfirmOffPlatform} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-[#10251d] mb-1">
                  Delivery Note Dispatch Instructions (Optional)
                </label>
                <textarea
                  rows={2}
                  value={sellerDeliveryNotes}
                  onChange={(e) => setSellerDeliveryNotes(e.target.value)}
                  placeholder="Vehicle plate, warehouse pickup location, bag count, or handover contact..."
                  className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none focus:border-[#2d6130] focus:bg-white"
                />
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-[#edf1ea] pt-4">
                <button
                  type="button"
                  onClick={() => setSellerReceiptBundle(null)}
                  className="rounded-full px-5 py-2.5 font-bold text-gray-500 hover:bg-gray-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  className="inline-flex items-center gap-2 rounded-full bg-[#0b3528] px-6 py-2.5 font-bold text-white shadow-sm hover:bg-[#144737] disabled:opacity-50 cursor-pointer whitespace-nowrap"
                >
                  <CheckCircle2 size={14} />
                  {modalSubmitting
                    ? "Confirming..."
                    : "Confirm Payment & Initialize Transfer + Delivery Note"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 4: BUYER MARKS DELIVERY SUCCESSFUL & CLOSES TRADE               */}
      {/* ===================================================================== */}
      {buyerDeliveryBundle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="relative my-8 w-full max-w-lg rounded-[32px] border border-[#dfe7d8] bg-white p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setBuyerDeliveryBundle(null)}
              className="absolute right-5 top-5 rounded-full p-2 text-gray-400 hover:bg-gray-100 cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="text-xs font-bold uppercase tracking-wider text-[#2d6130] flex items-center gap-1.5">
              <Truck size={14} /> Final Stage • Delivery Confirmation
            </div>
            <h2 className="mt-1 text-2xl font-bold text-[#10251d]">
              Mark Delivery as Successful
            </h2>
            <p className="mt-1.5 text-xs text-[#57655d] leading-relaxed">
              Confirm that you have physically received{" "}
              <strong className="text-[#10251d] tabular-nums">
                {buyerDeliveryBundle.purchaseOrder.quantityKg.toLocaleString()} kg
              </strong>{" "}
              for Delivery Note{" "}
              <strong className="font-mono text-[#10251d]">
                {buyerDeliveryBundle.purchaseOrder.deliveryNoteNumber}
              </strong>
              . Closing this trade automatically returns any remaining cocoa balance on the
              seller&apos;s listing back to <strong>Available</strong> on the marketplace.
            </p>

            {modalError && (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                {modalError}
              </div>
            )}

            <form onSubmit={handleBuyerConfirmDelivery} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-[#10251d] mb-1">
                  Delivery Inspection / Handover Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  value={buyerDeliveryNotes}
                  onChange={(e) => setBuyerDeliveryNotes(e.target.value)}
                  placeholder="e.g. Received in good dry condition at Douala warehouse"
                  className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none focus:border-[#2d6130] focus:bg-white"
                />
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-[#edf1ea] pt-4">
                <button
                  type="button"
                  onClick={() => setBuyerDeliveryBundle(null)}
                  className="rounded-full px-5 py-2.5 font-bold text-gray-500 hover:bg-gray-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  className="inline-flex items-center gap-2 rounded-full bg-[#0b3528] px-6 py-2.5 font-bold text-white shadow-sm hover:bg-[#144737] disabled:opacity-50 cursor-pointer whitespace-nowrap"
                >
                  <CheckCircle2 size={14} />
                  {modalSubmitting ? "Closing Trade..." : "Confirm Delivery & Close Trade"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
