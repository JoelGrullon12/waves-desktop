import axios from "axios";
import { getValidAccessToken } from "./auth";
import { handleTrusted } from "./secureIpc";
import { getValidWebAccessToken } from "./webSessionAuth";

// HTTP access to the TIDAL v2 API (JSON:API), shared by every module that
// talks to it. All API traffic runs through the main process so the access
// token never reaches the renderer.

export const TIDAL_CATALOG_BASE = "https://openapi.tidal.com/v2";
// Placeholder written by the URL builders; every request replaces it with the
// account's own country (see withAccountCountry).
export const DEFAULT_COUNTRY_CODE = "US";
const JSON_API_MEDIA_TYPE = "application/vnd.api+json";
const HTTP_TIMEOUT_MS = 15_000;

export function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

// Only HTTP status matters here; probing `isAxiosError` would couple this file
// to axios internals. A 429 has a `response.status`, plain network failures do
// not reach this helper.
export function httpStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const response = (error as { response?: { status?: unknown } }).response;
  return typeof response?.status === "number" ? response.status : null;
}

const MAX_RATE_LIMIT_RETRIES = 4;

// What reaches the renderer (and the terminal) when TIDAL rejects a request:
// the status and TIDAL's own explanation instead of a dump of the whole HTTP
// exchange, which also contained the access token.
export class TidalApiError extends Error {
  // Read by httpStatus(), so callers can still branch on the status.
  readonly response: { status: number };

  constructor(status: number, method: string, url: string, detail: string | null) {
    const path = new URL(url).pathname.replace("/v2", "");
    super(`TIDAL API ${method} ${path} failed with HTTP ${status}${detail ? `: ${detail}` : ""}`);
    this.name = "TidalApiError";
    this.response = { status };
  }
}

function apiErrorDetail(error: unknown): string | null {
  const data = (error as { response?: { data?: unknown } }).response?.data;
  const errors = (data as { errors?: Array<{ detail?: unknown; code?: unknown }> } | undefined)
    ?.errors;
  const first = Array.isArray(errors) ? errors[0] : undefined;
  if (typeof first?.detail === "string") return first.detail;
  if (typeof first?.code === "string") return first.code;
  return null;
}

// What a track's availability and a catalog page look like depends on the
// country. The account's country is asked once per run; with the wrong one,
// lists show tracks that then refuse to play.
let accountCountry: Promise<string> | null = null;

async function fetchAccountCountry(accessToken: string): Promise<string> {
  try {
    const response = await axios.get(`${TIDAL_CATALOG_BASE}/users/me`, {
      timeout: HTTP_TIMEOUT_MS,
      headers: { Accept: JSON_API_MEDIA_TYPE, Authorization: `Bearer ${accessToken}` },
    });
    const country = (response.data as { data?: { attributes?: { country?: unknown } } }).data
      ?.attributes?.country;
    if (typeof country === "string" && /^[A-Z]{2}$/.test(country)) {
      console.info(`catalog: using account country ${country}`);
      return country;
    }
  } catch (error) {
    console.warn(
      `catalog: could not read the account country, using ${DEFAULT_COUNTRY_CODE}: ` +
        (error instanceof Error ? error.message : String(error)),
    );
  }
  return DEFAULT_COUNTRY_CODE;
}

// Called on logout: the next account may live somewhere else.
export function forgetAccountCountry(): void {
  accountCountry = null;
}

async function withAccountCountry(url: string, accessToken: string): Promise<string> {
  const parsedUrl = new URL(url);
  if (!parsedUrl.searchParams.has("countryCode")) return url;
  accountCountry ??= fetchAccountCountry(accessToken);
  parsedUrl.searchParams.set("countryCode", await accountCountry);
  return parsedUrl.toString();
}

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

// Which sign-in a request uses. "app" is the user's own developer app (every
// catalog and library call). "web" is the first-party web session of the
// playback engine: TIDAL licenses lyrics and credits only to its own clients,
// so the same v2 endpoints answer empty for the developer app. The web token
// never leaves the main process, like the other one.
export type TidalSession = "app" | "web";

async function sessionAccessToken(session: TidalSession): Promise<string> {
  const accessToken = session === "web" ? await getValidWebAccessToken() : await getValidAccessToken();
  if (!accessToken) {
    throw new Error(
      session === "web"
        ? "Full playback is not connected: lyrics and credits need it."
        : "Not authenticated: no valid TIDAL access token.",
    );
  }
  return accessToken;
}

export async function requestJson(
  method: HttpMethod,
  url: string,
  body?: unknown,
  session: TidalSession = "app",
): Promise<unknown> {
  const accessToken = await sessionAccessToken(session);
  const requestUrl = await withAccountCountry(url, accessToken);

  for (let attempt = 0; ; attempt++) {
    try {
      const response = await axios.request({
        method,
        url: requestUrl,
        data: body,
        timeout: HTTP_TIMEOUT_MS,
        headers: {
          Accept: JSON_API_MEDIA_TYPE,
          Authorization: `Bearer ${accessToken}`,
          ...(body === undefined ? {} : { "Content-Type": JSON_API_MEDIA_TYPE }),
        },
      });
      return response.data;
    } catch (error) {
      // TIDAL's edge rate-limits short request bursts with HTTP 429 plus a
      // Retry-After header. Honoring it keeps multi-page catalog reads stable;
      // we never saw a 429 here that a pause did not clear.
      const status = httpStatus(error);
      if (status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
        const headers = (error as { response?: { headers?: Record<string, string> } }).response
          ?.headers;
        const parsedRetryAfter = Number.parseInt(headers?.["retry-after"] ?? "", 10);
        const retryAfterSeconds = Number.isFinite(parsedRetryAfter) ? parsedRetryAfter : 1;
        const delayMilliseconds = Math.max(500, retryAfterSeconds * 1000) * (attempt + 1);
        console.warn(
          `catalog: rate limited (429), retrying ${url} in ${delayMilliseconds}ms ` +
            `(attempt ${attempt + 1}/${MAX_RATE_LIMIT_RETRIES})`,
        );
        await sleep(delayMilliseconds);
        continue;
      }
      if (status !== null) throw new TidalApiError(status, method, url, apiErrorDetail(error));
      throw new Error(
        `TIDAL API ${method} request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export function fetchJson(url: string, session: TidalSession = "app"): Promise<unknown> {
  return requestJson("GET", url, undefined, session);
}

// Development aid, off unless WAVES_DEBUG_API=1: lets scripts/driveApp.mjs read
// any v2 path with the signed-in account, to check what an endpoint really
// answers before code is written against it. Read-only and TIDAL-only.
export function registerApiExplorer(): void {
  if (process.env["WAVES_DEBUG_API"] !== "1") return;
  handleTrusted("debug:api-get", (_event, path, session) => {
    if (typeof path !== "string" || !path.startsWith("/")) throw new Error("Invalid API path.");
    return fetchJson(`${TIDAL_CATALOG_BASE}${path}`, session === "web" ? "web" : "app");
  });
}
