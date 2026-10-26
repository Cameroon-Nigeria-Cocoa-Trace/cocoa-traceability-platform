/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */
"use client";

import React, { useEffect, useState, useMemo, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { useFirebase } from "@/context/FirebaseContext";
import { auth } from "@/lib/firebase";
import { createCocoaApiClient } from "@/lib/cocoaApiClient";
import {
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  RefreshCw,
  ExternalLink,
  Lock,
  ShieldCheck,
  LogIn,
  Mail,
  KeyRound,
  RotateCcw,
} from "lucide-react";

function VerifyContent() {
  const searchParams = useSearchParams();
  const {
    user,
    loading: authLoading,
    loginWithGoogle,
    loginWithEmail,
    logout,
  } = useFirebase();

  const txRef =
    searchParams.get("tx_ref") ||
    searchParams.get("transaction_id") ||
    searchParams.get("paymentReference");

  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasAttempted, setHasAttempted] = useState(false);

  // In-place auth states for when cross-site redirect loses the active session
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showEmailForm, setShowEmailForm] = useState(false);

  const activeUser = user || auth.currentUser;

  const apiClient = useMemo(() => {
    return createCocoaApiClient(async () => {
      const currentUser = auth.currentUser || user;
      if (!currentUser) return null;
      try {
        return await currentUser.getIdToken(true);
      } catch (err) {
        console.warn("Could not retrieve fresh Firebase ID token:", err);
        return await currentUser.getIdToken();
      }
    });
  }, [user]);

  const verifyPayment = useCallback(async () => {
    if (!txRef) {
      setError("Missing transaction reference (tx_ref) in callback URL.");
      setVerifying(false);
      return;
    }

    const currentUser = auth.currentUser || user;
    if (!currentUser) {
      // Do not send an unauthenticated request that will fail with 401
      setVerifying(false);
      return;
    }

    setVerifying(true);
    setError(null);
    setHasAttempted(true);

    try {
      const res = await apiClient.get<any>(
        `/api/payments/flutterwave/verify?tx_ref=${encodeURIComponent(txRef)}`
      );
      setResult(res);
    } catch (err: any) {
      const errorMsg = err?.message || "Payment verification failed.";
      setError(errorMsg);
    } finally {
      setVerifying(false);
    }
  }, [txRef, apiClient, user]);

  // Trigger verification only after Firebase Auth is fully initialized
  useEffect(() => {
    if (authLoading) return;

    if (activeUser && !result && !hasAttempted) {
      verifyPayment();
    }
  }, [authLoading, activeUser, result, hasAttempted, verifyPayment]);

  const handleGoogleSignIn = async () => {
    setAuthSubmitting(true);
    setAuthError(null);
    try {
      await loginWithGoogle();
      // On successful login, the activeUser useEffect will trigger verifyPayment()
    } catch (err: any) {
      setAuthError(err?.message || "Google sign-in could not be completed.");
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail || !loginPass) {
      setAuthError("Please enter both email and password.");
      return;
    }
    setAuthSubmitting(true);
    setAuthError(null);
    try {
      await loginWithEmail(loginEmail.trim(), loginPass);
    } catch (err: any) {
      setAuthError(err?.message || "Email sign-in failed. Please check your credentials.");
    } finally {
      setAuthSubmitting(false);
    }
  };

  return (
    <div className="rounded-[32px] border border-[#dfe7d8] bg-white p-6 sm:p-8 shadow-sm">
      {/* 1. Loading state: Waiting for Firebase session restoration or actively verifying */}
      {authLoading ? (
        <div className="py-12 text-center">
          <RefreshCw size={40} className="mx-auto animate-spin text-[#2d6130]" />
          <h2 className="mt-4 text-xl font-bold text-[#10251d]">Restoring Authentication Session...</h2>
          <p className="mt-2 text-sm text-gray-500">
            Establishing secure connection before verifying transaction <span className="font-mono">{txRef || "..."}</span>
          </p>
        </div>
      ) : verifying ? (
        <div className="py-12 text-center">
          <RefreshCw size={40} className="mx-auto animate-spin text-[#2d6130]" />
          <h2 className="mt-4 text-xl font-bold text-[#10251d]">Verifying Flutterwave Payment...</h2>
          <p className="mt-2 text-sm text-gray-500">
            Reconciling transaction reference: <span className="font-mono font-bold text-[#10251d]">{txRef}</span>
          </p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#f4f7f0] px-4 py-1.5 text-xs text-[#2d6130] font-medium">
            <ShieldCheck size={14} /> Signed in as: {activeUser?.email || activeUser?.displayName || "Verified Buyer"}
          </div>
        </div>
      ) : !activeUser ? (
        /* 2. Unauthenticated state: Session dropped across redirect - allow quick sign-in without losing tx_ref */
        <div className="py-6 text-center max-w-lg mx-auto">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 text-amber-600 border border-amber-200">
            <Lock size={30} />
          </div>
          <h2 className="mt-4 text-2xl font-bold text-[#10251d]">Sign In to Verify Your Payment</h2>
          <p className="mt-2 text-sm text-gray-600">
            Your Flutterwave transaction <span className="font-mono font-bold text-[#10251d]">{txRef}</span> was received. Please sign in with your buyer account to complete verification and immediately unlock seller contact details.
          </p>

          {authError && (
            <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 text-left flex items-start gap-2">
              <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-600" />
              <span>{authError}</span>
            </div>
          )}

          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={authSubmitting}
              className="w-full flex items-center justify-center gap-3 rounded-full border border-[#dfe7d8] bg-white py-3 px-5 text-sm font-bold text-[#10251d] shadow-sm hover:bg-[#f8f9f3] transition cursor-pointer disabled:opacity-50"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              {authSubmitting ? "Signing in..." : "Continue with Google"}
            </button>

            {!showEmailForm ? (
              <button
                type="button"
                onClick={() => setShowEmailForm(true)}
                className="text-xs text-[#2d6130] font-semibold underline hover:text-[#1b3e21] mt-2 cursor-pointer"
              >
                Or sign in with email & password
              </button>
            ) : (
              <form onSubmit={handleEmailSignIn} className="mt-3 space-y-3 text-left">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Email Address</label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="buyer@example.com"
                      className="w-full rounded-xl border border-[#dfe7d8] pl-10 pr-3 py-2 text-sm focus:border-[#2d6130] focus:outline-none"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Password</label>
                  <div className="relative">
                    <KeyRound size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="password"
                      value={loginPass}
                      onChange={(e) => setLoginPass(e.target.value)}
                      placeholder="••••••••"
                      className="w-full rounded-xl border border-[#dfe7d8] pl-10 pr-3 py-2 text-sm focus:border-[#2d6130] focus:outline-none"
                      required
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={authSubmitting}
                  className="w-full rounded-full bg-[#0b3528] py-2.5 px-4 text-xs font-bold text-white shadow-sm hover:bg-[#144737] transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <LogIn size={14} /> {authSubmitting ? "Authenticating..." : "Sign In & Verify Payment"}
                </button>
              </form>
            )}
          </div>
        </div>
      ) : error ? (
        /* 3. Verification error state: Clearly state the error, provide retry, and account switch if needed */
        <div className="py-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600">
            <AlertCircle size={32} />
          </div>
          <h2 className="mt-4 text-2xl font-bold text-red-900">Verification Failed</h2>
          <p className="mt-2 text-sm text-red-700 max-w-lg mx-auto">{error}</p>

          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-gray-50 border border-gray-200 px-4 py-1.5 text-xs text-gray-600">
            <span>Reference: <strong className="font-mono text-gray-900">{txRef}</strong></span>
            <span>•</span>
            <span>Account: <strong className="text-gray-900">{activeUser?.email || activeUser?.uid}</strong></span>
          </div>

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => verifyPayment()}
              className="inline-flex items-center gap-2 rounded-full bg-[#0b3528] px-6 py-3 text-xs font-bold text-white shadow-sm hover:bg-[#144737] transition cursor-pointer"
            >
              <RotateCcw size={14} /> Retry Verification
            </button>
            <button
              type="button"
              onClick={async () => {
                await logout();
              }}
              className="inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white px-5 py-3 text-xs font-bold text-gray-700 hover:bg-gray-50 transition cursor-pointer"
            >
              Switch Account
            </button>
            <Link
              href="/marketplace"
              className="inline-flex items-center gap-2 rounded-full border border-[#dfe7d8] bg-white px-5 py-3 text-xs font-bold text-[#10251d] hover:bg-[#f7f8f3] transition"
            >
              <ArrowLeft size={14} /> Back to Marketplace
            </Link>
          </div>
        </div>
      ) : result && result.success ? (
        /* 4. Success state: Seller details unlocked */
        <div className="py-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#edf7e8] text-[#2d6130]">
            <CheckCircle2 size={36} />
          </div>
          <h2 className="mt-4 text-2xl font-bold text-[#10251d]">Seller Access Payment Successful!</h2>
          <p className="mt-2 text-sm text-gray-600 max-w-lg mx-auto">
            Payment verified securely via Flutterwave. Direct contact credentials and farm traceability for this listing have been unlocked for your account.
          </p>

          <div className="mt-6 rounded-2xl bg-[#f8f9f3] p-5 text-left text-xs space-y-2.5 border border-[#dfe7d8] max-w-md mx-auto">
            <div className="flex justify-between">
              <span className="text-gray-500">Payment Reference:</span>
              <span className="font-mono font-bold text-[#10251d]">
                {result.paymentRecord?.paymentReference || txRef}
              </span>
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
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0b3528] px-8 py-3 text-sm font-bold text-white shadow-sm hover:bg-[#144737] transition"
              >
                View Unlocked Listing <ExternalLink size={14} />
              </Link>
            )}
            <Link
              href="/marketplace"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-[#dfe7d8] bg-white px-8 py-3 text-sm font-bold text-[#10251d] hover:bg-[#f7f8f3] transition"
            >
              Return to Marketplace
            </Link>
          </div>
        </div>
      ) : (
        /* 5. Pending / Unresolved state */
        <div className="py-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <AlertCircle size={32} />
          </div>
          <h2 className="mt-4 text-2xl font-bold text-amber-900">
            Payment Status: {result?.paymentStatus || "Unresolved"}
          </h2>
          <p className="mt-2 text-sm text-gray-600 max-w-lg mx-auto">
            {result?.statusReason || "The payment verification returned an unfulfillable or pending status."}
          </p>

          <div className="mt-6 flex justify-center gap-4">
            <button
              type="button"
              onClick={() => verifyPayment()}
              className="inline-flex items-center gap-2 rounded-full bg-[#0b3528] px-6 py-3 text-xs font-bold text-white shadow-sm hover:bg-[#144737] transition cursor-pointer"
            >
              <RotateCcw size={14} /> Re-check Status
            </button>
            <Link
              href="/marketplace"
              className="inline-flex items-center gap-2 rounded-full border border-[#dfe7d8] bg-white px-6 py-3 text-xs font-bold text-[#10251d] hover:bg-[#f7f8f3] transition"
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
        <Suspense
          fallback={
            <div className="rounded-[32px] border border-[#dfe7d8] bg-white p-12 text-center">
              <RefreshCw size={36} className="mx-auto animate-spin text-[#2d6130]" />
              <h2 className="mt-4 text-base font-bold">Loading Verification...</h2>
            </div>
          }
        >
          <VerifyContent />
        </Suspense>
      </main>
    </div>
  );
}

