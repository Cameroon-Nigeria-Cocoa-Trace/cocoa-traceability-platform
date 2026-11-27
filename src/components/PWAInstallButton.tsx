"use client";

import React, { useState } from "react";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { Download, Smartphone, X } from "lucide-react";

export const PWAInstallButton: React.FC<{ className?: string }> = ({ className = "" }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already installed, hide
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <button
        onClick={install}
        type="button"
        className={`inline-flex items-center gap-1.5 rounded-full bg-[#b8f58b] px-3.5 py-1.5 text-xs font-bold text-[#073b2b] shadow-sm hover:bg-[#a6eb77] transition cursor-pointer ${className}`}
      >
        <Download size={14} />
        <span>Install App</span>
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          type="button"
          className={`inline-flex items-center gap-1.5 rounded-full border border-[#dfe7d8] bg-white/90 backdrop-blur-sm px-3.5 py-1.5 text-xs font-bold text-[#10251d] shadow-sm hover:bg-[#f3f6f0] transition cursor-pointer ${className}`}
        >
          <Smartphone size={14} />
          <span>Install PWA</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-3xl border border-[#dfe7d8] bg-white p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-[#edf1ea] pb-3">
                <h3 className="text-base font-bold text-[#10251d]">Install CocoaTrace on iOS</h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="rounded-full p-1 text-gray-500 hover:bg-gray-100"
                >
                  <X size={18} />
                </button>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-gray-600">
                1. Tap the <strong className="text-[#10251d]">Share</strong> button in your Safari browser toolbar.<br />
                2. Scroll down and select <strong className="text-[#10251d]">Add to Home Screen</strong>.<br />
                3. Open the app directly from your home screen for full offline GPS mapping!
              </p>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-4 w-full rounded-full bg-[#10251d] py-2.5 text-xs font-bold text-white hover:bg-[#1a382d]"
              >
                Got It
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
