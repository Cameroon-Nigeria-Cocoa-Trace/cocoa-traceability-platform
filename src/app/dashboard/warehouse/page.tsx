/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { useFirebase } from "@/context/FirebaseContext";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import {
  Building2,
  Boxes,
  Scale,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  MapPin,
  Plus,
  FileText,
  RefreshCw,
  X,
  Filter,
  AlertCircle,
  Truck,
  Layers,
  BarChart3,
  ExternalLink,
  ChevronRight,
  Info,
} from "lucide-react";
import {
  WarehouseFacility,
  WarehouseOrganization,
  WarehouseReceiptRecord,
  CrossRiverStateTraceCertificateRequest,
  WarehouseOperationalStatus,
  WarehouseSourceType,
} from "@/types/warehouse";

export default function WarehouseDashboardPage() {
  const router = useRouter();
  const { user, userRole, loading: authLoading } = useFirebase();

  // Core Data State
  const [facility, setFacility] = useState<WarehouseFacility | null>(null);
  const [organization, setOrganization] = useState<WarehouseOrganization | null>(null);
  const [receipts, setReceipts] = useState<WarehouseReceiptRecord[]>([]);
  const [crsRequests, setCrsRequests] = useState<CrossRiverStateTraceCertificateRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Active Tab: "intake" | "trace" | "facility"
  const [activeTab, setActiveTab] = useState<"intake" | "trace" | "facility">("intake");

  // Filter for Receipts
  const [receiptFilter, setReceiptFilter] = useState<"all" | "agent" | "cooperative" | "farmer">("all");

  // Modals
  const [showIntakeModal, setShowIntakeModal] = useState(false);
  const [showCrsModal, setShowCrsModal] = useState(false);
  const [submittingIntake, setSubmittingIntake] = useState(false);
  const [submittingCrs, setSubmittingCrs] = useState(false);

  // Intake Form State
  const [intakeCode, setIntakeCode] = useState("");
  const [intakeSourceType, setIntakeSourceType] = useState<WarehouseSourceType>("agent");
  const [intakeSourceName, setIntakeSourceName] = useState("");
  const [intakeQuantityKg, setIntakeQuantityKg] = useState<number>(5000);
  const [intakeGrade, setIntakeGrade] = useState<"Grade 1" | "Grade 2" | "Industrial">("Grade 1");
  const [intakeMoisture, setIntakeMoisture] = useState<number>(7.2);
  const [intakeLotId, setIntakeLotId] = useState("");
  const [intakeNotes, setIntakeNotes] = useState("");
  const [intakeError, setIntakeError] = useState<string | null>(null);

  // CRS Trace Request Form State
  const [crsConsignmentCode, setCrsConsignmentCode] = useState("");
  const [crsQuantityKg, setCrsQuantityKg] = useState<number>(5000);
  const [crsOriginSummary, setCrsOriginSummary] = useState(
    "Cameroon Mamfe Corridor via Ikom Border Axis to Calabar Port"
  );
  const [crsApplicantName, setCrsApplicantName] = useState("");
  const [crsApplicantEmail, setCrsApplicantEmail] = useState("");
  const [crsApplicantPhone, setCrsApplicantPhone] = useState("");
  const [crsError, setCrsError] = useState<string | null>(null);

  // Fetch Live Data
  const loadDashboardData = useCallback(async () => {
    try {
      setError(null);

      // Determine facility target
      let foundFacility: WarehouseFacility | null = null;
      let foundOrg: WarehouseOrganization | null = null;

      if (user?.uid) {
        // 1. Try querying facility by managerUserId
        const facQ = query(
          collection(db, "warehouse_facilities"),
          where("managerUserId", "==", user.uid)
        );
        const facSnap = await getDocs(facQ);

        if (!facSnap.empty) {
          foundFacility = facSnap.docs[0].data() as WarehouseFacility;
        } else {
          // 2. Check user's document for facilityId
          const userDoc = await getDoc(doc(db, "users", user.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            if (userData.facilityId) {
              const facDoc = await getDoc(doc(db, "warehouse_facilities", userData.facilityId));
              if (facDoc.exists()) {
                foundFacility = facDoc.data() as WarehouseFacility;
              }
            }
          }
        }
      }

      // Fallback: If no user or facility found, check default demonstration terminal
      if (!foundFacility) {
        try {
          const defaultDoc = await getDoc(doc(db, "warehouse_facilities", "wh_calabar_port"));
          if (defaultDoc.exists()) {
            foundFacility = defaultDoc.data() as WarehouseFacility;
          }
        } catch {
          // handled
        }
      }

      // In-memory fallback if Firestore returned nothing
      if (!foundFacility) {
        foundFacility = {
          id: "wh_calabar_port",
          organizationId: "org_wh_crossriver_bonded",
          name: "Calabar Port Maritime Export Facility",
          licenseNumber: "NCS-WH-CAL-2026-01",
          location: {
            address: "Berth 4, Calabar Free Trade Zone Port Complex",
            cityOrLGA: "Calabar South",
            stateOrRegion: "Cross River State",
            country: "Nigeria",
            latitude: 4.9757,
            longitude: 8.3417,
            operatingHours: "06:00 - 20:00 WAT",
          },
          capacityKg: 500000,
          capacityBags: Math.floor(500000 / 64),
          currentStockKg: 120000,
          currentStockBags: Math.floor(120000 / 64),
          availableCapacityKg: 380000,
          operationalStatus: "operational",
          adminStatus: "active",
          managerUserId: user?.uid || "usr_wh_mgr_01",
          contactEmail: user?.email || "terminal-ops@cr-cocoaterminal.com",
          contactPhone: "+234 803 777 6543",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: new Date().toISOString(),
        };
      }

      setFacility(foundFacility);

      // Load Organization
      if (foundFacility.organizationId) {
        try {
          const orgDoc = await getDoc(
            doc(db, "warehouse_organizations", foundFacility.organizationId)
          );
          if (orgDoc.exists()) {
            foundOrg = orgDoc.data() as WarehouseOrganization;
            setOrganization(foundOrg);
          }
        } catch {
          // fallback
        }
      }

      if (!foundOrg) {
        setOrganization({
          id: foundFacility.organizationId || "org_wh_crossriver_bonded",
          name: "Cross River State Maritime & Inland Cocoa Terminal Ltd",
          registrationNumber: "RC-WH-CR-2026-081",
          customsBondedWarehouseCode: "NCS-BOND-CR-0012",
          headquartersAddress: "Free Trade Zone Expressway, Calabar",
          contactEmail: "terminal-ops@cr-cocoaterminal.com",
          contactPhone: "+234 803 777 6543",
          facilities: [foundFacility.id],
          status: "active",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        });
      }

      // Load Receipts for this facility
      try {
        const rcptQ = query(
          collection(db, "warehouse_receipts"),
          where("facilityId", "==", foundFacility.id)
        );
        const rcptSnap = await getDocs(rcptQ);
        const fetchedReceipts: WarehouseReceiptRecord[] = [];
        rcptSnap.forEach((d) => {
          fetchedReceipts.push(d.data() as WarehouseReceiptRecord);
        });
        fetchedReceipts.sort(
          (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
        );
        setReceipts(fetchedReceipts);
      } catch (err) {
        console.warn("Notice loading warehouse receipts:", err);
      }

      // Load CRS Full Trace Requests
      try {
        const crsQ = query(
          collection(db, "warehouse_crs_requests"),
          where("facilityId", "==", foundFacility.id)
        );
        const crsSnap = await getDocs(crsQ);
        const fetchedCrs: CrossRiverStateTraceCertificateRequest[] = [];
        crsSnap.forEach((d) => {
          fetchedCrs.push(d.data() as CrossRiverStateTraceCertificateRequest);
        });
        fetchedCrs.sort(
          (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
        );
        setCrsRequests(fetchedCrs);
      } catch (err) {
        console.warn("Notice loading CRS requests:", err);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Handle Operational Status Change
  const handleStatusChange = async (newStatus: WarehouseOperationalStatus) => {
    if (!facility) return;
    try {
      setError(null);
      setSuccessMessage(null);

      // Call API or update directly
      const response = await fetch("/api/warehouse/capacity", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-uid": user?.uid || facility.managerUserId,
        },
        body: JSON.stringify({
          facilityId: facility.id,
          status: newStatus,
          actorUserId: user?.uid || facility.managerUserId,
        }),
      });

      const resData = await response.json();
      if (!response.ok || !resData.success) {
        throw new Error(resData.error || "Failed to update operational status.");
      }

      setFacility((prev) => (prev ? { ...prev, operationalStatus: newStatus } : null));
      setSuccessMessage(`Operational status changed to "${newStatus.replace("_", " ").toUpperCase()}"`);
      setTimeout(() => setSuccessMessage(null), 3500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    }
  };

  // Handle Consignment Intake Submission
  const handleIntakeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!facility) return;
    setIntakeError(null);

    if (facility.operationalStatus === "closed" || facility.operationalStatus === "maintenance") {
      setIntakeError(
        `Facility is currently "${facility.operationalStatus}". Consignments cannot be received.`
      );
      return;
    }

    if (intakeQuantityKg <= 0) {
      setIntakeError("Consignment weight must be greater than 0 kg.");
      return;
    }

    // Atomic Capacity Constraint
    if (intakeQuantityKg > facility.availableCapacityKg) {
      setIntakeError(
        `Quantity of ${intakeQuantityKg.toLocaleString()} kg exceeds available space of ${facility.availableCapacityKg.toLocaleString()} kg.`
      );
      return;
    }

    const cleanSourceName = intakeSourceName.trim();
    if (!cleanSourceName) {
      setIntakeError("Please provide the source agent, cooperative, or producer name.");
      return;
    }

    const code =
      intakeCode.trim() ||
      `CONSIGN-${facility.location.cityOrLGA.substring(0, 3).toUpperCase()}-${new Date().getFullYear()}-${Math.floor(
        1000 + Math.random() * 9000
      )}`;

    try {
      setSubmittingIntake(true);

      const response = await fetch("/api/warehouse/receiving", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-uid": user?.uid || facility.managerUserId,
        },
        body: JSON.stringify({
          facilityId: facility.id,
          consignmentCode: code,
          sourceType: intakeSourceType,
          sourceEntityId: `src_${Date.now()}`,
          sourceEntityName: cleanSourceName,
          quantityKg: intakeQuantityKg,
          cocoaLotId: intakeLotId.trim() || undefined,
          qualityInspectionGrade: intakeGrade,
          moistureContentPercent: Number(intakeMoisture),
          receivedByName: user?.displayName || facility.contactEmail || "Facility Custodian",
          notes: intakeNotes.trim() || undefined,
          actorUserId: user?.uid || facility.managerUserId,
        }),
      });

      const resData = await response.json();
      if (!response.ok || !resData.success) {
        throw new Error(resData.error || "Failed to log consignment receipt.");
      }

      // Update state locally
      setReceipts((prev) => [resData.receipt, ...prev]);
      setFacility(resData.updatedFacility);

      setShowIntakeModal(false);
      setIntakeCode("");
      setIntakeSourceName("");
      setIntakeLotId("");
      setIntakeNotes("");
      setSuccessMessage(
        `Consignment "${code}" (${intakeQuantityKg.toLocaleString()} kg) successfully received into inventory.`
      );
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setIntakeError(msg);
    } finally {
      setSubmittingIntake(false);
    }
  };

  // Handle CRS Full Trace Request Submission
  const handleCrsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!facility) return;
    setCrsError(null);

    const code = crsConsignmentCode.trim();
    if (!code) {
      setCrsError("Consignment reference code is required.");
      return;
    }

    if (crsQuantityKg <= 0) {
      setCrsError("Quantity must be greater than 0 kg.");
      return;
    }

    const applicant = crsApplicantName.trim() || user?.displayName || "Warehouse Custodian";
    const email = crsApplicantEmail.trim() || user?.email || facility.contactEmail;
    const phone = crsApplicantPhone.trim() || facility.contactPhone;

    try {
      setSubmittingCrs(true);

      const response = await fetch("/api/warehouse/receiving", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-uid": user?.uid || facility.managerUserId,
        },
        body: JSON.stringify({
          action: "request_crs_trace_cert",
          facilityId: facility.id,
          consignmentCode: code,
          totalQuantityKg: crsQuantityKg,
          sourceOriginSummary: crsOriginSummary.trim(),
          applicantName: applicant,
          applicantContactEmail: email,
          applicantContactPhone: phone,
          actorUserId: user?.uid || facility.managerUserId,
        }),
      });

      const resData = await response.json();
      if (!response.ok || !resData.success) {
        throw new Error(resData.error || "Failed to submit CRS Trace Certificate request.");
      }

      setCrsRequests((prev) => [resData.crsRequest, ...prev]);
      setShowCrsModal(false);
      setCrsConsignmentCode("");
      setSuccessMessage(
        `CRS Full Trace Certificate request "${resData.crsRequest.requestNumber}" submitted successfully.`
      );
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setCrsError(msg);
    } finally {
      setSubmittingCrs(false);
    }
  };

  // Filtered Receipts
  const filteredReceipts = useMemo(() => {
    if (receiptFilter === "all") return receipts;
    return receipts.filter((r) => r.sourceType === receiptFilter);
  }, [receipts, receiptFilter]);

  // Derived Metrics
  const utilizationRate = facility
    ? Math.min(100, Math.round((facility.currentStockKg / Math.max(1, facility.capacityKg)) * 100))
    : 0;

  const totalTonnageReceivedKg = receipts.reduce((sum, r) => sum + r.quantityKg, 0);

  if (authLoading || (loading && !facility)) {
    return (
      <div className="min-h-screen bg-[#f7f8f3] text-[#10251d]">
        <Navbar />
        <div className="flex flex-col items-center justify-center min-h-[70vh]">
          <div className="h-10 w-10 animate-spin rounded-full border-3 border-[#2d6130] border-t-transparent mb-4" />
          <p className="text-sm font-semibold text-[#57655d]">Loading Warehouse Workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f8f3] text-[#10251d]">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 pt-28 pb-20 sm:px-6 sm:pt-36 lg:px-8">
        {/* Alerts */}
        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-start justify-between gap-3 shadow-sm">
            <div className="flex items-start gap-2.5">
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Notice</p>
                <p className="text-xs mt-0.5">{error}</p>
              </div>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-red-500 hover:text-red-700 cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {successMessage && (
          <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 flex items-start justify-between gap-3 shadow-sm">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Action Completed</p>
                <p className="text-xs mt-0.5">{successMessage}</p>
              </div>
            </div>
            <button
              onClick={() => setSuccessMessage(null)}
              className="text-emerald-600 hover:text-emerald-800 cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Facility Header Card */}
        {facility && (
          <div className="rounded-[32px] border border-[#dfe7d8] bg-white p-6 sm:p-8 shadow-sm">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div>
                <div className="flex flex-wrap items-center gap-2.5 mb-2.5">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#edf7e8] px-3 py-0.5 text-xs font-bold uppercase tracking-wider text-[#2d6130] border border-[#d2ecc8]">
                    <Building2 size={13} /> {facility.licenseNumber}
                  </span>

                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold border ${
                      facility.adminStatus === "active"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-red-50 text-red-700 border-red-200"
                    }`}
                  >
                    Platform Admin: {facility.adminStatus.toUpperCase()}
                  </span>

                  <span className="text-xs text-[#57655d] flex items-center gap-1">
                    <MapPin size={13} className="text-[#2d6130]" />
                    {facility.location.cityOrLGA}, {facility.location.stateOrRegion} ({facility.location.country})
                  </span>
                </div>

                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#10251d]">
                  {facility.name}
                </h1>
                <p className="mt-1 text-xs sm:text-sm text-[#57655d]">
                  {organization?.name || "Cross River State Maritime & Inland Cocoa Terminal Ltd"} • Operating Hours:{" "}
                  {facility.location.operatingHours}
                </p>
              </div>

              {/* Status Controller & Actions */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="rounded-2xl bg-[#f8faf7] border border-[#dfe7d8] p-2 flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#57655d] pl-2">
                    Status:
                  </span>
                  <select
                    value={facility.operationalStatus}
                    onChange={(e) => handleStatusChange(e.target.value as WarehouseOperationalStatus)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-bold border cursor-pointer outline-none transition ${
                      facility.operationalStatus === "operational"
                        ? "bg-emerald-500 text-white border-emerald-600"
                        : facility.operationalStatus === "at_capacity"
                        ? "bg-rose-500 text-white border-rose-600"
                        : facility.operationalStatus === "maintenance"
                        ? "bg-amber-500 text-white border-amber-600"
                        : "bg-gray-600 text-white border-gray-700"
                    }`}
                  >
                    <option value="operational">🟢 Operational (Accepting Lots)</option>
                    <option value="at_capacity">🔴 At Capacity (Suspended)</option>
                    <option value="maintenance">🟡 Maintenance / Fumigation</option>
                    <option value="closed">⚪ Closed</option>
                  </select>
                </div>

                <button
                  onClick={() => {
                    setRefreshing(true);
                    loadDashboardData();
                  }}
                  disabled={refreshing}
                  className="rounded-2xl border border-gray-200 bg-white p-2.5 text-[#57655d] hover:text-[#10251d] hover:border-gray-300 transition cursor-pointer"
                  title="Refresh Dashboard Data"
                >
                  <RefreshCw size={16} className={refreshing ? "animate-spin text-[#2d6130]" : ""} />
                </button>
              </div>
            </div>

            {/* Quick Action Buttons */}
            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-[#edf1ea] pt-5">
              <button
                type="button"
                onClick={() => {
                  setIntakeError(null);
                  setShowIntakeModal(true);
                }}
                disabled={facility.operationalStatus !== "operational"}
                className="inline-flex items-center gap-2 rounded-xl bg-[#0b3528] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#134939] disabled:opacity-50 cursor-pointer"
              >
                <Plus size={15} /> Log Consignment Intake
              </button>

              <button
                type="button"
                onClick={() => {
                  setCrsError(null);
                  setShowCrsModal(true);
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-[#2d6130] bg-[#edf7e8] px-4 py-2.5 text-xs font-bold text-[#2d6130] transition hover:bg-[#e2f1db] cursor-pointer"
              >
                <FileText size={15} /> Request CRS Full Trace Certificate
              </button>

              <div className="ml-auto text-xs text-[#57655d] flex items-center gap-1.5">
                <span className="font-semibold">Custodian:</span>{" "}
                <span className="text-[#10251d] font-bold">
                  {user?.displayName || facility.contactEmail}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Metrics Grid */}
        {facility && (
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Metric 1: Total Rated Capacity */}
            <div className="rounded-2xl border border-[#dfe7d8] bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between text-[#57655d] mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Rated Capacity</span>
                <Boxes size={18} className="text-[#2d6130]" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-extrabold text-[#10251d]">
                  {(facility.capacityKg / 1000).toLocaleString()} MT
                </span>
                <span className="text-xs text-[#57655d]">
                  ({facility.capacityKg.toLocaleString()} kg)
                </span>
              </div>
              <p className="mt-1 text-[11px] text-[#57655d]">
                Standard 64kg Export Bags:{" "}
                <span className="font-bold text-[#10251d]">
                  {facility.capacityBags.toLocaleString()} bags
                </span>
              </p>
            </div>

            {/* Metric 2: Current Physical Stock */}
            <div className="rounded-2xl border border-[#dfe7d8] bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between text-[#57655d] mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Current Stock</span>
                <Scale size={18} className="text-[#2d6130]" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-extrabold text-[#10251d]">
                  {(facility.currentStockKg / 1000).toLocaleString(undefined, {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}{" "}
                  MT
                </span>
                <span className="text-xs text-[#57655d]">
                  ({facility.currentStockKg.toLocaleString()} kg)
                </span>
              </div>
              <p className="mt-1 text-[11px] text-[#57655d]">
                Current In-Bay:{" "}
                <span className="font-bold text-[#10251d]">
                  {facility.currentStockBags.toLocaleString()} bags
                </span>
              </p>
            </div>

            {/* Metric 3: Available Free Space */}
            <div className="rounded-2xl border border-[#dfe7d8] bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between text-[#57655d] mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Available Space</span>
                <Layers size={18} className="text-[#2d6130]" />
              </div>
              <div className="flex items-baseline gap-2">
                <span
                  className={`text-2xl font-extrabold ${
                    facility.availableCapacityKg <= 0 ? "text-rose-600" : "text-[#10251d]"
                  }`}
                >
                  {(facility.availableCapacityKg / 1000).toLocaleString(undefined, {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}{" "}
                  MT
                </span>
                <span className="text-xs text-[#57655d]">
                  ({facility.availableCapacityKg.toLocaleString()} kg)
                </span>
              </div>
              <p className="mt-1 text-[11px] text-[#57655d]">
                Free Intake Room:{" "}
                <span className="font-bold text-[#10251d]">
                  {Math.floor(facility.availableCapacityKg / 64).toLocaleString()} bags
                </span>
              </p>
            </div>

            {/* Metric 4: Utilization Rate */}
            <div className="rounded-2xl border border-[#dfe7d8] bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between text-[#57655d] mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Utilization Rate</span>
                <BarChart3 size={18} className="text-[#2d6130]" />
              </div>
              <div className="flex items-baseline gap-2">
                <span
                  className={`text-2xl font-extrabold ${
                    utilizationRate >= 95
                      ? "text-rose-600"
                      : utilizationRate >= 75
                      ? "text-amber-600"
                      : "text-emerald-700"
                  }`}
                >
                  {utilizationRate}%
                </span>
                <span className="text-xs text-[#57655d]">
                  {facility.operationalStatus === "at_capacity" ? "Capacity Full" : "Occupancy"}
                </span>
              </div>

              {/* Progress bar */}
              <div className="mt-2 h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    utilizationRate >= 95
                      ? "bg-rose-500"
                      : utilizationRate >= 75
                      ? "bg-amber-500"
                      : "bg-[#2d6130]"
                  }`}
                  style={{ width: `${utilizationRate}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="mt-8 border-b border-[#dfe7d8]">
          <div className="flex gap-6">
            <button
              onClick={() => setActiveTab("intake")}
              className={`pb-4 text-sm font-bold border-b-2 transition cursor-pointer flex items-center gap-2 ${
                activeTab === "intake"
                  ? "border-[#2d6130] text-[#0b3528]"
                  : "border-transparent text-[#57655d] hover:text-[#10251d]"
              }`}
            >
              <Boxes size={16} /> Consignment Receipts ({receipts.length})
            </button>

            <button
              onClick={() => setActiveTab("trace")}
              className={`pb-4 text-sm font-bold border-b-2 transition cursor-pointer flex items-center gap-2 ${
                activeTab === "trace"
                  ? "border-[#2d6130] text-[#0b3528]"
                  : "border-transparent text-[#57655d] hover:text-[#10251d]"
              }`}
            >
              <ShieldCheck size={16} /> CRS Trace Certificates ({crsRequests.length})
            </button>

            <button
              onClick={() => setActiveTab("facility")}
              className={`pb-4 text-sm font-bold border-b-2 transition cursor-pointer flex items-center gap-2 ${
                activeTab === "facility"
                  ? "border-[#2d6130] text-[#0b3528]"
                  : "border-transparent text-[#57655d] hover:text-[#10251d]"
              }`}
            >
              <Building2 size={16} /> Facility Specs & Compliance
            </button>
          </div>
        </div>

        {/* TAB 1: Consignment Receipts */}
        {activeTab === "intake" && (
          <div className="mt-6 space-y-6">
            {/* Filter and Controls Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#57655d] uppercase tracking-wider">Source:</span>
                {(["all", "agent", "cooperative", "farmer"] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setReceiptFilter(type)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition cursor-pointer ${
                      receiptFilter === type
                        ? "bg-[#0b3528] text-white border-[#0b3528]"
                        : "bg-white text-[#57655d] border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    {type === "all" ? "All Sources" : type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                ))}
              </div>

              <div className="text-xs text-[#57655d]">
                Total Received to Date:{" "}
                <span className="font-bold text-[#10251d]">
                  {(totalTonnageReceivedKg / 1000).toLocaleString(undefined, {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}{" "}
                  MT
                </span>{" "}
                across <span className="font-bold text-[#10251d]">{receipts.length} consignments</span>
              </div>
            </div>

            {/* Receipts List / Empty State */}
            {filteredReceipts.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-[#dfe7d8] bg-white p-12 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#edf7e8] text-[#2d6130] mb-4">
                  <Boxes size={28} />
                </div>
                <h3 className="text-base font-bold text-[#10251d]">No Consignments Recorded Yet</h3>
                <p className="mt-1 text-xs sm:text-sm text-[#57655d] max-w-md mx-auto">
                  When buying agents, cooperatives, or farmers deliver cocoa lots to this facility, log their
                  inspection grade and weight here to update stock levels.
                </p>
                <div className="mt-6">
                  <button
                    type="button"
                    onClick={() => setShowIntakeModal(true)}
                    disabled={facility?.operationalStatus !== "operational"}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#0b3528] px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#134939] disabled:opacity-50 cursor-pointer"
                  >
                    <Plus size={14} /> Log First Consignment
                  </button>
                </div>
              </div>
            ) : (
              <div className="overflow-hidden rounded-3xl border border-[#dfe7d8] bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#f8faf7] border-b border-[#dfe7d8] text-[11px] font-bold uppercase tracking-wider text-[#57655d]">
                      <tr>
                        <th className="px-5 py-3.5">Consignment Code</th>
                        <th className="px-5 py-3.5">Source Entity</th>
                        <th className="px-5 py-3.5">Weight (Kg & Bags)</th>
                        <th className="px-5 py-3.5">Inspection Grade</th>
                        <th className="px-5 py-3.5">Moisture %</th>
                        <th className="px-5 py-3.5">Received At</th>
                        <th className="px-5 py-3.5">Storage Bay / Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#edf1ea]">
                      {filteredReceipts.map((rcpt) => (
                        <tr key={rcpt.id} className="hover:bg-[#fbfcfb] transition">
                          <td className="px-5 py-4 font-bold text-[#10251d]">
                            <div className="flex items-center gap-2">
                              <span>{rcpt.consignmentCode}</span>
                              {rcpt.cocoaLotId && (
                                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[9px] text-[#57655d]">
                                  Lot: {rcpt.cocoaLotId}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <span className="font-semibold text-[#10251d]">{rcpt.sourceEntityName}</span>
                            <span className="block text-[10px] uppercase font-bold text-[#57655d]">
                              Type: {rcpt.sourceType}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <span className="font-bold text-[#0b3528]">
                              {rcpt.quantityKg.toLocaleString()} kg
                            </span>
                            <span className="block text-[10px] text-[#57655d]">
                              ({rcpt.totalBags || Math.ceil(rcpt.quantityKg / 64)} export bags)
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <span
                              className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                                rcpt.qualityInspectionGrade === "Grade 1"
                                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                                  : rcpt.qualityInspectionGrade === "Grade 2"
                                  ? "bg-amber-50 text-amber-800 border border-amber-200"
                                  : "bg-gray-100 text-gray-800"
                              }`}
                            >
                              {rcpt.qualityInspectionGrade}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <span
                              className={`inline-flex items-center gap-1 font-semibold ${
                                (rcpt.moistureContentPercent || 7.2) <= 7.5
                                  ? "text-emerald-700"
                                  : "text-amber-700"
                              }`}
                            >
                              {(rcpt.moistureContentPercent || 7.2).toFixed(1)}%
                              {(rcpt.moistureContentPercent || 7.2) <= 7.5 ? (
                                <CheckCircle2 size={12} className="text-emerald-600" />
                              ) : (
                                <AlertTriangle size={12} className="text-amber-600" />
                              )}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-[#57655d]">
                            {new Date(rcpt.receivedAt).toLocaleDateString("en-GB", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                            <span className="block text-[10px] text-gray-400">
                              By: {rcpt.receivedByName}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-[#57655d] max-w-xs truncate">
                            {rcpt.notes || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: CRS Full Trace Certificates */}
        {activeTab === "trace" && (
          <div className="mt-6 space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-[#10251d]">
                  Cross River State Ministry Statutory Full Trace Certificates
                </h3>
                <p className="text-xs text-[#57655d]">
                  Statutory trace verification for consignments traversing Cameroon-Mamfe or Cross River corridors
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setCrsError(null);
                  setShowCrsModal(true);
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-[#0b3528] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#134939] cursor-pointer"
              >
                <Plus size={14} /> New Certificate Request
              </button>
            </div>

            {crsRequests.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-[#dfe7d8] bg-white p-12 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#edf7e8] text-[#2d6130] mb-4">
                  <ShieldCheck size={28} />
                </div>
                <h3 className="text-base font-bold text-[#10251d]">No CRS Trace Requests Filed</h3>
                <p className="mt-1 text-xs sm:text-sm text-[#57655d] max-w-md mx-auto">
                  Submit consignment lots for official Cross River State Trace Verification to secure customs bonded
                  export clearance.
                </p>
                <div className="mt-6">
                  <button
                    type="button"
                    onClick={() => setShowCrsModal(true)}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#0b3528] px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#134939] cursor-pointer"
                  >
                    <Plus size={14} /> Request Full Trace Certificate
                  </button>
                </div>
              </div>
            ) : (
              <div className="overflow-hidden rounded-3xl border border-[#dfe7d8] bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#f8faf7] border-b border-[#dfe7d8] text-[11px] font-bold uppercase tracking-wider text-[#57655d]">
                      <tr>
                        <th className="px-5 py-3.5">Request Ref</th>
                        <th className="px-5 py-3.5">Consignment Code</th>
                        <th className="px-5 py-3.5">Corridor Summary</th>
                        <th className="px-5 py-3.5">Quantity</th>
                        <th className="px-5 py-3.5">Statutory Fee</th>
                        <th className="px-5 py-3.5">Audit Status</th>
                        <th className="px-5 py-3.5">Submitted</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#edf1ea]">
                      {crsRequests.map((req) => (
                        <tr key={req.id} className="hover:bg-[#fbfcfb] transition">
                          <td className="px-5 py-4 font-bold text-[#10251d]">
                            {req.requestNumber}
                            {req.issuedCertificateReference && (
                              <span className="block text-[10px] text-emerald-700 font-mono">
                                Cert: {req.issuedCertificateReference}
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-4 font-semibold text-[#10251d]">
                            {req.consignmentCode}
                          </td>
                          <td className="px-5 py-4 text-[#57655d] max-w-xs truncate">
                            {req.sourceOriginSummary}
                          </td>
                          <td className="px-5 py-4 font-bold text-[#0b3528]">
                            {req.totalQuantityKg.toLocaleString()} kg
                          </td>
                          <td className="px-5 py-4">
                            <span className="font-semibold text-[#10251d]">
                              ₦{req.inspectionFeeNgn.toLocaleString()}
                            </span>
                            <span
                              className={`block text-[10px] uppercase font-bold ${
                                req.paymentStatus === "paid"
                                  ? "text-emerald-700"
                                  : "text-amber-700"
                              }`}
                            >
                              {req.paymentStatus}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <span
                              className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${
                                req.status === "approved"
                                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                  : req.status === "under_audit"
                                  ? "bg-blue-50 text-blue-800 border-blue-200"
                                  : req.status === "rejected"
                                  ? "bg-rose-50 text-rose-800 border-rose-200"
                                  : "bg-amber-50 text-amber-800 border-amber-200"
                              }`}
                            >
                              {req.status.replace("_", " ").toUpperCase()}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-[#57655d]">
                            {new Date(req.submittedAt).toLocaleDateString("en-GB", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: Facility Specs & Compliance */}
        {activeTab === "facility" && facility && (
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* Facility Details Box */}
              <div className="rounded-3xl border border-[#dfe7d8] bg-white p-6 shadow-sm">
                <h3 className="text-base font-bold text-[#10251d] mb-4 flex items-center gap-2">
                  <Building2 size={18} className="text-[#2d6130]" /> Facility Registry & Operating Terms
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-[#57655d] block uppercase font-bold text-[10px]">Facility Name</span>
                    <span className="font-bold text-[#10251d] text-sm">{facility.name}</span>
                  </div>

                  <div>
                    <span className="text-[#57655d] block uppercase font-bold text-[10px]">License Number</span>
                    <span className="font-bold text-[#10251d] text-sm">{facility.licenseNumber}</span>
                  </div>

                  <div>
                    <span className="text-[#57655d] block uppercase font-bold text-[10px]">Corporate Entity</span>
                    <span className="font-bold text-[#10251d]">{organization?.name}</span>
                  </div>

                  <div>
                    <span className="text-[#57655d] block uppercase font-bold text-[10px]">CAC Registration</span>
                    <span className="font-bold text-[#10251d]">{organization?.registrationNumber || "—"}</span>
                  </div>

                  <div>
                    <span className="text-[#57655d] block uppercase font-bold text-[10px]">Customs Bonded Code</span>
                    <span className="font-bold text-[#0b3528]">
                      {organization?.customsBondedWarehouseCode || "NCS-BOND-CR-0012"}
                    </span>
                  </div>

                  <div>
                    <span className="text-[#57655d] block uppercase font-bold text-[10px]">Operating Hours</span>
                    <span className="font-bold text-[#10251d]">{facility.location.operatingHours}</span>
                  </div>

                  <div className="sm:col-span-2">
                    <span className="text-[#57655d] block uppercase font-bold text-[10px]">Physical Address</span>
                    <span className="font-semibold text-[#10251d]">
                      {facility.location.address}, {facility.location.cityOrLGA}, {facility.location.stateOrRegion}
                    </span>
                  </div>

                  <div>
                    <span className="text-[#57655d] block uppercase font-bold text-[10px]">GPS Coordinates</span>
                    <span className="font-mono text-[#10251d]">
                      {facility.location.latitude.toFixed(4)}° N, {facility.location.longitude.toFixed(4)}° E
                    </span>
                  </div>

                  <div>
                    <span className="text-[#57655d] block uppercase font-bold text-[10px]">Facility Contact</span>
                    <span className="font-semibold text-[#10251d]">
                      {facility.contactEmail} • {facility.contactPhone}
                    </span>
                  </div>
                </div>
              </div>

              {/* Environmental & Quality Standards */}
              <div className="rounded-3xl border border-[#dfe7d8] bg-white p-6 shadow-sm">
                <h3 className="text-base font-bold text-[#10251d] mb-4 flex items-center gap-2">
                  <ShieldCheck size={18} className="text-[#2d6130]" /> Export Custody Quality Standards
                </h3>

                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 rounded-2xl bg-[#f8faf7] border border-[#e1ebd9]">
                    <CheckCircle2 size={18} className="text-emerald-600 mt-0.5 shrink-0" />
                    <div>
                      <h4 className="text-xs font-bold text-[#10251d]">Moisture Threshold Enforcement</h4>
                      <p className="text-[11px] text-[#57655d]">
                        Incoming cocoa is tested on digital probe hygrometers. Only lots with moisture content ≤ 7.5%
                        are admitted for standard warehouse storage without conditioning.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded-2xl bg-[#f8faf7] border border-[#e1ebd9]">
                    <CheckCircle2 size={18} className="text-emerald-600 mt-0.5 shrink-0" />
                    <div>
                      <h4 className="text-xs font-bold text-[#10251d]">Pallet Clearance & Stacking Compliance</h4>
                      <p className="text-[11px] text-[#57655d]">
                        Export jute bags are stacked on treated wooden or polymer pallets elevated at least 15cm from
                        concrete floors with a 50cm wall perimeter to prevent damp ingress.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded-2xl bg-[#f8faf7] border border-[#e1ebd9]">
                    <CheckCircle2 size={18} className="text-emerald-600 mt-0.5 shrink-0" />
                    <div>
                      <h4 className="text-xs font-bold text-[#10251d]">Fumigation & Pest Control</h4>
                      <p className="text-[11px] text-[#57655d]">
                        Compliant with Cross River State Agricultural Quarantine and Federal Produce Inspection Service
                        (FPIS) pest-free export certification.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Summary Sidebar */}
            <div className="space-y-6">
              <div className="rounded-3xl border border-[#dfe7d8] bg-[#0b3528] text-white p-6 shadow-sm">
                <h4 className="text-sm font-bold text-[#b8f58b] mb-2 uppercase tracking-wider">
                  Capacity Guardrails
                </h4>
                <p className="text-xs text-white/80 leading-relaxed mb-4">
                  The SLITE Trace platform automatically enforces warehouse storage limits. Any intake attempt
                  exceeding available capacity is rejected at the gate.
                </p>

                <div className="rounded-2xl bg-white/10 p-3.5 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-white/70">Occupancy:</span>
                    <span className="font-bold text-[#b8f58b]">{utilizationRate}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/70">Remaining Room:</span>
                    <span className="font-bold text-white">
                      {(facility.availableCapacityKg / 1000).toLocaleString(undefined, {
                        maximumFractionDigits: 1,
                      })}{" "}
                      MT
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/70">Bags Remaining:</span>
                    <span className="font-bold text-white">
                      {Math.floor(facility.availableCapacityKg / 64).toLocaleString()} bags
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 1: Consignment Intake Modal */}
        {showIntakeModal && facility && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="relative w-full max-w-xl rounded-3xl bg-white p-6 sm:p-8 shadow-2xl my-8">
              <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#edf7e8] text-[#2d6130]">
                    <Boxes size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-[#10251d]">Receive Consignment</h3>
                    <p className="text-xs text-[#57655d]">Record incoming cocoa lot into storage inventory</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowIntakeModal(false)}
                  className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              {intakeError && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 flex items-start gap-2">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>{intakeError}</span>
                </div>
              )}

              <form onSubmit={handleIntakeSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-[#57655d] mb-1">
                      Source Stakeholder *
                    </label>
                    <select
                      value={intakeSourceType}
                      onChange={(e) => setIntakeSourceType(e.target.value as WarehouseSourceType)}
                      className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-[#10251d] focus:border-[#2d6130] outline-none"
                    >
                      <option value="agent">Buying Agent (LBA)</option>
                      <option value="cooperative">Farmers Cooperative</option>
                      <option value="farmer">Direct Producer / Farmer</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-[#57655d] mb-1">
                      Source Entity Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={intakeSourceName}
                      onChange={(e) => setIntakeSourceName(e.target.value)}
                      placeholder="e.g. Ikom Agro-Logistics Ltd"
                      className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs text-[#10251d] focus:border-[#2d6130] outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-[#57655d] mb-1">
                      Consignment Code (Optional)
                    </label>
                    <input
                      type="text"
                      value={intakeCode}
                      onChange={(e) => setIntakeCode(e.target.value)}
                      placeholder="Leave blank for auto-code"
                      className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs text-[#10251d] focus:border-[#2d6130] outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-[#57655d] mb-1">
                      Cocoa Lot / Trace ID
                    </label>
                    <input
                      type="text"
                      value={intakeLotId}
                      onChange={(e) => setIntakeLotId(e.target.value)}
                      placeholder="e.g. LOT-CAM-2026-08"
                      className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs text-[#10251d] focus:border-[#2d6130] outline-none"
                    />
                  </div>
                </div>

                {/* Weight & Bags Calculation */}
                <div className="rounded-2xl bg-[#f8faf7] border border-[#e1ebd9] p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-[#2d6130] mb-1">
                        Consignment Weight (Kg) *
                      </label>
                      <input
                        type="number"
                        required
                        min={1}
                        max={facility.availableCapacityKg}
                        value={intakeQuantityKg}
                        onChange={(e) => setIntakeQuantityKg(Number(e.target.value))}
                        className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-[#10251d] focus:border-[#2d6130] outline-none"
                      />
                      <span className="text-[10px] text-[#57655d] mt-1 block">
                        Max available: {facility.availableCapacityKg.toLocaleString()} kg
                      </span>
                    </div>

                    <div className="rounded-xl bg-white border border-[#dfe7d8] p-3 text-center">
                      <span className="text-[10px] uppercase font-bold text-[#57655d] block">
                        Calculated Jute Bags (64kg)
                      </span>
                      <span className="text-base font-extrabold text-[#0b3528]">
                        {Math.ceil(intakeQuantityKg / 64)} bags
                      </span>
                      <span className="text-[10px] text-[#57655d] block mt-0.5">
                        ({(intakeQuantityKg / 1000).toFixed(2)} Metric Tonnes)
                      </span>
                    </div>
                  </div>
                </div>

                {/* Moisture & Grade */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-[#57655d] mb-1">
                      Quality Inspection Grade *
                    </label>
                    <select
                      value={intakeGrade}
                      onChange={(e) =>
                        setIntakeGrade(e.target.value as "Grade 1" | "Grade 2" | "Industrial")
                      }
                      className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-[#10251d] focus:border-[#2d6130] outline-none"
                    >
                      <option value="Grade 1">Grade 1 (Premium Export Grade)</option>
                      <option value="Grade 2">Grade 2 (Standard Commercial)</option>
                      <option value="Industrial">Industrial / Processing Grade</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-[#57655d] mb-1">
                      Moisture Content (%) *
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.1"
                        min={4}
                        max={20}
                        required
                        value={intakeMoisture}
                        onChange={(e) => setIntakeMoisture(Number(e.target.value))}
                        className={`w-full rounded-xl border px-3 py-2 text-xs font-bold outline-none ${
                          intakeMoisture <= 7.5
                            ? "border-emerald-300 bg-emerald-50/40 text-emerald-900"
                            : "border-amber-300 bg-amber-50/40 text-amber-900"
                        }`}
                      />
                    </div>
                    <span
                      className={`text-[10px] font-semibold mt-1 block ${
                        intakeMoisture <= 7.5 ? "text-emerald-700" : "text-amber-700"
                      }`}
                    >
                      {intakeMoisture <= 7.5
                        ? "✓ Complies with export standard (≤ 7.5%)"
                        : "⚠ Warning: > 7.5% requires conditioning before export"}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#57655d] mb-1">
                    Storage Bay & Inspection Notes
                  </label>
                  <textarea
                    rows={2}
                    value={intakeNotes}
                    onChange={(e) => setIntakeNotes(e.target.value)}
                    placeholder="e.g. Bay 4 - West Wing Pallet Stack. Fumigated burlap packaging verified."
                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs text-[#10251d] focus:border-[#2d6130] outline-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setShowIntakeModal(false)}
                    className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-bold text-[#57655d] hover:bg-gray-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingIntake}
                    className="rounded-xl bg-[#0b3528] px-6 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#134939] disabled:opacity-50 cursor-pointer"
                  >
                    {submittingIntake ? "Recording Intake..." : "Confirm & Admit Consignment"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 2: CRS Full Trace Certificate Request Modal */}
        {showCrsModal && facility && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="relative w-full max-w-xl rounded-3xl bg-white p-6 sm:p-8 shadow-2xl my-8">
              <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#edf7e8] text-[#2d6130]">
                    <ShieldCheck size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-[#10251d]">
                      Request Cross River State Full Trace Certificate
                    </h3>
                    <p className="text-xs text-[#57655d]">
                      Statutory government verification for export-bound cocoa lots
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowCrsModal(false)}
                  className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              {crsError && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 flex items-start gap-2">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>{crsError}</span>
                </div>
              )}

              <form onSubmit={handleCrsSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#57655d] mb-1">
                    Select or Enter Consignment Code *
                  </label>
                  {receipts.length > 0 ? (
                    <div className="space-y-1.5">
                      <select
                        value={crsConsignmentCode}
                        onChange={(e) => {
                          setCrsConsignmentCode(e.target.value);
                          const sel = receipts.find((r) => r.consignmentCode === e.target.value);
                          if (sel) {
                            setCrsQuantityKg(sel.quantityKg);
                          }
                        }}
                        className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-[#10251d] focus:border-[#2d6130] outline-none"
                      >
                        <option value="">-- Choose from received consignments --</option>
                        {receipts.map((r) => (
                          <option key={r.id} value={r.consignmentCode}>
                            {r.consignmentCode} ({r.sourceEntityName} - {r.quantityKg.toLocaleString()} kg)
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={crsConsignmentCode}
                        onChange={(e) => setCrsConsignmentCode(e.target.value)}
                        placeholder="Or enter custom consignment code"
                        className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs text-[#10251d] focus:border-[#2d6130] outline-none"
                      />
                    </div>
                  ) : (
                    <input
                      type="text"
                      required
                      value={crsConsignmentCode}
                      onChange={(e) => setCrsConsignmentCode(e.target.value)}
                      placeholder="e.g. CONSIGN-CAL-2026-0912"
                      className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs text-[#10251d] focus:border-[#2d6130] outline-none"
                    />
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-[#57655d] mb-1">
                      Consignment Weight (Kg) *
                    </label>
                    <input
                      type="number"
                      required
                      min={1}
                      value={crsQuantityKg}
                      onChange={(e) => setCrsQuantityKg(Number(e.target.value))}
                      className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs font-bold text-[#10251d] focus:border-[#2d6130] outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-[#57655d] mb-1">
                      Statutory Audit Fee
                    </label>
                    <div className="rounded-xl bg-[#f8faf7] border border-[#dfe7d8] px-3 py-2 text-xs font-bold text-[#0b3528]">
                      ₦25,000 NGN (Statutory Standard)
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#57655d] mb-1">
                    Trade Corridor / Origin Summary *
                  </label>
                  <input
                    type="text"
                    required
                    value={crsOriginSummary}
                    onChange={(e) => setCrsOriginSummary(e.target.value)}
                    placeholder="e.g. Cameroon Mamfe Corridor via Ikom Border Axis to Calabar Port"
                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs text-[#10251d] focus:border-[#2d6130] outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-[#57655d] mb-1">
                      Applicant Name
                    </label>
                    <input
                      type="text"
                      value={crsApplicantName}
                      onChange={(e) => setCrsApplicantName(e.target.value)}
                      placeholder={user?.displayName || "Facility Custodian"}
                      className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs text-[#10251d] focus:border-[#2d6130] outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-[#57655d] mb-1">
                      Applicant Contact Phone
                    </label>
                    <input
                      type="text"
                      value={crsApplicantPhone}
                      onChange={(e) => setCrsApplicantPhone(e.target.value)}
                      placeholder={facility.contactPhone}
                      className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs text-[#10251d] focus:border-[#2d6130] outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setShowCrsModal(false)}
                    className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-bold text-[#57655d] hover:bg-gray-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingCrs}
                    className="rounded-xl bg-[#0b3528] px-6 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#134939] disabled:opacity-50 cursor-pointer"
                  >
                    {submittingCrs ? "Submitting..." : "Submit for State Inspection"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
