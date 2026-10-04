"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Globe2, Menu, X } from "lucide-react";
import { useState } from "react";
import { useFirebase } from "@/context/FirebaseContext";

export function Navbar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { user, logout } = useFirebase();

  const links = [
    ["Home", "/"],
    ["Marketplace", "/marketplace"],
    ...(user ? [["Dashboard", "/dashboard"]] : []),
    ["For Farmers", user ? "/dashboard" : "/signup"],
    ["Traceability", "/marketplace"],
    ["Portal", "/login"],
  ];

  return (
    <header className="fixed left-0 right-0 top-0 z-50 border-b border-white/15 bg-[#062d22]/85 backdrop-blur-xl">
      <div className="w-full px-5 sm:px-7 lg:px-10">
        <nav className="flex h-20 items-center justify-between gap-4 lg:gap-8 shadow-[0_8px_30px_rgba(2,18,14,0.25)]">
          
          {/* Left: Brand Logo */}
          <div className="flex shrink-0 items-center">
            <Link href="/" className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#b8f58b] shadow-[0_12px_25px_rgba(184,245,139,0.30)]">
                <span className="text-xl">🌿</span>
              </div>

              <div>
                <div className="text-base font-bold tracking-tight text-white!">CocoaTrace</div>
                <div className="text-[9px] uppercase tracking-[0.18em] text-white/60">From Farm to World</div>
              </div>
            </Link>
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
                defaultValue="en"
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

            {user ? (
              <div className="flex items-center gap-2.5">
                <span className="text-xs font-semibold text-white/80 max-w-[110px] truncate whitespace-nowrap">
                  {user.displayName || user.email}
                </span>
                <button
                  type="button"
                  onClick={() => logout()}
                  className="rounded-full border border-white/25 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-white! transition hover:bg-white/10 cursor-pointer whitespace-nowrap"
                >
                  Log out
                </button>
              </div>
            ) : (
              <Link href="/login" className="rounded-full border border-white/25 bg-white/5 px-4 py-2 text-xs font-medium text-white! transition hover:bg-white/10 whitespace-nowrap">
                Login
              </Link>
            )}

            <Link href="/signup" className="rounded-full bg-[#b8f58b] px-4 py-2 text-xs font-semibold text-[#0a3021] shadow-[0_12px_24px_rgba(184,245,139,0.22)] transition hover:bg-[#d0ffb0] whitespace-nowrap">
              Register Your Farm
            </Link>
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
                {user ? (
                  <button
                    type="button"
                    onClick={() => {
                      logout();
                      setOpen(false);
                    }}
                    className="text-left text-sm text-red-300 py-1"
                  >
                    Log out ({user.displayName || user.email})
                  </button>
                ) : (
                  <Link href="/login" className="text-white! text-sm py-1" onClick={() => setOpen(false)}>
                    Login to Account
                  </Link>
                )}

                <Link href="/signup" className="rounded-full bg-[#b8f58b] px-5 py-3 text-center font-semibold text-[#073b2b] text-sm" onClick={() => setOpen(false)}>
                  Register Your Farm
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
