import { SignIn } from "@clerk/nextjs";
import { Suspense } from "react";

export default function SignInPage() {
  const hasClerkKey = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#031d16] p-4">
      {hasClerkKey ? (
        <Suspense fallback={<div className="text-sm text-white/70">Loading sign-in...</div>}>
          <SignIn />
        </Suspense>
      ) : (
        <div className="max-w-md rounded-2xl border border-white/15 bg-[#062d22] p-6 text-white shadow-xl">
          <h1 className="text-lg font-bold">Clerk Authentication Setup</h1>
          <p className="mt-2 text-xs text-white/80 leading-relaxed">
            Run <code className="rounded bg-black/30 px-1.5 py-0.5 text-[#b8f58b]">npx -y clerk@latest auth login</code> and{" "}
            <code className="rounded bg-black/30 px-1.5 py-0.5 text-[#b8f58b]">npx -y clerk@latest env pull</code> in your host terminal to load keys for{" "}
            <code className="text-[#b8f58b]">app_3LEsgJ5eX9EBc5Ue5VMKUQCxLjo</code>.
          </p>
        </div>
      )}
    </main>
  );
}
