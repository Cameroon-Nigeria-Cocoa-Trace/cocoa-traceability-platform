import React from 'react';
import { SellerNegotiationItem } from "@/types/traceability";
import { Handshake, AlertCircle, RefreshCw, X, Tag } from "lucide-react";

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
  if (loading) return <div>Loading negotiations...</div>;
  if (error) return <div className="text-red-500">{error}</div>;
  if (negotiations.length === 0) return <div>No negotiations found.</div>;

  return (
    <div className="overflow-hidden rounded-[28px] border border-[#dfe7d8] bg-white shadow-sm">
      <table className="w-full text-left text-xs">
        <thead className="bg-[#f8f9f3] text-[11px] font-bold uppercase tracking-wider text-[#57655d] border-b border-[#dfe7d8]">
          <tr>
            <th className="py-4 px-5">Lot / Listing</th>
            <th className="py-4 px-4">Buyer</th>
            <th className="py-4 px-4">Status</th>
            <th className="py-4 px-5 text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#edf1ea] text-[#394a41]">
          {negotiations.map((item) => (
            <tr key={item.accessRecord.accessId}>
              <td className="py-4 px-5">
                <div className="font-bold">{item.listing.title}</div>
                <div className="text-gray-500">{item.listing.lotId}</div>
              </td>
              <td className="py-4 px-4">
                {item.buyerProfile?.displayName || 'Unknown Buyer'}
              </td>
              <td className="py-4 px-4">
                <span className="capitalize">{item.accessRecord.accessStatus.replace('_', ' ')}</span>
              </td>
              <td className="py-4 px-5 text-right space-x-2">
                {item.listing.listingStatus === 'under_negotiation' && (
                  <>
                    <button
                      onClick={() => onConclude(item)}
                      className="bg-[#2d6130] text-white px-3 py-1 rounded-full text-[10px] font-bold"
                    >
                      Conclude Sale
                    </button>
                    <button
                      onClick={() => onFellThrough(item)}
                      className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-[10px] font-bold"
                    >
                      Deal Fell Through
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
