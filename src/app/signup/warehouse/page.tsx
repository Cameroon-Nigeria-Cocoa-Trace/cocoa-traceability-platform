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
  FileCheck,
} from "lucide-react";
import { WarehouseFacility, WarehouseOrganization } from "@/types/warehouse";
import { warehouseStore } from "@/lib/warehouse/warehouseStore";

const LOCATION_PRESETS = [
  {
    label: "Calabar Port Maritime Export Facility (Cross River)",
    cityOrLGA: "Calabar South",
    stateOrRegion: "Cross River State",
    country: "Nigeria" as const,
    lat: 4.9757,
    lng: 8.3417,
    operatingHours: "06:00 - 20:00 WAT",
  },
  {
    label: "Ikom Central Aggregation Terminal (Border Corridor)",
    cityOrLGA: "Ikom",
    stateOrRegion: "Cross River State",
    country: "Nigeria" as const,
    lat: 5.9614,
    lng: 8.7188,
    operatingHours: "07:00 - 19:00 WAT",
  },
  {
    label: "Akamkpa Upcountry Storage Depot",
    cityOrLGA: "Akamkpa",
    stateOrRegion: "Cross River State",
    country: "Nigeria" as const,
    lat: 5.3094,
    lng: 8.3582,
    operatingHours: "07:30 - 18:30 WAT",
  },
  {
    label: "Mamfe Central Transit Depot (Cameroon Cross-Border Axis)",
    cityOrLGA: "Mamfe Central",
    stateOrRegion: "South-West Region",
    country: "Cameroon" as const,
    lat: 5.7667,
    lng: 9.3167,
    operatingHours: "07:00 - 18:00 WAT",
  },
];

export default function WarehouseSignupPage() {
  const router = useRouter();
  const { signUpWithEmail, user } = useFirebase();

  // Facility Type
  const [facilityType, setFacilityType] = useState<"bonded" | "inland">("bonded");

  // Facility Details
  const [facilityName, setFacilityName] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [address, setAddress] = useState("");
  const [cityOrLGA, setCityOrLGA] = useState(LOCATION_PRESETS[0].cityOrLGA);
  const [stateOrRegion, setStateOrRegion] = useState(LOCATION_PRESETS[0].stateOrRegion);
  const [country, setCountry] = useState<"Nigeria" | "Cameroon">(LOCATION_PRESETS[0].country);
  const [operatingHours, setOperatingHours] = useState(LOCATION_PRESETS[0].operatingHours);
  const [latitude, setLatitude] = useState<number>(LOCATION_PRESETS[0].lat);
  const [longitude, setLongitude] = useState<number>(LOCATION_PRESETS[0].lng);
  const [capacityTonnes, setCapacityTonnes] = useState<number>(300);

  // Corporate Organization Details
  const [orgName, setOrgName] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [customsBondedCode, setCustomsBondedCode] = useState("");
  const [hqAddress, setHqAddress] = useState("");
  const [orgEmail, setOrgEmail] = useState("");
  const [orgPhone, setOrgPhone] = useState("");

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

  const applyPreset = (preset: typeof LOCATION_PRESETS[0]) => {
    setCityOrLGA(preset.cityOrLGA);
    setStateOrRegion(preset.stateOrRegion);
    setCountry(preset.country);
    setLatitude(preset.lat);
    setLongitude(preset.lng);
    setOperatingHours(preset.operatingHours);
  };

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

    const cleanOrgName = orgName.trim() || `${cleanFacilityName} Custody Ltd`;
    const cleanRegNo = registrationNumber.trim();
    if (!cleanRegNo) {
      setError("CAC or official registration number is required for the corporate entity.");
      return;
    }

    const cleanManagerName = managerFullName.trim();
    if (!cleanManagerName) {
      setError("Facility custodian / manager full name is required.");
      return;
    }

    const cleanIdentifier = identifier.trim();
    if (!cleanIdentifier) {
      setError(credentialType === "email" ? "Manager email address is required." : "Manager phone number is required.");
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
      const orgId = `org_wh_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const facilityId = `wh_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const effectiveLicense =
        licenseNumber.trim() ||
        (facilityType === "bonded"
          ? `NCS-WH-CAL-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`
          : `CRS-INL-WH-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`);

      // 2. Build Organization Record
      const orgRecord: WarehouseOrganization = {
        id: orgId,
        name: cleanOrgName,
        registrationNumber: cleanRegNo,
        customsBondedWarehouseCode: customsBondedCode.trim() || undefined,
        headquartersAddress: hqAddress.trim() || address.trim() || `${cityOrLGA}, ${stateOrRegion}`,
        contactEmail: orgEmail.trim() || (credentialType === "email" ? cleanIdentifier : `${authUser.uid}@tracetrade.cm`),
        contactPhone: orgPhone.trim() || managerPhone.trim() || "+234 800 000 0000",
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
          address: address.trim() || `${cityOrLGA} Industrial Hub, ${stateOrRegion}`,
          cityOrLGA: cityOrLGA.trim() || "Calabar South",
          stateOrRegion: stateOrRegion.trim() || "Cross River State",
          country,
          latitude: Number(latitude) || 4.9757,
          longitude: Number(longitude) || 8.3417,
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
        contactEmail: credentialType === "email" ? cleanIdentifier : orgEmail.trim() || `${authUser.uid}@tracetrade.cm`,
        contactPhone: managerPhone.trim() || orgPhone.trim() || cleanIdentifier,
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
        organizationName: cleanOrgName,
        licenseNumber: effectiveLicense,
        updatedAt: now,
      };

      await setDoc(doc(db, "users", authUser.uid), userDocData, { merge: true }).catch((err) =>
        console.warn("Firestore error user:", err)
      );

      // Save to memory store
      await warehouseStore.saveFacility(facilityRecord);
      await warehouseStore.saveOrganization(orgRecord);

      setSuccess("Warehouse facility registered successfully! Launching your workspace...");
      setTimeout(() => {
        router.push("/dashboard/warehouse");
      }, 1200);
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

      <main className="mx-auto max-w-4xl px-4 pt-28 pb-20 sm:px-6 sm:pt-36 lg:px-8">
        {/* Header */}
        <div className="text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#edf7e8] px-3.5 py-1 text-xs font-bold uppercase tracking-[0.2em] text-[#2d6130] border border-[#d2ecc8]">
            <Building2 size={14} /> Warehouse Custody & Export Facility
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-[#10251d] sm:text-4xl">
            Register Warehouse Facility
          </h1>
          <p className="mt-2 text-sm sm:text-base text-[#57655d] max-w-2xl mx-auto">
            Onboard your customs bonded terminal, inland aggregation warehouse, or port storage facility to manage
            traceable cocoa stock, consignment receiving, and Cross River State statutory trace certifications.
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
              <span className="font-bold text-[#10251d]">Customs Bonded Port Terminal</span>
              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-[#0b3528] text-white">
                Export Terminal
              </span>
            </div>
            <p className="text-xs text-[#57655d] leading-relaxed">
              Export terminal or maritime port complex handling export-ready cocoa consignments, international fumigation, and customs clearance.
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
              Upcountry storage or border-corridor transit depot (Ikom, Akamkpa, Mamfe axis) receiving cocoa from LBAs and farming cooperatives.
            </p>
          </button>
        </div>

        {/* Registration Form */}
        <form onSubmit={handleSubmit} className="mt-8 space-y-8">
          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-start gap-3">
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Registration Notice</p>
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

          {/* Section 1: Facility Specifications */}
          <div className="rounded-3xl border border-[#dfe7d8] bg-white p-6 sm:p-8 shadow-sm">
            <div className="flex items-center gap-3 border-b border-gray-100 pb-4 mb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#edf7e8] text-[#2d6130]">
                <Boxes size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-[#10251d]">1. Facility & Storage Specifications</h2>
                <p className="text-xs text-[#57655d]">Physical storage location, capacity, and operational parameters</p>
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
                  placeholder="e.g. Calabar Port Maritime Export Facility"
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-[#10251d] focus:border-[#2d6130] focus:ring-1 focus:ring-[#2d6130] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#57655d] mb-1.5">
                  License / Terminal Code
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

              {/* Location Presets & Coordinates */}
              <div className="sm:col-span-2 mt-2">
                <span className="block text-xs font-bold uppercase tracking-wider text-[#57655d] mb-1.5">
                  Corridor Location Presets (Click to autofill)
                </span>
                <div className="flex flex-wrap gap-2">
                  {LOCATION_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => applyPreset(p)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition cursor-pointer ${
                        cityOrLGA === p.cityOrLGA && stateOrRegion === p.stateOrRegion
                          ? "bg-[#0b3528] text-white border-[#0b3528]"
                          : "bg-white text-[#57655d] border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      {p.cityOrLGA} ({p.country})
                    </button>
                  ))}
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
                  GPS Latitude
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={latitude}
                  onChange={(e) => setLatitude(Number(e.target.value))}
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-[#10251d] focus:border-[#2d6130] focus:ring-1 focus:ring-[#2d6130] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#57655d] mb-1.5">
                  GPS Longitude
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={longitude}
                  onChange={(e) => setLongitude(Number(e.target.value))}
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-[#10251d] focus:border-[#2d6130] focus:ring-1 focus:ring-[#2d6130] outline-none"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Corporate Operating Entity */}
          <div className="rounded-3xl border border-[#dfe7d8] bg-white p-6 sm:p-8 shadow-sm">
            <div className="flex items-center gap-3 border-b border-gray-100 pb-4 mb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#edf7e8] text-[#2d6130]">
                <FileCheck size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-[#10251d]">2. Corporate Custodian Entity</h2>
                <p className="text-xs text-[#57655d]">Incorporated company or customs terminal license holder</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-[#57655d] mb-1.5">
                  Corporate / Entity Name *
                </label>
                <input
                  type="text"
                  required
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="e.g. Cross River State Maritime & Inland Cocoa Terminal Ltd"
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-[#10251d] focus:border-[#2d6130] focus:ring-1 focus:ring-[#2d6130] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#57655d] mb-1.5">
                  CAC / Corporate Registration Number *
                </label>
                <input
                  type="text"
                  required
                  value={registrationNumber}
                  onChange={(e) => setRegistrationNumber(e.target.value)}
                  placeholder="e.g. RC-WH-CR-2026-081"
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-[#10251d] focus:border-[#2d6130] focus:ring-1 focus:ring-[#2d6130] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#57655d] mb-1.5">
                  Customs Bonded Warehouse Code (Optional)
                </label>
                <input
                  type="text"
                  value={customsBondedCode}
                  onChange={(e) => setCustomsBondedCode(e.target.value)}
                  placeholder="e.g. NCS-BOND-CR-0012"
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-[#10251d] focus:border-[#2d6130] focus:ring-1 focus:ring-[#2d6130] outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-[#57655d] mb-1.5">
                  Headquarters / Registered Address
                </label>
                <input
                  type="text"
                  value={hqAddress}
                  onChange={(e) => setHqAddress(e.target.value)}
                  placeholder="e.g. Free Trade Zone Expressway, Calabar"
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-[#10251d] focus:border-[#2d6130] focus:ring-1 focus:ring-[#2d6130] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#57655d] mb-1.5">
                  Official Corporate Email
                </label>
                <input
                  type="email"
                  value={orgEmail}
                  onChange={(e) => setOrgEmail(e.target.value)}
                  placeholder="terminal-ops@cr-cocoaterminal.com"
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-[#10251d] focus:border-[#2d6130] focus:ring-1 focus:ring-[#2d6130] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#57655d] mb-1.5">
                  Official Corporate Phone
                </label>
                <input
                  type="text"
                  value={orgPhone}
                  onChange={(e) => setOrgPhone(e.target.value)}
                  placeholder="+234 803 777 6543"
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-[#10251d] focus:border-[#2d6130] focus:ring-1 focus:ring-[#2d6130] outline-none"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Custodian / Manager Account Credentials */}
          <div className="rounded-3xl border border-[#dfe7d8] bg-white p-6 sm:p-8 shadow-sm">
            <div className="flex items-center gap-3 border-b border-gray-100 pb-4 mb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#edf7e8] text-[#2d6130]">
                <ShieldCheck size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-[#10251d]">3. Facility Custodian & Login Setup</h2>
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
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4">
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
