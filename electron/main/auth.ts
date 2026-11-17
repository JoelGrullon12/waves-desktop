import { app, safeStorage, shell } from "electron";
import { forgetAccountCountry } from "./tidalApiClient";
import { createHash, randomBytes, createHmac } from "node:crypto";
import { createServer } from "node:http";
import { Buffer } from "node:buffer";
import path from "node:path";
import fs from "node:fs";
import axios from "axios";
import dotenv from "dotenv";
import { writePrivateFile } from "./privateFile";
import { getTidalAppCredentials } from "./tidalAppCredentials";
import { handleTrusted } from "./secureIpc";

// Load .env at module scope: with ESM, imported modules evaluate before the
// entry module's body, so env must be ready before these constants are read.
dotenv.config();

const REDIRECT_URI = "http://127.0.0.1:8899/tidal-callback";
const AUTHORIZE_ENDPOINT = "https://login.tidal.com/authorize";
const TOKEN_ENDPOINT = "https://auth.tidal.com/v1/oauth2/token";
const USERS_ME_ENDPOINT = "https://openapi.tidal.com/v2/users/me";
const OAUTH_SCOPE =
  "user.read collection.read collection.write playlists.read playlists.write playback search.read recommendations.read";
const REDIRECT_PORT = 8899;
const REDIRECT_HOST = "127.0.0.1";
const REDIRECT_PATH = "/tidal-callback";
const TOKEN_BUNDLE_FILE = "tidal-token-bundle";
const HTTP_TIMEOUT_MS = 15_000;
// The user has to sign in on TIDAL's page, so the callback gets a generous but
// finite window; otherwise the port stays bound and login never retries.
const OAUTH_CALLBACK_TIMEOUT_MS = 5 * 60_000;
// Only this process ever signs and verifies the OAuth state, so a random key per
// launch is enough.
const STATE_SECRET = randomBytes(32);

interface TokenBundle {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
  userId: string | null;
  clientId: string;
}

interface PkcePair {
  codeVerifier: string;
  codeChallenge: string;
}

function tokenBundleFilePath(): string {
  return path.join(app.getPath("userData"), TOKEN_BUNDLE_FILE);
}

function isTokenBundleFresh(tokenBundle: TokenBundle): boolean {
  return Date.now() < Date.parse(tokenBundle.accessTokenExpiresAt) - 60_000;
}

function backendBase64UrlEncode(input: Buffer): string {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function generatePkcePair(): PkcePair {
  const codeVerifier = backendBase64UrlEncode(randomBytes(48));
  const codeChallenge = backendBase64UrlEncode(
    createHash("sha256").update(codeVerifier).digest(),
  );
  return { codeVerifier, codeChallenge };
}

function createStateToken(): string {
  const payload = Buffer.from(randomBytes(16)).toString("hex");
  const signature = createHmac("sha256", STATE_SECRET)
    .update(payload)
    .digest("base64url");
  return [payload, signature].join(".");
}

function buildAuthorizationUrl(state: string, codeChallenge: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: getTidalAppCredentials().clientId,
    redirect_uri: REDIRECT_URI,
    scope: OAUTH_SCOPE,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `${AUTHORIZE_ENDPOINT}?${params.toString()}`;
}

function saveTokenBundle(tokenBundle: TokenBundle): void {
  const filePath = tokenBundleFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const plaintext = JSON.stringify(tokenBundle);
  if (safeStorage.isEncryptionAvailable()) {
    writePrivateFile(filePath, safeStorage.encryptString(plaintext));
  } else {
    writePrivateFile(filePath, Buffer.from(plaintext, "utf8"));
  }
}

function loadTokenBundle(): TokenBundle | null {
  const filePath = tokenBundleFilePath();
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath);
    const plaintext = safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(raw)
      : raw.toString("utf8");
    return JSON.parse(plaintext) as TokenBundle;
  } catch {
    return null;
  }
}

async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
): Promise<TokenBundle> {
  const params = new URLSearchParams();
  params.set("grant_type", "authorization_code");
  params.set("code", code);
  params.set("redirect_uri", REDIRECT_URI);
  const { clientId, clientSecret } = getTidalAppCredentials();
  params.set("client_id", clientId);
  params.set("code_verifier", codeVerifier);
  const response = await axios.post(TOKEN_ENDPOINT, params.toString(), {
    timeout: HTTP_TIMEOUT_MS,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    auth: { username: clientId, password: clientSecret },
  });
  const data = response.data as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
    scope: string;
  };
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    accessTokenExpiresAt: expiresAt,
    refreshTokenExpiresAt: "",
    userId: null,
    clientId,
  };
}

async function refreshTokenBundle(): Promise<TokenBundle> {
  const current = loadTokenBundle();
  if (!current) throw new Error("no token bundle to refresh");
  const params = new URLSearchParams();
  params.set("grant_type", "refresh_token");
  params.set("refresh_token", current.refreshToken);
  const { clientId, clientSecret } = getTidalAppCredentials();
  params.set("client_id", clientId);
  const response = await axios.post(TOKEN_ENDPOINT, params.toString(), {
    timeout: HTTP_TIMEOUT_MS,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    auth: { username: clientId, password: clientSecret },
  });
  const data = response.data as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();
  const updated: TokenBundle = {
    ...current,
    accessToken: data.access_token,
    refreshToken: data.refresh_token || current.refreshToken,
    accessTokenExpiresAt: expiresAt,
  };
  saveTokenBundle(updated);
  return updated;
}

export async function getValidAccessToken(): Promise<string | null> {
  const current = loadTokenBundle();
  if (!current) return null;
  if (isTokenBundleFresh(current)) return current.accessToken;
  try {
    const refreshed = await refreshTokenBundle();
    return refreshed.accessToken;
  } catch {
    return null;
  }
}

function getCurrentUserId(
  accessToken: string,
): Promise<string | null> {
  return axios
    .get(USERS_ME_ENDPOINT, {
      timeout: HTTP_TIMEOUT_MS,
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    .then((response) => {
      const data = response.data as {
        data?: { id?: string | number };
      };
      const id = data.data?.id;
      return id == null ? null : String(id);
    })
    .catch(() => null);
}

async function waitForAuthorizationCode(state: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? "", `http://${REDIRECT_HOST}:${REDIRECT_PORT}`);
      if (url.pathname !== REDIRECT_PATH) {
        response.writeHead(404).end();
        return;
      }
      const returnedState = url.searchParams.get("state");
      const code = url.searchParams.get("code");
      if (returnedState !== state || !code) {
        response.writeHead(400).end("state mismatch");
        finish(() => reject(new Error("OAuth state mismatch")));
        return;
      }
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end("<h1>¿Login realizado?</h1><p>Cierra esta pestaña.</p>");
      finish(() => resolve(code));
    });

    const timeout = setTimeout(
      () => finish(() => reject(new Error("Timed out waiting for the TIDAL login."))),
      OAUTH_CALLBACK_TIMEOUT_MS,
    );
    function finish(settle: () => void): void {
      clearTimeout(timeout);
      server.close();
      settle();
    }

    // Typically EADDRINUSE when a previous login attempt still holds the port.
    server.on("error", (error) => finish(() => reject(error)));
    server.listen(REDIRECT_PORT, REDIRECT_HOST);
  });
}

async function login(): Promise<TokenBundle> {
  const pkce = generatePkcePair();
  const state = createStateToken();
  const authorizationUrl = buildAuthorizationUrl(state, pkce.codeChallenge);
  // Open the browser first so the callback server actually receives the code.
  // Awaiting the callback before opening the URL deadlocks the flow forever.
  await shell.openExternal(authorizationUrl);
  const code = await waitForAuthorizationCode(state);
  const tokenBundle = await exchangeCodeForTokens(code, pkce.codeVerifier);
  const userId = await getCurrentUserId(tokenBundle.accessToken);
  tokenBundle.userId = userId;
  saveTokenBundle(tokenBundle);
  return tokenBundle;
}

async function logout(): Promise<void> {
  forgetAccountCountry();
  const filePath = tokenBundleFilePath();
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    /* ignore */
  }
}

export function registerAuthHandlers(): void {
  handleTrusted("auth:login", async () => {
    const tokenBundle = await login();
    return { isAuthenticated: true, userId: tokenBundle.userId };
  });

  handleTrusted("auth:is-authenticated", async () => {
    const tokenBundle = await getValidAccessToken();
    return Boolean(tokenBundle);
  });

  handleTrusted("auth:logout", async () => {
    await logout();
    return { isAuthenticated: false };
  });
}
