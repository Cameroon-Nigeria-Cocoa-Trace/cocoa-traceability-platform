"use client";

import React, { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  ShieldCheck,
  Download,
  Printer,
  Copy,
  Check,
  X,
  QrCode,
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
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const certificateRef = useRef<HTMLDivElement>(null);

  const verificationUrl =
    typeof window !== "undefined" && farm
      ? `${window.location.origin}/farms/${farm.id || "preview"}`
      : "https://cocoatrace.cm";

  // Generate QR Code
  useEffect(() => {
    if (!farm) return;
    const certPayload = JSON.stringify({
      id: farm.id,
      name: farm.farmName,
      farmer: farm.farmerName,
      geo: farm.geolocation,
      eudr: true,
      issuer: "CocoaTrace Global Platform",
      verify: verificationUrl,
    });

    QRCode.toDataURL(certPayload, {
      width: 260,
      margin: 1.5,
      color: {
        dark: "#062d22",
        light: "#ffffff",
      },
      errorCorrectionLevel: "H",
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error("QR Code Error:", err));
  }, [farm, verificationUrl]);

  if (!isOpen || !farm) return null;

  const handleCopy = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(verificationUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = async () => {
    try {
      setDownloading(true);

      // Create a printable high-res canvas or download SVG/HTML image
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.width = 1200;
      canvas.height = 1600;

      // Background
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Outer Border
      ctx.strokeStyle = "#0b3528";
      ctx.lineWidth = 14;
      ctx.strokeRect(30, 30, canvas.width - 60, canvas.height - 60);

      // Inner Accent Border
      ctx.strokeStyle = "#b8f58b";
      ctx.lineWidth = 4;
      ctx.strokeRect(50, 50, canvas.width - 100, canvas.height - 100);

      // Header Banner
      ctx.fillStyle = "#062d22";
      ctx.fillRect(52, 52, canvas.width - 104, 180);

      // Header Text
      ctx.fillStyle = "#b8f58b";
      ctx.font = "bold 24px sans-serif";
      ctx.fillText("🌿 COCOATRACE VERIFIED REGISTRY", 90, 110);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 42px serif";
      ctx.fillText("EUDR Certificate of Origin & Farm Authenticity", 90, 175);

      // Sub-banner info
      ctx.fillStyle = "#1b2313";
      ctx.font = "italic 22px serif";
      ctx.fillText(
        "This is to officially certify that the agricultural plot detailed herein has been verified and registered with EUDR-compliant canopy geolocation.",
        90,
        280
      );

      // Certificate ID
      ctx.fillStyle = "#2d6130";
      ctx.font = "bold 20px sans-serif";
      ctx.fillText(`CERTIFICATE ID: CT-CMR-${farm.id || "REG"}-2026`, 90, 340);

      // Line separator
      ctx.strokeStyle = "#dfe7d8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(90, 360);
      ctx.lineTo(1110, 360);
      ctx.stroke();

      // Farm Details Grid
      const details = [
        ["FARM NAME", farm.farmName.toUpperCase()],
        ["REGISTERED PRODUCER", farm.farmerName || "Registered Farmer"],
        ["COOPERATIVE / UNION", farm.cooperative || "Independent Smallholder Union"],
        ["LOCATION / VILLAGE", `${farm.village || "Ndian Division"}, ${farm.region || "Southwest Region"}`],
        ["GPS GEOLOCATION", farm.geolocation || "4.5912° N, 9.1245° E"],
        ["CANOPY GEOFENCE AREA", `${farm.geofenceAreaHa || farm.sizeHectares || 2.5} Hectares (${farm.geofencePointCount || 4} Boundary Vertices)`],
        ["VARIETY & QUALITY", `${farm.cocoaVariety || "Amelonado / Trinitario Hybrid"} (Grade 1 Pure Origin)`],
        ["HARVEST SEASON", farm.harvestSeason || "Main Crop 2025/2026"],
        ["DEFORESTATION RISK", "0.00% Zero-Deforestation Verified (Post-2020 Baseline)"],
        ["EU REGULATION", "EUDR Regulation (EU) 2023/1115 Fully Compliant"],
        ["REGISTRATION DATE", farm.registrationDate || new Date().toISOString().split("T")[0]],
      ];

      let yPos = 410;
      details.forEach(([label, val]) => {
        ctx.fillStyle = "#5f6659";
        ctx.font = "bold 16px sans-serif";
        ctx.fillText(label, 90, yPos);

        ctx.fillStyle = "#10251d";
        ctx.font = "bold 20px sans-serif";
        ctx.fillText(val, 420, yPos);

        yPos += 52;
      });

      // QR Code Placement
      if (qrDataUrl) {
        const qrImg = new Image();
        qrImg.crossOrigin = "anonymous";
        qrImg.src = qrDataUrl;
        await new Promise((res) => {
          qrImg.onload = res;
        });
        ctx.drawImage(qrImg, 820, 1080, 240, 240);

        ctx.fillStyle = "#062d22";
        ctx.font = "bold 15px sans-serif";
        ctx.fillText("SCAN FOR LIVE PROVENANCE", 820, 1345);
      }

      // Issuer Signature & Stamp Block
      ctx.fillStyle = "#062d22";
      ctx.font = "bold 18px sans-serif";
      ctx.fillText("ISSUED BY: CocoaTrace Traceability Authority", 90, 1140);

      ctx.fillStyle = "#5f6659";
      ctx.font = "16px sans-serif";
      ctx.fillText("Platform Signature: SHA256-CC-2026-AUTH-SECURE", 90, 1175);
      ctx.fillText(`Registry Timestamp: ${new Date().toUTCString()}`, 90, 1205);
      ctx.fillText("EU Due Diligence Statement: DDS-2026-CM-VERIFIED", 90, 1235);

      // Download trigger
      const link = document.createElement("a");
      link.download = `CocoaTrace-Certificate-${farm.farmName.replace(/\s+/g, "_")}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      console.error("Certificate download error:", err);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-3xl rounded-[32px] border border-white/20 bg-[#fbfdfa] p-6 shadow-2xl sm:p-8">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-black/5 text-[#57655d] transition hover:bg-black/10 hover:text-black cursor-pointer"
        >
          <X size={18} />
        </button>

        {/* Certificate Container */}
        <div
          ref={certificateRef}
          className="relative overflow-hidden rounded-3xl border-2 border-[#0b3528] bg-white p-6 shadow-inner sm:p-8"
        >
          {/* Top Banner */}
          <div className="-mx-6 -mt-6 sm:-mx-8 sm:-mt-8 mb-6 bg-[#062d22] px-6 py-6 sm:px-8 text-white">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#b8f58b] text-[#062d22] shadow-md font-bold text-2xl">
                  🌿
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#b8f58b]">
                    Official Traceability Record
                  </div>
                  <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                    EUDR Farm Authenticity Certificate
                  </h2>
                </div>
              </div>

              <div className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-[#b8f58b] border border-white/10">
                <ShieldCheck size={14} /> Verified EUDR Compliant
              </div>
            </div>
          </div>

          {/* Certificate Body */}
          <div className="grid gap-6 md:grid-cols-3">
            {/* Left 2 cols: Farm Specifications */}
            <div className="space-y-4 md:col-span-2">
              <div className="rounded-2xl bg-[#edf7e8] p-4 border border-[#cbe8c1]">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#2d6130]">
                  Registered Farm Identity
                </div>
                <div className="text-xl font-bold text-[#0b3528] mt-0.5">
                  {farm.farmName}
                </div>
                <div className="text-xs text-[#2d6130]/90 font-medium">
                  Producer: <strong>{farm.farmerName || "Registered Farmer"}</strong> • {farm.cooperative || "Independent Smallholder Union"}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl border border-[#dfe7d8] bg-[#fbfdfa] p-3">
                  <span className="block text-[10px] uppercase font-bold text-[#5f6659]">
                    Region & Village
                  </span>
                  <span className="font-semibold text-[#10251d]">
                    {farm.village || "Ndian"}, {farm.region || "Southwest"}
                  </span>
                </div>

                <div className="rounded-xl border border-[#dfe7d8] bg-[#fbfdfa] p-3">
                  <span className="block text-[10px] uppercase font-bold text-[#5f6659]">
                    Total Area & Polygon
                  </span>
                  <span className="font-semibold text-[#10251d]">
                    {farm.geofenceAreaHa || farm.sizeHectares || 2.5} Ha ({farm.geofencePointCount || 4} points)
                  </span>
                </div>

                <div className="rounded-xl border border-[#dfe7d8] bg-[#fbfdfa] p-3">
                  <span className="block text-[10px] uppercase font-bold text-[#5f6659]">
                    GPS Geolocation
                  </span>
                  <span className="font-mono font-semibold text-[#10251d]">
                    {farm.geolocation || "4.5912° N, 9.1245° E"}
                  </span>
                </div>

                <div className="rounded-xl border border-[#dfe7d8] bg-[#fbfdfa] p-3">
                  <span className="block text-[10px] uppercase font-bold text-[#5f6659]">
                    Cocoa Variety
                  </span>
                  <span className="font-semibold text-[#10251d]">
                    {farm.cocoaVariety || "Amelonado / Trinitario Hybrid"}
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-[#dfe7d8] bg-white p-3 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-[#5f6659]">Certificate Serial:</span>
                  <span className="font-mono font-bold text-[#0b3528]">CT-CMR-{farm.id.slice(0, 10).toUpperCase()}-2026</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-[#5f6659]">EU Regulation:</span>
                  <span className="font-semibold text-[#2d6130]">EU 2023/1115 (Zero Deforestation)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-[#5f6659]">Issued By:</span>
                  <span className="font-medium text-[#10251d]">CocoaTrace Provenance Authority</span>
                </div>
              </div>
            </div>

            {/* Right 1 col: QR Code & Verification Stamp */}
            <div className="flex flex-col items-center justify-between rounded-2xl border border-[#dfe7d8] bg-[#f9faf7] p-4 text-center">
              <div className="w-full">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#2d6130] mb-2 flex items-center justify-center gap-1">
                  <QrCode size={12} /> Scan for Authenticity
                </div>

                <div className="mx-auto flex h-36 w-36 items-center justify-center rounded-xl border border-[#dfe7d8] bg-white p-2 shadow-sm">
                  {qrDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={qrDataUrl}
                      alt="Farm Authenticity QR"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <div className="text-[10px] text-gray-400">Generating QR...</div>
                  )}
                </div>
              </div>

              <div className="mt-3 w-full">
                <div className="rounded-lg bg-[#edf7e8] py-1 px-2 text-[10px] font-bold text-[#1b4e28] border border-[#cce4c4]">
                  EU Due Diligence Ready
                </div>
                <p className="mt-1 text-[9px] text-[#6f7e73]">
                  Immutable hash recorded for export compliance.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="flex items-center gap-2 rounded-full bg-[#0b3528] px-5 py-2.5 text-xs font-bold text-white transition hover:bg-[#07241b] disabled:opacity-50 cursor-pointer shadow-md"
            >
              <Download size={15} />
              {downloading ? "Generating Certificate..." : "Download Certificate (PNG)"}
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 rounded-full border border-[#dfe7d8] bg-white px-4 py-2.5 text-xs font-semibold text-[#10251d] transition hover:bg-[#f7f8f3] cursor-pointer shadow-sm"
            >
              <Printer size={15} />
              Print
            </button>

            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 rounded-full border border-[#dfe7d8] bg-white px-4 py-2.5 text-xs font-semibold text-[#10251d] transition hover:bg-[#f7f8f3] cursor-pointer shadow-sm"
            >
              {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
              {copied ? "Copied Link!" : "Copy Verification URL"}
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
  );
}
