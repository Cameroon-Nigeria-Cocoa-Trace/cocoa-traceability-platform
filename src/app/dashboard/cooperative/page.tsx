/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { DashboardWorkflowNav } from "@/components/DashboardWorkflowNav";
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
  Trash2,
  Lock,
} from "lucide-react";
import {
  FarmerCooperativeAssociation,
  CooperativeOrganization,
} from "@/types/cooperative";

export default function CooperativeHubPage() {
  const { user, loading: authLoading } = useFirebase();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CooperativeOrganization[]>([]);
  const [searching, setSearching] = useState(false);
  const [associations, setAssociations] = useState<FarmerCooperativeAssociation[]>([]);

  const loadAssociations = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/cooperative/associations?farmerId=${user.uid}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.associations)) {
        setAssociations(json.associations);
      } else {
        setAssociations([]);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadAssociations();
    }
  }, [user, loadAssociations]);

  const handleSearchCooperative = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(`/api/cooperative/associations?search=${encodeURIComponent(searchQuery.trim())}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.organizations)) {
        setSearchResults(json.organizations);
        if (json.organizations.length === 0) {
          setError("No cooperative organizations found matching your email, phone, or name search.");
        }
      } else {
        setSearchResults([]);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSearching(false);
    }
  };

  const handleAssociate = async (org: CooperativeOrganization) => {
    if (!user) return;
    setError(null);
    try {
      const res = await fetch("/api/cooperative/associations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "associate",
          farmerId: user.uid,
          farmerName: user.displayName || "Farmer",
          cooperativeOrgId: org.id,
          cooperativeOrgName: org.name,
          cooperativeEmail: org.contactEmail,
          cooperativePhone: org.contactPhone,
          permissions: {
            farmsManagement: true,
            certificatesManagement: true,
            productionInventory: true,
            tradingManagement: true,
          },
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to associate cooperative.");

      setSuccessMsg(`Successfully associated with "${org.name}"! They can now manage farms, certificates, inventory, and trade on your behalf.`);
      loadAssociations();
      setSearchResults([]);
      setSearchQuery("");
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleTogglePermission = async (assoc: FarmerCooperativeAssociation, permissionKey: keyof FarmerCooperativeAssociation["permissions"]) => {
    if (!user) return;
    const updatedPermissions = {
      ...assoc.permissions,
      [permissionKey]: !assoc.permissions[permissionKey],
    };

    try {
      const res = await fetch("/api/cooperative/associations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_permissions",
          associationId: assoc.associationId,
          farmerId: assoc.farmerId,
          farmerName: assoc.farmerName,
          cooperativeOrgId: assoc.cooperativeOrgId,
          cooperativeOrgName: assoc.cooperativeOrgName,
          cooperativeEmail: assoc.cooperativeEmail,
          cooperativePhone: assoc.cooperativePhone,
          permissions: updatedPermissions,
          associatedAt: assoc.associatedAt,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to update permissions.");
      setSuccessMsg("Cooperative permissions updated successfully.");
      loadAssociations();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f8f3] text-[#10251d]">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 pt-28 pb-20 sm:px-6 sm:pt-32 lg:px-8">
        <DashboardWorkflowNav currentTab="farm-management" />

        {/* Alerts */}
        {error && (
          <div className="mb-6 rounded-2xl bg-red-50 p-4 text-xs text-red-800 flex items-center gap-2 border border-red-200 shadow-xs">
            <AlertCircle size={16} className="shrink-0" />
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="ml-auto text-red-600 hover:text-red-900 font-bold">×</button>
          </div>
        )}

        {successMsg && (
          <div className="mb-6 rounded-2xl bg-emerald-50 p-4 text-xs text-emerald-800 flex items-center gap-2 border border-emerald-200 shadow-xs">
            <CheckCircle2 size={16} className="shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[#edf7e8] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#2d6130] border border-[#d2ecc8]">
                Cooperative Hub
              </span>
              <span className="flex items-center gap-1 text-xs font-semibold text-[#57655d]">
                <ShieldCheck size={14} className="text-[#2a7a33]" /> Farmer Representation &amp; Permissions
              </span>
            </div>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl text-[#10251d]">
              Cooperative Association &amp; Delegation Hub
            </h1>
            <p className="mt-1 text-sm text-[#57655d]">
              Search for your cooperative by email or phone number, associate with them, and grant permissions to manage your farms, certificates, inventory, and trades.
            </p>
          </div>
        </div>

        {/* Search Cooperative Card */}
        <div className="rounded-3xl border border-[#dfe7d8] bg-white p-6 sm:p-8 shadow-sm mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#edf7e8] text-[#2d6130]">
              <Search size={24} />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-[#10251d]">Find and Connect with Your Cooperative</h2>
              <p className="text-xs text-[#57655d]">Enter the cooperative's official email address, phone number, or name to search.</p>
            </div>
          </div>

          <form onSubmit={handleSearchCooperative} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-4 top-3.5 text-[#57655d]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="e.g. info@mamfecentral-coop.cm or +237 677..."
                required
                className="w-full rounded-2xl border border-[#dfe7d8] bg-[#fafcf9] py-3 pl-11 pr-4 text-xs font-medium text-[#10251d] outline-none focus:border-[#2d6130]"
              />
            </div>
            <button
              type="submit"
              disabled={searching}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#0b3528] px-6 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-[#144737] disabled:opacity-50 cursor-pointer"
            >
              {searching ? <RefreshCw size={15} className="animate-spin" /> : <Search size={15} />}
              Search Cooperative
            </button>
          </form>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="mt-6 space-y-3 border-t border-[#edf1ea] pt-6">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#6f7e73]">Search Results ({searchResults.length})</h3>
              <div className="grid gap-3">
                {searchResults.map((org) => {
                  const isAlreadyAssociated = associations.some((a) => a.cooperativeOrgId === org.id);
                  return (
                    <div key={org.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl border border-[#dfe7d8] bg-[#fafcf9] p-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-[#10251d]">{org.name}</span>
                          <span className="rounded-full bg-[#edf7e8] px-2 py-0.5 text-[10px] font-bold text-[#2d6130]">{org.registrationNumber}</span>
                        </div>
                        <p className="mt-1 text-xs text-[#57655d]">
                          {org.headquartersAddress} • {org.region} • <strong>{org.contactEmail}</strong> • {org.contactPhone}
                        </p>
                      </div>
                      <div>
                        {isAlreadyAssociated ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3.5 py-1.5 text-xs font-bold text-emerald-800">
                            <CheckCircle2 size={14} /> Associated
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleAssociate(org)}
                            className="inline-flex items-center gap-1.5 rounded-full bg-[#2a7a33] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#1f5c27] cursor-pointer"
                          >
                            <Plus size={14} /> Associate Cooperative
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

        {/* Associated Cooperatives & Permissions */}
        <div className="rounded-3xl border border-[#dfe7d8] bg-white p-6 sm:p-8 shadow-sm">
          <div className="flex items-center justify-between border-b border-[#edf1ea] pb-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#edf7e8] text-[#2d6130]">
                <Building2 size={20} />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-[#10251d]">Your Associated Cooperatives &amp; Delegation Permissions</h3>
                <p className="text-xs text-[#57655d]">Cooperatives authorized to manage your farms, certificates, inventory, and trades.</p>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="py-12 text-center text-xs text-[#57655d]">
              <RefreshCw size={20} className="animate-spin inline-block mr-2 text-[#2d6130]" /> Loading associations...
            </div>
          ) : associations.length === 0 ? (
            <div className="py-12 text-center rounded-2xl border border-dashed border-[#dfe7d8] bg-[#fafcf9] p-8">
              <Store size={32} className="mx-auto text-[#8b998f]" />
              <h4 className="mt-3 font-bold text-sm text-[#10251d]">No Cooperatives Associated Yet</h4>
              <p className="mt-1 max-w-sm mx-auto text-xs text-[#57655d]">
                Use the search box above to find and associate with your cooperative organization.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {associations.map((assoc) => (
                <div key={assoc.associationId} className="rounded-2xl border border-[#dfe7d8] bg-[#fbfdfa] p-6 shadow-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#edf1ea] pb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-extrabold text-[#10251d]">{assoc.cooperativeOrgName}</span>
                        <span className="rounded-full bg-[#eefae6] px-2.5 py-0.5 text-[10px] font-bold text-[#2a7a33]">Active Association</span>
                      </div>
                      <p className="mt-1 text-xs text-[#57655d]">
                        Email: <strong>{assoc.cooperativeEmail}</strong> • Phone: {assoc.cooperativePhone} • Associated: {new Date(assoc.associatedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  {/* Permissions Checklist */}
                  <div className="mt-5">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#6f7e73] mb-3 flex items-center gap-1.5">
                      <Lock size={13} className="text-[#2d6130]" /> Delegated Management Permissions (Cooperative Action Rights)
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <label className="flex items-center gap-2.5 rounded-xl border border-[#dfe7d8] bg-white p-3 cursor-pointer hover:border-[#2d6130] transition">
                        <input
                          type="checkbox"
                          checked={assoc.permissions.farmsManagement}
                          onChange={() => handleTogglePermission(assoc, "farmsManagement")}
                          className="rounded text-[#2d6130] focus:ring-[#2d6130]"
                        />
                        <span className="text-xs font-bold text-[#10251d]">Farms Management</span>
                      </label>
                      <label className="flex items-center gap-2.5 rounded-xl border border-[#dfe7d8] bg-white p-3 cursor-pointer hover:border-[#2d6130] transition">
                        <input
                          type="checkbox"
                          checked={assoc.permissions.certificatesManagement}
                          onChange={() => handleTogglePermission(assoc, "certificatesManagement")}
                          className="rounded text-[#2d6130] focus:ring-[#2d6130]"
                        />
                        <span className="text-xs font-bold text-[#10251d]">Certificates Management</span>
                      </label>
                      <label className="flex items-center gap-2.5 rounded-xl border border-[#dfe7d8] bg-white p-3 cursor-pointer hover:border-[#2d6130] transition">
                        <input
                          type="checkbox"
                          checked={assoc.permissions.productionInventory}
                          onChange={() => handleTogglePermission(assoc, "productionInventory")}
                          className="rounded text-[#2d6130] focus:ring-[#2d6130]"
                        />
                        <span className="text-xs font-bold text-[#10251d]">Production &amp; Inventory</span>
                      </label>
                      <label className="flex items-center gap-2.5 rounded-xl border border-[#dfe7d8] bg-white p-3 cursor-pointer hover:border-[#2d6130] transition">
                        <input
                          type="checkbox"
                          checked={assoc.permissions.tradingManagement}
                          onChange={() => handleTogglePermission(assoc, "tradingManagement")}
                          className="rounded text-[#2d6130] focus:ring-[#2d6130]"
                        />
                        <span className="text-xs font-bold text-[#10251d]">Trading &amp; Marketplace</span>
                      </label>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
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
    <div className="rounded-3xl border border-[#dfe7d8] bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className="flex items-center justify-between text-[#57655d]">
        <span className="text-xs font-semibold">{label}</span>
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#edf7e8] text-[#2d6130]">
          {icon}
        </div>
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="text-2xl font-black text-[#10251d]">{value}</span>
        {unit && <span className="text-xs text-[#57655d]">{unit}</span>}
      </div>
      <p className="mt-1 text-[0.7rem] text-[#6f7e73]">{description}</p>
    </div>
  );
}
