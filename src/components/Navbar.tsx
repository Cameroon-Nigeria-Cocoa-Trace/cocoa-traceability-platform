/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Globe2, Menu, X } from "lucide-react";
import { useFirebase } from "@/context/FirebaseContext";
import { SliteNavbarBrand } from "@/components/SliteLogo";
import { useLanguage, type Language } from "@/context/LanguageContext";

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const { user, logout, isCooperative, userRole } = useFirebase();
  const { language, setLanguage, t } = useLanguage();

  useEffect(() => {
    setMounted(true);
  }, []);

  const effectiveUser = mounted ? user : null;
  const isWarehouse = mounted ? userRole === "warehouse" : false;
  const isCoop = (mounted ? isCooperative : false) || (mounted ? userRole === "cooperative" : false);
  const isAgent = mounted ? userRole === "agent" : false;
  const dashboardHref = isWarehouse
    ? "/dashboard/warehouse"
    : isAgent
    ? "/dashboard/agent"
    : isCoop
    ? "/dashboard/cooperative"
    : "/dashboard";

  const links = [
    [t("nav.home", "Home"), "/"],
    [t("nav.marketplace", "Marketplace"), "/marketplace"],
    ...(effectiveUser ? [[t("nav.dashboard", "Dashboard"), dashboardHref]] : []),
    ...(isWarehouse
      ? [[t("nav.warehouse", "Warehouse Workspace"), "/dashboard/warehouse"]]
      : isAgent
      ? [[t("nav.agent", "Agent Workspace"), "/dashboard/agent"]]
      : isCoop
      ? [[t("nav.cooperative", "Cooperative Workspace"), "/dashboard/cooperative"]]
      : [[t("nav.farmers", "For Farmers"), effectiveUser ? "/dashboard" : "/signup"]]),
    [t("nav.traceability", "Traceability"), "/marketplace"],
    [t("nav.portal", "Portal"), "/login"],
  ];

  return (
    <header className="fixed left-0 right-0 top-0 z-50 border-b border-white/15 bg-[#062d22]/85 backdrop-blur-xl">
      <div className="w-full px-5 sm:px-7 lg:px-10">
        <nav className="flex h-20 items-center justify-between gap-4 lg:gap-8 shadow-[0_8px_30px_rgba(2,18,14,0.25)]">
          
          {/* Left: Brand Logo */}
          <div className="flex shrink-0 items-center">
            <SliteNavbarBrand />
          </div>

          {/* Center: Main Navigation Links (No wrapping, flexible spacing) */}
          <div className="hidden lg:flex items-center justify-center gap-5 xl:gap-8">
            {links.map(([label, href]) => {
              const isActive = pathname === href;

              return (
                <Link
                  key={label}
                  href={href}
                  className={[
                    "relative text-sm font-medium whitespace-nowrap transition duration-200",
                    isActive
                      ? "text-white! font-semibold after:absolute after:-bottom-2 after:left-0 after:h-0.5 after:w-full after:rounded-full after:bg-[#b8f58b]"
                      : "text-white! opacity-80 hover:opacity-100 hover:text-[#b8f58b]!",
                  ].join(" ")}
                >
                  {label}
                </Link>
              );
            })}
          </div>

          {/* Right: Language Selection, Login & CTA Button */}
          <div className="hidden lg:flex shrink-0 items-center justify-end gap-3">
            <div className="group relative flex items-center rounded-full px-2.5 py-2 text-sm font-medium text-white/90 transition duration-200 hover:bg-white/10 hover:text-white cursor-pointer">
              <Globe2 size={16} className="text-white/70 group-hover:text-[#b8f58b] transition-colors duration-200" />
              
              <select 
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
                className="bg-transparent pl-1.5 pr-4 font-semibold appearance-none cursor-pointer outline-none border-none text-white! focus:ring-0 [&>option]:bg-[#062d22] [&>option]:text-white! [&>option]:py-2 text-xs"
                aria-label="Select Language"
              >
                <option value="en">EN</option>
                <option value="fr">FR</option>
              </select>
  
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                viewBox="0 0 20 20" 
                fill="currentColor" 
                className="absolute right-2 h-3.5 w-3.5 text-white/50 group-hover:text-[#b8f58b] pointer-events-none transition-transform duration-200 group-hover:translate-y-0.5"
              >
                <path 
                  fillRule="evenodd" 
                  d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" 
                  clipRule="evenodd" 
                />
              </svg>
            </div>

            {effectiveUser ? (
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold border whitespace-nowrap ${
                    isWarehouse
                      ? "bg-teal-400/20 text-teal-300 border-teal-400/40"
                      : isAgent
                      ? "bg-amber-400/20 text-amber-300 border-amber-400/40"
                      : isCoop
                      ? "bg-[#b8f58b]/20 text-[#b8f58b] border-[#b8f58b]/30"
                      : "bg-[#2d6130]/40 text-[#b8f58b] border-[#2d6130]"
                  }`}
                >
                  {isWarehouse ? t("role.warehouse", "Warehouse") : isAgent ? t("role.agent", "Agent") : isCoop ? t("role.cooperative", "Cooperative") : t("role.farmer", "Farmer")}
                </span>
                <span className="text-xs font-semibold text-white/80 max-w-[110px] truncate whitespace-nowrap">
                  {effectiveUser.displayName || effectiveUser.email}
                </span>
                <button
                  type="button"
                  onClick={() => logout()}
                  className="rounded-full border border-white/25 bg-white/5 px-3 py-1.5 text-xs font-medium text-white! transition hover:bg-white/10 cursor-pointer whitespace-nowrap"
                >
                  {t("nav.logout", "Log out")}
                </button>
              </div>
            ) : (
              <Link href="/login" className="rounded-full border border-white/25 bg-white/5 px-4 py-2 text-xs font-medium text-white! transition hover:bg-white/10 whitespace-nowrap">
                {t("nav.login", "Login")}
              </Link>
            )}

            {effectiveUser ? (
              isWarehouse ? (
                <Link href="/dashboard/warehouse" className="rounded-full bg-[#b8f58b] px-4 py-2 text-xs font-semibold text-[#0a3021] shadow-[0_12px_24px_rgba(184,245,139,0.22)] transition hover:bg-[#d0ffb0] whitespace-nowrap">
                  {t("nav.warehouse", "Warehouse Workspace")}
                </Link>
              ) : isAgent ? (
                <Link href="/dashboard/agent" className="rounded-full bg-[#b8f58b] px-4 py-2 text-xs font-semibold text-[#0a3021] shadow-[0_12px_24px_rgba(184,245,139,0.22)] transition hover:bg-[#d0ffb0] whitespace-nowrap">
                  {t("nav.agent", "Agent Workspace")}
                </Link>
              ) : isCoop ? (
                <Link href="/dashboard/cooperative" className="rounded-full bg-[#b8f58b] px-4 py-2 text-xs font-semibold text-[#0a3021] shadow-[0_12px_24px_rgba(184,245,139,0.22)] transition hover:bg-[#d0ffb0] whitespace-nowrap">
                  {t("nav.cooperative", "Cooperative Workspace")}
                </Link>
              ) : (
                <Link href="/dashboard" className="rounded-full bg-[#b8f58b] px-4 py-2 text-xs font-semibold text-[#0a3021] shadow-[0_12px_24px_rgba(184,245,139,0.22)] transition hover:bg-[#d0ffb0] whitespace-nowrap">
                  {t("nav.farmer_workspace", "Farmer Workspace")}
                </Link>
              )
            ) : (
              <Link href="/signup" className="rounded-full bg-[#b8f58b] px-4 py-2 text-xs font-semibold text-[#0a3021] shadow-[0_12px_24px_rgba(184,245,139,0.22)] transition hover:bg-[#d0ffb0] whitespace-nowrap">
                {t("nav.register_farm", "Register Your Farm")}
              </Link>
            )}
          </div>

          {/* Mobile Menu Trigger */}
          <div className="flex justify-end lg:hidden">
            <button type="button" onClick={() => setOpen(!open)} className="text-white! cursor-pointer p-1" aria-label="Toggle navigation menu">
              {open ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </nav>

        {/* Mobile Dropdown Panel */}
        {open && (
          <div className="mb-5 mt-2 rounded-2xl border border-white/10 bg-[#073b2b]/98 p-6 shadow-[0_20px_35px_rgba(5,22,17,0.28)] lg:hidden">
            <div className="flex flex-col gap-4">
              {links.map(([label, href]) => (
                <Link key={label} href={href} onClick={() => setOpen(false)} className="text-white! text-sm font-medium py-1 whitespace-nowrap">
                  {label}
                </Link>
              ))}

              <div className="border-t border-white/10 pt-4 flex flex-col gap-3">
                <div className="flex items-center justify-between pb-2 border-b border-white/10">
                  <span className="text-xs text-white/70 flex items-center gap-1.5">
                    <Globe2 size={14} /> {language === "fr" ? "Langue" : "Language"}
                  </span>
                  <div className="flex items-center gap-1.5 bg-black/20 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setLanguage("en")}
                      className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                        language === "en"
                          ? "bg-[#b8f58b] text-[#073b2b]"
                          : "text-white/70 hover:text-white"
                      }`}
                    >
                      EN
                    </button>
                    <button
                      type="button"
                      onClick={() => setLanguage("fr")}
                      className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                        language === "fr"
                          ? "bg-[#b8f58b] text-[#073b2b]"
                          : "text-white/70 hover:text-white"
                      }`}
                    >
                      FR
                    </button>
                  </div>
                </div>

                {effectiveUser ? (
                  <button
                    type="button"
                    onClick={() => {
                      logout();
                      setOpen(false);
                    }}
                    className="text-left text-sm text-red-300 py-1"
                  >
                    {t("nav.logout", "Log out")} ({effectiveUser.displayName || effectiveUser.email})
                  </button>
                ) : (
                  <Link href="/login" className="text-white! text-sm py-1" onClick={() => setOpen(false)}>
                    {t("nav.login", "Login to Account")}
                  </Link>
                )}

                <Link href="/signup" className="rounded-full bg-[#b8f58b] px-5 py-3 text-center font-semibold text-[#073b2b] text-sm" onClick={() => setOpen(false)}>
                  {t("nav.register_farm", "Register Your Farm")}
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
