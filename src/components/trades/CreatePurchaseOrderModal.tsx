"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  FileText,
  Upload,
  CheckCircle2,
  AlertCircle,
  Download,
  ExternalLink,
  Building2,
  Scale,
  X,
} from "lucide-react";
import {
  CertificateHolderType,
  MarketplaceListing,
  PurchaseOrder,
} from "@/types/traceability";
import { SignaturePadField, SignatureFieldState } from "./SignaturePadField";
import { downloadPurchaseOrderPdf } from "@/lib/tradePdfGenerator";

interface CreatePurchaseOrderModalProps {
  listing: MarketplaceListing;
  defaultSignerName?: string;
  getAuthToken: () => Promise<string | null>;
  onClose: () => void;
  onCreated?: (po: PurchaseOrder) => void;
}

export function CreatePurchaseOrderModal({
  listing,
  defaultSignerName = "",
  getAuthToken,
  onClose,
  onCreated,
}: CreatePurchaseOrderModalProps) {
  const [quantityKg, setQuantityKg] = useState<string>(String(listing.quantityAvailableKg || ""));
  const [unitPricePerKg, setUnitPricePerKg] = useState<string>(String(listing.pricePerKg || ""));
  const [buyerHolderType, setBuyerHolderType] = useState<CertificateHolderType>("cooperative");

  // Buyer Letterhead Fields
  const [companyName, setCompanyName] = useState("");
  const [address, setAddress] = useState("");
  const [businessRegistrationNumber, setBusinessRegistrationNumber] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);

  // Buyer Signature
  const [signature, setSignature] = useState<SignatureFieldState>({
    signerName: defaultSignerName,
    signerTitle: "",
    signatureFile: null,
    previewUrl: null,
  });

  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdPo, setCreatedPo] = useState<PurchaseOrder | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const qtyNum = Number(quantityKg) || 0;
  const priceNum = Number(unitPricePerKg) || 0;
  const purchasePrice = Math.round((qtyNum * priceNum + Number.EPSILON) * 100) / 100;
  const onPlatformFeePreview = Math.round((purchasePrice * 0.015 + Number.EPSILON) * 100) / 100;
  const offPlatformFeePreview = Math.round((purchasePrice * 0.005 + Number.EPSILON) * 100) / 100;

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setLogoPreviewUrl(typeof reader.result === "string" ? reader.result : null);
    };
    reader.readAsDataURL(file);
  };

  const uploadTradeAsset = async (
    file: File,
    kind: "logo" | "signature",
    token: string
  ): Promise<{ secureUrl: string; publicId: string }> => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", kind);

    const res = await fetch("/api/upload/trade-document", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: fd,
    });

    const data = await res.json();
    if (!res.ok || !data?.success || !data?.asset?.secureUrl) {
      throw new Error(data?.error || `Failed to upload ${kind} image.`);
    }
    return {
      secureUrl: data.asset.secureUrl,
      publicId: data.asset.publicId,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      setError("Agreed purchase quantity must be greater than 0 kg.");
      return;
    }
    if (qtyNum > listing.quantityAvailableKg) {
      setError(
        `Agreed quantity (${qtyNum.toLocaleString()} kg) cannot exceed available stock (${listing.quantityAvailableKg.toLocaleString()} kg).`
      );
      return;
    }
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      setError("Agreed unit price per kg must be greater than 0.");
      return;
    }
    if (!companyName.trim()) {
      setError("Company / Organization name is required for your letterhead.");
      return;
    }
    if (!address.trim()) {
      setError("Business address is required for your letterhead.");
      return;
    }
    if (!businessRegistrationNumber.trim()) {
      setError("Business registration number is required for your letterhead.");
      return;
    }
    if (!signature.signerName.trim()) {
      setError("Authorized signer name is required.");
      return;
    }
    if (!signature.signatureFile) {
      setError("Please draw or upload your signature before generating the Purchase Order.");
      return;
    }

    setSubmitting(true);
    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error("Please sign in to generate a Purchase Order.");
      }

      // Upload logo (if provided) and signature in parallel
      const [uploadedLogo, uploadedSignature] = await Promise.all([
        logoFile ? uploadTradeAsset(logoFile, "logo", token) : Promise.resolve(null),
        uploadTradeAsset(signature.signatureFile, "signature", token),
      ]);

      const res = await fetch("/api/marketplace/purchase-orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          listingId: listing.listingId,
          buyerHolderType,
          quantityKg: qtyNum,
          unitPricePerKg: priceNum,
          buyerLetterhead: {
            companyName: companyName.trim(),
            address: address.trim(),
            businessRegistrationNumber: businessRegistrationNumber.trim(),
            logoUrl: uploadedLogo?.secureUrl,
            logoPublicId: uploadedLogo?.publicId,
          },
          buyerSignature: {
            signerName: signature.signerName.trim(),
            signerTitle: signature.signerTitle.trim() || undefined,
            signatureImageUrl: uploadedSignature.secureUrl,
            signaturePublicId: uploadedSignature.publicId,
          },
          notes: notes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data?.success || !data?.purchaseOrder) {
        throw new Error(data?.error || "Failed to generate Purchase Order.");
      }

      setCreatedPo(data.purchaseOrder);
      onCreated?.(data.purchaseOrder);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to generate Purchase Order.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!createdPo) return;
    setDownloadingPdf(true);
    try {
      await downloadPurchaseOrderPdf(createdPo);
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm overflow-y-auto">
      <div className="relative my-8 w-full max-w-2xl rounded-[32px] border border-[#dfe7d8] bg-white p-6 sm:p-7 shadow-2xl max-h-[92vh] overflow-y-auto">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close modal"
          className="absolute right-5 top-5 rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 cursor-pointer"
        >
          <X size={18} />
        </button>

        {createdPo ? (
          <div className="py-4 text-center space-y-5">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#edf7e8] text-[#2d6130]">
              <CheckCircle2 size={34} />
            </div>

            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#2d6130]">
                Stage 1 Complete • Purchase Order Generated
              </span>
              <h2 className="mt-1 text-2xl font-bold text-[#10251d]">
                Purchase Order Submitted to Seller
              </h2>
              <p className="mt-1.5 text-xs text-[#57655d] max-w-md mx-auto leading-relaxed">
                Your signed Purchase Order has been sent to the seller&apos;s dashboard. Once the
                seller signs and confirms it, a Commercial Invoice will be generated automatically
                for you to pay on-platform or off-platform.
              </p>
            </div>

            <div className="rounded-2xl border border-[#dfe7d8] bg-[#f8f9f3] p-4 text-left text-xs space-y-2 max-w-md mx-auto">
              <div className="flex justify-between">
                <span className="text-gray-500">Purchase Order No.:</span>
                <strong className="font-mono text-[#10251d]">{createdPo.poNumber}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Agreed Quantity:</span>
                <strong className="tabular-nums text-[#10251d]">
                  {createdPo.quantityKg.toLocaleString()} kg
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Agreed Unit Price:</span>
                <strong className="tabular-nums text-[#10251d]">
                  {createdPo.unitPricePerKg.toLocaleString()} {createdPo.currency}/kg
                </strong>
              </div>
              <div className="flex justify-between border-t border-[#dfe7d8] pt-2 text-sm">
                <span className="font-bold text-[#10251d]">Purchase Price:</span>
                <strong className="font-bold tabular-nums text-[#2d6130]">
                  {createdPo.purchasePrice.toLocaleString()} {createdPo.currency}
                </strong>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full border border-[#2d6130] bg-[#edf7e8] px-6 py-2.5 text-xs font-bold text-[#1b4720] hover:bg-[#dff1d6] transition cursor-pointer whitespace-nowrap disabled:opacity-50"
              >
                <Download size={14} />
                {downloadingPdf ? "Generating PDF..." : "Download Purchase Order PDF"}
              </button>

              <Link
                href="/dashboard/trades?tab=orders"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full bg-[#0b3528] px-6 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#144737] transition whitespace-nowrap"
              >
                Track in Trade Dashboard <ExternalLink size={14} />
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#2d6130]">
              <FileText size={14} /> Step 2 of Cocoa Trade • Formal Purchase Order
            </div>
            <h2 className="mt-1 text-2xl font-bold text-[#10251d]">Generate Purchase Order</h2>
            <p className="mt-1 text-xs text-[#57655d] leading-relaxed">
              Enter the agreed terms, your company letterhead details, and signature. The seller
              will sign and confirm this Purchase Order in their dashboard to automatically issue
              your Commercial Invoice.
            </p>

            {/* Listing Context Banner */}
            <div className="mt-4 rounded-2xl border border-[#dfe7d8] bg-[#f8f9f3] p-3.5 text-xs flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-bold text-[#10251d]">{listing.title}</div>
                <div className="text-[11px] text-[#57655d] font-mono">
                  Lot: {listing.lotId} • Listing: {listing.listingNumber}
                </div>
              </div>
              <div className="text-right tabular-nums">
                <div className="font-bold text-[#2d6130]">
                  Available: {listing.quantityAvailableKg.toLocaleString()} kg
                </div>
                <div className="text-[11px] text-[#57655d]">
                  Listed at {listing.pricePerKg.toLocaleString()} {listing.currency}/kg
                </div>
              </div>
            </div>

            {error && (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 flex items-start gap-2">
                <AlertCircle size={15} className="shrink-0 mt-0.5 text-red-600" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-5 space-y-5 text-xs">
              {/* 1. Agreed Commercial Terms */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#2d6130] flex items-center gap-1.5">
                  <Scale size={14} /> 1. Agreed Quantity &amp; Pricing
                </h3>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="block font-semibold text-[#10251d] mb-1">
                      Agreed Quantity (kg) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="1"
                      max={listing.quantityAvailableKg}
                      required
                      value={quantityKg}
                      onChange={(e) => setQuantityKg(e.target.value)}
                      className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] px-3 py-2.5 text-xs font-bold text-[#10251d] tabular-nums outline-none focus:border-[#2d6130] focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-[#10251d] mb-1">
                      Agreed Unit Price ({listing.currency}/kg) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="1"
                      required
                      value={unitPricePerKg}
                      onChange={(e) => setUnitPricePerKg(e.target.value)}
                      className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] px-3 py-2.5 text-xs font-bold text-[#10251d] tabular-nums outline-none focus:border-[#2d6130] focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-[#10251d] mb-1">
                      Your Buyer Entity Role *
                    </label>
                    <select
                      value={buyerHolderType}
                      onChange={(e) => setBuyerHolderType(e.target.value as CertificateHolderType)}
                      className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] px-3 py-2.5 text-xs font-semibold text-[#10251d] outline-none focus:border-[#2d6130] focus:bg-white"
                    >
                      <option value="cooperative">Cooperative Society</option>
                      <option value="agent">Licensed Buying Agent</option>
                      <option value="warehouse">Export Warehouse</option>
                    </select>
                  </div>
                </div>

                {/* Auto-calculated Purchase Price Summary */}
                <div className="rounded-2xl border border-[#cdebc2] bg-[#edf7e8] p-4 space-y-1.5">
                  <div className="flex items-center justify-between text-sm font-bold text-[#0b3528]">
                    <span>Auto-Calculated Purchase Price</span>
                    <span className="text-lg font-extrabold tabular-nums">
                      {purchasePrice.toLocaleString()} {listing.currency}
                    </span>
                  </div>
                  <div className="flex flex-wrap justify-between gap-2 text-[11px] text-[#355a3b] pt-1 border-t border-[#cbe6bf]">
                    <span className="tabular-nums">
                      On-platform fee (1.5%): +{onPlatformFeePreview.toLocaleString()} {listing.currency}
                    </span>
                    <span className="tabular-nums">
                      Off-platform transfer fee (0.5%): +{offPlatformFeePreview.toLocaleString()} {listing.currency}
                    </span>
                  </div>
                </div>
              </div>

              {/* 2. Buyer Company Letterhead */}
              <div className="space-y-3 border-t border-[#edf1ea] pt-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#2d6130] flex items-center gap-1.5">
                  <Building2 size={14} /> 2. Buyer Letterhead Information
                </h3>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block font-semibold text-[#10251d] mb-1">
                      Company / Organization Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="e.g. Atlantic Cocoa Trading Ltd."
                      className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] px-3 py-2.5 text-xs font-medium text-[#10251d] outline-none focus:border-[#2d6130] focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-[#10251d] mb-1">
                      Business Registration Number *
                    </label>
                    <input
                      type="text"
                      required
                      value={businessRegistrationNumber}
                      onChange={(e) => setBusinessRegistrationNumber(e.target.value)}
                      placeholder="e.g. RC/DLA/2023/B/4481"
                      className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] px-3 py-2.5 text-xs font-mono font-medium text-[#10251d] outline-none focus:border-[#2d6130] focus:bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">
                    Registered Business Address *
                  </label>
                  <input
                    type="text"
                    required
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Street address, city, region, country"
                    className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] px-3 py-2.5 text-xs font-medium text-[#10251d] outline-none focus:border-[#2d6130] focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">
                    Company Letterhead Logo (PNG, JPG, WEBP)
                  </label>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-[#b6cab0] bg-[#fafcf9] px-4 py-2.5 text-xs font-bold text-[#10251d] hover:bg-[#f0f5ec] transition">
                      <Upload size={14} className="text-[#2d6130]" />
                      {logoFile ? "Change Logo" : "Upload Company Logo"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={handleLogoChange}
                        className="hidden"
                      />
                    </label>
                    {logoPreviewUrl && (
                      <div className="flex items-center gap-2 rounded-xl border border-[#dfe7d8] bg-white px-3 py-1.5">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={logoPreviewUrl}
                          alt="Letterhead logo preview"
                          className="h-9 max-w-[110px] object-contain"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setLogoFile(null);
                            setLogoPreviewUrl(null);
                          }}
                          className="text-[11px] font-bold text-gray-400 hover:text-red-600 cursor-pointer"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 3. Buyer Signature */}
              <div className="border-t border-[#edf1ea] pt-4">
                <SignaturePadField
                  label="3. Buyer Authorized Signature *"
                  value={signature}
                  onChange={setSignature}
                  signerNamePlaceholder="Authorized buyer representative name"
                />
              </div>

              {/* 4. Optional Agreed Terms */}
              <div>
                <label className="block font-semibold text-[#10251d] mb-1">
                  Delivery / Commercial Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional delivery timeline, warehouse drop-off location, or inspection terms..."
                  className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 text-xs font-medium text-[#10251d] outline-none focus:border-[#2d6130] focus:bg-white"
                />
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-[#edf1ea] pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full px-5 py-2.5 text-xs font-bold text-gray-500 hover:bg-gray-100 cursor-pointer whitespace-nowrap"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0b3528] px-6 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#144737] disabled:opacity-50 cursor-pointer whitespace-nowrap"
                >
                  <FileText size={14} />
                  {submitting ? "Generating Purchase Order..." : "Generate & Send Purchase Order"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
