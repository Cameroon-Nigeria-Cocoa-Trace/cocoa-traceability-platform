/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */
"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { useFirebase } from "@/context/FirebaseContext";
import {
  Store,
  Users,
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
  Layers,
  History,
  GitBranch,
  FileText,
} from "lucide-react";
import {
  CooperativeDashboardData,
  CooperativeFarmerMembership,
  MembershipStatus,
} from "@/types/cooperative";

export default function CooperativeDashboardPage() {
  const { user } = useFirebase();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [dashboardData, setDashboardData] = useState<CooperativeDashboardData | null>(null);
  const [activeTab, setActiveTab] = useState<"members" | "history" | "subordinates" | "profile">("members");

  // Modals state
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [showOrgModal, setShowOrgModal] = useState(false);
  const [showSubModal, setShowSubModal] = useState(false);

  // Add Member form fields
  const [formFarmerId, setFormFarmerId] = useState("");
  const [formFarmerName, setFormFarmerName] = useState("");
  const [formVillage, setFormVillage] = useState("");
  const [formFarmsCount, setFormFarmsCount] = useState<number>(1);
  const [formNotes, setFormNotes] = useState("");
  const [submittingMember, setSubmittingMember] = useState(false);

  // Org registration form fields
  const [orgName, setOrgName] = useState("");
  const [orgRegNumber, setOrgRegNumber] = useState("");
  const [orgRegion, setOrgRegion] = useState("South-West Region, Cameroon");
  const [orgAddress, setOrgAddress] = useState("");
  const [orgEmail, setOrgEmail] = useState("");
  const [orgPhone, setOrgPhone] = useState("");
  const [submittingOrg, setSubmittingOrg] = useState(false);

  // Subordinate form fields
  const [subId, setSubId] = useState("");
  const [subName, setSubName] = useState("");
  const [submittingSub, setSubmittingSub] = useState(false);

  // Search & Filters
  const [memberSearch, setMemberSearch] = useState("");

  const loadDashboard = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // First check cooperative profile
      const profileRes = await fetch(`/api/cooperative/account?userId=${user.uid}`);
      const profileJson = await profileRes.json();

      if (!profileJson.success || !profileJson.profile) {
        // Prompt profile registration
        setShowOrgModal(true);
        setLoading(false);
        return;
      }

      const profile = profileJson.profile;
      const orgId = profile.cooperativeOrgId;

      const dashRes = await fetch(
        `/api/cooperative/dashboard?cooperativeOrgId=${orgId}&userId=${user.uid}`,
        {
          headers: { "x-user-uid": user.uid },
        }
      );
      const dashJson = await dashRes.json();

      if (dashJson.success && dashJson.data) {
        setDashboardData(dashJson.data);
      } else {
        throw new Error(dashJson.error || "Failed to load cooperative dashboard");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // Handle Add Member
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !dashboardData?.profile) return;
    setSubmittingMember(true);
    setError(null);

    try {
      if (!formFarmerId.trim()) throw new Error("Farmer ID or UID is required.");
      if (!formFarmerName.trim()) throw new Error("Farmer name is required.");
      if (!formVillage.trim()) throw new Error("Village or community is required.");

      const res = await fetch("/api/cooperative/members", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-uid": user.uid,
        },
        body: JSON.stringify({
          cooperativeOrgId: dashboardData.profile.cooperativeOrgId,
          farmerId: formFarmerId.trim(),
          farmerName: formFarmerName.trim(),
          villageOrCommunity: formVillage.trim(),
          farmsCount: Number(formFarmsCount) || 1,
          notes: formNotes.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || "Failed to add farmer member.");
      }

      setSuccessMsg(`Farmer "${formFarmerName}" added to cooperative successfully!`);
      setShowAddMemberModal(false);
      setFormFarmerId("");
      setFormFarmerName("");
      setFormVillage("");
      setFormFarmsCount(1);
      setFormNotes("");
      loadDashboard();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmittingMember(false);
    }
  };

  // Handle Status Update
  const handleUpdateStatus = async (farmerId: string, newStatus: MembershipStatus) => {
    if (!user || !dashboardData?.profile) return;
    try {
      const res = await fetch("/api/cooperative/members", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-uid": user.uid,
        },
        body: JSON.stringify({
          action: "update_status",
          cooperativeOrgId: dashboardData.profile.cooperativeOrgId,
          farmerId,
          status: newStatus,
          reason: `Status updated to ${newStatus} by cooperative officer`,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to update status.");
      setSuccessMsg(`Membership status updated to ${newStatus}.`);
      loadDashboard();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  // Handle Organization / Profile Registration
  const handleRegisterOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmittingOrg(true);
    setError(null);

    try {
      if (!orgName.trim()) throw new Error("Cooperative name is required.");
      if (!orgRegNumber.trim()) throw new Error("Registration number is required.");
      if (!orgAddress.trim()) throw new Error("Headquarters address is required.");

      // 1. Create Organization
      const orgRes = await fetch("/api/cooperative/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_organization",
          name: orgName.trim(),
          registrationNumber: orgRegNumber.trim(),
          region: orgRegion,
          headquartersAddress: orgAddress.trim(),
          contactEmail: orgEmail.trim() || user.email || "coop@traceability.cm",
          contactPhone: orgPhone.trim() || "+237 670 000 000",
          createdBy: user.uid,
        }),
      });
      const orgJson = await orgRes.json();
      if (!orgJson.success) throw new Error(orgJson.error || "Failed to create organization.");

      const org = orgJson.organization;

      // 2. Create Profile
      const profRes = await fetch("/api/cooperative/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.uid,
          fullName: user.displayName || "Cooperative Executive",
          email: user.email || orgEmail || "exec@coop.cm",
          phone: orgPhone || "+237 670 000 000",
          accountType: "organizational",
          cooperativeOrgId: org.id,
          cooperativeOrgName: org.name,
          role: "president",
        }),
      });
      const profJson = await profRes.json();
      if (!profJson.success) throw new Error(profJson.error || "Failed to create profile.");

      setSuccessMsg("Cooperative organization and profile registered successfully!");
      setShowOrgModal(false);
      loadDashboard();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmittingOrg(false);
    }
  };

  // Handle Link Subordinate
  const handleLinkSubordinate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !dashboardData?.profile || !dashboardData?.organization) return;
    setSubmittingSub(true);
    setError(null);

    try {
      if (!subId.trim() || !subName.trim()) throw new Error("Subordinate ID and Name are required.");

      const res = await fetch("/api/cooperative/members", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-uid": user.uid,
        },
        body: JSON.stringify({
          action: "link_subordinate",
          parentCooperativeId: dashboardData.organization.id,
          parentCooperativeName: dashboardData.organization.name,
          subordinateCooperativeId: subId.trim(),
          subordinateCooperativeName: subName.trim(),
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to link subordinate cooperative.");

      setSuccessMsg("Subordinate cooperative linked successfully!");
      setShowSubModal(false);
      setSubId("");
      setSubName("");
      loadDashboard();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmittingSub(false);
    }
  };

  const filteredMembers =
    dashboardData?.recentMemberships?.filter((m) => {
      const q = memberSearch.toLowerCase();
      return (
        m.farmerName.toLowerCase().includes(q) ||
        m.farmerId.toLowerCase().includes(q) ||
        m.villageOrCommunity.toLowerCase().includes(q)
      );
    }) || [];

  return (
    <div className="min-h-screen bg-[#f7f8f3] text-[#10251d]">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 pt-28 pb-20 sm:px-6 sm:pt-32 lg:px-8">
        {/* Alerts */}
        {error && (
          <div className="mb-6 rounded-2xl bg-red-50 p-4 text-xs text-red-800 flex items-center gap-2 border border-red-200 shadow-xs">
            <AlertCircle size={16} className="shrink-0" />
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="ml-auto text-red-600 hover:text-red-900 font-bold">×</button>
          </div>
        )}

        {successMsg && (
          <div className="mb-6 rounded-2xl bg-green-50 p-4 text-xs text-green-800 flex items-center gap-2 border border-green-200 shadow-xs">
            <CheckCircle2 size={16} className="shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[#edf7e8] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#2d6130] border border-[#d2ecc8]">
                Cooperative Hub
              </span>
              <span className="flex items-center gap-1 text-xs font-semibold text-[#57655d]">
                <ShieldCheck size={14} className="text-[#2a7a33]" /> Verified Enterprise
              </span>
            </div>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl text-[#10251d]">
              {dashboardData?.organization?.name || "Cooperative Management Dashboard"}
            </h1>
            <p className="mt-1 text-sm text-[#57655d]">
              {dashboardData?.organization
                ? `Registration: ${dashboardData.organization.registrationNumber} • Region: ${dashboardData.organization.region}`
                : "Manage your cooperative membership, certified collection hubs, and aggregation rosters."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {dashboardData?.organization && (
              <>
                <button
                  type="button"
                  onClick={() => setShowAddMemberModal(true)}
                  className="inline-flex items-center gap-2 rounded-full bg-[#0b3528] px-5 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-[#144737] cursor-pointer"
                >
                  <Plus size={16} /> Register Farmer Member
                </button>
                <button
                  type="button"
                  onClick={() => setShowSubModal(true)}
                  className="inline-flex items-center gap-2 rounded-full border border-[#dfe7d8] bg-white px-4 py-3 text-xs font-bold text-[#10251d] shadow-sm transition hover:bg-[#edf2ea] cursor-pointer"
                >
                  <GitBranch size={16} /> Link Sub-Coop
                </button>
              </>
            )}
            <button
              type="button"
              onClick={loadDashboard}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#dfe7d8] bg-white px-3.5 py-3 text-xs font-bold text-[#2d6130] transition hover:bg-[#edf2ea] disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <div className="mt-16 flex flex-col items-center justify-center rounded-[32px] border border-[#dfe7d8] bg-white p-16 text-center shadow-sm">
            <RefreshCw size={36} className="animate-spin text-[#2d6130]" />
            <h3 className="mt-4 text-base font-bold text-[#10251d]">Loading Cooperative Dashboard...</h3>
            <p className="mt-1 text-xs text-[#57655d]">Retrieving verified memberships and secure ledger records from Firestore.</p>
          </div>
        ) : !dashboardData?.organization ? (
          <div className="mt-12 flex flex-col items-center justify-center rounded-[32px] border border-dashed border-[#dfe7d8] bg-white p-16 text-center shadow-sm">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#edf7e8] text-[#2d6130]">
              <Store size={28} />
            </div>
            <h3 className="mt-4 text-xl font-bold text-[#10251d]">No Cooperative Organization Registered</h3>
            <p className="mt-1 max-w-md text-xs text-[#57655d] leading-relaxed">
              Your account is not yet linked to a registered cooperative. Register your organization to begin managing member farmers and certificate transfers.
            </p>
            <button
              type="button"
              onClick={() => setShowOrgModal(true)}
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#0b3528] px-6 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-[#144737] cursor-pointer"
            >
              <Plus size={16} /> Register Cooperative Now
            </button>
          </div>
        ) : (
          <>
            {/* Metrics Grid */}
            <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                label="Total Registered Farmers"
                value={dashboardData.metrics.totalRegisteredFarmers}
                unit="members"
                description="Linked active & inactive producers"
                icon={<Users size={18} />}
              />
              <MetricCard
                label="Active Membership"
                value={dashboardData.metrics.activeFarmers}
                unit="farmers"
                description="Eligible for seasonal aggregation"
                icon={<UserCheck size={18} />}
              />
              <MetricCard
                label="Certified Cocoa Received"
                value={dashboardData.metrics.totalCertifiedCocoaReceivedKg.toLocaleString()}
                unit="kg"
                description="Total intake recorded"
                icon={<Layers size={18} />}
              />
              <MetricCard
                label="Subordinate Cooperatives"
                value={dashboardData.metrics.subordinateCooperativesCount}
                unit="unions"
                description="Linked hierarchical societies"
                icon={<GitBranch size={18} />}
              />
            </section>

            {/* Navigation Tabs */}
            <div className="mt-10 flex items-center gap-2 border-b border-[#dfe7d8] pb-4">
              <button
                type="button"
                onClick={() => setActiveTab("members")}
                className={`rounded-full px-5 py-2.5 text-xs font-bold transition cursor-pointer ${
                  activeTab === "members"
                    ? "bg-[#0b3528] text-white shadow-xs"
                    : "bg-white text-[#57655d] border border-[#dfe7d8] hover:bg-[#f1f6ec]"
                }`}
              >
                Farmer Members ({dashboardData.recentMemberships.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("history")}
                className={`rounded-full px-5 py-2.5 text-xs font-bold transition cursor-pointer ${
                  activeTab === "history"
                    ? "bg-[#0b3528] text-white shadow-xs"
                    : "bg-white text-[#57655d] border border-[#dfe7d8] hover:bg-[#f1f6ec]"
                }`}
              >
                Membership Audit Trail ({dashboardData.recentMembershipHistory.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("subordinates")}
                className={`rounded-full px-5 py-2.5 text-xs font-bold transition cursor-pointer ${
                  activeTab === "subordinates"
                    ? "bg-[#0b3528] text-white shadow-xs"
                    : "bg-white text-[#57655d] border border-[#dfe7d8] hover:bg-[#f1f6ec]"
                }`}
              >
                Subordinate Societies ({dashboardData.subordinates.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("profile")}
                className={`rounded-full px-5 py-2.5 text-xs font-bold transition cursor-pointer ${
                  activeTab === "profile"
                    ? "bg-[#0b3528] text-white shadow-xs"
                    : "bg-white text-[#57655d] border border-[#dfe7d8] hover:bg-[#f1f6ec]"
                }`}
              >
                Organization Profile
              </button>
            </div>

            {/* Tab 1: Farmer Members */}
            {activeTab === "members" && (
              <section className="mt-6 space-y-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-lg font-bold text-[#10251d]">Registered Farmer Membership Roster</h3>
                  <div className="relative max-w-sm w-full">
                    <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#79887e]" />
                    <input
                      type="text"
                      placeholder="Search member by name, ID or village..."
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      className="w-full rounded-full border border-[#dfe7d8] bg-white py-2 pl-9 pr-4 text-xs font-medium outline-none focus:border-[#2d6130]"
                    />
                  </div>
                </div>

                {filteredMembers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-[28px] border border-dashed border-[#dfe7d8] bg-white p-12 text-center">
                    <Users size={32} className="text-[#8b998f]" />
                    <h4 className="mt-3 font-bold text-[#10251d]">No farmer memberships found</h4>
                    <p className="mt-1 text-xs text-[#57655d]">Register farmers using their Firebase UID to build your cooperative roster.</p>
                    <button
                      type="button"
                      onClick={() => setShowAddMemberModal(true)}
                      className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#0b3528] px-4 py-2 text-xs font-bold text-white shadow-xs"
                    >
                      <Plus size={14} /> Add First Member
                    </button>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {filteredMembers.map((mem) => (
                      <div key={mem.id} className="rounded-[24px] border border-[#dfe7d8] bg-white p-5 shadow-xs transition hover:shadow-md">
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="font-mono text-[10px] text-[#57655d]">{mem.farmerId}</span>
                            <h4 className="font-bold text-[#10251d] text-base mt-0.5">{mem.farmerName}</h4>
                          </div>
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold capitalize ${
                              mem.status === "active"
                                ? "bg-green-50 text-green-700 border border-green-200"
                                : mem.status === "suspended"
                                ? "bg-amber-50 text-amber-700 border border-amber-200"
                                : "bg-red-50 text-red-700 border border-red-200"
                            }`}
                          >
                            {mem.status}
                          </span>
                        </div>

                        <div className="mt-3 space-y-1 text-xs text-[#57655d] border-t border-[#edf1ea] pt-3">
                          <div className="flex justify-between">
                            <span>Village / Community:</span>
                            <strong className="text-[#10251d]">{mem.villageOrCommunity}</strong>
                          </div>
                          <div className="flex justify-between">
                            <span>Registered Farms:</span>
                            <strong className="text-[#10251d]">{mem.farmsCount} plot{mem.farmsCount !== 1 ? "s" : ""}</strong>
                          </div>
                          <div className="flex justify-between">
                            <span>Joined Date:</span>
                            <span>{new Date(mem.joinedAt).toLocaleDateString()}</span>
                          </div>
                        </div>

                        <div className="mt-4 flex items-center justify-between border-t border-[#edf1ea] pt-3">
                          <span className="text-[10px] text-[#79887e]">ID: {mem.id}</span>
                          <div className="flex items-center gap-1.5">
                            {mem.status !== "active" && (
                              <button
                                type="button"
                                onClick={() => handleUpdateStatus(mem.farmerId, "active")}
                                className="rounded-full bg-[#edf7e8] px-2.5 py-1 text-[10px] font-bold text-[#2d6130] hover:bg-[#d8f0d0] cursor-pointer"
                              >
                                Activate
                              </button>
                            )}
                            {mem.status === "active" && (
                              <button
                                type="button"
                                onClick={() => handleUpdateStatus(mem.farmerId, "suspended")}
                                className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700 hover:bg-amber-100 cursor-pointer"
                              >
                                Suspend
                              </button>
                            )}
                            {mem.status !== "withdrawn" && (
                              <button
                                type="button"
                                onClick={() => handleUpdateStatus(mem.farmerId, "withdrawn")}
                                className="rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-bold text-red-700 hover:bg-red-100 cursor-pointer"
                              >
                                Withdraw
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Tab 2: Membership Audit Trail */}
            {activeTab === "history" && (
              <section className="mt-6 space-y-4">
                <h3 className="text-lg font-bold text-[#10251d]">Secure Membership Audit &amp; Status History</h3>
                {dashboardData.recentMembershipHistory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-[28px] border border-dashed border-[#dfe7d8] bg-white p-12 text-center">
                    <History size={32} className="text-[#8b998f]" />
                    <h4 className="mt-3 font-bold text-[#10251d]">No membership history recorded</h4>
                    <p className="mt-1 text-xs text-[#57655d]">All membership actions are immutably logged for auditing.</p>
                  </div>
                ) : (
                  <div className="rounded-[24px] border border-[#dfe7d8] bg-white p-6 shadow-xs overflow-hidden">
                    <div className="divide-y divide-[#edf1ea]">
                      {dashboardData.recentMembershipHistory.map((h) => (
                        <div key={h.id} className="py-3.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-[#10251d] uppercase tracking-wide text-[11px]">
                                {h.actionTaken.replace("_", " ")}
                              </span>
                              <span className="font-mono text-[10px] text-[#57655d]">Farmer: {h.farmerId}</span>
                            </div>
                            <p className="mt-0.5 text-[#57655d]">
                              Status: {h.previousStatus ? `${h.previousStatus} → ` : ""}<strong className="text-[#10251d]">{h.newStatus}</strong>
                              {h.reason ? ` • Reason: ${h.reason}` : ""}
                            </p>
                          </div>
                          <div className="text-right font-mono text-[11px] text-[#79887e]">
                            {new Date(h.timestamp).toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* Tab 3: Subordinate Cooperatives */}
            {activeTab === "subordinates" && (
              <section className="mt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-[#10251d]">Hierarchical Subordinate Cooperatives</h3>
                  <button
                    type="button"
                    onClick={() => setShowSubModal(true)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#0b3528] px-4 py-2 text-xs font-bold text-white shadow-xs"
                  >
                    <Plus size={14} /> Link Sub-Cooperative
                  </button>
                </div>

                {dashboardData.subordinates.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-[28px] border border-dashed border-[#dfe7d8] bg-white p-12 text-center">
                    <GitBranch size={32} className="text-[#8b998f]" />
                    <h4 className="mt-3 font-bold text-[#10251d]">No subordinate cooperatives linked</h4>
                    <p className="mt-1 text-xs text-[#57655d]">Link subordinate collection centers or district chapters under this umbrella organization.</p>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {dashboardData.subordinates.map((sub) => (
                      <div key={sub.id} className="rounded-[24px] border border-[#dfe7d8] bg-white p-5 shadow-xs">
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="font-mono text-[10px] text-[#2d6130] font-bold">{sub.subordinateCooperativeId}</span>
                            <h4 className="font-bold text-[#10251d] text-base mt-0.5">{sub.subordinateCooperativeName}</h4>
                          </div>
                          <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-[10px] font-bold text-green-700 border border-green-200">
                            {sub.status}
                          </span>
                        </div>
                        <p className="mt-3 text-xs text-[#57655d]">Linked on: {new Date(sub.linkedAt).toLocaleDateString()}</p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Tab 4: Organization Profile */}
            {activeTab === "profile" && dashboardData.organization && dashboardData.profile && (
              <section className="mt-6 space-y-6">
                <div className="rounded-[28px] border border-[#dfe7d8] bg-white p-6 shadow-xs space-y-4">
                  <h3 className="text-lg font-bold text-[#10251d]">Official Cooperative Organization Details</h3>
                  <div className="grid gap-4 sm:grid-cols-2 text-xs">
                    <div className="rounded-2xl border border-[#edf1ea] bg-[#fafcf9] p-4">
                      <span className="block text-[10px] uppercase font-semibold text-[#6f7e73]">Cooperative Organization Name</span>
                      <strong className="text-sm font-bold text-[#10251d] mt-0.5 block">{dashboardData.organization.name}</strong>
                    </div>
                    <div className="rounded-2xl border border-[#edf1ea] bg-[#fafcf9] p-4">
                      <span className="block text-[10px] uppercase font-semibold text-[#6f7e73]">Ministry Registration Number</span>
                      <strong className="text-sm font-bold text-[#2d6130] mt-0.5 block font-mono">{dashboardData.organization.registrationNumber}</strong>
                    </div>
                    <div className="rounded-2xl border border-[#edf1ea] bg-[#fafcf9] p-4">
                      <span className="block text-[10px] uppercase font-semibold text-[#6f7e73]">Operating Region / Basin</span>
                      <strong className="text-sm font-bold text-[#10251d] mt-0.5 block">{dashboardData.organization.region}</strong>
                    </div>
                    <div className="rounded-2xl border border-[#edf1ea] bg-[#fafcf9] p-4">
                      <span className="block text-[10px] uppercase font-semibold text-[#6f7e73]">Headquarters Address</span>
                      <strong className="text-sm font-bold text-[#10251d] mt-0.5 block">{dashboardData.organization.headquartersAddress}</strong>
                    </div>
                    <div className="rounded-2xl border border-[#edf1ea] bg-[#fafcf9] p-4">
                      <span className="block text-[10px] uppercase font-semibold text-[#6f7e73]">Contact Email &amp; Phone</span>
                      <strong className="text-xs font-bold text-[#10251d] mt-0.5 block">{dashboardData.organization.contactEmail} • {dashboardData.organization.contactPhone}</strong>
                    </div>
                    <div className="rounded-2xl border border-[#edf1ea] bg-[#fafcf9] p-4">
                      <span className="block text-[10px] uppercase font-semibold text-[#6f7e73]">Authorized Representative Profile</span>
                      <strong className="text-xs font-bold text-[#10251d] mt-0.5 block">{dashboardData.profile.fullName} ({dashboardData.profile.role})</strong>
                    </div>
                  </div>
                </div>
              </section>
            )}
          </>
        )}
      </main>

      {/* Modal: Add Farmer Member */}
      {showAddMemberModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-lg rounded-[32px] border border-[#dfe7d8] bg-white p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setShowAddMemberModal(false)}
              className="absolute right-5 top-5 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            >
              <X size={18} />
            </button>
            <h3 className="text-xl font-bold text-[#10251d]">Register Farmer Member</h3>
            <p className="mt-1 text-xs text-[#57655d]">Link an existing registered farmer to your cooperative using their Firebase UID.</p>

            <form onSubmit={handleAddMember} className="mt-5 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-[#10251d] mb-1">Farmer Firebase UID / User ID <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="e.g. usr_farmer_manyu_001"
                  value={formFarmerId}
                  onChange={(e) => setFormFarmerId(e.target.value)}
                  className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#10251d] mb-1">Farmer Full Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Enow Paul"
                  value={formFarmerName}
                  onChange={(e) => setFormFarmerName(e.target.value)}
                  className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#10251d] mb-1">Village or Community <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ekok Village"
                  value={formVillage}
                  onChange={(e) => setFormVillage(e.target.value)}
                  className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#10251d] mb-1">Number of Farms / Plots</label>
                <input
                  type="number"
                  min="1"
                  value={formFarmsCount}
                  onChange={(e) => setFormFarmsCount(Number(e.target.value))}
                  className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#10251d] mb-1">Membership Notes / Cadastral Reference (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="Additional notes..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium resize-none"
                />
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddMemberModal(false)}
                  className="rounded-full border border-[#dfe7d8] bg-white px-5 py-2.5 text-xs font-bold text-[#10251d] hover:bg-[#edf2ea]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingMember}
                  className="rounded-full bg-[#0b3528] px-6 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#144737] disabled:opacity-50"
                >
                  {submittingMember ? "Registering..." : "Add Member"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Register Cooperative Organization & Profile */}
      {showOrgModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="relative my-8 w-full max-w-xl rounded-[32px] border border-[#dfe7d8] bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-[#10251d]">Register Cooperative Organization</h3>
            <p className="mt-1 text-xs text-[#57655d]">Set up your cooperative enterprise credentials, registration number, and headquarters.</p>

            <form onSubmit={handleRegisterOrg} className="mt-5 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-[#10251d] mb-1">Cooperative Official Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mamfe Central Farmers Multi-Purpose Cooperative"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#10251d] mb-1">Ministry Registration Number <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="e.g. COOP-CMR-SW-2026-041"
                  value={orgRegNumber}
                  onChange={(e) => setOrgRegNumber(e.target.value)}
                  className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#10251d] mb-1">Operating Region / Basin <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  value={orgRegion}
                  onChange={(e) => setOrgRegion(e.target.value)}
                  className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#10251d] mb-1">Headquarters Address <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Commercial Avenue, Mamfe"
                  value={orgAddress}
                  onChange={(e) => setOrgAddress(e.target.value)}
                  className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">Contact Email</label>
                  <input
                    type="email"
                    placeholder="info@coop.cm"
                    value={orgEmail}
                    onChange={(e) => setOrgEmail(e.target.value)}
                    className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">Contact Phone</label>
                  <input
                    type="text"
                    placeholder="+237 677 000 000"
                    value={orgPhone}
                    onChange={(e) => setOrgPhone(e.target.value)}
                    className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-2">
                <button
                  type="submit"
                  disabled={submittingOrg}
                  className="w-full rounded-full bg-[#0b3528] py-3 text-xs font-bold text-white shadow-sm hover:bg-[#144737] disabled:opacity-50 cursor-pointer"
                >
                  {submittingOrg ? "Registering Organization..." : "Complete Organization Setup"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Link Subordinate Cooperative */}
      {showSubModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-[32px] border border-[#dfe7d8] bg-white p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setShowSubModal(false)}
              className="absolute right-5 top-5 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            >
              <X size={18} />
            </button>
            <h3 className="text-xl font-bold text-[#10251d]">Link Subordinate Cooperative</h3>
            <p className="mt-1 text-xs text-[#57655d]">Establish hierarchical linkage with a sub-cooperative or collection center.</p>

            <form onSubmit={handleLinkSubordinate} className="mt-5 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-[#10251d] mb-1">Sub-Cooperative ID <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="e.g. org_coop_sub_mamfe_south"
                  value={subId}
                  onChange={(e) => setSubId(e.target.value)}
                  className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#10251d] mb-1">Sub-Cooperative Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mamfe South Sub-Cooperative"
                  value={subName}
                  onChange={(e) => setSubName(e.target.value)}
                  className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] p-2.5 outline-none font-medium"
                />
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSubModal(false)}
                  className="rounded-full border border-[#dfe7d8] bg-white px-5 py-2.5 text-xs font-bold text-[#10251d] hover:bg-[#edf2ea]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingSub}
                  className="rounded-full bg-[#0b3528] px-6 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#144737] disabled:opacity-50"
                >
                  {submittingSub ? "Linking..." : "Link Sub-Cooperative"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  unit,
  description,
  icon,
}: {
  label: string;
  value: string | number;
  unit?: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-[28px] border border-[#dfe7d8] bg-white p-5 shadow-xs transition hover:shadow-md">
      <div className="flex items-center justify-between text-[#57655d]">
        <span className="text-xs font-semibold">{label}</span>
        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#edf7e8] text-[#2d6130]">{icon}</div>
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="text-2xl font-black text-[#10251d]">{value}</span>
        {unit && <span className="text-xs text-[#57655d]">{unit}</span>}
      </div>
      <p className="mt-1 text-[0.7rem] text-[#6f7e73]">{description}</p>
    </div>
  );
}
