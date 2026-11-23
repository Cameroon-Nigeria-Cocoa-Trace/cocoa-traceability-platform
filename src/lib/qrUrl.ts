/**
 * Shared QR Verification URL Utilities
 *
 * Ensures every generated/downloaded/printed QR code encodes a full scannable
 * web URL leading directly to `/traceability/qr/<qrValue>` on the active site,
 * and ensures manual search inputs accept either raw qrValue or full URLs.
 */

const DEFAULT_PUBLIC_ORIGIN =
  "https://ais-dev-st5vylp6my67vnd2h5z6r5-738691926329.europe-west2.run.app";

export function normalizeOrigin(origin?: string | null): string {
  if (!origin || !origin.trim()) {
    if (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_APP_URL) {
      return process.env.NEXT_PUBLIC_APP_URL.trim().replace(/\/+$/, "");
    }
    return DEFAULT_PUBLIC_ORIGIN;
  }
  return origin.trim().replace(/\/+$/, "");
}

/**
 * Resolves the external request origin on Next.js API routes cleanly behind proxies.
 */
export function resolveRequestOrigin(req?: {
  headers?: { get(name: string): string | null };
  nextUrl?: { origin?: string };
  url?: string;
}): string {
  if (req?.headers) {
    const forwardedHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const host = forwardedHost || req.headers.get("host")?.split(",")[0]?.trim();
    const forwardedProto =
      req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";

    if (host) {
      return `${forwardedProto}://${host}`.replace(/\/+$/, "");
    }
  }

  if (req?.nextUrl?.origin && req.nextUrl.origin !== "null") {
    return req.nextUrl.origin.replace(/\/+$/, "");
  }

  if (req?.url) {
    try {
      const parsed = new URL(req.url);
      if (parsed.origin && parsed.origin !== "null") {
        return parsed.origin.replace(/\/+$/, "");
      }
    } catch {
      // Fall through to env/default
    }
  }

  return normalizeOrigin(
    typeof window !== "undefined" ? window.location.origin : undefined
  );
}

/**
 * Builds the full URL encoded inside QR codes so smartphone scanners open the site directly.
 */
export function buildQRVerificationUrl(
  qrValue: string,
  baseOrigin?: string
): string {
  const cleanQr = qrValue.trim();
  const origin =
    baseOrigin && baseOrigin.trim()
      ? normalizeOrigin(baseOrigin)
      : typeof window !== "undefined"
        ? normalizeOrigin(window.location.origin)
        : normalizeOrigin();

  return `${origin}/traceability/qr/${encodeURIComponent(cleanQr)}`;
}

/**
 * Extracts raw `qrValue` whether the user entered the ID directly or scanned/pasted a full URL.
 */
export function extractQrValueFromInput(rawInput: string): string {
  const trimmed = rawInput.trim();
  if (!trimmed) return "";

  const marker = "/traceability/qr/";
  const idx = trimmed.indexOf(marker);
  if (idx !== -1) {
    const tail = trimmed.slice(idx + marker.length).split(/[?#]/)[0] || "";
    try {
      return decodeURIComponent(tail).trim();
    } catch {
      return tail.trim();
    }
  }

  return trimmed;
}
