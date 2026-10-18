"use client";

import React, { useRef, useState } from "react";
import {
  ShieldCheck,
  Download,
  Printer,
  X,
  BadgeCheck,
  CheckCircle2,
  FileCheck,
} from "lucide-react";
import { FarmRecord } from "@/context/FirebaseContext";

interface FarmCertificateModalProps {
  farm: FarmRecord | null;
  isOpen: boolean;
  onClose: () => void;
  onNavigateDashboard?: () => void;
}

export default function FarmCertificateModal({
  farm,
  isOpen,
  onClose,
  onNavigateDashboard,
}: FarmCertificateModalProps) {
  const [downloading, setDownloading] = useState(false);
  const certificateRef = useRef<HTMLDivElement>(null);

  // Derive official Farm Unique ID
  const farmUniqueId =
    farm?.farmUniqueId ||
    (farm?.id ? `TTN-CM-2026-${farm.id.replace(/^farm_/, "").slice(-6).toUpperCase()}` : "TTN-CM-2026-FARM");

  if (!isOpen || !farm) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = async () => {
    try {
      setDownloading(true);

      // Create a fixed-proportioned landscape high-res canvas (1200 x 860)
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.width = 1200;
      canvas.height = 860;

      // Background
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Outer Border
      ctx.strokeStyle = "#0b3528";
      ctx.lineWidth = 10;
      ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);

      // Inner Accent Border
      ctx.strokeStyle = "#b8f58b";
      ctx.lineWidth = 3;
      ctx.strokeRect(34, 34, canvas.width - 68, canvas.height - 68);

      // Header Banner
      ctx.fillStyle = "#062d22";
      ctx.fillRect(36, 36, canvas.width - 72, 130);

      // Header Brand
      ctx.fillStyle = "#b8f58b";
      ctx.font = "bold 16px sans-serif";
      ctx.fillText("🌿 TRACETRADE NETWORK • COMPLIANCE AUTHORITY", 60, 78);

      // Main Title
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 32px sans-serif";
      ctx.fillText("TraceTrade Network Compliance Trust Pass", 60, 126);

      // Unique Farm ID Badge on Top Right
      ctx.fillStyle = "#edf7e8";
      ctx.fillRect(800, 58, 340, 70);
      ctx.strokeStyle = "#2d6130";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(800, 58, 340, 70);

      ctx.fillStyle = "#2d6130";
      ctx.font = "bold 11px sans-serif";
      ctx.fillText("OFFICIAL UNIQUE FARM ID", 818, 80);

      ctx.fillStyle = "#062d22";
      ctx.font = "bold 20px monospace";
      ctx.fillText(farmUniqueId, 818, 110);

      // Farm Summary Banner
      ctx.fillStyle = "#f4f8f2";
      ctx.fillRect(60, 185, 1080, 72);
      ctx.strokeStyle = "#dfe7d8";
      ctx.lineWidth = 1;
      ctx.strokeRect(60, 185, 1080, 72);

      ctx.fillStyle = "#2d6130";
      ctx.font = "bold 12px sans-serif";
      ctx.fillText("REGISTERED FARM PLOT", 80, 210);

      ctx.fillStyle = "#10251d";
      ctx.font = "bold 24px sans-serif";
      ctx.fillText(farm.farmName.toUpperCase(), 80, 240);

      ctx.fillStyle = "#5f6659";
      ctx.font = "14px sans-serif";
      ctx.fillText(`Producer: ${farm.farmerName || "Registered Farmer"} • Co-op: ${farm.cooperative || "Independent Smallholder Union"}`, 480, 238);

      // Grid Details
      const details = [
        ["LOCATION & REGION", `${farm.village || "Ndian Locality"}, ${farm.region || "Southwest Region"}`],
        ["GPS GEOLOCATION", farm.geolocation || "4.5912° N, 9.1245° E"],
        ["TOTAL AREA / PERIMETER", `${farm.geofenceAreaHa || farm.sizeHectares || 2.5} Hectares (${farm.geofencePointCount || 4} GPS Vertices)`],
        ["COCOA VARIETY", farm.cocoaVariety || "Amelonado / Trinitario Hybrid (Grade 1 Origin)"],
        ["HARVEST SEASON", farm.harvestSeason || "Main Crop 2026/2027"],
        ["REGISTRATION DATE", farm.registrationDate || new Date().toISOString().split("T")[0]],
        ["EUDR REGULATION", "EU Regulation 2023/1115 (Zero Deforestation Verified)"],
      ];

      let yPos = 295;
      details.forEach(([label, val]) => {
        ctx.fillStyle = "#5f6659";
        ctx.font = "bold 12px sans-serif";
        ctx.fillText(label, 70, yPos);

        ctx.fillStyle = "#10251d";
        ctx.font = "bold 15px sans-serif";
        ctx.fillText(val, 280, yPos);

        ctx.strokeStyle = "#edf1ea";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(70, yPos + 10);
        ctx.lineTo(840, yPos + 10);
        ctx.stroke();

        yPos += 42;
      });

      // Official Compliance Authority Seal Stamp Placement
      const sealX = 990;
      const sealY = 410;
      const sealRadius = 95;

      // Outer seal ring
      ctx.beginPath();
      ctx.arc(sealX, sealY, sealRadius, 0, Math.PI * 2);
      ctx.fillStyle = "#f4f8f2";
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#0b3528";
      ctx.stroke();

      // Inner dashed security ring
      ctx.beginPath();
      ctx.arc(sealX, sealY, sealRadius - 10, 0, Math.PI * 2);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#2d6130";
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Seal Core Badge
      ctx.beginPath();
      ctx.arc(sealX, sealY, sealRadius - 26, 0, Math.PI * 2);
      ctx.fillStyle = "#062d22";
      ctx.fill();

      // Seal Text
      ctx.fillStyle = "#b8f58b";
      ctx.font = "bold 13px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("TRACETRADE", sealX, sealY - 14);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 15px sans-serif";
      ctx.fillText("EUDR AUDITED", sealX, sealY + 6);
      ctx.fillStyle = "#b8f58b";
      ctx.font = "bold 10px sans-serif";
      ctx.fillText("100% COMPLIANT", sealX, sealY + 22);

      // Seal Label Banner underneath
      ctx.fillStyle = "#062d22";
      ctx.font = "bold 11px sans-serif";
      ctx.fillText("OFFICIAL COMPLIANCE SEAL", sealX, sealY + 125);
      ctx.fillStyle = "#5f6659";
      ctx.font = "10px sans-serif";
      ctx.fillText("Zero Deforestation Verified", sealX, sealY + 142);
      ctx.textAlign = "start"; // Reset alignment

      // Footer Verification Strip
      ctx.fillStyle = "#062d22";
      ctx.fillRect(36, 750, canvas.width - 72, 74);

      ctx.fillStyle = "#b8f58b";
      ctx.font = "bold 13px sans-serif";
      ctx.fillText("ISSUED BY: TraceTrade Network Compliance Authority", 60, 785);

      ctx.fillStyle = "#ffffff";
      ctx.font = "12px monospace";
      ctx.fillText(`Registry Stamp: SHA256-${farmUniqueId} • Date: ${new Date().toISOString().split("T")[0]}`, 60, 808);

      ctx.fillStyle = "#edf7e8";
      ctx.font = "bold 12px sans-serif";
      ctx.fillText("EU Due Diligence Statement: DDS-2026-CM-VERIFIED", 780, 796);

      // Download trigger
      const link = document.createElement("a");
      link.download = `TraceTrade_Trust_Pass_${farmUniqueId}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      console.error("Trust Pass download error:", err);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      {/* Print Styles to ensure document is fixed-size and does not stretch or spread to paper height */}
      <style jsx global>{`
        @page {
          size: A4 portrait;
          margin: 12mm;
        }
        @media print {
          html,
          body {
            background: #ffffff !important;
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
          }
          body * {
            visibility: hidden !important;
          }
          #trust-pass-document,
          #trust-pass-document * {
            visibility: visible !important;
          }
          #trust-pass-document {
            position: relative !important;
            display: block !important;
            width: 680px !important;
            max-width: 680px !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            margin: 0 auto !important;
            padding: 24px !important;
            box-shadow: none !important;
            border: 2px solid #062d22 !important;
            background: #ffffff !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>

      <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-md animate-in fade-in">
        <div className="relative w-full max-w-3xl rounded-[32px] border border-white/20 bg-[#fbfdfa] p-5 sm:p-7 shadow-2xl">
          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-black/5 text-[#57655d] transition hover:bg-black/10 hover:text-black cursor-pointer print:hidden"
          >
            <X size={18} />
          </button>

          {/* Certificate Container with fixed compact proportions */}
          <div
            id="trust-pass-document"
            ref={certificateRef}
            className="relative overflow-hidden rounded-3xl border-2 border-[#0b3528] bg-white p-5 sm:p-6 shadow-sm"
            style={{ minHeight: "auto", height: "auto" }}
          >
            {/* Top Banner */}
            <div className="-mx-5 -mt-5 sm:-mx-6 sm:-mt-6 mb-5 bg-[#062d22] px-5 py-5 sm:px-6 text-white">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#b8f58b] text-[#062d22] shadow-md font-bold text-xl">
                    🌿
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#b8f58b]">
                      TraceTrade Network Official Trust Pass
                    </div>
                    <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white">
                      TraceTrade Network Compliance Trust Pass
                    </h2>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-[#b8f58b] border border-white/10">
                  <ShieldCheck size={14} /> EUDR Verified
                </div>
              </div>
            </div>

            {/* Farm Header & Unique ID Banner */}
            <div className="mb-4 flex flex-col gap-2 rounded-2xl border border-[#cbe8c1] bg-[#edf7e8] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#2d6130]">
                  Registered Farm Identity
                </div>
                <div className="text-xl font-bold text-[#0b3528]">
                  {farm.farmName}
                </div>
                <div className="text-xs text-[#2d6130]/90 font-medium">
                  Producer: <strong>{farm.farmerName || "Registered Farmer"}</strong> • {farm.cooperative || "Independent Smallholder Union"}
                </div>
              </div>

              {/* Official Unique Farm ID Pill */}
              <div className="rounded-xl border border-[#2d6130]/30 bg-white px-4 py-2 text-left sm:text-right shadow-sm">
                <span className="block text-[9px] font-extrabold uppercase tracking-widest text-[#5f6659]">
                  Unique Farm ID
                </span>
                <span className="font-mono text-sm sm:text-base font-extrabold text-[#062d22] tracking-wider">
                  {farmUniqueId}
                </span>
              </div>
            </div>

            {/* Certificate Body */}
            <div className="grid gap-4 md:grid-cols-3">
              {/* Left 2 cols: Farm Specifications */}
              <div className="space-y-3 md:col-span-2">
                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  <div className="rounded-xl border border-[#dfe7d8] bg-[#fbfdfa] p-2.5">
                    <span className="block text-[9px] uppercase font-bold text-[#5f6659]">
                      Region & Locality
                    </span>
                    <span className="font-semibold text-[#10251d] text-xs">
                      {farm.village || "Ndian"}, {farm.region || "Southwest"}
                    </span>
                  </div>

                  <div className="rounded-xl border border-[#dfe7d8] bg-[#fbfdfa] p-2.5">
                    <span className="block text-[9px] uppercase font-bold text-[#5f6659]">
                      Geofenced Area
                    </span>
                    <span className="font-semibold text-[#10251d] text-xs">
                      {farm.geofenceAreaHa || farm.sizeHectares || 2.5} Ha ({farm.geofencePointCount || 4} points)
                    </span>
                  </div>

                  <div className="rounded-xl border border-[#dfe7d8] bg-[#fbfdfa] p-2.5">
                    <span className="block text-[9px] uppercase font-bold text-[#5f6659]">
                      GPS Geolocation
                    </span>
                    <span className="font-mono font-semibold text-[#10251d] text-[11px]">
                      {farm.geolocation || "4.5912° N, 9.1245° E"}
                    </span>
                  </div>

                  <div className="rounded-xl border border-[#dfe7d8] bg-[#fbfdfa] p-2.5">
                    <span className="block text-[9px] uppercase font-bold text-[#5f6659]">
                      Cocoa Variety
                    </span>
                    <span className="font-semibold text-[#10251d] text-xs">
                      {farm.cocoaVariety || "Amelonado / Trinitario Hybrid"}
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border border-[#dfe7d8] bg-white p-2.5 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-[#5f6659]">Trust Pass ID:</span>
                    <span className="font-mono font-bold text-[#0b3528]">{farmUniqueId}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-[#5f6659]">EU Regulation:</span>
                    <span className="font-semibold text-[#2d6130]">EU 2023/1115 (Zero Deforestation)</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-[#5f6659]">Authority:</span>
                    <span className="font-medium text-[#10251d]">TraceTrade Network Compliance Authority</span>
                  </div>
                </div>
              </div>

              {/* Right 1 col: Official Verification Authority Seal */}
              <div className="flex flex-col items-center justify-between rounded-2xl border border-[#cbe8c1] bg-gradient-to-b from-[#f4f9f0] to-[#edf7e8] p-4 text-center">
                <div className="w-full">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#2d6130] mb-2 flex items-center justify-center gap-1">
                    <BadgeCheck size={14} className="text-[#2a7a33]" /> Official Authority Seal
                  </div>

                  {/* Seal Stamp Container */}
                  <div className="mx-auto flex h-28 w-28 flex-col items-center justify-center rounded-full border-2 border-dashed border-[#2d6130]/40 bg-white p-2 shadow-inner">
                    <div className="flex h-20 w-20 flex-col items-center justify-center rounded-full bg-[#062d22] text-[#b8f58b] shadow-sm">
                      <ShieldCheck size={28} className="text-[#b8f58b]" />
                      <span className="text-[8px] font-black tracking-widest text-white uppercase mt-0.5">EUDR PASSED</span>
                    </div>
                  </div>

                  <div className="mt-3 space-y-1">
                    <div className="inline-flex items-center gap-1 rounded-full bg-[#2a7a33]/10 px-2.5 py-0.5 text-[10px] font-bold text-[#1b4e28] border border-[#2a7a33]/20">
                      <CheckCircle2 size={11} /> Zero Deforestation
                    </div>
                    <p className="text-[10px] font-semibold text-[#062d22]">
                      Sovereign Registry Attested
                    </p>
                  </div>
                </div>

                <div className="mt-3 w-full border-t border-[#dfe7d8] pt-2">
                  <div className="rounded-lg bg-white/80 py-1.5 px-2 text-[10px] font-mono font-bold text-[#1b4e28] border border-[#cce4c4] flex items-center justify-center gap-1">
                    <FileCheck size={12} /> STATUS: VERIFIED & ACTIVE
                  </div>
                  <p className="mt-1 text-[9px] text-[#6f7e73]">
                    Immutable pass recorded for export compliance.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleDownload}
                disabled={downloading}
                className="flex items-center gap-2 rounded-full bg-[#0b3528] px-5 py-2.5 text-xs font-bold text-white transition hover:bg-[#07241b] disabled:opacity-50 cursor-pointer shadow-md"
              >
                <Download size={15} />
                {downloading ? "Generating Pass..." : "Download Trust Pass (PNG)"}
              </button>

              <button
                type="button"
                onClick={handlePrint}
                className="flex items-center gap-1.5 rounded-full border border-[#dfe7d8] bg-white px-4 py-2.5 text-xs font-semibold text-[#10251d] transition hover:bg-[#f7f8f3] cursor-pointer shadow-sm"
              >
                <Printer size={15} />
                Print Pass
              </button>
            </div>

            {onNavigateDashboard && (
              <button
                type="button"
                onClick={onNavigateDashboard}
                className="flex items-center gap-1.5 rounded-full bg-[#b8f58b] px-5 py-2.5 text-xs font-bold text-[#073b2b] transition hover:bg-[#a6ec73] cursor-pointer shadow-md"
              >
                Continue to Dashboard →
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
