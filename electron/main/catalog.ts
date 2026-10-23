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

interface PlaylistSummary {
  id: string;
  title: string;
  cover: string | null;
  numberOfItems: number;
  duration: number;
  playlistType: string | null;
}

interface AlbumSummary {
  id: string;
  title: string;
  cover: string | null;
  artists: CatalogArtist[];
  releaseDate: string | null;
  numberOfItems: number;
}

interface MixSummary {
  id: string;
  mixType: string;
  title: string;
  cover: string | null;
  numberOfItems: number;
}

interface AlbumDetail {
  id: string;
  title: string;
  cover: string | null;
  artists: CatalogArtist[];
  releaseDate: string | null;
  numberOfItems: number;
  duration: number;
}

interface PlaylistDetail {
  id: string;
  title: string;
  cover: string | null;
  playlistType: string | null;
  numberOfItems: number;
  duration: number;
}

interface TrackPage {
  tracks: Track[];
  nextCursor: string | null;
}

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

interface SingleResourceDocument {
  data: ResourceObject;
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

function attributeNumber(resource: ResourceObject, key: string): number | null {
  const attributes = asRecord(resource["attributes"]);
  const value = attributes[key];
  return typeof value === "number" ? value : null;
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

// The coverArt relationship only exposes the artwork resource's short id; the
// CDN cannot serve an image from that id (it 403s). The artwork's `files`
// attribute carries fully-resolved CDN hrefs for the declared sizes — the only
// sizes the CDN actually serves (an off-list size also 403s). So the cover URL
// is taken from those hrefs, choosing the size closest to the target.
const TARGET_ARTWORK_WIDTH = 320;

function artworkFileHref(
  artworkId: string | null,
  byId: Map<string, ResourceObject>,
  targetWidth = TARGET_ARTWORK_WIDTH,
): string | null {
  if (!artworkId) return null;
  const artworkResource = byId.get(artworkId);
  if (!artworkResource) return null;
  const files = asRecord(artworkResource["attributes"])["files"];
  if (!Array.isArray(files)) return null;

  let closestHref: string | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const file of files) {
    const href = asRecord(file)["href"];
    if (typeof href !== "string") continue;
    const meta = asRecord(asRecord(file)["meta"]);
    const width = typeof meta["width"] === "number" ? meta["width"] : 0;
    const distance = Math.abs(width - targetWidth);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestHref = href;
    }
  }
  return closestHref;
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
        cover: artworkFileHref(relationshipDataIds(albumResource, "coverArt")[0], byId),
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

// Converts a multi-resource tracks document (GET /tracks by filter[id]) to
// Tracks, honoring the resource order (the API echoes the request order).
function tracksFromTracksDocument(document: MultiResourceDocument): Track[] {
  const byId = indexResources(document.included);
  return document.data
    .filter((resource) => resource["type"] === "tracks")
    .map((resource) => trackFromV2Resource(resource, byId, null, null));
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

// Only HTTP status matters here; probing `isAxiosError` would couple this file
// to axios internals. A 429 has a `response.status`, plain network failures do
// not reach this helper.
function httpStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const response = (error as { response?: { status?: unknown } }).response;
  return typeof response?.status === "number" ? response.status : null;
}

const MAX_RATE_LIMIT_RETRIES = 4;

async function fetchJson(url: string): Promise<unknown> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) throw new Error("Not authenticated: no valid TIDAL access token.");

  for (let attempt = 0; ; attempt++) {
    try {
      const response = await axios.get(url, {
        headers: {
          Accept: JSON_API_MEDIA_TYPE,
          Authorization: `Bearer ${accessToken}`,
        },
      });
      return response.data;
    } catch (error) {
      // TIDAL's edge rate-limits short request bursts with HTTP 429 plus a
      // Retry-After header. Honoring it keeps multi-page catalog reads stable;
      // we never saw a 429 here that a pause did not clear.
      const status = httpStatus(error);
      if (status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
        const headers = (error as { response?: { headers?: Record<string, string> } }).response
          ?.headers;
        const parsedRetryAfter = Number.parseInt(headers?.["retry-after"] ?? "", 10);
        const retryAfterSeconds = Number.isFinite(parsedRetryAfter) ? parsedRetryAfter : 1;
        const delayMilliseconds = Math.max(500, retryAfterSeconds * 1000) * (attempt + 1);
        console.warn(
          `catalog: rate limited (429), retrying ${url} in ${delayMilliseconds}ms ` +
            `(attempt ${attempt + 1}/${MAX_RATE_LIMIT_RETRIES})`,
        );
        await sleep(delayMilliseconds);
        continue;
      }
      throw error;
    }
  }
}

// URLSearchParams.set() replaces every existing value with the same name, so
// repeated `include` keys must be appended (JSON:API allows any number of
// comma-separated values, the API also accepts repeated params) to keep all of
// them in the compound document.
function buildSearchUrl(query: string): string {
  const searchUrl = new URL(`${TIDAL_CATALOG_BASE}/searchResults`);
  searchUrl.searchParams.set("filter[query]", query);
  searchUrl.searchParams.set("countryCode", DEFAULT_COUNTRY_CODE);
  searchUrl.searchParams.append("include", "tracks");
  searchUrl.searchParams.append("include", "tracks.albums");
  searchUrl.searchParams.append("include", "tracks.albums.coverArt");
  searchUrl.searchParams.append("include", "tracks.artists");
  return searchUrl.toString();
}

function buildItemsUrl(
  collection: "albums" | "playlists",
  id: string,
  cursor: string | null = null,
): string {
  const itemsUrl = new URL(`${TIDAL_CATALOG_BASE}/${collection}/${id}/relationships/items`);
  itemsUrl.searchParams.set("countryCode", DEFAULT_COUNTRY_CODE);
  itemsUrl.searchParams.append("include", "items.albums");
  itemsUrl.searchParams.append("include", "items.albums.coverArt");
  itemsUrl.searchParams.append("include", "items.artists");
  if (cursor) itemsUrl.searchParams.set("page[cursor]", cursor);
  return itemsUrl.toString();
}

// Album/playlist track lists paginate server-side with the same
// `links.meta.nextCursor` contract as the likes collection. The renderer walks
// them page by page (infinite scroll + background prefetch); pacing keeps the
// walk under the edge rate limit.
async function getItemsTracksPage(
  collection: "albums" | "playlists",
  id: string,
  cursor: string | null,
): Promise<TrackPage> {
  if (cursor) await sleep(COLLECTION_PAGE_PACING_MS);
  const document = (await fetchJson(
    buildItemsUrl(collection, id, cursor),
  )) as CollectionItemsDocument;
  const tracks = tracksFromItems(document);
  const nextPageCursor = nextCursor(document);
  if (tracks.length === 0 || !nextPageCursor || nextPageCursor === cursor) {
    return { tracks, nextCursor: null };
  }
  return { tracks, nextCursor: nextPageCursor };
}

// The likes collection paginates server-side (default ~20 items / page) and is
// ordered by most-recently-added. Every page returns `links.meta.nextCursor`
// pointing at the following page. Pages are fetched on demand by the renderer
// (infinite scroll / prefetch); requests are paced to stay under the edge rate limit.
//
// `page[size]` is not part of the OpenAPI spec for this endpoint. We probe it
// at runtime on each session: the first candidate (50) is tried; a 400 falls
// back to the server default.
//
// RATE LIMIT CEILING: both page[size]=500 and page[size]=100 were tried on
// 2026-09-15 and TIDAL's edge rejects them with 429 (rate limited) mid-collection
// walk — bigger pages just make every page retry 4 times. 50 is the verified
// safe size; do NOT raise this value in a future session (see AGENTS.md "Liked
// Songs" note).
const COLLECTION_PAGE_SIZES: number[] = [50];
const COLLECTION_PAGE_PACING_MS = 300;

let collectionPageSizeIndex = 0;

interface CollectionItemsDocument extends RelationshipDocument {
  meta?: { nextCursor?: string; [key: string]: unknown };
  links?: { meta?: { nextCursor?: string }; next?: string; [key: string]: unknown };
}

function nextCursor(document: CollectionItemsDocument): string | null {
  const fromLinkMeta = document.links?.meta?.nextCursor ?? null;
  if (fromLinkMeta) return fromLinkMeta;
  const nextLink = document.links?.next;
  if (!nextLink) return null;
  const nextUrl = new URL(nextLink, TIDAL_CATALOG_BASE);
  return nextUrl.searchParams.get("page[cursor]");
}

function buildUserLikedTracksUrl(cursor: string | null, pageSize: number | null): string {
  const itemsUrl = new URL(
    `${TIDAL_CATALOG_BASE}/userCollectionTracks/me/relationships/items`,
  );
  itemsUrl.searchParams.set("countryCode", DEFAULT_COUNTRY_CODE);
  itemsUrl.searchParams.append("include", "items");
  itemsUrl.searchParams.append("include", "items.albums");
  itemsUrl.searchParams.append("include", "items.artists");
  if (cursor) itemsUrl.searchParams.set("page[cursor]", cursor);
  // `page[size]` is not part of the OpenAPI spec for this endpoint. We probe it
  // at runtime: if the first call is rejected (400) the whole session falls back
  // to the next candidate, then to the server default. See COLLECTION_PAGE_SIZES
  // for the verified ceiling (50 — 100/500 get 429 rate-limited).
  if (pageSize) itemsUrl.searchParams.set("page[size]", String(pageSize));
  return itemsUrl.toString();
}

export async function getLikedTracksPage(
  cursor: string | null,
): Promise<{ tracks: Track[]; nextCursor: string | null }> {
  if (cursor) await sleep(COLLECTION_PAGE_PACING_MS);

  let document: CollectionItemsDocument;
  for (;;) {
    const pageSize =
      collectionPageSizeIndex < COLLECTION_PAGE_SIZES.length
        ? COLLECTION_PAGE_SIZES[collectionPageSizeIndex]
        : null;
    try {
      document = (await fetchJson(
        buildUserLikedTracksUrl(cursor, pageSize),
      )) as CollectionItemsDocument;
      break;
    } catch (error) {
      if (httpStatus(error) === 400 && collectionPageSizeIndex < COLLECTION_PAGE_SIZES.length) {
        console.warn(
          `catalog: page[size]=${pageSize} rejected (400), trying next candidate (index ${collectionPageSizeIndex + 1})`,
        );
        collectionPageSizeIndex += 1;
        continue;
      }
      throw error;
    }
  }

  const tracks = tracksFromItems(document);
  const nextPageCursor = nextCursor(document);
  // Stop on an empty page, a missing pointer, or a cursor that did not advance
  // (the server sometimes echoes the same cursor at the end).
  if (tracks.length === 0 || !nextPageCursor || nextPageCursor === cursor) {
    return { tracks, nextCursor: null };
  }
  return { tracks, nextCursor: nextPageCursor };
}

// Identifier-only variant of the likes walk. The renderer builds a Set of liked
// track ids once per session to drive the like state in TrackList; requesting no
// `include` keeps each page small (the full collection can be thousands of ids).
function buildLikedTrackIdsUrl(cursor: string | null, pageSize: number | null): string {
  const itemsUrl = new URL(`${TIDAL_CATALOG_BASE}/userCollectionTracks/me/relationships/items`);
  itemsUrl.searchParams.set("countryCode", DEFAULT_COUNTRY_CODE);
  if (cursor) itemsUrl.searchParams.set("page[cursor]", cursor);
  if (pageSize) itemsUrl.searchParams.set("page[size]", String(pageSize));
  return itemsUrl.toString();
}

export async function getLikedTrackIdsPage(
  cursor: string | null,
): Promise<{ ids: string[]; nextCursor: string | null }> {
  if (cursor) await sleep(COLLECTION_PAGE_PACING_MS);

  let document: CollectionItemsDocument;
  for (;;) {
    const pageSize =
      collectionPageSizeIndex < COLLECTION_PAGE_SIZES.length
        ? COLLECTION_PAGE_SIZES[collectionPageSizeIndex]
        : null;
    try {
      document = (await fetchJson(
        buildLikedTrackIdsUrl(cursor, pageSize),
      )) as CollectionItemsDocument;
      break;
    } catch (error) {
      if (httpStatus(error) === 400 && collectionPageSizeIndex < COLLECTION_PAGE_SIZES.length) {
        collectionPageSizeIndex += 1;
        continue;
      }
      throw error;
    }
  }

  const ids = document.data
    .filter((identifier) => identifier.type === "tracks")
    .map((identifier) => identifier.id);
  const nextPageCursor = nextCursor(document);
  if (document.data.length === 0 || !nextPageCursor || nextPageCursor === cursor) {
    return { ids, nextCursor: null };
  }
  return { ids, nextCursor: nextPageCursor };
}

export async function searchTracks(query: string): Promise<Track[]> {
  const document = (await fetchJson(buildSearchUrl(query))) as MultiResourceDocument;
  const tracks = tracksFromSearch(document);
  if (tracks.length === 0) throw new Error("No tracks found for the query.");
  return tracks;
}

export function getAlbumTracksPage(albumId: string, cursor: string | null): Promise<TrackPage> {
  return getItemsTracksPage("albums", albumId, cursor);
}

export function getPlaylistTracksPage(
  playlistId: string,
  cursor: string | null,
): Promise<TrackPage> {
  return getItemsTracksPage("playlists", playlistId, cursor);
}

// The likes collection embeds reduced track/album resources: the album carries
// its title but the `coverArt` relationship only appears when requested.
// Fetching the canonical full tracks for the same ids fills artwork. Requests
// are chunked and paced to respect the edge rate limit.
const MAX_TRACKS_PER_BATCH = 50;
const TRACKS_BATCH_PACING_MS = 200;

function buildTracksByIdsUrl(trackIds: string[]): string {
  const tracksUrl = new URL(`${TIDAL_CATALOG_BASE}/tracks`);
  tracksUrl.searchParams.set("countryCode", DEFAULT_COUNTRY_CODE);
  for (const id of trackIds) tracksUrl.searchParams.append("filter[id]", id);
  tracksUrl.searchParams.append("include", "albums");
  tracksUrl.searchParams.append("include", "albums.coverArt");
  tracksUrl.searchParams.append("include", "artists");
  return tracksUrl.toString();
}

export async function getTracksByIds(trackIds: string[]): Promise<Track[]> {
  const uniqueIds = Array.from(new Set(trackIds));
  const tracks: Track[] = [];
  for (let i = 0; i < uniqueIds.length; i += MAX_TRACKS_PER_BATCH) {
    if (i > 0) await sleep(TRACKS_BATCH_PACING_MS);
    const batch = uniqueIds.slice(i, i + MAX_TRACKS_PER_BATCH);
    const document = (await fetchJson(buildTracksByIdsUrl(batch))) as MultiResourceDocument;
    tracks.push(...tracksFromTracksDocument(document));
  }
  return tracks;
}

// --- Home collection endpoints -------------------------------------------------

// The user's playlists (own + saved) live in the playlists collection. The
// `items` include embeds the playlist resources and `items.coverArt` their
// artwork; unlike the liked-tracks collection this endpoint accepts those rich
// includes (playlists/albums reject `items.albums.coverArt` only).
const HOME_ARTWORK_WIDTH = 640;
const COLLECTION_BASE_PACING_MS = 200;

function buildUserPlaylistsUrl(cursor: string | null): string {
  const itemsUrl = new URL(`${TIDAL_CATALOG_BASE}/userCollectionPlaylists/me/relationships/items`);
  itemsUrl.searchParams.set("countryCode", DEFAULT_COUNTRY_CODE);
  itemsUrl.searchParams.set("collectionView", "FLAT");
  itemsUrl.searchParams.append("include", "items");
  itemsUrl.searchParams.append("include", "items.coverArt");
  if (cursor) itemsUrl.searchParams.set("page[cursor]", cursor);
  return itemsUrl.toString();
}

function playlistSummaryFromResource(
  resource: ResourceObject,
  byId: Map<string, ResourceObject>,
): PlaylistSummary {
  return {
    id: resource.id,
    title: attributeString(resource, "name") ?? "",
    cover: artworkFileHref(relationshipDataIds(resource, "coverArt")[0], byId, HOME_ARTWORK_WIDTH),
    numberOfItems: attributeNumber(resource, "numberOfItems") ?? 0,
    duration: iso8601DurationToSeconds(attributeString(resource, "duration") ?? ""),
    playlistType: attributeString(resource, "playlistType"),
  };
}

function playlistSummariesFromDocument(document: RelationshipDocument): PlaylistSummary[] {
  const byId = indexResources(document.included);
  return document.data
    .filter((identifier) => identifier.type === "playlists")
    .map((identifier) => byId.get(identifier.id))
    .filter((resource): resource is ResourceObject => resource !== undefined)
    .map((resource) => playlistSummaryFromResource(resource, byId));
}

export async function getUserPlaylists(): Promise<PlaylistSummary[]> {
  const summaries: PlaylistSummary[] = [];
  let cursor: string | null = null;
  for (;;) {
    if (cursor) await sleep(COLLECTION_BASE_PACING_MS);
    const document = (await fetchJson(
      buildUserPlaylistsUrl(cursor),
    )) as CollectionItemsDocument;
    summaries.push(...playlistSummariesFromDocument(document));
    const next = nextCursor(document);
    if (document.data.length === 0 || !next || next === cursor) break;
    cursor = next;
  }
  return summaries;
}

// Latest releases: take the newest album of each followed artist, then order
// the combined result by the album release date (descending), NOT grouped by
// artist — the newest release always appears first.
const RECENT_ALBUMS_MAX_ARTISTS = 25;
const RECENT_ALBUMS_LIMIT = 10;

function buildFollowedArtistsUrl(): string {
  const artistsUrl = new URL(`${TIDAL_CATALOG_BASE}/userCollectionArtists/me/relationships/items`);
  artistsUrl.searchParams.set("countryCode", DEFAULT_COUNTRY_CODE);
  return artistsUrl.toString();
}

function buildArtistAlbumsUrl(artistId: string): string {
  const albumsUrl = new URL(`${TIDAL_CATALOG_BASE}/artists/${artistId}/relationships/albums`);
  albumsUrl.searchParams.set("countryCode", DEFAULT_COUNTRY_CODE);
  albumsUrl.searchParams.append("include", "albums.coverArt");
  albumsUrl.searchParams.append("include", "albums.artists");
  return albumsUrl.toString();
}

async function latestAlbumForArtist(artistId: string): Promise<AlbumSummary | null> {
  const document = (await fetchJson(buildArtistAlbumsUrl(artistId))) as RelationshipDocument;
  const byId = indexResources(document.included);
  const albums = document.data
    .filter((identifier) => identifier.type === "albums")
    .map((identifier) => byId.get(identifier.id))
    .filter((resource): resource is ResourceObject => resource !== undefined);

  let latest: AlbumSummary | null = null;
  let latestReleaseDate = "";
  for (const resource of albums) {
    const releaseDate = attributeString(resource, "releaseDate");
    if (!releaseDate || releaseDate < latestReleaseDate) continue;
    const artists = relationshipDataIds(resource, "artists")
      .map((id) => byId.get(id))
      .filter((artist): artist is ResourceObject => artist !== undefined)
      .map((artist) => ({ id: artist.id, name: attributeString(artist, "name") ?? "" }));
    latest = {
      id: resource.id,
      title: attributeString(resource, "title") ?? "",
      cover: artworkFileHref(relationshipDataIds(resource, "coverArt")[0], byId, HOME_ARTWORK_WIDTH),
      artists,
      releaseDate,
      numberOfItems: attributeNumber(resource, "numberOfItems") ?? 0,
    };
    latestReleaseDate = releaseDate;
  }
  return latest;
}

export async function getRecentAlbums(): Promise<AlbumSummary[]> {
  const artistsDocument = (await fetchJson(buildFollowedArtistsUrl())) as RelationshipDocument;
  const artistIds = artistsDocument.data
    .filter((identifier) => identifier.type === "artists")
    .map((identifier) => identifier.id);

  const latestByArtist: AlbumSummary[] = [];
  const artistsToScan = artistIds.slice(0, RECENT_ALBUMS_MAX_ARTISTS);
  for (let index = 0; index < artistsToScan.length; index++) {
    if (index > 0) await sleep(COLLECTION_BASE_PACING_MS);
    const latest = await latestAlbumForArtist(artistsToScan[index]);
    if (latest) latestByArtist.push(latest);
  }

  latestByArtist.sort((left, right) =>
    (right.releaseDate ?? "").localeCompare(left.releaseDate ?? ""),
  );
  return latestByArtist.slice(0, RECENT_ALBUMS_LIMIT);
}

// --- Mixes --------------------------------------------------------------------

// The v2 spec marks `/userRecommendations/*` as deprecated, but the dedicated
// mix resources (`/userDailyMixes/me`, `/userDiscoveryMixes/me`) are an
// aggregate of the user's mix set — their `items` relationship enumerates the
// mix contents, not the individual mix cards. The `userRecommendations`
// relationships are the only endpoints that return the actual mix list, and
// they need the `recommendations.read` OAuth scope.
function buildMixesUrl(
  relationship: "myMixes" | "discoveryMixes",
  cursor: string | null = null,
): string {
  const mixesUrl = new URL(
    `${TIDAL_CATALOG_BASE}/userRecommendations/me/relationships/${relationship}`,
  );
  mixesUrl.searchParams.set("countryCode", DEFAULT_COUNTRY_CODE);
  if (cursor) mixesUrl.searchParams.set("page[cursor]", cursor);
  return mixesUrl.toString();
}

// Mix resources expose no attributes in the public spec (no title, no cover),
// so a mix's appearance is resolved through the /playlists/{id} endpoint — a
// mix id is backed by a real TIDAL playlist. If that fails, the card falls
// back to a generated label so the section still renders.
function mixTitleForType(mixType: string, index: number): string {
  const labels: Record<string, string> = {
    userDailyMixes: "Daily Mix",
    userDiscoveryMixes: "Discovery Mix",
    userNewReleaseMixes: "New Release Mix",
    userOfflineMixes: "Offline Mix",
  };
  const label = labels[mixType] ?? "Mix";
  return `${label} ${index + 1}`;
}

export async function getMixes(
  relationship: "myMixes" | "discoveryMixes",
): Promise<MixSummary[]> {
  const identifiers: ResourceIdentifier[] = [];
  let cursor: string | null = null;
  for (;;) {
    if (cursor) await sleep(COLLECTION_BASE_PACING_MS);
    const document = (await fetchJson(
      buildMixesUrl(relationship, cursor),
    )) as CollectionItemsDocument;
    identifiers.push(...document.data);
    const next = nextCursor(document);
    if (document.data.length === 0 || !next || next === cursor) break;
    cursor = next;
  }

  // The dedicated mix resources expose no attributes, so we log the identifier
  // types once per fetch to confirm at runtime how each mix is backed.
  console.info(
    `catalog: ${relationship} items -> [${Array.from(
      new Set(identifiers.map((identifier) => identifier.type)),
    ).join(", ")}]`,
  );

  const summaries: MixSummary[] = [];
  for (let index = 0; index < identifiers.length; index++) {
    if (index > 0) await sleep(COLLECTION_BASE_PACING_MS);
    summaries.push(await mixSummaryForIdentifier(identifiers[index], index));
  }
  return summaries;
}

async function mixSummaryForIdentifier(
  identifier: ResourceIdentifier,
  index: number,
): Promise<MixSummary> {
  const mixType = identifier.type || "playlists";
  const fallbackTitle = mixTitleForType(mixType, index);
  // Only playlist-backed mixes can be resolved through /playlists/{id}; the
  // dedicated mix resources have no public detail resource with attributes.
  if (mixType !== "playlists") {
    return { id: identifier.id, mixType, title: fallbackTitle, cover: null, numberOfItems: 0 };
  }
  try {
    const detail = await getPlaylistDetail(identifier.id);
    return {
      id: identifier.id,
      mixType,
      title: detail.title,
      cover: detail.cover,
      numberOfItems: detail.numberOfItems,
    };
  } catch {
    return {
      id: identifier.id,
      mixType,
      title: fallbackTitle,
      cover: null,
      numberOfItems: 0,
    };
  }
}

export async function getMixDetail(mixType: string, mixId: string): Promise<MixSummary> {
  return mixSummaryForIdentifier({ id: mixId, type: mixType }, 0);
}

// --- Metadata detail ----------------------------------------------------------

function buildPlaylistDetailUrl(playlistId: string): string {
  const playlistUrl = new URL(`${TIDAL_CATALOG_BASE}/playlists/${playlistId}`);
  playlistUrl.searchParams.set("countryCode", DEFAULT_COUNTRY_CODE);
  playlistUrl.searchParams.append("include", "coverArt");
  return playlistUrl.toString();
}

export async function getPlaylistDetail(playlistId: string): Promise<PlaylistDetail> {
  const document = (await fetchJson(buildPlaylistDetailUrl(playlistId))) as SingleResourceDocument;
  const resource = document.data;
  const byId = indexResources(document.included);
  return {
    id: resource.id,
    title: attributeString(resource, "name") ?? "",
    cover: artworkFileHref(relationshipDataIds(resource, "coverArt")[0], byId, HOME_ARTWORK_WIDTH),
    playlistType: attributeString(resource, "playlistType"),
    numberOfItems: attributeNumber(resource, "numberOfItems") ?? 0,
    duration: iso8601DurationToSeconds(attributeString(resource, "duration") ?? ""),
  };
}

function buildAlbumDetailUrl(albumId: string): string {
  const albumUrl = new URL(`${TIDAL_CATALOG_BASE}/albums/${albumId}`);
  albumUrl.searchParams.set("countryCode", DEFAULT_COUNTRY_CODE);
  albumUrl.searchParams.append("include", "coverArt");
  albumUrl.searchParams.append("include", "artists");
  return albumUrl.toString();
}

export async function getAlbumDetail(albumId: string): Promise<AlbumDetail> {
  const document = (await fetchJson(buildAlbumDetailUrl(albumId))) as SingleResourceDocument;
  const resource = document.data;
  const byId = indexResources(document.included);
  const artists = relationshipDataIds(resource, "artists")
    .map((id) => byId.get(id))
    .filter((artist): artist is ResourceObject => artist !== undefined)
    .map((artist) => ({ id: artist.id, name: attributeString(artist, "name") ?? "" }));
  return {
    id: resource.id,
    title: attributeString(resource, "title") ?? "",
    cover: artworkFileHref(relationshipDataIds(resource, "coverArt")[0], byId, HOME_ARTWORK_WIDTH),
    artists,
    releaseDate: attributeString(resource, "releaseDate"),
    numberOfItems: attributeNumber(resource, "numberOfItems") ?? 0,
    duration: iso8601DurationToSeconds(attributeString(resource, "duration") ?? ""),
  };
}

// Mix item lists are the same rich `items.*` shape as album/playlist items, so
// the existing tracksFromItems parsing applies directly. A mix backed by a real
// playlist (identifier type "playlists") reuses the playlists items endpoint.
function buildMixItemsUrl(mixType: string, mixId: string, cursor: string | null = null): string {
  const itemsUrl = new URL(`${TIDAL_CATALOG_BASE}/${mixType}/${mixId}/relationships/items`);
  itemsUrl.searchParams.set("countryCode", DEFAULT_COUNTRY_CODE);
  itemsUrl.searchParams.append("include", "items.albums");
  itemsUrl.searchParams.append("include", "items.albums.coverArt");
  itemsUrl.searchParams.append("include", "items.artists");
  if (cursor) itemsUrl.searchParams.set("page[cursor]", cursor);
  return itemsUrl.toString();
}

export async function getMixTracksPage(mixType: string, mixId: string, cursor: string | null): Promise<TrackPage> {
  if (cursor) await sleep(COLLECTION_PAGE_PACING_MS);
  const document = (await fetchJson(
    buildMixItemsUrl(mixType, mixId, cursor),
  )) as CollectionItemsDocument;
  const tracks = tracksFromItems(document);
  const nextPageCursor = nextCursor(document);
  if (tracks.length === 0 || !nextPageCursor || nextPageCursor === cursor) {
    return { tracks, nextCursor: null };
  }
  return { tracks, nextCursor: nextPageCursor };
}

export function registerCatalogHandlers(ipcMain: IpcMain): void {
  ipcMain.handle("catalog:search-tracks", (_event, query: string) => searchTracks(query));
  ipcMain.handle("catalog:get-album-tracks-page", (_event, albumId: string, cursor: string | null) =>
    getAlbumTracksPage(albumId, cursor),
  );
  ipcMain.handle(
    "catalog:get-playlist-tracks-page",
    (_event, playlistId: string, cursor: string | null) => getPlaylistTracksPage(playlistId, cursor),
  );
  ipcMain.handle("catalog:get-favorite-tracks-page", (_event, cursor: string | null) =>
    getLikedTracksPage(cursor),
  );
  ipcMain.handle("catalog:get-liked-track-ids-page", (_event, cursor: string | null) =>
    getLikedTrackIdsPage(cursor),
  );
  ipcMain.handle("catalog:get-tracks-by-ids", (_event, trackIds: string[]) =>
    getTracksByIds(trackIds),
  );
  ipcMain.handle("catalog:get-user-playlists", () => getUserPlaylists());
  ipcMain.handle("catalog:get-recent-albums", () => getRecentAlbums());
  ipcMain.handle("catalog:get-mixes", (_event, relationship: "myMixes" | "discoveryMixes") =>
    getMixes(relationship),
  );
  ipcMain.handle(
    "catalog:get-mix-tracks-page",
    (_event, mixType: string, mixId: string, cursor: string | null) =>
      getMixTracksPage(mixType, mixId, cursor),
  );
  ipcMain.handle("catalog:get-album-detail", (_event, albumId: string) =>
    getAlbumDetail(albumId),
  );
  ipcMain.handle("catalog:get-playlist-detail", (_event, playlistId: string) =>
    getPlaylistDetail(playlistId),
  );
  ipcMain.handle("catalog:get-mix-detail", (_event, mixType: string, mixId: string) =>
    getMixDetail(mixType, mixId),
  );
}