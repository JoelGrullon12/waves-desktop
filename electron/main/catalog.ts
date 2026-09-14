import axios from "axios";
import type { IpcMain } from "electron";
import { getValidAccessToken } from "./auth";

// Catalog proxy to the TIDAL v2 API (JSON:API). All API traffic runs through
// the main process so the access token never reaches the renderer.
//
// The v2 API is used exclusively because it authorizes with the modern scope
// names granted to dashboard-created clients. The legacy v1 API rejects those
// tokens with HTTP 403 / subStatus 11004.
//
// Every endpoint needs exactly one request: related albums and artists are
// resolved from the compound document's `included` list via `include=`.

// Mirrors src/types/track.ts. Defined here (not imported) so the main process
// stays independent of the renderer bundle.
interface CatalogArtist {
  id: string;
  name: string;
}

interface CatalogAlbum {
  id: string;
  title: string;
  cover: string | null;
}

interface Track {
  id: string;
  title: string;
  duration: number;
  trackNumber: number | null;
  volumeNumber: number | null;
  artists: CatalogArtist[];
  album: CatalogAlbum | null;
  audioQuality: string | null;
  isPlayable: boolean;
}

const TIDAL_CATALOG_BASE = "https://openapi.tidal.com/v2";
const DEFAULT_COUNTRY_CODE = "US";
const JSON_API_MEDIA_TYPE = "application/vnd.api+json";

interface ResourceObject {
  id: string;
  [key: string]: unknown;
}

interface ResourceIdentifier {
  id: string;
  type: string;
  meta?: { trackNumber?: number | null; volumeNumber?: number | null };
}

interface RelationshipDocument {
  data: ResourceIdentifier[];
  included: ResourceObject[];
}

interface MultiResourceDocument {
  data: ResourceObject[];
  included: ResourceObject[];
}

function isResourceObject(value: unknown): value is ResourceObject {
  return typeof value === "object" && value !== null && "id" in value;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function indexResources(resources: ResourceObject[]): Map<string, ResourceObject> {
  const byId = new Map<string, ResourceObject>();
  for (const resource of resources) byId.set(resource.id, resource);
  return byId;
}

function attributeString(resource: ResourceObject, key: string): string | null {
  const attributes = asRecord(resource["attributes"]);
  const value = attributes[key];
  return typeof value === "string" ? value : null;
}

function attributeStringArray(resource: ResourceObject, key: string): string[] {
  const attributes = asRecord(resource["attributes"]);
  const value = attributes[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function relationshipsIds(
  relationships: Record<string, unknown>,
  relationship: string,
): string[] {
  const rel = asRecord(relationships[relationship]);
  const data = rel["data"];
  if (!Array.isArray(data)) return [];
  return data
    .filter(isResourceObject)
    .map((identifier) => identifier.id)
    .filter((id): id is string => typeof id === "string");
}

function relationshipDataIds(resource: ResourceObject, relationship: string): string[] {
  return relationshipsIds(asRecord(resource["relationships"]), relationship);
}

// Tracks are only seconds long in practice ("PT2M58S"); the parser covers the
// H/M/S components and ignores days for forward compatibility.
function iso8601DurationToSeconds(value: string): number {
  let totalSeconds = 0;
  let digits = "";
  for (const char of value) {
    if (char === "P" || char === "T") continue;
    if (char === "D") {
      digits = "";
      continue;
    }
    if (char === "H" || char === "M" || char === "S") {
      const multiplier = digits === "" ? 0 : Number(digits);
      const seconds =
        char === "H" ? multiplier * 3600 : char === "M" ? multiplier * 60 : multiplier;
      totalSeconds += seconds;
      digits = "";
      continue;
    }
    if (char >= "0" && char <= "9") {
      digits += char;
    } else {
      digits = "";
    }
  }
  return totalSeconds;
}

function mediaTagToQuality(mediaTags: string[]): string | null {
  const PREFERRED_ORDER = [
    "HI_RES_LOSSLESS",
    "LOSSLESS",
    "DOLBY_ATMOS",
    "SONY_360RA",
    "HIGH",
    "LOW",
  ];
  for (const preferred of PREFERRED_ORDER) {
    // The API spells the first one "HIRES_LOSSLESS".
    const expected = preferred === "HI_RES_LOSSLESS" ? "HIRES_LOSSLESS" : preferred;
    if (mediaTags.some((tag) => tag.toLowerCase() === expected.toLowerCase())) {
      return preferred;
    }
  }
  return null;
}

function trackFromV2Resource(
  resource: ResourceObject,
  byId: Map<string, ResourceObject>,
  trackNumber: number | null,
  volumeNumber: number | null,
): Track {
  const artists = relationshipDataIds(resource, "artists")
    .map((id) => byId.get(id))
    .filter((artist): artist is ResourceObject => artist !== undefined)
    .map((artist) => ({
      id: artist.id,
      name: attributeString(artist, "name") ?? "",
    }));

  const albumResource = relationshipDataIds(resource, "albums")
    .map((id) => byId.get(id))
    .find((album): album is ResourceObject => album !== undefined);

  const album = albumResource
    ? {
        id: albumResource.id,
        title: attributeString(albumResource, "title") ?? "",
        cover: relationshipDataIds(albumResource, "coverArt")[0] ?? null,
      }
    : null;

  const durationString = attributeString(resource, "duration");
  const duration = durationString ? iso8601DurationToSeconds(durationString) : 0;

  return {
    id: resource.id,
    title: attributeString(resource, "title") ?? "",
    duration,
    trackNumber,
    volumeNumber,
    artists,
    album,
    audioQuality: mediaTagToQuality(attributeStringArray(resource, "mediaTags")),
    isPlayable: true,
  };
}

// Converts a search compound document to Tracks, honoring the relevance order
// of the searchResults `tracks` relationship (the `included` list order is not
// guaranteed to be meaningful).
function tracksFromSearch(document: MultiResourceDocument): Track[] {
  const byId = indexResources(document.included);
  const orderedTrackIds: string[] = [];
  for (const searchResults of document.data) {
    orderedTrackIds.push(...relationshipsIds(asRecord(searchResults["relationships"]), "tracks"));
  }
  const seen = new Set<string>();
  return orderedTrackIds
    .filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map((id) => byId.get(id))
    .filter((resource): resource is ResourceObject => resource !== undefined)
    .map((resource) => trackFromV2Resource(resource, byId, null, null));
}

// Converts an items relationship (album or playlist) to Tracks, honoring the
// relationship order and, when present, the per-item track/volume numbers.
function tracksFromItems(document: RelationshipDocument): Track[] {
  const byId = indexResources(document.included);
  return document.data
    .filter((identifier) => identifier.type === "tracks")
    .map((identifier) => {
      const resource = byId.get(identifier.id);
      if (!resource) return null;
      return trackFromV2Resource(
        resource,
        byId,
        identifier.meta?.trackNumber ?? null,
        identifier.meta?.volumeNumber ?? null,
      );
    })
    .filter((track): track is Track => track !== null);
}

async function fetchJson(url: string): Promise<unknown> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) throw new Error("Not authenticated: no valid TIDAL access token.");

  const response = await axios.get(url, {
    headers: {
      Accept: JSON_API_MEDIA_TYPE,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return response.data;
}

function buildSearchUrl(query: string): string {
  const searchUrl = new URL(`${TIDAL_CATALOG_BASE}/searchResults`);
  searchUrl.searchParams.set("filter[query]", query);
  searchUrl.searchParams.set("countryCode", DEFAULT_COUNTRY_CODE);
  searchUrl.searchParams.set("include", "tracks");
  searchUrl.searchParams.set("include", "tracks.albums");
  searchUrl.searchParams.set("include", "tracks.artists");
  return searchUrl.toString();
}

function buildItemsUrl(collection: "albums" | "playlists", id: string): string {
  const itemsUrl = new URL(`${TIDAL_CATALOG_BASE}/${collection}/${id}/relationships/items`);
  itemsUrl.searchParams.set("countryCode", DEFAULT_COUNTRY_CODE);
  itemsUrl.searchParams.set("include", "items.albums");
  itemsUrl.searchParams.set("include", "items.artists");
  return itemsUrl.toString();
}

export async function searchTracks(query: string): Promise<Track[]> {
  const document = (await fetchJson(buildSearchUrl(query))) as MultiResourceDocument;
  const tracks = tracksFromSearch(document);
  if (tracks.length === 0) throw new Error("No tracks found for the query.");
  return tracks;
}

export async function getAlbumTracks(albumId: string): Promise<Track[]> {
  const document = (await fetchJson(buildItemsUrl("albums", albumId))) as RelationshipDocument;
  const tracks = tracksFromItems(document);
  if (tracks.length === 0) throw new Error("Album has no streamable tracks.");
  return tracks;
}

export async function getPlaylistTracks(playlistId: string): Promise<Track[]> {
  const document = (await fetchJson(buildItemsUrl("playlists", playlistId))) as RelationshipDocument;
  const tracks = tracksFromItems(document);
  if (tracks.length === 0) throw new Error("Playlist has no streamable tracks.");
  return tracks;
}

export function registerCatalogHandlers(ipcMain: IpcMain): void {
  ipcMain.handle("catalog:search-tracks", (_event, query: string) => searchTracks(query));
  ipcMain.handle("catalog:get-album-tracks", (_event, albumId: string) =>
    getAlbumTracks(albumId),
  );
  ipcMain.handle("catalog:get-playlist-tracks", (_event, playlistId: string) =>
    getPlaylistTracks(playlistId),
  );
}