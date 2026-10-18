"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { MapPin, Phone, Mail, Building2, CheckCircle2, Send } from "lucide-react";

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !message) return;
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-[#f7f8f3] text-[#10251d]">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 pt-28 pb-20 sm:px-6 sm:pt-32 lg:px-8">
        <div className="max-w-3xl">
          <span className="rounded-full bg-[#edf7e8] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#2d6130]">
            Get in Touch
          </span>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-[#10251d] sm:text-5xl">
            Contact TraceTradeNetwork
          </h1>
          <p className="mt-4 text-base sm:text-lg leading-relaxed text-[#57655d]">
            Have inquiries about cocoa traceability, buyer accounts, or cross-border logistics? Reach out to our regional operations teams in Cameroon and Nigeria.
          </p>
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-2">
          {/* Company Offices */}
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-[#10251d]">Our Operational Hubs</h2>

            <div className="rounded-3xl border border-[#dfe7d8] bg-white p-6 sm:p-8 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#edf7e8] text-[#2d6130]">
                  <Building2 size={22} />
                </div>
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#2d6130]">
                    Powered by Partner (Cameroon)
                  </span>
                  <h3 className="text-lg font-bold text-[#10251d]">Slite Solutions Ltd</h3>
                </div>
              </div>

              <div className="mt-5 space-y-3 text-xs sm:text-sm text-[#57655d]">
                <div className="flex items-start gap-2.5">
                  <MapPin size={18} className="shrink-0 text-[#2d6130] mt-0.5" />
                  <span>Buea, South West, Cameroon</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Phone size={18} className="shrink-0 text-[#2d6130]" />
                  <span className="font-mono font-bold text-[#10251d]">+237 72 11 53 66</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Mail size={18} className="shrink-0 text-[#2d6130]" />
                  <span className="italic text-gray-400">Email support available via platform</span>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-[#dfe7d8] bg-white p-6 sm:p-8 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#edf7e8] text-[#2d6130]">
                  <Building2 size={22} />
                </div>
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#2d6130]">
                    Powered by Partner (Nigeria)
                  </span>
                  <h3 className="text-lg font-bold text-[#10251d]">Bota Supplies and Logistics Ltd</h3>
                </div>
              </div>

              <div className="mt-5 space-y-3 text-xs sm:text-sm text-[#57655d]">
                <div className="flex items-start gap-2.5">
                  <MapPin size={18} className="shrink-0 text-[#2d6130] mt-0.5" />
                  <span>Ikom, Cross River State, Nigeria</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Phone size={18} className="shrink-0 text-[#2d6130]" />
                  <span className="font-mono font-bold text-[#10251d]">+234 701 880 0849</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Mail size={18} className="shrink-0 text-[#2d6130]" />
                  <span className="font-mono font-bold text-[#10251d]">magboyo@yahoo.com</span>
                </div>
              </div>
            </div>
          </div>

          {/* Contact Form */}
          <div className="rounded-3xl border border-[#dfe7d8] bg-white p-6 sm:p-8 shadow-sm">
            <h2 className="text-xl font-bold text-[#10251d]">Send us a Message</h2>
            <p className="mt-1 text-xs text-[#57655d]">
              Fill out the form and our support desk will respond within 24 hours.
            </p>

            {submitted ? (
              <div className="mt-6 rounded-2xl border border-green-200 bg-green-50 p-6 text-center">
                <CheckCircle2 size={32} className="mx-auto text-green-600 mb-2" />
                <h3 className="text-base font-bold text-green-900">Message Sent Successfully!</h3>
                <p className="mt-1 text-xs text-green-700">
                  Thank you for contacting TraceTradeNetwork. Our regional team will get back to you shortly.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSubmitted(false);
                    setName("");
                    setEmail("");
                    setMessage("");
                  }}
                  className="mt-4 rounded-full bg-[#0b3528] px-5 py-2 text-xs font-bold text-white hover:bg-[#07241b]"
                >
                  Send Another Message
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="mt-6 space-y-4 text-xs">
                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">Your Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Jean Dupont / Chief Manager"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] p-3 text-xs font-medium text-[#10251d] outline-none focus:bg-white focus:border-[#2d6130]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">Email Address</label>
                  <input
                    type="email"
                    placeholder="e.g. buyer@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] p-3 text-xs font-medium text-[#10251d] outline-none focus:bg-white focus:border-[#2d6130]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#10251d] mb-1">Message / Inquiry</label>
                  <textarea
                    required
                    rows={4}
                    placeholder="Tell us about your cocoa trade or traceability requirements..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="w-full rounded-xl border border-[#dfe7d8] bg-[#f7f8f3] p-3 text-xs font-medium text-[#10251d] outline-none focus:bg-white focus:border-[#2d6130]"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#0b3528] py-3.5 text-xs font-bold text-white shadow-sm hover:bg-[#07241b] cursor-pointer"
                >
                  <Send size={14} /> Send Inquiry
                </button>
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
