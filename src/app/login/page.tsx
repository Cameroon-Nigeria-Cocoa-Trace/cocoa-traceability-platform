"use client";

import Link from "next/link";
import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { useFirebase } from "@/context/FirebaseContext";
import {
  LogIn,
  CheckCircle2,
  AlertCircle,
  Mail,
  Lock,
  Phone,
  ArrowRight,
} from "lucide-react";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f7f8f3]" />}>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const redirectUrl = searchParams.get("redirect");

  const {
    user,
    loginWithGoogle,
    loginWithEmail,
    logout,
    farms,
  } = useFirebase();

  // Identifier Type: "email" | "phone"
  const [identifierType, setIdentifierType] = useState<"email" | "phone">("email");

  // Form states
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const parseAuthError = (err: unknown) => {
    if (!(err instanceof Error)) {
      return {
        title: "Authentication failed. Please try again.",
        detail: null,
      };
    }
    const msg = err.message || "";
    if (msg.includes("auth/operation-not-allowed") || msg.includes("OPERATION_NOT_ALLOWED")) {
      return {
        title: "Email/Password sign-in is disabled in your Firebase console.",
        detail:
          "In Firebase Console, navigate to Authentication → Sign-in method, select 'Email/Password' and switch Enable to ON.",
      };
    }
    if (msg.includes("auth/unauthorized-domain")) {
      const hostname = typeof window !== "undefined" ? window.location.hostname : "this domain";
      return {
        title: `Domain '${hostname}' is not authorized in Firebase.`,
        detail:
          "To enable Google Sign-In for this preview URL: In Firebase Console → Authentication → Settings → Authorized domains, add your current domain.",
      };
    }
    if (msg.includes("auth/popup-blocked")) {
      return {
        title: "Sign-in popup was blocked by your browser or iframe.",
        detail: "Please allow popups for this site, or use the Email/Phone sign-in below.",
      };
    }
    if (
      msg.includes("auth/invalid-credential") ||
      msg.includes("auth/wrong-password") ||
      msg.includes("auth/user-not-found")
    ) {
      return {
        title: "Invalid credentials. Please verify your email/phone and password.",
        detail: null,
      };
    }
    if (msg.includes("auth/weak-password")) {
      return {
        title: "Password must be at least 6 characters.",
        detail: null,
      };
    }
    if (msg.includes("auth/invalid-email")) {
      return {
        title: "Please enter a valid email address.",
        detail: null,
      };
    }
    if (msg.includes("auth/popup-closed-by-user")) {
      return {
        title: "Sign-in popup was closed before completing.",
        detail: null,
      };
    }
    return {
      title: err.message,
      detail: null,
    };
  };

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      setError(null);
      setErrorDetails(null);
      await loginWithGoogle();
      setSuccess("Connected with Google successfully!");
      if (redirectUrl) {
        setTimeout(() => {
          router.push(redirectUrl);
        }, 500);
      } else {
        setTimeout(() => {
          router.push("/dashboard");
        }, 500);
      }
    } catch (err: unknown) {
      console.error("Google Auth Error:", err);
      const parsed = parseAuthError(err);
      setError(parsed.title);
      setErrorDetails(parsed.detail);
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setErrorDetails(null);
    setSuccess(null);

    const cleanInput = identifier.trim();
    if (!cleanInput || !password) {
      setError(`Please fill in both ${identifierType === "email" ? "email address" : "phone number"} and password.`);
      return;
    }

    let authEmail = cleanInput;
    if (identifierType === "phone") {
      const cleanPhone = cleanInput.replace(/\D/g, "");
      if (cleanPhone.length < 8) {
        setError("Please enter a valid phone number (at least 8 digits).");
        return;
      }
      authEmail = `phone_${cleanPhone}@phone.tracetrade.cm`;
    }

    try {
      setLoading(true);
      await loginWithEmail(authEmail, password);
      setSuccess("Signed in successfully!");
      if (redirectUrl) {
        setTimeout(() => {
          router.push(redirectUrl);
        }, 500);
      } else {
        setTimeout(() => {
          router.push("/dashboard");
        }, 500);
      }
    } catch (err: unknown) {
      console.error("Auth Error:", err);
      const parsed = parseAuthError(err);
      setError(parsed.title);
      setErrorDetails(parsed.detail);
    } finally {
      setLoading(false);
    }
  };

  const userFarmsCount = user ? farms.filter((f) => f.farmerId === user.uid).length : 0;

  return (
    <div className="min-h-screen bg-[#f7f8f3] text-[#10251d]">
      <Navbar />

      <main className="flex min-h-screen items-center justify-center px-4 pt-28 pb-16 sm:px-6 sm:pt-32">
        <section className="w-full max-w-md rounded-[32px] border border-[#dfe7d8] bg-white p-7 shadow-[0_20px_40px_rgba(16,37,29,0.08)] sm:p-9">
          <div>
            <span className="text-xs font-bold uppercase tracking-[0.22em] text-[#2d6130]">
              Account Portal
            </span>
          </div>

          <h1 className="mt-2 text-2xl font-semibold text-[#10251d] sm:text-3xl">
            {user ? "Your Account" : "Sign In"}
          </h1>
          <p className="mt-1 text-xs text-[#57655d]">
            {user
              ? "Manage your verified profile, farm records, and supply chain certificates."
              : "Access your farm plots and verified traceability records."}
          </p>

          {error && (
            <div className="mt-4 rounded-2xl bg-red-50 p-4 text-xs text-red-800 border border-red-200">
              <div className="flex items-start gap-2">
                <AlertCircle size={16} className="shrink-0 text-red-600 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold">{error}</p>
                  {errorDetails && <p className="text-[0.72rem] text-red-700 leading-relaxed">{errorDetails}</p>}
                </div>
              </div>
            </div>
          )}

          {success && (
            <div className="mt-4 flex items-center gap-2 rounded-2xl bg-[#edf7e8] p-3.5 text-xs text-[#1a4936]">
              <CheckCircle2 size={16} className="shrink-0 text-[#2a7a33]" />
              <span>{success}</span>
            </div>
          )}

          {user ? (
            /* Logged In View */
            <div className="mt-6 space-y-5">
              <div className="rounded-2xl border border-[#edf1ea] bg-[#fafcf9] p-4 text-xs text-[#394a41]">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0b3528] text-white font-bold">
                    {(user.displayName || user.email || "U")[0].toUpperCase()}
                  </div>
                  <div className="overflow-hidden">
                    <p className="font-bold text-[#10251d] truncate">
                      {user.displayName || "Verified User"}
                    </p>
                    <p className="text-[11px] text-[#57655d] truncate">{user.email}</p>
                    <p className="mt-1 text-[10px] font-mono text-[#2d6130]">
                      UID: {user.uid.substring(0, 12)}...
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 border-t border-[#edf1ea] pt-3">
                  <div className="rounded-xl bg-white p-2.5 border border-[#edf1ea] text-center">
                    <p className="text-[10px] text-[#57655d]">Registered Farms</p>
                    <p className="text-sm font-bold text-[#10251d]">{userFarmsCount}</p>
                  </div>
                  <div className="rounded-xl bg-white p-2.5 border border-[#edf1ea] text-center">
                    <p className="text-[10px] text-[#57655d]">Account Status</p>
                    <p className="text-sm font-bold text-[#2d6130]">Active</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Link
                  href="/dashboard"
                  className="w-full flex items-center justify-center gap-2 rounded-full bg-[#0b3528] px-5 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-[#144737]"
                >
                  Go to Dashboard <ArrowRight size={14} />
                </Link>
                <button
                  type="button"
                  onClick={() => logout()}
                  className="w-full rounded-full border border-red-200 bg-red-50 px-5 py-2.5 text-xs font-semibold text-red-700 transition hover:bg-red-100 cursor-pointer"
                >
                  Sign Out
                </button>
              </div>
            </div>
          ) : (
            /* Sign In Form */
            <div className="mt-6 space-y-4">
              {/* Identifier Type Switcher */}
              <div className="flex rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-1.5 shadow-inner">
                <button
                  type="button"
                  onClick={() => {
                    setIdentifierType("email");
                    setIdentifier("");
                    setError(null);
                  }}
                  className={`flex-1 rounded-xl py-2 text-xs font-bold transition-all cursor-pointer ${
                    identifierType === "email"
                      ? "bg-white text-[#10251d] shadow-sm ring-1 ring-black/5"
                      : "text-[#57655d] hover:text-[#10251d]"
                  }`}
                >
                  Email Address
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIdentifierType("phone");
                    setIdentifier("");
                    setError(null);
                  }}
                  className={`flex-1 rounded-xl py-2 text-xs font-bold transition-all cursor-pointer ${
                    identifierType === "phone"
                      ? "bg-white text-[#10251d] shadow-sm ring-1 ring-black/5"
                      : "text-[#57655d] hover:text-[#10251d]"
                  }`}
                >
                  Phone Number
                </button>
              </div>

              {/* Google OAuth Button */}
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 rounded-2xl border border-[#dfe7d8] bg-white px-4 py-3 text-xs font-bold text-[#10251d] shadow-sm transition hover:bg-[#f7f8f3] disabled:opacity-50 cursor-pointer"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.14z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.03 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                  />
                </svg>
                Continue with Google
              </button>

              <div className="relative my-3 flex items-center justify-center">
                <div className="h-px w-full bg-[#dfe7d8]" />
                <span className="absolute bg-white px-2 text-[0.68rem] uppercase font-bold text-[#6f7e73]">
                  Or with credentials
                </span>
              </div>

              {/* Login Form */}
              <form onSubmit={handleAuth} className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#48574c]">
                    {identifierType === "email" ? "Email Address *" : "Phone Number *"}
                  </label>
                  <div className="relative">
                    {identifierType === "email" ? (
                      <Mail size={14} className="absolute left-3.5 top-3.5 text-[#57655d]" />
                    ) : (
                      <Phone size={14} className="absolute left-3.5 top-3.5 text-[#57655d]" />
                    )}
                    <input
                      type={identifierType === "email" ? "email" : "tel"}
                      required
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder={identifierType === "email" ? "farmer@cocoatrace.cm" : "+237 600 000 000"}
                      className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] py-2.5 pl-9 pr-3 text-xs text-[#10251d] outline-none transition focus:bg-white focus:border-[#2d6130]"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#48574c]">
                    Password *
                  </label>
                  <div className="relative">
                    <Lock size={14} className="absolute left-3.5 top-3.5 text-[#57655d]" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] py-2.5 pl-9 pr-3 text-xs text-[#10251d] outline-none transition focus:bg-white focus:border-[#2d6130]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 rounded-full bg-[#0b3528] py-3 text-xs font-bold text-white shadow-sm transition hover:bg-[#144737] disabled:opacity-50 cursor-pointer mt-2"
                >
                  <LogIn size={15} />
                  {loading ? "Signing In..." : "Sign In"}
                </button>
              </form>

              {/* Redirect to Get Started */}
              <div className="mt-6 border-t border-[#edf1ea] pt-4 text-center text-xs text-[#57655d]">
                Don&apos;t have an account?{" "}
                <Link
                  href="/get-started"
                  className="font-bold text-[#2d6130] underline hover:text-[#10251d]"
                >
                  Sign up here
                </Link>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
