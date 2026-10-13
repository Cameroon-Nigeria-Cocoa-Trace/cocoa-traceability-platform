"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useFirebase } from "@/context/FirebaseContext";
import {
  LayoutDashboard,
  Sprout,
  Boxes,
  BadgeCheck,
  ArrowLeftRight,
  QrCode,
  Store,
  Handshake,
  CreditCard,
  Menu,
  X,
  ShieldCheck,
  ExternalLink,
  LogOut,
  User,
  Clock,
} from "lucide-react";

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  isReady: boolean;
  badge?: string;
}

const NAV_ITEMS: NavItem[] = [
  {
    name: "Farmer Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    isReady: true,
  },
  {
    name: "Production & Harvests",
    href: "/cocoa/production",
    icon: Sprout,
    isReady: false,
    badge: "Stage 2",
  },
  {
    name: "Cocoa Lots",
    href: "/cocoa/lots",
    icon: Boxes,
    isReady: false,
    badge: "Stage 2",
  },
  {
    name: "Origin Certificates",
    href: "/cocoa/certificates",
    icon: BadgeCheck,
    isReady: false,
    badge: "Stage 3",
  },
  {
    name: "Holdings & Transfers",
    href: "/cocoa/transfers",
    icon: ArrowLeftRight,
    isReady: false,
    badge: "Stage 3",
  },
  {
    name: "QR Traceability",
    href: "/cocoa/qr",
    icon: QrCode,
    isReady: false,
    badge: "Stage 4",
  },
  {
    name: "Cocoa Marketplace",
    href: "/cocoa/marketplace",
    icon: Store,
    isReady: false,
    badge: "Stage 5",
  },
  {
    name: "Trade Management",
    href: "/cocoa/trades",
    icon: Handshake,
    isReady: false,
    badge: "Stage 5",
  },
  {
    name: "Seller Information & Payments",
    href: "/cocoa/payments",
    icon: CreditCard,
    isReady: false,
    badge: "Stage 5",
  },
];

export default function CocoaWorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { user, logout } = useFirebase();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#f7f8f3] text-[#10251d] flex flex-col md:flex-row">
      {/* Mobile Top Header */}
      <header className="md:hidden flex items-center justify-between px-5 py-3.5 bg-[#062d22] text-white border-b border-[#0f4435] sticky top-0 z-40">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#b8f58b] text-[#062d22] font-bold text-sm">
            CT
          </div>
          <div>
            <div className="text-xs font-bold tracking-tight text-white leading-tight">
              Cocoa Traceability & Trade
            </div>
            <div className="text-[10px] text-[#b8f58b]/80 leading-tight">
              Role 3 Workspace
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-1.5 rounded-lg text-white hover:bg-white/10 transition-colors"
          aria-label="Toggle navigation"
        >
          {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </header>

      {/* Sidebar - Desktop fixed / Mobile dropdown */}
      <aside
        className={`
          ${mobileMenuOpen ? "block" : "hidden"}
          md:block md:w-72 lg:w-80 shrink-0 bg-[#062d22] text-white flex flex-col justify-between
          fixed md:sticky top-0 h-screen z-30 border-r border-[#0f4435] overflow-y-auto
        `}
      >
        <div className="p-5 flex flex-col h-full">
          {/* Workspace Branding */}
          <div className="mb-6 pb-5 border-b border-white/10">
            <Link
              href="/cocoa"
              className="flex items-center gap-3 group"
              onClick={() => setMobileMenuOpen(false)}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#b8f58b] text-[#062d22] shadow-[0_4px_16px_rgba(184,245,139,0.25)] transition-transform group-hover:scale-105">
                <ShieldCheck size={22} className="stroke-[2.5]" />
              </div>
              <div>
                <div className="text-sm font-bold tracking-tight text-white group-hover:text-[#b8f58b] transition-colors">
                  Cocoa Trace & Trade
                </div>
                <div className="text-[10px] uppercase tracking-wider text-[#b8f58b] font-semibold">
                  Cameroon — Cross River
                </div>
              </div>
            </Link>
          </div>

          {/* Navigation Items */}
          <nav className="space-y-1 flex-1">
            <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-white/40">
              Workspace Modules
            </div>

            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;

              if (!item.isReady) {
                return (
                  <div
                    key={item.name}
                    className="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium text-white/45 bg-white/[0.02] cursor-not-allowed select-none group"
                    title={`${item.name} will be available in ${item.badge || "future stage"}`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon size={17} className="text-white/30" />
                      <span>{item.name}</span>
                    </div>
                    {item.badge && (
                      <span className="flex items-center gap-1 text-[9px] font-semibold px-2 py-0.5 rounded-full bg-white/5 text-white/50 border border-white/10">
                        <Clock size={10} />
                        {item.badge}
                      </span>
                    )}
                  </div>
                );
              }

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`
                    flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all
                    ${
                      isActive
                        ? "bg-[#b8f58b] text-[#062d22] shadow-[0_4px_14px_rgba(184,245,139,0.2)] font-bold"
                        : "text-white/80 hover:bg-white/10 hover:text-white"
                    }
                  `}
                >
                  <div className="flex items-center gap-3">
                    <Icon size={17} className={isActive ? "text-[#062d22]" : "text-[#b8f58b]"} />
                    <span>{item.name}</span>
                  </div>
                </Link>
              );
            })}
          </nav>

          {/* Bottom Footer & User Profile */}
          <div className="pt-4 mt-4 border-t border-white/10 space-y-3">
            {/* User Session Info */}
            {user ? (
              <div className="rounded-xl bg-white/5 p-3 border border-white/10">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-full bg-[#b8f58b]/20 flex items-center justify-center text-[#b8f58b]">
                    <User size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-white truncate">
                      {user.displayName || "Authenticated User"}
                    </p>
                    <p className="text-[10px] text-white/60 truncate font-mono">
                      {user.email || user.uid}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => logout()}
                  className="mt-2.5 w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-red-300 hover:bg-red-500/10 transition-colors"
                >
                  <LogOut size={13} />
                  Sign Out
                </button>
              </div>
            ) : (
              <div className="rounded-xl bg-white/5 p-3 border border-white/10 text-center">
                <p className="text-[11px] text-white/70 mb-2">Signed out session</p>
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center w-full px-3 py-1.5 rounded-lg bg-[#b8f58b] text-[#062d22] text-xs font-bold hover:bg-[#a6ec75] transition-colors"
                >
                  Sign In to Continue
                </Link>
              </div>
            )}

            {/* Back to Public Home */}
            <Link
              href="/"
              className="flex items-center justify-center gap-1.5 text-[11px] text-white/60 hover:text-white transition-colors py-1"
            >
              <span>Back to Public Platform</span>
              <ExternalLink size={12} />
            </Link>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-5 md:p-8 lg:p-10 max-w-7xl mx-auto w-full">
        {children}
      </main>
    </div>
  );
}
