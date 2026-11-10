"use client";

import React from "react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";

interface SliteGlyphProps {
  className?: string;
  color?: string;
  size?: number;
}

/**
 * SliteGlyph: The signature green seedling / figure character mark ('t')
 * extracted from official SLITE brand assets.
 */
export function SliteGlyph({
  className = "w-6 h-10",
  color = "#00d26a",
}: SliteGlyphProps) {
  return (
    <svg
      viewBox="0 0 200 350"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M 100 24 C 124 24 144 44 144 68 C 144 79 139 89 131 96 C 141 94 156 89 170 93 C 185 97 194 109 191 122 C 187 134 172 140 154 139 C 142 138 135 142 133 150 L 133 306 C 133 325 118 340 100 340 C 82 340 67 325 67 306 L 67 150 C 65 142 58 138 46 139 C 28 140 13 134 9 122 C 6 109 15 97 30 93 C 44 89 59 94 69 96 C 61 89 56 79 56 68 C 56 44 76 24 100 24 Z"
        fill={color}
      />
    </svg>
  );
}

/**
 * SliteAppTile: The official app icon tile (navy squircle with centered green figure mark)
 */
export function SliteAppTile({
  size = 40,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <div
      style={{ width: size, height: size }}
      className={`relative shrink-0 flex items-center justify-center rounded-[22%] bg-[#0c1938] shadow-[0_6px_18px_rgba(12,25,56,0.35)] overflow-hidden ${className}`}
    >
      <SliteGlyph className="w-[52%] h-[68%]" color="#00d26a" />
    </div>
  );
}

/**
 * SliteWordmark: Official SLITE Solutions wordmark rendered with Galano Grotesque font styling
 * and the vibrant green 't' seedling mark.
 */
export function SliteWordmark({
  variant = "dark",
  showSolutions = true,
  className = "",
}: {
  variant?: "dark" | "light";
  showSolutions?: boolean;
  className?: string;
}) {
  const isDark = variant === "dark";
  const textColor = isDark ? "text-white" : "text-[#0c1938]";
  const subColor = isDark ? "text-white/75" : "text-[#0c1938]/75";

  return (
    <div
      className={`inline-flex items-end gap-2 select-none leading-none ${className}`}
      style={{
        fontFamily:
          "'Galano Grotesque', 'GalanoGrotesque', 'Plus Jakarta Sans', system-ui, sans-serif",
      }}
    >
      <div className="flex items-center tracking-[-0.04em] leading-none">
        <span className={`text-[26px] font-extrabold ${textColor}`}>sli</span>
        <span className="inline-flex items-center justify-center -mt-[2px] px-0">
          <SliteGlyph className="w-[15px] h-[26px]" color="#00d26a" />
        </span>
        <span className={`text-[26px] font-extrabold ${textColor} -ml-[2.5px]`}>e</span>
      </div>
      {showSolutions && (
        <span
          className={`text-[6.5px] font-semibold uppercase tracking-[0.38em] whitespace-nowrap leading-none pb-[2.5px] ${subColor}`}
        >
          SOLUTIONS
        </span>
      )}
    </div>
  );
}

/**
 * SliteNavbarBrand: Dedicated brand lockup for the main Navigation Header.
 * Combines the navy tile icon, the SLITE wordmark, and the TraceTradeNetwork subtitle.
 */
export function SliteNavbarBrand() {
  const { language } = useLanguage();
  const subtitle =
    language === "fr"
      ? "TraceTradeNetwork - De la Ferme au Monde"
      : "TraceTradeNetwork - From Farm to World";

  return (
    <Link
      href="/"
      className="group flex items-center gap-3 transition-opacity hover:opacity-95"
      aria-label="SLITE Solutions Trace Platform Home"
    >
      <SliteAppTile size={40} className="transition-transform group-hover:scale-105 duration-200" />

      <div className="flex flex-col justify-center">
        <div className="flex items-center">
          <SliteWordmark variant="dark" showSolutions={true} />
        </div>
        <div className="text-[8px] uppercase tracking-[0.14em] text-white/60 font-medium mt-0.5">
          {subtitle}
        </div>
      </div>
    </Link>
  );
}

/**
 * SliteFooterBrand: Brand lockup for the page footer
 */
export function SliteFooterBrand() {
  const { language } = useLanguage();
  const subtitle =
    language === "fr"
      ? "TraceTradeNetwork - De la Ferme au Monde"
      : "TraceTradeNetwork - From Farm to World";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <SliteAppTile size={44} />
        <div>
          <div className="flex items-center">
            <SliteWordmark variant="dark" showSolutions={true} />
          </div>
          <div className="text-[9px] uppercase tracking-[0.14em] text-white/50 font-medium mt-1">
            {subtitle}
          </div>
        </div>
      </div>
    </div>
  );
}
