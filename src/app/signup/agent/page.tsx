"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { useFirebase } from "@/context/FirebaseContext";
import { auth, db } from "@/lib/firebase";
import { doc, setDoc } from "firebase/firestore";
import {
  Truck,
  ShieldCheck,
  Building2,
  Mail,
  Lock,
  Phone,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Award,
} from "lucide-react";
import { AgentAccountType, AgentRole } from "@/types/agent";

const CORRIDORS = [
  "Ikom-Etung-Mamfe Cross-Border Corridor",
  "Mfum-Ekok Border Transit Axis",
  "Mamfe Central-Manyu Aggregation Belt",
  "Calabar Export & Maritime Terminal Corridor",
  "South-West Cameroon-Cross River Trans-Border Axis",
];

export default function AgentSignupPage() {
  const router = useRouter();
  const { signUpWithEmail, user } = useFirebase();

  // Account Type: Personal LBA vs Organizational Agency
  const [accountType, setAccountType] = useState<AgentAccountType>("organizational");

  // Credential Type: "email" | "phone"
  const [credentialType, setCredentialType] = useState<"email" | "phone">("email");

  // Organization Information (Organizational mode)
  const [agencyName, setAgencyName] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [agencyLicenseCode, setAgencyLicenseCode] = useState("");
  const [headquartersAddress, setHeadquartersAddress] = useState("");
  const [agencyPhone, setAgencyPhone] = useState("");
  const [agencyEmail, setAgencyEmail] = useState("");

  // Agent Representative / Personal Officer
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<AgentRole>("licensed_buying_agent");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [primaryCorridor, setPrimaryCorridor] = useState(CORRIDORS[0]);
  const [customCorridor, setCustomCorridor] = useState("");
  const [phone, setPhone] = useState("");

  // Login & Security Credentials
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Validation
    const effectiveAgencyName =
      accountType === "personal"
        ? `${fullName.trim()} Commodities (Independent LBA)`
        : agencyName.trim();

    if (!effectiveAgencyName) {
      setError("Agency or trading name is required.");
      return;
    }

    if (accountType === "organizational" && !registrationNumber.trim()) {
      setError("CAC or official registration number is required for organizational agencies.");
      return;
    }

    if (!fullName.trim()) {
      setError("Agent representative full name is required.");
      return;
    }

    const effectiveLicense =
      licenseNumber.trim() ||
      (accountType === "organizational" && agencyLicenseCode.trim()
        ? agencyLicenseCode.trim()
        : `CRS-LBA-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);

    const effectiveCorridor =
      primaryCorridor === "custom" ? customCorridor.trim() : primaryCorridor;

    if (!effectiveCorridor) {
      setError("Please specify your primary operating trade corridor.");
      return;
    }

    const cleanIdentifier = identifier.trim();
    if (!cleanIdentifier) {
      setError(credentialType === "email" ? "Email address is required." : "Phone number is required.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    let authEmail = cleanIdentifier;
    if (credentialType === "phone") {
      const cleanPhoneDigits = cleanIdentifier.replace(/\D/g, "");
      if (cleanPhoneDigits.length < 8) {
        setError("Please enter a valid phone number (at least 8 digits).");
        return;
      }
      authEmail = `phone_${cleanPhoneDigits}@phone.tracetrade.cm`;
    }

    try {
      setLoading(true);

      if (typeof window !== "undefined") {
        localStorage.setItem("cocoatrace_user_role", "agent");
        localStorage.setItem("cocoatrace_pending_role", "agent");
      }

      // 1. Create Firebase Auth account if not currently signed in
      let authUser = user;
      if (!authUser) {
        await signUpWithEmail(authEmail, password, fullName.trim());
        authUser = auth.currentUser;
      }

      if (!authUser) {
        throw new Error("Failed to authenticate user account.");
      }

      const orgId = `org_agt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const agentId = `agt_usr_${authUser.uid}`;
      const now = new Date().toISOString();

      const orgData = {
        id: orgId,
        name: effectiveAgencyName,
        registrationNumber: registrationNumber.trim() || `RC-AGT-${Date.now().toString().slice(-5)}`,
        licenseCode: effectiveLicense,
        headquarters:
          accountType === "personal"
            ? `${effectiveCorridor} Hub`
            : headquartersAddress.trim() || "Ikom Cocoa Terminal, Cross River State",
        contactEmail: credentialType === "email" ? cleanIdentifier : agencyEmail.trim() || `${authUser.uid}@tracetrade.cm`,
        contactPhone: phone.trim() || agencyPhone.trim() || "+234 800 000 0000",
        operatingCorridors: [effectiveCorridor],
        status: "active",
        createdBy: authUser.uid,
        createdAt: now,
        updatedAt: now,
      };

      const profileData = {
        id: agentId,
        userId: authUser.uid,
        fullName: fullName.trim(),
        email: credentialType === "email" ? cleanIdentifier : `${authUser.uid}@tracetrade.cm`,
        phone: phone.trim() || cleanIdentifier,
        accountType,
        agencyId: orgId,
        agencyName: effectiveAgencyName,
        role,
        licenseNumber: effectiveLicense,
        primaryCorridor: effectiveCorridor,
        status: "active",
        createdAt: now,
        updatedAt: now,
      };

      const userData = {
        id: authUser.uid,
        displayName: fullName.trim(),
        email: authUser.email || cleanIdentifier,
        phone: phone.trim() || cleanIdentifier,
        role: "agent",
        accountType: "agent",
        agencyId: orgId,
        agencyName: effectiveAgencyName,
        agentRole: role,
        licenseNumber: effectiveLicense,
        primaryCorridor: effectiveCorridor,
        createdAt: now,
        updatedAt: now,
      };

      // 2. Persist to Firestore
      try {
        await setDoc(doc(db, "agent_organizations", orgId), orgData);
        await setDoc(doc(db, "agent_profiles", agentId), profileData);
        await setDoc(doc(db, "agents", agentId), profileData);
        await setDoc(doc(db, "users", authUser.uid), userData, { merge: true });
      } catch (fsErr) {
        console.warn("Client Firestore write notice for agent:", fsErr);
      }

      // 3. Notify backend API to synchronize in-memory and persistence stores
      try {
        const token = await authUser.getIdToken();
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "x-user-uid": authUser.uid,
          Authorization: `Bearer ${token}`,
        };

        if (accountType === "organizational") {
          await fetch("/api/agent/account", {
            method: "POST",
            headers,
            body: JSON.stringify({
              action: "create_agency",
              ...orgData,
            }),
          });
        }

        await fetch("/api/agent/account", {
          method: "POST",
          headers,
          body: JSON.stringify(profileData),
        });
      } catch (apiErr) {
        console.warn("Agent API proxy sync notice:", apiErr);
      }

      if (typeof window !== "undefined") {
        localStorage.setItem("cocoatrace_user_role", "agent");
      }

      setSuccess("Buying Agent registration completed successfully! Redirecting to Agent Dashboard...");
      setTimeout(() => {
        router.push("/dashboard/agent");
      }, 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("auth/email-already-in-use")) {
        setError("This email or phone number is already registered. Please sign in instead.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f8f3] text-[#10251d]">
      <Navbar />

      <main className="mx-auto max-w-3xl px-4 pt-28 pb-20 sm:px-6 sm:pt-36 lg:px-8">
        <div className="mb-8 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#edf7e8] px-3.5 py-1 text-xs font-bold uppercase tracking-[0.2em] text-[#2d6130] border border-[#d2ecc8]">
            <Truck size={14} /> Buying Agent (LBA) Onboarding
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-[#10251d] sm:text-4xl">
            Register Buying Agent Account
          </h1>
          <p className="mt-2 text-sm text-[#57655d] max-w-xl mx-auto">
            Establish your Licensed Buying Agent (LBA) profile to aggregate cocoa from registered farmers, receive from cooperatives, and manage corridor custody handoffs to warehouses.
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-2xl bg-red-50 p-4 text-xs text-red-800 flex items-center gap-2 border border-red-200 shadow-xs">
            <AlertCircle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-6 rounded-2xl bg-green-50 p-4 text-xs text-green-800 flex items-center gap-2 border border-green-200 shadow-xs">
            <CheckCircle2 size={16} className="shrink-0" />
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8 rounded-[32px] border border-[#dfe7d8] bg-white p-6 sm:p-10 shadow-sm">
          {/* Account Type Selector */}
          <div>
            <label className="block text-sm font-bold text-[#10251d] mb-2">Select Agent Entity Type</label>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setAccountType("organizational")}
                className={`flex flex-col items-start p-4 rounded-2xl border transition cursor-pointer ${
                  accountType === "organizational"
                    ? "border-[#2d6130] bg-[#edf7e8] ring-2 ring-[#2d6130]"
                    : "border-[#dfe7d8] bg-[#fbfcf9] hover:border-gray-400"
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-[#10251d] text-sm">
                  <Building2 size={16} className="text-[#2d6130]" /> Corporate Agency
                </div>
                <p className="mt-1 text-xs text-[#57655d] text-left">
                  Register as an aggregation enterprise, trading company, or multi-officer LBA entity.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setAccountType("personal")}
                className={`flex flex-col items-start p-4 rounded-2xl border transition cursor-pointer ${
                  accountType === "personal"
                    ? "border-[#2d6130] bg-[#edf7e8] ring-2 ring-[#2d6130]"
                    : "border-[#dfe7d8] bg-[#fbfcf9] hover:border-gray-400"
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-[#10251d] text-sm">
                  <Award size={16} className="text-[#2d6130]" /> Independent LBA
                </div>
                <p className="mt-1 text-xs text-[#57655d] text-left">
                  Register as an individual Licensed Buying Agent operating your own corridor aggregation route.
                </p>
              </button>
            </div>
          </div>

          {/* Section 1: Agency Corporate Details (Shown if Organizational) */}
          {accountType === "organizational" && (
            <div className="p-5 rounded-2xl border border-[#edf1ea] bg-[#fafcf9] space-y-4">
              <div className="flex items-center gap-2 border-b border-[#edf1ea] pb-3 mb-2">
                <Building2 size={18} className="text-[#2d6130]" />
                <h2 className="text-base font-bold text-[#10251d]">Aggregation Agency Details</h2>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 text-xs">
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-[#10251d] mb-1">
                    Agency Corporate Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required={accountType === "organizational"}
                    placeholder="e.g. Cross River Border Commodities & Aggregation Agency Ltd"
                    value={agencyName}
                    onChange={(e) => setAgencyName(e.target.value)}
                    className="w-full rounded-xl border border-[#dfe7d8] bg-white p-3 text-xs font-medium outline-none focus:border-[#2d6130]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">
                    Trade / CAC Registration Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required={accountType === "organizational"}
                    placeholder="e.g. RC-AGT-CR-2026-009"
                    value={registrationNumber}
                    onChange={(e) => setRegistrationNumber(e.target.value)}
                    className="w-full rounded-xl border border-[#dfe7d8] bg-white p-3 text-xs font-mono outline-none focus:border-[#2d6130]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">
                    Corporate License Code
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. CRS-LBA-CORP-011"
                    value={agencyLicenseCode}
                    onChange={(e) => setAgencyLicenseCode(e.target.value)}
                    className="w-full rounded-xl border border-[#dfe7d8] bg-white p-3 text-xs font-mono outline-none focus:border-[#2d6130]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">Official Agency Phone</label>
                  <input
                    type="text"
                    placeholder="e.g. +234 802 334 5566"
                    value={agencyPhone}
                    onChange={(e) => setAgencyPhone(e.target.value)}
                    className="w-full rounded-xl border border-[#dfe7d8] bg-white p-3 text-xs font-medium outline-none focus:border-[#2d6130]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">Agency Contact Email</label>
                  <input
                    type="email"
                    placeholder="e.g. ops@crb-commodities.ng"
                    value={agencyEmail}
                    onChange={(e) => setAgencyEmail(e.target.value)}
                    className="w-full rounded-xl border border-[#dfe7d8] bg-white p-3 text-xs font-medium outline-none focus:border-[#2d6130]"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-semibold text-[#10251d] mb-1">
                    Headquarters / Operations Office Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required={accountType === "organizational"}
                    placeholder="e.g. Ikom Cocoa Exchange Building, Ikom, Cross River State"
                    value={headquartersAddress}
                    onChange={(e) => setHeadquartersAddress(e.target.value)}
                    className="w-full rounded-xl border border-[#dfe7d8] bg-white p-3 text-xs font-medium outline-none focus:border-[#2d6130]"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Section 2: Agent Representative Profile & License Details */}
          <div>
            <div className="flex items-center gap-2 border-b border-[#edf1ea] pb-3 mb-5">
              <ShieldCheck size={20} className="text-[#2d6130]" />
              <h2 className="text-lg font-bold text-[#10251d]">
                {accountType === "organizational"
                  ? "Authorized Officer / Representative Details"
                  : "Independent Buying Agent Details"}
              </h2>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 text-xs">
              <div className="sm:col-span-2">
                <label className="block font-semibold text-[#10251d] mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Chief Bassey Ekpeyong"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] p-3 text-xs font-medium outline-none focus:border-[#2d6130]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#10251d] mb-1">Role Designation</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as AgentRole)}
                  className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] p-3 text-xs font-semibold outline-none focus:border-[#2d6130]"
                >
                  <option value="licensed_buying_agent">Licensed Buying Agent (LBA)</option>
                  <option value="field_aggregating_officer">Field Aggregating Officer</option>
                  <option value="logistics_coordinator">Logistics Coordinator</option>
                  <option value="operations_manager">Operations Manager</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-[#10251d] mb-1">
                  LBA License Number / Accreditation Code
                </label>
                <input
                  type="text"
                  placeholder="e.g. CRS-LBA-2026-0042"
                  value={licenseNumber}
                  onChange={(e) => setLicenseNumber(e.target.value)}
                  className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] p-3 text-xs font-mono outline-none focus:border-[#2d6130]"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-semibold text-[#10251d] mb-1">
                  Primary Operating Corridor <span className="text-red-500">*</span>
                </label>
                <select
                  value={primaryCorridor}
                  onChange={(e) => setPrimaryCorridor(e.target.value)}
                  className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] p-3 text-xs font-medium outline-none focus:border-[#2d6130] mb-2"
                >
                  {CORRIDORS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  <option value="custom">Other / Custom Corridor...</option>
                </select>
                {primaryCorridor === "custom" && (
                  <input
                    type="text"
                    required
                    placeholder="Enter custom trade corridor or transit axis"
                    value={customCorridor}
                    onChange={(e) => setCustomCorridor(e.target.value)}
                    className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] p-3 text-xs font-medium outline-none focus:border-[#2d6130]"
                  />
                )}
              </div>

              <div className="sm:col-span-2">
                <label className="block font-semibold text-[#10251d] mb-1">
                  Officer Direct Phone Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  placeholder="e.g. +234 802 334 5566 or +237 670 123 456"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] p-3 text-xs font-medium outline-none focus:border-[#2d6130]"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Login & Security Credentials */}
          <div>
            <div className="flex items-center gap-2 border-b border-[#edf1ea] pb-3 mb-5">
              <Lock size={20} className="text-[#2d6130]" />
              <h2 className="text-lg font-bold text-[#10251d]">Login &amp; Security Credentials</h2>
            </div>

            <div className="space-y-4 text-xs">
              {/* Credential Type Switcher */}
              <div className="flex rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] p-1.5 max-w-xs">
                <button
                  type="button"
                  onClick={() => {
                    setCredentialType("email");
                    setIdentifier("");
                  }}
                  className={`flex-1 rounded-lg py-2 text-xs font-bold transition-all cursor-pointer ${
                    credentialType === "email"
                      ? "bg-white text-[#10251d] shadow-sm ring-1 ring-black/5"
                      : "text-[#57655d] hover:text-[#10251d]"
                  }`}
                >
                  Email Address
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCredentialType("phone");
                    setIdentifier("");
                  }}
                  className={`flex-1 rounded-lg py-2 text-xs font-bold transition-all cursor-pointer ${
                    credentialType === "phone"
                      ? "bg-white text-[#10251d] shadow-sm ring-1 ring-black/5"
                      : "text-[#57655d] hover:text-[#10251d]"
                  }`}
                >
                  Phone Number
                </button>
              </div>

              <div>
                <label className="block font-semibold text-[#10251d] mb-1">
                  {credentialType === "email" ? "Email Address" : "Phone Number"} <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  {credentialType === "email" ? (
                    <Mail size={15} className="absolute left-3.5 top-3.5 text-[#57655d]" />
                  ) : (
                    <Phone size={15} className="absolute left-3.5 top-3.5 text-[#57655d]" />
                  )}
                  <input
                    type={credentialType === "email" ? "email" : "tel"}
                    required
                    placeholder={
                      credentialType === "email"
                        ? "e.g. bassey.ekpeyong@crb-commodities.ng"
                        : "e.g. +234 802 334 5566"
                    }
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] py-3 pl-10 pr-3 text-xs font-medium outline-none focus:bg-white focus:border-[#2d6130]"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">
                    Password <span className="text-red-500">*</span> (6+ characters)
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] p-3 text-xs font-medium outline-none focus:border-[#2d6130]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">
                    Confirm Password <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] p-3 text-xs font-medium outline-none focus:border-[#2d6130]"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 flex items-center justify-between border-t border-[#edf1ea] pt-6">
            <Link
              href="/get-started"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[#57655d] hover:text-[#10251d]"
            >
              ← Back to Role Selection
            </Link>

            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-full bg-[#0b3528] px-8 py-3.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#144737] disabled:opacity-50 cursor-pointer"
            >
              {loading ? "Registering..." : "Complete LBA Registration & Enter Dashboard"} <ArrowRight size={15} />
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
