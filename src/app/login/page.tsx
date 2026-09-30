"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Navbar } from "@/components/Navbar";
import { useFirebase } from "@/context/FirebaseContext";
import { ShieldCheck, LogIn, CheckCircle2, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const { user, login, logout } = useFirebase();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      setError(null);
      await login();
      router.push("/marketplace");
    } catch (err: unknown) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : "Authentication failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f8f3] text-[#10251d]">
      <Navbar />

      <main className="flex min-h-[calc(100vh-6rem)] items-center justify-center px-5 py-12">
        <section className="w-full max-w-md rounded-[32px] border border-[#dfe7d8] bg-white/90 p-8 shadow-[0_20px_40px_rgba(16,37,29,0.08)] backdrop-blur-sm">
          <span className="text-xs font-bold uppercase tracking-[0.22em] text-[#2d6130]">
            Authentication
          </span>
          <h1 className="mt-3 text-3xl font-semibold text-[#10251d]">
            {user ? "Account Overview" : "Log in to CocoaTrace"}
          </h1>

          {error && (
            <div className="mt-4 flex items-center gap-2 rounded-2xl bg-red-50 p-4 text-sm text-red-700">
              <AlertCircle size={18} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {user ? (
            <div className="mt-6 space-y-6">
              <div className="flex items-center gap-3 rounded-2xl bg-[#edf7e8] p-4 text-[#1a4936]">
                <CheckCircle2 size={24} className="shrink-0 text-[#2a7a33]" />
                <div>
                  <p className="font-semibold">{user.displayName || "Authorized User"}</p>
                  <p className="text-xs opacity-75">{user.email}</p>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <Link
                  href="/marketplace"
                  className="w-full text-center rounded-full bg-[#b8f58b] px-5 py-3.5 text-base font-bold text-[#073b2b] shadow-[0_14px_28px_rgba(184,245,139,0.18)] transition-transform hover:-translate-y-0.5"
                >
                  Go to Marketplace
                </Link>
                <Link
                  href="/signup"
                  className="w-full text-center rounded-full border border-[#dfe7d8] bg-white px-5 py-3.5 text-base font-bold text-[#10251d] transition hover:bg-[#f7f8f3]"
                >
                  Register Farm Plot
                </Link>
                <button
                  type="button"
                  onClick={() => logout()}
                  className="w-full text-center rounded-full border border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-100 cursor-pointer"
                >
                  Log out
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-8 space-y-5">
              <p className="text-sm text-[#4b594f]">
                Sign in with your verified Google account to manage farm geofencing, issue traceability certificates, and trade Cameroonian cocoa.
              </p>

              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 rounded-full bg-[#0b3528] px-5 py-3.5 text-base font-bold text-white shadow-[0_14px_28px_rgba(11,53,40,0.18)] transition-all hover:bg-[#07241b] disabled:opacity-50 cursor-pointer"
              >
                <LogIn size={18} />
                {loading ? "Authenticating..." : "Continue with Google"}
              </button>

              <div className="flex items-center gap-3 rounded-2xl bg-[#edf7e8] p-4 text-xs text-[#1a4936]">
                <ShieldCheck size={20} className="shrink-0 text-[#2d6130]" />
                <span>
                  Protected by Firebase Enterprise Auth and zero-trust attribute security rules.
                </span>
              </div>

              <p className="mt-6 text-center text-sm text-[#4b594f]">
                Need to register your farm?{" "}
                <Link href="/signup" className="font-semibold text-[#2d6130]">
                  Register Your Farm
                </Link>
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
