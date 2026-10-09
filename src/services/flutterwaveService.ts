/**
 * Flutterwave Gateway Service (Role 3 Domain Integration)
 * Cocoa Traceability, Certificate & Cross-Border Export Platform
 *
 * Responsibilities:
 * - Direct integration with Flutterwave v3 REST API
 * - Standard Hosted Checkout creation (POST /v3/payments)
 * - Reference-based transaction verification & reconciliation (GET /v3/transactions/verify_by_reference?tx_ref=...)
 * - Categorized failure analysis (Definitive Failure vs Indeterminate Timeout vs Missing Transaction)
 * - Timing-safe webhook signature verification (crypto.timingSafeEqual)
 */

import crypto from "crypto";

export interface CreatePaymentPayload {
  tx_ref: string;
  amount: number; // Integer NGN
  currency: "NGN";
  redirect_url: string;
  customer: {
    email: string;
    name?: string;
    phonenumber?: string;
  };
  customizations?: {
    title?: string;
    description?: string;
    logo?: string;
  };
  meta?: Record<string, any>;
}

export interface FlutterwavePaymentResult {
  status: "success" | "error";
  message: string;
  data?: {
    link: string; // Checkout URL
    id?: string;
    flw_ref?: string;
    [key: string]: any;
  };
}

export type GatewayCallOutcome =
  | { outcome: "SUCCESS"; checkoutUrl: string; gatewayTransactionId?: string; flw_ref?: string; raw: any }
  | { outcome: "DEFINITIVE_FAILURE"; statusCode?: number; message: string; raw?: any }
  | { outcome: "INDETERMINATE_TIMEOUT"; message: string; raw?: any };

export type ReconciliationOutcomeStatus =
  | "SUCCESSFUL"
  | "FAILED"
  | "RESOLVED_NOT_FOUND"
  | "INDETERMINATE";

export interface ReconciliationResult {
  status: ReconciliationOutcomeStatus;
  gatewayTransactionId?: string;
  flw_ref?: string;
  tx_ref?: string;
  amount?: number;
  currency?: string;
  gatewayStatus?: string;
  customer?: {
    email?: string;
    name?: string;
    phone_number?: string;
  };
  raw?: any;
  errorMessage?: string;
}

const FLUTTERWAVE_BASE_URL = "https://api.flutterwave.com/v3";

/**
 * Gets the Flutterwave Secret Key from environment.
 */
export function getFlutterwaveSecretKey(): string {
  const key = process.env.FLUTTERWAVE_SECRET_KEY;
  if (!key || !key.trim()) {
    // In local development or mock environments, provide fallback if not configured
    return process.env.NEXT_PUBLIC_FLUTTERWAVE_SECRET_KEY || "FLWSECK_TEST-mock-secret-key-123456";
  }
  return key.trim();
}

/**
 * Gets the Flutterwave Webhook Secret Hash from environment.
 */
export function getFlutterwaveSecretHash(): string {
  return process.env.FLUTTERWAVE_SECRET_HASH || "cocoa_flutterwave_secret_hash_2026";
}

/**
 * Initiates hosted checkout creation with Flutterwave Standard API.
 * Uses a strict 10-second timeout to isolate network hangs.
 */
export async function createFlutterwaveStandardPayment(
  payload: CreatePaymentPayload
): Promise<GatewayCallOutcome> {
  const secretKey = getFlutterwaveSecretKey();
  const url = `${FLUTTERWAVE_BASE_URL}/payments`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secretKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await res.json().catch(() => null);

    if (res.ok && data && data.status === "success" && data.data?.link) {
      return {
        outcome: "SUCCESS",
        checkoutUrl: data.data.link,
        gatewayTransactionId: data.data.id ? String(data.data.id) : undefined,
        flw_ref: data.data.flw_ref || undefined,
        raw: data,
      };
    }

    // Explicit 4xx validation or business rejection from Flutterwave
    if (res.status >= 400 && res.status < 500) {
      return {
        outcome: "DEFINITIVE_FAILURE",
        statusCode: res.status,
        message: data?.message || `Gateway rejected request with HTTP ${res.status}`,
        raw: data,
      };
    }

    // 5xx server errors at gateway or unknown malformed payload
    return {
      outcome: "INDETERMINATE_TIMEOUT",
      message: data?.message || `Gateway returned HTTP ${res.status}`,
      raw: data,
    };
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError" || error.code === "ETIMEDOUT" || error.code === "ECONNRESET") {
      return {
        outcome: "INDETERMINATE_TIMEOUT",
        message: `Network timeout connecting to Flutterwave: ${error.message || "Timeout"}`,
      };
    }

    return {
      outcome: "INDETERMINATE_TIMEOUT",
      message: `Network failure calling Flutterwave: ${error.message || String(error)}`,
    };
  }
}

/**
 * Reconciles a Flutterwave transaction by reference using:
 * GET /v3/transactions/verify_by_reference?tx_ref={paymentReference}
 *
 * Implements provider response semantics:
 * - SUCCESSFUL: valid transaction with status == "successful"
 * - FAILED: valid transaction with status == "failed" / "cancelled"
 * - RESOLVED_NOT_FOUND: HTTP 404, HTTP 400 with "not found" message, or error body indicating missing transaction
 * - INDETERMINATE: connection timeouts or gateway 5xx errors
 */
export async function verifyFlutterwaveTransactionByReference(
  paymentReference: string
): Promise<ReconciliationResult> {
  if (!paymentReference || !paymentReference.trim()) {
    return {
      status: "RESOLVED_NOT_FOUND",
      errorMessage: "Empty paymentReference provided.",
    };
  }

  const cleanRef = encodeURIComponent(paymentReference.trim());
  const secretKey = getFlutterwaveSecretKey();
  const url = `${FLUTTERWAVE_BASE_URL}/transactions/verify_by_reference?tx_ref=${cleanRef}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secretKey}`,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const body = await res.json().catch(() => null);

    // 1. Evaluate Successful Gateway Response
    if (res.ok && body && body.status === "success" && body.data) {
      const txData = body.data;
      const gatewayStatus = String(txData.status || "").toLowerCase();

      if (gatewayStatus === "successful") {
        return {
          status: "SUCCESSFUL",
          gatewayTransactionId: txData.id ? String(txData.id) : undefined,
          flw_ref: txData.flw_ref || undefined,
          tx_ref: txData.tx_ref || paymentReference,
          amount: typeof txData.amount === "number" ? txData.amount : Number(txData.amount),
          currency: txData.currency ? String(txData.currency).toUpperCase() : undefined,
          gatewayStatus: txData.status,
          customer: txData.customer,
          raw: body,
        };
      }

      if (gatewayStatus === "failed" || gatewayStatus === "cancelled") {
        return {
          status: "FAILED",
          gatewayTransactionId: txData.id ? String(txData.id) : undefined,
          flw_ref: txData.flw_ref || undefined,
          tx_ref: txData.tx_ref || paymentReference,
          amount: typeof txData.amount === "number" ? txData.amount : Number(txData.amount),
          currency: txData.currency ? String(txData.currency).toUpperCase() : undefined,
          gatewayStatus: txData.status,
          customer: txData.customer,
          raw: body,
        };
      }

      // If pending or other non-terminal status at gateway
      return {
        status: "FAILED",
        gatewayTransactionId: txData.id ? String(txData.id) : undefined,
        flw_ref: txData.flw_ref || undefined,
        tx_ref: txData.tx_ref || paymentReference,
        amount: typeof txData.amount === "number" ? txData.amount : Number(txData.amount),
        currency: txData.currency ? String(txData.currency).toUpperCase() : undefined,
        gatewayStatus: txData.status,
        raw: body,
        errorMessage: `Transaction has non-successful gateway status: ${txData.status}`,
      };
    }

    // 2. Evaluate Missing Transaction (RESOLVED_NOT_FOUND)
    const msg = (body?.message || "").toLowerCase();
    const isNotFoundMessage =
      msg.includes("no transaction") ||
      msg.includes("not found") ||
      msg.includes("does not exist") ||
      msg.includes("invalid transaction reference");

    if (res.status === 404 || (res.status === 400 && isNotFoundMessage) || (body && body.status === "error" && isNotFoundMessage)) {
      return {
        status: "RESOLVED_NOT_FOUND",
        errorMessage: body?.message || "Transaction not found at Flutterwave",
        raw: body,
      };
    }

    // 3. Other Non-200 responses (e.g., 5xx or unhandled status codes)
    return {
      status: "INDETERMINATE",
      errorMessage: body?.message || `Gateway returned HTTP ${res.status}`,
      raw: body,
    };
  } catch (error: any) {
    clearTimeout(timeoutId);
    return {
      status: "INDETERMINATE",
      errorMessage: `Network error verifying transaction: ${error.message || String(error)}`,
    };
  }
}

/**
 * Validates Flutterwave Webhook signature using crypto.timingSafeEqual.
 * Protects against timing attacks and rejects missing or malformed signatures.
 */
export function verifyFlutterwaveWebhookSignature(
  receivedHeader: string | null | undefined,
  expectedSecretHash?: string
): boolean {
  if (!receivedHeader || typeof receivedHeader !== "string") {
    return false;
  }

  const expected = (expectedSecretHash || getFlutterwaveSecretHash()).trim();
  const received = receivedHeader.trim();

  if (!expected || !received) {
    return false;
  }

  try {
    const expectedBuffer = Buffer.from(expected, "utf8");
    const receivedBuffer = Buffer.from(received, "utf8");

    if (expectedBuffer.length !== receivedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
  } catch {
    return false;
  }
}
