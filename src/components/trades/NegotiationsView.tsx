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
  FileText,
  Sparkles,
} from "lucide-react";

interface NegotiationsViewProps {
  negotiations: SellerNegotiationItem[];
  loading: boolean;
  error: string | null;
  respondingAccessId?: string | null;
  actionMessage?: string | null;
  actionError?: string | null;
  onRespondRequest: (
    accessId: string,
    action: "confirm" | "decline"
  ) => Promise<void> | void;
  onFellThrough: (item: SellerNegotiationItem) => void;
  onOpenOrdersTab?: () => void;
}

export const NegotiationsView = ({
  negotiations,
  loading,
  error,
  respondingAccessId = null,
  actionMessage = null,
  actionError = null,
  onRespondRequest,
  onFellThrough,
  onOpenOrdersTab,
}: NegotiationsViewProps) => {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[32px] border border-[#dfe7d8] bg-white p-16 text-center shadow-sm">
        <div className="h-8 w-8 rounded-full border-2 border-[#062d22] border-t-[#b8f58b] animate-spin" />
        <h3 className="mt-4 text-base font-bold text-[#10251d]">
          Loading Buyer Inquiries &amp; Negotiations...
        </h3>
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
      {/* Seller Informational Banner: Role of Buyer Inquiries & Negotiations in the PO Workflow */}
      <div className="rounded-[24px] border border-[#d2ecc8] bg-[#edf7e8] p-5 shadow-2xs">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#2d6130] text-white">
            <Info size={18} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-[#10251d] flex items-center gap-2">
              Manage Incoming Trade Requests &amp; Active Negotiations
            </h4>
            <p className="mt-1 text-xs leading-relaxed text-[#3c5044]">
              This tab shows every buyer who either paid to unlock your contact
              info or clicked <strong>Start Trade</strong> on one of your other
              listings. Confirm incoming trade requests to lock the cocoa as{" "}
              <em>Under Negotiation</em> and enable the buyer&apos;s Purchase
              Order form. If talks do not proceed to a Purchase Order, click{" "}
              <strong>Deal Fell Through</strong> to release the lot back to{" "}
              <em>Available</em> on the marketplace.
            </p>
          </div>
        </div>
      </div>

      {actionMessage && (
        <div className="rounded-2xl border border-[#cdebc2] bg-[#edf7e8] p-4 text-xs text-[#1d5128] flex items-center gap-2 font-semibold">
          <CheckCircle2 size={16} className="shrink-0" />
          <span>{actionMessage}</span>
        </div>
      )}

      {actionError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-800 flex items-center gap-2 font-semibold">
          <AlertCircle size={16} className="shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {negotiations.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[32px] border border-[#dfe7d8] bg-white p-16 text-center shadow-sm">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#f1f6ec] text-[#2d6130]">
            <Handshake size={28} />
          </div>
          <h3 className="mt-4 text-lg font-bold text-[#10251d]">
            No active buyer inquiries or trade requests
          </h3>
          <p className="mt-1 max-w-sm text-xs text-[#57655d]">
            When buyers unlock your seller contact info or request to start a
            trade on your other cocoa listings, their inquiries and confirmation
            controls will appear here.
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
                  const status = item.accessRecord.accessStatus;
                  const isPendingConfirmation =
                    status === "pending_seller_confirmation";
                  const isConcludedSold = status === "concluded_sold";
                  const isFellThrough = status === "deal_fell_through";
                  const isDeclined = status === "declined";
                  const isActive =
                    !isPendingConfirmation &&
                    !isConcludedSold &&
                    !isFellThrough &&
                    !isDeclined;
                  const isBusy =
                    respondingAccessId === item.accessRecord.accessId;
                  const isRepeatBuyerRequest =
                    item.accessRecord.accessType ===
                    "repeat_buyer_trade_request";

                  return (
                    <tr
                      key={item.accessRecord.accessId}
                      className={`hover:bg-[#fafbf8] transition ${
                        isPendingConfirmation ? "bg-amber-50/40" : ""
                      }`}
                    >
                      <td className="py-4 px-5">
                        <div className="font-bold text-[#10251d] text-sm">
                          {item.listing.title}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-1 font-mono text-[11px] text-gray-500">
                          <span>Lot: {item.listing.lotId}</span>
                          <span>•</span>
                          <span>{item.listing.listingNumber}</span>
                          {isRepeatBuyerRequest && (
                            <span className="rounded-full bg-[#edf7e8] border border-[#cdebc2] px-2 py-0.5 font-sans text-[10px] font-bold text-[#2d6130]">
                              Returning Buyer Request
                            </span>
                          )}
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
                          {(
                            Number(item.listing.quantityAvailableKg) || 0
                          ).toLocaleString()}{" "}
                          kg
                        </div>
                        <div className="text-[11px] text-gray-500">
                          {(Number(item.listing.pricePerKg) || 0).toLocaleString()}{" "}
                          {item.listing.currency} / kg
                        </div>
                      </td>

                      <td className="py-4 px-4">
                        {isPendingConfirmation ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-300 px-2.5 py-0.5 text-[10px] font-extrabold text-amber-900">
                            <Sparkles size={11} /> Pending Your Confirmation
                          </span>
                        ) : isConcludedSold ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#edf7e8] border border-[#cdebc2] px-2.5 py-0.5 text-[10px] font-bold text-[#1d6a45]">
                            <CheckCircle2 size={12} /> Sale Concluded
                          </span>
                        ) : isFellThrough ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 border border-gray-200 px-2.5 py-0.5 text-[10px] font-bold text-gray-600">
                            <XCircle size={12} /> Deal Fell Through
                          </span>
                        ) : isDeclined ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2.5 py-0.5 text-[10px] font-bold text-red-700">
                            <XCircle size={12} /> Request Declined
                          </span>
                        ) : item.purchaseOrder ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#edf7e8] border border-[#cdebc2] px-2.5 py-0.5 text-[10px] font-bold text-[#1d6a45]">
                            <FileText size={11} /> PO Active (
                            {item.purchaseOrder.poNumber})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[10px] font-bold text-amber-800">
                            <Clock size={12} /> Under Negotiation • Awaiting PO
                          </span>
                        )}
                      </td>

                      <td className="py-4 px-5 text-right">
                        {isPendingConfirmation ? (
                          <div className="inline-flex items-center justify-end gap-2">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() =>
                                onRespondRequest(
                                  item.accessRecord.accessId,
                                  "confirm"
                                )
                              }
                              className="inline-flex items-center gap-1 rounded-full bg-[#0b3528] px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-[#144737] disabled:opacity-50 cursor-pointer transition active:scale-95 whitespace-nowrap"
                            >
                              <CheckCircle2 size={13} />
                              {isBusy ? "Confirming..." : "Confirm & Start Trade"}
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() =>
                                onRespondRequest(
                                  item.accessRecord.accessId,
                                  "decline"
                                )
                              }
                              className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-50 cursor-pointer transition active:scale-95 whitespace-nowrap"
                            >
                              <XCircle size={13} />
                              Decline
                            </button>
                          </div>
                        ) : isActive ? (
                          <div className="inline-flex items-center justify-end gap-2">
                            {item.purchaseOrder && onOpenOrdersTab && (
                              <button
                                type="button"
                                onClick={onOpenOrdersTab}
                                className="inline-flex items-center gap-1 rounded-full bg-[#0b3528] px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-[#144737] cursor-pointer transition active:scale-95 whitespace-nowrap"
                              >
                                <FileText size={13} />
                                Review PO
                              </button>
                            )}
                            {!item.purchaseOrder && (
                              <button
                                type="button"
                                onClick={() => onFellThrough(item)}
                                className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100 cursor-pointer transition active:scale-95 whitespace-nowrap"
                              >
                                <XCircle size={13} />
                                Deal Fell Through
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] font-medium text-gray-400">
                            {isConcludedSold
                              ? "Order concluded"
                              : isDeclined
                                ? "Lot stayed available"
                                : "Lot released to market"}
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
