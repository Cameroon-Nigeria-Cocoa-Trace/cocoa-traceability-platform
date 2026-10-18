/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useEffect, useState, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { useFirebase } from "@/context/FirebaseContext";
import { createCocoaApiClient } from "@/lib/cocoaApiClient";
import { CheckCircle2, AlertCircle, ArrowLeft, RefreshCw, ExternalLink } from "lucide-react";

function VerifyContent() {
  const searchParams = useSearchParams();
  const { user } = useFirebase();

  const txRef = searchParams.get("tx_ref") || searchParams.get("transaction_id") || searchParams.get("paymentReference");

  const [verifying, setVerifying] = useState(true);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apiClient = useMemo(() => {
    return createCocoaApiClient(async () => {
      if (!user) return null;
      return await user.getIdToken();
    });
  }, [user]);

  useEffect(() => {
    async function verifyPayment() {
      if (!txRef) {
        setError("Missing transaction reference (tx_ref) in callback URL.");
        setVerifying(false);
        return;
      }

      try {
        const res = await apiClient.get<any>(
          `/api/payments/flutterwave/verify?tx_ref=${encodeURIComponent(txRef)}`
        );
        setResult(res);
      } catch (err: any) {
        setError(err.message || "Payment verification failed.");
      } finally {
        setVerifying(false);
      }
    }

    verifyPayment();
  }, [txRef, apiClient]);

  return (
    <div className="rounded-[32px] border border-[#dfe7d8] bg-white p-8 shadow-sm text-center">
      {verifying ? (
        <div className="py-12">
          <RefreshCw size={40} className="mx-auto animate-spin text-[#2d6130]" />
          <h2 className="mt-4 text-xl font-bold">Verifying Flutterwave Payment...</h2>
          <p className="mt-2 text-sm text-gray-500">
            Reconciling transaction reference: <span className="font-mono">{txRef}</span>
          </p>
        </div>
      ) : error ? (
        <div className="py-8">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600">
            <AlertCircle size={32} />
          </div>
          <h2 className="mt-4 text-2xl font-bold text-red-900">Verification Failed</h2>
          <p className="mt-2 text-sm text-red-700">{error}</p>
          <div className="mt-6 flex justify-center gap-4">
            <Link
              href="/marketplace"
              className="inline-flex items-center gap-2 rounded-full bg-[#0b3528] px-6 py-3 text-xs font-bold text-white shadow-sm hover:bg-[#144737]"
            >
              <ArrowLeft size={14} /> Back to Marketplace
            </Link>
          </div>
        </div>
      ) : result && result.success ? (
        <div className="py-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#edf7e8] text-[#2d6130]">
            <CheckCircle2 size={36} />
          </div>
          <h2 className="mt-4 text-2xl font-bold text-[#10251d]">Seller Access Payment Successful!</h2>
          <p className="mt-2 text-sm text-gray-600">
            Payment verified securely via Flutterwave. Direct contact credentials for the listing have been unlocked.
          </p>

          <div className="mt-6 rounded-2xl bg-[#f8f9f3] p-5 text-left text-xs space-y-2.5 border border-[#dfe7d8]">
            <div className="flex justify-between">
              <span className="text-gray-500">Payment Reference:</span>
              <span className="font-mono font-bold text-[#10251d]">{result.paymentRecord?.paymentReference || txRef}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Amount Paid:</span>
              <span className="font-bold text-[#2d6130]">
                ₦{(result.paymentRecord?.amountCharged || result.paymentRecord?.amount || 0).toLocaleString()} NGN
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Payment Status:</span>
              <span className="font-bold uppercase text-green-700">{result.paymentStatus}</span>
            </div>
            {result.accessRecord && (
              <div className="flex justify-between">
                <span className="text-gray-500">Seller Access ID:</span>
                <span className="font-mono font-semibold text-[#10251d]">{result.accessRecord.accessId}</span>
              </div>
            )}
          </div>

          <div className="mt-8 flex flex-col sm:flex-row justify-center gap-4">
            {result.paymentRecord?.listingId && (
              <Link
                href={`/product/${result.paymentRecord.listingId}`}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0b3528] px-8 py-3 text-sm font-bold text-white shadow-sm hover:bg-[#144737]"
              >
                View Unlocked Listing <ExternalLink size={14} />
              </Link>
            )}
            <Link
              href="/marketplace"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-[#dfe7d8] bg-white px-8 py-3 text-sm font-bold text-[#10251d] hover:bg-[#f7f8f3]"
            >
              Return to Marketplace
            </Link>
          </div>
        </div>
      ) : (
        <div className="py-8">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <AlertCircle size={32} />
          </div>
          <h2 className="mt-4 text-2xl font-bold text-amber-900">Payment Status: {result?.paymentStatus || "Unresolved"}</h2>
          <p className="mt-2 text-sm text-gray-600">{result?.statusReason || "The payment verification returned an unfulfillable or pending status."}</p>

          <div className="mt-6 flex justify-center gap-4">
            <Link
              href="/marketplace"
              className="inline-flex items-center gap-2 rounded-full bg-[#0b3528] px-6 py-3 text-xs font-bold text-white shadow-sm hover:bg-[#144737]"
            >
              <ArrowLeft size={14} /> Back to Marketplace
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FlutterwaveVerifyPage() {
  return (
    <div className="min-h-screen bg-[#f7f8f3] text-[#10251d]">
      <Navbar />
      <main className="mx-auto max-w-[800px] px-6 pt-32 pb-16">
        <Suspense fallback={
          <div className="rounded-[32px] border border-[#dfe7d8] bg-white p-12 text-center">
            <RefreshCw size={36} className="mx-auto animate-spin text-[#2d6130]" />
            <h2 className="mt-4 text-base font-bold">Loading Verification...</h2>
          </div>
        }>
          <VerifyContent />
        </Suspense>
      </main>
    </div>
  );
}
