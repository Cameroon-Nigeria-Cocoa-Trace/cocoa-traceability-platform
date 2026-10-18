import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { ShieldCheck, MapPin, Building2, CheckCircle2, ArrowRight } from "lucide-react";

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[#f7f8f3] text-[#10251d]">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 pt-28 pb-20 sm:px-6 sm:pt-32 lg:px-8">
        {/* Header */}
        <div className="max-w-3xl">
          <span className="rounded-full bg-[#edf7e8] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#2d6130]">
            About TraceTradeNetwork
          </span>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-[#10251d] sm:text-5xl">
            Empowering the Cross-Border Cocoa Supply Chain
          </h1>
          <p className="mt-4 text-base sm:text-lg leading-relaxed text-[#57655d]">
            TraceTradeNetwork is a premier digital traceability and trade platform connecting cocoa producers, cooperatives, licensed buying agents, and exporters across Cameroon and Nigeria.
          </p>
        </div>

        {/* Mission / Vision Grid */}
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          <div className="rounded-3xl border border-[#dfe7d8] bg-white p-6 sm:p-8 shadow-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#edf7e8] text-[#2d6130] mb-4">
              <ShieldCheck size={24} />
            </div>
            <h3 className="text-lg font-bold text-[#10251d]">EUDR Compliance</h3>
            <p className="mt-2 text-xs sm:text-sm text-[#57655d] leading-relaxed">
              Complete deforestation-risk mitigation with rigorous GPS polygon geofencing, mapping producer plots directly to European Union Deforestation Regulation standards.
            </p>
          </div>

          <div className="rounded-3xl border border-[#dfe7d8] bg-white p-6 sm:p-8 shadow-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#edf7e8] text-[#2d6130] mb-4">
              <MapPin size={24} />
            </div>
            <h3 className="text-lg font-bold text-[#10251d]">Cross-Border Hubs</h3>
            <p className="mt-2 text-xs sm:text-sm text-[#57655d] leading-relaxed">
              Operating seamlessly across the Ndian / Kumba hub in Cameroon and the Ikom trading corridor in Cross River State, Nigeria.
            </p>
          </div>

          <div className="rounded-3xl border border-[#dfe7d8] bg-white p-6 sm:p-8 shadow-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#edf7e8] text-[#2d6130] mb-4">
              <Building2 size={24} />
            </div>
            <h3 className="text-lg font-bold text-[#10251d]">Secure Escrow &amp; Trade</h3>
            <p className="mt-2 text-xs sm:text-sm text-[#57655d] leading-relaxed">
              Automated settlement, MTN MoMo integration, and Flutterwave payment gateways guaranteeing transparent financial transactions for every lot.
            </p>
          </div>
        </div>

        {/* Powered By Section */}
        <div className="mt-16 rounded-[32px] border border-[#dfe7d8] bg-white p-8 sm:p-12 shadow-sm">
          <div className="max-w-2xl">
            <span className="text-xs font-bold uppercase tracking-wider text-[#2d6130]">
              Infrastructure &amp; Operations
            </span>
            <h2 className="mt-2 text-2xl font-bold text-[#10251d]">
              Powered by Leading Regional Partners
            </h2>
            <p className="mt-2 text-sm text-[#57655d]">
              TraceTradeNetwork is jointly engineered and operated by trusted logistics and technology leaders across Central and West Africa.
            </p>
          </div>

          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            <div className="rounded-2xl border border-[#dfe7d8] bg-[#fafcf9] p-6">
              <span className="rounded-full bg-[#edf7e8] px-2.5 py-1 text-[11px] font-bold text-[#2d6130]">
                Cameroon Operations
              </span>
              <h3 className="mt-3 text-lg font-bold text-[#10251d]">Slite Ltd</h3>
              <p className="mt-1 text-xs text-[#57655d] flex items-center gap-1.5">
                <MapPin size={14} className="text-[#2d6130]" /> Buea, South West, Cameroon
              </p>
              <p className="mt-2 text-xs text-[#57655d]">
                Technology infrastructure, farmer onboarding, and EUDR compliance verification.
              </p>
              <div className="mt-4 pt-3 border-t border-[#edf1ea] text-xs font-mono font-bold text-[#10251d]">
                Tel: +237 72 11 53 66
              </div>
            </div>

            <div className="rounded-2xl border border-[#dfe7d8] bg-[#fafcf9] p-6">
              <span className="rounded-full bg-[#edf7e8] px-2.5 py-1 text-[11px] font-bold text-[#2d6130]">
                Nigeria Operations
              </span>
              <h3 className="mt-3 text-lg font-bold text-[#10251d]">Bota Supplies and Logistics</h3>
              <p className="mt-1 text-xs text-[#57655d] flex items-center gap-1.5">
                <MapPin size={14} className="text-[#2d6130]" /> Ikom, Cross River State, Nigeria
              </p>
              <p className="mt-2 text-xs text-[#57655d]">
                Cross-border aggregation, off-taker logistics, and buyer trade facilitation.
              </p>
              <div className="mt-4 pt-3 border-t border-[#edf1ea] text-xs font-mono font-bold text-[#10251d]">
                Tel: +234 701 880 0849 | Email: magboyo@yahoo.com
              </div>
            </div>
          </div>
        </div>

        {/* CTA Banner */}
        <div className="mt-16 text-center">
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-2 rounded-full bg-[#0b3528] px-8 py-4 text-sm font-bold text-white shadow-md hover:bg-[#07241b]"
          >
            Explore Cocoa Marketplace <ArrowRight size={16} />
          </Link>
        </div>
      </main>
    </div>
  );
}
