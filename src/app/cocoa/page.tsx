"use client";

import React, { useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFirebase } from "@/context/FirebaseContext";
import { createCocoaApiClient } from "@/lib/cocoaApiClient";
import {
  ShieldCheck,
  Sprout,
  Boxes,
  BadgeCheck,
  ArrowLeftRight,
  QrCode,
  Store,
  Handshake,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  LogIn,
  ArrowRight,
  Clock,
  Layers,
  FileCheck2,
  Cpu,
} from "lucide-react";

interface WorkflowCard {
  title: string;
  stage: string;
  status: "active" | "planned";
  description: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  href: string;
  capabilities: string[];
}

const WORKFLOW_CARDS: WorkflowCard[] = [
  {
    title: "Production & Harvest Records",
    stage: "Stage 2",
    status: "planned",
    description:
      "Manage farm seasonal production periods, harvest dates, and actual yields with strict date and volume consistency.",
    icon: Sprout,
    href: "/cocoa/production",
    capabilities: [
      "Seasonal production window validation",
      "Cumulative harvest quantity tracking",
      "Farm-to-production relational integrity",
    ],
  },
  {
    title: "Traceable Cocoa Lots",
    stage: "Stage 2",
    status: "planned",
    description:
      "Create traceable cocoa lots allocated from verified harvests, complete with mandatory Cloudinary visual references.",
    icon: Boxes,
    href: "/cocoa/lots",
    capabilities: [
      "Harvest allocation capacity check",
      "Standard Cameroon lot numbering (LOT-CMR-...)",
      "Secure Cloudinary multipart photo upload",
    ],
  },
  {
    title: "Origin Trace Certificates",
    stage: "Stage 3",
    status: "planned",
    description:
      "Submit and review official Origin Trace Certificate applications with over-certification prevention and upstream DAG lineage.",
    icon: BadgeCheck,
    href: "/cocoa/certificates",
    capabilities: [
      "Multi-stage review/approval workflow",
      "Quantity integrity check against backing lot",
      "Sanitized public verification view",
    ],
  },
  {
    title: "Holdings & Custody Transfers",
    stage: "Stage 3",
    status: "planned",
    description:
      "Track distinct custody units across supply-chain holders and execute atomic transfers across 6 verified routes.",
    icon: ArrowLeftRight,
    href: "/cocoa/transfers",
    capabilities: [
      "6 supported routes (e.g. Farmer -> Coop / Agent)",
      "Automated route fee policy assessment",
      "Full non-destructive chain-of-custody preservation",
    ],
  },
  {
    title: "Bag-Level QR Packaging & Trace",
    stage: "Stage 4",
    status: "planned",
    description:
      "Generate discrete physical bag QR packages with permanent identifiers and unified derived packaging capacity accounting.",
    icon: QrCode,
    href: "/cocoa/qr",
    capabilities: [
      "Zero-redundancy capacity formula",
      "Printable SVG and PNG batch downloads",
      "Public consumer traceability scanner",
    ],
  },
  {
    title: "Cocoa Marketplace & Trades",
    stage: "Stage 5",
    status: "planned",
    description:
      "Trade certified bulk and QR-packaged cocoa or declare uncertified off-platform sales with exact balance deductions.",
    icon: Store,
    href: "/cocoa/marketplace",
    capabilities: [
      "Certified vs Uncertified inventory separation",
      "Platform service fee assessment",
      "On-platform purchase & off-platform sale",
    ],
  },
  {
    title: "Seller Access & Flutterwave Payments",
    stage: "Stage 5",
    status: "planned",
    description:
      "Access confidential seller contact information through Flutterwave with a service fee and a 15-minute intent lock.",
    icon: CreditCard,
    href: "/cocoa/payments",
    capabilities: [
      "NGN fee derivation",
      "Dual-idempotency & reservation lock",
      "Timing-safe webhook signature verification",
    ],
  },
];

export default function CocoaOverviewPage() {
  const { user, loading } = useFirebase();
  const router = useRouter();

  // Seamlessly transition user to the unified main dashboard
  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace("/dashboard");
    }, 1500);
    return () => clearTimeout(timer);
  }, [router]);

  // Instantiate client configured with user's ID-token provider
  const apiClient = useMemo(() => {
    return createCocoaApiClient(async () => {
      if (!user) return null;
      return await user.getIdToken();
    });
  }, [user]);

  // Loading State
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <div className="h-9 w-9 rounded-full border-3 border-[#062d22] border-t-[#b8f58b] animate-spin" />
        <p className="text-sm font-medium text-[#57655d]">
          Initialising Cocoa Traceability & Trade session...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Unified Main Dashboard Notice Banner */}
      <div className="rounded-2xl border border-[#b8f58b]/40 bg-[#062d22] p-4 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-[#b8f58b] text-[#062d22] flex items-center justify-center font-bold text-sm">
            ✓
          </div>
          <div>
            <div className="text-xs font-bold text-[#b8f58b]">
              Unified Dashboard Active
            </div>
            <div className="text-[11px] text-white/80">
              Cocoa Traceability & Trade is now integrated directly into your main Farmer Dashboard.
            </div>
          </div>
        </div>

        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-[#b8f58b] text-[#062d22] text-xs font-bold hover:bg-[#a6ec75] transition-colors self-start sm:self-auto"
        >
          <span>Open Unified Dashboard</span>
          <ArrowRight size={13} />
        </Link>
      </div>

      {/* Header Banner */}
      <section className="rounded-3xl bg-[#062d22] text-white p-6 sm:p-8 md:p-10 relative overflow-hidden shadow-[0_18px_40px_rgba(6,45,34,0.12)]">
        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-[#b8f58b]/15 px-3 py-1 text-xs font-semibold text-[#b8f58b] border border-[#b8f58b]/25">
            <ShieldCheck size={14} />
            <span>EUDR & TraceTrade Architecture — Role 3 Workspace</span>
          </div>

          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-white">
            Cocoa Traceability & Trade
          </h1>

          <p className="text-sm sm:text-base text-white/80 leading-relaxed max-w-2xl">
            Origin-preserving cocoa batch accounting, multi-hop custody transfer, bag-level QR verification,
            and commercial trading across Cross River and Nigerian export channels.
          </p>
        </div>

        {/* Decorative corner accent */}
        <div className="absolute -right-12 -bottom-12 w-64 h-64 rounded-full bg-[#b8f58b]/10 blur-3xl pointer-events-none" />
      </section>

      {/* Authentication & Integration State Card */}
      <section className="rounded-2xl border border-[#dfe7d8] bg-white p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div
              className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
                user
                  ? "bg-[#edf7e8] text-[#2d6130]"
                  : "bg-amber-50 text-amber-700 border border-amber-200"
              }`}
            >
              {user ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-[#10251d]">
                  {user ? "Active Firebase Authentication Session" : "Signed-Out Mode"}
                </h2>
                <span
                  className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                    user
                      ? "bg-[#edf7e8] text-[#2d6130]"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {user ? "Authenticated" : "Public Guest"}
                </span>
              </div>

              <p className="text-xs text-[#57655d]">
                {user ? (
                  <>
                    Connected as:{" "}
                    <span className="font-semibold text-[#10251d]">
                      {user.email || user.displayName || "Producer / Operator"}
                    </span>{" "}
                    <span className="font-mono text-[11px] text-[#57655d]">
                      ({user.uid.slice(0, 12)}...)
                    </span>
                  </>
                ) : (
                  "You are viewing the workspace as a guest. Authenticate to manage production, issue certificates, or initiate transfers."
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            {user ? (
              <div className="flex items-center gap-2 text-xs font-medium text-[#2d6130] bg-[#edf7e8] px-3.5 py-2 rounded-xl">
                <Cpu size={14} />
                <span>Bearer Token Ready</span>
              </div>
            ) : (
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#062d22] text-[#b8f58b] text-xs font-bold hover:bg-[#0a4232] transition-colors"
              >
                <LogIn size={14} />
                Sign In to Platform
              </Link>
            )}
          </div>
        </div>

        {/* Security Notice */}
        <div className="mt-4 pt-4 border-t border-[#edf1ea] flex flex-wrap items-center justify-between text-[11px] text-[#57655d] gap-2">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[#2d6130]" />
            <span>Server-side verification: Firebase ID Token via Bearer Authorization header.</span>
          </div>
          <div className="text-right">
            <span>Identity Spoofing Protection: Enabled</span>
          </div>
        </div>
      </section>

      {/* Workspace Architecture Overview */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#10251d]">
              Traceability & Trade Workflows
            </h2>
            <p className="text-xs text-[#57655d]">
              Verified backend capabilities ready for staged frontend connection.
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-[#57655d]">
            <Layers size={14} />
            <span>7 Core Functional Domains</span>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {WORKFLOW_CARDS.map((card) => {
            const Icon = card.icon;

            return (
              <div
                key={card.title}
                className="rounded-2xl border border-[#dfe7d8] bg-white p-5 flex flex-col justify-between hover:border-[#b8f58b] transition-all hover:shadow-md group"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="h-10 w-10 rounded-xl bg-[#edf7e8] text-[#2d6130] flex items-center justify-center group-hover:bg-[#062d22] group-hover:text-[#b8f58b] transition-colors">
                      <Icon size={20} />
                    </div>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white border border-[#dfe7d8] text-[#57655d] flex items-center gap-1">
                      <Clock size={10} />
                      {card.stage}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-[#10251d] group-hover:text-[#062d22] transition-colors">
                      {card.title}
                    </h3>
                    <p className="mt-1 text-xs text-[#57655d] leading-relaxed">
                      {card.description}
                    </p>
                  </div>

                  <div className="pt-2">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#57655d] mb-1.5">
                      Verified Capabilities
                    </div>
                    <ul className="space-y-1">
                      {card.capabilities.map((cap, i) => (
                        <li key={i} className="text-[11px] text-[#394a41] flex items-start gap-1.5">
                          <span className="text-[#2d6130] font-bold">✓</span>
                          <span>{cap}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-[#edf1ea] flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-[#57655d]">
                    Scheduled for {card.stage}
                  </span>
                  <div className="h-7 w-7 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center">
                    <ArrowRight size={13} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
