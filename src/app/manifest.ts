import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "CocoaTrace EUDR Traceability Platform",
    short_name: "CocoaTrace",
    description: "EUDR compliant cocoa farm mapping, offline GPS location capture, and chain-of-custody traceability.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0a2218",
    theme_color: "#10251d",
    icons: [
      {
        src: "/pwa-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa-maskable-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
