import { app, ipcMain, safeStorage, shell } from "electron";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// First-party web session for full-length playback.
//
// The Developer Dashboard app token only gets PREVIEW manifests (server-side
// decision, no client flag can override it). TIDAL grants FULL assets to the
// user's own subscribed account through the sessions minted for its web
// player (listen.tidal.com). This module obtains that first-party session via
// the same public PKCE flow the web player uses, stores it separately from
// the dashboard-app token, and serves it only for playback purposes.
//
// The flow runs in the user's system browser (same pattern as the dashboard
// login in auth.ts, which cannot capture subscription-level sessions). The
// user signs in to TIDAL, is redirected to listen.tidal.com/login/auth with a
// code, and pastes that code back into the app which completes the exchange.

const WEB_CLIENT_ID = "CzET4vdadNUFQ5JU"; // listen.tidal.com desktop client
const WEB_REDIRECT_URI = "https://listen.tidal.com/login/auth";
const WEB_AUTHORIZE_ENDPOINT = "https://login.tidal.com/authorize";
const WEB_TOKEN_ENDPOINT = "https://login.tidal.com/oauth2/token";
const WEB_PLAYER_ORIGIN = "https://listen.tidal.com";
const WEB_SESSION_FILE = "tidal-web-session";
const WEB_LOGIN_PENDING_CODE_VERIFIER = "waves-web-login-pending";
const TOKEN_REFRESH_LEAD_TIME_MS = 60_000;

interface WebTokenBundle {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  userId: string | null;
}

interface WebLoginPendingResult {
  success: boolean;
  pending: boolean;
  authorizeUrl?: string;
  error?: string;
}

interface WebCompleteLoginResult {
  success: boolean;
  error?: string;
}

function webSessionFilePath(): string {
  return path.join(app.getPath("userData"), WEB_SESSION_FILE);
}

function base64UrlEncode(input: Buffer): string {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function generatePkcePair(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = base64UrlEncode(randomBytes(48));
  const codeChallenge = base64UrlEncode(createHash("sha256").update(codeVerifier).digest());
  return { codeVerifier, codeChallenge };
}

function buildAuthorizationUrl(scope: string, codeChallenge: string): string {
  const authorizeUrl = new URL(WEB_AUTHORIZE_ENDPOINT);
  authorizeUrl.searchParams.set("appMode", "WEB");
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", WEB_CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", WEB_REDIRECT_URI);
  authorizeUrl.searchParams.set("scope", scope);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set("code_challenge", codeChallenge);
  return authorizeUrl.toString();
}

function saveWebSession(bundle: WebTokenBundle): void {
  const filePath = webSessionFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const plaintext = JSON.stringify(bundle);
  if (safeStorage.isEncryptionAvailable()) {
    fs.writeFileSync(filePath, safeStorage.encryptString(plaintext));
  } else {
    fs.writeFileSync(filePath, Buffer.from(plaintext, "utf8"));
  }
}

function loadWebSession(): WebTokenBundle | null {
  const filePath = webSessionFilePath();
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath);
    const plaintext = safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(raw)
      : raw.toString("utf8");
    return JSON.parse(plaintext) as WebTokenBundle;
  } catch {
    return null;
  }
}

function isWebSessionFresh(bundle: WebTokenBundle): boolean {
  return Date.now() < Date.parse(bundle.accessTokenExpiresAt) - TOKEN_REFRESH_LEAD_TIME_MS;
}

async function exchangeWebCode(code: string, codeVerifier: string): Promise<WebTokenBundle> {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    code_verifier: codeVerifier,
    client_id: WEB_CLIENT_ID,
    redirect_uri: WEB_REDIRECT_URI,
    scope: "r_usr w_usr",
  });
  const response = await fetch(WEB_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: WEB_PLAYER_ORIGIN,
    },
    body: params.toString(),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`TIDAL web token exchange failed (${response.status}): ${body}`);
  }
  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    user?: { id?: string | number };
  };
  if (!data.access_token) {
    throw new Error("TIDAL web token exchange returned no access token.");
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? "",
    accessTokenExpiresAt: new Date(
      Date.now() + (data.expires_in ?? 86_400) * 1000,
    ).toISOString(),
    userId: data.user?.id == null ? null : String(data.user.id),
  };
}

async function refreshWebSession(bundle: WebTokenBundle): Promise<WebTokenBundle> {
  if (!bundle.refreshToken) {
    throw new Error("TIDAL web session has no refresh token.");
  }
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: bundle.refreshToken,
    client_id: WEB_CLIENT_ID,
  });
  const response = await fetch(WEB_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: WEB_PLAYER_ORIGIN,
    },
    body: params.toString(),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`TIDAL web token refresh failed (${response.status}): ${body}`);
  }
  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) {
    throw new Error("TIDAL web token refresh returned no access token.");
  }
  const updated: WebTokenBundle = {
    ...bundle,
    accessToken: data.access_token,
    refreshToken: data.refresh_token || bundle.refreshToken,
    accessTokenExpiresAt: new Date(
      Date.now() + (data.expires_in ?? 86_400) * 1000,
    ).toISOString(),
  };
  saveWebSession(updated);
  return updated;
}

export async function getValidWebAccessToken(): Promise<string | null> {
  const session = loadWebSession();
  if (!session) return null;
  if (isWebSessionFresh(session)) return session.accessToken;
  try {
    const refreshed = await refreshWebSession(session);
    return refreshed.accessToken;
  } catch {
    return null;
  }
}

export function isWebSessionConnected(): boolean {
  return loadWebSession() !== null;
}

export async function getWebSessionCredentials(): Promise<{
  client_id: string;
  access_token: string;
  user_id: string | null;
} | null> {
  const accessToken = await getValidWebAccessToken();
  if (!accessToken) return null;
  return {
    client_id: WEB_CLIENT_ID,
    access_token: accessToken,
    user_id: loadWebSession()?.userId ?? null,
  };
}

export async function logoutWebSession(): Promise<void> {
  const filePath = webSessionFilePath();
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    /* ignore */
  }
  try {
    fs.unlinkSync(path.join(app.getPath("userData"), WEB_LOGIN_PENDING_CODE_VERIFIER));
  } catch {
    /* ignore */
  }
}

function savePendingCodeVerifier(codeVerifier: string): void {
  const filePath = path.join(app.getPath("userData"), WEB_LOGIN_PENDING_CODE_VERIFIER);
  fs.writeFileSync(filePath, codeVerifier, "utf8");
}

function loadPendingCodeVerifier(): string | null {
  const filePath = path.join(app.getPath("userData"), WEB_LOGIN_PENDING_CODE_VERIFIER);
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

async function startWebLoginFlow(): Promise<WebLoginPendingResult> {
  const existing = await getValidWebAccessToken();
  if (existing) {
    return { success: true, pending: false };
  }
  const { codeVerifier, codeChallenge } = generatePkcePair();
  savePendingCodeVerifier(codeVerifier);
  const authorizeUrl = buildAuthorizationUrl("r_usr w_usr", codeChallenge);
  await shell.openExternal(authorizeUrl);
  return { success: true, pending: true, authorizeUrl };
}

function extractCodeFromPaste(pasted: string): string | null {
  const trimmed = pasted.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    const code = parsed.searchParams.get("code");
    return code ?? null;
  } catch {
    return trimmed;
  }
}

async function completeWebLoginFlow(pasted: string): Promise<WebCompleteLoginResult> {
  const code = extractCodeFromPaste(pasted);
  if (!code) {
    return { success: false, error: "No authorization code found." };
  }
  const codeVerifier = loadPendingCodeVerifier();
  if (!codeVerifier) {
    return { success: false, error: "No pending login. Start the flow again before completing it." };
  }
  try {
    const bundle = await exchangeWebCode(code, codeVerifier);
    saveWebSession(bundle);
    try {
      fs.unlinkSync(path.join(app.getPath("userData"), WEB_LOGIN_PENDING_CODE_VERIFIER));
    } catch {
      /* ignore */
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// Fetches a full-quality stream URL for a track through the web player's
// playback-info endpoint. Only ever called with the first-party web token.
export async function fetchPlaybackStreamUrl(
  trackId: string,
  accessToken: string,
): Promise<string> {
  const endpoint = new URL(
    `https://api.tidal.com/v1/tracks/${encodeURIComponent(trackId)}/playbackinfopostpaywall/v4`,
  );
  endpoint.searchParams.set("audioquality", "LOSSLESS");
  endpoint.searchParams.set("playbackmode", "STREAM");
  endpoint.searchParams.set("assetpresentation", "FULL");

  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Origin: WEB_PLAYER_ORIGIN,
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`TIDAL playback info failed (${response.status}): ${body}`);
  }
  const data = (await response.json()) as {
    trackPresentation?: "FULL" | "PREVIEW";
    manifestMimeType?: string;
    manifest?: string;
  };
  if (data.trackPresentation === "PREVIEW") {
    throw new Error("TIDAL only granted a preview for this track.");
  }

  if (data.manifest) {
    return data.manifest;
  }

  throw new Error("TIDAL playback info returned no playable stream.");
}

export function registerWebSessionHandlers(): void {
  ipcMain.handle("web-auth:is-connected", () => isWebSessionConnected());

  ipcMain.handle("web-auth:login", async (): Promise<WebLoginPendingResult> => {
    try {
      return await startWebLoginFlow();
    } catch (error) {
      return {
        success: false,
        pending: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle(
    "web-auth:complete-login",
    async (_event, pasted: string): Promise<WebCompleteLoginResult> => {
      return await completeWebLoginFlow(pasted);
    },
  );

  ipcMain.handle("web-auth:logout", async () => {
    await logoutWebSession();
    return { success: true };
  });

  ipcMain.handle("web-auth:get-session-credentials", () => getWebSessionCredentials());

  ipcMain.handle("web-auth:get-playback-stream", async (_event, trackId: string) => {
    const accessToken = await getValidWebAccessToken();
    if (!accessToken) {
      throw new Error("Playback session not connected.");
    }
    return await fetchPlaybackStreamUrl(trackId, accessToken);
  });
}