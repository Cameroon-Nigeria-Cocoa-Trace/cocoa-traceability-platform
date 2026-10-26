/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { useFirebase } from "@/context/FirebaseContext";
import { auth } from "@/lib/firebase";
import { Store, ShieldCheck, UserCheck, Mail, Lock, User, Building2, MapPin, Phone, AlertCircle, CheckCircle2, ArrowRight } from "lucide-react";
import { CooperativeAccountType } from "@/types/cooperative";

export default function CooperativeSignupPage() {
  const router = useRouter();
  const { signUpWithEmail, user } = useFirebase();

  // Account Type Selection
  const [accountType, setAccountType] = useState<CooperativeAccountType>("organizational");

  // Credential Type: "email" | "phone"
  const [credentialType, setCredentialType] = useState<"email" | "phone">("email");

  // Organization Information (Organizational mode)
  const [coopName, setCoopName] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [country, setCountry] = useState("Cameroon");
  const [region, setRegion] = useState("South-West Region");
  const [division, setDivision] = useState("Manyu Division");
  const [locality, setLocality] = useState("Mamfe Central");
  const [headquartersAddress, setHeadquartersAddress] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  // Authorized Representative / Personal User
  const [repName, setRepName] = useState("");
  const [repRole, setRepRole] = useState<"president" | "secretary" | "treasurer" | "field_officer" | "member">("president");

  // Additional Personal Cooperative Account Info
  const [personalPhone, setPersonalPhone] = useState("");
  const [personalRegion, setPersonalRegion] = useState("South-West Region");
  const [personalDivision, setPersonalDivision] = useState("Manyu Division");
  const [personalVillage, setPersonalVillage] = useState("");
  const [nationalIdRef, setNationalIdRef] = useState("");
  const [personalBio, setPersonalBio] = useState("");

  // User Account Credentials (Email or Phone + Password)
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Validation
    const effectiveCoopName = accountType === "personal" ? `${repName.trim()}'s Independent Cooperative Account` : coopName.trim();
    if (!effectiveCoopName) {
      setError("Cooperative name is required.");
      return;
    }
    if (accountType === "organizational" && !registrationNumber.trim()) {
      setError("Ministry registration number is required for organizational accounts.");
      return;
    }
    if (!repName.trim()) {
      setError("Full name is required.");
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

      // 1. Create Firebase Auth account
      let authUser = user;
      if (!authUser) {
        const cred = await signUpWithEmail(authEmail, password, repName.trim());
        authUser = (cred as any)?.user || auth.currentUser;
      }

      if (!authUser) {
        throw new Error("Failed to authenticate user account.");
      }

      const token = await authUser.getIdToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "x-user-uid": authUser.uid,
        Authorization: `Bearer ${token}`,
      };

      // 2. Create Organization record
      const fullRegionString =
        accountType === "personal"
          ? `${personalVillage || "Local Community"}, ${personalDivision}, ${personalRegion}, Cameroon`
          : `${locality}, ${division}, ${region}, ${country}`;

      const phoneToSave = accountType === "personal" ? personalPhone || cleanIdentifier : contactPhone;

      const orgRes = await fetch("/api/cooperative/account", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "create_organization",
          name: effectiveCoopName,
          registrationNumber: registrationNumber.trim() || `PERSONAL-REF-${authUser.uid.slice(0, 6)}`,
          region: fullRegionString,
          headquartersAddress: accountType === "personal" ? `${personalVillage || "Local Community"}, ${personalRegion}` : headquartersAddress.trim(),
          contactEmail: credentialType === "email" ? cleanIdentifier : `phone_${authUser.uid.substring(0, 8)}@tracetrade.cm`,
          contactPhone: phoneToSave.trim() || "+237 670 000 000",
          createdBy: authUser.uid,
        }),
      });
      const orgJson = await orgRes.json();
      if (!orgJson.success || !orgJson.organization) {
        throw new Error(orgJson.error || "Failed to create cooperative organization profile.");
      }

      const org = orgJson.organization;

      // 3. Create Cooperative Profile record
      const profRes = await fetch("/api/cooperative/account", {
        method: "POST",
        headers,
        body: JSON.stringify({
          userId: authUser.uid,
          fullName: repName.trim(),
          email: credentialType === "email" ? cleanIdentifier : `phone_${authUser.uid.substring(0, 8)}@tracetrade.cm`,
          phone: phoneToSave.trim() || "+237 670 000 000",
          accountType,
          cooperativeOrgId: org.id,
          cooperativeOrgName: org.name,
          // Every personal account is considered as an Independent Cooperative Member
          role: accountType === "personal" ? "member" : repRole,
        }),
      });
      const profJson = await profRes.json();
      if (!profJson.success || !profJson.profile) {
        throw new Error(profJson.error || "Failed to link user profile to cooperative organization.");
      }

      setSuccess("Cooperative registration completed successfully! Redirecting to dashboard...");
      setTimeout(() => {
        router.push("/dashboard/cooperative");
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
            <ShieldCheck size={14} /> Role 4 Cooperative Onboarding
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-[#10251d] sm:text-4xl">
            Register Cooperative Account
          </h1>
          <p className="mt-2 text-sm text-[#57655d] max-w-xl mx-auto">
            Choose whether you are registering as an organizational cooperative entity or a personal account using email or phone number.
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
            <label className="block text-sm font-bold text-[#10251d] mb-2">Select Account Type</label>
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
                  <Building2 size={16} className="text-[#2d6130]" /> Organizational
                </div>
                <p className="mt-1 text-xs text-[#57655d] text-left">
                  Register as an official cooperative society with Ministry registration number.
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
                  <UserCheck size={16} className="text-[#2d6130]" /> Personal
                </div>
                <p className="mt-1 text-xs text-[#57655d] text-left">
                  Register as an independent cooperative member (Individual Producer).
                </p>
              </button>
            </div>
          </div>

          {/* Section 1: Organization Information (Shown if Organizational) */}
          {accountType === "organizational" && (
            <div className="p-5 rounded-2xl border border-[#edf1ea] bg-[#fafcf9] space-y-4">
              <div className="flex items-center gap-2 border-b border-[#edf1ea] pb-3 mb-2">
                <Building2 size={18} className="text-[#2d6130]" />
                <h2 className="text-base font-bold text-[#10251d]">Cooperative Organization Information</h2>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 text-xs">
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-[#10251d] mb-1">
                    Official Cooperative Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required={accountType === "organizational"}
                    placeholder="e.g. Manyu Allied Cocoa Farmers Multi-Purpose Cooperative"
                    value={coopName}
                    onChange={(e) => setCoopName(e.target.value)}
                    className="w-full rounded-xl border border-[#dfe7d8] bg-white p-3 text-xs font-medium outline-none focus:border-[#2d6130]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">
                    Ministry Registration Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required={accountType === "organizational"}
                    placeholder="e.g. COOP-CMR-SW-2026-041"
                    value={registrationNumber}
                    onChange={(e) => setRegistrationNumber(e.target.value)}
                    className="w-full rounded-xl border border-[#dfe7d8] bg-white p-3 text-xs font-mono outline-none focus:border-[#2d6130]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">Country</label>
                  <input
                    type="text"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full rounded-xl border border-[#dfe7d8] bg-white p-3 text-xs font-medium outline-none focus:border-[#2d6130]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">Region / State</label>
                  <input
                    type="text"
                    placeholder="e.g. South-West Region"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    className="w-full rounded-xl border border-[#dfe7d8] bg-white p-3 text-xs font-medium outline-none focus:border-[#2d6130]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">Division / District</label>
                  <input
                    type="text"
                    placeholder="e.g. Manyu Division"
                    value={division}
                    onChange={(e) => setDivision(e.target.value)}
                    className="w-full rounded-xl border border-[#dfe7d8] bg-white p-3 text-xs font-medium outline-none focus:border-[#2d6130]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">Town / Village / Locality</label>
                  <input
                    type="text"
                    placeholder="e.g. Mamfe Central"
                    value={locality}
                    onChange={(e) => setLocality(e.target.value)}
                    className="w-full rounded-xl border border-[#dfe7d8] bg-white p-3 text-xs font-medium outline-none focus:border-[#2d6130]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">Official Phone Number</label>
                  <input
                    type="text"
                    placeholder="e.g. +237 677 889 900"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    className="w-full rounded-xl border border-[#dfe7d8] bg-white p-3 text-xs font-medium outline-none focus:border-[#2d6130]"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-semibold text-[#10251d] mb-1">
                    Headquarters Physical Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required={accountType === "organizational"}
                    placeholder="e.g. Commercial Avenue, Mamfe Headquarters Hub"
                    value={headquartersAddress}
                    onChange={(e) => setHeadquartersAddress(e.target.value)}
                    className="w-full rounded-xl border border-[#dfe7d8] bg-white p-3 text-xs font-medium outline-none focus:border-[#2d6130]"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Section 1B: Personal Cooperative Details (Shown if Personal) */}
          {accountType === "personal" && (
            <div className="p-5 rounded-2xl border border-[#edf1ea] bg-[#fafcf9] space-y-4">
              <div className="flex items-center gap-2 border-b border-[#edf1ea] pb-3 mb-2">
                <UserCheck size={18} className="text-[#2d6130]" />
                <h2 className="text-base font-bold text-[#10251d]">Personal Member Profile (Independent Cooperative Member)</h2>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 text-xs">
                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">
                    Personal Phone Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required={accountType === "personal"}
                    placeholder="e.g. +237 670 112 233"
                    value={personalPhone}
                    onChange={(e) => setPersonalPhone(e.target.value)}
                    className="w-full rounded-xl border border-[#dfe7d8] bg-white p-3 text-xs font-medium outline-none focus:border-[#2d6130]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">Region / State</label>
                  <input
                    type="text"
                    placeholder="e.g. South-West Region"
                    value={personalRegion}
                    onChange={(e) => setPersonalRegion(e.target.value)}
                    className="w-full rounded-xl border border-[#dfe7d8] bg-white p-3 text-xs font-medium outline-none focus:border-[#2d6130]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">Division / District</label>
                  <input
                    type="text"
                    placeholder="e.g. Manyu Division"
                    value={personalDivision}
                    onChange={(e) => setPersonalDivision(e.target.value)}
                    className="w-full rounded-xl border border-[#dfe7d8] bg-white p-3 text-xs font-medium outline-none focus:border-[#2d6130]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">Village / Community <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    required={accountType === "personal"}
                    placeholder="e.g. Ekok Village"
                    value={personalVillage}
                    onChange={(e) => setPersonalVillage(e.target.value)}
                    className="w-full rounded-xl border border-[#dfe7d8] bg-white p-3 text-xs font-medium outline-none focus:border-[#2d6130]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">National ID or Cadastral Reference (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. ID-CMR-991823"
                    value={nationalIdRef}
                    onChange={(e) => setNationalIdRef(e.target.value)}
                    className="w-full rounded-xl border border-[#dfe7d8] bg-white p-3 text-xs font-mono outline-none focus:border-[#2d6130]"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-semibold text-[#10251d] mb-1">Personal Bio / Farming Experience (Optional)</label>
                  <textarea
                    rows={2}
                    placeholder="Briefly describe your cocoa farming experience..."
                    value={personalBio}
                    onChange={(e) => setPersonalBio(e.target.value)}
                    className="w-full rounded-xl border border-[#dfe7d8] bg-white p-3 text-xs font-medium outline-none focus:border-[#2d6130] resize-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Section 2: Authorized Representative / Personal User Name */}
          <div>
            <div className="flex items-center gap-2 border-b border-[#edf1ea] pb-3 mb-5">
              <UserCheck size={20} className="text-[#2d6130]" />
              <h2 className="text-lg font-bold text-[#10251d]">
                {accountType === "organizational" ? "Authorized Representative" : "Personal User Details"}
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
                  placeholder="e.g. Tabe Victor Ashu"
                  value={repName}
                  onChange={(e) => setRepName(e.target.value)}
                  className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] p-3 text-xs font-medium outline-none focus:border-[#2d6130]"
                />
              </div>

              {accountType === "organizational" && (
                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">Position / Title</label>
                  <select
                    value={repRole}
                    onChange={(e) => setRepRole(e.target.value as any)}
                    className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] p-3 text-xs font-semibold outline-none focus:border-[#2d6130]"
                  >
                    <option value="president">President</option>
                    <option value="secretary">Secretary</option>
                    <option value="treasurer">Treasurer</option>
                    <option value="field_officer">Field Officer</option>
                    <option value="member">Member</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Section 3: User Account Credentials (Email or Phone Number) */}
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
                    placeholder={credentialType === "email" ? "e.g. victor.tabe@manyucoop.cm" : "e.g. +237 670 000 000"}
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
              {loading ? "Registering..." : "Complete Registration & Enter Dashboard"} <ArrowRight size={15} />
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
