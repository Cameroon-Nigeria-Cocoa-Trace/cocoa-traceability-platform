"use client";

import Link from "next/link";
import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { useFirebase, FarmRecord } from "@/context/FirebaseContext";
import {
  MapPin,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  UserCheck,
  Layers,
  FileText,
  Truck,
  Coins,
  Sparkles,
  Search,
  Eye,
  X,
  FileCheck2,
  ChevronRight,
  ChevronLeft,
  User,
  Mail,
  Lock,
} from "lucide-react";

const ONBOARDING_TABS = [
  { id: "farmer", label: "Farmer & Co-op", icon: UserCheck },
  { id: "location", label: "Farm & Location", icon: MapPin },
  { id: "production", label: "Harvest & Batches", icon: Layers },
  { id: "supplychain", label: "Trade Route", icon: Truck },
  { id: "compliance", label: "Legal & Audit", icon: FileText },
  { id: "finance", label: "Digital History", icon: Coins },
];

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f7f8f3]" />}>
      <SignupContent />
    </Suspense>
  );
}

function SignupContent() {
  const searchParams = useSearchParams();
  const initialView = searchParams.get("view") === "account" ? "account" : "farm";

  const {
    user,
    loginWithGoogle,
    loginWithEmail,
    signUpWithEmail,
    loginAsDemo,
    registerFarm,
    updateFarm,
    farms,
  } = useFirebase();

  // Page View Mode: "farm" (Farm Registration) | "account" (User Account Creation)
  const [signupView, setSignupView] = useState<"farm" | "account">(initialView);

  // Auth modal for saving farm when unauthenticated
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<"signup" | "signin">("signup");
  const [authModalEmail, setAuthModalEmail] = useState("");
  const [authModalPassword, setAuthModalPassword] = useState("");
  const [authModalName, setAuthModalName] = useState("");
  const [authModalLoading, setAuthModalLoading] = useState(false);
  const [authModalError, setAuthModalError] = useState<string | null>(null);

  // Dedicated Account Sign Up states
  const [accountName, setAccountName] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [accountConfirmPassword, setAccountConfirmPassword] = useState("");
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [accountSuccess, setAccountSuccess] = useState<string | null>(null);

  // Active form tab
  const [activeTab, setActiveTab] = useState<string>("farmer");

  // Section 1: Farmer & Cooperative Details
  const [farmerName, setFarmerName] = useState("");
  const [farmerPhone, setFarmerPhone] = useState("+237 671 234 567");
  const [farmerEmail, setFarmerEmail] = useState("");
  const [cooperative, setCooperative] = useState("SOWESCOP Cooperative Union");

  // Section 2: Farm Identity & Location
  const [farmName, setFarmName] = useState("");
  const [village, setVillage] = useState("Ekondo-Titi Central");
  const [lga, setLga] = useState("Ndian Division");
  const [stateRegion, setStateRegion] = useState("Southwest Region");
  const [geolocation, setGeolocation] = useState("4.5821° N, 9.0432° E");
  const [sizeHectares, setSizeHectares] = useState("4.2");
  const [registrationDate, setRegistrationDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  // Section 3: Production & Harvest Information
  const [cocoaVariety, setCocoaVariety] = useState("High-Yield F1 Hybrid (Trinitario × Forastero)");
  const [harvestSeason, setHarvestSeason] = useState("Main Crop 2026/2027");
  const [estimatedAnnualYieldKg, setEstimatedAnnualYieldKg] = useState("5800");
  const [quantityHarvestedKg, setQuantityHarvestedKg] = useState("1850");
  const [batchNumber, setBatchNumber] = useState(`BATCH-CR-${new Date().getFullYear()}-019`);

  // Section 4: Supply Chain, Aggregation & Trade Route
  const [aggregatorCenter, setAggregatorCenter] = useState("Kumba Central Buying Station");
  const [batchMovementRoute, setBatchMovementRoute] = useState(
    "Ekondo-Titi Farm Gate → Kumba Central Buying Station → Douala Port / Cross-Border Channel"
  );
  const [processorExporter, setProcessorExporter] = useState("Telcar Cocoa Ltd / SIC CACAOS");
  const [designatedBuyer, setDesignatedBuyer] = useState("European Union Certified Off-taker");

  // Section 5: Supporting Land & Deforestation Assessment & Audit
  const [landDocType, setLandDocType] = useState("Customary Land Attestation (Chefferie)");
  const [landDocReference, setLandDocReference] = useState("AVPC-NDIAN-2024-REF-098");
  const [deforestationRisk, setDeforestationRisk] = useState("Zero Deforestation Verified - Post-2020 Baseline Compliant");
  const [auditStatus, setAuditStatus] = useState("EUDR Due-Diligence Cleared");
  const [auditCertificateNumber, setAuditCertificateNumber] = useState("AUD-EUDR-2026-0814");
  const [auditorName, setAuditorName] = useState("SGS Agri-Trace & Rainforest Alliance");
  const [auditDate, setAuditDate] = useState("2026-03-15");

  // Section 6: Digital Transaction History
  const [paymentMethod, setPaymentMethod] = useState("MTN Mobile Money (MoMo)");
  const [transactionReference, setTransactionReference] = useState("MOMO-TX-984210984");
  const [transactionAmount, setTransactionAmount] = useState("FCFA 3,250,000 (~$5,300)");

  // State management
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRegion, setFilterRegion] = useState("ALL");
  const [selectedFarmModal, setSelectedFarmModal] = useState<FarmRecord | null>(null);
  const [newBatchFarmModal, setNewBatchFarmModal] = useState<FarmRecord | null>(null);
  const [batchAddQty, setBatchAddQty] = useState("");
  const [batchAddCode, setBatchAddCode] = useState("");
  const [updatingBatch, setUpdatingBatch] = useState(false);

  // Discreet sample auto-filler for testing
  const handleLoadSampleData = () => {
    setFarmName("Rainforest Cocoa Plot #4");
    setFarmerName("Alain Nkweta");
    setFarmerPhone("+237 677 889 123");
    setFarmerEmail("alain.nkweta@cocoatrace.cm");
    setCooperative("SOWESCOP Cooperative Union");
    setVillage("Ekondo-Titi Central");
    setLga("Ndian Division");
    setStateRegion("Southwest Region");
    setGeolocation("4.5912° N, 9.1245° E");
    setSizeHectares("5.8");
    setCocoaVariety("Trinitario × Forastero F1 Hybrid");
    setHarvestSeason("Main Crop 2026/2027");
    setEstimatedAnnualYieldKg("7200");
    setQuantityHarvestedKg("2450");
    setBatchNumber(`BATCH-CR-${Date.now().toString().slice(-4)}`);
    setAggregatorCenter("Kumba Central Buying Station");
    setBatchMovementRoute("Ekondo-Titi Farm Gate → Kumba Aggregator → Douala Export Channel");
    setProcessorExporter("Telcar Cocoa Ltd / SIC CACAOS");
    setDesignatedBuyer("Cargill European Supply Chain");
    setLandDocType("Customary Land Attestation (Chefferie)");
    setLandDocReference("AVPC-MBO-2023-882");
    setDeforestationRisk("Zero Deforestation Verified - Post-2020 Baseline Compliant");
    setAuditStatus("EUDR Due-Diligence Cleared");
    setAuditCertificateNumber("AUD-RA-2026-9921");
    setAuditorName("SGS Agri-Trace Inspectorate");
    setAuditDate("2026-02-28");
    setPaymentMethod("MTN Mobile Money (MoMo)");
    setTransactionReference(`MOMO-${Date.now().toString().slice(-6)}`);
    setTransactionAmount("FCFA 3,920,000 (~$6,400)");
  };

  const handleUseCurrentLocation = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude.toFixed(5);
          const lng = pos.coords.longitude.toFixed(5);
          setGeolocation(`${lat}°, ${lng}°`);
        },
        (err) => {
          console.warn("Could not get position:", err.message);
          setGeolocation("4.5821° N, 9.0432° E");
        }
      );
    }
  };

  const executeFarmRegistration = async () => {
    if (!farmName.trim()) {
      setError("Please specify the farm name.");
      setActiveTab("location");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      const registered = await registerFarm({
        farmerName: farmerName.trim() || user?.displayName || "Registered Farmer",
        farmerPhone: farmerPhone.trim(),
        farmerEmail: farmerEmail.trim() || user?.email || "",
        farmName: farmName.trim(),
        region: stateRegion.trim(),
        village: village.trim(),
        lga: lga.trim(),
        state: stateRegion.trim(),
        cooperative: cooperative.trim() || "Independent Cooperative",
        geolocation: geolocation.trim(),
        sizeHectares: parseFloat(sizeHectares) || 2.5,
        registrationDate: registrationDate.trim(),
        cocoaVariety: cocoaVariety.trim(),
        harvestSeason: harvestSeason.trim(),
        estimatedAnnualYieldKg: parseFloat(estimatedAnnualYieldKg) || 0,
        quantityHarvestedKg: parseFloat(quantityHarvestedKg) || 0,
        batchNumber: batchNumber.trim(),
        aggregatorCenter: aggregatorCenter.trim(),
        batchMovementRoute: batchMovementRoute.trim(),
        processorExporter: processorExporter.trim(),
        designatedBuyer: designatedBuyer.trim(),
        landDocType: landDocType.trim(),
        landDocReference: landDocReference.trim(),
        deforestationRisk: deforestationRisk.trim(),
        auditStatus: auditStatus.trim(),
        auditCertificateNumber: auditCertificateNumber.trim(),
        auditorName: auditorName.trim(),
        auditDate: auditDate.trim(),
        paymentMethod: paymentMethod.trim(),
        transactionReference: transactionReference.trim(),
        transactionAmount: transactionAmount.trim(),
        eudrCompliant: true,
      });

      setSuccess(`Farm "${registered.farmName}" successfully onboarded with ID ${registered.id}! Record saved to registry.`);
      setFarmName("");
      setBatchNumber(`BATCH-CR-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`);
      setShowAuthModal(false);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to register farm.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!farmName.trim()) {
      setError("Please specify the farm name.");
      setActiveTab("location");
      return;
    }

    if (!user) {
      // Pop up smooth auth modal prefilled with farmer email
      setAuthModalEmail(farmerEmail.trim());
      setAuthModalName(farmerName.trim());
      setShowAuthModal(true);
      return;
    }

    await executeFarmRegistration();
  };

  // Dedicated Account Creation
  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setAccountError(null);
    setAccountSuccess(null);

    const cleanEmail = accountEmail.trim();
    if (!cleanEmail || !accountPassword) {
      setAccountError("Please fill in both email and password.");
      return;
    }

    if (accountPassword.length < 6) {
      setAccountError("Password must be at least 6 characters.");
      return;
    }

    if (accountPassword !== accountConfirmPassword) {
      setAccountError("Passwords do not match.");
      return;
    }

    try {
      setAccountLoading(true);
      await signUpWithEmail(cleanEmail, accountPassword, accountName.trim() || undefined);
      setAccountSuccess("Account created successfully! You are now signed in.");
      if (accountName.trim()) setFarmerName(accountName.trim());
      if (cleanEmail) setFarmerEmail(cleanEmail);
      setTimeout(() => {
        setSignupView("farm");
      }, 1200);
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("auth/operation-not-allowed") || msg.includes("OPERATION_NOT_ALLOWED")) {
        setAccountError("Email/Password provider is disabled in Firebase console. Enable it in Firebase Console → Authentication → Sign-in method, or use Google / Demo session.");
      } else {
        setAccountError(err instanceof Error ? err.message : "Failed to create account.");
      }
    } finally {
      setAccountLoading(false);
    }
  };

  // Auth modal completion
  const handleAuthModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthModalError(null);
    const cleanEmail = authModalEmail.trim();
    if (!cleanEmail || !authModalPassword) {
      setAuthModalError("Please provide both email and password.");
      return;
    }

    try {
      setAuthModalLoading(true);
      if (authModalMode === "signup") {
        if (authModalPassword.length < 6) {
          setAuthModalError("Password must be at least 6 characters.");
          return;
        }
        await signUpWithEmail(cleanEmail, authModalPassword, authModalName.trim() || farmerName.trim() || undefined);
      } else {
        await loginWithEmail(cleanEmail, authModalPassword);
      }
      setShowAuthModal(false);
      // Proceed with registration
      setTimeout(() => {
        executeFarmRegistration();
      }, 300);
    } catch (err: unknown) {
      console.error(err);
      setAuthModalError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setAuthModalLoading(false);
    }
  };

  const handleModalGoogleLogin = async () => {
    try {
      setAuthModalLoading(true);
      setAuthModalError(null);
      await loginWithGoogle();
      setShowAuthModal(false);
      setTimeout(() => {
        executeFarmRegistration();
      }, 300);
    } catch (err: unknown) {
      console.error(err);
      setAuthModalError(err instanceof Error ? err.message : "Google authentication failed.");
    } finally {
      setAuthModalLoading(false);
    }
  };

  const handleRecordNewBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBatchFarmModal) return;
    try {
      setUpdatingBatch(true);
      const addQty = parseFloat(batchAddQty) || 0;
      const updatedTotal = (newBatchFarmModal.quantityHarvestedKg || 0) + addQty;
      await updateFarm(newBatchFarmModal.id, {
        batchNumber: batchAddCode.trim() || newBatchFarmModal.batchNumber,
        quantityHarvestedKg: updatedTotal,
      });
      setNewBatchFarmModal(null);
      setBatchAddQty("");
      setBatchAddCode("");
    } catch (err) {
      console.error("Batch update failed", err);
    } finally {
      setUpdatingBatch(false);
    }
  };

  // Filter farms
  const userFarms = user ? farms.filter((f) => f.farmerId === user.uid) : farms;
  const filteredFarms = userFarms.filter((f) => {
    const matchesSearch =
      f.farmName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (f.farmerName && f.farmerName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (f.village && f.village.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (f.lga && f.lga.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (f.id && f.id.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesRegion =
      filterRegion === "ALL" ||
      f.region.toLowerCase().includes(filterRegion.toLowerCase()) ||
      (f.state && f.state.toLowerCase().includes(filterRegion.toLowerCase()));

    return matchesSearch && matchesRegion;
  });

  return (
    <div className="min-h-screen bg-[#f7f8f3] text-[#10251d]">
      <Navbar />

      {/* Main Content with clean clearance below fixed navbar */}
      <main className="mx-auto max-w-[1400px] px-4 pt-28 pb-14 sm:px-6 sm:pt-32 lg:px-8">
        {/* Navigation Selector: Farm Onboarding vs Account Creation */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#2d6130]">
                Producer Hub
              </span>
              <span className="flex items-center gap-1 rounded-full bg-[#edf7e8] px-2.5 py-0.5 text-[0.65rem] font-bold text-[#2d6130]">
                <ShieldCheck size={12} />
                EUDR Traceability
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#10251d] sm:text-3xl">
              {signupView === "farm" ? "Farm Plot Onboarding" : "Create Producer Account"}
            </h1>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex items-center gap-2">
            <div className="flex rounded-full border border-[#dfe7d8] bg-white p-1 shadow-sm">
              <button
                type="button"
                onClick={() => setSignupView("farm")}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition cursor-pointer ${
                  signupView === "farm"
                    ? "bg-[#0b3528] text-white"
                    : "text-[#57655d] hover:text-[#10251d]"
                }`}
              >
                Register Farm Plot
              </button>
              <button
                type="button"
                onClick={() => setSignupView("account")}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition cursor-pointer ${
                  signupView === "account"
                    ? "bg-[#0b3528] text-white"
                    : "text-[#57655d] hover:text-[#10251d]"
                }`}
              >
                Create Account
              </button>
            </div>

            {signupView === "farm" && (
              <button
                type="button"
                onClick={handleLoadSampleData}
                className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-[#dfe7d8] bg-white px-3.5 py-2 text-xs font-semibold text-[#10251d] shadow-sm transition hover:bg-[#f7f8f3] cursor-pointer"
              >
                <Sparkles size={13} className="text-[#2d6130]" />
                Auto-fill sample data
              </button>
            )}
          </div>
        </div>

        {/* View A: Account Creation Form */}
        {signupView === "account" ? (
          <div className="mx-auto max-w-lg">
            <div className="rounded-[32px] border border-[#dfe7d8] bg-white p-7 shadow-sm sm:p-9">
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#2d6130]">
                New Producer Registration
              </span>
              <h2 className="mt-2 text-2xl font-semibold text-[#10251d]">
                Sign Up for CocoaTrace
              </h2>
              <p className="mt-1 text-xs text-[#57655d]">
                Create your account with email or Google to register and manage certified cocoa plots.
              </p>

              {accountError && (
                <div className="mt-4 flex items-center gap-2 rounded-2xl bg-red-50 p-3.5 text-xs text-red-700">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{accountError}</span>
                </div>
              )}

              {accountSuccess && (
                <div className="mt-4 flex items-center gap-2 rounded-2xl bg-[#edf7e8] p-3.5 text-xs text-[#1a4936]">
                  <CheckCircle2 size={16} className="shrink-0 text-[#2a7a33]" />
                  <span>{accountSuccess}</span>
                </div>
              )}

              {user ? (
                <div className="mt-6 rounded-2xl bg-[#edf7e8] p-5 text-xs text-[#1a4936]">
                  <p className="font-semibold text-sm">Already Signed In</p>
                  <p className="mt-1">
                    Connected as: <strong>{user.displayName || user.email}</strong>
                  </p>
                  <button
                    type="button"
                    onClick={() => setSignupView("farm")}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#0b3528] px-5 py-2.5 text-xs font-bold text-white transition hover:bg-[#07241b] cursor-pointer"
                  >
                    Proceed to Farm Onboarding <ArrowRight size={14} />
                  </button>
                </div>
              ) : (
                <div className="mt-6 space-y-4">
                  {/* Google OAuth Button */}
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        setAccountLoading(true);
                        await loginWithGoogle();
                        setSignupView("farm");
                      } catch (err: unknown) {
                        setAccountError(err instanceof Error ? err.message : "Google sign in failed.");
                      } finally {
                        setAccountLoading(false);
                      }
                    }}
                    disabled={accountLoading}
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
                      Or with email
                    </span>
                  </div>

                  {/* Email Sign Up Form */}
                  <form onSubmit={handleCreateAccount} className="space-y-3 text-xs">
                    <div>
                      <label className="mb-1 block font-semibold text-[#48574c]">
                        Full Name
                      </label>
                      <div className="relative">
                        <User size={14} className="absolute left-3.5 top-3.5 text-[#57655d]" />
                        <input
                          type="text"
                          value={accountName}
                          onChange={(e) => setAccountName(e.target.value)}
                          placeholder="e.g. Alain Nkweta"
                          className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] py-2.5 pl-9 pr-3 text-xs text-[#10251d] outline-none transition focus:bg-white focus:border-[#2d6130]"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-1 block font-semibold text-[#48574c]">
                        Email Address *
                      </label>
                      <div className="relative">
                        <Mail size={14} className="absolute left-3.5 top-3.5 text-[#57655d]" />
                        <input
                          type="email"
                          required
                          value={accountEmail}
                          onChange={(e) => setAccountEmail(e.target.value)}
                          placeholder="farmer@cocoatrace.cm"
                          className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] py-2.5 pl-9 pr-3 text-xs text-[#10251d] outline-none transition focus:bg-white focus:border-[#2d6130]"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-1 block font-semibold text-[#48574c]">
                        Password * (6+ characters)
                      </label>
                      <div className="relative">
                        <Lock size={14} className="absolute left-3.5 top-3.5 text-[#57655d]" />
                        <input
                          type="password"
                          required
                          value={accountPassword}
                          onChange={(e) => setAccountPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] py-2.5 pl-9 pr-3 text-xs text-[#10251d] outline-none transition focus:bg-white focus:border-[#2d6130]"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-1 block font-semibold text-[#48574c]">
                        Confirm Password *
                      </label>
                      <div className="relative">
                        <Lock size={14} className="absolute left-3.5 top-3.5 text-[#57655d]" />
                        <input
                          type="password"
                          required
                          value={accountConfirmPassword}
                          onChange={(e) => setAccountConfirmPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] py-2.5 pl-9 pr-3 text-xs text-[#10251d] outline-none transition focus:bg-white focus:border-[#2d6130]"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={accountLoading}
                      className="mt-2 w-full flex items-center justify-center gap-2 rounded-2xl bg-[#0b3528] px-4 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-[#07241b] disabled:opacity-50 cursor-pointer"
                    >
                      <UserCheck size={15} />
                      {accountLoading ? "Creating Account..." : "Create Account & Continue"}
                    </button>
                  </form>

                  <p className="mt-4 text-center text-xs text-[#57655d]">
                    Already have an account?{" "}
                    <Link href="/login" className="font-bold text-[#2d6130] hover:underline">
                      Sign In here
                    </Link>
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* View B: Full Farm Onboarding Form (Always Accessible) */
          <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
            {/* Left Column: Comprehensive Onboarding Form */}
            <section className="rounded-[32px] border border-[#dfe7d8] bg-white p-6 shadow-[0_18px_35px_rgba(16,37,29,0.06)] sm:p-8">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#2d6130]">
                    Intake Form
                  </span>
                  <h2 className="text-2xl font-semibold text-[#10251d]">
                    Register Farm Plot
                  </h2>
                </div>

                {user ? (
                  <div className="flex items-center gap-2 rounded-full bg-[#edf7e8] px-3 py-1.5 text-xs font-medium text-[#1a4936]">
                    <span className="h-2 w-2 rounded-full bg-[#2a7a33]" />
                    <span>Connected: {user.displayName || user.email}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-full border border-[#dfe7d8] bg-[#f7f8f3] px-3 py-1.5 text-xs font-medium text-[#57655d]">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    <span>Guest Mode (No sign-in required to edit)</span>
                  </div>
                )}
              </div>

              {/* Informational banner when not logged in */}
              {!user && (
                <div className="mt-3 flex items-center justify-between rounded-2xl bg-[#f0f6eb] p-3 text-xs text-[#2a5933]">
                  <span>Fill out your farm details freely. You can link your account at completion.</span>
                  <button
                    type="button"
                    onClick={() => loginWithGoogle()}
                    className="shrink-0 font-bold text-[#0b3528] hover:underline cursor-pointer ml-2"
                  >
                    Quick Google Sign-in
                  </button>
                </div>
              )}

              {error && (
                <div className="mt-4 flex items-center gap-2 rounded-2xl bg-red-50 p-4 text-sm text-red-700">
                  <AlertCircle size={18} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {success && (
                <div className="mt-4 flex items-center gap-2 rounded-2xl bg-[#edf7e8] p-4 text-sm text-[#1a4936]">
                  <CheckCircle2 size={18} className="shrink-0 text-[#2a7a33]" />
                  <span>{success}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-5">
                {/* Stepper Tabs Bar */}
                <div className="mb-6 flex gap-2 overflow-x-auto pb-2 scrollbar-none">
                  {ONBOARDING_TABS.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        className={`inline-flex shrink-0 items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-semibold transition cursor-pointer ${
                          isActive
                            ? "bg-[#0b3528] text-white shadow-sm"
                            : "border border-[#dfe7d8] bg-[#f7f8f3] text-[#57655d] hover:bg-[#edf3ea] hover:text-[#10251d]"
                        }`}
                      >
                        <Icon size={14} className={isActive ? "text-[#b8f58b]" : ""} />
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                {/* Tab 1: Farmer & Cooperative Details */}
                {activeTab === "farmer" && (
                  <div className="space-y-4 rounded-2xl border border-[#edf1ea] bg-[#fafcf9] p-5">
                    <div className="border-b border-[#edf1ea] pb-2">
                      <h3 className="font-semibold text-[#10251d]">
                        1. Farmer & Cooperative Identity
                      </h3>
                      <p className="text-xs text-[#57655d]">
                        Captures producer credentials, cooperative affiliation, and contact details.
                      </p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block text-sm font-medium text-[#10251d]">
                        <span className="mb-1 block text-xs font-semibold text-[#48574c]">Farmer Full Name *</span>
                        <input
                          type="text"
                          required
                          value={farmerName}
                          onChange={(e) => setFarmerName(e.target.value)}
                          placeholder="e.g. Alain Nkweta or Jean-Pierre Mbida"
                          className="w-full rounded-2xl border border-[#dfe7d8] bg-white px-4 py-3 text-sm text-[#10251d] outline-none transition focus:border-[#2d6130]"
                        />
                      </label>

                      <label className="block text-sm font-medium text-[#10251d]">
                        <span className="mb-1 block text-xs font-semibold text-[#48574c]">Cooperative / Union Name *</span>
                        <input
                          type="text"
                          required
                          value={cooperative}
                          onChange={(e) => setCooperative(e.target.value)}
                          placeholder="e.g. SOWESCOP Cooperative Union"
                          className="w-full rounded-2xl border border-[#dfe7d8] bg-white px-4 py-3 text-sm text-[#10251d] outline-none transition focus:border-[#2d6130]"
                        />
                      </label>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block text-sm font-medium text-[#10251d]">
                        <span className="mb-1 block text-xs font-semibold text-[#48574c]">Phone Number</span>
                        <input
                          type="text"
                          value={farmerPhone}
                          onChange={(e) => setFarmerPhone(e.target.value)}
                          placeholder="+237 671 234 567"
                          className="w-full rounded-2xl border border-[#dfe7d8] bg-white px-4 py-3 text-sm text-[#10251d] outline-none transition focus:border-[#2d6130]"
                        />
                      </label>

                      <label className="block text-sm font-medium text-[#10251d]">
                        <span className="mb-1 block text-xs font-semibold text-[#48574c]">Contact Email</span>
                        <input
                          type="email"
                          value={farmerEmail}
                          onChange={(e) => setFarmerEmail(e.target.value)}
                          placeholder="farmer@cocoatrace.cm"
                          className="w-full rounded-2xl border border-[#dfe7d8] bg-white px-4 py-3 text-sm text-[#10251d] outline-none transition focus:border-[#2d6130]"
                        />
                      </label>
                    </div>

                    <div className="rounded-xl bg-[#edf7e8] p-3 text-xs text-[#1a4936]">
                      {user ? (
                        <>
                          Farmer ID anchored to account:{" "}
                          <span className="font-mono font-semibold">{user.uid.slice(0, 16)}...</span>
                        </>
                      ) : (
                        <>
                          You are filling this plot as a guest. When you submit, you will be prompted to authenticate to associate this plot.
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Tab 2: Farm Identity & Location */}
                {activeTab === "location" && (
                  <div className="space-y-4 rounded-2xl border border-[#edf1ea] bg-[#fafcf9] p-5">
                    <div className="border-b border-[#edf1ea] pb-2">
                      <h3 className="font-semibold text-[#10251d]">
                        2. Farm Identity & Geolocation
                      </h3>
                      <p className="text-xs text-[#57655d]">
                        Captures farm designation, GPS coordinates, village, division, and region.
                      </p>
                    </div>

                    <label className="block text-sm font-medium text-[#10251d]">
                      <span className="mb-1 block text-xs font-semibold text-[#48574c]">Farm / Plantation Name *</span>
                      <input
                        type="text"
                        required
                        value={farmName}
                        onChange={(e) => setFarmName(e.target.value)}
                        placeholder="e.g. Ndian Rainforest Smallholder Plot #4"
                        className="w-full rounded-2xl border border-[#dfe7d8] bg-white px-4 py-3 text-sm text-[#10251d] outline-none transition focus:border-[#2d6130]"
                      />
                    </label>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block text-sm font-medium text-[#10251d]">
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-xs font-semibold text-[#48574c]">GPS Coordinates (Latitude, Longitude) *</span>
                          <button
                            type="button"
                            onClick={handleUseCurrentLocation}
                            className="text-[0.68rem] font-bold text-[#2d6130] hover:underline cursor-pointer"
                          >
                            Get Device GPS
                          </button>
                        </div>
                        <input
                          type="text"
                          required
                          value={geolocation}
                          onChange={(e) => setGeolocation(e.target.value)}
                          placeholder="e.g. 4.5821° N, 9.0432° E"
                          className="w-full rounded-2xl border border-[#dfe7d8] bg-white px-4 py-3 font-mono text-sm text-[#10251d] outline-none transition focus:border-[#2d6130]"
                        />
                      </label>

                      <label className="block text-sm font-medium text-[#10251d]">
                        <span className="mb-1 block text-xs font-semibold text-[#48574c]">Farm Size (Hectares) *</span>
                        <input
                          type="number"
                          step="0.1"
                          required
                          value={sizeHectares}
                          onChange={(e) => setSizeHectares(e.target.value)}
                          placeholder="4.2"
                          className="w-full rounded-2xl border border-[#dfe7d8] bg-white px-4 py-3 text-sm text-[#10251d] outline-none transition focus:border-[#2d6130]"
                        />
                      </label>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-3">
                      <label className="block text-sm font-medium text-[#10251d]">
                        <span className="mb-1 block text-xs font-semibold text-[#48574c]">Village / Locality *</span>
                        <input
                          type="text"
                          value={village}
                          onChange={(e) => setVillage(e.target.value)}
                          placeholder="e.g. Ekondo-Titi, Bokito, or Mbonge"
                          className="w-full rounded-2xl border border-[#dfe7d8] bg-white px-4 py-3 text-sm text-[#10251d] outline-none transition focus:border-[#2d6130]"
                        />
                      </label>

                      <label className="block text-sm font-medium text-[#10251d]">
                        <span className="mb-1 block text-xs font-semibold text-[#48574c]">Division / District *</span>
                        <input
                          type="text"
                          value={lga}
                          onChange={(e) => setLga(e.target.value)}
                          placeholder="e.g. Ndian, Meme, Manyu, Mbam-et-Inoubou"
                          className="w-full rounded-2xl border border-[#dfe7d8] bg-white px-4 py-3 text-sm text-[#10251d] outline-none transition focus:border-[#2d6130]"
                        />
                      </label>

                      <label className="block text-sm font-medium text-[#10251d]">
                        <span className="mb-1 block text-xs font-semibold text-[#48574c]">Region *</span>
                        <select
                          value={stateRegion}
                          onChange={(e) => setStateRegion(e.target.value)}
                          className="w-full rounded-2xl border border-[#dfe7d8] bg-white px-4 py-3 text-sm text-[#10251d] outline-none transition focus:border-[#2d6130]"
                        >
                          <option value="Southwest Region">Southwest Region (Kumba, Ndian, Manyu)</option>
                          <option value="Centre Region">Centre Region (Bafia, Bokito, Monatélé)</option>
                          <option value="Littoral Region">Littoral Region (Moungo, Nkongsamba)</option>
                          <option value="South Region">South Region (Ebolowa, Sangmélima, Kribi)</option>
                          <option value="Northwest Region">Northwest Region (Bamenda Highlands)</option>
                          <option value="East Region">East Region (Bertoua, Batouri)</option>
                          <option value="Adamawa Corridor">Adamawa Corridor (Ngaoundal, Ngaoundéré)</option>
                        </select>
                      </label>
                    </div>

                    <label className="block text-sm font-medium text-[#10251d]">
                      <span className="mb-1 block text-xs font-semibold text-[#48574c]">Registration Date</span>
                      <input
                        type="date"
                        value={registrationDate}
                        onChange={(e) => setRegistrationDate(e.target.value)}
                        className="w-full rounded-2xl border border-[#dfe7d8] bg-white px-4 py-3 text-sm text-[#10251d] outline-none transition focus:border-[#2d6130]"
                      />
                    </label>
                  </div>
                )}

                {/* Tab 3: Production & Harvest Information */}
                {activeTab === "production" && (
                  <div className="space-y-4 rounded-2xl border border-[#edf1ea] bg-[#fafcf9] p-5">
                    <div className="border-b border-[#edf1ea] pb-2">
                      <h3 className="font-semibold text-[#10251d]">
                        3. Production & Harvest Information
                      </h3>
                      <p className="text-xs text-[#57655d]">
                        Captures cocoa variety, season yield estimate, batch/lot code, and harvested volume.
                      </p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block text-sm font-medium text-[#10251d]">
                        <span className="mb-1 block text-xs font-semibold text-[#48574c]">Cocoa Variety</span>
                        <input
                          type="text"
                          value={cocoaVariety}
                          onChange={(e) => setCocoaVariety(e.target.value)}
                          placeholder="e.g. Trinitario × Forastero F1 Hybrid"
                          className="w-full rounded-2xl border border-[#dfe7d8] bg-white px-4 py-3 text-sm text-[#10251d] outline-none transition focus:border-[#2d6130]"
                        />
                      </label>

                      <label className="block text-sm font-medium text-[#10251d]">
                        <span className="mb-1 block text-xs font-semibold text-[#48574c]">Harvest Season</span>
                        <input
                          type="text"
                          value={harvestSeason}
                          onChange={(e) => setHarvestSeason(e.target.value)}
                          placeholder="e.g. Main Crop 2026/2027"
                          className="w-full rounded-2xl border border-[#dfe7d8] bg-white px-4 py-3 text-sm text-[#10251d] outline-none transition focus:border-[#2d6130]"
                        />
                      </label>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-3">
                      <label className="block text-sm font-medium text-[#10251d]">
                        <span className="mb-1 block text-xs font-semibold text-[#48574c]">Est. Annual Yield (kg)</span>
                        <input
                          type="number"
                          value={estimatedAnnualYieldKg}
                          onChange={(e) => setEstimatedAnnualYieldKg(e.target.value)}
                          placeholder="5800"
                          className="w-full rounded-2xl border border-[#dfe7d8] bg-white px-4 py-3 text-sm text-[#10251d] outline-none transition focus:border-[#2d6130]"
                        />
                      </label>

                      <label className="block text-sm font-medium text-[#10251d]">
                        <span className="mb-1 block text-xs font-semibold text-[#48574c]">Quantity Harvested (kg) *</span>
                        <input
                          type="number"
                          required
                          value={quantityHarvestedKg}
                          onChange={(e) => setQuantityHarvestedKg(e.target.value)}
                          placeholder="1850"
                          className="w-full rounded-2xl border border-[#dfe7d8] bg-white px-4 py-3 text-sm text-[#10251d] outline-none transition focus:border-[#2d6130]"
                        />
                      </label>

                      <label className="block text-sm font-medium text-[#10251d]">
                        <span className="mb-1 block text-xs font-semibold text-[#48574c]">Batch / Lot Number *</span>
                        <input
                          type="text"
                          required
                          value={batchNumber}
                          onChange={(e) => setBatchNumber(e.target.value)}
                          placeholder="BATCH-CR-2026-001"
                          className="w-full rounded-2xl border border-[#dfe7d8] bg-white px-4 py-3 font-mono text-sm text-[#10251d] outline-none transition focus:border-[#2d6130]"
                        />
                      </label>
                    </div>
                  </div>
                )}

                {/* Tab 4: Supply Chain & Trade Route */}
                {activeTab === "supplychain" && (
                  <div className="space-y-4 rounded-2xl border border-[#edf1ea] bg-[#fafcf9] p-5">
                    <div className="border-b border-[#edf1ea] pb-2">
                      <h3 className="font-semibold text-[#10251d]">
                        4. Supply Chain, Aggregator & Trade Route
                      </h3>
                      <p className="text-xs text-[#57655d]">
                        Tracks physical custody from farm gate to buying stations, processing depots, and export channels.
                      </p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block text-sm font-medium text-[#10251d]">
                        <span className="mb-1 block text-xs font-semibold text-[#48574c]">Aggregator / Collection Centre</span>
                        <input
                          type="text"
                          value={aggregatorCenter}
                          onChange={(e) => setAggregatorCenter(e.target.value)}
                          placeholder="e.g. Kumba Central Buying Station"
                          className="w-full rounded-2xl border border-[#dfe7d8] bg-white px-4 py-3 text-sm text-[#10251d] outline-none transition focus:border-[#2d6130]"
                        />
                      </label>

                      <label className="block text-sm font-medium text-[#10251d]">
                        <span className="mb-1 block text-xs font-semibold text-[#48574c]">Processor / Exporter</span>
                        <input
                          type="text"
                          value={processorExporter}
                          onChange={(e) => setProcessorExporter(e.target.value)}
                          placeholder="e.g. Telcar Cocoa Ltd / SIC CACAOS"
                          className="w-full rounded-2xl border border-[#dfe7d8] bg-white px-4 py-3 text-sm text-[#10251d] outline-none transition focus:border-[#2d6130]"
                        />
                      </label>
                    </div>

                    <label className="block text-sm font-medium text-[#10251d]">
                      <span className="mb-1 block text-xs font-semibold text-[#48574c]">Designated Off-taker / Buyer</span>
                      <input
                        type="text"
                        value={designatedBuyer}
                        onChange={(e) => setDesignatedBuyer(e.target.value)}
                        placeholder="e.g. Barry Callebaut or Cargill EU Supply"
                        className="w-full rounded-2xl border border-[#dfe7d8] bg-white px-4 py-3 text-sm text-[#10251d] outline-none transition focus:border-[#2d6130]"
                      />
                    </label>

                    <label className="block text-sm font-medium text-[#10251d]">
                      <span className="mb-1 block text-xs font-semibold text-[#48574c]">Custody Route Corridor</span>
                      <textarea
                        rows={2}
                        value={batchMovementRoute}
                        onChange={(e) => setBatchMovementRoute(e.target.value)}
                        placeholder="Farm Gate → Village Collection Point → Export Channel"
                        className="w-full rounded-2xl border border-[#dfe7d8] bg-white px-4 py-3 text-sm text-[#10251d] outline-none transition focus:border-[#2d6130]"
                      />
                    </label>
                  </div>
                )}

                {/* Tab 5: Supporting Land, Legal & Audit */}
                {activeTab === "compliance" && (
                  <div className="space-y-4 rounded-2xl border border-[#edf1ea] bg-[#fafcf9] p-5">
                    <div className="border-b border-[#edf1ea] pb-2">
                      <h3 className="font-semibold text-[#10251d]">
                        5. Land Documentation & Audit Verification
                      </h3>
                      <p className="text-xs text-[#57655d]">
                        Documents customary/statutory land titles, EUDR deforestation-risk rating, and inspection audits.
                      </p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block text-sm font-medium text-[#10251d]">
                        <span className="mb-1 block text-xs font-semibold text-[#48574c]">Land Document Type</span>
                        <select
                          value={landDocType}
                          onChange={(e) => setLandDocType(e.target.value)}
                          className="w-full rounded-2xl border border-[#dfe7d8] bg-white px-4 py-3 text-sm text-[#10251d] outline-none transition focus:border-[#2d6130]"
                        >
                          <option value="Customary Land Attestation (Chefferie)">
                            Customary Land Attestation (Chefferie)
                          </option>
                          <option value="Rural Concession Certificate">
                            Rural Concession Certificate
                          </option>
                          <option value="Statutory Land Title">
                            Statutory Land Title
                          </option>
                          <option value="Community Agricultural Allocation">
                            Community Agricultural Allocation
                          </option>
                        </select>
                      </label>

                      <label className="block text-sm font-medium text-[#10251d]">
                        <span className="mb-1 block text-xs font-semibold text-[#48574c]">Document Reference / ID</span>
                        <input
                          type="text"
                          value={landDocReference}
                          onChange={(e) => setLandDocReference(e.target.value)}
                          placeholder="e.g. AVPC-NDIAN-2024-REF-098"
                          className="w-full rounded-2xl border border-[#dfe7d8] bg-white px-4 py-3 text-sm text-[#10251d] outline-none transition focus:border-[#2d6130]"
                        />
                      </label>
                    </div>

                    <label className="block text-sm font-medium text-[#10251d]">
                      <span className="mb-1 block text-xs font-semibold text-[#48574c]">Deforestation-Risk Assessment</span>
                      <select
                        value={deforestationRisk}
                        onChange={(e) => setDeforestationRisk(e.target.value)}
                        className="w-full rounded-2xl border border-[#dfe7d8] bg-white px-4 py-3 text-sm text-[#10251d] outline-none transition focus:border-[#2d6130]"
                      >
                        <option value="Zero Deforestation Verified - Post-2020 Baseline Compliant">
                          Zero Deforestation Verified - Post-2020 Baseline Compliant (Low Risk)
                        </option>
                        <option value="Low Risk - Ancient Plantation Grove Established pre-2015">
                          Low Risk - Ancient Plantation Grove Established pre-2015
                        </option>
                        <option value="Under Remote-Sensing Due Diligence Review">
                          Under Remote-Sensing Due Diligence Review
                        </option>
                        <option value="Agroforestry Buffer Zone - Zero Encroachment">
                          Agroforestry Buffer Zone - Zero Encroachment
                        </option>
                      </select>
                    </label>

                    <div className="grid gap-4 sm:grid-cols-3">
                      <label className="block text-sm font-medium text-[#10251d]">
                        <span className="mb-1 block text-xs font-semibold text-[#48574c]">Audit Status</span>
                        <select
                          value={auditStatus}
                          onChange={(e) => setAuditStatus(e.target.value)}
                          className="w-full rounded-2xl border border-[#dfe7d8] bg-white px-4 py-3 text-sm text-[#10251d] outline-none transition focus:border-[#2d6130]"
                        >
                          <option value="EUDR Due-Diligence Cleared">EUDR Due-Diligence Cleared</option>
                          <option value="Rainforest Alliance Certified">Rainforest Alliance Certified</option>
                          <option value="Third-Party Audit Passed">Third-Party Audit Passed</option>
                          <option value="Cooperative Inspection Validated">Cooperative Inspection Validated</option>
                          <option value="Audit Scheduled">Audit Scheduled</option>
                        </select>
                      </label>

                      <label className="block text-sm font-medium text-[#10251d]">
                        <span className="mb-1 block text-xs font-semibold text-[#48574c]">Audit Certificate #</span>
                        <input
                          type="text"
                          value={auditCertificateNumber}
                          onChange={(e) => setAuditCertificateNumber(e.target.value)}
                          placeholder="AUD-EUDR-2026-0814"
                          className="w-full rounded-2xl border border-[#dfe7d8] bg-white px-4 py-3 text-sm text-[#10251d] outline-none transition focus:border-[#2d6130]"
                        />
                      </label>

                      <label className="block text-sm font-medium text-[#10251d]">
                        <span className="mb-1 block text-xs font-semibold text-[#48574c]">Auditor / Agency</span>
                        <input
                          type="text"
                          value={auditorName}
                          onChange={(e) => setAuditorName(e.target.value)}
                          placeholder="SGS Agri-Trace / Rainforest Alliance"
                          className="w-full rounded-2xl border border-[#dfe7d8] bg-white px-4 py-3 text-sm text-[#10251d] outline-none transition focus:border-[#2d6130]"
                        />
                      </label>
                    </div>

                    <label className="block text-sm font-medium text-[#10251d]">
                      <span className="mb-1 block text-xs font-semibold text-[#48574c]">Inspection Date</span>
                      <input
                        type="date"
                        value={auditDate}
                        onChange={(e) => setAuditDate(e.target.value)}
                        className="w-full rounded-2xl border border-[#dfe7d8] bg-white px-4 py-3 text-sm text-[#10251d] outline-none transition focus:border-[#2d6130]"
                      />
                    </label>
                  </div>
                )}

                {/* Tab 6: Digital Transaction History */}
                {activeTab === "finance" && (
                  <div className="space-y-4 rounded-2xl border border-[#edf1ea] bg-[#fafcf9] p-5">
                    <div className="border-b border-[#edf1ea] pb-2">
                      <h3 className="font-semibold text-[#10251d]">
                        6. Digital Transactions & Settlements
                      </h3>
                      <p className="text-xs text-[#57655d]">
                        Verifies cashless digital payment records (MoMo, Bank Transfer, Escrow) for due diligence.
                      </p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block text-sm font-medium text-[#10251d]">
                        <span className="mb-1 block text-xs font-semibold text-[#48574c]">Payment Settlement Method</span>
                        <select
                          value={paymentMethod}
                          onChange={(e) => setPaymentMethod(e.target.value)}
                          className="w-full rounded-2xl border border-[#dfe7d8] bg-white px-4 py-3 text-sm text-[#10251d] outline-none transition focus:border-[#2d6130]"
                        >
                          <option value="MTN Mobile Money (MoMo)">
                            MTN Mobile Money (MoMo)
                          </option>
                          <option value="Orange Money">
                            Orange Money
                          </option>
                          <option value="Direct Bank Transfer">
                            Direct Bank Transfer
                          </option>
                          <option value="Cashless Cocoa Escrow">
                            Cashless Cocoa Escrow
                          </option>
                        </select>
                      </label>

                      <label className="block text-sm font-medium text-[#10251d]">
                        <span className="mb-1 block text-xs font-semibold text-[#48574c]">Transaction Reference #</span>
                        <input
                          type="text"
                          value={transactionReference}
                          onChange={(e) => setTransactionReference(e.target.value)}
                          placeholder="MOMO-TX-984210984"
                          className="w-full rounded-2xl border border-[#dfe7d8] bg-white px-4 py-3 font-mono text-sm text-[#10251d] outline-none transition focus:border-[#2d6130]"
                        />
                      </label>
                    </div>

                    <label className="block text-sm font-medium text-[#10251d]">
                      <span className="mb-1 block text-xs font-semibold text-[#48574c]">Payment Value</span>
                      <input
                        type="text"
                        value={transactionAmount}
                        onChange={(e) => setTransactionAmount(e.target.value)}
                        placeholder="FCFA 3,250,000 (~$5,300)"
                        className="w-full rounded-2xl border border-[#dfe7d8] bg-white px-4 py-3 text-sm text-[#10251d] outline-none transition focus:border-[#2d6130]"
                      />
                    </label>
                  </div>
                )}

                {/* Form Navigation Controls */}
                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#edf1ea] pt-5">
                  <div className="flex gap-2">
                    {activeTab !== "farmer" && (
                      <button
                        type="button"
                        onClick={() => {
                          const idx = ONBOARDING_TABS.findIndex((t) => t.id === activeTab);
                          if (idx > 0) setActiveTab(ONBOARDING_TABS[idx - 1].id);
                        }}
                        className="inline-flex items-center gap-1 rounded-full border border-[#dfe7d8] bg-white px-4 py-2.5 text-xs font-semibold text-[#10251d] transition hover:bg-[#f7f8f3] cursor-pointer"
                      >
                        <ChevronLeft size={16} /> Previous Section
                      </button>
                    )}

                    {activeTab !== "finance" && (
                      <button
                        type="button"
                        onClick={() => {
                          const idx = ONBOARDING_TABS.findIndex((t) => t.id === activeTab);
                          if (idx < ONBOARDING_TABS.length - 1) setActiveTab(ONBOARDING_TABS[idx + 1].id);
                        }}
                        className="inline-flex items-center gap-1 rounded-full border border-[#dfe7d8] bg-white px-4 py-2.5 text-xs font-semibold text-[#10251d] transition hover:bg-[#f7f8f3] cursor-pointer"
                      >
                        Next Section <ChevronRight size={16} />
                      </button>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center gap-2 rounded-full bg-[#b8f58b] px-6 py-3.5 text-sm font-bold text-[#073b2b] shadow-[0_14px_28px_rgba(184,245,139,0.2)] transition-transform hover:-translate-y-0.5 disabled:opacity-50 cursor-pointer"
                  >
                    <CheckCircle2 size={18} />
                    {submitting ? "Saving Plot..." : "Register Farm Plot"}
                  </button>
                </div>
              </form>
            </section>

            {/* Right Column: Onboarded Farms Directory & Explorer */}
            <aside className="space-y-6">
              <div className="rounded-[32px] border border-[#dfe7d8] bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-semibold text-[#10251d]">
                      Registered Plots Directory
                    </h3>
                    <p className="text-xs text-[#57655d]">
                      Active plots ({filteredFarms.length} of {farms.length})
                    </p>
                  </div>
                  <span className="flex items-center gap-1 rounded-full bg-[#edf7e8] px-3 py-1 text-xs font-bold text-[#2d6130]">
                    <ShieldCheck size={14} />
                    EUDR Compliant
                  </span>
                </div>

                {/* Search & Filters */}
                <div className="mt-4 space-y-2">
                  <div className="relative">
                    <Search size={14} className="absolute left-3.5 top-3.5 text-[#57655d]" />
                    <input
                      type="text"
                      placeholder="Search by farm, farmer, village, or division..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] py-2.5 pl-9 pr-3 text-xs text-[#10251d] outline-none transition focus:bg-white focus:border-[#2d6130]"
                    />
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {["ALL", "Southwest", "Centre", "Littoral", "South", "Northwest"].map((region) => (
                      <button
                        key={region}
                        type="button"
                        onClick={() => setFilterRegion(region)}
                        className={`rounded-full px-2.5 py-1 text-[0.68rem] font-semibold transition cursor-pointer ${
                          filterRegion === region
                            ? "bg-[#0b3528] text-white"
                            : "bg-[#edf1ea] text-[#57655d] hover:bg-[#dfe7d8]"
                        }`}
                      >
                        {region}
                      </button>
                    ))}
                  </div>
                </div>

                {/* List of Farms */}
                <div className="mt-4 max-h-[620px] space-y-3.5 overflow-y-auto pr-1">
                  {filteredFarms.length > 0 ? (
                    filteredFarms.map((farm) => (
                      <div
                        key={farm.id}
                        className="group rounded-2xl border border-[#dfe7d8] bg-[#f9fbf7] p-4 text-xs transition hover:border-[#2d6130] hover:shadow-md"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <strong className="text-sm font-semibold text-[#10251d]">
                              {farm.farmName}
                            </strong>
                            <p className="text-[0.72rem] text-[#57655d]">
                              {farm.village ? `${farm.village}, ` : ""}{farm.lga || farm.region}
                            </p>
                          </div>
                          <span className="rounded-full bg-[#edf7e8] px-2 py-0.5 text-[0.62rem] font-bold text-[#2d6130]">
                            {farm.eudrCompliant ? "EUDR Verified" : "Pending"}
                          </span>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[#edf1ea] pt-2 text-[0.72rem] text-[#4b594f]">
                          <div>
                            <span className="block text-[0.62rem] uppercase tracking-wider text-[#6f7e73]">Farmer</span>
                            <span className="font-medium text-[#10251d]">{farm.farmerName || "Registered Farmer"}</span>
                          </div>
                          <div>
                            <span className="block text-[0.62rem] uppercase tracking-wider text-[#6f7e73]">Farm Size</span>
                            <span className="font-medium text-[#10251d]">{farm.sizeHectares || 2.5} Hectares</span>
                          </div>
                          <div>
                            <span className="block text-[0.62rem] uppercase tracking-wider text-[#6f7e73]">Current Batch</span>
                            <span className="font-mono text-[#2d6130]">{farm.batchNumber || "BATCH-DEFAULT"}</span>
                          </div>
                          <div>
                            <span className="block text-[0.62rem] uppercase tracking-wider text-[#6f7e73]">Harvested</span>
                            <span className="font-medium text-[#10251d]">{farm.quantityHarvestedKg || 0} kg</span>
                          </div>
                        </div>

                        <div className="mt-2.5 flex items-center justify-between gap-1 border-t border-[#edf1ea] pt-2">
                          <div className="flex items-center gap-1 font-mono text-[0.68rem] text-[#2d6130] truncate">
                            <MapPin size={11} className="shrink-0" />
                            <span className="truncate">{farm.geolocation}</span>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setNewBatchFarmModal(farm);
                                setBatchAddCode(`BATCH-CR-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`);
                              }}
                              className="rounded-full bg-white px-2.5 py-1 text-[0.68rem] font-bold text-[#0b3528] border border-[#dfe7d8] hover:bg-[#edf7e8] transition cursor-pointer"
                            >
                              + Batch
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedFarmModal(farm)}
                              className="inline-flex items-center gap-1 rounded-full bg-[#0b3528] px-2.5 py-1 text-[0.68rem] font-bold text-white hover:bg-[#07241b] transition cursor-pointer"
                            >
                              <Eye size={11} /> Dossier
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-[#dfe7d8] p-8 text-center text-xs text-[#57655d]">
                      <ShieldCheck size={28} className="mx-auto text-[#2d6130]/60 mb-2" />
                      No registered farm plots match your search.
                    </div>
                  )}
                </div>
              </div>

              {/* Information Card on Traceability Integrity */}
              <div className="rounded-[28px] border border-[#dfe7d8] bg-[#063325] p-6 text-white shadow-sm">
                <span className="text-[10px] font-bold tracking-widest text-[#b8f58b] uppercase">
                  Supply Chain Traceability
                </span>
                <h4 className="mt-2 text-base font-semibold">
                  Custody & Origin Integrity
                </h4>
                <p className="mt-2 text-xs leading-5 text-white/75">
                  Every registered plot is georeferenced to preserve origin and chain-of-custody data as cocoa moves from farm gate through aggregation hubs to international export channels, in full accordance with EUDR requirements.
                </p>
                <Link
                  href="/marketplace"
                  className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-[#b8f58b] hover:underline"
                >
                  Browse Marketplace Lots <ArrowRight size={14} />
                </Link>
              </div>
            </aside>
          </div>
        )}
      </main>

      {/* Auth Modal Triggered when Guest submits farm plot */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[32px] border border-[#dfe7d8] bg-white p-7 shadow-2xl sm:p-8">
            <div className="flex items-start justify-between border-b border-[#edf1ea] pb-3">
              <div>
                <span className="text-[0.68rem] font-bold uppercase tracking-wider text-[#2d6130]">
                  Authenticate Record
                </span>
                <h3 className="text-xl font-bold text-[#10251d]">
                  Save Farm to Registry
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAuthModal(false)}
                className="rounded-full p-1.5 text-[#57655d] hover:bg-[#f7f8f3] cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <p className="mt-2 text-xs text-[#57655d]">
              To anchor this plot and issue EUDR documentation, connect your account with Google or enter an email.
            </p>

            {authModalError && (
              <div className="mt-3 flex items-center gap-2 rounded-2xl bg-red-50 p-3 text-xs text-red-700">
                <AlertCircle size={15} className="shrink-0" />
                <span>{authModalError}</span>
              </div>
            )}

            <div className="mt-4 space-y-3">
              <button
                type="button"
                onClick={handleModalGoogleLogin}
                disabled={authModalLoading}
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

              <div className="relative my-2 flex items-center justify-center">
                <div className="h-px w-full bg-[#dfe7d8]" />
                <span className="absolute bg-white px-2 text-[0.62rem] uppercase font-bold text-[#6f7e73]">
                  Or with email
                </span>
              </div>

              <div className="flex rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] p-1 text-[0.68rem] font-semibold">
                <button
                  type="button"
                  onClick={() => setAuthModalMode("signup")}
                  className={`flex-1 rounded-lg py-1 transition cursor-pointer ${
                    authModalMode === "signup" ? "bg-white text-[#10251d] shadow-sm" : "text-[#57655d]"
                  }`}
                >
                  Create Account
                </button>
                <button
                  type="button"
                  onClick={() => setAuthModalMode("signin")}
                  className={`flex-1 rounded-lg py-1 transition cursor-pointer ${
                    authModalMode === "signin" ? "bg-white text-[#10251d] shadow-sm" : "text-[#57655d]"
                  }`}
                >
                  Sign In
                </button>
              </div>

              <form onSubmit={handleAuthModalSubmit} className="space-y-3 text-xs">
                {authModalMode === "signup" && (
                  <div>
                    <label className="mb-1 block font-semibold text-[#48574c]">Your Name</label>
                    <input
                      type="text"
                      value={authModalName}
                      onChange={(e) => setAuthModalName(e.target.value)}
                      placeholder="e.g. Alain Nkweta"
                      className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] px-3.5 py-2.5 text-xs text-[#10251d] outline-none"
                    />
                  </div>
                )}

                <div>
                  <label className="mb-1 block font-semibold text-[#48574c]">Email Address *</label>
                  <input
                    type="email"
                    required
                    value={authModalEmail}
                    onChange={(e) => setAuthModalEmail(e.target.value)}
                    placeholder="farmer@cocoatrace.cm"
                    className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] px-3.5 py-2.5 text-xs text-[#10251d] outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block font-semibold text-[#48574c]">Password *</label>
                  <input
                    type="password"
                    required
                    value={authModalPassword}
                    onChange={(e) => setAuthModalPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] px-3.5 py-2.5 text-xs text-[#10251d] outline-none"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAuthModal(false)}
                    className="flex-1 rounded-2xl border border-[#dfe7d8] px-4 py-2.5 font-semibold text-[#57655d] hover:bg-[#f7f8f3] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={authModalLoading}
                    className="flex-1 rounded-2xl bg-[#0b3528] px-4 py-2.5 font-bold text-white transition hover:bg-[#07241b] disabled:opacity-50 cursor-pointer"
                  >
                    {authModalLoading ? "Saving..." : authModalMode === "signup" ? "Register & Save" : "Sign In & Save"}
                  </button>
                </div>
              </form>

              <div className="mt-3 border-t border-[#edf1ea] pt-2.5 text-center">
                <button
                  type="button"
                  onClick={() => {
                    loginAsDemo({
                      displayName: farmerName || "Alain Nkweta (Verified Producer)",
                      email: farmerEmail || "farmer@cocoatrace.cm",
                    });
                    setShowAuthModal(false);
                    setTimeout(() => {
                      executeFarmRegistration();
                    }, 200);
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-[#2d6130] hover:underline cursor-pointer"
                >
                  <Sparkles size={12} /> Instant Preview Save (Demo Producer)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Full Farm Onboarding Dossier */}
      {selectedFarmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[32px] border border-[#dfe7d8] bg-white p-6 shadow-2xl sm:p-8">
            <div className="flex items-start justify-between border-b border-[#edf1ea] pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-[#edf7e8] px-2.5 py-0.5 text-[0.65rem] font-bold text-[#2d6130]">
                    EUDR TRACEABILITY DOSSIER
                  </span>
                  <span className="font-mono text-xs text-[#57655d]">
                    {selectedFarmModal.id}
                  </span>
                </div>
                <h2 className="mt-2 text-2xl font-bold text-[#10251d]">
                  {selectedFarmModal.farmName}
                </h2>
                <p className="text-xs text-[#57655d]">
                  {selectedFarmModal.village ? `${selectedFarmModal.village}, ` : ""}
                  {selectedFarmModal.lga || ""} • {selectedFarmModal.region}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedFarmModal(null)}
                className="rounded-full p-2 text-[#57655d] hover:bg-[#f7f8f3] cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Dossier Content Grid */}
            <div className="mt-6 space-y-5 text-xs">
              {/* Producer Details */}
              <div className="rounded-2xl bg-[#f9fbf7] p-4 border border-[#edf1ea]">
                <h4 className="font-bold text-[#10251d] uppercase tracking-wider text-[0.68rem] mb-2 flex items-center gap-1.5">
                  <UserCheck size={14} className="text-[#2d6130]" /> Farmer & Cooperative Credentials
                </h4>
                <div className="grid grid-cols-2 gap-3 text-[#394a41]">
                  <div>
                    <span className="text-[#6f7e73] block text-[0.65rem]">Farmer Name</span>
                    <strong className="text-[#10251d] text-sm">{selectedFarmModal.farmerName || "Registered Farmer"}</strong>
                  </div>
                  <div>
                    <span className="text-[#6f7e73] block text-[0.65rem]">Cooperative / Union</span>
                    <strong className="text-[#10251d] text-sm">{selectedFarmModal.cooperative || "Independent Smallholder"}</strong>
                  </div>
                  <div>
                    <span className="text-[#6f7e73] block text-[0.65rem]">Farmer ID</span>
                    <span className="font-mono text-[#10251d]">{selectedFarmModal.farmerId}</span>
                  </div>
                  <div>
                    <span className="text-[#6f7e73] block text-[0.65rem]">Contact Phone</span>
                    <span className="text-[#10251d]">{selectedFarmModal.farmerPhone || "N/A"}</span>
                  </div>
                </div>
              </div>

              {/* Farm Geometry & Land */}
              <div className="rounded-2xl bg-[#f9fbf7] p-4 border border-[#edf1ea]">
                <h4 className="font-bold text-[#10251d] uppercase tracking-wider text-[0.68rem] mb-2 flex items-center gap-1.5">
                  <MapPin size={14} className="text-[#2d6130]" /> Farm Location & Land Documentation
                </h4>
                <div className="grid grid-cols-2 gap-3 text-[#394a41]">
                  <div>
                    <span className="text-[#6f7e73] block text-[0.65rem]">GPS Coordinates</span>
                    <span className="font-mono font-medium text-[#2d6130]">{selectedFarmModal.geolocation}</span>
                  </div>
                  <div>
                    <span className="text-[#6f7e73] block text-[0.65rem]">Farm Size</span>
                    <strong className="text-[#10251d]">{selectedFarmModal.sizeHectares || 2.5} Hectares</strong>
                  </div>
                  <div>
                    <span className="text-[#6f7e73] block text-[0.65rem]">Land Document Type</span>
                    <span className="text-[#10251d]">{selectedFarmModal.landDocType || "Customary Title"}</span>
                  </div>
                  <div>
                    <span className="text-[#6f7e73] block text-[0.65rem]">Document Reference</span>
                    <span className="font-mono text-[#10251d]">{selectedFarmModal.landDocReference || "REF-VERIFIED"}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-[#6f7e73] block text-[0.65rem]">Deforestation-Risk Assessment</span>
                    <span className="inline-block mt-0.5 rounded-full bg-[#edf7e8] px-2.5 py-0.5 text-[0.7rem] font-semibold text-[#1a4936]">
                      {selectedFarmModal.deforestationRisk || "Zero Deforestation Verified - Post-2020 Compliant"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Harvest & Batch Info */}
              <div className="rounded-2xl bg-[#f9fbf7] p-4 border border-[#edf1ea]">
                <h4 className="font-bold text-[#10251d] uppercase tracking-wider text-[0.68rem] mb-2 flex items-center gap-1.5">
                  <Layers size={14} className="text-[#2d6130]" /> Production, Harvest Batches & Trade Route
                </h4>
                <div className="grid grid-cols-2 gap-3 text-[#394a41]">
                  <div>
                    <span className="text-[#6f7e73] block text-[0.65rem]">Current Batch #</span>
                    <span className="font-mono font-bold text-[#2d6130]">{selectedFarmModal.batchNumber || "BATCH-01"}</span>
                  </div>
                  <div>
                    <span className="text-[#6f7e73] block text-[0.65rem]">Quantity Harvested</span>
                    <strong className="text-[#10251d]">{selectedFarmModal.quantityHarvestedKg || 0} kg</strong>
                  </div>
                  <div>
                    <span className="text-[#6f7e73] block text-[0.65rem]">Cocoa Variety</span>
                    <span className="text-[#10251d]">{selectedFarmModal.cocoaVariety || "High-Yield F1 Hybrid"}</span>
                  </div>
                  <div>
                    <span className="text-[#6f7e73] block text-[0.65rem]">Annual Yield Est.</span>
                    <span className="text-[#10251d]">{selectedFarmModal.estimatedAnnualYieldKg || 0} kg / yr</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-[#6f7e73] block text-[0.65rem]">Custody Route Corridor</span>
                    <p className="mt-0.5 text-xs text-[#10251d]">{selectedFarmModal.batchMovementRoute || "Direct Custody Transfer"}</p>
                  </div>
                  <div>
                    <span className="text-[#6f7e73] block text-[0.65rem]">Collection Centre</span>
                    <span className="text-[#10251d]">{selectedFarmModal.aggregatorCenter || "Local Hub"}</span>
                  </div>
                  <div>
                    <span className="text-[#6f7e73] block text-[0.65rem]">Processor / Exporter</span>
                    <span className="text-[#10251d]">{selectedFarmModal.processorExporter || "Licensed Cocoa Exporter"}</span>
                  </div>
                </div>
              </div>

              {/* Audit & Financial History */}
              <div className="rounded-2xl bg-[#f9fbf7] p-4 border border-[#edf1ea]">
                <h4 className="font-bold text-[#10251d] uppercase tracking-wider text-[0.68rem] mb-2 flex items-center gap-1.5">
                  <FileCheck2 size={14} className="text-[#2d6130]" /> Audit Verification & Payment Records
                </h4>
                <div className="grid grid-cols-2 gap-3 text-[#394a41]">
                  <div>
                    <span className="text-[#6f7e73] block text-[0.65rem]">Audit Status</span>
                    <span className="font-semibold text-[#1a4936]">{selectedFarmModal.auditStatus || "Verified"}</span>
                  </div>
                  <div>
                    <span className="text-[#6f7e73] block text-[0.65rem]">Audit Certificate #</span>
                    <span className="font-mono text-[#10251d]">{selectedFarmModal.auditCertificateNumber || "AUD-REF"}</span>
                  </div>
                  <div>
                    <span className="text-[#6f7e73] block text-[0.65rem]">Auditor Agency</span>
                    <span className="text-[#10251d]">{selectedFarmModal.auditorName || "SGS Agri-Trace"}</span>
                  </div>
                  <div>
                    <span className="text-[#6f7e73] block text-[0.65rem]">Payment Method</span>
                    <span className="text-[#10251d]">{selectedFarmModal.paymentMethod || "Mobile Money"}</span>
                  </div>
                  <div>
                    <span className="text-[#6f7e73] block text-[0.65rem]">Transaction Reference</span>
                    <span className="font-mono text-[#10251d]">{selectedFarmModal.transactionReference || "TX-VERIFIED"}</span>
                  </div>
                  <div>
                    <span className="text-[#6f7e73] block text-[0.65rem]">Settlement Value</span>
                    <strong className="text-[#10251d]">{selectedFarmModal.transactionAmount || "Settled"}</strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedFarmModal(null)}
                className="rounded-full bg-[#0b3528] px-6 py-2.5 text-xs font-bold text-white transition hover:bg-[#07241b] cursor-pointer"
              >
                Close Dossier
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Quick Record New Batch */}
      {newBatchFarmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[32px] border border-[#dfe7d8] bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#edf1ea] pb-3">
              <div>
                <span className="text-[0.68rem] font-bold uppercase tracking-wider text-[#2d6130]">
                  Harvest Intake
                </span>
                <h3 className="text-lg font-bold text-[#10251d]">
                  Record Harvest for {newBatchFarmModal.farmName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setNewBatchFarmModal(null)}
                className="rounded-full p-1.5 text-[#57655d] hover:bg-[#f7f8f3] cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleRecordNewBatch} className="mt-4 space-y-4 text-xs">
              <label className="block text-sm font-medium text-[#10251d]">
                <span className="mb-1 block text-xs font-semibold text-[#48574c]">Batch / Lot Code</span>
                <input
                  type="text"
                  required
                  value={batchAddCode}
                  onChange={(e) => setBatchAddCode(e.target.value)}
                  placeholder="BATCH-CR-2026-..."
                  className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] px-4 py-3 font-mono text-sm text-[#10251d] outline-none"
                />
              </label>

              <label className="block text-sm font-medium text-[#10251d]">
                <span className="mb-1 block text-xs font-semibold text-[#48574c]">Harvested Quantity (kg)</span>
                <input
                  type="number"
                  required
                  step="10"
                  value={batchAddQty}
                  onChange={(e) => setBatchAddQty(e.target.value)}
                  placeholder="e.g. 850"
                  className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] px-4 py-3 text-sm text-[#10251d] outline-none"
                />
              </label>

              <div className="rounded-xl bg-[#edf7e8] p-3 text-xs text-[#1a4936]">
                Current total on record: <span className="font-bold">{newBatchFarmModal.quantityHarvestedKg || 0} kg</span>.
                Adding this cycle will update the aggregate custody volume.
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setNewBatchFarmModal(null)}
                  className="rounded-full border border-[#dfe7d8] px-4 py-2 font-semibold text-[#57655d] hover:bg-[#f7f8f3] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updatingBatch}
                  className="rounded-full bg-[#0b3528] px-5 py-2 font-bold text-white transition hover:bg-[#07241b] disabled:opacity-50 cursor-pointer"
                >
                  {updatingBatch ? "Saving..." : "Record Batch"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
