
import "server-only";

export type SupportedListingCurrency = "NGN" | "XAF" | "USD";

export interface NgnExchangeRateQuote {
  sourceCurrency: SupportedListingCurrency;
  targetCurrency: "NGN";
  rate: number;
  rateTimestamp: string;
  provider: "ExchangeRate-API" | "identity";
}

interface ExchangeRateApiResponse {
  result?: string;
  base_code?: string;
  target_code?: string;
  conversion_rate?: number;
  time_last_update_unix?: number;
}

interface CachedQuote {
  quote: NgnExchangeRateQuote;
  fetchedAt: number;
}

const SUPPORTED_CURRENCIES = new Set<SupportedListingCurrency>([
  "NGN",
  "XAF",
  "USD",
]);

// Reuse a fetched rate for six hours to reduce API requests.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

// Refuse provider rates older than 36 hours.
const MAX_RATE_AGE_MS = 36 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8_000;

const rateCache = new Map<string, CachedQuote>();

function normalizeCurrency(currency: string): SupportedListingCurrency {
  const normalized = currency.trim().toUpperCase();

  if (!SUPPORTED_CURRENCIES.has(normalized as SupportedListingCurrency)) {
    throw new Error(
      `Unsupported listing currency '${normalized}'. Supported currencies are NGN, XAF, and USD.`
    );
  }

  return normalized as SupportedListingCurrency;
}

function assertRateIsFresh(updatedAtMs: number): void {
  const now = Date.now();
  const age = now - updatedAtMs;

  if (age < -MAX_FUTURE_SKEW_MS) {
    throw new Error("Exchange-rate provider returned an invalid future timestamp.");
  }

  if (age > MAX_RATE_AGE_MS) {
    throw new Error(
      "The exchange rate is too old to use safely. Please try again later."
    );
  }
}

/**
 * Returns the rate for converting one unit of the listing currency to NGN.
 *
 * NGN -> NGN uses an identity rate of 1.
 * XAF and USD use ExchangeRate-API.
 *
 * This module must only be imported by server-side code.
 */
export async function getNgnExchangeRate(
  inputCurrency: string
): Promise<NgnExchangeRateQuote> {
  const sourceCurrency = normalizeCurrency(inputCurrency);

  if (sourceCurrency === "NGN") {
    return {
      sourceCurrency: "NGN",
      targetCurrency: "NGN",
      rate: 1,
      rateTimestamp: new Date().toISOString(),
      provider: "identity",
    };
  }

  const now = Date.now();
  const cached = rateCache.get(sourceCurrency);

  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    const cachedTimestamp = Date.parse(cached.quote.rateTimestamp);

    if (Number.isFinite(cachedTimestamp)) {
      assertRateIsFresh(cachedTimestamp);
      return cached.quote;
    }

    rateCache.delete(sourceCurrency);
  }

  const apiKey = process.env.EXCHANGERATE_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(
      "Exchange-rate service is not configured. Check the server-side EXCHANGERATE_API_KEY environment variable."
    );
  }

  // Currency codes are allowlisted before they are used in the URL.
  const url =
    `https://v6.exchangerate-api.com/v6/${encodeURIComponent(apiKey)}` +
    `/pair/${sourceCurrency}/NGN`;

  let response: Response;

  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new Error(
      "Could not reach the exchange-rate provider. Please retry later."
    );
  }

  if (!response.ok) {
    throw new Error(
      "The exchange-rate provider is temporarily unavailable. Please retry later."
    );
  }

  let data: ExchangeRateApiResponse;

  try {
    data = (await response.json()) as ExchangeRateApiResponse;
  } catch {
    throw new Error("The exchange-rate provider returned an invalid response.");
  }

  if (
    data.result !== "success" ||
    data.base_code !== sourceCurrency ||
    data.target_code !== "NGN"
  ) {
    throw new Error(
      "The exchange-rate provider could not supply the requested currency pair."
    );
  }

  const rate = data.conversion_rate;
  const updatedAtUnix = data.time_last_update_unix;

  if (
    typeof rate !== "number" ||
    !Number.isFinite(rate) ||
    rate <= 0 ||
    typeof updatedAtUnix !== "number" ||
    !Number.isFinite(updatedAtUnix) ||
    updatedAtUnix <= 0
  ) {
    throw new Error("The exchange-rate provider returned invalid rate data.");
  }

  const updatedAtMs = updatedAtUnix * 1000;
  assertRateIsFresh(updatedAtMs);

  const quote: NgnExchangeRateQuote = {
    sourceCurrency,
    targetCurrency: "NGN",
    rate,
    rateTimestamp: new Date(updatedAtMs).toISOString(),
    provider: "ExchangeRate-API",
  };

  rateCache.set(sourceCurrency, {
    quote,
    fetchedAt: Date.now(),
  });

  return quote;
}
