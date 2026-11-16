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

// Preference keys are fixed names chosen by the app ("player.volume"); the
// value is free text the app serializes itself.
const PREFERENCE_KEY_PATTERN = /^[a-z][A-Za-z0-9.]{0,63}$/;
const MAX_PREFERENCE_VALUE_LENGTH = 4096;

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
