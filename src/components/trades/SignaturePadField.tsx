"use client";

import React, { useRef, useState, useEffect } from "react";
import { PenTool, Upload, Eraser, CheckCircle2 } from "lucide-react";

export interface SignatureFieldState {
  signerName: string;
  signerTitle: string;
  signatureFile: File | null;
  previewUrl: string | null;
}

interface SignaturePadFieldProps {
  label?: string;
  value: SignatureFieldState;
  onChange: (next: SignatureFieldState) => void;
  signerNamePlaceholder?: string;
  signerTitlePlaceholder?: string;
}

export function SignaturePadField({
  label = "Authorized Signature",
  value,
  onChange,
  signerNamePlaceholder = "Full name of authorized signatory",
  signerTitlePlaceholder = "e.g. Managing Director, Procurement Officer (optional)",
}: SignaturePadFieldProps) {
  const [mode, setMode] = useState<"draw" | "upload">("draw");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const hasStrokesRef = useRef(false);
  const [hasDrawing, setHasDrawing] = useState(false);

  // Initialize crisp canvas backing store
  useEffect(() => {
    if (mode !== "draw") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // White background so PNG exports cleanly into PDFs
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0b3528";
    ctx.lineWidth = 2.6;
  }, [mode]);

  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const pt = getCanvasPoint(e);
    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pt = getCanvasPoint(e);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    hasStrokesRef.current = true;
    if (!hasDrawing) setHasDrawing(true);
  };

  const exportCanvasToState = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasStrokesRef.current) return;
    const dataUrl = canvas.toDataURL("image/png");
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `signature-${Date.now()}.png`, {
          type: "image/png",
        });
        onChange({
          ...value,
          signatureFile: file,
          previewUrl: dataUrl,
        });
      },
      "image/png",
      0.95
    );
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // ignore if already released
    }
    exportCanvasToState();
  };

  const handleClearCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
    hasStrokesRef.current = false;
    setHasDrawing(false);
    onChange({
      ...value,
      signatureFile: null,
      previewUrl: null,
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      onChange({
        ...value,
        signatureFile: file,
        previewUrl: typeof reader.result === "string" ? reader.result : null,
      });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="rounded-2xl border border-[#dfe7d8] bg-[#fafcf9] p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold text-[#10251d] flex items-center gap-1.5">
          <PenTool size={14} className="text-[#2d6130]" />
          {label}
        </span>

        <div className="inline-flex rounded-full border border-[#dfe7d8] bg-white p-0.5 text-[11px] font-bold">
          <button
            type="button"
            onClick={() => {
              setMode("draw");
              hasStrokesRef.current = false;
              setHasDrawing(false);
              onChange({ ...value, signatureFile: null, previewUrl: null });
            }}
            className={`rounded-full px-3 py-1 transition cursor-pointer whitespace-nowrap ${
              mode === "draw"
                ? "bg-[#0b3528] text-white"
                : "text-[#57655d] hover:text-[#10251d]"
            }`}
          >
            Draw Signature
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("upload");
              hasStrokesRef.current = false;
              setHasDrawing(false);
              onChange({ ...value, signatureFile: null, previewUrl: null });
            }}
            className={`rounded-full px-3 py-1 transition cursor-pointer whitespace-nowrap ${
              mode === "upload"
                ? "bg-[#0b3528] text-white"
                : "text-[#57655d] hover:text-[#10251d]"
            }`}
          >
            Upload Image
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-[11px] font-semibold text-[#57655d] mb-1">
            Authorized Signer Name *
          </label>
          <input
            type="text"
            required
            value={value.signerName}
            onChange={(e) => onChange({ ...value, signerName: e.target.value })}
            placeholder={signerNamePlaceholder}
            className="w-full rounded-xl border border-[#dfe7d8] bg-white px-3 py-2 text-xs font-medium text-[#10251d] outline-none focus:border-[#2d6130]"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-[#57655d] mb-1">
            Title / Designation
          </label>
          <input
            type="text"
            value={value.signerTitle}
            onChange={(e) => onChange({ ...value, signerTitle: e.target.value })}
            placeholder={signerTitlePlaceholder}
            className="w-full rounded-xl border border-[#dfe7d8] bg-white px-3 py-2 text-xs font-medium text-[#10251d] outline-none focus:border-[#2d6130]"
          />
        </div>
      </div>

      {mode === "draw" ? (
        <div className="space-y-2">
          <div className="relative overflow-hidden rounded-xl border border-dashed border-[#b6cab0] bg-white">
            <canvas
              ref={canvasRef}
              width={600}
              height={170}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              className="block h-[130px] w-full cursor-crosshair touch-none"
            />
            {!hasDrawing && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-[#8a998f]">
                Sign here using your mouse, trackpad, or finger
              </div>
            )}
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[#57655d]">
              {value.signatureFile ? (
                <span className="inline-flex items-center gap-1 font-semibold text-[#2d6130]">
                  <CheckCircle2 size={13} /> Signature captured for PDF document
                </span>
              ) : (
                "Required: draw your signature above"
              )}
            </span>
            <button
              type="button"
              onClick={handleClearCanvas}
              className="inline-flex items-center gap-1 rounded-full border border-[#dfe7d8] bg-white px-3 py-1 font-bold text-[#57655d] hover:bg-[#f0f4ec] cursor-pointer whitespace-nowrap"
            >
              <Eraser size={12} /> Clear
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[#b6cab0] bg-white px-4 py-5 text-center transition hover:bg-[#f4f8f1]">
            <Upload size={18} className="text-[#2d6130]" />
            <span className="mt-1.5 text-xs font-bold text-[#10251d]">
              {value.signatureFile ? value.signatureFile.name : "Upload Signature Image (PNG, JPG, WEBP)"}
            </span>
            <span className="mt-0.5 text-[11px] text-[#57655d]">
              Embedded directly onto the generated PDF document
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
          {value.previewUrl && (
            <div className="flex items-center justify-between rounded-xl border border-[#dfe7d8] bg-white p-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={value.previewUrl}
                alt="Uploaded signature preview"
                className="max-h-14 max-w-[200px] object-contain"
              />
              <button
                type="button"
                onClick={() => onChange({ ...value, signatureFile: null, previewUrl: null })}
                className="rounded-full border border-[#dfe7d8] px-3 py-1 text-[11px] font-bold text-gray-600 hover:bg-gray-50 cursor-pointer"
              >
                Remove
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
