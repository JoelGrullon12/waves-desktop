// Argument validation for everything the renderer can send over IPC. The values
// end up inside request URLs and file paths, so they are checked against
// narrow patterns instead of being escaped after the fact.

const RESOURCE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const COLLECTION_NAME_PATTERN = /^[A-Za-z]{1,40}$/;
const MAX_CURSOR_LENGTH = 2048;
const MAX_SEARCH_QUERY_LENGTH = 200;
const MAX_TRACK_IDS_PER_CALL = 1000;
const APP_CREDENTIAL_PATTERN = /^[A-Za-z0-9_+=./-]{8,256}$/;
const MIX_RELATIONSHIPS = ["myMixes", "discoveryMixes"] as const;

export type MixRelationship = (typeof MIX_RELATIONSHIPS)[number];

function invalidArgument(label: string): Error {
  return new Error(`Invalid ${label}.`);
}

export function requireResourceId(value: unknown, label: string): string {
  if (typeof value !== "string" || !RESOURCE_ID_PATTERN.test(value)) throw invalidArgument(label);
  return value;
}

export function optionalResourceId(value: unknown, label: string): string | null {
  return value == null ? null : requireResourceId(value, label);
}

export function requireNumberInRange(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw invalidArgument(label);
  }
  return value;
}

// The mix type is the JSON:API resource type TIDAL returns ("playlists", ...)
// and is used as a path segment.
export function requireCollectionName(value: unknown, label: string): string {
  if (typeof value !== "string" || !COLLECTION_NAME_PATTERN.test(value)) {
    throw invalidArgument(label);
  }
  return value;
}

export function requireMixRelationship(value: unknown): MixRelationship {
  if (!MIX_RELATIONSHIPS.includes(value as MixRelationship)) {
    throw invalidArgument("mix relationship");
  }
  return value as MixRelationship;
}

export function optionalCursor(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string" || value.length > MAX_CURSOR_LENGTH) {
    throw invalidArgument("cursor");
  }
  return value.length === 0 ? null : value;
}

export function requireSearchQuery(value: unknown): string {
  if (typeof value !== "string") throw invalidArgument("search query");
  const query = value.trim();
  if (query.length === 0 || query.length > MAX_SEARCH_QUERY_LENGTH) {
    throw invalidArgument("search query");
  }
  return query;
}

const MAX_PLAYLIST_NAME_LENGTH = 100;

export function requirePlaylistName(value: unknown): string {
  if (typeof value !== "string") throw invalidArgument("playlist name");
  const name = value.trim();
  if (name.length === 0 || name.length > MAX_PLAYLIST_NAME_LENGTH) {
    throw invalidArgument("playlist name");
  }
  return name;
}

// TIDAL's limit when a playlist is edited.
const MAX_PLAYLIST_DESCRIPTION_LENGTH = 500;

// Empty is allowed: it clears the description.
export function requirePlaylistDescription(value: unknown): string {
  if (typeof value !== "string") throw invalidArgument("playlist description");
  const description = value.trim();
  if (description.length > MAX_PLAYLIST_DESCRIPTION_LENGTH) {
    throw invalidArgument(`playlist description (at most ${MAX_PLAYLIST_DESCRIPTION_LENGTH} characters)`);
  }
  return description;
}

// Preference keys are fixed names chosen by the app ("player.volume"); the
// value is free text the app serializes itself.
const PREFERENCE_KEY_PATTERN = /^[a-z][A-Za-z0-9.]{0,63}$/;
const MAX_PREFERENCE_VALUE_LENGTH = 4096;

export function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw invalidArgument(label);
  return value;
}

export function requirePreferenceKey(value: unknown): string {
  if (typeof value !== "string" || !PREFERENCE_KEY_PATTERN.test(value)) {
    throw invalidArgument("preference key");
  }
  return value;
}

export function requirePreferenceValue(value: unknown): string {
  if (typeof value !== "string" || value.length > MAX_PREFERENCE_VALUE_LENGTH) {
    throw invalidArgument("preference value");
  }
  return value;
}

export function requireResourceIdList(
  value: unknown,
  label: string,
  maximumLength: number = MAX_TRACK_IDS_PER_CALL,
): string[] {
  if (!Array.isArray(value) || value.length > maximumLength) throw invalidArgument(label);
  return value.map((id) => requireResourceId(id, label));
}

// The sign-in window ends on the redirect URI with `?code=...`; anything else
// (including the same path on another host) is not the authorization result.
export function authorizationCodeFromRedirect(url: string, redirectUri: string): string | null {
  try {
    const parsed = new URL(url);
    const expected = new URL(redirectUri);
    if (parsed.origin !== expected.origin || parsed.pathname !== expected.pathname) return null;
    return parsed.searchParams.get("code") || null;
  } catch {
    return null;
  }
}

export interface TidalAppCredentials {
  clientId: string;
  clientSecret: string;
}

// Pasted by hand from the TIDAL developer dashboard, so stray whitespace is
// trimmed; anything else outside the characters TIDAL issues is rejected.
export function parseTidalAppCredentials(clientId: unknown, clientSecret: unknown): TidalAppCredentials {
  if (typeof clientId !== "string" || typeof clientSecret !== "string") {
    throw invalidArgument("TIDAL credentials");
  }
  const parsed = { clientId: clientId.trim(), clientSecret: clientSecret.trim() };
  if (!APP_CREDENTIAL_PATTERN.test(parsed.clientId)) throw invalidArgument("client ID");
  if (!APP_CREDENTIAL_PATTERN.test(parsed.clientSecret)) throw invalidArgument("client secret");
  return parsed;
}

// The .env file is a development override: when both variables are set they
// win over what the user saved in the app.
export function resolveTidalAppCredentials(
  environment: { TIDAL_CLIENT_ID?: string; TIDAL_CLIENT_SECRET?: string },
  stored: TidalAppCredentials | null,
): { credentials: TidalAppCredentials; source: "env" | "stored" } | null {
  const clientId = environment.TIDAL_CLIENT_ID?.trim();
  const clientSecret = environment.TIDAL_CLIENT_SECRET?.trim();
  if (clientId && clientSecret) return { credentials: { clientId, clientSecret }, source: "env" };
  return stored ? { credentials: stored, source: "stored" } : null;
}

export const DEFAULT_OAUTH_REDIRECT_URI = "http://127.0.0.1:8899/tidal-callback";
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost"]);

export interface OAuthRedirect {
  // Sent to TIDAL exactly as written: it must match the Dashboard character by character.
  uri: string;
  host: string;
  port: number;
  path: string;
}

// TIDAL_REDIRECT_URI (development only) changes where the Dashboard login comes
// back to. The app listens there itself, so only a loopback http URL with an
// explicit port and a path works; anything else is refused instead of failing
// later with TIDAL's error 11102.
export function resolveOAuthRedirect(configured: string | undefined): OAuthRedirect {
  const uri = configured?.trim() || DEFAULT_OAUTH_REDIRECT_URI;
  const refuse = (): never => {
    throw new Error(
      `TIDAL_REDIRECT_URI must look like ${DEFAULT_OAUTH_REDIRECT_URI} (http, 127.0.0.1 or localhost, ` +
        "a port from 1024 to 65535 and a path).",
    );
  };
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return refuse();
  }
  const port = Number(parsed.port);
  const isValid =
    parsed.protocol === "http:" &&
    LOOPBACK_HOSTS.has(parsed.hostname) &&
    Number.isInteger(port) &&
    port >= 1024 &&
    port <= 65535 &&
    parsed.pathname.length > 1 &&
    !parsed.search &&
    !parsed.hash &&
    !parsed.username &&
    !parsed.password;
  if (!isValid) return refuse();
  return { uri, host: parsed.hostname, port, path: parsed.pathname };
}

export interface TursoConfig {
  databaseUrl: string;
  authToken: string;
}

const MAX_TURSO_URL_LENGTH = 512;
const TURSO_TOKEN_PATTERN = /^[A-Za-z0-9_.+/=-]{16,4096}$/;

// A Turso database URL (`libsql://name-org.turso.io`) or a plain HTTPS one;
// the HTTP client of @libsql/client accepts both.
export function parseTursoConfig(databaseUrl: unknown, authToken: unknown): TursoConfig {
  if (typeof databaseUrl !== "string" || typeof authToken !== "string") {
    throw invalidArgument("Turso settings");
  }
  const url = databaseUrl.trim();
  const token = authToken.trim();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw invalidArgument("database URL");
  }
  const isSupportedProtocol = parsed.protocol === "libsql:" || parsed.protocol === "https:";
  if (!isSupportedProtocol || !parsed.hostname || url.length > MAX_TURSO_URL_LENGTH || parsed.username || parsed.password) {
    throw invalidArgument("database URL");
  }
  if (!TURSO_TOKEN_PATTERN.test(token)) throw invalidArgument("auth token");
  return { databaseUrl: url, authToken: token };
}

// Same rule as the TIDAL credentials: both TURSO_* values in .env win over
// what was saved in Settings.
export function resolveTursoConfig(
  environment: { TURSO_DATABASE_URL?: string; TURSO_AUTH_TOKEN?: string },
  stored: { tursoDatabaseUrl?: string; tursoAuthToken?: string },
): { config: TursoConfig; source: "env" | "stored" } | null {
  const environmentUrl = environment.TURSO_DATABASE_URL?.trim();
  const environmentToken = environment.TURSO_AUTH_TOKEN?.trim();
  if (environmentUrl && environmentToken) {
    return { config: { databaseUrl: environmentUrl, authToken: environmentToken }, source: "env" };
  }
  if (stored.tursoDatabaseUrl && stored.tursoAuthToken) {
    return { config: { databaseUrl: stored.tursoDatabaseUrl, authToken: stored.tursoAuthToken }, source: "stored" };
  }
  return null;
}

export function requireNetworkPort(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1024 || value > 65535) {
    throw invalidArgument("port (use a number from 1024 to 65535)");
  }
  return value;
}

export interface TrustedRenderer {
  // Origin of the electron-vite dev server; null in a packaged build.
  developmentOrigin: string | null;
}

// In development only the dev server may call IPC. In a packaged build the
// window loads index.html from disk and react-router rewrites the path with
// pushState, so any file: URL is the app's own page (navigation away from it
// is blocked in index.ts).
export function isTrustedSenderUrl(senderUrl: string, trusted: TrustedRenderer): boolean {
  let parsed: URL;
  try {
    parsed = new URL(senderUrl);
  } catch {
    return false;
  }
  if (trusted.developmentOrigin !== null) return parsed.origin === trusted.developmentOrigin;
  return parsed.protocol === "file:";
}
