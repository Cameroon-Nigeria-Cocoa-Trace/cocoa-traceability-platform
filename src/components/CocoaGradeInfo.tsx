"use client";

import React, { useState } from "react";
import {
  COCOA_GRADE_STANDARDS,
  CocoaGradeSpec,
  getCocoaGradeSpec,
} from "@/data/cocoaGradingStandards";
import {
  Award,
  CheckCircle2,
  AlertTriangle,
  Info,
  X,
  Droplets,
  Sun,
  ShieldCheck,
  Scale,
  Sparkles,
  ExternalLink,
} from "lucide-react";

interface CocoaGradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedGrade?: string | null;
}

export function CocoaGradeModal({
  isOpen,
  onClose,
  selectedGrade,
}: CocoaGradeModalProps) {
  const [activeTab, setActiveTab] = useState<string>(
    selectedGrade ? getCocoaGradeSpec(selectedGrade).id : "Grade 1"
  );

  if (!isOpen) return null;

  const currentSpec =
    COCOA_GRADE_STANDARDS.find((s) => s.id === activeTab) ||
    COCOA_GRADE_STANDARDS[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm overflow-y-auto">
      <div className="relative my-8 w-full max-w-3xl rounded-[32px] border border-[#dfe7d8] bg-white p-6 sm:p-8 shadow-2xl">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-5 top-5 rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition cursor-pointer"
          aria-label="Close modal"
        >
          <X size={20} />
        </button>

        {/* Header */}
        <div className="flex items-center gap-2.5 text-xs font-bold uppercase tracking-wider text-[#2d6130]">
          <Award size={16} /> Official Quality Standards
        </div>
        <h2 className="mt-1 text-2xl sm:text-3xl font-extrabold text-[#10251d]">
          Cameroon Cocoa Quality Grading
        </h2>
        <p className="mt-1 text-xs sm:text-sm text-[#57655d]">
          Standardized physical verification criteria governing commercial cocoa trade, origin certification, and agent inspection.
        </p>

        {/* Grade Selection Tabs */}
        <div className="mt-6 flex flex-wrap gap-2 border-b border-[#edf1ea] pb-4">
          {COCOA_GRADE_STANDARDS.map((spec) => {
            const isCurrent = activeTab === spec.id;
            return (
              <button
                key={spec.id}
                type="button"
                onClick={() => setActiveTab(spec.id)}
                className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-bold transition cursor-pointer ${
                  isCurrent
                    ? spec.id === "Grade 1"
                      ? "bg-[#062d22] text-[#b8f58b] shadow-sm"
                      : spec.id === "Grade 2"
                      ? "bg-blue-900 text-white shadow-sm"
                      : "bg-amber-900 text-white shadow-sm"
                    : "bg-[#f4f7f2] text-[#57655d] hover:bg-[#e7ebe3]"
                }`}
              >
                <span>{spec.title}</span>
              </button>
            );
          })}
        </div>

        {/* Active Grade Content */}
        <div className="mt-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl bg-[#fafcf9] p-4 border border-[#dfe7d8]">
            <div>
              <span className={`inline-block rounded-full px-3 py-1 text-xs font-extrabold border ${currentSpec.badgeClass}`}>
                {currentSpec.title}
              </span>
              <p className="mt-1.5 text-xs text-[#57655d]">{currentSpec.tagline}</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#2d6130]">
              <ShieldCheck size={16} /> Verified Lot Standard
            </div>
          </div>

          {/* Criteria Grid */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#6c7b72] mb-3">
              Inspection Parameters &amp; Thresholds
            </h4>
            <div className="grid gap-3 sm:grid-cols-2">
              {currentSpec.criteria.map((c, i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-[#dfe7d8] bg-white p-3.5 text-xs shadow-2xs hover:border-[#b8f58b] transition"
                >
                  <span className="font-bold text-[#10251d] block mb-1">
                    • {c.label}
                  </span>
                  <p className="text-[#47544d] leading-relaxed pl-2.5 border-l-2 border-[#edf1ea]">
                    {c.value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Action Note for Grade 3 if present */}
          {currentSpec.actionNote && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900 flex items-start gap-3">
              <AlertTriangle size={18} className="shrink-0 text-amber-700 mt-0.5" />
              <div>
                <strong className="block font-bold text-amber-950 mb-1">
                  Mandatory Handling &amp; Action Directive:
                </strong>
                <p className="leading-relaxed text-amber-900">{currentSpec.actionNote}</p>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="mt-8 flex justify-end pt-4 border-t border-[#edf1ea]">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-[#0b3528] px-6 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#144737] cursor-pointer"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Compact / Embedded Card for display on the Product Page and Selected Lot view in Marketplace
 */
export function CocoaGradeCard({
  gradeStr,
  className = "",
}: {
  gradeStr?: string | null;
  className?: string;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const spec = getCocoaGradeSpec(gradeStr);

  return (
    <>
      <div
        className={`rounded-3xl border border-[#dfe7d8] bg-white p-5 sm:p-6 shadow-sm ${className}`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-[#edf1ea]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#edf7e8] text-[#2d6130]">
              <Award size={20} />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#2d6130]">
                Agent &amp; Buyer Specification
              </div>
              <h3 className="text-base sm:text-lg font-black text-[#10251d]">
                {spec.title}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#dfe7d8] bg-[#fafcf9] px-3.5 py-1.5 text-xs font-bold text-[#10251d] hover:bg-[#edf2ea] transition cursor-pointer self-start sm:self-auto"
          >
            <Info size={13} className="text-[#2d6130]" />
            <span>All Grade Standards</span>
          </button>
        </div>

        {/* Description / Summary */}
        <p className="mt-3 text-xs text-[#57655d] leading-relaxed">
          {spec.tagline}. Every metric below has been audited against Cameroon Ministry of Agriculture (MINADER) and international export criteria.
        </p>

        {/* Criteria Pills / Grid */}
        <div className="mt-4 grid gap-2.5 sm:grid-cols-2 text-xs">
          {spec.criteria.map((item, idx) => (
            <div
              key={idx}
              className="rounded-xl border border-[#edf1ea] bg-[#fafcf9] p-3 text-[11px]"
            >
              <div className="font-bold text-[#10251d] flex items-center justify-between">
                <span>{item.label}</span>
                <span className="text-[10px] text-[#2d6130] font-semibold">Standard</span>
              </div>
              <p className="mt-1 text-[#4a574f] leading-snug">{item.value}</p>
            </div>
          ))}
        </div>

        {/* Action Directive (if Grade 3) */}
        {spec.actionNote && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900 flex items-start gap-2.5">
            <AlertTriangle size={16} className="shrink-0 text-amber-700 mt-0.5" />
            <div className="leading-relaxed">{spec.actionNote}</div>
          </div>
        )}
      </div>

      <CocoaGradeModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        selectedGrade={gradeStr}
      />
    </>
  );
}

/**
 * Interactive Grade Selector for Farmers Registering Cocoa Lots
 */
export function CocoaGradeSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (val: string) => void;
}) {
  const [showFullModal, setShowFullModal] = useState(false);
  const selectedSpec = getCocoaGradeSpec(value);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-bold text-[#57655d]">
          Cocoa Quality Grade &amp; Inspection Assessment
        </label>
        <button
          type="button"
          onClick={() => setShowFullModal(true)}
          className="inline-flex items-center gap-1 text-[11px] font-bold text-[#2d6130] hover:underline cursor-pointer"
        >
          <Info size={12} />
          View Full Specifications Guide
        </button>
      </div>

      {/* Grade Option Cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        {COCOA_GRADE_STANDARDS.map((spec) => {
          const isSelected = selectedSpec.id === spec.id;
          return (
            <div
              key={spec.id}
              onClick={() => onChange(spec.id)}
              className={`flex flex-col justify-between rounded-2xl p-4 border transition-all cursor-pointer ${
                isSelected
                  ? "border-[#062d22] bg-[#edf7e8]/50 ring-2 ring-[#2d6130] shadow-sm"
                  : "border-[#dfe7d8] bg-[#fafcf9] hover:border-[#b8f58b] hover:bg-white"
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${spec.badgeClass}`}
                  >
                    Grade {spec.gradeNumber}
                  </span>
                  {isSelected && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#062d22] text-[#b8f58b]">
                      <CheckCircle2 size={14} />
                    </span>
                  )}
                </div>

                <h4 className="mt-2 text-sm font-extrabold text-[#10251d]">
                  {spec.shortTitle}
                </h4>
                <p className="mt-1 text-[11px] text-[#57655d] leading-snug">
                  {spec.criteria[0].label}: {spec.criteria[0].value}
                </p>
              </div>

              <div className="mt-3 pt-2.5 border-t border-[#edf1ea] text-[10px] font-semibold text-[#6c7b72]">
                Fermentation: {spec.criteria[2].value.slice(0, 32)}...
              </div>
            </div>
          );
        })}
      </div>

      {/* Detailed specs of the selected grade displayed live to the farmer */}
      <div className="rounded-2xl border border-[#dfe7d8] bg-white p-4 text-xs">
        <div className="flex items-center justify-between pb-2 border-b border-[#edf1ea]">
          <span className="font-bold text-[#10251d] flex items-center gap-1.5">
            <CheckCircle2 size={14} className="text-[#2d6130]" />
            Selected Requirements for {selectedSpec.title}
          </span>
          <span className="text-[11px] text-[#57655d]">
            Ensure harvested beans strictly comply
          </span>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 text-[11px]">
          {selectedSpec.criteria.map((c, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[#3a4740]">
              <span className="font-bold text-[#10251d] shrink-0">• {c.label}:</span>
              <span className="text-[#57655d]">{c.value}</span>
            </div>
          ))}
        </div>

        {selectedSpec.actionNote && (
          <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-[11px] text-amber-900 flex items-start gap-2">
            <AlertTriangle size={15} className="shrink-0 text-amber-700 mt-0.5" />
            <div>{selectedSpec.actionNote}</div>
          </div>
        )}
      </div>

      <CocoaGradeModal
        isOpen={showFullModal}
        onClose={() => setShowFullModal(false)}
        selectedGrade={value}
      />
    </div>
  );
}
