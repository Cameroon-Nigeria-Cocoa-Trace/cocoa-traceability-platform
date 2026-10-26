"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { useFirebase } from "@/context/FirebaseContext";
import { UserCheck, Store, Truck, Building2, ShieldCheck, ArrowRight, CheckCircle2, LogIn, LayoutDashboard } from "lucide-react";

const ROLES = [
  {
    id: "farmer",
    title: "Farmer / Producer",
    description: "Register your cocoa farm, map boundaries with geofencing, log harvest seasons, and apply for traceable certificates.",
    icon: UserCheck,
    badge: "Origin Producer",
    href: "/signup",
    highlight: true,
  },
  {
    id: "cooperative",
    title: "Cooperative",
    description: "Coordinate farmer groups, manage collection centers, oversee cooperative inventory, and execute certificate transfers.",
    icon: Store,
    badge: "Collection Hub",
    href: "/signup/cooperative",
  },
  {
    id: "agent",
    title: "Buying Agent",
    description: "Manage regional cocoa purchasing, corridor logistics, and farmer-to-warehouse delivery operations.",
    icon: Truck,
    badge: "Supply Chain",
    href: "/dashboard/agent",
  },
  {
    id: "warehouse",
    title: "Warehouse Custody",
    description: "Manage storage facilities, inspect incoming consignments, monitor moisture content, and oversee custodial stock.",
    icon: Building2,
    badge: "Storage & Export",
    href: "/dashboard/warehouse",
  },
];

export default function GetStartedPage() {
  const router = useRouter();
  const { user } = useFirebase();
  const [selectedRole, setSelectedRole] = useState<string>("farmer");

  const handleContinue = () => {
    if (user) {
      router.push("/dashboard");
      return;
    }
    const roleObj = ROLES.find((r) => r.id === selectedRole);
    if (roleObj) {
      router.push(roleObj.href);
    } else {
      router.push("/signup");
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f8f3] text-[#10251d]">
      <Navbar />

      <main className="mx-auto max-w-5xl px-4 pt-28 pb-20 sm:px-6 sm:pt-36 lg:px-8">
        <div className="text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#edf7e8] px-3.5 py-1 text-xs font-bold uppercase tracking-[0.2em] text-[#2d6130] border border-[#d2ecc8]">
            <ShieldCheck size={14} /> TraceTradeNetwork Onboarding
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-[#10251d] sm:text-5xl">
            {user ? "Welcome Back!" : "Who are you in the supply chain?"}
          </h1>
          <p className="mt-3 max-w-2xl mx-auto text-sm sm:text-base text-[#57655d] leading-relaxed">
            {user
              ? `You are currently signed in as ${user.email || user.displayName || "authenticated user"}. Click Continue to access your dashboard.`
              : "Select your role to access tailored dashboards, workflows, certificate management, and traceability tools designed for your stakeholder type."}
          </p>
        </div>

        {!user && (
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-2">
            {ROLES.map((role) => {
              const Icon = role.icon;
              const isSelected = selectedRole === role.id;

              return (
                <div
                  key={role.id}
                  onClick={() => setSelectedRole(role.id)}
                  className={`relative flex flex-col justify-between rounded-[28px] border p-6 transition cursor-pointer ${
                    isSelected
                      ? "border-[#2d6130] bg-[#edf7e8]/60 shadow-[0_12px_30px_rgba(45,97,48,0.12)] ring-2 ring-[#2d6130]"
                      : "border-[#dfe7d8] bg-white hover:border-[#b8f58b] hover:shadow-md"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div
                        className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                          isSelected ? "bg-[#0b3528] text-[#b8f58b]" : "bg-[#f1f6ec] text-[#2d6130]"
                        }`}
                      >
                        <Icon size={24} />
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                          isSelected
                            ? "bg-[#0b3528] text-white"
                            : "bg-[#f1f4ec] text-[#57655d]"
                        }`}
                      >
                        {role.badge}
                      </span>
                    </div>

                    <h3 className="text-lg font-bold text-[#10251d]">{role.title}</h3>
                    <p className="mt-2 text-xs sm:text-sm text-[#57655d] leading-relaxed">
                      {role.description}
                    </p>
                  </div>

                  <div className="mt-6 flex items-center justify-between border-t border-[#edf1ea] pt-4">
                    <span className="text-xs font-semibold text-[#2d6130]">
                      {isSelected ? "Selected" : "Click to select"}
                    </span>
                    <div
                      className={`flex h-6 w-6 items-center justify-center rounded-full border ${
                        isSelected ? "border-[#0b3528] bg-[#0b3528] text-white" : "border-gray-300 bg-white text-transparent"
                      }`}
                    >
                      <CheckCircle2 size={14} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            type="button"
            onClick={handleContinue}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full bg-[#0b3528] px-8 py-4 text-base font-bold text-white shadow-md transition hover:bg-[#144737] cursor-pointer"
          >
            {user ? (
              <>
                <LayoutDashboard size={18} /> Go to My Dashboard
              </>
            ) : (
              <>
                Continue <ArrowRight size={18} />
              </>
            )}
          </button>
          <Link
            href="/"
            className="w-full sm:w-auto inline-flex items-center justify-center rounded-full border border-[#dfe7d8] bg-white px-6 py-4 text-base font-bold text-[#10251d] transition hover:bg-[#edf2ea]"
          >
            Back to Home
          </Link>
        </div>

        {!user && (
          <div className="mt-12 rounded-[24px] border border-[#d2ecc8] bg-[#edf7e8]/80 p-6 text-center shadow-xs">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0b3528] text-[#b8f58b]">
                <LogIn size={18} />
              </div>
              <div>
                <p className="text-sm font-bold text-[#10251d]">Already have an account?</p>
                <p className="text-xs text-[#57655d]">Sign in to your dashboard to manage your trade and supply chain operations.</p>
              </div>
              <Link
                href="/login"
                className="ml-0 sm:ml-4 inline-flex items-center gap-1.5 rounded-full bg-[#0b3528] px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#144737] whitespace-nowrap"
              >
                Login Now <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
