"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  MapPin,
  Trees,
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
  ChevronDown,
  Clock,
  Sparkles,
  ShieldCheck,
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
    subtitle: "Registered plots, GPS polygons & EUDR compliance",
    items: [
      {
        name: "Overview",
        href: "/dashboard",
        icon: Compass,
        isReady: true,
        description: "Farmer plots, satellite map, and harvest totals",
      },
      {
        name: "Farms",
        href: "/farms",
        icon: Trees,
        isReady: true,
        description: "Registered Cameroon farm holdings and plot dossiers",
      },
      {
        name: "Farm Registration & Geofencing",
        href: "/onboarding",
        icon: MapPin,
        isReady: true,
        description: "5-step GPS boundary walk with canopy multipath filter",
      },
    ],
  },
  {
    id: "production-inventory",
    title: "Production & Inventory",
    subtitle: "Seasons, harvest events & traceable lots",
    items: [
      {
        name: "Production Records",
        href: "/dashboard/production",
        icon: Sprout,
        isReady: false,
        stageBadge: "Stage 2",
        description: "Seasonal production periods and yield estimates",
      },
      {
        name: "Harvest Management",
        href: "/dashboard/harvests",
        icon: Layers,
        isReady: false,
        stageBadge: "Stage 2",
        description: "Logged harvest batches and cumulative volume sync",
      },
      {
        name: "Cocoa Lots",
        href: "/dashboard/lots",
        icon: Boxes,
        isReady: false,
        stageBadge: "Stage 2",
        description: "Traceable cocoa lots with mandatory Cloudinary photos",
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
  const [activeGroupIndex, setActiveGroupIndex] = useState(0);
  const [mobileExpanded, setMobileExpanded] = useState(false);

  return (
    <nav
      aria-label="Dashboard Workspaces"
      className="mb-8 rounded-3xl border border-[#dfe7d8] bg-white p-4 sm:p-5 shadow-sm"
    >
      {/* Top Banner: Workspace Selector Pills */}
      <div className="flex flex-col gap-3 pb-4 border-b border-[#edf1ea] md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#062d22] text-[#b8f58b] shadow-sm">
            <Sparkles size={18} />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-[#2d6130] flex items-center gap-1.5">
              <span>Unified Workspace Hub</span>
              <span className="rounded-full bg-[#edf7e8] px-2 py-0.2 text-[9px] font-extrabold text-[#2a7a33]">
                Role 2 & 3
              </span>
            </div>
            <div className="text-sm font-extrabold text-[#10251d]">
              Cameroon Cocoa Traceability, Inventory & Trade
            </div>
          </div>
        </div>

        {/* View Switcher Pills */}
        <div className="flex flex-wrap items-center gap-1.5 bg-[#f7f8f3] p-1.5 rounded-2xl border border-[#dfe7d8]">
          {WORKFLOW_GROUPS.map((group, index) => {
            const isSelected = activeGroupIndex === index;
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => {
                  setActiveGroupIndex(index);
                  if (onSelectTab) onSelectTab(group.id);
                }}
                className={`
                  rounded-xl px-3 py-1.5 text-xs font-bold transition-all cursor-pointer whitespace-nowrap
                  ${
                    isSelected
                      ? "bg-[#062d22] text-[#b8f58b] shadow-sm scale-100"
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
      <div className="mt-4">
        {(() => {
          const group = WORKFLOW_GROUPS[activeGroupIndex];
          return (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[#10251d] flex items-center gap-2">
                    <span>{group.title}</span>
                    <span className="text-xs font-normal text-[#57655d]">
                      — {group.subtitle}
                    </span>
                  </h3>
                </div>
              </div>

              {/* Items Grid for this group */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {group.items.map((item) => {
                  const Icon = item.icon;

                  if (item.isReady) {
                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        className="group flex flex-col justify-between rounded-2xl border border-[#dfe7d8] bg-[#fafcf9] p-3.5 transition-all hover:border-[#2d6130] hover:bg-white hover:shadow-md"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#edf7e8] text-[#2d6130] transition-colors group-hover:bg-[#062d22] group-hover:text-[#b8f58b]">
                            <Icon size={18} />
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-[#10251d] group-hover:text-[#062d22]">
                                {item.name}
                              </span>
                              <span className="rounded-full bg-[#edf7e8] p-0.5 text-[#2a7a33]">
                                <CheckCircle2 size={11} />
                              </span>
                            </div>
                            <p className="mt-0.5 text-[11px] text-[#57655d] leading-snug line-clamp-2">
                              {item.description}
                            </p>
                          </div>
                        </div>

                        <div className="mt-3 flex items-center justify-between border-t border-[#edf1ea] pt-2 text-[10px] font-bold text-[#2d6130]">
                          <span>Active Function</span>
                          <span className="transition-transform group-hover:translate-x-0.5">
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
