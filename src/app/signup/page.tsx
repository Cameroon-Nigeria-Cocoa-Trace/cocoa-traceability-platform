"use client";

import Link from "next/link";
import { useState } from "react";
import { Navbar } from "@/components/Navbar";
import { useFirebase } from "@/context/FirebaseContext";
import { MapPin, ShieldCheck, CheckCircle2, AlertCircle, LogIn, ArrowRight } from "lucide-react";

export default function SignupPage() {
  const { user, login, registerFarm, farms } = useFirebase();

  const [farmName, setFarmName] = useState("");
  const [region, setRegion] = useState("Southwest Cocoa Belt");
  const [cooperative, setCooperative] = useState("");
  const [geolocation, setGeolocation] = useState("4.2974°, 9.2401°");
  const [sizeHectares, setSizeHectares] = useState("3.5");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setError("Please sign in with Google first to register your farm plot.");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      const registered = await registerFarm({
        farmName: farmName.trim(),
        region: region.trim(),
        cooperative: cooperative.trim() || "Independent Cooperative",
        geolocation: geolocation.trim(),
        sizeHectares: parseFloat(sizeHectares) || 2.5,
        eudrCompliant: true,
      });

      setSuccess(`Farm "${registered.farmName}" successfully registered with EUDR ID ${registered.id}!`);
      setFarmName("");
      setCooperative("");
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to register farm.");
    } finally {
      setSubmitting(false);
    }
  };

  const userFarms = user ? farms.filter((f) => f.farmerId === user.uid) : [];

  return (
    <div className="min-h-screen bg-[#f7f8f3] text-[#10251d]">
      <Navbar />

      <main className="mx-auto max-w-5xl px-5 py-12">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-[32px] border border-[#dfe7d8] bg-white/90 p-8 shadow-[0_20px_40px_rgba(16,37,29,0.08)] backdrop-blur-sm">
            <span className="text-xs font-bold uppercase tracking-[0.22em] text-[#2d6130]">
              Farmer Registry
            </span>
            <h1 className="mt-3 text-3xl font-semibold text-[#10251d]">
              Register Your Farm Plot
            </h1>
            <p className="mt-2 text-sm text-[#4b594f]">
              Register and geofence your Cameroonian cocoa plantation to generate verified EUDR traceability records.
            </p>

            {error && (
              <div className="mt-5 flex items-center gap-2 rounded-2xl bg-red-50 p-4 text-sm text-red-700">
                <AlertCircle size={18} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="mt-5 flex items-center gap-2 rounded-2xl bg-[#edf7e8] p-4 text-sm text-[#1a4936]">
                <CheckCircle2 size={18} className="shrink-0 text-[#2a7a33]" />
                <span>{success}</span>
              </div>
            )}

            {!user ? (
              <div className="mt-8 rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] p-6 text-center">
                <h3 className="text-lg font-semibold text-[#10251d]">Authentication Required</h3>
                <p className="mt-2 text-sm text-[#57655d]">
                  Please sign in with Google to associate your farm plots with your verified account.
                </p>
                <button
                  type="button"
                  onClick={() => login()}
                  className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#0b3528] px-6 py-3 text-sm font-bold text-white shadow-md transition hover:bg-[#07241b] cursor-pointer"
                >
                  <LogIn size={16} />
                  Sign In with Google to Continue
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div className="rounded-2xl bg-[#edf7e8] p-3 text-xs text-[#1a4936]">
                  Connected as: <span className="font-semibold">{user.displayName || user.email}</span>
                </div>

                <label className="block text-sm font-medium text-[#10251d]">
                  <span className="mb-1 block">Farm or Plantation Name</span>
                  <input
                    type="text"
                    required
                    value={farmName}
                    onChange={(e) => setFarmName(e.target.value)}
                    placeholder="e.g. Mile 18 Smallholder Plot"
                    className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] px-4 py-3 text-base text-[#10251d] outline-none transition focus:border-[#2d6130] focus:bg-white"
                  />
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-[#10251d]">
                    <span className="mb-1 block">Region (Cameroon)</span>
                    <select
                      value={region}
                      onChange={(e) => setRegion(e.target.value)}
                      className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] px-4 py-3 text-base text-[#10251d] outline-none transition focus:border-[#2d6130] focus:bg-white"
                    >
                      <option value="Southwest Cocoa Belt">Southwest Cocoa Belt</option>
                      <option value="Bamenda Highlands">Bamenda Highlands</option>
                      <option value="Adamawa Corridor">Adamawa Corridor</option>
                      <option value="Littoral Zone">Littoral Zone</option>
                      <option value="Centre Region">Centre Region</option>
                    </select>
                  </label>

                  <label className="block text-sm font-medium text-[#10251d]">
                    <span className="mb-1 block">Cooperative / Aggregator</span>
                    <input
                      type="text"
                      value={cooperative}
                      onChange={(e) => setCooperative(e.target.value)}
                      placeholder="e.g. Ekondo Titi Aggregator"
                      className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] px-4 py-3 text-base text-[#10251d] outline-none transition focus:border-[#2d6130] focus:bg-white"
                    />
                  </label>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-[#10251d]">
                    <span className="mb-1 block">GPS Geolocation</span>
                    <input
                      type="text"
                      required
                      value={geolocation}
                      onChange={(e) => setGeolocation(e.target.value)}
                      placeholder="e.g. 5.9723°, 10.0162°"
                      className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] px-4 py-3 text-base text-[#10251d] outline-none transition focus:border-[#2d6130] focus:bg-white"
                    />
                  </label>

                  <label className="block text-sm font-medium text-[#10251d]">
                    <span className="mb-1 block">Plot Size (Hectares)</span>
                    <input
                      type="number"
                      step="0.1"
                      required
                      value={sizeHectares}
                      onChange={(e) => setSizeHectares(e.target.value)}
                      className="w-full rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] px-4 py-3 text-base text-[#10251d] outline-none transition focus:border-[#2d6130] focus:bg-white"
                    />
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-full bg-[#b8f58b] px-5 py-3.5 text-base font-bold text-[#073b2b] shadow-[0_14px_28px_rgba(184,245,139,0.18)] transition-transform hover:-translate-y-0.5 disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? "Registering in Firestore..." : "Register Farm & Issue Certificate"}
                </button>
              </form>
            )}

            <p className="mt-6 text-center text-sm text-[#4b594f]">
              Already registered? <Link href="/login" className="font-semibold text-[#2d6130]">View Account</Link>
            </p>
          </section>

          {/* Right Column: Registered Farms List */}
          <aside className="space-y-6">
            <div className="rounded-[32px] border border-[#dfe7d8] bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-[#10251d]">
                {user ? "Your Registered Plots" : "Registered Cameroon Plots"}
              </h2>
              <p className="mt-1 text-xs text-[#57655d]">
                Stored persistently in Cloud Firestore
              </p>

              <div className="mt-4 space-y-3">
                {userFarms.length > 0 ? (
                  userFarms.map((farm) => (
                    <div
                      key={farm.id}
                      className="rounded-2xl border border-[#edf1ea] bg-[#f9fbf7] p-4 text-sm"
                    >
                      <div className="flex items-center justify-between">
                        <strong className="text-base text-[#10251d]">{farm.farmName}</strong>
                        <span className="rounded-full bg-[#edf7e8] px-2.5 py-0.5 text-[0.65rem] font-bold text-[#2d6130]">
                          EUDR Compliant
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-[#57655d]">{farm.region} • {farm.cooperative}</p>
                      <div className="mt-2 flex items-center gap-1.5 text-xs font-mono text-[#2d6130]">
                        <MapPin size={13} />
                        {farm.geolocation} ({farm.sizeHectares} ha)
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-[#dfe7d8] p-6 text-center text-sm text-[#627064]">
                    <ShieldCheck size={28} className="mx-auto text-[#2d6130]/60 mb-2" />
                    No registered farm plots yet. Complete the form to register your first plot.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[28px] border border-[#dfe7d8] bg-[#063325] p-6 text-white">
              <span className="text-[10px] font-bold tracking-widest text-[#b8f58b] uppercase">
                EUDR Due Diligence
              </span>
              <h3 className="mt-2 text-lg font-semibold">
                Traceability Corridor
              </h3>
              <p className="mt-2 text-xs leading-5 text-white/75">
                Every farm plot registered in this database is anchored with precise polygon/point coordinates, enabling uncompromised origin verification as beans move through Cross River state into export hubs.
              </p>
              <Link
                href="/marketplace"
                className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-[#b8f58b] hover:underline"
              >
                Browse Traceable Lots <ArrowRight size={14} />
              </Link>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
