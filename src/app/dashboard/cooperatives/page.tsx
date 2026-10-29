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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modal State: Link / Edit Cooperative
  const [showModal, setShowModal] = useState(false);
  const [editingAssociationId, setEditingAssociationId] = useState<string | null>(null);

  // Search Cooperatives State (Search by Email or Phone)
  const [searchQueryInput, setSearchQueryInput] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<CooperativeOrganization[]>([]);
  const [selectedCoop, setSelectedCoop] = useState<CooperativeOrganization | null>(null);
  const [selectedCoopId, setSelectedCoopId] = useState("");

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
      const dedupMap = new Map<string, FarmerCooperativeAssociation>();
      const duplicateDocIdsToDelete: string[] = [];

      try {
        const q = query(collection(db, "farmerCooperativeAssociations"), where("farmerId", "==", user.uid));
        const snap = await getDocs(q);
        snap.forEach((d) => {
          const data = d.data() as FarmerCooperativeAssociation;
          if (data.status === "withdrawn" || data.status === "inactive") return;
          const dedupKey = data.cooperativeOrgId || data.cooperativeOrgName;
          if (!dedupMap.has(dedupKey)) {
            dedupMap.set(dedupKey, data);
          } else {
            // Found a duplicate document for this cooperative! Schedule cleanup
            duplicateDocIdsToDelete.push(d.id);
          }
        });

        // Clean up any duplicate documents in Firestore
        if (duplicateDocIdsToDelete.length > 0) {
          for (const docId of duplicateDocIdsToDelete) {
            deleteDoc(doc(db, "farmerCooperativeAssociations", docId)).catch(() => {});
          }
        }
      } catch (fsErr) {
        console.warn("Firestore fetch notice:", fsErr);
      }

      // If empty in Firestore, query backend API
      if (dedupMap.size === 0) {
        try {
          const res = await fetch(`/api/cooperative/associations?farmerId=${user.uid}`);
          const json = await res.json();
          if (json.success && Array.isArray(json.associations)) {
            for (const a of json.associations) {
              if (a.status === "withdrawn" || a.status === "inactive") continue;
              const dedupKey = a.cooperativeOrgId || a.cooperativeOrgName;
              if (!dedupMap.has(dedupKey)) {
                dedupMap.set(dedupKey, a);
              }
            }
          }
        } catch {
          // ignore
        }
      }

      setAssociations(Array.from(dedupMap.values()));
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

  // Open Link Modal (Fresh search required)
  const handleOpenLinkModal = () => {
    setEditingAssociationId(null);
    setSelectedCoop(null);
    setSelectedCoopId("");
    setSearchQueryInput("");
    setSearchResults([]);
    setSearchPerformed(false);
    setSearchError(null);
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
    setSelectedCoop({
      id: assoc.cooperativeOrgId,
      name: assoc.cooperativeOrgName,
      registrationNumber: "COOP-CMR",
      region: "South-West Region, Cameroon",
      headquartersAddress: "",
      contactEmail: assoc.cooperativeEmail,
      contactPhone: assoc.cooperativePhone,
      status: "active",
      createdAt: assoc.associatedAt,
      updatedAt: assoc.updatedAt,
      createdBy: "",
    });
    setSearchQueryInput("");
    setSearchResults([]);
    setSearchPerformed(false);
    setSearchError(null);
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

  // Search Registered Cooperatives by Name, Email, or Phone Number
  const handleSearchCooperatives = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const queryTerm = searchQueryInput.trim();
    if (!queryTerm) {
      setSearchError("Please enter the cooperative or farm group name, email, or phone number.");
      return;
    }
    setIsSearching(true);
    setSearchError(null);
    setSearchPerformed(true);
    try {
      const qLower = queryTerm.toLowerCase();
      const qDigits = queryTerm.replace(/\D/g, "");
      const map = new Map<string, CooperativeOrganization>();

      // 1. Query Server API
      try {
        const res = await fetch(`/api/cooperative/associations?searchQuery=${encodeURIComponent(queryTerm)}`);
        const json = await res.json();
        if (json.success && Array.isArray(json.organizations)) {
          json.organizations.forEach((org: CooperativeOrganization) => {
            map.set(org.id, org);
          });
        }
      } catch (apiErr) {
        console.warn("API search notice:", apiErr);
      }

      // 2. Query client-side Firestore for instant lookup and fallback
      try {
        // Search cooperative_organizations
        const orgSnap = await getDocs(collection(db, "cooperative_organizations"));
        orgSnap.forEach((d) => {
          const org = { ...d.data(), id: d.id } as any;
          const orgName = (org.name || org.cooperativeOrgName || "").toLowerCase();
          const repName = (org.representativeName || org.fullName || org.displayName || "").toLowerCase();
          const email = (org.contactEmail || org.email || "").toLowerCase();
          const phoneStr = (org.contactPhone || org.phone || "").toString();
          const regStr = (org.registrationNumber || "").toLowerCase();

          const nameMatch = orgName.includes(qLower);
          const repMatch = repName.includes(qLower);
          const emailMatch = email.includes(qLower);
          const phoneMatch = phoneStr.toLowerCase().includes(qLower);
          const digitsMatch = qDigits.length >= 5 && phoneStr.replace(/\D/g, "").includes(qDigits);
          const regMatch = regStr.includes(qLower);

          if (nameMatch || repMatch || emailMatch || phoneMatch || digitsMatch || regMatch) {
            map.set(d.id, org);
          }
        });

        // Search cooperatives collection
        const coopSnap = await getDocs(collection(db, "cooperatives"));
        coopSnap.forEach((d) => {
          const c = { ...d.data(), id: d.id } as any;
          const cName = (c.name || "").toLowerCase();
          const repName = (c.representativeName || "").toLowerCase();
          const email = (c.contactEmail || "").toLowerCase();
          const phoneStr = (c.contactPhone || "").toString();
          const regStr = (c.registrationNumber || "").toLowerCase();

          const nameMatch = cName.includes(qLower);
          const repMatch = repName.includes(qLower);
          const emailMatch = email.includes(qLower);
          const phoneMatch = phoneStr.toLowerCase().includes(qLower);
          const digitsMatch = qDigits.length >= 5 && phoneStr.replace(/\D/g, "").includes(qDigits);
          const regMatch = regStr.includes(qLower);

          if (nameMatch || repMatch || emailMatch || phoneMatch || digitsMatch || regMatch) {
            if (!map.has(d.id)) {
              map.set(d.id, {
                id: d.id,
                name: c.name || "Cooperative Society",
                registrationNumber: c.registrationNumber || "COOP-CMR",
                region: c.region || "South-West Region, Cameroon",
                headquartersAddress: c.headquartersAddress || "",
                contactEmail: c.contactEmail || "",
                contactPhone: c.contactPhone || "",
                accountType: c.accountType === "personal" ? "farm_group" : (c.accountType || "organizational"),
                status: c.status || "active",
                representativeName: c.representativeName || "",
                createdAt: c.createdAt || new Date().toISOString(),
                updatedAt: c.updatedAt || new Date().toISOString(),
                createdBy: c.createdBy || "",
              });
            }
          }
        });

        // Search users with role == 'cooperative'
        const usersSnap = await getDocs(query(collection(db, "users"), where("role", "==", "cooperative")));
        usersSnap.forEach((d) => {
          const u = d.data() as any;
          const orgName = (u.cooperativeOrgName || (u.displayName ? `${u.displayName}'s Farm Group` : "")).toLowerCase();
          const repName = (u.displayName || "").toLowerCase();
          const email = (u.email || "").toLowerCase();
          const phoneStr = (u.phone || "").toString();
          const regStr = (u.registrationNumber || "").toLowerCase();

          const nameMatch = orgName.includes(qLower);
          const repMatch = repName.includes(qLower);
          const emailMatch = email.includes(qLower);
          const phoneMatch = phoneStr.toLowerCase().includes(qLower);
          const digitsMatch = qDigits.length >= 5 && phoneStr.replace(/\D/g, "").includes(qDigits);
          const regMatch = regStr.includes(qLower);

          if (nameMatch || repMatch || emailMatch || phoneMatch || digitsMatch || regMatch) {
            const orgId = u.cooperativeOrgId || `org_coop_${d.id}`;
            if (!map.has(orgId)) {
              map.set(orgId, {
                id: orgId,
                name: u.cooperativeOrgName || (u.displayName ? `${u.displayName}'s Farm Group` : "Cooperative Society"),
                registrationNumber: u.registrationNumber || "COOP-CMR-MEMBER",
                region: u.region || "South-West Region, Cameroon",
                headquartersAddress: u.headquartersAddress || "",
                contactEmail: u.email || "",
                contactPhone: u.phone || "",
                accountType: u.accountType === "personal" ? "farm_group" : (u.accountType || "organizational"),
                status: "active",
                representativeName: u.displayName || "",
                userId: d.id,
                createdAt: u.createdAt || new Date().toISOString(),
                updatedAt: u.updatedAt || new Date().toISOString(),
                createdBy: d.id,
              } as any);
            }
          }
        });
      } catch (fsSearchErr) {
        console.warn("Client Firestore search notice:", fsSearchErr);
      }

      const orgs = Array.from(map.values());
      setSearchResults(orgs);
      if (orgs.length === 1) {
        // Auto-select if single match
        setSelectedCoop(orgs[0]);
        setSelectedCoopId(orgs[0].id);
      } else if (orgs.length === 0) {
        setSelectedCoop(null);
        setSelectedCoopId("");
      }
    } catch (err: unknown) {
      setSearchError(err instanceof Error ? err.message : "Failed to search cooperatives.");
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Save / Submit Association Link
  const handleSubmitAssociation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setError("Please sign in to link a cooperative.");
      return;
    }

    if (!selectedCoop) {
      setError("Please search and select a registered cooperative or farm group first.");
      return;
    }

    const coopName = selectedCoop.name;
    const coopEmail = selectedCoop.contactEmail || "";
    const coopPhone = selectedCoop.contactPhone || "";
    const coopId = selectedCoop.id;
    const coopUserId = (selectedCoop as any).userId || undefined;

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

    const associationData: FarmerCooperativeAssociation & { cooperativeUserId?: string } = {
      associationId,
      farmerId: user.uid,
      farmerName: user.displayName || user.email || "Farmer",
      cooperativeOrgId: coopId,
      cooperativeUserId: coopUserId,
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
      // 1. Direct write to Firestore (single authoritative association document)
      const key = `${user.uid}_${coopId}`;
      await setDoc(doc(db, "farmerCooperativeAssociations", key), associationData);
      if (coopUserId && coopUserId !== coopId) {
        await deleteDoc(doc(db, "farmerCooperativeAssociations", `${user.uid}_${coopUserId}`)).catch(() => {});
      }

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
          notes: `Farmer linked via Cooperative Hub search. Scope: ${farmScope}. Full management: ${manageEverything ? "Yes" : "Custom"}`,
        },
        { merge: true }
      );

      // Explicitly update delegated farm plots in Firestore
      if (farmScope === "single_farm" && selectedSingleFarmId) {
        await setDoc(
          doc(db, "farms", selectedSingleFarmId),
          {
            cooperative: coopName,
            cooperativeOrgId: coopId,
            cooperativeEmail: coopEmail,
            cooperativePhone: coopPhone,
            cooperativeDelegated: true,
            delegatedAt: now,
            updatedAt: now,
          },
          { merge: true }
        );
      } else if (farmScope === "all") {
        for (const farm of myFarms) {
          await setDoc(
            doc(db, "farms", farm.id),
            {
              cooperative: coopName,
              cooperativeOrgId: coopId,
              cooperativeEmail: coopEmail,
              cooperativePhone: coopPhone,
              cooperativeDelegated: true,
              delegatedAt: now,
              updatedAt: now,
            },
            { merge: true }
          );
        }
      }

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
          : `Successfully linked ${coopName} to your farm! The cooperative account now has permission to access and manage your farm.`
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
      await deleteDoc(doc(db, "farmerCooperativeAssociations", key)).catch(() => {});
      if ((assoc as any).cooperativeUserId) {
        await deleteDoc(doc(db, "farmerCooperativeAssociations", `${assoc.farmerId}_${(assoc as any).cooperativeUserId}`)).catch(() => {});
      }

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
          cooperativeUserId: (assoc as any).cooperativeUserId,
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
              <p className="text-xs text-[#57655d] mb-6 leading-relaxed">
                Search for an authorized cooperative society or farm group registered on TraceTrade Network by their name, email, or phone number to grant farm management permissions.
              </p>

              <form onSubmit={handleSubmitAssociation} className="space-y-6 text-xs">
                {/* Step 1: Cooperative Search & Selection */}
                <div>
                  <label className="block font-bold text-[#10251d] mb-1.5">
                    1. Search Cooperative or Farm Group by Name, Email, or Phone <span className="text-red-500">*</span>
                  </label>

                  {editingAssociationId && selectedCoop ? (
                    <div className="rounded-2xl border border-[#2d6130] bg-[#edf7e8] p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="inline-block rounded-md bg-[#2d6130] px-2 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider mb-1">
                            Linked Cooperative
                          </span>
                          <h4 className="font-bold text-sm text-[#10251d]">{selectedCoop.name}</h4>
                          <p className="text-xs text-[#57655d] mt-0.5">
                            📞 {selectedCoop.contactPhone || "No phone"} • ✉️ {selectedCoop.contactEmail || "No email"}
                          </p>
                        </div>
                        <span className="font-mono text-[10px] text-gray-500">{selectedCoop.registrationNumber}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Search size={15} className="absolute left-3.5 top-3.5 text-[#57655d]" />
                          <input
                            type="text"
                            placeholder="Enter cooperative/farm group name, email, or phone (e.g. Manyu, info@coop.cm, +237...)"
                            value={searchQueryInput}
                            onChange={(e) => setSearchQueryInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleSearchCooperatives();
                              }
                            }}
                            className="w-full rounded-xl border border-[#dfe7d8] bg-white py-2.5 pl-10 pr-3 text-xs outline-none focus:border-[#2d6130]"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSearchCooperatives()}
                          disabled={isSearching || !searchQueryInput.trim()}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-[#0b3528] px-4 py-2.5 font-bold text-white hover:bg-[#144737] disabled:opacity-50 cursor-pointer"
                        >
                          {isSearching ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
                          Search
                        </button>
                      </div>

                      {searchError && (
                        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-[11px] text-red-800 flex items-center gap-2">
                          <AlertCircle size={14} className="shrink-0 text-red-600" />
                          <span>{searchError}</span>
                        </div>
                      )}

                      {/* Search Results Display */}
                      {searchPerformed && !isSearching && searchResults.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-[#dfe7d8] bg-[#fafcf9] p-4 text-center">
                          <p className="font-semibold text-[#10251d]">No Registered Cooperative Found</p>
                          <p className="text-[11px] text-[#57655d] mt-1">
                            No cooperative or farm group on TraceTrade Network matched &ldquo;{searchQueryInput}&rdquo;. Please verify the name, email, or phone number with your cooperative society.
                          </p>
                        </div>
                      )}

                      {searchResults.length > 0 && (
                        <div className="space-y-2 pt-1">
                          <span className="text-[11px] font-bold text-[#57655d]">Matching Registered Cooperatives ({searchResults.length}):</span>
                          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                            {searchResults.map((coop) => {
                              const isSelected = selectedCoop?.id === coop.id;
                              return (
                                <div
                                  key={coop.id}
                                  onClick={() => {
                                    setSelectedCoop(coop);
                                    setSelectedCoopId(coop.id);
                                  }}
                                  className={`p-3 rounded-2xl border transition cursor-pointer flex items-start justify-between gap-3 ${
                                    isSelected
                                      ? "border-[#2d6130] bg-[#edf7e8] ring-2 ring-[#2d6130]"
                                      : "border-[#dfe7d8] bg-white hover:border-[#2d6130]"
                                  }`}
                                >
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <h4 className="font-bold text-xs text-[#10251d]">{coop.name}</h4>
                                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-700">
                                        {(coop as any).accountType === "farm_group" ? "Farm Group" : coop.registrationNumber}
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-[#57655d] mt-1 flex flex-wrap items-center gap-2">
                                      <span>📞 {coop.contactPhone || "Ministry Registry"}</span>
                                      <span>✉️ {coop.contactEmail || "Registered Account"}</span>
                                    </p>
                                    <p className="text-[10px] text-[#2d6130] mt-0.5">
                                      📍 {coop.region}
                                    </p>
                                  </div>
                                  <div className="shrink-0 pt-0.5">
                                    {isSelected ? (
                                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#2d6130] bg-white px-2.5 py-1 rounded-full border border-[#2d6130]">
                                        <Check size={12} /> Selected
                                      </span>
                                    ) : (
                                      <button
                                        type="button"
                                        className="text-[11px] font-semibold text-[#0b3528] hover:underline"
                                      >
                                        Select
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
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
                        Grants the cooperative account full authority to log harvests, manage lots, apply for Origin Trace Certificates,
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
                    disabled={submitting || !selectedCoop}
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
