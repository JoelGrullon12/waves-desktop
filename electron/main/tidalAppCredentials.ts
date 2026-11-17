import { readAppSecrets, updateAppSecrets } from "./appSecrets";
import { handleTrusted } from "./secureIpc";
import {
  parseTidalAppCredentials,
  resolveTidalAppCredentials,
  type TidalAppCredentials,
} from "./validation";

// TIDAL developer-dashboard credentials. They are asked for on first launch
// (and can be changed in Settings) and kept with the other secrets, encrypted
// in the data folder, so a packaged build never ships with them.

function loadStoredCredentials(): TidalAppCredentials | null {
  const secrets = readAppSecrets();
  try {
    return parseTidalAppCredentials(secrets.tidalClientId, secrets.tidalClientSecret);
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

export function registerCredentialHandlers(): void {
  handleTrusted("credentials:get-status", () => {
    const resolved = resolveCredentials();
    return { configured: resolved !== null, source: resolved?.source ?? null };
  });

  handleTrusted("credentials:save", (_event, clientId, clientSecret) => {
    try {
      const credentials = parseTidalAppCredentials(clientId, clientSecret);
      updateAppSecrets({ tidalClientId: credentials.clientId, tidalClientSecret: credentials.clientSecret });
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // The renderer logs out first: tokens minted for one client are useless
  // with another.
  handleTrusted("credentials:clear", () => {
    updateAppSecrets({ tidalClientId: null, tidalClientSecret: null });
    const resolved = resolveCredentials();
    return { configured: resolved !== null, source: resolved?.source ?? null };
  });
}
