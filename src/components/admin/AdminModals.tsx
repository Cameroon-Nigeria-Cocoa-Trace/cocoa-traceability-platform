"use client";

import React, { useState } from "react";
import { X, AlertTriangle, ShieldAlert, Coins, CheckCircle2, UserCog } from "lucide-react";
import {
  EntityOperationalStatus,
  FeeConfig,
  ManagedEntityType,
  PlatformSystemStatus,
} from "@/types/admin";

interface ModalShellProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}

function ModalShell({ title, subtitle, onClose, children }: ModalShellProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#062d22]/45 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg rounded-2xl border border-[#dfe7d8] bg-white shadow-[0_24px_48px_rgba(6,45,34,0.18)]">
        <div className="flex items-start justify-between border-b border-[#edf1ea] px-6 py-4">
          <div>
            <h3 className="text-base font-bold text-[#10251d]">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs text-[#57655d]">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#57655d] transition hover:bg-[#f2f5ee] hover:text-[#10251d] cursor-pointer"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export function SystemStatusModal({
  currentStatus,
  targetStatus,
  submitting,
  onClose,
  onConfirm,
}: {
  currentStatus: PlatformSystemStatus;
  targetStatus: PlatformSystemStatus;
  submitting: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isCritical = targetStatus === "emergency_stop" || targetStatus === "suspended";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError("Please provide an administrative reason for the audit log.");
      return;
    }
    setError(null);
    await onConfirm(reason.trim());
  };

  return (
    <ModalShell
      title="Confirm Platform System Status Change"
      subtitle={`Transitioning platform mode from ${currentStatus.toUpperCase()} to ${targetStatus.toUpperCase()}`}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {isCritical && (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-800">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-600" />
            <div>
              <p className="font-bold">High-Impact Operational Change</p>
              <p className="mt-0.5 leading-relaxed">
                Setting the platform to <span className="font-mono font-bold">{targetStatus}</span> affects live trade, transfer, and customs operations across all stakeholder dashboards.
              </p>
            </div>
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-[#394a41]">
            Audit Reason *
          </label>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g., Scheduled EUDR database reconciliation window"
            className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] p-3 text-xs text-[#10251d] outline-none focus:border-[#2d6130] focus:bg-white"
          />
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-xl border border-[#dfe7d8] bg-white px-4 py-2 text-xs font-semibold text-[#394a41] transition hover:bg-[#f7f8f3] cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className={`rounded-xl px-4 py-2 text-xs font-bold text-white transition cursor-pointer disabled:opacity-50 ${
              isCritical ? "bg-red-700 hover:bg-red-800" : "bg-[#0b3528] hover:bg-[#144737]"
            }`}
          >
            {submitting ? "Applying..." : "Confirm Status Change"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

export function EntityStatusModal({
  entityName,
  entityType,
  currentStatus,
  submitting,
  onClose,
  onConfirm,
}: {
  entityName: string;
  entityType: ManagedEntityType;
  currentStatus: EntityOperationalStatus;
  submitting: boolean;
  onClose: () => void;
  onConfirm: (status: EntityOperationalStatus, reason: string) => Promise<void>;
}) {
  const [status, setStatus] = useState<EntityOperationalStatus>(
    currentStatus === "active" ? "under_investigation" : "active"
  );
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError("A governance reason is required for the immutable audit log.");
      return;
    }
    setError(null);
    await onConfirm(status, reason.trim());
  };

  return (
    <ModalShell
      title="Entity Operational Governance"
      subtitle={`${entityName} (${entityType.replace("_", " ")})`}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-[#394a41]">
            Operational Status
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(["active", "under_investigation", "suspended"] as EntityOperationalStatus[]).map(
              (option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setStatus(option)}
                  className={`rounded-xl border px-3 py-2.5 text-xs font-bold capitalize transition cursor-pointer ${
                    status === option
                      ? option === "suspended"
                        ? "border-red-600 bg-red-50 text-red-800"
                        : option === "under_investigation"
                        ? "border-amber-600 bg-amber-50 text-amber-800"
                        : "border-[#2d6130] bg-[#edf7e8] text-[#10251d]"
                      : "border-[#dfe7d8] bg-white text-[#57655d] hover:bg-[#f7f8f3]"
                  }`}
                >
                  {option.replace("_", " ")}
                </button>
              )
            )}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-[#394a41]">
            Governance Reason *
          </label>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Document inspection finding, suspension grounds, or clearance confirmation..."
            className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] p-3 text-xs text-[#10251d] outline-none focus:border-[#2d6130] focus:bg-white"
          />
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-xl border border-[#dfe7d8] bg-white px-4 py-2 text-xs font-semibold text-[#394a41] transition hover:bg-[#f7f8f3] cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#0b3528] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#144737] disabled:opacity-50 cursor-pointer"
          >
            <ShieldAlert size={14} />
            {submitting ? "Updating..." : "Save Governance Status"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

export function UserRoleModal({
  userName,
  userEmail,
  currentRole,
  submitting,
  onClose,
  onConfirm,
}: {
  userName: string;
  userEmail: string;
  currentRole: string;
  submitting: boolean;
  onClose: () => void;
  onConfirm: (
    newRole: "farmer" | "cooperative" | "agent" | "warehouse" | "buyer" | "admin",
    reason: string
  ) => Promise<void>;
}) {
  const validRoles = ["farmer", "cooperative", "agent", "warehouse", "buyer", "admin"] as const;
  const initial = validRoles.includes(currentRole as (typeof validRoles)[number])
    ? (currentRole as (typeof validRoles)[number])
    : "farmer";
  const [role, setRole] = useState<(typeof validRoles)[number]>(initial);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError("Please specify a reason for changing account role.");
      return;
    }
    setError(null);
    await onConfirm(role, reason.trim());
  };

  return (
    <ModalShell
      title="Account Role Assignment"
      subtitle={`${userName} ${userEmail ? `(${userEmail})` : ""}`}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-[#394a41]">
            Assign Platform Role
          </label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as (typeof validRoles)[number])}
            className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] px-3 py-2.5 text-xs font-semibold text-[#10251d] outline-none focus:border-[#2d6130] focus:bg-white"
          >
            <option value="farmer">Farmer / Producer</option>
            <option value="cooperative">Cooperative Manager</option>
            <option value="agent">Licensed Buying Agent</option>
            <option value="warehouse">Warehouse Custody</option>
            <option value="buyer">Marketplace Buyer</option>
            <option value="admin">Platform Administrator</option>
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-[#394a41]">
            Audit Reason *
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g., Verified customs/admin onboarding credentials"
            className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] px-3 py-2.5 text-xs text-[#10251d] outline-none focus:border-[#2d6130] focus:bg-white"
          />
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-xl border border-[#dfe7d8] bg-white px-4 py-2 text-xs font-semibold text-[#394a41] transition hover:bg-[#f7f8f3] cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#0b3528] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#144737] disabled:opacity-50 cursor-pointer"
          >
            <UserCog size={14} />
            {submitting ? "Saving..." : "Update Role"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

export function FeeConfigModal({
  mode,
  initialFee,
  submitting,
  onClose,
  onSave,
}: {
  mode: "edit" | "create";
  initialFee?: FeeConfig | null;
  submitting: boolean;
  onClose: () => void;
  onSave: (payload: {
    code: string;
    name: string;
    description: string;
    amount: number;
    currency: "NGN" | "USD";
    isPercentage: boolean;
    applicableActorTypes: string[];
  }) => Promise<void>;
}) {
  const [code, setCode] = useState(initialFee?.code || "");
  const [name, setName] = useState(initialFee?.name || "");
  const [description, setDescription] = useState(initialFee?.description || "");
  const [amount, setAmount] = useState(
    initialFee ? String(initialFee.amount) : "0"
  );
  const [currency, setCurrency] = useState<"NGN" | "USD">(
    initialFee?.currency || "NGN"
  );
  const [isPercentage, setIsPercentage] = useState(
    initialFee?.isPercentage ?? false
  );
  const [actorsText, setActorsText] = useState(
    initialFee?.applicableActorTypes?.join(", ") || "agent, warehouse"
  );
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmount = parseFloat(amount);
    if (Number.isNaN(numericAmount) || numericAmount < 0) {
      setError("Fee amount must be zero or positive.");
      return;
    }
    if (!code.trim() || !name.trim()) {
      setError("Fee code and name are required.");
      return;
    }
    setError(null);
    const applicableActorTypes = actorsText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    await onSave({
      code: code.trim(),
      name: name.trim(),
      description: description.trim(),
      amount: numericAmount,
      currency,
      isPercentage,
      applicableActorTypes,
    });
  };

  return (
    <ModalShell
      title={mode === "edit" ? `Edit Statutory Fee: ${initialFee?.code}` : "Create New Statutory Fee"}
      subtitle="All changes apply dynamically to clearance & transfer calculations and are logged."
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-[#394a41]">
              Fee Code *
            </label>
            <input
              type="text"
              value={code}
              disabled={mode === "edit"}
              onChange={(e) => setCode(e.target.value)}
              placeholder="FEE_EXPORT_LEVY"
              className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] px-3 py-2 font-mono text-xs text-[#10251d] outline-none disabled:opacity-60 focus:border-[#2d6130] focus:bg-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[#394a41]">
              Rate Type
            </label>
            <select
              value={isPercentage ? "percent" : "flat"}
              onChange={(e) => setIsPercentage(e.target.value === "percent")}
              className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] px-3 py-2 text-xs text-[#10251d] outline-none focus:border-[#2d6130] focus:bg-white"
            >
              <option value="flat">Flat Statutory Fee</option>
              <option value="percent">Percentage (%)</option>
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-[#394a41]">
            Fee Name *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Cross-Border Export Inspection Fee"
            className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] px-3 py-2 text-xs text-[#10251d] outline-none focus:border-[#2d6130] focus:bg-white"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-[#394a41]">
              {isPercentage ? "Percentage Rate (%)" : "Fee Amount"} *
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] px-3 py-2 font-mono text-xs text-[#10251d] outline-none focus:border-[#2d6130] focus:bg-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[#394a41]">
              Currency
            </label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as "NGN" | "USD")}
              className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] px-3 py-2 text-xs text-[#10251d] outline-none focus:border-[#2d6130] focus:bg-white"
            >
              <option value="NGN">NGN</option>
              <option value="USD">USD</option>
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-[#394a41]">
            Applicable Actor Types (comma-separated)
          </label>
          <input
            type="text"
            value={actorsText}
            onChange={(e) => setActorsText(e.target.value)}
            placeholder="farmer, cooperative, agent, warehouse"
            className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] px-3 py-2 text-xs text-[#10251d] outline-none focus:border-[#2d6130] focus:bg-white"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-[#394a41]">
            Description
          </label>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Legal & operational basis for this fee..."
            className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] p-3 text-xs text-[#10251d] outline-none focus:border-[#2d6130] focus:bg-white"
          />
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-xl border border-[#dfe7d8] bg-white px-4 py-2 text-xs font-semibold text-[#394a41] transition hover:bg-[#f7f8f3] cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#0b3528] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#144737] disabled:opacity-50 cursor-pointer"
          >
            <Coins size={14} />
            {submitting ? "Saving..." : mode === "edit" ? "Update Fee" : "Create Fee"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

export function OversightReviewModal({
  title,
  targetLabel,
  options,
  defaultOption,
  submitting,
  onClose,
  onConfirm,
}: {
  title: string;
  targetLabel: string;
  options: { value: string; label: string }[];
  defaultOption: string;
  submitting: boolean;
  onClose: () => void;
  onConfirm: (selectedStatus: string, reason: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState(defaultOption);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError("Please enter a review note for the audit trail.");
      return;
    }
    setError(null);
    await onConfirm(selected, reason.trim());
  };

  return (
    <ModalShell title={title} subtitle={targetLabel} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-[#394a41]">
            Decision Status
          </label>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] px-3 py-2.5 text-xs font-semibold text-[#10251d] outline-none focus:border-[#2d6130] focus:bg-white"
          >
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-[#394a41]">
            Review Notes / Justification *
          </label>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Record inspection result, polygon check outcome, or revocation cause..."
            className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] p-3 text-xs text-[#10251d] outline-none focus:border-[#2d6130] focus:bg-white"
          />
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-xl border border-[#dfe7d8] bg-white px-4 py-2 text-xs font-semibold text-[#394a41] transition hover:bg-[#f7f8f3] cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#0b3528] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#144737] disabled:opacity-50 cursor-pointer"
          >
            <CheckCircle2 size={14} />
            {submitting ? "Recording..." : "Submit Decision"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
