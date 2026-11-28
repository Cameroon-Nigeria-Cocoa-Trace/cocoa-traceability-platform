"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { MarketplaceListing } from "@/types/traceability";
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Lock,
  Mail,
  MapPin,
  Package,
  Phone,
  Search,
  ShieldCheck,
  Store,
  UserCheck,
  Users,
  X,
} from "lucide-react";

export interface UnlockedSellerSummary {
  sellerHolderId: string;
  sellerHolderType: string;
  contactName: string;
  phone: string;
  email: string;
  location: string;
  paidListingsCount: number;
  lastAccessGrantedAt: string;
  otherListingsCount: number;
}

export interface NegotiatedSellerOtherListingItem {
  listing: MarketplaceListing;
  sellerContact: {
    sellerHolderId: string;
    sellerHolderType: string;
    contactName: string;
    phone: string;
    email: string;
    location: string;
    lastAccessGrantedAt: string;
  };
}

interface NegotiatedSellersListingsViewProps {
  unlockedSellers: UnlockedSellerSummary[];
  otherListings: NegotiatedSellerOtherListingItem[];
  loading: boolean;
  error: string | null;
}

export const NegotiatedSellersListingsView = ({
  unlockedSellers,
  otherListings,
  loading,
  error,
}: NegotiatedSellersListingsViewProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSellerId, setSelectedSellerId] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "available" | "under_negotiation" | "sold">("ALL");

  const filteredListings = useMemo(() => {
    return otherListings.filter(({ listing, sellerContact }) => {
      if (selectedSellerId !== "ALL" && sellerContact.sellerHolderId !== selectedSellerId) {
        return false;
      }
      if (statusFilter !== "ALL" && listing.listingStatus !== statusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchesTitle = listing.title?.toLowerCase().includes(q);
        const matchesNumber = listing.listingNumber?.toLowerCase().includes(q);
        const matchesLot = listing.lotId?.toLowerCase().includes(q);
        const matchesSeller = sellerContact.contactName?.toLowerCase().includes(q);
        const matchesLocation = sellerContact.location?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesNumber && !matchesLot && !matchesSeller && !matchesLocation) {
          return false;
        }
      }
      return true;
    });
  }, [otherListings, selectedSellerId, statusFilter, searchQuery]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[32px] border border-[#dfe7d8] bg-white p-16 text-center shadow-sm">
        <div className="h-8 w-8 rounded-full border-2 border-[#062d22] border-t-[#b8f58b] animate-spin" />
        <h3 className="mt-4 text-base font-bold text-[#10251d]">
          Loading Other Listings from Negotiated Sellers...
        </h3>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[28px] border border-red-200 bg-red-50 p-6 text-red-800">
        <div className="flex items-center gap-2 font-bold text-sm">
          <AlertCircle size={18} /> Error Loading Negotiated Sellers&apos; Listings
        </div>
        <p className="mt-1 text-xs">{error}</p>
      </div>
    );
  }

  if (unlockedSellers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[32px] border border-[#dfe7d8] bg-white p-16 text-center shadow-sm">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#f1f6ec] text-[#2d6130]">
          <Users size={28} />
        </div>
        <h3 className="mt-4 text-lg font-bold text-[#10251d]">
          No previously negotiated sellers yet
        </h3>
        <p className="mt-1 max-w-md text-xs leading-relaxed text-[#57655d]">
          Once you pay to unlock a seller&apos;s contact information on the marketplace, all other
          cocoa listings from that seller will appear here with their contact info already unlocked.
        </p>
        <Link
          href="/marketplace"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#0b3528] px-6 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#144737] transition"
        >
          <Store size={15} />
          Explore Cocoa Marketplace
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <div className="rounded-[24px] border border-[#d2ecc8] bg-[#edf7e8] p-5 shadow-2xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#2d6130] text-white">
              <UserCheck size={18} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-[#10251d]">
                Other Cocoa Listings from Sellers You Have Paid Info For
              </h4>
              <p className="mt-1 text-xs leading-relaxed text-[#3c5044]">
                You have unlocked contact access for{" "}
                <strong>
                  {unlockedSellers.length}{" "}
                  {unlockedSellers.length === 1 ? "seller" : "sellers"}
                </strong>
                . Browse their other cocoa offerings below without paying for their contact
                information again.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white border border-[#cdebc2] px-3.5 py-1.5 text-xs font-bold text-[#1d6a45] tabular-nums whitespace-nowrap">
              <CheckCircle2 size={14} />
              {otherListings.length} Other{" "}
              {otherListings.length === 1 ? "Listing" : "Listings"}
            </span>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <section className="rounded-[24px] border border-[#dfe7d8] bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {(["ALL", "available", "under_negotiation", "sold"] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`rounded-full px-4 py-2 text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                  statusFilter === status
                    ? "bg-[#0b3528] text-white"
                    : "bg-[#f1f4ec] text-[#57655d] hover:bg-[#e4ebd9]"
                }`}
              >
                {status === "ALL"
                  ? `All Statuses (${otherListings.length})`
                  : status === "available"
                    ? "Available"
                    : status === "under_negotiation"
                      ? "Under Negotiation"
                      : "Sold"}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {unlockedSellers.length > 1 && (
              <select
                value={selectedSellerId}
                onChange={(e) => setSelectedSellerId(e.target.value)}
                className="rounded-full border border-[#dfe7d8] bg-[#f7f8f3] px-4 py-2 text-xs font-bold text-[#10251d] outline-none focus:border-[#2d6130]"
              >
                <option value="ALL">All Unlocked Sellers ({unlockedSellers.length})</option>
                {unlockedSellers.map((seller) => (
                  <option key={seller.sellerHolderId} value={seller.sellerHolderId}>
                    {seller.contactName} ({seller.otherListingsCount} other)
                  </option>
                ))}
              </select>
            )}

            <div className="relative w-full sm:w-64">
              <Search
                size={15}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#79887e]"
              />
              <input
                type="text"
                placeholder="Search seller, lot, or title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-full border border-[#dfe7d8] bg-[#f7f8f3] py-2 pl-9 pr-8 text-xs font-medium text-[#10251d] outline-none transition focus:border-[#2d6130] focus:bg-white"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Listings Grid or Empty State for Unlocked Sellers With No Additional Listings */}
      {filteredListings.length === 0 ? (
        <div className="rounded-[28px] border border-[#dfe7d8] bg-white p-10 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#f1f6ec] text-[#2d6130]">
            <Package size={24} />
          </div>
          <h3 className="mt-4 text-base font-bold text-[#10251d]">
            {otherListings.length === 0
              ? "No other cocoa listings from your negotiated sellers yet"
              : "No listings match your current filters"}
          </h3>
          <p className="mt-1 mx-auto max-w-md text-xs text-[#57655d] leading-relaxed">
            {otherListings.length === 0
              ? "The sellers you previously paid to unlock have not posted additional cocoa listings beyond the lot(s) you already unlocked. Whenever they publish new lots, they will appear here automatically."
              : "Try clearing your search or switching the status filter to view all available offerings from your negotiated sellers."}
          </p>

          {/* Show unlocked seller contact directory so the buyer still has direct access */}
          <div className="mt-6 grid gap-3 text-left sm:grid-cols-2 lg:grid-cols-3">
            {unlockedSellers.map((seller) => (
              <div
                key={seller.sellerHolderId}
                className="rounded-2xl border border-[#dfe7d8] bg-[#fafcf9] p-4 text-xs space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <strong className="text-sm font-bold text-[#10251d] truncate">
                    {seller.contactName}
                  </strong>
                  <span className="rounded-full bg-[#edf7e8] border border-[#cdebc2] px-2 py-0.5 text-[10px] font-bold text-[#1d6a45] whitespace-nowrap">
                    Unlocked
                  </span>
                </div>
                <div className="text-[11px] text-[#57655d] uppercase tracking-wider font-semibold">
                  {seller.sellerHolderType}
                </div>
                {seller.phone && (
                  <div className="flex items-center gap-1.5 font-mono text-[#10251d]">
                    <Phone size={12} className="text-[#2d6130]" />
                    <span>{seller.phone}</span>
                  </div>
                )}
                {seller.email && (
                  <div className="flex items-center gap-1.5 text-[#394a41] truncate">
                    <Mail size={12} className="text-[#2d6130] shrink-0" />
                    <span className="truncate">{seller.email}</span>
                  </div>
                )}
                {seller.location && (
                  <div className="flex items-center gap-1.5 text-[#57655d]">
                    <MapPin size={12} className="text-[#2d6130] shrink-0" />
                    <span>{seller.location}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {filteredListings.map(({ listing, sellerContact }) => {
            const isCertified = listing.certificationType === "certified";
            const isSold = listing.listingStatus === "sold";
            const isUnderNegotiation = listing.listingStatus === "under_negotiation";
            const imageSrc = listing.cocoaImage?.secureUrl || listing.cocoaImage?.url || "";

            return (
              <article
                key={listing.listingId}
                className="flex flex-col justify-between rounded-[28px] border border-[#dfe7d8] bg-white p-5 shadow-sm transition hover:border-[#b8d4b0] hover:shadow-md"
              >
                <div>
                  {/* Image & Status Header */}
                  <div className="relative h-44 w-full overflow-hidden rounded-2xl bg-[#eef3ea]">
                    {imageSrc ? (
                      <Image
                        src={imageSrc}
                        alt={listing.title}
                        fill
                        referrerPolicy="no-referrer"
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[#57655d]">
                        <Package size={32} />
                      </div>
                    )}

                    <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold shadow-xs ${
                          isCertified
                            ? "bg-[#0b3528] text-[#b8f58b]"
                            : "bg-white/95 text-[#394a41] border border-[#dfe7d8]"
                        }`}
                      >
                        {isCertified ? <ShieldCheck size={11} /> : <BadgeCheck size={11} />}
                        {isCertified ? "Origin Certified" : "Uncertified"}
                      </span>
                    </div>

                    <div className="absolute right-3 top-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold shadow-xs ${
                          isSold
                            ? "bg-red-100 text-red-800 border border-red-200"
                            : isUnderNegotiation
                              ? "bg-amber-100 text-amber-900 border border-amber-300"
                              : "bg-[#edf7e8] text-[#1d6a45] border border-[#cdebc2]"
                        }`}
                      >
                        {isUnderNegotiation && <Lock size={10} />}
                        {isSold
                          ? "Sold"
                          : isUnderNegotiation
                            ? "Under Negotiation"
                            : "Available"}
                      </span>
                    </div>
                  </div>

                  {/* Listing Title & Metadata */}
                  <div className="mt-4">
                    <div className="font-mono text-[11px] text-[#6c7b72]">
                      {listing.listingNumber}
                    </div>
                    <h3 className="mt-0.5 text-base font-bold text-[#10251d] line-clamp-2">
                      {listing.title}
                    </h3>

                    <dl className="mt-3 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <dt className="text-[#6c7b72]">Available Quantity</dt>
                        <dd className="font-bold text-[#10251d] tabular-nums">
                          {(Number(listing.quantityAvailableKg) || 0).toLocaleString()} kg
                        </dd>
                      </div>
                      <div className="flex items-center justify-between">
                        <dt className="text-[#6c7b72]">Unit Price</dt>
                        <dd className="font-bold text-[#10251d] tabular-nums">
                          {(Number(listing.pricePerKg) || 0).toLocaleString()} {listing.currency} / kg
                        </dd>
                      </div>
                      <div className="flex items-center justify-between">
                        <dt className="text-[#6c7b72]">Quality Grade</dt>
                        <dd className="font-bold text-[#10251d]">
                          {listing.qualityGrade || "Grade 1"}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between">
                        <dt className="text-[#6c7b72]">Cocoa Lot</dt>
                        <dd className="font-mono text-[11px] text-[#394a41]">{listing.lotId}</dd>
                      </div>
                    </dl>
                  </div>

                  {/* Unlocked Seller Contact Strip */}
                  <div className="mt-4 rounded-2xl border border-[#cdebc2] bg-[#f5fbf2] p-3 text-xs space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 font-bold text-[#1d6a45] text-[11px]">
                        <CheckCircle2 size={12} /> Unlocked Seller
                      </span>
                      <span className="text-[10px] font-semibold uppercase text-[#57655d]">
                        {sellerContact.sellerHolderType}
                      </span>
                    </div>
                    <div className="font-bold text-[#10251d] text-xs truncate">
                      {sellerContact.contactName}
                    </div>
                    {sellerContact.phone && (
                      <div className="flex items-center gap-1.5 font-mono text-[11px] text-[#394a41]">
                        <Phone size={11} className="text-[#2d6130] shrink-0" />
                        <span>{sellerContact.phone}</span>
                      </div>
                    )}
                    {sellerContact.email && (
                      <div className="flex items-center gap-1.5 text-[11px] text-[#394a41] truncate">
                        <Mail size={11} className="text-[#2d6130] shrink-0" />
                        <span className="truncate">{sellerContact.email}</span>
                      </div>
                    )}
                    {sellerContact.location && (
                      <div className="flex items-center gap-1.5 text-[11px] text-[#57655d]">
                        <MapPin size={11} className="text-[#2d6130] shrink-0" />
                        <span className="truncate">{sellerContact.location}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer Total & CTA */}
                <div className="mt-4 border-t border-[#edf1ea] pt-4">
                  <div className="mb-3 flex items-baseline justify-between">
                    <span className="text-xs text-[#6c7b72]">Estimated Lot Total</span>
                    <strong className="text-base font-bold text-[#10251d] tabular-nums">
                      {(
                        (Number(listing.quantityAvailableKg) || 0) *
                        (Number(listing.pricePerKg) || 0)
                      ).toLocaleString()}{" "}
                      {listing.currency}
                    </strong>
                  </div>

                  <Link
                    href={
                      !isSold && !isUnderNegotiation
                        ? `/product/${listing.listingId}?flow=buy`
                        : `/product/${listing.listingId}`
                    }
                    className={`w-full inline-flex items-center justify-center gap-1.5 rounded-full py-2.5 px-4 text-xs font-bold transition whitespace-nowrap ${
                      !isSold && !isUnderNegotiation
                        ? "bg-[#0b3528] text-white hover:bg-[#144737] shadow-sm"
                        : "border border-[#dfe7d8] bg-white text-[#10251d] hover:bg-[#edf2ea]"
                    }`}
                  >
                    {!isSold && !isUnderNegotiation ? (
                      <>
                        See Seller Info &amp; Buy Cocoa <ArrowRight size={13} />
                      </>
                    ) : (
                      <>
                        View Listing Details <ArrowRight size={13} />
                      </>
                    )}
                  </Link>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
};
