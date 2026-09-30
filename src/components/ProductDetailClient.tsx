"use client";

import Link from "next/link";
import { useState } from "react";
import { Product, traceFlow } from "@/data/products";
import { CheckCircle2, ShieldCheck, MapPin } from "lucide-react";

export function ProductDetailClient({ product }: { product: Product }) {
  const [verified, setVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const handleVerify = () => {
    setVerifying(true);
    setTimeout(() => {
      setVerifying(false);
      setVerified(true);
    }, 400);
  };

  const verificationMessage = `Certificate ${product.trace} verified in Cloud Firestore. The cocoa remains of 100% Cameroonian origin and is traceable to ${product.origin}.`;

  return (
    <main className="mx-auto max-w-[1280px] px-6 py-10 lg:px-8">
      <section className="mb-8 flex flex-col gap-6 rounded-[32px] border border-[#dfe7d8] bg-white p-6 shadow-[0_18px_35px_rgba(16,37,29,0.05)] lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-[0.22em] text-[#2d6130]">
              Traceability record
            </span>
            <span className="flex items-center gap-1 rounded-full bg-[#edf7e8] px-2.5 py-0.5 text-[0.65rem] font-bold text-[#2d6130]">
              <ShieldCheck size={12} />
              EUDR Origin Locked
            </span>
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[#10251d] md:text-4xl">
            {product.title}
          </h1>
          <p className="mt-3 text-base leading-7 text-[#4f5d56]">{product.description}</p>
        </div>

        <aside className="w-full max-w-md rounded-[24px] border border-[#dfe7d8] bg-[#f8f9f3] p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <span className="rounded-full bg-[#edf7e8] px-3 py-1 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[#2d6130]">
              {product.compliance}
            </span>
            <strong className="text-xl font-bold text-[#10251d]">{product.price}</strong>
          </div>

          <dl className="space-y-3 text-sm text-[#394a41]">
            <div className="flex items-center justify-between gap-4 border-b border-[#edf1ea] pb-2">
              <dt className="text-[#57655d]">Seller</dt>
              <dd className="font-medium text-[#10251d]">{product.seller}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-[#edf1ea] pb-2">
              <dt className="text-[#57655d]">Quantity</dt>
              <dd className="font-medium text-[#10251d]">{product.quantity}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-[#edf1ea] pb-2">
              <dt className="text-[#57655d]">Origin</dt>
              <dd className="font-medium text-[#10251d]">{product.origin}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 pb-1">
              <dt className="text-[#57655d]">Geolocation</dt>
              <dd className="font-mono text-xs font-medium text-[#10251d] flex items-center gap-1">
                <MapPin size={12} className="text-[#2d6130]" />
                {product.geolocation}
              </dd>
            </div>
          </dl>
        </aside>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.8fr_0.9fr]">
        <div className="rounded-[28px] border border-[#dfe7d8] bg-white p-6 shadow-[0_18px_35px_rgba(16,37,29,0.05)]">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <small className="text-xs font-medium uppercase tracking-[0.16em] text-[#627064]">
                Lot reference
              </small>
              <h2 className="mt-2 text-2xl font-semibold text-[#10251d]">{product.id}</h2>
            </div>
            <span className="rounded-full bg-[#eefbf3] px-3 py-1 text-[0.68rem] font-semibold text-[#1d6a45]">
              {product.status}
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-[#f8f9f3] p-4">
              <label className="text-xs uppercase tracking-[0.12em] text-[#627064]">Seller</label>
              <strong className="mt-2 block text-base font-semibold text-[#10251d]">{product.seller}</strong>
            </div>
            <div className="rounded-2xl bg-[#f8f9f3] p-4">
              <label className="text-xs uppercase tracking-[0.12em] text-[#627064]">Trace ID</label>
              <strong className="mt-2 block font-mono text-base font-semibold text-[#10251d]">{product.trace}</strong>
            </div>
            <div className="rounded-2xl bg-[#f8f9f3] p-4">
              <label className="text-xs uppercase tracking-[0.12em] text-[#627064]">Origin</label>
              <strong className="mt-2 block text-base font-semibold text-[#10251d]">{product.origin}</strong>
            </div>
            <div className="rounded-2xl bg-[#f8f9f3] p-4">
              <label className="text-xs uppercase tracking-[0.12em] text-[#627064]">Route</label>
              <strong className="mt-2 block text-base font-semibold text-[#10251d]">{product.route}</strong>
            </div>
          </div>

          <ul className="mt-8 space-y-4">
            {traceFlow.map((item) => (
              <li key={item.step} className="flex items-start gap-4 rounded-2xl border border-[#edf1ea] p-4">
                <span className="mt-1 inline-flex h-3.5 w-3.5 shrink-0 rounded-full bg-[#b8f58b] ring-4 ring-[#edf7e8]" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <strong className="block text-base font-semibold text-[#10251d]">{item.step}</strong>
                  <p className="mt-1 text-sm leading-6 text-[#4f5d56]">{item.detail}</p>
                </div>
                <time className="text-sm font-medium text-[#627064]">{item.date}</time>
              </li>
            ))}
          </ul>
        </div>

        <aside className="rounded-[28px] border border-[#dfe7d8] bg-white p-6 shadow-[0_18px_35px_rgba(16,37,29,0.05)]">
          <h3 className="text-xl font-semibold text-[#10251d]">Certificate verification</h3>
          <label className="mt-5 block text-xs font-medium uppercase tracking-[0.12em] text-[#627064]">
            Certificate ID
          </label>
          <input
            readOnly
            value={product.trace}
            className="mt-2 w-full font-mono rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] px-4 py-3 text-base text-[#10251d] outline-none"
          />

          <div className="mt-5 flex flex-col gap-3">
            <button
              type="button"
              onClick={handleVerify}
              disabled={verifying}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#b8f58b] px-5 py-3 text-base font-bold text-[#073b2b] shadow-[0_14px_28px_rgba(184,245,139,0.18)] transition-transform hover:-translate-y-0.5 cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 size={18} />
              {verifying ? "Validating..." : verified ? "Re-verify Batch" : "Verify Sale Certificate"}
            </button>
            <Link
              href="/marketplace"
              className="inline-flex items-center justify-center rounded-full border border-[#dfe7d8] bg-white px-5 py-3 text-base font-bold text-[#10251d] transition hover:bg-[#f7f8f3]"
            >
              Back to marketplace
            </Link>
          </div>

          <div className="mt-5 rounded-2xl bg-[#edf7e8] p-4 text-sm leading-6 text-[#1a4936]">
            {verificationMessage}
          </div>
        </aside>
      </section>
    </main>
  );
}
