import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { FirebaseProvider } from "@/context/FirebaseContext";
import { LanguageProvider } from "@/context/LanguageContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SLITE Trace | Cameroon-Cross River Cocoa Traceability Platform",
  description:
    "EUDR-oriented Cameroon-origin cocoa traceability system by SLITE Solutions, preserving origin through Cross River and Nigerian export channels.",
  icons: {
    icon: "/slite-app-icon.svg",
    apple: "/slite-app-icon.svg",
  },
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
        <FirebaseProvider>
          <LanguageProvider>{children}</LanguageProvider>
        </FirebaseProvider>
      </body>
    </html>
  );
}