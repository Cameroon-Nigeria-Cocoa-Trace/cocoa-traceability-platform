"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useFirebase } from "@/context/FirebaseContext";
import {
  Compass,
  Sprout,
  Layers,
  Boxes,
  BadgeCheck,
  Building2,
  ArrowLeftRight,
  QrCode,
  Store,
  Handshake,
  CreditCard,
  Clock,
  Sparkles,
  CheckCircle2,
} from "lucide-react";

export interface NavGroupItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  isReady: boolean;
  stageBadge?: string;
  description: string;
}

export interface NavGroup {
  id: string;
  title: string;
  subtitle: string;
  items: NavGroupItem[];
}

export const WORKFLOW_GROUPS: NavGroup[] = [
  {
    id: "farm-management",
    title: "Farm Management",
    subtitle: "Registered plots, GPS polygons & cooperative member directory",
    items: [
      {
        name: "Overview",
        href: "/dashboard",
        icon: Compass,
        isReady: true,
        description: "Farmer plots, geofencing map, and EUDR compliance overview",
      },
      {
        name: "Cooperative Hub",
        href: "/dashboard/cooperatives",
        icon: Store,
        isReady: true,
        stageBadge: "Role 4",
        description: "Link cooperatives to your farm, delegate single/all farm management & operational authority",
      },
    ],
  },
  {
    id: "cooperative-management",
    title: "Production & Inventory",
    subtitle: "Seasonal production periods, collection centers & harvest batches",
    items: [
      {
        name: "Production Records",
        href: "/dashboard/production",
        icon: Sprout,
        isReady: true,
        description: "Seasonal production periods, expected yields, and harvest campaigns",
      },
      {
        name: "Harvest Management",
        href: "/dashboard/harvests",
        icon: Layers,
        isReady: true,
        description: "Logged harvest batches, weight verification, and quality grading",
      },
      {
        name: "Cocoa Lots",
        href: "/dashboard/lots",
        icon: Boxes,
        isReady: true,
        description: "Traceable cocoa inventory, physical lot allocations, and specifications",
      },
    ],
  },
  {
    id: "traceability-certification",
    title: "Traceability & Certification",
    subtitle: "Origin certificates, custody units & bag QR codes",
    items: [
      {
        name: "Origin Certificates",
        href: "/dashboard/certificates",
        icon: BadgeCheck,
        isReady: true,
        stageBadge: "Stage 3",
        description: "Official Cameroon Origin Trace Certificates & lineage",
      },
      {
        name: "Certificate Holdings",
        href: "/dashboard/holdings",
        icon: Building2,
        isReady: true,
        stageBadge: "Stage 3",
        description: "Distinct custody units across supply-chain holders",
      },
      {
        name: "Cocoa Transfers",
        href: "/dashboard/transfers",
        icon: ArrowLeftRight,
        isReady: true,
        stageBadge: "Stage 3",
        description: "Atomic transfers across 6 verified routes and fee rules",
      },
      {
        name: "QR Traceability",
        href: "/dashboard/qr",
        icon: QrCode,
        isReady: true,
        stageBadge: "Stage 4",
        description: "Bag-level permanent QR packages & public consumer trace",
      },
    ],
  },
  {
    id: "cocoa-trade",
    title: "Cocoa Trade",
    subtitle: "Exchange catalog, off-platform sales & payments",
    items: [
      {
        name: "Cocoa Marketplace",
        href: "/marketplace",
        icon: Store,
        isReady: true,
        stageBadge: "Stage 5",
        description: "Certified and uncertified cocoa listing exchange",
      },
      {
        name: "Trade Management",
        href: "/dashboard/trades",
        icon: Handshake,
        isReady: true,
        stageBadge: "Stage 5",
        description: "On-platform purchases & off-platform sale declarations",
      },
      {
        name: "Seller Information & Payments",
        href: "/dashboard/payments",
        icon: CreditCard,
        isReady: false,
        stageBadge: "Stage 5",
        description: "Flutterwave 0.5% seller-info access fee checkout",
      },
    ],
  },
];

interface DashboardWorkflowNavProps {
  currentTab?: string;
  onSelectTab?: (tabId: string) => void;
}

export function DashboardWorkflowNav({
  currentTab = "farm-management",
  onSelectTab,
}: DashboardWorkflowNavProps) {
  const { isCooperative } = useFirebase();
  const normalizedTab = currentTab === "production-inventory" ? "cooperative-management" : currentTab;
  const [selectedGroupOverride, setSelectedGroupOverride] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("active_workflow_group") || null;
    }
    return null;
  });

  const activeGroupId = selectedGroupOverride ?? normalizedTab;
  const activeIndexCalculated = WORKFLOW_GROUPS.findIndex((g) => g.id === activeGroupId);
  const activeGroupIndex = activeIndexCalculated >= 0 ? activeIndexCalculated : 0;

  return (
    <nav
      aria-label="Dashboard Workspaces"
      className="mb-8 rounded-3xl border border-[#dfe7d8] bg-white p-4 sm:p-5 shadow-sm"
    >
      {/* Top Banner: Workspace Selector Pills */}
      <div className="flex flex-col gap-4 pb-5 border-b border-[#edf1ea] md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#062d22] text-[#b8f58b] shadow-md">
            <Sparkles size={22} />
          </div>
          <div>
            <div className="text-xs font-black uppercase tracking-wider text-[#2d6130]">
              Unified Workspace Hub
            </div>
            <div className="text-base sm:text-lg font-black text-[#10251d] mt-0.5">
              Cameroon Cocoa Traceability, Inventory &amp; Trade
            </div>
          </div>
        </div>

        {/* View Switcher Pills */}
        <div className="flex flex-wrap items-center gap-2 bg-[#f7f8f3] p-2 rounded-2xl border border-[#dfe7d8]">
          {WORKFLOW_GROUPS.map((group, index) => {
            const isSelected = activeGroupIndex === index;
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => {
                  setSelectedGroupOverride(group.id);
                  if (typeof window !== "undefined") {
                    localStorage.setItem("active_workflow_group", group.id);
                  }
                  if (onSelectTab) onSelectTab(group.id);
                }}
                className={`
                  rounded-xl px-4 py-2 text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap
                  ${
                    isSelected
                      ? "bg-[#062d22] text-[#b8f58b] shadow-sm scale-105"
                      : "text-[#57655d] hover:text-[#10251d] hover:bg-white/80"
                  }
                `}
              >
                {group.title}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Group Details & Destination Cards */}
      <div className="mt-5">
        {(() => {
          const group = WORKFLOW_GROUPS[activeGroupIndex];
          return (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-base sm:text-lg font-black text-[#10251d] flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2.5">
                    <span>{group.title}</span>
                    <span className="text-xs sm:text-sm font-semibold text-[#57655d]">
                      — {group.subtitle}
                    </span>
                  </h3>
                </div>
              </div>

              {/* Items Grid for this group */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {group.items.map((item) => {
                  const Icon = item.icon;

                  if (item.isReady) {
                    let itemHref = item.href;
                    if (item.name === "Cooperative Hub") {
                      itemHref = isCooperative ? "/dashboard/cooperative" : "/dashboard/cooperatives";
                    } else if (item.href === "/dashboard" && isCooperative) {
                      itemHref = "/dashboard/cooperative";
                    }
                    return (
                      <Link
                        key={item.name}
                        href={itemHref}
                        className="group flex flex-col justify-between rounded-2xl border border-[#dfe7d8] bg-[#fafcf9] p-4 sm:p-5 transition-all hover:border-[#2d6130] hover:bg-white hover:shadow-lg"
                      >
                        <div className="flex items-start gap-3.5">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#edf7e8] text-[#2d6130] transition-colors group-hover:bg-[#062d22] group-hover:text-[#b8f58b]">
                            <Icon size={22} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-black text-[#10251d] group-hover:text-[#062d22]">
                                {item.name}
                              </span>
                              <span className="rounded-full bg-[#edf7e8] p-0.5 text-[#2a7a33]">
                                <CheckCircle2 size={13} />
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-[#57655d] leading-relaxed line-clamp-2">
                              {item.description}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 flex items-center justify-between border-t border-[#edf1ea] pt-3 text-xs font-bold text-[#2d6130]">
                          <span>Active Function</span>
                          <span className="transition-transform group-hover:translate-x-1">
                            Open →
                          </span>
                        </div>
                      </Link>
                    );
                  }

                  return (
                    <div
                      key={item.name}
                      className="flex flex-col justify-between rounded-2xl border border-dashed border-[#dfe7d8] bg-white/60 p-3.5 text-white/50 select-none"
                      title={`${item.name} will be introduced in ${item.stageBadge}`}
                    >
                      <div className="flex items-start gap-3 opacity-70">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                          <Icon size={18} />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-[#57655d]">
                              {item.name}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[11px] text-slate-400 leading-snug line-clamp-2">
                            {item.description}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between border-t border-[#edf1ea] pt-2 text-[10px] font-semibold text-slate-400">
                        <span className="flex items-center gap-1">
                          <Clock size={10} />
                          <span>Coming Soon</span>
                        </span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-600">
                          {item.stageBadge}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>
    </nav>
  );
}
