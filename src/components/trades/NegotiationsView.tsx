import React from "react";
import { SellerNegotiationItem } from "@/types/traceability";
import {
  Handshake,
  AlertCircle,
  XCircle,
  User,
  Mail,
  Phone,
  CheckCircle2,
  Info,
  Clock,
  Tag,
  ShieldCheck,
  ChevronRight,
} from "lucide-react";

interface NegotiationsViewProps {
  negotiations: SellerNegotiationItem[];
  loading: boolean;
  error: string | null;
  onConclude: (item: SellerNegotiationItem) => void;
  onFellThrough: (item: SellerNegotiationItem) => void;
}

export const NegotiationsView = ({
  negotiations,
  loading,
  error,
  onConclude,
  onFellThrough,
}: NegotiationsViewProps) => {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[32px] border border-[#dfe7d8] bg-white p-16 text-center shadow-sm">
        <div className="h-8 w-8 rounded-full border-2 border-[#062d22] border-t-[#b8f58b] animate-spin" />
        <h3 className="mt-4 text-base font-bold text-[#10251d]">Loading Buyer Inquiries &amp; Negotiations...</h3>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[28px] border border-red-200 bg-red-50 p-6 text-red-800">
        <div className="flex items-center gap-2 font-bold text-sm">
          <AlertCircle size={18} /> Error Loading Negotiations
        </div>
        <p className="mt-1 text-xs">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Seller Informational Banner: Buyer Confirmation Requirement */}
      <div className="rounded-[24px] border border-[#d2ecc8] bg-[#edf7e8] p-5 shadow-2xs">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#2d6130] text-white">
            <Info size={18} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-[#10251d] flex items-center gap-2">
              Buyer Confirmation Required for All Concluded Sales
            </h4>
            <p className="mt-1 text-xs leading-relaxed text-[#3c5044]">
              Everything declared by you (transferred weight, negotiated price per kg, and counterparty entity)
              must be reviewed and confirmed by the buyer in their own <strong>Trade Management dashboard</strong>.
              Upon concluding a sale, the transaction is logged in <em>&quot;Pending Buyer Confirmation&quot;</em> status
              until the buyer confirms and accepts the commercial terms.
            </p>
          </div>
        </div>
      </div>

      {negotiations.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[32px] border border-[#dfe7d8] bg-white p-16 text-center shadow-sm">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#f1f6ec] text-[#2d6130]">
            <Handshake size={28} />
          </div>
          <h3 className="mt-4 text-lg font-bold text-[#10251d]">No active buyer negotiations</h3>
          <p className="mt-1 max-w-sm text-xs text-[#57655d]">
            When prospective buyers unlock your lot contact details or initiate negotiations on the marketplace,
            their inquiries and action controls will appear here.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[28px] border border-[#dfe7d8] bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#f8f9f3] text-[11px] font-bold uppercase tracking-wider text-[#57655d] border-b border-[#dfe7d8]">
                <tr>
                  <th className="py-4 px-5">Lot / Marketplace Listing</th>
                  <th className="py-4 px-4">Prospective Buyer</th>
                  <th className="py-4 px-4">Available Qty / Price</th>
                  <th className="py-4 px-4">Negotiation Status</th>
                  <th className="py-4 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf1ea] text-[#394a41]">
                {negotiations.map((item) => {
                  const isConcludedSold = item.accessRecord.accessStatus === "concluded_sold";
                  const isFellThrough = item.accessRecord.accessStatus === "deal_fell_through";
                  const isActive = !isConcludedSold && !isFellThrough;

                  return (
                    <tr key={item.accessRecord.accessId} className="hover:bg-[#fafbf8] transition">
                      <td className="py-4 px-5">
                        <div className="font-bold text-[#10251d] text-sm">{item.listing.title}</div>
                        <div className="flex items-center gap-2 mt-1 font-mono text-[11px] text-gray-500">
                          <span>Lot: {item.listing.lotId}</span>
                          <span>•</span>
                          <span>{item.listing.listingNumber}</span>
                        </div>
                      </td>

                      <td className="py-4 px-4">
                        <div className="flex items-center gap-1.5 font-bold text-[#10251d]">
                          <User size={13} className="text-[#2d6130]" />
                          <span>
                            {item.buyerProfile?.displayName ||
                              item.accessRecord.buyerUid ||
                              item.accessRecord.buyerId ||
                              "Verified Buyer"}
                          </span>
                        </div>
                        {item.buyerProfile?.email && (
                          <div className="flex items-center gap-1 text-[11px] text-gray-500 mt-0.5">
                            <Mail size={11} /> {item.buyerProfile.email}
                          </div>
                        )}
                        {item.buyerProfile?.phone && (
                          <div className="flex items-center gap-1 text-[11px] text-gray-500">
                            <Phone size={11} /> {item.buyerProfile.phone}
                          </div>
                        )}
                      </td>

                      <td className="py-4 px-4">
                        <div className="font-bold text-[#10251d]">
                          {item.listing.quantityAvailableKg.toLocaleString()} kg
                        </div>
                        <div className="text-[11px] text-gray-500">
                          {item.listing.pricePerKg.toLocaleString()} {item.listing.currency} / kg
                        </div>
                      </td>

                      <td className="py-4 px-4">
                        {isConcludedSold ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#edf7e8] border border-[#cdebc2] px-2.5 py-0.5 text-[10px] font-bold text-[#1d6a45]">
                            <CheckCircle2 size={12} /> Concluded (Pending Buyer)
                          </span>
                        ) : isFellThrough ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 border border-gray-200 px-2.5 py-0.5 text-[10px] font-bold text-gray-600">
                            <XCircle size={12} /> Deal Fell Through
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[10px] font-bold text-amber-800">
                            <Clock size={12} /> Active Negotiation
                          </span>
                        )}
                      </td>

                      <td className="py-4 px-5 text-right">
                        {isActive ? (
                          <div className="inline-flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => onConclude(item)}
                              className="inline-flex items-center gap-1 rounded-full bg-[#0b3528] px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-[#144737] cursor-pointer transition active:scale-95"
                            >
                              <Handshake size={13} />
                              Conclude Sale
                            </button>
                            <button
                              type="button"
                              onClick={() => onFellThrough(item)}
                              className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100 cursor-pointer transition active:scale-95"
                            >
                              <XCircle size={13} />
                              Fell Through
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] font-medium text-gray-400">
                            {isConcludedSold ? "Awaiting buyer confirmation" : "Lot released to market"}
                          </span>
                        )}
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
  );
};
