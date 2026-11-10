"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { useFirebase } from "@/context/FirebaseContext";
import { auth, db } from "@/lib/firebase";
import { doc, setDoc } from "firebase/firestore";
import {
  Building2,
  ShieldCheck,
  Mail,
  Phone,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Boxes,
  Clock,
} from "lucide-react";
import { WarehouseFacility, WarehouseOrganization } from "@/types/warehouse";
import { warehouseStore } from "@/lib/warehouse/warehouseStore";

export default function WarehouseSignupPage() {
  const router = useRouter();
  const { signUpWithEmail, user } = useFirebase();

  // Facility Type
  const [facilityType, setFacilityType] = useState<"bonded" | "inland">("bonded");

  // Facility Details
  const [facilityName, setFacilityName] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [address, setAddress] = useState("");
  const [cityOrLGA, setCityOrLGA] = useState("");
  const [stateOrRegion, setStateOrRegion] = useState("Cross River State");
  const [country, setCountry] = useState<"Nigeria" | "Cameroon">("Nigeria");
  const [operatingHours, setOperatingHours] = useState("07:00 - 19:00 WAT");
  const [latitude, setLatitude] = useState<string>("");
  const [longitude, setLongitude] = useState<string>("");
  const [capacityTonnes, setCapacityTonnes] = useState<number>(300);

  // Facility Custodian / Manager Details
  const [managerFullName, setManagerFullName] = useState("");
  const [credentialType, setCredentialType] = useState<"email" | "phone">("email");
  const [identifier, setIdentifier] = useState("");
  const [managerPhone, setManagerPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const capacityKg = Math.max(0, capacityTonnes * 1000);
  const capacityBags = Math.floor(capacityKg / 64);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Validation
    const cleanFacilityName = facilityName.trim();
    if (!cleanFacilityName) {
      setError("Please provide a facility name.");
      return;
    }

    if (capacityTonnes <= 0) {
      setError("Storage capacity must be greater than 0 metric tonnes.");
      return;
    }

    const cleanAddress = address.trim();
    if (!cleanAddress) {
      setError("Physical terminal address is required.");
      return;
    }

    const cleanCityOrLGA = cityOrLGA.trim();
    if (!cleanCityOrLGA) {
      setError("City or LGA is required.");
      return;
    }

    const cleanLat = String(latitude).trim();
    const cleanLng = String(longitude).trim();
    if (!cleanLat || !cleanLng) {
      setError("Please provide both GPS Latitude and GPS Longitude.");
      return;
    }

    const numLat = Number(cleanLat);
    const numLng = Number(cleanLng);
    if (isNaN(numLat) || numLat < -90 || numLat > 90) {
      setError("Please enter a valid GPS latitude between -90 and 90.");
      return;
    }
    if (isNaN(numLng) || numLng < -180 || numLng > 180) {
      setError("Please enter a valid GPS longitude between -180 and 180.");
      return;
    }

    const cleanManagerName = managerFullName.trim();
    if (!cleanManagerName) {
      setError("Facility custodian / manager full name is required.");
      return;
    }

    const cleanIdentifier = identifier.trim();
    if (!cleanIdentifier) {
      setError(
        credentialType === "email"
          ? "Manager email address is required."
          : "Manager phone number is required."
      );
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
      authEmail = `wh_phone_${cleanPhoneDigits}@phone.tracetrade.cm`;
    }

    try {
      setLoading(true);

      if (typeof window !== "undefined") {
        localStorage.setItem("cocoatrace_user_role", "warehouse");
        localStorage.setItem("cocoatrace_pending_role", "warehouse");
      }

      // 1. Create or verify Firebase Auth user
      let authUser = user;
      if (!authUser) {
        await signUpWithEmail(authEmail, password, cleanManagerName);
        authUser = auth.currentUser;
      }

      if (!authUser) {
        throw new Error("Failed to create authenticated user account.");
      }

      const now = new Date().toISOString();
      const facilityId = `wh_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const orgId = `org_${facilityId}`;
      const effectiveLicense =
        licenseNumber.trim() ||
        (facilityType === "bonded"
          ? `NCS-WH-CAL-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`
          : `CRS-INL-WH-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`);

      // 2. Automatically link corporate organization record without demanding separate redundant paperwork
      const orgRecord: WarehouseOrganization = {
        id: orgId,
        name: cleanFacilityName,
        registrationNumber: `REG-WH-${Date.now().toString().slice(-6)}`,
        customsBondedWarehouseCode:
          facilityType === "bonded" ? effectiveLicense : undefined,
        headquartersAddress:
          address.trim() || `${cityOrLGA} Industrial Hub, ${stateOrRegion}`,
        contactEmail:
          credentialType === "email"
            ? cleanIdentifier
            : `${authUser.uid}@tracetrade.cm`,
        contactPhone: managerPhone.trim() || cleanIdentifier,
        facilities: [facilityId],
        status: "active",
        createdAt: now,
        updatedAt: now,
      };

      // 3. Build Facility Record
      const facilityRecord: WarehouseFacility = {
        id: facilityId,
        organizationId: orgId,
        name: cleanFacilityName,
        licenseNumber: effectiveLicense,
        location: {
          address: cleanAddress,
          cityOrLGA: cleanCityOrLGA,
          stateOrRegion: stateOrRegion.trim() || "Cross River State",
          country,
          latitude: numLat,
          longitude: numLng,
          operatingHours: operatingHours.trim() || "07:00 - 19:00 WAT",
        },
        capacityKg,
        capacityBags,
        currentStockKg: 0,
        currentStockBags: 0,
        availableCapacityKg: capacityKg,
        operationalStatus: "operational",
        adminStatus: "active",
        managerUserId: authUser.uid,
        contactEmail:
          credentialType === "email"
            ? cleanIdentifier
            : `${authUser.uid}@tracetrade.cm`,
        contactPhone: managerPhone.trim() || cleanIdentifier,
        createdAt: now,
        updatedAt: now,
      };

      // 4. Save to Firestore
      await setDoc(doc(db, "warehouse_organizations", orgId), orgRecord).catch((err) =>
        console.warn("Firestore error org:", err)
      );
      await setDoc(doc(db, "warehouse_facilities", facilityId), facilityRecord).catch((err) =>
        console.warn("Firestore error facility:", err)
      );

      // 5. Update user document in Firestore
      const userDocData = {
        id: authUser.uid,
        displayName: cleanManagerName,
        email: authUser.email || (credentialType === "email" ? cleanIdentifier : ""),
        phone: managerPhone.trim() || cleanIdentifier,
        role: "warehouse",
        accountType: "warehouse",
        facilityId,
        facilityName: cleanFacilityName,
        organizationId: orgId,
        organizationName: cleanFacilityName,
        licenseNumber: effectiveLicense,
        updatedAt: now,
      };

      await setDoc(doc(db, "users", authUser.uid), userDocData, { merge: true }).catch((err) =>
        console.warn("Firestore error user:", err)
      );

      // Save to memory store
      await warehouseStore.saveFacility(facilityRecord);
      await warehouseStore.saveOrganization(orgRecord);

      setSuccess("Warehouse facility registered successfully! Opening your workspace...");
      setTimeout(() => {
        router.push("/dashboard/warehouse");
      }, 1000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || "Failed to complete registration. Please check your details and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f8f3] text-[#10251d]">
      <Navbar />

      <main className="mx-auto max-w-3xl px-4 pt-28 pb-20 sm:px-6 sm:pt-36 lg:px-8">
        {/* Header */}
        <div className="text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#edf7e8] px-3.5 py-1 text-xs font-bold uppercase tracking-[0.2em] text-[#2d6130] border border-[#d2ecc8]">
            <Building2 size={14} /> Warehouse Custody Onboarding
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-[#10251d] sm:text-4xl">
            Register Warehouse Facility
          </h1>
          <p className="mt-2 text-sm sm:text-base text-[#57655d] max-w-xl mx-auto">
            Set up your storage facility to receive traceable cocoa lots, manage physical custody,
            inspect moisture, and apply for Cross River State statutory export trace certificates.
          </p>
        </div>

        {/* Facility Type Selector */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => setFacilityType("bonded")}
            className={`p-5 rounded-2xl border text-left transition cursor-pointer ${
              facilityType === "bonded"
                ? "border-[#2d6130] bg-[#edf7e8] shadow-sm ring-2 ring-[#2d6130]"
                : "border-gray-200 bg-white hover:border-gray-300"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-[#10251d]">Customs Bonded Terminal</span>
              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-[#0b3528] text-white">
                Export Terminal
              </span>
            </div>
            <p className="text-xs text-[#57655d] leading-relaxed">
              Export terminal or port complex handling export-ready cocoa, international fumigation, and customs clearance.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setFacilityType("inland")}
            className={`p-5 rounded-2xl border text-left transition cursor-pointer ${
              facilityType === "inland"
                ? "border-[#2d6130] bg-[#edf7e8] shadow-sm ring-2 ring-[#2d6130]"
                : "border-gray-200 bg-white hover:border-gray-300"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-[#10251d]">Inland Aggregation Depot</span>
              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-emerald-800 text-white">
                Transit Hub
              </span>
            </div>
            <p className="text-xs text-[#57655d] leading-relaxed">
              Upcountry aggregation depot or border transit hub (Ikom, Akamkpa, Mamfe corridor) receiving lots from agents and cooperatives.
            </p>
          </button>
        </div>

        {/* Streamlined Registration Form */}
        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-start gap-3">
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Notice</p>
                <p className="text-xs mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {success && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 flex items-start gap-3">
              <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Success!</p>
                <p className="text-xs mt-0.5">{success}</p>
              </div>
            </div>
          )}

          {/* Section 1: Facility & Storage Specifications */}
          <div className="rounded-3xl border border-[#dfe7d8] bg-white p-6 sm:p-8 shadow-sm">
            <div className="flex items-center gap-3 border-b border-gray-100 pb-4 mb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#edf7e8] text-[#2d6130]">
                <Boxes size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-[#10251d]">1. Facility & Storage Details</h2>
                <p className="text-xs text-[#57655d]">Location, rated capacity, and operating corridor</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-[#57655d] mb-1.5">
                  Facility Name *
                </label>
                <input
                  type="text"
                  required
                  value={facilityName}
                  onChange={(e) => setFacilityName(e.target.value)}
                  placeholder="e.g. Calabar Port Maritime Export Facility or Ikom Central Depot"
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-[#10251d] focus:border-[#2d6130] focus:ring-1 focus:ring-[#2d6130] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#57655d] mb-1.5">
                  License / Terminal Code (Optional)
                </label>
                <input
                  type="text"
                  value={licenseNumber}
                  onChange={(e) => setLicenseNumber(e.target.value)}
                  placeholder="e.g. NCS-WH-CAL-2026-08 (or auto-assigned)"
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-[#10251d] focus:border-[#2d6130] focus:ring-1 focus:ring-[#2d6130] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#57655d] mb-1.5">
                  Operating Hours
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={operatingHours}
                    onChange={(e) => setOperatingHours(e.target.value)}
                    placeholder="e.g. 06:00 - 20:00 WAT"
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 pl-9 text-sm text-[#10251d] focus:border-[#2d6130] focus:ring-1 focus:ring-[#2d6130] outline-none"
                  />
                  <Clock size={16} className="absolute left-3 top-3 text-gray-400" />
                </div>
              </div>

              {/* Capacity Calculation Block */}
              <div className="sm:col-span-2 rounded-2xl bg-[#f8faf7] border border-[#e1ebd9] p-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-[#2d6130] mb-1">
                      Rated Storage Capacity (Metric Tonnes) *
                    </label>
                    <input
                      type="number"
                      required
                      min={1}
                      max={100000}
                      value={capacityTonnes}
                      onChange={(e) => setCapacityTonnes(Number(e.target.value))}
                      className="w-44 rounded-xl border border-gray-300 bg-white px-4 py-2 text-base font-bold text-[#10251d] focus:border-[#2d6130] focus:ring-1 focus:ring-[#2d6130] outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3 w-full sm:w-auto">
                    <div className="rounded-xl bg-white border border-[#dfe7d8] px-3.5 py-2 text-center">
                      <span className="text-[10px] uppercase font-bold text-[#57655d] block">Total In Kg</span>
                      <span className="text-sm font-bold text-[#0b3528]">
                        {capacityKg.toLocaleString()} kg
                      </span>
                    </div>
                    <div className="rounded-xl bg-white border border-[#dfe7d8] px-3.5 py-2 text-center">
                      <span className="text-[10px] uppercase font-bold text-[#57655d] block">Export Jute Bags (64kg)</span>
                      <span className="text-sm font-bold text-[#2d6130]">
                        {capacityBags.toLocaleString()} bags
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-[#57655d] mb-1.5">
                  Physical Terminal Address *
                </label>
                <input
                  type="text"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g. Berth 4, Calabar Free Trade Zone Port Complex"
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-[#10251d] focus:border-[#2d6130] focus:ring-1 focus:ring-[#2d6130] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#57655d] mb-1.5">
                  City / LGA *
                </label>
                <input
                  type="text"
                  required
                  value={cityOrLGA}
                  onChange={(e) => setCityOrLGA(e.target.value)}
                  placeholder="e.g. Calabar South or Ikom"
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-[#10251d] focus:border-[#2d6130] focus:ring-1 focus:ring-[#2d6130] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#57655d] mb-1.5">
                  State / Region & Country *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    required
                    value={stateOrRegion}
                    onChange={(e) => setStateOrRegion(e.target.value)}
                    placeholder="e.g. Cross River State"
                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-[#10251d] focus:border-[#2d6130] focus:ring-1 focus:ring-[#2d6130] outline-none"
                  />
                  <select
                    value={country}
                    onChange={(e) => setCountry(e.target.value as "Nigeria" | "Cameroon")}
                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-[#10251d] focus:border-[#2d6130] focus:ring-1 focus:ring-[#2d6130] outline-none"
                  >
                    <option value="Nigeria">Nigeria</option>
                    <option value="Cameroon">Cameroon</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#57655d] mb-1.5">
                  GPS Latitude *
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  placeholder="e.g. 4.9757"
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-[#10251d] focus:border-[#2d6130] focus:ring-1 focus:ring-[#2d6130] outline-none"
                />
                <span className="text-[10px] text-[#57655d] mt-1 block">
                  Decimal degrees between -90 and 90
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#57655d] mb-1.5">
                  GPS Longitude *
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  placeholder="e.g. 8.3417"
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-[#10251d] focus:border-[#2d6130] focus:ring-1 focus:ring-[#2d6130] outline-none"
                />
                <span className="text-[10px] text-[#57655d] mt-1 block">
                  Decimal degrees between -180 and 180
                </span>
              </div>
            </div>
          </div>

          {/* Section 2: Custodian / Manager Account & Credentials */}
          <div className="rounded-3xl border border-[#dfe7d8] bg-white p-6 sm:p-8 shadow-sm">
            <div className="flex items-center gap-3 border-b border-gray-100 pb-4 mb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#edf7e8] text-[#2d6130]">
                <ShieldCheck size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-[#10251d]">2. Facility Custodian & Account Setup</h2>
                <p className="text-xs text-[#57655d]">Authorized manager account for workspace access and logging receipts</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#57655d] mb-1.5">
                  Custodian / Facility Manager Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={managerFullName}
                  onChange={(e) => setManagerFullName(e.target.value)}
                  placeholder="e.g. Captain Bassey Edet"
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-[#10251d] focus:border-[#2d6130] focus:ring-1 focus:ring-[#2d6130] outline-none"
                />
              </div>

              {/* Credential Type Toggle */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#57655d] mb-1.5">
                  Sign In Identifier Type
                </label>
                <div className="grid grid-cols-2 gap-3 max-w-sm">
                  <button
                    type="button"
                    onClick={() => {
                      setCredentialType("email");
                      setIdentifier("");
                    }}
                    className={`flex items-center justify-center gap-2 py-2 px-4 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                      credentialType === "email"
                        ? "bg-[#0b3528] text-white border-[#0b3528]"
                        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <Mail size={14} /> Email Address
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCredentialType("phone");
                      setIdentifier("");
                    }}
                    className={`flex items-center justify-center gap-2 py-2 px-4 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                      credentialType === "phone"
                        ? "bg-[#0b3528] text-white border-[#0b3528]"
                        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <Phone size={14} /> Phone Number
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#57655d] mb-1.5">
                    {credentialType === "email" ? "Manager Email Address *" : "Manager Phone Number *"}
                  </label>
                  <input
                    type={credentialType === "email" ? "email" : "tel"}
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder={
                      credentialType === "email" ? "bassey.edet@cr-cocoaterminal.com" : "+234 803 000 0000"
                    }
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-[#10251d] focus:border-[#2d6130] focus:ring-1 focus:ring-[#2d6130] outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#57655d] mb-1.5">
                    Direct Contact Phone
                  </label>
                  <input
                    type="tel"
                    value={managerPhone}
                    onChange={(e) => setManagerPhone(e.target.value)}
                    placeholder="+234 803 777 6543"
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-[#10251d] focus:border-[#2d6130] focus:ring-1 focus:ring-[#2d6130] outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#57655d] mb-1.5">
                    Password (min 6 characters) *
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-[#10251d] focus:border-[#2d6130] focus:ring-1 focus:ring-[#2d6130] outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#57655d] mb-1.5">
                    Confirm Password *
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-[#10251d] focus:border-[#2d6130] focus:ring-1 focus:ring-[#2d6130] outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Submit Action */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
            <Link
              href="/get-started"
              className="text-xs font-semibold text-[#57655d] hover:text-[#10251d] transition"
            >
              ← Back to role selection
            </Link>

            <button
              type="submit"
              disabled={loading}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full bg-[#0b3528] px-8 py-3.5 text-sm font-bold text-white shadow-lg shadow-[#0b3528]/20 transition hover:bg-[#134939] disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Registering Facility...</span>
                </>
              ) : (
                <>
                  <span>Complete Warehouse Registration</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
