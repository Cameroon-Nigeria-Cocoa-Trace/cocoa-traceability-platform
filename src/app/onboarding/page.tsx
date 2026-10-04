'use client';

import dynamic from 'next/dynamic';
import { Navbar } from '@/components/Navbar';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck } from 'lucide-react';

const GeofenceOnboarding = dynamic(() => import('@/components/GeofenceOnboarding'), {
  ssr: false,
  loading: () => (
    <div className="mx-auto flex h-96 w-full max-w-xl items-center justify-center rounded-2xl border border-[#dfe7d8] bg-white shadow">
      <div className="flex flex-col items-center gap-2 text-sm text-[#2d6130]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#2d6130] border-t-transparent" />
        <span>Loading Mapbox Geofencing Canvas...</span>
      </div>
    </div>
  ),
});

export default function OnboardingPage() {
  return (
    <div className="min-h-screen bg-[#f3f5ee] pb-16">
      <Navbar />

      <main className="mx-auto max-w-4xl px-4 pt-8">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/signup"
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#57655d] hover:text-[#10251d]"
          >
            <ArrowLeft size={14} /> Back to 5-Step Farm Registration
          </Link>
          <div className="flex items-center gap-1 rounded-full bg-[#edf7e8] px-3 py-1 text-xs font-semibold text-[#2d6130]">
            <ShieldCheck size={14} />
            <span>EUDR Field Polygon Tool</span>
          </div>
        </div>

        <div className="mb-8 text-center">
          <h1 className="text-3xl font-extrabold text-[#10251d]">
            Farm Boundary & Canopy Perimeter Geofencing
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-[#57655d]">
            Walk the perimeter of your cocoa plot to capture geodetic points directly to browser
            IndexedDB storage with canopy multipath filtering.
          </p>
        </div>

        <GeofenceOnboarding />
      </main>
    </div>
  );
}
