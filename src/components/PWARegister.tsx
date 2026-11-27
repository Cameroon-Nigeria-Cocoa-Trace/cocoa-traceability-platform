"use client";

import { useEffect } from "react";

export function PWARegister() {
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          console.log("CocoaTrace PWA ServiceWorker registered with scope:", reg.scope);
        })
        .catch((err) => {
          console.warn("ServiceWorker registration warning:", err);
        });
    }
  }, []);

  return null;
}
