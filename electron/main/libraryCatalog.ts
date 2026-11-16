import {
  COLLECTION_BASE_PACING_MS,
  HOME_ARTWORK_WIDTH,
  albumSummaryFromResource,
  nextCursor,
  playlistSummaryFromResource,
  type AlbumSummary,
  type CollectionItemsDocument,
  type PlaylistSummary,
  type TrackPage,
} from "./catalog";
import { handleTrusted } from "./secureIpc";
import { DEFAULT_COUNTRY_CODE, TIDAL_CATALOG_BASE, fetchJson, sleep } from "./tidalApiClient";
import {
  artworkFileHref,
  attributeString,
  indexResources,
  relationshipDataIds,
  tracksFromItems,
  type MultiResourceDocument,
  type ResourceObject,
  type SingleResourceDocument,
} from "./tidalParsers";
import { optionalCursor, requireResourceId, requireSearchQuery } from "./validation";

// Artist pages, the user's saved albums and artists, and the search for albums,
// artists and playlists.
//
// Playlist folders are not here on purpose: the collection lists folder ids
// (`collectionView=FOLDERS`), but `/userCollectionFolders/{id}` and its items
// answer 404 / empty for them (verified 2026-11-15), so the folder names and
// contents can not be read through the public API. Same rules as catalog.ts: TIDAL v2 only,
// one request per page, pacing between pages.

export interface ArtistCard {
  id: string;
  name: string;
  picture: string | null;
}

interface AlbumPage {
  albums: AlbumSummary[];
  nextCursor: string | null;
}

interface ArtistPage {
  artists: ArtistCard[];
  nextCursor: string | null;
}

interface SearchResults {
  albums: AlbumSummary[];
  artists: ArtistCard[];
  playlists: PlaylistSummary[];
}

function artistCardFromResource(
  resource: ResourceObject,
  byId: Map<string, ResourceObject>,
): ArtistCard {
  return {
    id: resource.id,
    name: attributeString(resource, "name") ?? "",
    picture: artworkFileHref(relationshipDataIds(resource, "profileArt")[0], byId, HOME_ARTWORK_WIDTH),
  };
}

function resourcesOfType(
  identifiers: Array<{ id: string; type: string }>,
  type: string,
  byId: Map<string, ResourceObject>,
): ResourceObject[] {
  return identifiers
    .filter((identifier) => identifier.type === type)
    .map((identifier) => byId.get(identifier.id))
    .filter((resource): resource is ResourceObject => resource !== undefined);
}

// The server sometimes echoes the cursor it was given on the last page.
function advancingCursor(document: CollectionItemsDocument, cursor: string | null): string | null {
  const next = nextCursor(document);
  if (document.data.length === 0 || !next || next === cursor) return null;
  return next;
}

// --- Artist page ---------------------------------------------------------------

export async function getArtistDetail(artistId: string): Promise<ArtistCard> {
  const artistUrl = new URL(`${TIDAL_CATALOG_BASE}/artists/${artistId}`);
  artistUrl.searchParams.set("countryCode", DEFAULT_COUNTRY_CODE);
  artistUrl.searchParams.append("include", "profileArt");
  const document = (await fetchJson(artistUrl.toString())) as SingleResourceDocument;
  return artistCardFromResource(document.data, indexResources(document.included));
}

// TIDAL returns an artist's tracks most popular first. `collapseBy=FINGERPRINT`
// folds the same recording released on several albums into one entry.
export async function getArtistTracksPage(
  artistId: string,
  cursor: string | null,
): Promise<TrackPage> {
  if (cursor) await sleep(COLLECTION_BASE_PACING_MS);
  const tracksUrl = new URL(`${TIDAL_CATALOG_BASE}/artists/${artistId}/relationships/tracks`);
  tracksUrl.searchParams.set("countryCode", DEFAULT_COUNTRY_CODE);
  tracksUrl.searchParams.set("collapseBy", "FINGERPRINT");
  tracksUrl.searchParams.append("include", "tracks.albums");
  tracksUrl.searchParams.append("include", "tracks.albums.coverArt");
  tracksUrl.searchParams.append("include", "tracks.artists");
  if (cursor) tracksUrl.searchParams.set("page[cursor]", cursor);
  const document = (await fetchJson(tracksUrl.toString())) as CollectionItemsDocument;
  return { tracks: tracksFromItems(document), nextCursor: advancingCursor(document, cursor) };
}

export async function getArtistAlbumsPage(
  artistId: string,
  cursor: string | null,
): Promise<AlbumPage> {
  if (cursor) await sleep(COLLECTION_BASE_PACING_MS);
  const albumsUrl = new URL(`${TIDAL_CATALOG_BASE}/artists/${artistId}/relationships/albums`);
  albumsUrl.searchParams.set("countryCode", DEFAULT_COUNTRY_CODE);
  albumsUrl.searchParams.append("include", "albums.coverArt");
  albumsUrl.searchParams.append("include", "albums.artists");
  if (cursor) albumsUrl.searchParams.set("page[cursor]", cursor);
  const document = (await fetchJson(albumsUrl.toString())) as CollectionItemsDocument;
  const byId = indexResources(document.included);
  return {
    albums: resourcesOfType(document.data, "albums", byId).map((resource) =>
      albumSummaryFromResource(resource, byId),
    ),
    nextCursor: advancingCursor(document, cursor),
  };
}

// --- The user's collection -----------------------------------------------------

export async function getCollectionAlbumsPage(cursor: string | null): Promise<AlbumPage> {
  if (cursor) await sleep(COLLECTION_BASE_PACING_MS);
  const itemsUrl = new URL(`${TIDAL_CATALOG_BASE}/userCollectionAlbums/me/relationships/items`);
  itemsUrl.searchParams.set("countryCode", DEFAULT_COUNTRY_CODE);
  itemsUrl.searchParams.set("sort", "-addedAt");
  itemsUrl.searchParams.append("include", "items");
  itemsUrl.searchParams.append("include", "items.coverArt");
  itemsUrl.searchParams.append("include", "items.artists");
  if (cursor) itemsUrl.searchParams.set("page[cursor]", cursor);
  const document = (await fetchJson(itemsUrl.toString())) as CollectionItemsDocument;
  const byId = indexResources(document.included);
  return {
    albums: resourcesOfType(document.data, "albums", byId).map((resource) =>
      albumSummaryFromResource(resource, byId),
    ),
    nextCursor: advancingCursor(document, cursor),
  };
}

export async function getCollectionArtistsPage(cursor: string | null): Promise<ArtistPage> {
  if (cursor) await sleep(COLLECTION_BASE_PACING_MS);
  const itemsUrl = new URL(`${TIDAL_CATALOG_BASE}/userCollectionArtists/me/relationships/items`);
  itemsUrl.searchParams.set("countryCode", DEFAULT_COUNTRY_CODE);
  itemsUrl.searchParams.set("sort", "-addedAt");
  itemsUrl.searchParams.append("include", "items");
  itemsUrl.searchParams.append("include", "items.profileArt");
  if (cursor) itemsUrl.searchParams.set("page[cursor]", cursor);
  const document = (await fetchJson(itemsUrl.toString())) as CollectionItemsDocument;
  const byId = indexResources(document.included);
  return {
    artists: resourcesOfType(document.data, "artists", byId).map((resource) =>
      artistCardFromResource(resource, byId),
    ),
    nextCursor: advancingCursor(document, cursor),
  };
}

// --- Search for albums, artists and playlists -----------------------------------

const SEARCH_REQUEST_PACING_MS = 100;

async function searchRelated(
  query: string,
  relationship: "albums" | "artists" | "playlists",
  nestedIncludes: string[],
): Promise<{ resources: ResourceObject[]; byId: Map<string, ResourceObject> }> {
  const searchUrl = new URL(`${TIDAL_CATALOG_BASE}/searchResults`);
  searchUrl.searchParams.set("filter[query]", query);
  searchUrl.searchParams.set("countryCode", DEFAULT_COUNTRY_CODE);
  // A relationship is only filled in when it is included by name.
  searchUrl.searchParams.append("include", relationship);
  for (const nested of nestedIncludes) {
    searchUrl.searchParams.append("include", `${relationship}.${nested}`);
  }
  const document = (await fetchJson(searchUrl.toString())) as MultiResourceDocument;
  const byId = indexResources(document.included);
  // The relationship array carries TIDAL's relevance order.
  const identifiers = document.data.flatMap((searchResult) =>
    relationshipDataIds(searchResult, relationship).map((id) => ({ id, type: relationship })),
  );
  return { resources: resourcesOfType(identifiers, relationship, byId), byId };
}

// Tracks are searched by catalog.ts (`searchTracks`). Each kind of result is
// its own request: asked for together, TIDAL fills in only the first
// relationship and leaves the others empty (verified 2026-11-15), and it caps
// a request at 10 includes counting every level of a nested path.
export async function searchCollections(query: string): Promise<SearchResults> {
  const albums = await searchRelated(query, "albums", ["coverArt", "artists"]);
  await sleep(SEARCH_REQUEST_PACING_MS);
  const artists = await searchRelated(query, "artists", ["profileArt"]);
  await sleep(SEARCH_REQUEST_PACING_MS);
  const playlists = await searchRelated(query, "playlists", ["coverArt"]);
  return {
    albums: albums.resources.map((resource) => albumSummaryFromResource(resource, albums.byId)),
    artists: artists.resources.map((resource) => artistCardFromResource(resource, artists.byId)),
    playlists: playlists.resources.map((resource) =>
      playlistSummaryFromResource(resource, playlists.byId),
    ),
  };
}

export function registerLibraryHandlers(): void {
  handleTrusted("library:get-artist-detail", (_event, artistId) =>
    getArtistDetail(requireResourceId(artistId, "artist id")),
  );
  handleTrusted("library:get-artist-tracks-page", (_event, artistId, cursor) =>
    getArtistTracksPage(requireResourceId(artistId, "artist id"), optionalCursor(cursor)),
  );
  handleTrusted("library:get-artist-albums-page", (_event, artistId, cursor) =>
    getArtistAlbumsPage(requireResourceId(artistId, "artist id"), optionalCursor(cursor)),
  );
  handleTrusted("library:get-collection-albums-page", (_event, cursor) =>
    getCollectionAlbumsPage(optionalCursor(cursor)),
  );
  handleTrusted("library:get-collection-artists-page", (_event, cursor) =>
    getCollectionArtistsPage(optionalCursor(cursor)),
  );
  handleTrusted("library:search-collections", (_event, query) =>
    searchCollections(requireSearchQuery(query)),
  );
}
