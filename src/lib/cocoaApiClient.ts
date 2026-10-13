/**
 * Cocoa Traceability & Trade Workspace API Client
 *
 * Requirements:
 * - Accepts a Firebase ID token provider function to retrieve a fresh token.
 * - Injects `Authorization: Bearer <token>` when a token is provided.
 * - Supports GET, POST, PUT, PATCH, DELETE with JSON or FormData payloads.
 * - Does NOT manually set Content-Type for FormData (lets browser set boundary).
 * - Never stores tokens in localStorage or accepts browser-supplied user IDs as proof.
 * - Structured error handling with status codes (401, 403, 404, 409, 5xx).
 * - React hook-free: purely functional and utility-based.
 */

export type TokenProvider = () => Promise<string | null | undefined>;

export interface RequestOptions {
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean | undefined | null>;
  skipAuth?: boolean;
}

export class CocoaApiError extends Error {
  public readonly status: number;
  public readonly statusText: string;
  public readonly details: unknown;
  public readonly rawBody?: string;

  constructor(status: number, statusText: string, message: string, details?: unknown, rawBody?: string) {
    super(message);
    this.name = "CocoaApiError";
    this.status = status;
    this.statusText = statusText;
    this.details = details;
    this.rawBody = rawBody;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isConflict(): boolean {
    return this.status === 409;
  }

  get isValidationError(): boolean {
    return this.status === 400 || this.status === 422;
  }

  get isServerError(): boolean {
    return this.status >= 500;
  }
}

export class CocoaApiClient {
  private readonly getToken: TokenProvider;
  private readonly baseUrl: string;

  constructor(getToken: TokenProvider, baseUrl = "") {
    this.getToken = getToken;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private buildUrl(path: string, params?: RequestOptions["params"]): string {
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    const url = `${this.baseUrl}${cleanPath}`;

    if (!params) return url;

    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        query.append(key, String(value));
      }
    }

    const queryString = query.toString();
    return queryString ? `${url}?${queryString}` : url;
  }

  private async execute<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    const url = this.buildUrl(path, options?.params);
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(options?.headers || {}),
    };

    if (!options?.skipAuth) {
      const token = await this.getToken();
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
    }

    let requestBody: BodyInit | undefined;

    if (body !== undefined) {
      if (typeof FormData !== "undefined" && body instanceof FormData) {
        // DO NOT set Content-Type header; the runtime sets it with boundary
        requestBody = body;
      } else if (typeof body === "string") {
        requestBody = body;
        if (!headers["Content-Type"]) {
          headers["Content-Type"] = "application/json";
        }
      } else {
        requestBody = JSON.stringify(body);
        headers["Content-Type"] = "application/json";
      }
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: requestBody,
      });
    } catch (networkError: unknown) {
      const msg = networkError instanceof Error ? networkError.message : "Network connection failed";
      throw new CocoaApiError(0, "Network Error", `Network request to ${path} failed: ${msg}`);
    }

    const contentType = response.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");

    if (!response.ok) {
      let errorMessage = `API request failed with status ${response.status} (${response.statusText})`;
      let errorDetails: unknown = null;
      let rawText: string | undefined;

      if (isJson) {
        try {
          const jsonError = await response.json();
          errorDetails = jsonError;
          if (jsonError && typeof jsonError === "object") {
            if ("error" in jsonError && typeof jsonError.error === "string") {
              errorMessage = jsonError.error;
            } else if ("message" in jsonError && typeof jsonError.message === "string") {
              errorMessage = jsonError.message;
            }
          }
        } catch {
          // ignore json parse error
        }
      } else {
        try {
          rawText = await response.text();
          if (rawText) {
            errorMessage = rawText.slice(0, 300);
          }
        } catch {
          // ignore text read error
        }
      }

      throw new CocoaApiError(response.status, response.statusText, errorMessage, errorDetails, rawText);
    }

    if (response.status === 204) {
      return null as unknown as T;
    }

    if (isJson) {
      try {
        return (await response.json()) as T;
      } catch (parseError: unknown) {
        const msg = parseError instanceof Error ? parseError.message : "Invalid JSON";
        throw new CocoaApiError(response.status, response.statusText, `Failed to parse response JSON: ${msg}`);
      }
    }

    return (await response.text()) as unknown as T;
  }

  public get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.execute<T>("GET", path, undefined, options);
  }

  public post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.execute<T>("POST", path, body, options);
  }

  public put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.execute<T>("PUT", path, body, options);
  }

  public patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.execute<T>("PATCH", path, body, options);
  }

  public delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.execute<T>("DELETE", path, undefined, options);
  }

  /**
   * Dedicated helper for multipart file uploads to /api/upload/cocoa-lot
   */
  public uploadFile<T>(path: string, file: File, additionalFields?: Record<string, string>, options?: RequestOptions): Promise<T> {
    const formData = new FormData();
    formData.append("file", file);
    if (additionalFields) {
      for (const [key, value] of Object.entries(additionalFields)) {
        formData.append(key, value);
      }
    }
    return this.post<T>(path, formData, options);
  }
}

/**
 * Creates a configured instance of CocoaApiClient using a token-provider function.
 */
export function createCocoaApiClient(tokenProvider: TokenProvider, baseUrl = ""): CocoaApiClient {
  return new CocoaApiClient(tokenProvider, baseUrl);
}
