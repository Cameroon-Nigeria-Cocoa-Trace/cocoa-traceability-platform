import Link from "next/link";
import { Navbar } from "@/components/Navbar";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[#f7f8f3] text-[#10251d]">
      <Navbar />

      <main className="flex min-h-[calc(100vh-6rem)] items-center justify-center px-5 py-12">
        <section className="w-full max-w-md rounded-[32px] border border-[#dfe7d8] bg-white/80 p-8 shadow-[0_20px_40px_rgba(16,37,29,0.08)] backdrop-blur-sm">
          <span className="text-xs font-bold uppercase tracking-[0.22em] text-[#2d6130]">Welcome back</span>
          <h1 className="mt-3 text-3xl font-semibold text-[#10251d]">Log in</h1>

          <form className="mt-8 space-y-5">
            <label className="block text-sm font-medium text-[#10251d]">
              <span className="mb-2 block">Email</span>
              <input
                type="email"
                placeholder="you@example.com"
                className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] px-4 py-3 text-base text-[#10251d] outline-none transition focus:border-[#2d6130] focus:bg-white"
              />
            </label>

            <label className="block text-sm font-medium text-[#10251d]">
              <span className="mb-2 block">Password</span>
              <input
                type="password"
                placeholder="Enter your password"
                className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] px-4 py-3 text-base text-[#10251d] outline-none transition focus:border-[#2d6130] focus:bg-white"
              />
            </label>

            <button type="submit" className="w-full rounded-full bg-[#b8f58b] px-5 py-3.5 text-base font-bold text-[#073b2b] shadow-[0_14px_28px_rgba(184,245,139,0.18)] transition-transform hover:-translate-y-0.5">
              Continue
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-[#4b594f]">
            No account yet? <Link href="/signup" className="font-semibold text-[#2d6130]">Register Your Farm</Link>
          </p>
        </section>
      </main>
    </div>
  );
}
