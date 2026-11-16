import { app, BrowserWindow, safeStorage, session } from "electron";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { writePrivateFile } from "./privateFile";
import { handleTrusted } from "./secureIpc";
import { authorizationCodeFromRedirect, requireResourceId } from "./validation";

// First-party web session for full-length playback.
//
// The Developer Dashboard app token only gets PREVIEW manifests (server-side
// decision, no client flag can override it). TIDAL grants FULL assets to the
// user's own subscribed account through the sessions minted for its web
// player (tidal.com). This module obtains that first-party session via
// the same public PKCE flow the web player uses, stores it separately from
// the dashboard-app token, and serves it only for playback purposes.
//
// The flow runs in a small sign-in window owned by the app (the web client's
// redirect URI is tidal.com, so no local callback server can receive
// it, and TIDAL refuses Device Authorization for this client). The window
// watches its own navigation and captures the `?code=` of the redirect to
// tidal.com/login/auth before that page loads, then closes.

// Client of the web player at tidal.com. It replaced the older listen.tidal.com
// client (CzET4vdadNUFQ5JU), whose authorize URL TIDAL now answers with a
// generic "something went wrong" page.
const WEB_CLIENT_ID = "49YxDN9a2aFV6RTG";
const WEB_REDIRECT_URI = "https://tidal.com/login/auth";
const WEB_AUTHORIZE_ENDPOINT = "https://login.tidal.com/authorize";
const WEB_TOKEN_ENDPOINT = "https://login.tidal.com/oauth2/token";
const WEB_PLAYER_ORIGIN = "https://tidal.com";
const WEB_SESSION_FILE = "tidal-web-session";
// Persistent so TIDAL's own web player (tidal.com) loaded by the app can reuse
// the sign-in; cleared on logout.
export const TIDAL_WEB_PARTITION = "persist:tidal-web";
const WEB_LOGIN_TIMEOUT_MS = 10 * 60_000;
const WEB_LOGIN_LOAD_ATTEMPTS = 2;
const WEB_LOGIN_RETRY_DELAY_MS = 1000;
// Chromium reports a navigation replaced by another one (e.g. a redirect) as
// ERR_ABORTED; that is not a failure.
const NET_ERROR_ABORTED = -3;
const TOKEN_REFRESH_LEAD_TIME_MS = 60_000;
const HTTP_TIMEOUT_MS = 15_000;

interface WebTokenBundle {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  userId: string | null;
}

interface WebLoginResult {
  success: boolean;
  error?: string;
}

// The playback engine (tidalWebPlayer.ts) lives on the same partition: it is
// told when the session appears or is about to be wiped.
type WebSessionListener = (isConnected: boolean) => void;
let webSessionListener: WebSessionListener | null = null;

export function setWebSessionListener(listener: WebSessionListener): void {
  webSessionListener = listener;
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
    writePrivateFile(filePath, safeStorage.encryptString(plaintext));
  } else {
    writePrivateFile(filePath, Buffer.from(plaintext, "utf8"));
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
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
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
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
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
  // The engine window must be gone before its storage is cleared.
  webSessionListener?.(false);
  const filePath = webSessionFilePath();
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    /* ignore */
  }
  await session.fromPartition(TIDAL_WEB_PARTITION).clearStorageData();
}

function captureAuthorizationCode(authorizeUrl: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const loginWindow = new BrowserWindow({
      width: 480,
      height: 740,
      title: "Sign in to TIDAL",
      autoHideMenuBar: true,
      parent: BrowserWindow.getAllWindows()[0],
      webPreferences: {
        partition: TIDAL_WEB_PARTITION,
        contextIsolation: true,
        nodeIntegration: false,
        // Linux builds run with --no-sandbox (see index.ts), and a window that
        // asks for the sandbox there can fail to launch its renderer process.
        // No preload is attached, so the page still has no access to Node.
        sandbox: process.platform !== "linux",
      },
    });

    let isSettled = false;
    const finish = (settle: () => void): void => {
      if (isSettled) return;
      isSettled = true;
      clearTimeout(timeout);
      if (!loginWindow.isDestroyed()) loginWindow.close();
      settle();
    };
    const timeout = setTimeout(
      () => finish(() => reject(new Error("Timed out waiting for the TIDAL sign-in."))),
      WEB_LOGIN_TIMEOUT_MS,
    );

    const inspectNavigation = (event: { preventDefault: () => void }, url: string): void => {
      const code = authorizationCodeFromRedirect(url, WEB_REDIRECT_URI);
      if (!code) return;
      // Stop the window from loading tidal.com; only the code matters.
      event.preventDefault();
      finish(() => resolve(code));
    };

    const { webContents } = loginWindow;
    webContents.on("will-redirect", (event, url) => inspectNavigation(event, url));
    webContents.on("will-navigate", (event, url) => inspectNavigation(event, url));
    webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    loginWindow.on("closed", () =>
      finish(() => reject(new Error("The sign-in window was closed before finishing."))),
    );

    // Only origin + path are logged: the query string of the final redirect
    // carries the authorization code.
    const describeUrl = (url: string): string => {
      try {
        const parsed = new URL(url);
        return `${parsed.origin}${parsed.pathname}`;
      } catch {
        return "(invalid url)";
      }
    };
    webContents.on("did-navigate", (_event, url) =>
      console.info(`web-login: navigated to ${describeUrl(url)}`),
    );
    webContents.on("did-finish-load", () => {
      console.info(`web-login: finished loading ${describeUrl(webContents.getURL())}`);
      // Tells an empty page (nothing was rendered, e.g. a challenge that never
      // completes) apart from a page that has content the window fails to paint.
      webContents
        .executeJavaScript(
          `({ title: document.title, textLength: document.body?.innerText.length ?? 0, ` +
            `elementCount: document.querySelectorAll("*").length, frameCount: window.frames.length })`,
        )
        .then((stats) => console.info(`web-login: page content ${JSON.stringify(stats)}`))
        .catch(() => {});
      const frameUrls = webContents.mainFrame.framesInSubtree.map((frame) => describeUrl(frame.url));
      console.info(`web-login: frames ${JSON.stringify(frameUrls)}`);
      webContents
        .executeJavaScript(
          `[...document.querySelectorAll("script,iframe,link,noscript")].map((element) => {
            const source = element.src || element.href || "";
            let where = "inline";
            try { const parsed = new URL(source); where = parsed.origin + parsed.pathname; } catch {}
            return element.tagName.toLowerCase() + " " + where.slice(0, 140);
          })`,
        )
        .then((elements) => console.info(`web-login: page elements ${JSON.stringify(elements)}`))
        .catch(() => {});
    });
    webContents.on("console-message", (event) => {
      if (event.level === "error" || event.level === "warning") {
        console.info(`web-login: page ${event.level}: ${event.message.slice(0, 200)}`);
      }
    });
    // The page is an empty shell plus one frame; knowing which host that frame
    // loads (and whether it fails) shows what the blank area is waiting for.
    webContents.on("did-frame-navigate", (_event, url, httpResponseCode, _statusText, isMainFrame) => {
      if (!isMainFrame) {
        console.info(`web-login: frame navigated to ${describeUrl(url)} (HTTP ${httpResponseCode})`);
      }
    });
    webContents.on("did-frame-finish-load", (_event, isMainFrame) => {
      if (!isMainFrame) console.info("web-login: frame finished loading");
    });
    webContents.on("render-process-gone", (_event, details) =>
      console.error(`web-login: page process gone (${details.reason}, exit code ${details.exitCode})`),
    );

    // A transient network failure used to close the window at once with no
    // trace; log the reason and retry before giving up.
    let loadAttempts = 0;
    const loadSignInPage = (): void => {
      loadAttempts += 1;
      // Failures are handled through did-fail-load below; the promise also
      // rejects when preventDefault() aborts the navigation after the code was
      // captured, which is expected.
      loginWindow.loadURL(authorizeUrl).catch(() => {});
    };
    webContents.on("did-fail-load", (_event, errorCode, errorDescription, failedUrl, isMainFrame) => {
      if (!isMainFrame) {
        console.error(
          `web-login: frame failed to load (${errorDescription}, ${errorCode}): ${describeUrl(failedUrl)}`,
        );
        return;
      }
      if (errorCode === NET_ERROR_ABORTED || isSettled) return;
      console.error(
        `web-login: sign-in page failed to load (${errorDescription}, ${errorCode}), ` +
          `attempt ${loadAttempts}/${WEB_LOGIN_LOAD_ATTEMPTS}: ${failedUrl.split("?")[0]}`,
      );
      if (loadAttempts < WEB_LOGIN_LOAD_ATTEMPTS) {
        setTimeout(() => !isSettled && loadSignInPage(), WEB_LOGIN_RETRY_DELAY_MS);
      } else {
        finish(() =>
          reject(new Error(`Could not load the TIDAL sign-in page (${errorDescription}, ${errorCode}).`)),
        );
      }
    });
    loadSignInPage();
  });
}

async function loginWithSignInWindow(): Promise<WebLoginResult> {
  if (await getValidWebAccessToken()) return { success: true };
  const { codeVerifier, codeChallenge } = generatePkcePair();
  const code = await captureAuthorizationCode(
    buildAuthorizationUrl("r_usr w_usr", codeChallenge),
  );
  saveWebSession(await exchangeWebCode(code, codeVerifier));
  webSessionListener?.(true);
  return { success: true };
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
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
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
  handleTrusted("web-auth:is-connected", () => isWebSessionConnected());

  handleTrusted("web-auth:login", async (): Promise<WebLoginResult> => {
    try {
      return await loginWithSignInWindow();
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  handleTrusted("web-auth:logout", async () => {
    await logoutWebSession();
    return { success: true };
  });

  handleTrusted("web-auth:get-session-credentials", () => getWebSessionCredentials());

  handleTrusted("web-auth:get-playback-stream", async (_event, trackId) => {
    const validTrackId = requireResourceId(trackId, "track id");
    const accessToken = await getValidWebAccessToken();
    if (!accessToken) {
      throw new Error("Playback session not connected.");
    }
    return await fetchPlaybackStreamUrl(validTrackId, accessToken);
  });
}