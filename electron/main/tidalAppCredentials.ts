import { app, safeStorage } from "electron";
import fs from "node:fs";
import path from "node:path";
import { writePrivateFile } from "./privateFile";
import { handleTrusted } from "./secureIpc";
import {
  parseTidalAppCredentials,
  resolveTidalAppCredentials,
  type TidalAppCredentials,
} from "./validation";

// TIDAL developer-dashboard credentials. They are asked for on first launch and
// kept encrypted in userData, so a packaged build never ships with them.

const CREDENTIALS_FILE = "tidal-app-credentials";

function credentialsFilePath(): string {
  return path.join(app.getPath("userData"), CREDENTIALS_FILE);
}

function loadStoredCredentials(): TidalAppCredentials | null {
  try {
    const filePath = credentialsFilePath();
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath);
    const plaintext = safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(raw)
      : raw.toString("utf8");
    const stored = JSON.parse(plaintext) as Partial<TidalAppCredentials>;
    return parseTidalAppCredentials(stored.clientId, stored.clientSecret);
  } catch {
    return null;
  }
}

function resolveCredentials() {
  return resolveTidalAppCredentials(process.env, loadStoredCredentials());
}

export function getTidalAppCredentials(): TidalAppCredentials {
  const resolved = resolveCredentials();
  if (!resolved) throw new Error("TIDAL application credentials are not configured.");
  return resolved.credentials;
}

function saveTidalAppCredentials(credentials: TidalAppCredentials): void {
  const plaintext = JSON.stringify(credentials);
  fs.mkdirSync(path.dirname(credentialsFilePath()), { recursive: true });
  writePrivateFile(
    credentialsFilePath(),
    safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(plaintext)
      : Buffer.from(plaintext, "utf8"),
  );
}

export function registerCredentialHandlers(): void {
  handleTrusted("credentials:get-status", () => {
    const resolved = resolveCredentials();
    return { configured: resolved !== null, source: resolved?.source ?? null };
  });

  handleTrusted("credentials:save", (_event, clientId, clientSecret) => {
    try {
      saveTidalAppCredentials(parseTidalAppCredentials(clientId, clientSecret));
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}
