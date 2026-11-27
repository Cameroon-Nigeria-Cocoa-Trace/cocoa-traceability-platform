"use client";

import React, { Suspense, useState } from "react";
import { SignIn, SignUp } from "@clerk/nextjs";

interface ClerkPhoneAuthProps {
  defaultMode?: "signin" | "signup";
  redirectUrl?: string | null;
}

export function ClerkPhoneAuth({
  defaultMode = "signup",
  redirectUrl,
}: ClerkPhoneAuthProps) {
  const [mode, setMode] = useState<"signin" | "signup">(defaultMode);
  const targetUrl = redirectUrl || "/dashboard";

  return (
    <div className="space-y-4">
      <div className="flex rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-1.5 shadow-inner">
        <button
          type="button"
          onClick={() => setMode("signup")}
          className={`flex-1 rounded-xl py-2.5 text-xs font-bold transition-all cursor-pointer ${
            mode === "signup"
              ? "bg-white text-[#10251d] shadow-sm ring-1 ring-black/5"
              : "text-[#57655d] hover:text-[#10251d] hover:bg-white/50"
          }`}
        >
          Phone Sign Up
        </button>
        <button
          type="button"
          onClick={() => setMode("signin")}
          className={`flex-1 rounded-xl py-2.5 text-xs font-bold transition-all cursor-pointer ${
            mode === "signin"
              ? "bg-white text-[#10251d] shadow-sm ring-1 ring-black/5"
              : "text-[#57655d] hover:text-[#10251d] hover:bg-white/50"
          }`}
        >
          Phone Sign In
        </button>
      </div>

      <div className="flex justify-center">
        <Suspense fallback={<div className="py-6 text-xs text-[#57655d]">Loading phone authentication...</div>}>
          {mode === "signup" ? (
            <SignUp routing="hash" forceRedirectUrl={targetUrl} />
          ) : (
            <SignIn routing="hash" forceRedirectUrl={targetUrl} />
          )}
        </Suspense>
      </div>
    </div>
  );
}
