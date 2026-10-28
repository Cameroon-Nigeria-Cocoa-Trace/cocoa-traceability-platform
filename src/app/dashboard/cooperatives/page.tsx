/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { DashboardWorkflowNav } from "@/components/DashboardWorkflowNav";
import { useFirebase, FarmRecord } from "@/context/FirebaseContext";
import {
  Store,
  ShieldCheck,
  Building2,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  X,
  ArrowRight,
  UserCheck,
  MapPin,
  Phone,
  Mail,
  Trash2,
  Edit3,
  Sliders,
  Check,
  Info,
  HelpCircle,
  ExternalLink,
  Layers,
  Sparkles,
} from "lucide-react";
import { FarmerCooperativeAssociation, CooperativeOrganization } from "@/types/cooperative";
import { collection, query, where, getDocs, doc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export const VERIFIED_CAMEROON_COOPERATIVES: CooperativeOrganization[] = [
  {
    id: "org_coop_mamfe_central",
    name: "Mamfe Central Farmers Multi-Purpose Cooperative Society",
    registrationNumber: "COOP-CMR-SW-2026-041",
    region: "Manyu Division, South-West Region, Cameroon",
    headquartersAddress: "Commercial Avenue, Mamfe Central",
    contactEmail: "info@mamfecentral-coop.cm",
    contactPhone: "+237 677 889 900",
    status: "active",
    createdBy: "system",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "org_coop_manyu_allied",
    name: "Manyu Allied Cocoa Farmers Cooperative",
    registrationNumber: "COOP-CMR-SW-2026-088",
    region: "Eyumojock / Manyu Basin, South-West Region, Cameroon",
    headquartersAddress: "Station Road, Eyumojock",
    contactEmail: "allied@manyu-cocoa.cm",
    contactPhone: "+237 675 221 445",
    status: "active",
    createdBy: "system",
    createdAt: "2026-01-10T00:00:00.000Z",
    updatedAt: "2026-01-10T00:00:00.000Z",
  },
  {
    id: "org_coop_kumba_union",
    name: "Kumba High-Grade Cocoa Union",
    registrationNumber: "COOP-CMR-SW-2025-112",
    region: "Meme Division, South-West Region, Cameroon",
    headquartersAddress: "Main Market Road, Kumba",
    contactEmail: "contact@kumbacocoa.cm",
    contactPhone: "+237 679 334 556",
    status: "active",
    createdBy: "system",
    createdAt: "2025-11-01T00:00:00.000Z",
    updatedAt: "2025-11-01T00:00:00.000Z",
  },
  {
    id: "org_coop_tiko_society",
    name: "Tiko Coastal Farmers Cooperative Society",
    registrationNumber: "COOP-CMR-SW-2025-055",
    region: "Fako Division, South-West Region, Cameroon",
    headquartersAddress: "Wharf Road, Tiko",
    contactEmail: "info@tikocoop.cm",
    contactPhone: "+237 671 445 667",
    status: "active",
    createdBy: "system",
    createdAt: "2025-08-15T00:00:00.000Z",
    updatedAt: "2025-08-15T00:00:00.000Z",
  },
  {
    id: "org_coop_cross_river",
    name: "Ekok Cross-Border Farmers Union",
    registrationNumber: "COOP-CMR-SW-2026-019",
    region: "Ekok Border Zone, South-West Region, Cameroon",
    headquartersAddress: "Customs Highway, Ekok",
    contactEmail: "union@ekok-farmers.cm",
    contactPhone: "+237 674 889 001",
    status: "active",
    createdBy: "system",
    createdAt: "2026-02-01T00:00:00.000Z",
    updatedAt: "2026-02-01T00:00:00.000Z",
  },
];

export default function FarmerCooperativeHubPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f7f8f3]" />}>
      <FarmerCooperativeHubContent />
    </Suspense>
  );
}

function FarmerCooperativeHubContent() {
  const { user, farms, userRole, isCooperative } = useFirebase();

  const [associations, setAssociations] = useState<FarmerCooperativeAssociation[]>([]);
  const [availableCooperatives, setAvailableCooperatives] = useState<CooperativeOrganization[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchDirectory, setSearchDirectory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modal State: Link / Edit Cooperative
  const [showModal, setShowModal] = useState(false);
  const [editingAssociationId, setEditingAssociationId] = useState<string | null>(null);
  const [selectedCoopId, setSelectedCoopId] = useState("");
  const [customCoopName, setCustomCoopName] = useState("");
  const [customCoopReg, setCustomCoopReg] = useState("");
  const [customCoopRegion, setCustomCoopRegion] = useState("South-West Region, Cameroon");
  const [customCoopPhone, setCustomCoopPhone] = useState("+237 670 000 000");
  const [customCoopEmail, setCustomCoopEmail] = useState("");

  // Scope: "all" | "single_farm"
  const [farmScope, setFarmScope] = useState<"all" | "single_farm" | "specific_farms">("all");
  const [selectedSingleFarmId, setSelectedSingleFarmId] = useState("");

  // Permissions
  const [manageEverything, setManageEverything] = useState(true);
  const [permFarms, setPermFarms] = useState(true);
  const [permProduction, setPermProduction] = useState(true);
  const [permCertificates, setPermCertificates] = useState(true);
  const [permTrades, setPermTrades] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [unlinkSubmittingId, setUnlinkSubmittingId] = useState<string | null>(null);

  // Farmer's own registered farms
  const myFarms = useMemo(() => {
    if (!user) return [];
    return farms.filter((f) => f.farmerId === user.uid);
  }, [farms, user]);

  // Load Associations for this Farmer
  const loadData = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch associations from Firestore
      const userAssocs: FarmerCooperativeAssociation[] = [];
      try {
        const q = query(collection(db, "farmerCooperativeAssociations"), where("farmerId", "==", user.uid));
        const snap = await getDocs(q);
        snap.forEach((d) => {
          userAssocs.push(d.data() as FarmerCooperativeAssociation);
        });
      } catch (fsErr) {
        console.warn("Firestore fetch notice:", fsErr);
      }

      // If empty in Firestore, query backend API
      if (userAssocs.length === 0) {
        try {
          const res = await fetch(`/api/cooperative/associations?farmerId=${user.uid}`);
          const json = await res.json();
          if (json.success && Array.isArray(json.associations)) {
            userAssocs.push(...json.associations);
          }
        } catch {
          // ignore
        }
      }

      setAssociations(userAssocs);

      // 2. Fetch all registered cooperatives for directory & dropdown
      const orgMap = new Map<string, CooperativeOrganization>();
      // VERIFIED_CAMEROON_COOPERATIVES.forEach((c) => orgMap.set(c.id, c));

      try {
        const snap = await getDocs(collection(db, "cooperative_organizations"));
        snap.forEach((d) => {
          const org = d.data() as CooperativeOrganization;
          orgMap.set(org.id, org);
        });
        const coopSnap = await getDocs(collection(db, "cooperatives"));
        coopSnap.forEach((d) => {
          const c = d.data();
          if (!orgMap.has(d.id)) {
            orgMap.set(d.id, {
              id: d.id,
              name: c.name || "Cooperative Society",
              registrationNumber: c.registrationNumber || "COOP-CMR",
              region: c.region || "South-West Region",
              headquartersAddress: c.headquartersAddress || "",
              contactEmail: c.contactEmail || "",
              contactPhone: c.contactPhone || "",
              status: c.status || "active",
              createdBy: c.createdBy || c.adminId || "user",
              createdAt: c.createdAt || new Date().toISOString(),
              updatedAt: c.updatedAt || new Date().toISOString(),
            });
          }
        });
      } catch {
        // Fallback
      }

      setAvailableCooperatives(Array.from(orgMap.values()));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Set default single farm if available
  useEffect(() => {
    if (myFarms.length > 0 && !selectedSingleFarmId) {
      setSelectedSingleFarmId(myFarms[0].id);
    }
  }, [myFarms, selectedSingleFarmId]);

  // Open Link Modal with pre-selection
  const handleOpenLinkModal = (preselectedCoopId?: string) => {
    setEditingAssociationId(null);
    setSelectedCoopId(preselectedCoopId || (availableCooperatives[0]?.id ?? "org_coop_mamfe_central"));
    setCustomCoopName("");
    setCustomCoopReg("");
    setFarmScope("all");
    setSelectedSingleFarmId(myFarms[0]?.id || "");
    setManageEverything(true);
    setPermFarms(true);
    setPermProduction(true);
    setPermCertificates(true);
    setPermTrades(true);
    setError(null);
    setShowModal(true);
  };

  // Open Edit Modal for existing association
  const handleOpenEditModal = (assoc: FarmerCooperativeAssociation) => {
    setEditingAssociationId(assoc.associationId);
    setSelectedCoopId(assoc.cooperativeOrgId);
    setFarmScope(assoc.farmScope || "all");
    setSelectedSingleFarmId(assoc.delegatedFarmIds?.[0] || myFarms[0]?.id || "");
    setManageEverything(Boolean(assoc.manageEverything));
    setPermFarms(Boolean(assoc.permissions?.farmsManagement ?? true));
    setPermProduction(Boolean(assoc.permissions?.productionInventory ?? true));
    setPermCertificates(Boolean(assoc.permissions?.certificatesManagement ?? true));
    setPermTrades(Boolean(assoc.permissions?.tradingManagement ?? true));
    setError(null);
    setShowModal(true);
  };

  // Save / Submit Association Link
  const handleSubmitAssociation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setError("Please sign in to link a cooperative.");
      return;
    }

    let coopName = "";
    let coopReg = "";
    let coopEmail = "";
    let coopPhone = "";
    let coopId = selectedCoopId;

    if (selectedCoopId === "custom") {
      if (!customCoopName.trim()) {
        setError("Please enter the custom cooperative society name.");
        return;
      }
      coopName = customCoopName.trim();
      coopReg = customCoopReg.trim() || `COOP-CMR-${Date.now().toString().slice(-4)}`;
      coopEmail = customCoopEmail.trim() || `contact@${coopName.toLowerCase().replace(/\s+/g, "")}.cm`;
      coopPhone = customCoopPhone.trim() || "+237 670 000 000";
      coopId = `org_coop_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    } else {
      const found = availableCooperatives.find((c) => c.id === selectedCoopId);
      if (!found) {
        setError("Please select a valid cooperative.");
        return;
      }
      coopName = found.name;
      coopReg = found.registrationNumber;
      coopEmail = found.contactEmail;
      coopPhone = found.contactPhone;
    }

    if (farmScope === "single_farm" && !selectedSingleFarmId) {
      setError("Please select the specific farm to delegate.");
      return;
    }

    const delegatedFarmsList =
      farmScope === "single_farm"
        ? myFarms.filter((f) => f.id === selectedSingleFarmId)
        : myFarms;

    const delegatedIds =
      farmScope === "single_farm"
        ? [selectedSingleFarmId]
        : myFarms.length > 0
        ? myFarms.map((f) => f.id)
        : ["ALL"];

    const delegatedNames =
      farmScope === "single_farm"
        ? [delegatedFarmsList[0]?.farmName || "Selected Farm"]
        : ["All Registered Farms"];

    const effectivePermissions = manageEverything
      ? {
          farmsManagement: true,
          productionInventory: true,
          certificatesManagement: true,
          tradingManagement: true,
        }
      : {
          farmsManagement: permFarms,
          productionInventory: permProduction,
          certificatesManagement: permCertificates,
          tradingManagement: permTrades,
        };

    const associationId = editingAssociationId || `assoc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const associationData: FarmerCooperativeAssociation = {
      associationId,
      farmerId: user.uid,
      farmerName: user.displayName || user.email || "Farmer",
      cooperativeOrgId: coopId,
      cooperativeOrgName: coopName,
      cooperativeEmail: coopEmail,
      cooperativePhone: coopPhone,
      farmScope,
      delegatedFarmIds: delegatedIds,
      delegatedFarmNames: delegatedNames,
      manageEverything,
      permissions: effectivePermissions,
      status: "active",
      associatedAt: now,
      updatedAt: now,
    };

    setSubmitting(true);
    setError(null);

    try {
      // 1. Direct write to Firestore
      const key = `${user.uid}_${coopId}`;
      await setDoc(doc(db, "farmerCooperativeAssociations", key), associationData);

      // Also create membership record for the cooperative
      const memKey = `${coopId}_${user.uid}`;
      await setDoc(
        doc(db, "cooperative_memberships", memKey),
        {
          id: `mem_${memKey}`,
          cooperativeOrgId: coopId,
          farmerId: user.uid,
          farmerName: user.displayName || user.email || "Farmer",
          status: "active",
          joinedAt: now,
          updatedAt: now,
          farmsCount: delegatedIds.length,
          villageOrCommunity: delegatedFarmsList[0]?.village || "South-West Region",
          notes: `Farmer linked via Cooperative Hub. Scope: ${farmScope}. Full management: ${manageEverything ? "Yes" : "Custom"}`,
        },
        { merge: true }
      );

      // 2. Call backend API route to sync
      await fetch("/api/cooperative/associations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "associate",
          ...associationData,
        }),
      });

      setSuccessMsg(
        editingAssociationId
          ? `Successfully updated delegation permissions for ${coopName}!`
          : `Successfully linked ${coopName} to your farm! The cooperative can now manage authorized operations on your behalf.`
      );

      setShowModal(false);
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  // Revoke / Unlink Cooperative
  const handleUnlink = async (assoc: FarmerCooperativeAssociation) => {
    if (!confirm(`Are you sure you want to unlink ${assoc.cooperativeOrgName}? The cooperative will lose permission to manage your farms.`)) {
      return;
    }

    setUnlinkSubmittingId(assoc.associationId);
    setError(null);

    try {
      const key = `${assoc.farmerId}_${assoc.cooperativeOrgId}`;
      // Delete from Firestore
      await deleteDoc(doc(db, "farmerCooperativeAssociations", key));

      // Update membership status in cooperative
      const memKey = `${assoc.cooperativeOrgId}_${assoc.farmerId}`;
      await setDoc(
        doc(db, "cooperative_memberships", memKey),
        {
          status: "withdrawn",
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      // Call API
      await fetch("/api/cooperative/associations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "unlink",
          farmerId: assoc.farmerId,
          cooperativeOrgId: assoc.cooperativeOrgId,
        }),
      });

      setSuccessMsg(`Unlinked ${assoc.cooperativeOrgName}. Management permissions have been revoked.`);
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUnlinkSubmittingId(null);
    }
  };

  // Filtered Directory
  const filteredCooperatives = useMemo(() => {
    if (!searchDirectory.trim()) return [];
    const q = searchDirectory.toLowerCase();
    return availableCooperatives.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.region.toLowerCase().includes(q) ||
        c.registrationNumber.toLowerCase().includes(q)
    );
  }, [availableCooperatives, searchDirectory]);

  return (
    <div className="min-h-screen bg-[#f7f8f3] text-[#10251d]">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 pt-24 pb-20 sm:px-6 lg:px-8">
        {/* Navigation / Workflow Header */}
        <DashboardWorkflowNav currentTab="farm-management" />

        {/* Cooperative Notice if logged in as cooperative */}
        {(isCooperative || userRole === "cooperative") && (
          <div className="mb-6 rounded-2xl border border-[#b8f58b]/40 bg-[#062d22] p-4 text-white flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Building2 className="text-[#b8f58b]" size={20} />
              <div>
                <p className="text-sm font-bold text-white">You are logged in as a Cooperative</p>
                <p className="text-xs text-white/70">
                  This page is the Farmer Cooperative Hub where farmers initiate and grant linkages to cooperatives.
                </p>
              </div>
            </div>
            <Link
              href="/dashboard/cooperative"
              className="rounded-xl bg-[#b8f58b] px-4 py-2 text-xs font-bold text-[#062d22] hover:bg-[#d0ffb0] transition"
            >
              Go to Cooperative Workspace →
            </Link>
          </div>
        )}

        {/* Top Banner / Hero */}
        <div className="mb-8 rounded-3xl border border-[#dfe7d8] bg-white p-6 sm:p-8 shadow-xs">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#edf7e8] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#2d6130] border border-[#d2ecc8]">
                  <ShieldCheck size={14} /> Farmer Hub • Cooperative Linkage
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-[#f0f4ee] px-2.5 py-0.5 text-[11px] font-semibold text-[#57655d]">
                  Farmer: {user?.displayName || user?.email || "Farmer"}
                </span>
              </div>
              <h1 className="mt-3 text-2xl font-black tracking-tight text-[#10251d] sm:text-3xl">
                Cooperative Hub
              </h1>
              <p className="mt-2 text-sm text-[#57655d] max-w-2xl leading-relaxed">
                Link authorized cocoa cooperatives to your farm plots. You control the scope: grant management permissions
                to <strong>either a single farm or all your registered farms</strong> with full authority to register harvests,
                manage lots, apply for Cameroon Origin Trace Certificates, and conclude sales on your behalf.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => handleOpenLinkModal()}
                className="inline-flex items-center gap-2 rounded-2xl bg-[#0b3528] px-5 py-3.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#144737] cursor-pointer"
              >
                <Plus size={16} /> Link a Cooperative to My Farm
              </button>
              <button
                type="button"
                onClick={loadData}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] px-4 py-3.5 text-xs font-bold text-[#57655d] transition hover:bg-white hover:text-[#10251d] cursor-pointer"
                title="Refresh cooperative linkages"
              >
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
              </button>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="mt-6 grid grid-cols-2 gap-4 border-t border-[#edf1ea] pt-5 sm:grid-cols-4">
            <div className="rounded-2xl bg-[#fbfcf9] p-3.5 border border-[#edf1ea]">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#57655d]">My Registered Farms</span>
              <p className="text-xl font-black text-[#10251d] mt-1">{myFarms.length} Plots</p>
            </div>
            <div className="rounded-2xl bg-[#fbfcf9] p-3.5 border border-[#edf1ea]">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#57655d]">Linked Cooperatives</span>
              <p className="text-xl font-black text-[#2d6130] mt-1">{associations.length} Active</p>
            </div>
            <div className="rounded-2xl bg-[#fbfcf9] p-3.5 border border-[#edf1ea]">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#57655d]">Delegation Mode</span>
              <p className="text-xs font-bold text-[#10251d] mt-2">
                {associations.some((a) => a.manageEverything) ? "Full Management" : "Selective Scope"}
              </p>
            </div>
            <div className="rounded-2xl bg-[#fbfcf9] p-3.5 border border-[#edf1ea]">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#57655d]">Cameroon Ministry Registry</span>
              <p className="text-xs font-bold text-[#2d6130] mt-2 flex items-center gap-1">
                <CheckCircle2 size={13} /> Verified Entities
              </p>
            </div>
          </div>
        </div>

        {/* Notifications / Alerts */}
        {error && (
          <div className="mb-6 rounded-2xl bg-red-50 p-4 text-xs text-red-800 flex items-center justify-between border border-red-200 shadow-xs">
            <div className="flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
            <button type="button" onClick={() => setError(null)} className="cursor-pointer text-red-600 hover:text-red-900">
              <X size={15} />
            </button>
          </div>
        )}

        {successMsg && (
          <div className="mb-6 rounded-2xl bg-green-50 p-4 text-xs text-green-800 flex items-center justify-between border border-green-200 shadow-xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="shrink-0" />
              <span>{successMsg}</span>
            </div>
            <button type="button" onClick={() => setSuccessMsg(null)} className="cursor-pointer text-green-600 hover:text-green-900">
              <X size={15} />
            </button>
          </div>
        )}

        {/* Section 1: Active Linked Cooperatives */}
        <section className="mb-12">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="text-[#2d6130]" size={20} />
              <h2 className="text-lg font-black text-[#10251d]">My Linked Cooperatives</h2>
              <span className="rounded-full bg-[#edf7e8] px-2.5 py-0.5 text-xs font-bold text-[#2d6130]">
                {associations.length}
              </span>
            </div>
            {associations.length > 0 && (
              <button
                type="button"
                onClick={() => handleOpenLinkModal()}
                className="text-xs font-bold text-[#2d6130] hover:text-[#0b3528] flex items-center gap-1 cursor-pointer"
              >
                <Plus size={14} /> Link Another Cooperative
              </button>
            )}
          </div>

          {associations.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[#dfe7d8] bg-white p-8 text-center sm:p-12">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#edf7e8] text-[#2d6130] mb-4">
                <Store size={28} />
              </div>
              <h3 className="text-base font-bold text-[#10251d]">No Cooperatives Linked Yet</h3>
              <p className="mt-1 text-xs text-[#57655d] max-w-md mx-auto">
                You haven&apos;t linked any cooperative society to your farms. When you link a cooperative, they can
                log harvest batches, create lots, and apply for Origin Trace certificates on your behalf.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => handleOpenLinkModal()}
                  className="inline-flex items-center gap-2 rounded-2xl bg-[#0b3528] px-6 py-3 text-xs font-bold text-white shadow-sm hover:bg-[#144737] cursor-pointer"
                >
                  <Plus size={15} /> Link Your First Cooperative
                </button>
              </div>
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {associations.map((assoc) => {
                const isSingleFarm = assoc.farmScope === "single_farm";
                const isUnlinking = unlinkSubmittingId === assoc.associationId;

                return (
                  <div
                    key={assoc.associationId}
                    className="flex flex-col justify-between rounded-3xl border border-[#dfe7d8] bg-white p-5 shadow-xs transition hover:border-[#2d6130] hover:shadow-md"
                  >
                    <div>
                      {/* Header */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#edf7e8] text-[#2d6130]">
                            <Store size={20} />
                          </div>
                          <div>
                            <h3 className="text-sm font-black text-[#10251d] line-clamp-1">
                              {assoc.cooperativeOrgName}
                            </h3>
                            <span className="text-[11px] font-mono text-[#57655d]">
                              ID: {assoc.cooperativeOrgId}
                            </span>
                          </div>
                        </div>

                        <span className="inline-flex items-center gap-1 rounded-full bg-[#edf7e8] px-2.5 py-0.5 text-[10px] font-bold text-[#2d6130] border border-[#d2ecc8]">
                          <CheckCircle2 size={11} /> Linked
                        </span>
                      </div>

                      {/* Contact Info */}
                      <div className="mt-4 space-y-1.5 text-xs text-[#57655d] border-t border-[#edf1ea] pt-3">
                        {assoc.cooperativePhone && (
                          <div className="flex items-center gap-2">
                            <Phone size={13} className="text-[#2d6130] shrink-0" />
                            <span>{assoc.cooperativePhone}</span>
                          </div>
                        )}
                        {assoc.cooperativeEmail && (
                          <div className="flex items-center gap-2">
                            <Mail size={13} className="text-[#2d6130] shrink-0" />
                            <span className="truncate">{assoc.cooperativeEmail}</span>
                          </div>
                        )}
                      </div>

                      {/* Delegation Scope & Permissions Box */}
                      <div className="mt-4 rounded-2xl bg-[#fafcf9] border border-[#edf1ea] p-3.5 space-y-2.5">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#57655d]">
                            Delegated Farm Scope
                          </span>
                          <div className="mt-1 flex items-center gap-1.5">
                            <span
                              className={`rounded-lg px-2.5 py-1 text-xs font-bold ${
                                isSingleFarm
                                  ? "bg-amber-50 text-amber-900 border border-amber-200"
                                  : "bg-[#edf7e8] text-[#2d6130] border border-[#d2ecc8]"
                              }`}
                            >
                              {isSingleFarm ? "Single Farm" : "All Farms"}
                            </span>
                            <span className="text-xs font-semibold text-[#10251d] truncate">
                              {isSingleFarm
                                ? assoc.delegatedFarmNames?.[0] || assoc.delegatedFarmIds?.[0] || "1 Farm"
                                : "Full Farm Portfolio"}
                            </span>
                          </div>
                        </div>

                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#57655d]">
                            Management Permission
                          </span>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {assoc.manageEverything ? (
                              <span className="rounded-md bg-[#edf7e8] px-2 py-0.5 text-[11px] font-bold text-[#2d6130] flex items-center gap-1 border border-[#d2ecc8]">
                                <Sparkles size={11} /> Manage Everything of Farm
                              </span>
                            ) : (
                              <>
                                {assoc.permissions?.farmsManagement && (
                                  <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-700">
                                    Farms
                                  </span>
                                )}
                                {assoc.permissions?.productionInventory && (
                                  <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-700">
                                    Harvests
                                  </span>
                                )}
                                {assoc.permissions?.certificatesManagement && (
                                  <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-700">
                                    Certificates
                                  </span>
                                )}
                                {assoc.permissions?.tradingManagement && (
                                  <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-700">
                                    Trades
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </div>

                        <div className="text-[10px] text-[#57655d] pt-1">
                          Linked on {new Date(assoc.associatedAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="mt-5 flex items-center justify-between border-t border-[#edf1ea] pt-3 text-xs">
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(assoc)}
                        className="inline-flex items-center gap-1 font-bold text-[#2d6130] hover:text-[#0b3528] cursor-pointer"
                      >
                        <Edit3 size={13} /> Edit Scope
                      </button>

                      <button
                        type="button"
                        onClick={() => handleUnlink(assoc)}
                        disabled={isUnlinking}
                        className="inline-flex items-center gap-1 font-semibold text-red-600 hover:text-red-800 disabled:opacity-50 cursor-pointer"
                      >
                        <Trash2 size={13} /> {isUnlinking ? "Unlinking..." : "Unlink"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Section 2: Directory of Available Registered Cooperatives in Cameroon */}
        <section>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-black text-[#10251d] flex items-center gap-2">
                <Building2 className="text-[#2d6130]" size={20} />
                Directory of Registered Cooperatives
              </h2>
              <p className="text-xs text-[#57655d] mt-0.5">
                Select a verified Cameroon cocoa cooperative to link to your farm plot.
              </p>
            </div>

            <div className="relative max-w-xs w-full">
              <Search size={15} className="absolute left-3 top-3 text-[#57655d]" />
              <input
                type="text"
                placeholder="Search cooperative by name or region..."
                value={searchDirectory}
                onChange={(e) => setSearchDirectory(e.target.value)}
                className="w-full rounded-xl border border-[#dfe7d8] bg-white py-2 pl-9 pr-3 text-xs outline-none focus:border-[#2d6130]"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredCooperatives.map((coop) => {
              const isAlreadyLinked = associations.some((a) => a.cooperativeOrgId === coop.id);

              return (
                <div
                  key={coop.id}
                  className="rounded-2xl border border-[#dfe7d8] bg-white p-4 shadow-xs transition hover:border-[#2d6130] flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#edf7e8] text-[#2d6130]">
                        <Store size={18} />
                      </div>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-700">
                        {coop.registrationNumber}
                      </span>
                    </div>

                    <h3 className="mt-3 text-xs font-bold text-[#10251d] line-clamp-1">
                      {coop.name}
                    </h3>

                    <p className="mt-1 text-[11px] text-[#57655d] flex items-center gap-1 line-clamp-1">
                      <MapPin size={12} className="text-[#2d6130] shrink-0" />
                      {coop.region}
                    </p>

                    <div className="mt-2 text-[11px] text-[#57655d] space-y-0.5">
                      <div className="truncate">📞 {coop.contactPhone || "Ministry Registry"}</div>
                      <div className="truncate">✉️ {coop.contactEmail || "N/A"}</div>
                    </div>
                  </div>

                  <div className="mt-4 border-t border-[#edf1ea] pt-3 flex items-center justify-between">
                    {isAlreadyLinked ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-[#2d6130]">
                        <CheckCircle2 size={13} /> Linked to My Farm
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleOpenLinkModal(coop.id)}
                        className="inline-flex items-center gap-1 rounded-xl bg-[#edf7e8] px-3.5 py-2 text-xs font-bold text-[#2d6130] hover:bg-[#2d6130] hover:text-white transition cursor-pointer"
                      >
                        <Plus size={13} /> Link to My Farm
                      </button>
                    )}

                    <span className="text-[10px] text-slate-400 font-mono">
                      {coop.id.slice(0, 14)}...
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Modal: Link / Edit Cooperative Association */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
            <div className="relative max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-6 sm:p-8 shadow-2xl">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="absolute right-5 top-5 rounded-full p-2 text-[#57655d] hover:bg-[#f7f8f3] cursor-pointer"
              >
                <X size={18} />
              </button>

              <div className="flex items-center gap-2 mb-2">
                <Store size={20} className="text-[#2d6130]" />
                <h2 className="text-xl font-bold text-[#10251d]">
                  {editingAssociationId ? "Edit Cooperative Delegation" : "Link a Cooperative to My Farm"}
                </h2>
              </div>
              <p className="text-xs text-[#57655d] mb-6">
                Grant authority to an official cooperative society to manage operations, harvests, certificates, and trades.
              </p>

              <form onSubmit={handleSubmitAssociation} className="space-y-6 text-xs">
                {/* Step 1: Cooperative Selection */}
                <div>
                  <label className="block font-bold text-[#10251d] mb-1.5">
                    1. Select Cooperative Society <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={selectedCoopId}
                    onChange={(e) => setSelectedCoopId(e.target.value)}
                    disabled={Boolean(editingAssociationId)}
                    className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] p-3 text-xs font-semibold outline-none focus:border-[#2d6130]"
                  >
                    {availableCooperatives.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.registrationNumber}) — {c.region}
                      </option>
                    ))}
                    <option value="custom">+ Other / Independent Village Cooperative...</option>
                  </select>

                  {selectedCoopId === "custom" && (
                    <div className="mt-3 p-3.5 rounded-xl border border-[#dfe7d8] bg-[#fafcf9] space-y-3">
                      <div>
                        <label className="block font-semibold text-[#10251d] mb-1">Cooperative Name *</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Tombel Cocoa Farmers Cooperative"
                          value={customCoopName}
                          onChange={(e) => setCustomCoopName(e.target.value)}
                          className="w-full rounded-xl border border-[#dfe7d8] bg-white p-2.5 text-xs outline-none focus:border-[#2d6130]"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block font-semibold text-[#10251d] mb-1">Registration #</label>
                          <input
                            type="text"
                            placeholder="COOP-CMR-..."
                            value={customCoopReg}
                            onChange={(e) => setCustomCoopReg(e.target.value)}
                            className="w-full rounded-xl border border-[#dfe7d8] bg-white p-2.5 text-xs outline-none focus:border-[#2d6130]"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-[#10251d] mb-1">Contact Phone</label>
                          <input
                            type="text"
                            placeholder="+237 670..."
                            value={customCoopPhone}
                            onChange={(e) => setCustomCoopPhone(e.target.value)}
                            className="w-full rounded-xl border border-[#dfe7d8] bg-white p-2.5 text-xs outline-none focus:border-[#2d6130]"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Step 2: Farm Scope (Single Farm vs All Farms) */}
                <div className="rounded-2xl border border-[#edf1ea] bg-[#fafcf9] p-4 space-y-3">
                  <label className="block font-bold text-[#10251d]">
                    2. Select Delegated Farm Scope <span className="text-red-500">*</span>
                  </label>
                  <p className="text-[11px] text-[#57655d]">
                    Choose whether this cooperative has permission to manage all of your registered plots, or strictly one single farm.
                  </p>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setFarmScope("all")}
                      className={`flex flex-col items-start p-3 rounded-xl border transition cursor-pointer text-left ${
                        farmScope === "all"
                          ? "border-[#2d6130] bg-[#edf7e8] ring-2 ring-[#2d6130]"
                          : "border-[#dfe7d8] bg-white hover:border-gray-400"
                      }`}
                    >
                      <span className="font-bold text-[#10251d]">All My Farms</span>
                      <span className="text-[11px] text-[#57655d] mt-1">
                        Grants access across all current and future plots ({myFarms.length} registered).
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setFarmScope("single_farm")}
                      className={`flex flex-col items-start p-3 rounded-xl border transition cursor-pointer text-left ${
                        farmScope === "single_farm"
                          ? "border-[#2d6130] bg-[#edf7e8] ring-2 ring-[#2d6130]"
                          : "border-[#dfe7d8] bg-white hover:border-gray-400"
                      }`}
                    >
                      <span className="font-bold text-[#10251d]">Single Farm</span>
                      <span className="text-[11px] text-[#57655d] mt-1">
                        Restricts cooperative authority to one specific designated farm plot.
                      </span>
                    </button>
                  </div>

                  {farmScope === "single_farm" && (
                    <div className="pt-2">
                      <label className="block font-semibold text-[#10251d] mb-1">
                        Select Designated Single Farm Plot <span className="text-red-500">*</span>
                      </label>
                      {myFarms.length === 0 ? (
                        <div className="rounded-xl bg-amber-50 p-2.5 text-xs text-amber-800 border border-amber-200">
                          You have no registered farms yet. You can register a plot in Farm Overview first.
                        </div>
                      ) : (
                        <select
                          value={selectedSingleFarmId}
                          onChange={(e) => setSelectedSingleFarmId(e.target.value)}
                          className="w-full rounded-xl border border-[#dfe7d8] bg-white p-2.5 text-xs font-semibold outline-none focus:border-[#2d6130]"
                        >
                          {myFarms.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.farmName} ({f.geofenceAreaHa ?? f.sizeHectares ?? "N/A"} ha) — {f.village || f.region} [{f.id}]
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                </div>

                {/* Step 3: Permissions & Authority */}
                <div className="rounded-2xl border border-[#edf1ea] bg-[#fafcf9] p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-[#10251d]">
                      3. Operational Authority &amp; Permissions
                    </label>
                    <span className="text-[10px] font-bold text-[#2d6130] bg-[#edf7e8] px-2 py-0.5 rounded-full">
                      Recommended
                    </span>
                  </div>

                  {/* Main Master Switch: Manage Everything of that farm */}
                  <label className="flex items-start gap-3 p-3 rounded-xl bg-white border border-[#dfe7d8] cursor-pointer hover:border-[#2d6130] transition">
                    <input
                      type="checkbox"
                      checked={manageEverything}
                      onChange={(e) => setManageEverything(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded text-[#2d6130] focus:ring-[#2d6130]"
                    />
                    <div>
                      <span className="font-bold text-[#10251d] block">
                        Permission to manage everything of this farm
                      </span>
                      <p className="text-[11px] text-[#57655d] mt-0.5 leading-relaxed">
                        Grants the cooperative full authority to log harvests, manage lots, apply for Origin Trace Certificates,
                        and conclude commercial trades on your behalf.
                      </p>
                    </div>
                  </label>

                  {/* Granular Toggles if user unchecks Manage Everything */}
                  {!manageEverything && (
                    <div className="space-y-2 pt-2 border-t border-[#edf1ea]">
                      <span className="text-[11px] font-bold text-[#10251d] block">Granular Permissions:</span>
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={permFarms}
                          onChange={(e) => setPermFarms(e.target.checked)}
                          className="h-4 w-4 rounded text-[#2d6130]"
                        />
                        <span>Farms Management (Plot inspection and updates)</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={permProduction}
                          onChange={(e) => setPermProduction(e.target.checked)}
                          className="h-4 w-4 rounded text-[#2d6130]"
                        />
                        <span>Production &amp; Harvest Logging</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={permCertificates}
                          onChange={(e) => setPermCertificates(e.target.checked)}
                          className="h-4 w-4 rounded text-[#2d6130]"
                        />
                        <span>Origin Trace Certificate Applications</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={permTrades}
                          onChange={(e) => setPermTrades(e.target.checked)}
                          className="h-4 w-4 rounded text-[#2d6130]"
                        />
                        <span>Commercial Cocoa Trades</span>
                      </label>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#edf1ea]">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="rounded-full px-5 py-2.5 font-bold text-[#57655d] hover:bg-[#f7f8f3] cursor-pointer"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center gap-2 rounded-full bg-[#0b3528] px-6 py-2.5 font-bold text-white shadow-sm hover:bg-[#144737] disabled:opacity-50 cursor-pointer"
                  >
                    {submitting ? "Establishing Link..." : editingAssociationId ? "Save Changes" : "Confirm & Link Cooperative"}
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
