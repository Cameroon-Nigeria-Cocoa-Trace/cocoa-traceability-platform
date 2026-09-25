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

        <div className="relative mx-auto flex min-h-[760px] w-full max-w-[1500px] items-center px-5 pb-20 pt-20 sm:px-7 md:px-10 lg:px-18">
          <div className="max-w-3xl">
            <div className="mb-3 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#b8f58b] sm:text-xs sm:tracking-[0.22em]">
              <span className="h-px w-6 bg-[#b8f58b] sm:w-8" />
              Cameroon — Cross River Cocoa Traceability
            </div>

            <h1 className="text-[2.7rem] font-semibold leading-[0.95] tracking-[-0.04em] text-white sm:text-[4rem] lg:text-[5rem]">
              Genuine Cocoa.
              <br />
              <span className="text-white">Known Origin.</span>
              <br />
              <span className="text-[#b8f58b]">Global Trust.</span>
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-7 text-white/75 sm:text-lg sm:leading-8">
              A transparent, secure and compliant platform that tracks Cameroonian cocoa from farm to international market, ensuring traceability, authenticity and trust for buyers and consumers worldwide.
            </p>

            <div className="mt-8 flex flex-wrap gap-3 sm:gap-4">
              <Link href="/signup" className="group flex items-center gap-2 rounded-full bg-[#b8f58b] px-5 py-3 text-[1rem] font-semibold text-[#073b2b] transition hover:bg-[#d2ffb9] sm:gap-3 sm:px-7 sm:py-4 sm:text-base">
                Register Your Farm
                <ArrowRight size={18} className="transition group-hover:translate-x-1" />
              </Link>

              <button type="button" className="flex items-center gap-2 rounded-full border border-white/30 px-5 py-3 text-sm font-medium text-white backdrop-blur transition hover:bg-white/10 sm:gap-3 sm:px-7 sm:py-4 sm:text-base">
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
              className="group relative px-7 py-7 text-center text-[1.2rem] transition hover:bg-[#f5f8f2]
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

    <section className="bg-[#f4f6ef] py-16 sm:py-24">
      <div className="mx-auto max-w-[88rem] px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#08744b] sm:text-xs">
              How it works
            </p>

            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[#10251d] sm:mt-5 sm:text-4xl lg:text-5xl">
              From farm
              <br />
              to global market.
            </h2>

            <p className="mt-4 max-w-md text-base leading-7 text-slate-500 sm:text-lg sm:leading-8">
              Every movement creates a traceable digital record,
              preserving the origin and chain of custody of the cocoa.
            </p>
            <Link href="/signup" className="group mt-4 inline-flex items-center gap-3 rounded-full bg-[#075d3d] px-5 py-3 text-sm font-semibold text-white! transition hover:bg-[#b8f58b] hover:text-black sm:px-7 sm:py-4 sm:text-base">
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

    <section className="relative w-full overflow-hidden bg-[#e7ece1]">
      {/* The Background Image */}
      <div className="w-full">
        <img
          src="/images/cameroon-crossriver-section.jpg"
          alt="Cameroon cocoa farm"
          className="h-[400px] w-full object-cover object-center sm:h-[400px] md:h-[450px] lg:h-full"
        />
      </div>

      {/* Dynamic Text & Button Overlay Container */}
      <div className="absolute inset-0 flex items-center justify-center pb-10 lg:pb-15 lg:pr-23">
        <div className="w-full max-w-7xl px-5 sm:px-7 lg:px-10">
          
          {/* 
            This wrapper positions your text directly in the center column. 
            It aligns perfectly with the visual gap between the cocoa pods and the phone mockup.
          */}
          <div className="ml-auto mr-auto max-w-md text-left md:max-w-xl lg:ml-[38%] lg:mr-0 lg:max-w-lg xl:ml-[40%]">
            
            {/* Top Tagline */}
            <p className="text-[10px] font-bold tracking-widest text-[#b8f58b] uppercase sm:text-xs">
              Trusted by Farmers. Powered by Technology.
            </p>

            {/* Main Heading */}
            <h2 className="mt-2 text-xl font-bold leading-tight text-white sm:text-3xl md:text-4xl">
              CocoaTrace connects Cameroon's cocoa to the world.
            </h2>

            {/* 4-Column Stats Grid */}
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-2">
              <div>
                <div className="text-xl font-black text-white sm:text-2xl">100%</div>
                <div className="text-[10px] leading-tight text-white/70 sm:text-xs">Traceable from farm to export</div>
              </div>
              <div>
                <div className="text-xl font-black text-white sm:text-2xl">500+</div>
                <div className="text-[10px] leading-tight text-white/70 sm:text-xs">Registered Farmers</div>
              </div>
              <div>
                <div className="text-xl font-black text-white sm:text-2xl">50+</div>
                <div className="text-[10px] leading-tight text-white/70 sm:text-xs">Active Buyers</div>
              </div>
              <div>
                <div className="text-xl font-black text-white sm:text-2xl">10+</div>
                <div className="text-[10px] leading-tight text-white/70 sm:text-xs">Logistics Partners</div>
              </div>
            </div>

            {/* Call to Action Button */}
            <div className="mt-6">
              <button className="flex items-center gap-2 rounded-full bg-[#b8f58b] px-6 py-2.5 text-xs font-bold text-[#062d22] transition hover:bg-[#d0ffb0] sm:text-[0.8rem]">
                Join the Movement 
                <span className="text-sm font-light">→</span>
              </button>
            </div>

          </div>

        </div>
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

    <section className="bg-[#f7f8f3] px-4 py-14 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-[85rem] overflow-hidden rounded-[2rem] bg-[#06432f] px-6 py-10 text-white sm:px-14 sm:py-14">
        <div className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#b8f58b] sm:text-sm sm:tracking-[0.2em]">
              BUILDING A BETTER COCOA SUPPLY CHAIN
            </p>

            <h2 className="mt-3 max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl lg:text-4xl">
              Better traceability.
              <br />
              Greater confidence.
            </h2>
          </div>

          <Link
            href="/register"
            className="group inline-flex shrink-0 items-center gap-3 rounded-full bg-[#b8f58b] px-5 py-3 text-sm font-semibold text-[#073b2b] sm:px-7 sm:py-4 sm:text-base"
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
