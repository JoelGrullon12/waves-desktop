import { BrowserWindow, dialog } from "electron";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { PlaylistCoverChoice, PlaylistEditResult } from "../../src/types/media";
import { HOME_ARTWORK_WIDTH, reportLibraryChange } from "./catalog";
import { handleTrusted } from "./secureIpc";
import { DEFAULT_COUNTRY_CODE, requestJson, TIDAL_CATALOG_BASE } from "./tidalApiClient";
import {
  artworkFileHref,
  asRecord,
  indexResources,
  type RelationshipDocument,
  type SingleResourceDocument,
} from "./tidalParsers";
import { requirePlaylistDescription, requirePlaylistName, requireResourceId } from "./validation";

// Editing a playlist the user owns: name, description and cover. A cover is
// either one of the covers TIDAL suggests for the playlist or an image the
// user picks, which is uploaded as a new artwork first.

// TIDAL's limit for an uploaded artwork.
const MAX_COVER_BYTES = 20_000_000;
const COVER_FILE_TYPES: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png" };
const UPLOAD_TIMEOUT_MS = 60_000;

function playlistUrl(playlistId: string, suffix = ""): string {
  const url = new URL(`${TIDAL_CATALOG_BASE}/playlists/${playlistId}${suffix}`);
  url.searchParams.set("countryCode", DEFAULT_COUNTRY_CODE);
  return url.toString();
}

export async function updatePlaylistDetails(playlistId: string, name: string, description: string): Promise<void> {
  await requestJson("PATCH", playlistUrl(playlistId), {
    data: { id: playlistId, type: "playlists", attributes: { name, description } },
  });
}

export async function getSuggestedCovers(playlistId: string): Promise<PlaylistCoverChoice[]> {
  const url = new URL(playlistUrl(playlistId, "/relationships/suggestedCoverArts"));
  url.searchParams.set("include", "suggestedCoverArts");
  const document = (await requestJson("GET", url.toString())) as RelationshipDocument;
  const byId = indexResources(document.included);
  return (document.data ?? []).flatMap((identifier) => {
    const imageUrl = artworkFileHref(identifier.id, byId, HOME_ARTWORK_WIDTH);
    return imageUrl ? [{ artworkId: identifier.id, imageUrl }] : [];
  });
}

export async function setPlaylistCover(playlistId: string, artworkId: string): Promise<void> {
  await requestJson("PATCH", playlistUrl(playlistId, "/relationships/coverArt"), {
    data: [{ id: artworkId, type: "artworks" }],
  });
}

// Creates the artwork, sends the file to the upload link TIDAL hands back and
// returns the new artwork's id.
async function uploadArtwork(image: Buffer, contentType: string): Promise<string> {
  const createUrl = new URL(`${TIDAL_CATALOG_BASE}/artworks`);
  createUrl.searchParams.set("countryCode", DEFAULT_COUNTRY_CODE);
  const document = (await requestJson("POST", createUrl.toString(), {
    data: {
      type: "artworks",
      attributes: {
        mediaType: "IMAGE",
        sourceFile: { md5Hash: createHash("md5").update(image).digest("base64"), size: image.length },
      },
    },
  })) as SingleResourceDocument;
  const artworkId = document.data.id;
  const sourceFile = asRecord(asRecord(document.data["attributes"])["sourceFile"]);
  const uploadLink = asRecord(sourceFile["uploadLink"]);
  const href = uploadLink["href"];
  if (typeof href !== "string" || !href.startsWith("https://")) {
    throw new Error("TIDAL did not return where to upload the image.");
  }
  const meta = asRecord(uploadLink["meta"]);
  const headers = Object.fromEntries(
    Object.entries(asRecord(meta["headers"])).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
  const response = await fetch(href, {
    method: typeof meta["method"] === "string" ? meta["method"] : "PUT",
    headers: { "Content-Type": contentType, ...headers },
    body: new Uint8Array(image),
    signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`The image upload failed with HTTP ${response.status}.`);
  return artworkId;
}

async function chooseAndUploadCover(window: BrowserWindow | null, playlistId: string): Promise<PlaylistEditResult | null> {
  const options = {
    title: "Choose a cover image",
    filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png"] }],
    properties: ["openFile"] as Array<"openFile">,
  };
  // Debug only (with WAVES_DEBUG_API=1): an automated check names the file
  // instead of clicking through the dialog.
  const debugFile = process.env["WAVES_DEBUG_API"] === "1" ? process.env["WAVES_DEBUG_COVER_FILE"] : undefined;
  const choice = debugFile
    ? { canceled: false, filePaths: [debugFile] }
    : window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
  const filePath = choice.filePaths[0];
  if (choice.canceled || !filePath) return null;
  const contentType = COVER_FILE_TYPES[path.extname(filePath).toLowerCase()];
  if (!contentType) return { success: false, error: "Use a JPEG or PNG image." };
  const image = await fs.readFile(filePath);
  if (image.length === 0 || image.length > MAX_COVER_BYTES) {
    return { success: false, error: "The image must be smaller than 20 MB." };
  }
  const artworkId = await uploadArtwork(image, contentType);
  await setPlaylistCover(playlistId, artworkId);
  return { success: true };
}

function failure(error: unknown): PlaylistEditResult {
  return { success: false, error: error instanceof Error ? error.message : String(error) };
}

export function registerPlaylistEditingHandlers(): void {
  handleTrusted("library:update-playlist", async (_event, rawPlaylistId, rawName, rawDescription): Promise<PlaylistEditResult> => {
    const playlistId = requireResourceId(rawPlaylistId, "playlist id");
    const name = requirePlaylistName(rawName);
    const description = requirePlaylistDescription(rawDescription);
    try {
      await updatePlaylistDetails(playlistId, name, description);
      reportLibraryChange({ type: "playlist-renamed", playlistId, title: name });
      return { success: true };
    } catch (error) {
      return failure(error);
    }
  });
  handleTrusted("library:get-suggested-playlist-covers", (_event, playlistId) =>
    getSuggestedCovers(requireResourceId(playlistId, "playlist id")),
  );
  handleTrusted("library:set-playlist-cover", async (_event, rawPlaylistId, rawArtworkId): Promise<PlaylistEditResult> => {
    try {
      await setPlaylistCover(requireResourceId(rawPlaylistId, "playlist id"), requireResourceId(rawArtworkId, "artwork id"));
      return { success: true };
    } catch (error) {
      return failure(error);
    }
  });
  // The file is picked in a native dialog here; the renderer never sends a path.
  handleTrusted("library:upload-playlist-cover", async (event, rawPlaylistId): Promise<PlaylistEditResult | null> => {
    const playlistId = requireResourceId(rawPlaylistId, "playlist id");
    try {
      return await chooseAndUploadCover(BrowserWindow.fromWebContents(event.sender), playlistId);
    } catch (error) {
      return failure(error);
    }
  });
}
