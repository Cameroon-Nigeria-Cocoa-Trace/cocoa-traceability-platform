"use client";

import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { useFirebase } from "@/context/FirebaseContext";
import { ShieldCheck, MapPin } from "lucide-react";

export default function MarketplacePage() {
  const { lots } = useFirebase();

  return (
    <div className="min-h-screen bg-[#f7f8f3] text-[#10251d]">
      <Navbar />

      {/* FIXED: Applied pt-28 sm:pt-32 to clear fixed navbar */}
      <main className="mx-auto max-w-[1280px] px-6 pt-28 pb-14 sm:pt-32 lg:px-8">
        <section className="mb-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-[0.22em] text-[#2d6130]">
                Marketplace
              </span>
              <span className="flex items-center gap-1 rounded-full bg-[#edf7e8] px-2.5 py-0.5 text-[0.65rem] font-bold text-[#2d6130]">
                <ShieldCheck size={12} />
                Verified Catalog
              </span>
            </div>
            <h1 className="mt-3 max-w-2xl text-3xl font-semibold tracking-[-0.04em] text-[#10251d] md:text-4xl">
              Cocoa lots available for purchase
            </h1>
            <p className="mt-2 text-sm text-[#57655d]">
              Verified single-origin cocoa beans, nibs, and powder with audited EUDR geolocation records.
            </p>
          </div>

          <Link
            href="/signup"
            className="inline-flex items-center justify-center rounded-full bg-[#b8f58b] px-6 py-3.5 text-sm font-bold text-[#073b2b] shadow-[0_14px_28px_rgba(184,245,139,0.18)] transition-transform hover:-translate-y-0.5"
          >
            Register Your Farm
          </Link>
        </section>

        <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {lots.map((product) => (
            <article
              key={product.id}
              className="rounded-[28px] border border-[#dfe7d8] bg-white p-5 shadow-[0_18px_35px_rgba(16,37,29,0.06)]"
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <span className="rounded-full bg-[#edf7e8] px-3 py-1 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[#2d6130]">
                  {product.compliance}
                </span>
                <span className="rounded-full bg-[#eefbf3] px-3 py-1 text-[0.68rem] font-semibold text-[#1d6a45]">
                  {product.status}
                </span>
              </div>

              <h2 className="text-xl font-semibold text-[#10251d]">{product.title}</h2>
              <p className="mt-2 text-sm text-[#57655d]">{product.seller}</p>

              <dl className="mt-6 space-y-3 text-sm text-[#394a41]">
                <div className="flex items-center justify-between gap-3 border-b border-[#edf1ea] pb-2">
                  <dt className="text-[#57655d]">Origin</dt>
                  <dd className="font-medium text-[#10251d]">{product.origin}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 border-b border-[#edf1ea] pb-2">
                  <dt className="text-[#57655d]">Quantity</dt>
                  <dd className="font-medium text-[#10251d]">{product.quantity}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 border-b border-[#edf1ea] pb-2">
                  <dt className="text-[#57655d]">Trace ID</dt>
                  <dd className="font-mono text-xs font-medium text-[#10251d]">{product.trace}</dd>
                </div>
                {product.geolocation && (
                  <div className="flex items-center justify-between gap-3 border-b border-[#edf1ea] pb-2">
                    <dt className="text-[#57655d] flex items-center gap-1">
                      <MapPin size={12} /> Geolocation
                    </dt>
                    <dd className="font-mono text-xs text-[#2d6130]">{product.geolocation}</dd>
                  </div>
                )}
              </dl>

              <div className="mt-6 flex items-center justify-between gap-3">
                <strong className="text-xl font-bold text-[#10251d]">{product.price}</strong>
                <Link
                  href={`/product/${product.id}`}
                  className="inline-flex items-center justify-center rounded-full bg-[#0b3528] px-4 py-2.5 text-sm font-bold text-white transition-transform hover:-translate-y-0.5"
                >
                  View trace
                </Link>
              </div>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
