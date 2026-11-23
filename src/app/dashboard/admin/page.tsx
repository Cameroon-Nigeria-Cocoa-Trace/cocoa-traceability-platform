/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { useFirebase } from "@/context/FirebaseContext";
import { adminService } from "@/lib/admin/adminService";
import {
  AdminFullSnapshot,
  AdminManagedEntity,
  FeeConfig,
  PlatformSystemStatus,
  EntityOperationalStatus,
  ManagedEntityType,
} from "@/types/admin";
import {
  SystemStatusModal,
  EntityStatusModal,
  UserRoleModal,
  FeeConfigModal,
  OversightReviewModal,
  DeleteEntityModal,
} from "@/components/admin/AdminModals";
import {
  ShieldAlert,
  RefreshCw,
  Search,
  Building2,
  Coins,
  ClipboardList,
  Activity,
  Lock,
  LogIn,
  Plus,
  CheckCircle2,
  AlertCircle,
  Edit3,
  UserCog,
  FileCheck2,
  SlidersHorizontal,
  ArrowRight,
  Trash2,
} from "lucide-react";

type AdminTab = "overview" | "entities" | "compliance" | "fees" | "audit";
type ComplianceSubTab =
  | "certificates"
  | "applications"
  | "customs"
  | "farms"
  | "lots"
  | "payments"
  | "receipts";

const SYSTEM_MODES: {
  value: PlatformSystemStatus;
  label: string;
  summary: string;
  tone: string;
}[] = [
  {
    value: "active",
    label: "Active",
    summary: "All trade, transfer, warehouse, and customs rails operational",
    tone: "border-[#2d6130] bg-[#edf7e8] text-[#10251d]",
  },
  {
    value: "maintenance",
    label: "Maintenance",
    summary: "Read-only inspection mode during index or compliance updates",
    tone: "border-amber-500 bg-amber-50 text-amber-900",
  },
  {
    value: "suspended",
    label: "Suspended",
    summary: "Commercial transfers and new listings paused pending review",
    tone: "border-orange-600 bg-orange-50 text-orange-900",
  },
  {
    value: "emergency_stop",
    label: "Emergency Stop",
    summary: "Immediate full freeze across all export & custody workflows",
    tone: "border-red-600 bg-red-50 text-red-900",
  },
];

function formatDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function StatusChip({ status }: { status?: string }) {
  if (!status || !status.trim()) {
    return <span className="text-[11px] text-[#57655d]">—</span>;
  }
  const normalized = status.trim().toLowerCase();
  let classes = "border-[#dfe7d8] bg-[#f7f8f3] text-[#394a41]";
  if (
    normalized === "active" ||
    normalized === "approved" ||
    normalized === "cleared" ||
    normalized === "verified" ||
    normalized === "completed" ||
    normalized === "available" ||
    normalized === "paid" ||
    normalized === "operational"
  ) {
    classes = "border-[#b8e0aa] bg-[#edf7e8] text-[#1f5425]";
  } else if (
    normalized === "pending" ||
    normalized === "submitted" ||
    normalized === "created" ||
    normalized === "under_investigation" ||
    normalized === "maintenance" ||
    normalized === "hold"
  ) {
    classes = "border-amber-300 bg-amber-50 text-amber-900";
  } else if (
    normalized === "suspended" ||
    normalized === "revoked" ||
    normalized === "rejected" ||
    normalized === "emergency_stop" ||
    normalized === "flagged" ||
    normalized === "failed"
  ) {
    classes = "border-red-300 bg-red-50 text-red-800";
  }

  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold capitalize ${classes}`}
    >
      {normalized.replaceAll("_", " ")}
    </span>
  );
}

export default function AdminDashboardPage() {
  const { user, loading: authLoading, isAdmin, userRole } = useFirebase();

  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [complianceTab, setComplianceTab] = useState<ComplianceSubTab>("certificates");

  const [snapshot, setSnapshot] = useState<AdminFullSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bannerMsg, setBannerMsg] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string>("");

  // Filters
  const [entitySearch, setEntitySearch] = useState("");
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>("all");
  const [entityStatusFilter, setEntityStatusFilter] = useState<string>("all");
  const [complianceSearch, setComplianceSearch] = useState("");
  const [auditSearch, setAuditSearch] = useState("");
  const [auditActionFilter, setAuditActionFilter] = useState("ALL");

  // Modal States
  const [pendingSystemStatus, setPendingSystemStatus] = useState<PlatformSystemStatus | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<AdminManagedEntity | null>(null);
  const [roleModalEntity, setRoleModalEntity] = useState<AdminManagedEntity | null>(null);
  const [deleteModalEntity, setDeleteModalEntity] = useState<AdminManagedEntity | null>(null);
  const [feeModalState, setFeeModalState] = useState<{
    mode: "edit" | "create";
    fee?: FeeConfig | null;
  } | null>(null);
  const [oversightModal, setOversightModal] = useState<{
    kind: "certificate" | "application" | "customs" | "farm";
    id: string;
    label: string;
    defaultOption: string;
    options: { value: string; label: string }[];
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadSnapshot = useCallback(
    async (silent = false) => {
      if (!user || !isAdmin) return;
      try {
        if (!silent) setLoading(true);
        else setRefreshing(true);
        setError(null);
        const data = await adminService.getFullSnapshot(
          user.uid,
          user.email || undefined
        );
        setSnapshot(data);
        setLastSyncedAt(new Date().toISOString());
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user, isAdmin]
  );

  useEffect(() => {
    if (!authLoading && user && isAdmin) {
      loadSnapshot(false);
    } else if (!authLoading) {
      setLoading(false);
    }
  }, [authLoading, user, isAdmin, loadSnapshot]);

  const showToast = (msg: string) => {
    setBannerMsg(msg);
    setTimeout(() => setBannerMsg(null), 5000);
  };

  // Filtered Entities
  const filteredEntities = useMemo(() => {
    if (!snapshot) return [];
    const q = entitySearch.trim().toLowerCase();
    return snapshot.entities.filter((e) => {
      if (entityTypeFilter !== "all" && e.entityType !== entityTypeFilter) return false;
      if (entityStatusFilter !== "all" && e.operationalStatus !== entityStatusFilter) return false;
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q) ||
        e.region.toLowerCase().includes(q) ||
        e.subtitle.toLowerCase().includes(q) ||
        (e.role || "").toLowerCase().includes(q)
      );
    });
  }, [snapshot, entitySearch, entityTypeFilter, entityStatusFilter]);

  // Filtered Audit Logs
  const filteredAuditLogs = useMemo(() => {
    if (!snapshot) return [];
    const q = auditSearch.trim().toLowerCase();
    return snapshot.auditLogs.filter((log) => {
      if (auditActionFilter !== "ALL" && log.action !== auditActionFilter) return false;
      if (!q) return true;
      return (
        log.action.toLowerCase().includes(q) ||
        log.adminUserId.toLowerCase().includes(q) ||
        (log.adminEmail || "").toLowerCase().includes(q) ||
        (log.targetEntityId || "").toLowerCase().includes(q) ||
        JSON.stringify(log.details || {}).toLowerCase().includes(q)
      );
    });
  }, [snapshot, auditSearch, auditActionFilter]);

  // Action Handlers
  const handleConfirmSystemStatus = async (reason: string) => {
    if (!user || !pendingSystemStatus) return;
    try {
      setSubmitting(true);
      await adminService.setSystemStatus(
        pendingSystemStatus,
        user.uid,
        reason,
        user.email || undefined
      );
      setPendingSystemStatus(null);
      showToast(`Platform status changed to ${pendingSystemStatus.toUpperCase()}.`);
      await loadSnapshot(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmEntityStatus = async (
    status: EntityOperationalStatus,
    reason: string
  ) => {
    if (!user || !selectedEntity) return;
    try {
      setSubmitting(true);
      await adminService.setEntityStatus(
        {
          entityType: selectedEntity.entityType as ManagedEntityType,
          entityId: selectedEntity.id,
          entityName: selectedEntity.name,
          status,
          reason,
          sourceCollection: selectedEntity.sourceCollection,
        },
        user.uid,
        user.email || undefined
      );
      setSelectedEntity(null);
      showToast(`Entity "${selectedEntity.name}" marked as ${status.replace("_", " ")}.`);
      await loadSnapshot(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmUserRole = async (
    newRole: "farmer" | "cooperative" | "agent" | "warehouse" | "buyer" | "admin",
    reason: string
  ) => {
    if (!user || !roleModalEntity) return;
    try {
      setSubmitting(true);
      await adminService.updateUserRole(
        {
          targetUid: roleModalEntity.id,
          targetName: roleModalEntity.name,
          targetEmail: roleModalEntity.subtitle,
          newRole,
          reason,
        },
        user.uid,
        user.email || undefined
      );
      setRoleModalEntity(null);
      showToast(`Updated role for "${roleModalEntity.name}" to ${newRole}.`);
      await loadSnapshot(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDeleteEntity = async (reason: string) => {
    if (!user || !deleteModalEntity) return;
    try {
      setSubmitting(true);
      await adminService.deleteEntity(
        {
          entityId: deleteModalEntity.id,
          entityName: deleteModalEntity.name,
          entityType: deleteModalEntity.entityType,
          sourceCollection: deleteModalEntity.sourceCollection,
          reason,
        },
        user.uid,
        user.email || undefined
      );
      const removedName = deleteModalEntity.name;
      setDeleteModalEntity(null);
      showToast(`Deleted "${removedName}" from Firestore.`);
      await loadSnapshot(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveFeeConfig = async (payload: {
    code: string;
    name: string;
    description: string;
    amount: number;
    currency: "NGN" | "USD";
    isPercentage: boolean;
    applicableActorTypes: string[];
  }) => {
    if (!user || !feeModalState) return;
    try {
      setSubmitting(true);
      if (feeModalState.mode === "edit") {
        await adminService.updateFeeConfig(
          payload,
          user.uid,
          user.email || undefined
        );
        showToast(`Updated statutory fee rule ${payload.code}.`);
      } else {
        await adminService.createFeeConfig(
          payload,
          user.uid,
          user.email || undefined
        );
        showToast(`Created new statutory fee rule ${payload.code}.`);
      }
      setFeeModalState(null);
      await loadSnapshot(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmOversight = async (selectedStatus: string, reason: string) => {
    if (!user || !oversightModal) return;
    try {
      setSubmitting(true);
      if (oversightModal.kind === "certificate") {
        await adminService.overrideCertificateStatus(
          {
            certId: oversightModal.id,
            certificateNumber: oversightModal.label,
            status: selectedStatus,
            reason,
          },
          user.uid,
          user.email || undefined
        );
      } else if (oversightModal.kind === "application") {
        await adminService.overrideCertificateApplicationStatus(
          {
            appId: oversightModal.id,
            farmName: oversightModal.label,
            status: selectedStatus,
            reason,
          },
          user.uid,
          user.email || undefined
        );
      } else if (oversightModal.kind === "customs") {
        await adminService.overrideCustomsStatus(
          {
            requestId: oversightModal.id,
            consignmentCode: oversightModal.label,
            status: selectedStatus,
            reason,
          },
          user.uid,
          user.email || undefined
        );
      } else if (oversightModal.kind === "farm") {
        await adminService.overrideFarmAudit(
          {
            farmId: oversightModal.id,
            farmName: oversightModal.label,
            auditStatus: selectedStatus,
            eudrCompliant: selectedStatus === "Verified",
            reason,
          },
          user.uid,
          user.email || undefined
        );
      }
      setOversightModal(null);
      showToast(`Recorded governance decision for ${oversightModal.label}.`);
      await loadSnapshot(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  // Gate 1: Auth Loading
  if (authLoading || (user && isAdmin && loading && !snapshot)) {
    return (
      <div className="min-h-screen bg-[#f7f8f3] text-[#10251d]">
        <Navbar />
        <main className="mx-auto max-w-7xl px-4 pt-28 pb-16 sm:px-6 lg:px-8">
          <div className="space-y-6">
            <div className="h-20 animate-pulse rounded-2xl border border-[#dfe7d8] bg-white" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-28 animate-pulse rounded-2xl border border-[#dfe7d8] bg-white"
                />
              ))}
            </div>
            <div className="h-72 animate-pulse rounded-2xl border border-[#dfe7d8] bg-white" />
          </div>
        </main>
      </div>
    );
  }

  // Gate 2: Unauthenticated
  if (!user) {
    return (
      <div className="min-h-screen bg-[#f7f8f3] text-[#10251d]">
        <Navbar />
        <main className="mx-auto flex min-h-screen max-w-lg items-center justify-center px-4 pt-24 pb-16">
          <div className="w-full rounded-2xl border border-[#dfe7d8] bg-white p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#edf7e8] text-[#2d6130]">
              <Lock size={22} />
            </div>
            <h1 className="mt-4 text-xl font-bold text-[#10251d]">
              Administrator Sign-In Required
            </h1>
            <p className="mt-2 text-xs leading-relaxed text-[#57655d]">
              Sign in with an authorized SLITE Trace platform administrator account to access system controls, fee schedules, and compliance oversight.
            </p>
            <Link
              href="/login?redirect=/dashboard/admin"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#0b3528] px-6 py-3 text-xs font-bold text-white transition hover:bg-[#144737]"
            >
              <LogIn size={15} />
              Sign In to Admin Console
            </Link>
          </div>
        </main>
      </div>
    );
  }

  // Gate 3: Non-Admin User
  if (!isAdmin) {
    const fallbackHref =
      userRole === "warehouse"
        ? "/dashboard/warehouse"
        : userRole === "agent"
        ? "/dashboard/agent"
        : userRole === "cooperative"
        ? "/dashboard/cooperative"
        : "/dashboard";

    return (
      <div className="min-h-screen bg-[#f7f8f3] text-[#10251d]">
        <Navbar />
        <main className="mx-auto flex min-h-screen max-w-lg items-center justify-center px-4 pt-24 pb-16">
          <div className="w-full rounded-2xl border border-red-200 bg-white p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-red-700">
              <ShieldAlert size={22} />
            </div>
            <h1 className="mt-4 text-xl font-bold text-[#10251d]">
              Access Restricted
            </h1>
            <p className="mt-2 text-xs leading-relaxed text-[#57655d]">
              The account <span className="font-mono font-semibold text-[#10251d]">{user.email || user.uid}</span> does not have Administrator privileges (current role: <span className="font-semibold capitalize">{userRole}</span>).
            </p>
            <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
              <Link
                href={fallbackHref}
                className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#0b3528] px-5 py-2.5 text-xs font-bold text-white transition hover:bg-[#144737]"
              >
                Go to My Workspace <ArrowRight size={14} />
              </Link>
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-full border border-[#dfe7d8] bg-white px-5 py-2.5 text-xs font-semibold text-[#394a41] transition hover:bg-[#f7f8f3]"
              >
                Back to Home
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const metrics = snapshot?.dashboard.metrics;
  const systemStatus = snapshot?.dashboard.systemStatus || "active";
  const pendingApps =
    snapshot?.certificateApplications.filter((a) =>
      ["pending", "submitted"].includes(a.status.toLowerCase())
    ) || [];
  const pendingCustoms =
    snapshot?.customsRequests.filter((c) =>
      ["pending", "submitted"].includes(c.status.toLowerCase())
    ) || [];

  const qCompliance = complianceSearch.trim().toLowerCase();

  return (
    <div className="min-h-screen bg-[#f7f8f3] text-[#10251d]">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 pt-26 pb-20 sm:px-6 lg:px-8">
        {/* Top Workspace Header */}
        <header className="rounded-2xl border border-[#dfe7d8] bg-white p-5 sm:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-[#57655d]">
                <span>SLITE Trace</span>
                <span>/</span>
                <span className="text-[#2d6130]">Platform Governance Console</span>
              </div>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#10251d] sm:text-3xl">
                Platform Governance Console
              </h1>
              <p className="mt-1 text-xs text-[#57655d]">
                Central administrative oversight for supply chain custody, EUDR audits, customs clearance, and statutory fee rules.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 rounded-xl border border-[#dfe7d8] bg-[#fafcf9] px-3 py-2 text-xs">
                <span className="text-[#57655d]">System Status:</span>
                <StatusChip status={systemStatus} />
              </div>

              {lastSyncedAt && (
                <span className="hidden font-mono text-[11px] tabular-nums text-[#57655d] sm:inline">
                  Synced {formatDate(lastSyncedAt)}
                </span>
              )}

              <button
                type="button"
                onClick={() => loadSnapshot(true)}
                disabled={refreshing}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#0b3528] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#144737] disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
                {refreshing ? "Refreshing..." : "Refresh Data"}
              </button>
            </div>
          </div>

          {/* Primary Governance Tabs */}
          <nav
            aria-label="Admin Governance Sections"
            className="mt-5 flex flex-wrap gap-2 border-t border-[#edf1ea] pt-4"
          >
            {(
              [
                { id: "overview", label: "Overview", icon: Activity },
                {
                  id: "entities",
                  label: "Supply Chain Entities",
                  icon: Building2,
                  count: snapshot?.entities.length,
                },
                {
                  id: "compliance",
                  label: "Compliance & Oversight",
                  icon: FileCheck2,
                  count: pendingApps.length + pendingCustoms.length,
                },
                {
                  id: "fees",
                  label: "Statutory Fee Schedule",
                  icon: Coins,
                  count: snapshot?.dashboard.feeConfigs.length,
                },
                {
                  id: "audit",
                  label: "Immutable Audit Trail",
                  icon: ClipboardList,
                  count: snapshot?.auditLogs.length,
                },
              ] as {
                id: AdminTab;
                label: string;
                icon: React.ComponentType<{ size?: number }>;
                count?: number;
              }[]
            ).map((tab) => {
              const Icon = tab.icon;
              const isSelected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold transition cursor-pointer ${
                    isSelected
                      ? "border-[#0b3528] bg-[#0b3528] text-white"
                      : "border-[#dfe7d8] bg-[#fafcf9] text-[#394a41] hover:border-[#2d6130] hover:bg-white"
                  }`}
                >
                  <Icon size={14} />
                  <span>{tab.label}</span>
                  {typeof tab.count === "number" && (
                    <span
                      className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] tabular-nums ${
                        isSelected
                          ? "bg-white/15 text-[#b8f58b]"
                          : "bg-[#edf1ea] text-[#394a41]"
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </header>

        {/* Feedback Alerts */}
        {bannerMsg && (
          <div className="mt-4 flex items-center justify-between rounded-xl border border-[#b8e0aa] bg-[#edf7e8] px-4 py-3 text-xs font-semibold text-[#1f5425]">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} />
              <span>{bannerMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setBannerMsg(null)}
              className="text-xs underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-800">
            <div className="flex items-center gap-2">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-xs underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {snapshot?.readWarnings && snapshot.readWarnings.length > 0 && (
          <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900">
            <div className="flex items-center gap-2 font-bold">
              <AlertCircle size={15} />
              <span>Partial Firestore Read Warnings ({snapshot.readWarnings.length})</span>
            </div>
            <ul className="mt-1 list-disc pl-5 text-[11px]">
              {snapshot.readWarnings.map((w, idx) => (
                <li key={idx}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {/* TAB 1: OVERVIEW */}
        {activeTab === "overview" && snapshot && metrics && (
          <div className="mt-6 space-y-6">
            {/* KPI Grid */}
            <section aria-label="Platform Telemetry KPIs">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-2xl border border-[#dfe7d8] bg-white p-5">
                  <p className="text-xs font-semibold text-[#57655d]">
                    Registered Farms &amp; EUDR Compliance
                  </p>
                  <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-[#10251d]">
                    {(metrics.totalFarms || 0).toLocaleString()}
                  </p>
                  <p className="mt-1.5 font-mono text-[11px] tabular-nums text-[#57655d]">
                    {metrics.eudrCompliantFarms || 0} EUDR verified ·{" "}
                    {(metrics.totalHectares || 0).toLocaleString()} ha mapped
                  </p>
                </div>

                <div className="rounded-2xl border border-[#dfe7d8] bg-white p-5">
                  <p className="text-xs font-semibold text-[#57655d]">
                    Active Farmers &amp; Platform Accounts
                  </p>
                  <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-[#10251d]">
                    {metrics.activeFarmersCount.toLocaleString()}
                  </p>
                  <p className="mt-1.5 font-mono text-[11px] tabular-nums text-[#57655d]">
                    {(metrics.totalUsers || 0).toLocaleString()} total registered user profiles
                  </p>
                </div>

                <div className="rounded-2xl border border-[#dfe7d8] bg-white p-5">
                  <p className="text-xs font-semibold text-[#57655d]">
                    Cooperatives &amp; Buying Agents
                  </p>
                  <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-[#10251d]">
                    {metrics.totalCooperatives.toLocaleString()} /{" "}
                    {metrics.totalAgents.toLocaleString()}
                  </p>
                  <p className="mt-1.5 text-[11px] text-[#57655d]">
                    Registered collection cooperatives &amp; licensed corridor agents
                  </p>
                </div>

                <div className="rounded-2xl border border-[#dfe7d8] bg-white p-5">
                  <p className="text-xs font-semibold text-[#57655d]">
                    Bonded Warehouses &amp; Tracked Tonnage
                  </p>
                  <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-[#10251d]">
                    {(metrics.totalPlatformTonnageKg / 1000).toFixed(1)} MT
                  </p>
                  <p className="mt-1.5 font-mono text-[11px] tabular-nums text-[#57655d]">
                    {metrics.totalWarehouses} facilities ·{" "}
                    {metrics.totalPlatformTonnageKg.toLocaleString()} kg traced
                  </p>
                </div>

                <div className="rounded-2xl border border-[#dfe7d8] bg-white p-5">
                  <p className="text-xs font-semibold text-[#57655d]">
                    Customs Clearance Declarations
                  </p>
                  <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-[#10251d]">
                    {metrics.totalCustomsRequests.toLocaleString()}
                  </p>
                  <p className="mt-1.5 font-mono text-[11px] tabular-nums text-[#57655d]">
                    {metrics.pendingCustomsRequests || 0} pending border review
                  </p>
                </div>

                <div className="rounded-2xl border border-[#dfe7d8] bg-white p-5">
                  <p className="text-xs font-semibold text-[#57655d]">
                    Origin Certificates &amp; Trade Activity
                  </p>
                  <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-[#10251d]">
                    {(metrics.totalCertificates || 0).toLocaleString()} /{" "}
                    {(metrics.totalTrades || 0).toLocaleString()}
                  </p>
                  <p className="mt-1.5 font-mono text-[11px] tabular-nums text-[#57655d]">
                    {metrics.totalLots || 0} lots · {metrics.totalListings || 0} listings ·{" "}
                    {metrics.pendingCertApplications || 0} pending cert apps
                  </p>
                </div>
              </div>
            </section>

            {/* Platform Operational Mode Selector */}
            <section className="rounded-2xl border border-[#dfe7d8] bg-white p-5 sm:p-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-bold text-[#10251d]">
                    Platform Operational Mode Control
                  </h2>
                  <p className="text-xs text-[#57655d]">
                    Switch the live operational state of the network. Changes persist in Firestore{" "}
                    <span className="font-mono">admin_settings/platform_status</span>.
                    {snapshot.dashboard.systemStatusUpdatedAt && (
                      <span className="ml-1 font-mono text-[11px]">
                        (Last updated {formatDate(snapshot.dashboard.systemStatusUpdatedAt)}
                        {snapshot.dashboard.systemStatusUpdatedBy
                          ? ` by ${snapshot.dashboard.systemStatusUpdatedBy}`
                          : ""}
                        )
                      </span>
                    )}
                  </p>
                </div>
                <StatusChip status={systemStatus} />
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {SYSTEM_MODES.map((mode) => {
                  const isCurrent = systemStatus === mode.value;
                  return (
                    <button
                      key={mode.value}
                      type="button"
                      disabled={isCurrent}
                      onClick={() => setPendingSystemStatus(mode.value)}
                      className={`flex flex-col justify-between rounded-xl border p-4 text-left transition ${
                        isCurrent
                          ? mode.tone
                          : "border-[#dfe7d8] bg-[#fafcf9] hover:border-[#2d6130] hover:bg-white cursor-pointer"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold">{mode.label}</span>
                        {isCurrent && (
                          <span className="text-[10px] font-bold uppercase tracking-wider">
                            Current
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 text-[11px] leading-relaxed opacity-85">
                        {mode.summary}
                      </p>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Two-Column Action Queue & Recent Audit Log */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Review & Governance Queue */}
              <section className="rounded-2xl border border-[#dfe7d8] bg-white p-5 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-[#10251d]">
                      Pending Governance Queue
                    </h2>
                    <p className="text-xs text-[#57655d]">
                      Applications, border clearances, and restricted entities needing attention
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab("compliance")}
                    className="text-xs font-bold text-[#2d6130] hover:underline cursor-pointer"
                  >
                    Open Oversight
                  </button>
                </div>

                <div className="mt-4 space-y-2.5">
                  {pendingApps.length === 0 &&
                  pendingCustoms.length === 0 &&
                  snapshot.dashboard.suspendedEntities.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[#dfe7d8] bg-[#fafcf9] p-6 text-center text-xs text-[#57655d]">
                      No pending certificate applications, customs holds, or suspended entities require action right now.
                    </div>
                  ) : (
                    <>
                      {pendingApps.slice(0, 4).map((app) => (
                        <div
                          key={app.id}
                          className="flex items-center justify-between gap-3 rounded-xl border border-[#edf1ea] bg-[#fafcf9] px-4 py-3 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-bold text-[#10251d]">
                              Cert App: {app.farmName}
                            </p>
                            <p className="truncate text-[11px] text-[#57655d]">
                              {app.applicantName || "—"} ·{" "}
                              <span className="font-mono tabular-nums">
                                {app.requestedWeightKg.toLocaleString()} kg
                              </span>
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setOversightModal({
                                kind: "application",
                                id: app.id,
                                label: app.farmName,
                                defaultOption: "approved",
                                options: [
                                  { value: "approved", label: "Approve Application" },
                                  { value: "rejected", label: "Reject Application" },
                                  { value: "pending", label: "Keep Pending" },
                                ],
                              })
                            }
                            className="shrink-0 rounded-lg bg-[#0b3528] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-[#144737] cursor-pointer"
                          >
                            Review
                          </button>
                        </div>
                      ))}

                      {pendingCustoms.slice(0, 4).map((req) => (
                        <div
                          key={req.id}
                          className="flex items-center justify-between gap-3 rounded-xl border border-[#edf1ea] bg-[#fafcf9] px-4 py-3 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-bold text-[#10251d]">
                              Customs: {req.consignmentCode}
                            </p>
                            <p className="truncate text-[11px] text-[#57655d]">
                              {req.exporterName || "—"} · {req.destinationPort || req.destinationCountry || "—"}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setOversightModal({
                                kind: "customs",
                                id: req.id,
                                label: req.consignmentCode,
                                defaultOption: "cleared",
                                options: [
                                  { value: "cleared", label: "Approve & Clear" },
                                  { value: "hold", label: "Place on Hold" },
                                  { value: "rejected", label: "Reject Declaration" },
                                ],
                              })
                            }
                            className="shrink-0 rounded-lg bg-[#0b3528] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-[#144737] cursor-pointer"
                          >
                            Inspect
                          </button>
                        </div>
                      ))}

                      {snapshot.dashboard.suspendedEntities.slice(0, 3).map((ent) => (
                        <div
                          key={ent.entityId}
                          className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-3 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-bold text-[#10251d]">
                              {ent.entityName}
                            </p>
                            <p className="truncate text-[11px] text-[#57655d]">
                              {ent.reason || ent.entityType}
                            </p>
                          </div>
                          <StatusChip status={ent.status} />
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </section>

              {/* Recent Audit Logs */}
              <section className="rounded-2xl border border-[#dfe7d8] bg-white p-5 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-[#10251d]">
                      Recent Audit Activity
                    </h2>
                    <p className="text-xs text-[#57655d]">
                      Latest recorded governance mutations across the platform
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab("audit")}
                    className="text-xs font-bold text-[#2d6130] hover:underline cursor-pointer"
                  >
                    Full Trail
                  </button>
                </div>

                <div className="mt-4 space-y-2.5">
                  {snapshot.auditLogs.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[#dfe7d8] bg-[#fafcf9] p-6 text-center text-xs text-[#57655d]">
                      No administrative audit events recorded yet.
                    </div>
                  ) : (
                    snapshot.auditLogs.slice(0, 7).map((log) => (
                      <div
                        key={log.id}
                        className="flex items-start justify-between gap-3 rounded-xl border border-[#edf1ea] bg-[#fafcf9] px-4 py-2.5 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-mono text-[11px] font-bold text-[#10251d]">
                            {log.action}
                          </p>
                          <p className="mt-0.5 truncate text-[11px] text-[#57655d]">
                            {log.targetEntityId ? `Target: ${log.targetEntityId}` : "Platform"}{" "}
                            · By {log.adminEmail || log.adminUserId}
                          </p>
                        </div>
                        <span className="shrink-0 font-mono text-[10px] tabular-nums text-[#57655d]">
                          {formatDate(log.timestamp)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          </div>
        )}

        {/* TAB 2: SUPPLY CHAIN ENTITIES */}
        {activeTab === "entities" && snapshot && (
          <section className="mt-6 rounded-2xl border border-[#dfe7d8] bg-white p-5 sm:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-base font-bold text-[#10251d]">
                  Supply Chain Entity &amp; Account Directory
                </h2>
                <p className="text-xs text-[#57655d]">
                  Suspend, flag for investigation, reactivate entities, or reassign user roles across the network.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative">
                  <Search
                    size={14}
                    className="absolute left-3 top-2.5 text-[#57655d]"
                  />
                  <input
                    type="text"
                    value={entitySearch}
                    onChange={(e) => setEntitySearch(e.target.value)}
                    placeholder="Search name, ID, region..."
                    className="w-56 rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] py-2 pl-8 pr-3 text-xs text-[#10251d] outline-none focus:border-[#2d6130] focus:bg-white"
                  />
                </div>

                <select
                  value={entityTypeFilter}
                  onChange={(e) => setEntityTypeFilter(e.target.value)}
                  className="rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] px-3 py-2 text-xs font-semibold text-[#10251d] outline-none focus:border-[#2d6130]"
                >
                  <option value="all">All Categories</option>
                  <option value="cooperative">Cooperatives</option>
                  <option value="agent">Buying Agents</option>
                  <option value="warehouse">Warehouses</option>
                  <option value="customs_agency">Customs Agencies</option>
                  <option value="user">User Accounts</option>
                </select>

                <select
                  value={entityStatusFilter}
                  onChange={(e) => setEntityStatusFilter(e.target.value)}
                  className="rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] px-3 py-2 text-xs font-semibold text-[#10251d] outline-none focus:border-[#2d6130]"
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="under_investigation">Under Investigation</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>
            </div>

            <div className="mt-5 overflow-x-auto">
              {filteredEntities.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#dfe7d8] bg-[#fafcf9] p-8 text-center text-xs text-[#57655d]">
                  No registered supply chain entities match the current filters.
                </div>
              ) : (
                <table className="w-full min-w-[780px] border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#edf1ea] text-[11px] font-bold uppercase tracking-wider text-[#57655d]">
                      <th className="py-3 pr-4">Entity / Account</th>
                      <th className="py-3 pr-4">Category</th>
                      <th className="py-3 pr-4">Region / Hub</th>
                      <th className="py-3 pr-4">Credentials</th>
                      <th className="py-3 pr-4">Status</th>
                      <th className="py-3 text-right">Governance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#edf1ea]">
                    {filteredEntities.map((entity) => (
                      <tr key={`${entity.sourceCollection}_${entity.id}`} className="hover:bg-[#fafcf9]">
                        <td className="py-3.5 pr-4">
                          <div className="font-bold text-[#10251d]">{entity.name}</div>
                          <div className="font-mono text-[11px] text-[#57655d]">
                            {entity.id}
                          </div>
                        </td>
                        <td className="py-3.5 pr-4">
                          <div className="font-semibold capitalize text-[#394a41]">
                            {entity.entityType.replace("_", " ")}
                          </div>
                          {entity.role && (
                            <div className="text-[11px] capitalize text-[#57655d]">
                              Role: {entity.role}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 pr-4 text-[#394a41]">{entity.region || "—"}</td>
                        <td className="py-3.5 pr-4 text-[#57655d]">{entity.subtitle || "—"}</td>
                        <td className="py-3.5 pr-4">
                          <StatusChip status={entity.operationalStatus} />
                          {entity.statusReason && (
                            <div className="mt-1 max-w-[180px] truncate text-[10px] text-[#57655d]">
                              {entity.statusReason}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            {entity.entityType === "user" && (
                              <button
                                type="button"
                                onClick={() => setRoleModalEntity(entity)}
                                className="inline-flex items-center gap-1 rounded-lg border border-[#dfe7d8] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#10251d] hover:border-[#2d6130] cursor-pointer"
                              >
                                <UserCog size={12} />
                                Role
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setSelectedEntity(entity)}
                              className="inline-flex items-center gap-1 rounded-lg bg-[#0b3528] px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-[#144737] cursor-pointer"
                            >
                              <SlidersHorizontal size={12} />
                              Control
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteModalEntity(entity)}
                              className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-red-700 hover:bg-red-50 cursor-pointer"
                              title="Delete Firestore document"
                            >
                              <Trash2 size={12} />
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        )}

        {/* TAB 3: COMPLIANCE & OVERSIGHT */}
        {activeTab === "compliance" && snapshot && (
          <section className="mt-6 rounded-2xl border border-[#dfe7d8] bg-white p-5 sm:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-base font-bold text-[#10251d]">
                  Traceability, EUDR &amp; Customs Oversight
                </h2>
                <p className="text-xs text-[#57655d]">
                  Inspect and override origin certificates, farm EUDR audits, customs declarations, and trade lots.
                </p>
              </div>

              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-3 top-2.5 text-[#57655d]"
                />
                <input
                  type="text"
                  value={complianceSearch}
                  onChange={(e) => setComplianceSearch(e.target.value)}
                  placeholder="Filter records..."
                  className="w-60 rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] py-2 pl-8 pr-3 text-xs text-[#10251d] outline-none focus:border-[#2d6130] focus:bg-white"
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 border-b border-[#edf1ea] pb-4">
              {(
                [
                  {
                    id: "certificates",
                    label: "Origin Certificates",
                    count: snapshot.certificates.length,
                  },
                  {
                    id: "applications",
                    label: "Cert Applications",
                    count: snapshot.certificateApplications.length,
                  },
                  {
                    id: "customs",
                    label: "Customs Clearance",
                    count: snapshot.customsRequests.length,
                  },
                  {
                    id: "farms",
                    label: "Farms & EUDR",
                    count: snapshot.farms.length,
                  },
                  {
                    id: "lots",
                    label: "Lots, Listings & Trades",
                    count: snapshot.lotsAndTrades.length,
                  },
                  {
                    id: "payments",
                    label: "Payments",
                    count: snapshot.payments.length,
                  },
                  {
                    id: "receipts",
                    label: "Warehouse Receipts",
                    count: snapshot.warehouseReceipts.length,
                  },
                ] as { id: ComplianceSubTab; label: string; count: number }[]
              ).map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => setComplianceTab(sub.id)}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                    complianceTab === sub.id
                      ? "border-[#2d6130] bg-[#edf7e8] text-[#10251d]"
                      : "border-[#dfe7d8] bg-white text-[#57655d] hover:text-[#10251d]"
                  }`}
                >
                  <span>{sub.label}</span>
                  <span className="font-mono text-[10px] tabular-nums opacity-80">
                    ({sub.count})
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-4 overflow-x-auto">
              {/* Sub-tab: Origin Certificates */}
              {complianceTab === "certificates" && (
                <>
                  {snapshot.certificates.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[#dfe7d8] bg-[#fafcf9] p-8 text-center text-xs text-[#57655d]">
                      No origin certificates issued in Firestore yet.
                    </div>
                  ) : (
                    <table className="w-full min-w-[740px] border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-[#edf1ea] text-[11px] font-bold uppercase tracking-wider text-[#57655d]">
                          <th className="py-3 pr-4">Certificate #</th>
                          <th className="py-3 pr-4">Current Holder</th>
                          <th className="py-3 pr-4">Origin</th>
                          <th className="py-3 pr-4">Weight</th>
                          <th className="py-3 pr-4">Status</th>
                          <th className="py-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#edf1ea]">
                        {snapshot.certificates
                          .filter(
                            (c) =>
                              !qCompliance ||
                              c.certificateNumber.toLowerCase().includes(qCompliance) ||
                              c.holderName.toLowerCase().includes(qCompliance) ||
                              c.originRegion.toLowerCase().includes(qCompliance)
                          )
                          .map((cert) => (
                            <tr key={cert.id} className="hover:bg-[#fafcf9]">
                              <td className="py-3 pr-4 font-mono font-bold text-[#10251d]">
                                {cert.certificateNumber}
                              </td>
                              <td className="py-3 pr-4">
                                <div className="font-semibold text-[#10251d]">
                                  {cert.holderName || "—"}
                                </div>
                                <div className="text-[11px] capitalize text-[#57655d]">
                                  {cert.holderType || "—"}
                                </div>
                              </td>
                              <td className="py-3 pr-4 text-[#394a41]">
                                {cert.originRegion || "—"}
                              </td>
                              <td className="py-3 pr-4 font-mono tabular-nums text-[#10251d]">
                                {cert.weightKg.toLocaleString()} kg
                              </td>
                              <td className="py-3 pr-4">
                                <StatusChip status={cert.status} />
                              </td>
                              <td className="py-3 text-right">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setOversightModal({
                                      kind: "certificate",
                                      id: cert.id,
                                      label: cert.certificateNumber,
                                      defaultOption: cert.status,
                                      options: [
                                        { value: "active", label: "Active / Valid" },
                                        { value: "suspended", label: "Suspend Certificate" },
                                        { value: "revoked", label: "Revoke Certificate" },
                                      ],
                                    })
                                  }
                                  className="rounded-lg bg-[#0b3528] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-[#144737] cursor-pointer"
                                >
                                  Review
                                </button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}

              {/* Sub-tab: Certificate Applications */}
              {complianceTab === "applications" && (
                <>
                  {snapshot.certificateApplications.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[#dfe7d8] bg-[#fafcf9] p-8 text-center text-xs text-[#57655d]">
                      No certificate applications submitted yet.
                    </div>
                  ) : (
                    <table className="w-full min-w-[740px] border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-[#edf1ea] text-[11px] font-bold uppercase tracking-wider text-[#57655d]">
                          <th className="py-3 pr-4">Farm</th>
                          <th className="py-3 pr-4">Applicant</th>
                          <th className="py-3 pr-4">Region</th>
                          <th className="py-3 pr-4">Volume</th>
                          <th className="py-3 pr-4">Status</th>
                          <th className="py-3 text-right">Decision</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#edf1ea]">
                        {snapshot.certificateApplications
                          .filter(
                            (a) =>
                              !qCompliance ||
                              a.farmName.toLowerCase().includes(qCompliance) ||
                              a.applicantName.toLowerCase().includes(qCompliance)
                          )
                          .map((app) => (
                            <tr key={app.id} className="hover:bg-[#fafcf9]">
                              <td className="py-3 pr-4">
                                <div className="font-bold text-[#10251d]">{app.farmName}</div>
                                {app.applicationNumber && (
                                  <div className="font-mono text-[11px] text-[#57655d]">
                                    {app.applicationNumber}
                                  </div>
                                )}
                              </td>
                              <td className="py-3 pr-4">
                                <div className="text-[#10251d]">{app.applicantName || "—"}</div>
                                <div className="text-[11px] text-[#57655d]">
                                  {app.applicantEmail || app.id}
                                </div>
                              </td>
                              <td className="py-3 pr-4 text-[#394a41]">{app.region || "—"}</td>
                              <td className="py-3 pr-4 font-mono tabular-nums text-[#10251d]">
                                {app.requestedWeightKg.toLocaleString()} kg
                              </td>
                              <td className="py-3 pr-4">
                                <StatusChip status={app.status} />
                              </td>
                              <td className="py-3 text-right">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setOversightModal({
                                      kind: "application",
                                      id: app.id,
                                      label: app.farmName,
                                      defaultOption: "approved",
                                      options: [
                                        { value: "approved", label: "Approve Application" },
                                        { value: "rejected", label: "Reject Application" },
                                        { value: "pending", label: "Return to Pending" },
                                      ],
                                    })
                                  }
                                  className="rounded-lg bg-[#0b3528] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-[#144737] cursor-pointer"
                                >
                                  Decide
                                </button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}

              {/* Sub-tab: Customs Requests */}
              {complianceTab === "customs" && (
                <>
                  {snapshot.customsRequests.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[#dfe7d8] bg-[#fafcf9] p-8 text-center text-xs text-[#57655d]">
                      No customs clearance declarations logged yet.
                    </div>
                  ) : (
                    <table className="w-full min-w-[740px] border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-[#edf1ea] text-[11px] font-bold uppercase tracking-wider text-[#57655d]">
                          <th className="py-3 pr-4">Consignment</th>
                          <th className="py-3 pr-4">Exporter</th>
                          <th className="py-3 pr-4">Corridor &amp; Port</th>
                          <th className="py-3 pr-4">Weight</th>
                          <th className="py-3 pr-4">Status</th>
                          <th className="py-3 text-right">Override</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#edf1ea]">
                        {snapshot.customsRequests
                          .filter(
                            (r) =>
                              !qCompliance ||
                              r.consignmentCode.toLowerCase().includes(qCompliance) ||
                              r.exporterName.toLowerCase().includes(qCompliance)
                          )
                          .map((req) => (
                            <tr key={req.id} className="hover:bg-[#fafcf9]">
                              <td className="py-3 pr-4 font-mono font-bold text-[#10251d]">
                                {req.consignmentCode}
                              </td>
                              <td className="py-3 pr-4 text-[#10251d]">{req.exporterName || "—"}</td>
                              <td className="py-3 pr-4 text-[#394a41]">
                                <div>{req.corridor || "—"}</div>
                                <div className="text-[11px] text-[#57655d]">
                                  {[req.destinationPort, req.destinationCountry].filter(Boolean).join(" · ") || "—"}
                                </div>
                              </td>
                              <td className="py-3 pr-4 font-mono tabular-nums text-[#10251d]">
                                <div>{req.weightKg.toLocaleString()} kg</div>
                                <div className="text-[10px] text-[#57655d]">
                                  {req.clearanceFeePaid ? "Fee Paid" : "Fee Pending"}
                                </div>
                              </td>
                              <td className="py-3 pr-4">
                                <StatusChip status={req.status} />
                              </td>
                              <td className="py-3 text-right">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setOversightModal({
                                      kind: "customs",
                                      id: req.id,
                                      label: req.consignmentCode,
                                      defaultOption: "cleared",
                                      options: [
                                        { value: "cleared", label: "Cleared for Export" },
                                        { value: "hold", label: "Hold for Border Audit" },
                                        { value: "rejected", label: "Reject Declaration" },
                                      ],
                                    })
                                  }
                                  className="rounded-lg bg-[#0b3528] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-[#144737] cursor-pointer"
                                >
                                  Inspect
                                </button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}

              {/* Sub-tab: Farms & EUDR */}
              {complianceTab === "farms" && (
                <>
                  {snapshot.farms.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[#dfe7d8] bg-[#fafcf9] p-8 text-center text-xs text-[#57655d]">
                      No registered farms recorded yet.
                    </div>
                  ) : (
                    <table className="w-full min-w-[740px] border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-[#edf1ea] text-[11px] font-bold uppercase tracking-wider text-[#57655d]">
                          <th className="py-3 pr-4">Farm Plot</th>
                          <th className="py-3 pr-4">Producer</th>
                          <th className="py-3 pr-4">Region</th>
                          <th className="py-3 pr-4">Area (ha)</th>
                          <th className="py-3 pr-4">EUDR / Audit</th>
                          <th className="py-3 text-right">Audit Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#edf1ea]">
                        {snapshot.farms
                          .filter(
                            (f) =>
                              !qCompliance ||
                              f.farmName.toLowerCase().includes(qCompliance) ||
                              f.farmerName.toLowerCase().includes(qCompliance) ||
                              f.region.toLowerCase().includes(qCompliance)
                          )
                          .map((farm) => (
                            <tr key={farm.id} className="hover:bg-[#fafcf9]">
                              <td className="py-3 pr-4">
                                <div className="font-bold text-[#10251d]">
                                  {farm.farmName}
                                </div>
                                <div className="font-mono text-[11px] text-[#57655d]">
                                  {farm.farmUniqueId || farm.id}
                                </div>
                              </td>
                              <td className="py-3 pr-4">
                                <div className="text-[#10251d]">{farm.farmerName || "—"}</div>
                                {farm.farmerEmail && (
                                  <div className="text-[11px] text-[#57655d]">
                                    {farm.farmerEmail}
                                  </div>
                                )}
                              </td>
                              <td className="py-3 pr-4 text-[#394a41]">{farm.region || "—"}</td>
                              <td className="py-3 pr-4 font-mono tabular-nums text-[#10251d]">
                                {farm.sizeHectares.toFixed(2)} ha
                              </td>
                              <td className="py-3 pr-4">
                                <StatusChip
                                  status={
                                    farm.eudrCompliant
                                      ? "verified"
                                      : farm.auditStatus || "unverified"
                                  }
                                />
                              </td>
                              <td className="py-3 text-right">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setOversightModal({
                                      kind: "farm",
                                      id: farm.id,
                                      label: farm.farmName,
                                      defaultOption: "Verified",
                                      options: [
                                        { value: "Verified", label: "Verify EUDR Compliance" },
                                        { value: "Pending", label: "Mark Pending Review" },
                                        { value: "Flagged", label: "Flag Deforestation Risk" },
                                      ],
                                    })
                                  }
                                  className="rounded-lg bg-[#0b3528] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-[#144737] cursor-pointer"
                                >
                                  Audit
                                </button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}

              {/* Sub-tab: Lots, Listings & Trades */}
              {complianceTab === "lots" && (
                <>
                  {snapshot.lotsAndTrades.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[#dfe7d8] bg-[#fafcf9] p-8 text-center text-xs text-[#57655d]">
                      No cocoa lots, marketplace listings, or trades recorded in Firestore yet.
                    </div>
                  ) : (
                    <table className="w-full min-w-[740px] border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-[#edf1ea] text-[11px] font-bold uppercase tracking-wider text-[#57655d]">
                          <th className="py-3 pr-4">Reference</th>
                          <th className="py-3 pr-4">Type</th>
                          <th className="py-3 pr-4">Party / Title</th>
                          <th className="py-3 pr-4">Grade &amp; Weight</th>
                          <th className="py-3 pr-4">Value</th>
                          <th className="py-3 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#edf1ea]">
                        {snapshot.lotsAndTrades
                          .filter(
                            (item) =>
                              !qCompliance ||
                              item.referenceCode.toLowerCase().includes(qCompliance) ||
                              item.partyName.toLowerCase().includes(qCompliance) ||
                              item.kind.toLowerCase().includes(qCompliance)
                          )
                          .map((item) => (
                            <tr key={`${item.kind}_${item.id}`} className="hover:bg-[#fafcf9]">
                              <td className="py-3 pr-4 font-mono font-bold text-[#10251d]">
                                {item.referenceCode}
                              </td>
                              <td className="py-3 pr-4 capitalize text-[#394a41]">
                                {item.kind}
                              </td>
                              <td className="py-3 pr-4 text-[#10251d]">{item.partyName || "—"}</td>
                              <td className="py-3 pr-4 font-mono tabular-nums text-[#394a41]">
                                {[item.grade, `${item.weightKg.toLocaleString()} kg`]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </td>
                              <td className="py-3 pr-4 font-mono tabular-nums text-[#10251d]">
                                {item.amount > 0
                                  ? `${item.amount.toLocaleString()} ${item.currency}`
                                  : item.currency || "—"}
                              </td>
                              <td className="py-3 text-right">
                                <StatusChip status={item.status} />
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}

              {/* Sub-tab: Payments */}
              {complianceTab === "payments" && (
                <>
                  {snapshot.payments.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[#dfe7d8] bg-[#fafcf9] p-8 text-center text-xs text-[#57655d]">
                      No platform payment records stored in Firestore yet.
                    </div>
                  ) : (
                    <table className="w-full min-w-[740px] border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-[#edf1ea] text-[11px] font-bold uppercase tracking-wider text-[#57655d]">
                          <th className="py-3 pr-4">Payment Reference</th>
                          <th className="py-3 pr-4">Payer → Payee</th>
                          <th className="py-3 pr-4">Purpose &amp; Gateway</th>
                          <th className="py-3 pr-4">Amount</th>
                          <th className="py-3 pr-4">Date</th>
                          <th className="py-3 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#edf1ea]">
                        {snapshot.payments
                          .filter(
                            (p) =>
                              !qCompliance ||
                              p.paymentReference.toLowerCase().includes(qCompliance) ||
                              p.payerName.toLowerCase().includes(qCompliance) ||
                              p.payeeName.toLowerCase().includes(qCompliance) ||
                              p.purpose.toLowerCase().includes(qCompliance)
                          )
                          .map((pay) => (
                            <tr key={pay.id} className="hover:bg-[#fafcf9]">
                              <td className="py-3 pr-4 font-mono text-[11px] font-bold text-[#10251d]">
                                {pay.paymentReference}
                              </td>
                              <td className="py-3 pr-4 text-[#10251d]">
                                {[pay.payerName, pay.payeeName].filter(Boolean).join(" → ") || "—"}
                              </td>
                              <td className="py-3 pr-4 text-[#394a41]">
                                <div>{pay.purpose || "—"}</div>
                                <div className="text-[11px] text-[#57655d]">
                                  {pay.gateway || "—"}
                                </div>
                              </td>
                              <td className="py-3 pr-4 font-mono tabular-nums font-bold text-[#10251d]">
                                {pay.amount.toLocaleString()} {pay.currency}
                              </td>
                              <td className="py-3 pr-4 font-mono text-[11px] tabular-nums text-[#57655d]">
                                {formatDate(pay.createdAt)}
                              </td>
                              <td className="py-3 text-right">
                                <StatusChip status={pay.status} />
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}

              {/* Sub-tab: Warehouse Receipts */}
              {complianceTab === "receipts" && (
                <>
                  {snapshot.warehouseReceipts.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[#dfe7d8] bg-[#fafcf9] p-8 text-center text-xs text-[#57655d]">
                      No warehouse receipts stored in Firestore yet.
                    </div>
                  ) : (
                    <table className="w-full min-w-[740px] border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-[#edf1ea] text-[11px] font-bold uppercase tracking-wider text-[#57655d]">
                          <th className="py-3 pr-4">Consignment</th>
                          <th className="py-3 pr-4">Facility</th>
                          <th className="py-3 pr-4">Source Entity</th>
                          <th className="py-3 pr-4">Grade</th>
                          <th className="py-3 pr-4">Quantity &amp; Bags</th>
                          <th className="py-3 text-right">Received</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#edf1ea]">
                        {snapshot.warehouseReceipts
                          .filter(
                            (r) =>
                              !qCompliance ||
                              r.consignmentCode.toLowerCase().includes(qCompliance) ||
                              r.facilityName.toLowerCase().includes(qCompliance) ||
                              r.sourceEntityName.toLowerCase().includes(qCompliance)
                          )
                          .map((rec) => (
                            <tr key={rec.id} className="hover:bg-[#fafcf9]">
                              <td className="py-3 pr-4 font-mono font-bold text-[#10251d]">
                                {rec.consignmentCode}
                              </td>
                              <td className="py-3 pr-4 text-[#10251d]">
                                {rec.facilityName || "—"}
                              </td>
                              <td className="py-3 pr-4 text-[#394a41]">
                                {rec.sourceEntityName || "—"}
                              </td>
                              <td className="py-3 pr-4 text-[#394a41]">
                                {rec.grade || "—"}
                              </td>
                              <td className="py-3 pr-4 font-mono tabular-nums text-[#10251d]">
                                {rec.quantityKg.toLocaleString()} kg ({rec.totalBags.toLocaleString()} bags)
                              </td>
                              <td className="py-3 text-right font-mono text-[11px] tabular-nums text-[#57655d]">
                                {formatDate(rec.receivedAt)}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}
            </div>
          </section>
        )}

        {/* TAB 4: STATUTORY FEE SCHEDULE */}
        {activeTab === "fees" && snapshot && (
          <section className="mt-6 rounded-2xl border border-[#dfe7d8] bg-white p-5 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-bold text-[#10251d]">
                  Statutory Fee Schedule
                </h2>
                <p className="text-xs text-[#57655d]">
                  Configure statutory clearance, certificate transfer, EUDR audit, and marketplace commission fees.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFeeModalState({ mode: "create", fee: null })}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#0b3528] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#144737] cursor-pointer"
              >
                <Plus size={14} />
                Add Fee Rule
              </button>
            </div>

            <div className="mt-5 overflow-x-auto">
              {snapshot.dashboard.feeConfigs.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#dfe7d8] bg-[#fafcf9] p-8 text-center text-xs text-[#57655d]">
                  No statutory fee rules configured in Firestore yet. Click &ldquo;Add Fee Rule&rdquo; to create one.
                </div>
              ) : (
                <table className="w-full min-w-[760px] border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#edf1ea] text-[11px] font-bold uppercase tracking-wider text-[#57655d]">
                      <th className="py-3 pr-4">Code</th>
                      <th className="py-3 pr-4">Rule &amp; Description</th>
                      <th className="py-3 pr-4">Actors</th>
                      <th className="py-3 pr-4">Rate</th>
                      <th className="py-3 pr-4">Last Updated</th>
                      <th className="py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#edf1ea]">
                    {snapshot.dashboard.feeConfigs.map((fee) => (
                      <tr key={fee.code} className="hover:bg-[#fafcf9]">
                        <td className="py-3.5 pr-4 font-mono text-[11px] font-bold text-[#2d6130]">
                          {fee.code}
                        </td>
                        <td className="py-3.5 pr-4">
                          <div className="font-bold text-[#10251d]">{fee.name}</div>
                          <div className="mt-0.5 max-w-md text-[11px] text-[#57655d]">
                            {fee.description || "—"}
                          </div>
                        </td>
                        <td className="py-3.5 pr-4 capitalize text-[#394a41]">
                          {fee.applicableActorTypes.length > 0
                            ? fee.applicableActorTypes.join(", ")
                            : "—"}
                        </td>
                        <td className="py-3.5 pr-4 font-mono text-sm font-bold tabular-nums text-[#10251d]">
                          {fee.isPercentage
                            ? `${fee.amount}%`
                            : `${fee.amount.toLocaleString()} ${fee.currency}`}
                        </td>
                        <td className="py-3.5 pr-4 font-mono text-[11px] tabular-nums text-[#57655d]">
                          <div>{formatDate(fee.updatedAt)}</div>
                          <div className="text-[10px]">By {fee.lastUpdatedBy || "—"}</div>
                        </td>
                        <td className="py-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => setFeeModalState({ mode: "edit", fee })}
                            className="inline-flex items-center gap-1 rounded-lg border border-[#dfe7d8] bg-white px-3 py-1.5 text-[11px] font-bold text-[#10251d] transition hover:border-[#2d6130] cursor-pointer"
                          >
                            <Edit3 size={12} />
                            Edit Rate
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        )}

        {/* TAB 5: IMMUTABLE AUDIT TRAIL */}
        {activeTab === "audit" && snapshot && (
          <section className="mt-6 rounded-2xl border border-[#dfe7d8] bg-white p-5 sm:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-base font-bold text-[#10251d]">
                  Immutable Audit Trail
                </h2>
                <p className="text-xs text-[#57655d]">
                  Tamper-evident chronicle of administrative governance decisions, status switches, and fee modifications.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative">
                  <Search
                    size={14}
                    className="absolute left-3 top-2.5 text-[#57655d]"
                  />
                  <input
                    type="text"
                    value={auditSearch}
                    onChange={(e) => setAuditSearch(e.target.value)}
                    placeholder="Search actor, target, details..."
                    className="w-56 rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] py-2 pl-8 pr-3 text-xs text-[#10251d] outline-none focus:border-[#2d6130] focus:bg-white"
                  />
                </div>

                <select
                  value={auditActionFilter}
                  onChange={(e) => setAuditActionFilter(e.target.value)}
                  className="rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] px-3 py-2 text-xs font-semibold text-[#10251d] outline-none focus:border-[#2d6130]"
                >
                  <option value="ALL">All Actions</option>
                  <option value="PLATFORM_SYSTEM_STATUS_CHANGE">System Status Changes</option>
                  <option value="FEE_CONFIG_UPDATED">Fee Updates</option>
                  <option value="FEE_CONFIG_CREATED">Fee Creations</option>
                  <option value="ENTITY_STATUS_CHANGED">Entity Governance</option>
                  <option value="USER_ROLE_UPDATED">User Role Changes</option>
                  <option value="CERTIFICATE_STATUS_OVERRIDE">Certificate Overrides</option>
                  <option value="CERTIFICATE_APPLICATION_REVIEWED">Application Decisions</option>
                  <option value="CUSTOMS_REQUEST_OVERRIDE">Customs Overrides</option>
                  <option value="FARM_AUDIT_OVERRIDE">Farm EUDR Audits</option>
                </select>
              </div>
            </div>

            <div className="mt-5 overflow-x-auto">
              {filteredAuditLogs.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#dfe7d8] bg-[#fafcf9] p-8 text-center text-xs text-[#57655d]">
                  No audit entries match the selected filter criteria.
                </div>
              ) : (
                <table className="w-full min-w-[780px] border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#edf1ea] text-[11px] font-bold uppercase tracking-wider text-[#57655d]">
                      <th className="py-3 pr-4">Timestamp</th>
                      <th className="py-3 pr-4">Action</th>
                      <th className="py-3 pr-4">Administrator</th>
                      <th className="py-3 pr-4">Target</th>
                      <th className="py-3">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#edf1ea]">
                    {filteredAuditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-[#fafcf9]">
                        <td className="py-3 pr-4 font-mono text-[11px] tabular-nums text-[#57655d] whitespace-nowrap">
                          {formatDate(log.timestamp)}
                        </td>
                        <td className="py-3 pr-4 font-mono text-[11px] font-bold text-[#10251d]">
                          {log.action}
                        </td>
                        <td className="py-3 pr-4 text-[#394a41]">
                          {log.adminEmail || log.adminUserId}
                        </td>
                        <td className="py-3 pr-4 font-mono text-[11px] text-[#394a41]">
                          {log.targetEntityType || "platform"}
                          {log.targetEntityId ? `:${log.targetEntityId}` : ""}
                        </td>
                        <td className="py-3 font-mono text-[11px] text-[#57655d]">
                          {JSON.stringify(log.details || {})}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        )}
      </main>

      {/* Governance Modals */}
      {pendingSystemStatus && (
        <SystemStatusModal
          currentStatus={systemStatus}
          targetStatus={pendingSystemStatus}
          submitting={submitting}
          onClose={() => setPendingSystemStatus(null)}
          onConfirm={handleConfirmSystemStatus}
        />
      )}

      {selectedEntity && (
        <EntityStatusModal
          entityName={selectedEntity.name}
          entityType={selectedEntity.entityType}
          currentStatus={selectedEntity.operationalStatus}
          submitting={submitting}
          onClose={() => setSelectedEntity(null)}
          onConfirm={handleConfirmEntityStatus}
        />
      )}

      {roleModalEntity && (
        <UserRoleModal
          userName={roleModalEntity.name}
          userEmail={roleModalEntity.subtitle}
          currentRole={roleModalEntity.role || "farmer"}
          submitting={submitting}
          onClose={() => setRoleModalEntity(null)}
          onConfirm={handleConfirmUserRole}
        />
      )}

      {feeModalState && (
        <FeeConfigModal
          mode={feeModalState.mode}
          initialFee={feeModalState.fee}
          submitting={submitting}
          onClose={() => setFeeModalState(null)}
          onSave={handleSaveFeeConfig}
        />
      )}

      {oversightModal && (
        <OversightReviewModal
          title={
            oversightModal.kind === "certificate"
              ? "Origin Certificate Review"
              : oversightModal.kind === "application"
              ? "Certificate Application Decision"
              : oversightModal.kind === "customs"
              ? "Customs Declaration Override"
              : "Farm EUDR Audit Decision"
          }
          targetLabel={oversightModal.label}
          options={oversightModal.options}
          defaultOption={oversightModal.defaultOption}
          submitting={submitting}
          onClose={() => setOversightModal(null)}
          onConfirm={handleConfirmOversight}
        />
      )}

      {deleteModalEntity && (
        <DeleteEntityModal
          entityName={deleteModalEntity.name}
          entityId={deleteModalEntity.id}
          sourceCollection={deleteModalEntity.sourceCollection}
          submitting={submitting}
          onClose={() => setDeleteModalEntity(null)}
          onConfirm={handleConfirmDeleteEntity}
        />
      )}
    </div>
  );
}
