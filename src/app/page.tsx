import Link from "next/link";
import { ArrowRight, BadgeCheck, CreditCard, FileCheck2, MapPin, MapPinned, Network, Play, ShieldCheck, ShoppingBag, ShoppingCart, Smartphone, Truck } from "lucide-react";
import { Navbar } from "@/components/Navbar";

const features = [
  {
    icon: MapPin,
    title: "Farm Registration & Geofencing",
    description: "Farmers register and map their farms with accurate geolocation data.",
  },
  {
    icon: FileCheck2,
    title: "Traceability Certificates",
    description: "Apply for traceability certificates to ensure a verified cocoa supply chain.",
  },
  {
    icon: ShoppingCart,
    title: "Secure Marketplace",
    description: "Buyers and sellers trade with confidence, with full traceability records.",
  },
  {
    icon: Smartphone,
    title: "MTN MoMo & Remittance Integration",
    description: "Seemless payments for cross-border and local transactions.",
  },
  {
    icon: Truck,
    title: "Logistics & Storage",
    description: "Track transportation and storage with our cross-border logistics network.",
  },
];

const steps = [
  {
    number: "01",
    icon: MapPinned,
    title: "Register Farm",
    text: "Farmers register and geofence their cocoa farms.",
  },
  {
    number: "02",
    icon: BadgeCheck,
    title: "Get Certificate",
    text: "Production lots receive verified traceability records.",
  },
  {
    number: "03",
    icon: ShoppingBag,
    title: "Sell Cocoa",
    text: "Verified buyers purchase traceable cocoa.",
  },
  {
    number: "04",
    icon: CreditCard,
    title: "Secure Payment",
    text: "Transactions can be settled through supported payment providers.",
  },
  {
    number: "05",
    icon: Truck,
    title: "Track Logistics",
    text: "Follow transportation, storage and custody.",
  },
  {
    number: "06",
    icon: Network,
    title: "Trace to Origin",
    text: "Trace the supply chain back to the producing farms.",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#f7f8f3] text-[#10251d]">
      <Navbar />

      <section id="home" className="relative min-h-[760px] overflow-hidden bg-[#062c20]">
        <div className="absolute inset-0">
          <img src="/images/hero-cocoa-farm.jpg" alt="Cameroon cocoa farm" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#031d15]/95 via-[#062c20]/75 to-[#062c20]/20" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#062c20] via-transparent to-transparent" />
        </div>

        <div className="relative mx-auto flex min-h-[760px] w-full max-w-[1500px] items-center px-5 pb-20 pt-25 sm:px-7 md:px-10 lg:px-18">
          <div className="max-w-3xl">
            <div className="mb-3 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.22em] text-[#b8f58b]">
              <span className="h-px w-8 bg-[#b8f58b]" />
              Cameroon — Cross River Cocoa Traceability
            </div>

            <h1 className="text-4xl font-semibold leading-[0.95] tracking-[-0.04em] text-white sm:text-6xl lg:text-[5rem]">
              Genuine Cocoa.
              <br />
              <span className="text-white">Known Origin.</span>
              <br />
              <span className="text-[#b8f58b]">Global Trust.</span>
            </h1>

            <p className="mt-5 max-w-2xl text-lg leading-8 text-white/75 sm:text-xl">
              A transparent, secure and compliant platform that tracks Cameroonian cocoa from farm to international market, ensuring traceability, authenticity and trust for buyers and consumers worldwide.
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <Link href="/signup" className="group flex items-center gap-3 rounded-full bg-[#b8f58b] px-7 py-4 font-semibold text-[#073b2b] transition hover:bg-[#d2ffb9]">
                Register Your Farm
                <ArrowRight size={18} className="transition group-hover:translate-x-1" />
              </Link>

              <button type="button" className="flex items-center gap-3 rounded-full border border-white/30 px-7 py-4 font-medium text-white backdrop-blur transition hover:bg-white/10">
                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/50">
                  <Play size={12} fill="currentColor" />
                </span>
                Watch how it works
              </button>
            </div>
          </div>

          <div className="absolute bottom-24 right-8 hidden rounded-2xl border border-[#b8f58b]/30 bg-[#052e22]/80 p-5 backdrop-blur-xl xl:block">
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#b8f58b]/15">
                <ShieldCheck className="text-[#b8f58b]" />
              </div>

              <div>
                <p className="font-semibold text-white">EUDR Compliant</p>
                <p className="mt-1 text-xs text-white/60">Production country: Cameroon</p>
                <p className="text-xs text-white/60">Plot geolocation preserved</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="bg-white">
      <div className="mx-auto grid max-w-[88rem] py-10 sm:grid-cols-2 lg:grid-cols-5">
        {features.map((item, index) => {
          const Icon = item.icon;

          return (
            <div
              key={item.title}
              /* Added relative layout and pseudo-element classes for responsive dividers */
              className="group relative px-7 py-7 text-center transition hover:bg-[#f5f8f2]
                        after:absolute after:bg-gray-200
                        /* Mobile/Stacked: Short line at the bottom */
                        after:bottom-0 after:left-1/4 after:h-[1px] after:w-1/2
                        /* Large desktop (5 cols): Short line to the right of each item */
                        lg:after:right-0 lg:after:top-1/4 lg:after:h-1/2 lg:after:w-[1px] lg:after:left-auto lg:after:bottom-auto
                        /* Hide the line on the very last item */
                        last:after:hidden"
            >
              {/* Added mx-auto here to centralize the Icon box */}
              <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-[#e7f8df]">
                <Icon className="text-[#08744b]" size={22} />
              </div>

              <h3 className="font-semibold text-[#10251d]">
                {item.title}
              </h3>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                {item.description}
              </p>
            </div>
          );
        })}
      </div>
    </section>

    <section className="bg-[#f4f6ef] py-24">
      <div className="mx-auto max-w-[88rem] px-6 lg:px-8">
        <div className="grid gap-16 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#08744b]">
              How it works
            </p>

            <h2 className="mt-5 text-4xl font-semibold tracking-tight text-[#10251d] sm:text-5xl">
              From farm
              <br />
              to global market.
            </h2>

            <p className="mt-4 max-w-md text-lg leading-8 text-slate-500">
              Every movement creates a traceable digital record,
              preserving the origin and chain of custody of the cocoa.
            </p>
            <Link href="/signup" className="group mt-4 max-w-43 flex items-center gap-3 rounded-full bg-[#075d3d] px-7 py-4 font-semibold text-white! transition hover:bg-[#b8f58b] hover:text-black!">
                Learn more
                <ArrowRight size={18} className="transition group-hover:translate-x-1" />
            </Link>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {steps.map((step) => {
              const Icon = step.icon;

              return (
                <div
                  key={step.number}
                  className="rounded-3xl border border-[#dfe6da] bg-white p-7 transition hover:-translate-y-1 hover:shadow-xl"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#075d3d]">
                      <Icon className="text-[#b8f58b]" size={20} />
                    </div>

                    <span className="text-sm font-semibold text-slate-300">
                      {step.number}
                    </span>
                  </div>

                  <h3 className="mt-7 text-lg font-semibold">
                    {step.title}
                  </h3>

                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    {step.text}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>

    <section>
      <div>
        <img src="/images/cameroon-crossriver-section.jpg" alt="Cameroon cocoa farm" className="h-full w-full object-cover" />
      </div>
    </section>

    <section className="bg-white pt-10 pb-17">
      <div className="mx-auto max-w-[88rem] px-6 lg:px-8">
        <p className="text-center text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
          Built for the cocoa supply chain
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-16 gap-y-8 opacity-60 grayscale">
          <span className="text-xl font-bold">MTN MoMo</span>
          <span className="text-xl font-bold">CocoaTrace</span>
          <span className="text-xl font-bold">Cameroon</span>
          <span className="text-xl font-bold">Cross River</span>
          <span className="text-xl font-bold">EUDR</span>
        </div>
      </div>
    </section>

    <section className="bg-[#f7f8f3] px-6 py-20">
      <div className="mx-auto max-w-[85rem] overflow-hidden rounded-[2rem] bg-[#06432f] px-8 py-14 text-white sm:px-14">
        <div className="flex flex-col items-start justify-between gap-10 md:flex-row md:items-center">
          <div>
            <p className="text-sm font-medium text-[#b8f58b]">
              BUILDING A BETTER COCOA SUPPLY CHAIN
            </p>

            <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
              Better traceability.
              <br />
              Greater confidence.
            </h2>
          </div>

          <Link
            href="/register"
            className="group flex shrink-0 items-center gap-3 rounded-full bg-[#b8f58b] px-7 py-4 font-semibold text-[#073b2b]!"
          >
            Get Started
            <ArrowRight
              size={18}
              className="transition group-hover:translate-x-1"
            />
          </Link>
        </div>
      </div>
    </section>

    <footer className="bg-[#031d16] text-white">
      <div className="mx-auto max-w-[88rem] px-6 py-16 lg:px-8">
        <div className="grid gap-12 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#b8f58b]">
                🌿
              </div>

              <div>
                <div className="font-bold">CocoaTrace</div>
                <div className="text-[10px] uppercase tracking-widest text-white/40">
                  From Farm to World
                </div>
              </div>
            </div>

            <p className="mt-6 max-w-md text-sm leading-7 text-white/45">
              Digital traceability infrastructure for preserving cocoa
              provenance, ownership and supply-chain visibility.
            </p>
          </div>

          <div>
            <h3 className="font-semibold">Platform</h3>

            <div className="mt-5 flex flex-col gap-3 text-sm text-white/45">
              <Link href="/features">Features</Link>
              <Link href="/farmers">For Farmers</Link>
              <Link href="/buyers">For Buyers</Link>
              <Link href="/marketplace">Marketplace</Link>
              <Link href="/logistics">Logistics</Link>
            </div>
          </div>

          <div>
            <h3 className="font-semibold">Company</h3>

            <div className="mt-5 flex flex-col gap-3 text-sm text-white/45">
              <Link href="/about">About</Link>
              <Link href="/contact">Contact</Link>
              <Link href="/privacy">Privacy</Link>
              <Link href="/terms">Terms</Link>
            </div>
          </div>
        </div>

        <div className="mt-16 border-t border-white/10 pt-7 text-sm text-white/30">
          © {new Date().getFullYear()} CocoaTrace. All rights reserved.
        </div>
      </div>
    </footer>
    </main>
  );
}
