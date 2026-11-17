import { safeStorage } from "electron";
import fs from "node:fs";
import path from "node:path";
import { dataDirectory, systemDataDirectory } from "./appDataLocation";
import { writePrivateFile } from "./privateFile";

// Values that must not sit in plain text next to the settings: the TIDAL
// dashboard credentials, the Turso database token and the phone remote's
// pairing token. They are kept together in one file encrypted with
// safeStorage (DPAPI on Windows, the keyring on Linux) and readable only by
// this OS user. No IPC handler ever returns them.

export const SECRETS_FILE = "app-secrets";
// Where earlier versions kept the TIDAL credentials on their own.
const LEGACY_CREDENTIALS_FILE = "tidal-app-credentials";

export interface AppSecrets {
  tidalClientId?: string;
  tidalClientSecret?: string;
  tursoDatabaseUrl?: string;
  tursoAuthToken?: string;
  remotePairingToken?: string;
}

export type AppSecretsChange = { [Key in keyof AppSecrets]?: string | null };

let cachedSecrets: AppSecrets | null = null;

function secretsFilePath(): string {
  return path.join(dataDirectory(), SECRETS_FILE);
}

function decrypt(raw: Buffer): string {
  return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString("utf8");
}

function encrypt(plaintext: string): Buffer {
  // Without a keyring (some Linux sessions) safeStorage can not encrypt; the
  // file then relies on its 0600 mode, as the credentials always did.
  return safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(plaintext)
    : Buffer.from(plaintext, "utf8");
}

function readSecretsFile(filePath: string): AppSecrets | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const parsed: unknown = JSON.parse(decrypt(fs.readFileSync(filePath)));
    if (!parsed || typeof parsed !== "object") return null;
    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => typeof value === "string" && value !== ""),
    ) as AppSecrets;
  } catch (error) {
    console.error(`app-secrets: could not read ${filePath}: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

export function readAppSecrets(): AppSecrets {
  cachedSecrets ??= readSecretsFile(secretsFilePath()) ?? {};
  return { ...cachedSecrets };
}

// `null` removes a value; keys left out are kept.
export function updateAppSecrets(change: AppSecretsChange): void {
  const next: Record<string, string> = { ...readAppSecrets() };
  for (const [key, value] of Object.entries(change)) {
    if (value == null || value === "") delete next[key];
    else next[key] = value;
  }
  fs.mkdirSync(dataDirectory(), { recursive: true });
  writePrivateFile(secretsFilePath(), encrypt(JSON.stringify(next)));
  cachedSecrets = next;
}

// Run once at startup: brings the TIDAL credentials of earlier versions into
// this file and removes the old one.
export function migrateLegacySecrets(legacyRemotePairingToken: string | null): void {
  const legacyPath = path.join(systemDataDirectory(), LEGACY_CREDENTIALS_FILE);
  const change: AppSecretsChange = {};
  const current = readAppSecrets();
  let isLegacyFileRead = false;
  if (fs.existsSync(legacyPath)) {
    try {
      const legacy = JSON.parse(decrypt(fs.readFileSync(legacyPath))) as {
        clientId?: unknown;
        clientSecret?: unknown;
      };
      if (!current.tidalClientId && typeof legacy.clientId === "string" && typeof legacy.clientSecret === "string") {
        change.tidalClientId = legacy.clientId;
        change.tidalClientSecret = legacy.clientSecret;
      }
      isLegacyFileRead = true;
    } catch (error) {
      console.error(`app-secrets: could not read the old credentials: ${error instanceof Error ? error.message : error}`);
    }
  }
  if (legacyRemotePairingToken && !current.remotePairingToken) {
    change.remotePairingToken = legacyRemotePairingToken;
  }
  if (Object.keys(change).length > 0) updateAppSecrets(change);
  // Kept when it could not be read, so nothing is lost.
  if (isLegacyFileRead) fs.rmSync(legacyPath, { force: true });
}

// The data folder moved: read the file again from its new place.
export function forgetCachedSecrets(): void {
  cachedSecrets = null;
}
