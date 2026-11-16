import { handleTrusted } from "./secureIpc";
import {
  DEFAULT_COUNTRY_CODE,
  TIDAL_CATALOG_BASE,
  fetchJson,
  httpStatus,
  requestJson,
  sleep,
} from "./tidalApiClient";
import {
  optionalCursor,
  requireCollectionName,
  requireMixRelationship,
  requirePlaylistName,
  requireResourceId,
  requireResourceIdList,
  requireSearchQuery,
} from "./validation";
import {
  indexResources,
  attributeString,
  attributeNumber,
  relationshipDataIds,
  iso8601DurationToSeconds,
  artworkFileHref,
  tracksFromSearch,
  tracksFromItems,
  tracksFromTracksDocument,
  type CatalogArtist,
  type Track,
  type ResourceObject,
  type ResourceIdentifier,
  type RelationshipDocument,
  type SingleResourceDocument,
  type MultiResourceDocument,
} from "./tidalParsers";

// Catalog proxy to the TIDAL v2 API (JSON:API). All API traffic runs through
// the main process so the access token never reaches the renderer.
//
// The v2 API is used exclusively because it authorizes with the modern scope
// names granted to dashboard-created clients. The legacy v1 API rejects those
// tokens with HTTP 403 / subStatus 11004.
//
// Every endpoint needs exactly one request: related albums and artists are
// resolved from the compound document's `included` list via `include=`.



export interface PlaylistSummary {
  id: string;
  title: string;
  cover: string | null;
  numberOfItems: number;
  duration: number;
  playlistType: string | null;
  lastModifiedAt: string | null;
}

export interface AlbumSummary {
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

export interface TrackPage {
  tracks: Track[];
  nextCursor: string | null;
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

export interface CollectionItemsDocument extends RelationshipDocument {
  meta?: { nextCursor?: string; [key: string]: unknown };
  links?: { meta?: { nextCursor?: string }; next?: string; [key: string]: unknown };
}

export function nextCursor(document: CollectionItemsDocument): string | null {
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
// TIDAL answers HTTP 400 ("Filter accepts at most 20 values") above this;
// verified 2026-11-16. It used to accept 50.
const MAX_TRACKS_PER_BATCH = 20;
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
export const HOME_ARTWORK_WIDTH = 640;
export const COLLECTION_BASE_PACING_MS = 200;

function buildUserPlaylistsUrl(cursor: string | null): string {
  const itemsUrl = new URL(`${TIDAL_CATALOG_BASE}/userCollectionPlaylists/me/relationships/items`);
  itemsUrl.searchParams.set("countryCode", DEFAULT_COUNTRY_CODE);
  itemsUrl.searchParams.set("collectionView", "FLAT");
  itemsUrl.searchParams.append("include", "items");
  itemsUrl.searchParams.append("include", "items.coverArt");
  if (cursor) itemsUrl.searchParams.set("page[cursor]", cursor);
  return itemsUrl.toString();
}

export function playlistSummaryFromResource(
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
    lastModifiedAt: attributeString(resource, "lastModifiedAt"),
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

function buildFollowedArtistsUrl(cursor: string | null = null): string {
  const artistsUrl = new URL(`${TIDAL_CATALOG_BASE}/userCollectionArtists/me/relationships/items`);
  artistsUrl.searchParams.set("countryCode", DEFAULT_COUNTRY_CODE);
  if (cursor) artistsUrl.searchParams.set("page[cursor]", cursor);
  return artistsUrl.toString();
}

function buildArtistAlbumsUrl(artistId: string): string {
  const albumsUrl = new URL(`${TIDAL_CATALOG_BASE}/artists/${artistId}/relationships/albums`);
  albumsUrl.searchParams.set("countryCode", DEFAULT_COUNTRY_CODE);
  albumsUrl.searchParams.append("include", "albums.coverArt");
  albumsUrl.searchParams.append("include", "albums.artists");
  return albumsUrl.toString();
}

export function albumSummaryFromResource(
  resource: ResourceObject,
  byId: Map<string, ResourceObject>,
): AlbumSummary {
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
  };
}

// Newest albums of one artist, newest first.
async function latestAlbumsForArtist(artistId: string, limit: number): Promise<AlbumSummary[]> {
  const document = (await fetchJson(buildArtistAlbumsUrl(artistId))) as RelationshipDocument;
  const byId = indexResources(document.included ?? []);
  return document.data
    .filter((identifier) => identifier.type === "albums")
    .map((identifier) => byId.get(identifier.id))
    .filter((resource): resource is ResourceObject => resource !== undefined)
    .map((resource) => albumSummaryFromResource(resource, byId))
    .filter((album) => Boolean(album.releaseDate))
    .sort((left, right) => (right.releaseDate ?? "").localeCompare(left.releaseDate ?? ""))
    .slice(0, limit);
}

// Walks the followed artists (first `maxArtists`) and merges their newest
// albums into one list ordered by release date. One request per artist: TIDAL
// has no "new releases from artists I follow" endpoint.
async function newestAlbumsOfFollowedArtists(
  maxArtists: number,
  albumsPerArtist: number,
  limit: number,
): Promise<AlbumSummary[]> {
  const artistIds: string[] = [];
  let cursor: string | null = null;
  while (artistIds.length < maxArtists) {
    if (cursor) await sleep(COLLECTION_BASE_PACING_MS);
    const artistsDocument = (await fetchJson(
      buildFollowedArtistsUrl(cursor),
    )) as CollectionItemsDocument;
    artistIds.push(
      ...artistsDocument.data
        .filter((identifier) => identifier.type === "artists")
        .map((identifier) => identifier.id),
    );
    const next = nextCursor(artistsDocument);
    if (artistsDocument.data.length === 0 || !next || next === cursor) break;
    cursor = next;
  }

  const albumsById = new Map<string, AlbumSummary>();
  const artistsToScan = artistIds.slice(0, maxArtists);
  for (let index = 0; index < artistsToScan.length; index++) {
    if (index > 0) await sleep(COLLECTION_BASE_PACING_MS);
    for (const album of await latestAlbumsForArtist(artistsToScan[index], albumsPerArtist)) {
      // A collaboration shows up under each of its artists.
      albumsById.set(album.id, album);
    }
  }
  return [...albumsById.values()]
    .sort((left, right) => (right.releaseDate ?? "").localeCompare(left.releaseDate ?? ""))
    .slice(0, limit);
}

// Home row: the newest release of each of the first followed artists.
export function getRecentAlbums(): Promise<AlbumSummary[]> {
  return newestAlbumsOfFollowedArtists(RECENT_ALBUMS_MAX_ARTISTS, 1, RECENT_ALBUMS_LIMIT);
}

// Releases feed: a wider scan (more artists, several albums each).
const RELEASES_FEED_MAX_ARTISTS = 60;
const RELEASES_FEED_ALBUMS_PER_ARTIST = 3;
const RELEASES_FEED_LIMIT = 60;

export function getReleasesFeed(): Promise<AlbumSummary[]> {
  return newestAlbumsOfFollowedArtists(
    RELEASES_FEED_MAX_ARTISTS,
    RELEASES_FEED_ALBUMS_PER_ARTIST,
    RELEASES_FEED_LIMIT,
  );
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
    let document: CollectionItemsDocument;
    try {
      document = (await fetchJson(buildMixesUrl(relationship, cursor))) as CollectionItemsDocument;
    } catch (error) {
      // TIDAL answers 404 (not an empty list) for an account that has no mixes
      // of this kind yet.
      if (httpStatus(error) === 404) break;
      throw error;
    }
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
  return {
    ...albumSummaryFromResource(resource, indexResources(document.included ?? [])),
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

// --- Writes to the user's library ----------------------------------------------

const WRITE_PACING_MS = 200;

function trackIdentifiers(trackIds: string[]): { data: ResourceIdentifier[] } {
  return { data: trackIds.map((id) => ({ id, type: "tracks" })) };
}

function buildLikedTracksWriteUrl(): string {
  const itemsUrl = new URL(`${TIDAL_CATALOG_BASE}/userCollectionTracks/me/relationships/items`);
  itemsUrl.searchParams.set("countryCode", DEFAULT_COUNTRY_CODE);
  return itemsUrl.toString();
}

export async function addTracksToLikes(trackIds: string[]): Promise<void> {
  for (let i = 0; i < trackIds.length; i += MAX_TRACKS_PER_BATCH) {
    if (i > 0) await sleep(WRITE_PACING_MS);
    const batch = trackIds.slice(i, i + MAX_TRACKS_PER_BATCH);
    await requestJson("POST", buildLikedTracksWriteUrl(), trackIdentifiers(batch));
  }
}

export async function removeTracksFromLikes(trackIds: string[]): Promise<void> {
  for (let i = 0; i < trackIds.length; i += MAX_TRACKS_PER_BATCH) {
    if (i > 0) await sleep(WRITE_PACING_MS);
    const batch = trackIds.slice(i, i + MAX_TRACKS_PER_BATCH);
    await requestJson("DELETE", buildLikedTracksWriteUrl(), trackIdentifiers(batch));
  }
}

function buildPlaylistItemsWriteUrl(playlistId: string): string {
  const itemsUrl = new URL(`${TIDAL_CATALOG_BASE}/playlists/${playlistId}/relationships/items`);
  itemsUrl.searchParams.set("countryCode", DEFAULT_COUNTRY_CODE);
  return itemsUrl.toString();
}

// Appends the tracks at the end of the playlist.
export async function addTracksToPlaylist(playlistId: string, trackIds: string[]): Promise<void> {
  for (let i = 0; i < trackIds.length; i += MAX_TRACKS_PER_BATCH) {
    if (i > 0) await sleep(WRITE_PACING_MS);
    const batch = trackIds.slice(i, i + MAX_TRACKS_PER_BATCH);
    await requestJson("POST", buildPlaylistItemsWriteUrl(playlistId), trackIdentifiers(batch));
  }
}

export async function createPlaylist(name: string): Promise<PlaylistSummary> {
  const playlistsUrl = new URL(`${TIDAL_CATALOG_BASE}/playlists`);
  playlistsUrl.searchParams.set("countryCode", DEFAULT_COUNTRY_CODE);
  const document = (await requestJson("POST", playlistsUrl.toString(), {
    data: { type: "playlists", attributes: { name, accessType: "UNLISTED" } },
  })) as SingleResourceDocument;
  // A freshly created playlist has no artwork yet, so nothing is included.
  return playlistSummaryFromResource(document.data, indexResources(document.included ?? []));
}

export async function deletePlaylist(playlistId: string): Promise<void> {
  await requestJson("DELETE", `${TIDAL_CATALOG_BASE}/playlists/${playlistId}`);
}

// What the local copy of the library (metadataCache.ts) plugs in here: whole
// lists served without a request, and news of every change the app makes.
export type LibraryChange =
  | { type: "likes-added"; trackIds: string[] }
  | { type: "likes-removed"; trackIds: string[] }
  | { type: "playlist-tracks-added"; playlistId: string; trackIds: string[] }
  | { type: "playlist-created"; playlistId: string; title: string }
  | { type: "playlist-deleted"; playlistId: string };

export interface LibraryHooks {
  cachedTracks: (collectionId: string) => Track[] | null;
  onChange: (change: LibraryChange) => void;
}

const LIKED_COLLECTION_ID = "liked";
let libraryHooks: LibraryHooks | null = null;

export function setLibraryHooks(hooks: LibraryHooks): void {
  libraryHooks = hooks;
}

// The first page of a cached list is the whole list.
function cachedFirstPage(collectionId: string, cursor: string | null): TrackPage | null {
  if (cursor) return null;
  const tracks = libraryHooks?.cachedTracks(collectionId) ?? null;
  return tracks ? { tracks, nextCursor: null } : null;
}

export function registerCatalogHandlers(): void {
  handleTrusted("catalog:add-tracks-to-likes", async (_event, rawTrackIds) => {
    const trackIds = requireResourceIdList(rawTrackIds, "track ids");
    await addTracksToLikes(trackIds);
    libraryHooks?.onChange({ type: "likes-added", trackIds });
  });
  handleTrusted("catalog:remove-tracks-from-likes", async (_event, rawTrackIds) => {
    const trackIds = requireResourceIdList(rawTrackIds, "track ids");
    await removeTracksFromLikes(trackIds);
    libraryHooks?.onChange({ type: "likes-removed", trackIds });
  });
  handleTrusted("catalog:add-tracks-to-playlist", async (_event, rawPlaylistId, rawTrackIds) => {
    const playlistId = requireResourceId(rawPlaylistId, "playlist id");
    const trackIds = requireResourceIdList(rawTrackIds, "track ids");
    await addTracksToPlaylist(playlistId, trackIds);
    libraryHooks?.onChange({ type: "playlist-tracks-added", playlistId, trackIds });
  });
  handleTrusted("catalog:create-playlist", async (_event, name) => {
    const playlist = await createPlaylist(requirePlaylistName(name));
    libraryHooks?.onChange({ type: "playlist-created", playlistId: playlist.id, title: playlist.title });
    return playlist;
  });
  handleTrusted("catalog:delete-playlist", async (_event, rawPlaylistId) => {
    const playlistId = requireResourceId(rawPlaylistId, "playlist id");
    await deletePlaylist(playlistId);
    libraryHooks?.onChange({ type: "playlist-deleted", playlistId });
  });
  handleTrusted("catalog:search-tracks", (_event, query) => searchTracks(requireSearchQuery(query)));
  handleTrusted("catalog:get-album-tracks-page", (_event, albumId, cursor) =>
    getAlbumTracksPage(requireResourceId(albumId, "album id"), optionalCursor(cursor)),
  );
  handleTrusted("catalog:get-playlist-tracks-page", (_event, rawPlaylistId, rawCursor) => {
    const playlistId = requireResourceId(rawPlaylistId, "playlist id");
    const cursor = optionalCursor(rawCursor);
    return cachedFirstPage(playlistId, cursor) ?? getPlaylistTracksPage(playlistId, cursor);
  });
  handleTrusted("catalog:get-favorite-tracks-page", (_event, rawCursor) => {
    const cursor = optionalCursor(rawCursor);
    return cachedFirstPage(LIKED_COLLECTION_ID, cursor) ?? getLikedTracksPage(cursor);
  });
  handleTrusted("catalog:get-liked-track-ids-page", (_event, cursor) =>
    getLikedTrackIdsPage(optionalCursor(cursor)),
  );
  handleTrusted("catalog:get-tracks-by-ids", (_event, trackIds) =>
    getTracksByIds(requireResourceIdList(trackIds, "track ids")),
  );
  handleTrusted("catalog:get-user-playlists", () => getUserPlaylists());
  handleTrusted("catalog:get-recent-albums", () => getRecentAlbums());
  handleTrusted("catalog:get-releases-feed", () => getReleasesFeed());
  handleTrusted("catalog:get-mixes", (_event, relationship) =>
    getMixes(requireMixRelationship(relationship)),
  );
  handleTrusted("catalog:get-mix-tracks-page", (_event, mixType, mixId, cursor) =>
    getMixTracksPage(
      requireCollectionName(mixType, "mix type"),
      requireResourceId(mixId, "mix id"),
      optionalCursor(cursor),
    ),
  );
  handleTrusted("catalog:get-album-detail", (_event, albumId) =>
    getAlbumDetail(requireResourceId(albumId, "album id")),
  );
  handleTrusted("catalog:get-playlist-detail", (_event, playlistId) =>
    getPlaylistDetail(requireResourceId(playlistId, "playlist id")),
  );
  handleTrusted("catalog:get-mix-detail", (_event, mixType, mixId) =>
    getMixDetail(requireCollectionName(mixType, "mix type"), requireResourceId(mixId, "mix id")),
  );
}
