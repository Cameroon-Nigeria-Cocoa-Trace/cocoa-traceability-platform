import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cameroon-Cross River Cocoa Traceability Platform",
  description:
    "EUDR-oriented Cameroon-origin cocoa traceability system preserving origin through Cross River and Nigerian export channels.",
};

// FIXED: Added LayoutProps typing and injected body dimension constraints
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      {/* FIXED: Enforced a full viewport canvas anchor for absolute components */}
      <body className="min-h-screen w-full relative antialiased bg-[#031d16]">
        {children}
      </body>
    </html>
  );
}