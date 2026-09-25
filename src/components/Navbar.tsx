"use client";

import Link from "next/link";
import { usePathname } from "next/navigation"; // FIXED: Imported pathname hook for dynamic tracking
import { Globe2, Menu, X } from "lucide-react";
import { useState } from "react";

export function Navbar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname(); // FIXED: Initialized tracking state

  const links = [
    ["Home", "/"],
    ["Marketplace", "/marketplace"],
    ["Traceability", "/marketplace"], // Note: Both maps target /marketplace; matching rule handles this cleanly
    ["For Farmers", "/signup"],
    ["Resources", "/login"],
  ];

  return (
    <header className="fixed left-0 right-0 top-0 z-50 border-b border-white/15 bg-[#062d22]/70 backdrop-blur-xl">
      <div className="w-full px-5 sm:px-7 lg:px-10">
        <nav className="grid grid-cols-2 lg:grid-cols-3 h-20 items-center shadow-[0_8px_30px_rgba(2,18,14,0.25)]">
          
          {/* Left: Logo */}
          <div className="flex justify-start">
            <Link href="/" className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#b8f58b] shadow-[0_12px_25px_rgba(184,245,139,0.30)]">
                <span className="text-xl">🌿</span>
              </div>

              <div>
                <div className="text-base font-bold tracking-tight text-white!">CocoaTrace</div>
                <div className="text-[9px] uppercase tracking-[0.18em] text-white/60">From Farm to World</div>
              </div>
            </Link>
          </div>

          {/* Center: Main Navigation Links */}
          <div className="hidden lg:flex items-center justify-center gap-7">
            {links.map(([label, href]) => {
              // FIXED: Matches against current route dynamically instead of a hardcoded string
              const isActive = pathname === href;

              return (
                <Link
                  key={label}
                  href={href}
                  className={[
                    "relative text-sm font-medium transition duration-200",
                    // FIXED: Using text-white! to bypass global.css color overrides completely
                    isActive
                      ? "text-white! after:absolute after:-bottom-2 after:left-0 after:h-0.5 after:w-full after:rounded-full after:bg-[#b8f58b]"
                      : "text-white! opacity-80 hover:opacity-100 hover:text-[#b8f58b]!",
                  ].join(" ")}
                >
                  {label}
                </Link>
              );
            })}
          </div>

          {/* Right: Language Selection, Login & CTA Button */}
          <div className="hidden lg:flex items-center justify-end gap-3">
            <div className="group relative flex items-center rounded-full px-3 py-2 text-sm font-medium text-white/90 transition duration-200 hover:bg-white/10 hover:text-white cursor-pointer">
              {/* Globe Icon */}
              <Globe2 size={16} className="text-white/70 group-hover:text-[#b8f58b] transition-colors duration-200" />
              
              {/* The Dropdown Menu Selector */}
              <select 
                  defaultValue="en"
                  className="bg-transparent pl-2 pr-4 font-semibold appearance-none cursor-pointer outline-none border-none text-white! focus:ring-0 [&>option]:bg-[#062d22] [&>option]:text-white! [&>option]:py-2"
                  aria-label="Select Language"
              >
                  <option value="en">EN</option>
                  <option value="fr">FR</option>
              </select>
  
              {/* Custom Downward Arrow */}
              <svg 
                  xmlns="http://w3.org" 
                  viewBox="0 0 20 20" 
                  fill="currentColor" 
                  className="absolute right-2.5 h-4 w-4 text-white/50 group-hover:text-[#b8f58b] pointer-events-none transition-transform duration-200 group-hover:translate-y-0.5"
              >
                  <path 
                  fillRule="evenodd" 
                  d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" 
                  clipRule="evenodd" 
                  />
              </svg>
            </div>

            <Link href="/login" className="rounded-full border border-white/25 bg-white/5 px-5 py-2.5 text-sm font-medium text-white! transition hover:bg-white/10">
              Login
            </Link>

            <Link href="/signup" className="rounded-full bg-[#b8f58b] px-5 py-2.5 text-sm font-semibold text-[#0a3021] shadow-[0_12px_24px_rgba(184,245,139,0.22)] transition hover:bg-[#d0ffb0] whitespace-nowrap">
              Register Your Farm
            </Link>
          </div>

          {/* Mobile Menu Trigger */}
          <div className="flex justify-end lg:hidden">
            <button type="button" onClick={() => setOpen(!open)} className="text-white! cursor-pointer" aria-label="Toggle navigation menu">
              {open ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </nav>

        {/* Mobile Dropdown Panel */}
        {open && (
          <div className="mb-5 mt-3 rounded-2xl border border-white/10 bg-[#073b2b]/95 p-6 shadow-[0_20px_35px_rgba(5,22,17,0.28)] lg:hidden">
            <div className="flex flex-col gap-5">
              {links.map(([label, href]) => (
                <Link key={label} href={href} onClick={() => setOpen(false)} className="text-white!">
                  {label}
                </Link>
              ))}

              <Link href="/signup" className="rounded-full bg-[#b8f58b] px-5 py-3 text-center font-semibold text-[#073b2b]" onClick={() => setOpen(false)}>
                Register Your Farm
              </Link>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
