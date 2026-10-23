// Pure JSON:API -> Track parsing for the TIDAL v2 catalog. Kept free of
// electron/axios imports so it can be unit-tested without the app runtime.

// Mirrors src/types/track.ts. Defined here (not imported) so the main process
// stays independent of the renderer bundle.
export interface CatalogArtist {
  id: string;
  name: string;
}

export interface CatalogAlbum {
  id: string;
  title: string;
  cover: string | null;
}

export interface Track {
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

export interface ResourceObject {
  id: string;
  [key: string]: unknown;
}

export interface ResourceIdentifier {
  id: string;
  type: string;
  meta?: { trackNumber?: number | null; volumeNumber?: number | null };
}

export interface RelationshipDocument {
  data: ResourceIdentifier[];
  included: ResourceObject[];
}

export interface SingleResourceDocument {
  data: ResourceObject;
  included: ResourceObject[];
}

export interface MultiResourceDocument {
  data: ResourceObject[];
  included: ResourceObject[];
}

export function isResourceObject(value: unknown): value is ResourceObject {
  return typeof value === "object" && value !== null && "id" in value;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

export function indexResources(resources: ResourceObject[]): Map<string, ResourceObject> {
  const byId = new Map<string, ResourceObject>();
  for (const resource of resources) byId.set(resource.id, resource);
  return byId;
}

export function attributeString(resource: ResourceObject, key: string): string | null {
  const attributes = asRecord(resource["attributes"]);
  const value = attributes[key];
  return typeof value === "string" ? value : null;
}

export function attributeNumber(resource: ResourceObject, key: string): number | null {
  const attributes = asRecord(resource["attributes"]);
  const value = attributes[key];
  return typeof value === "number" ? value : null;
}

export function attributeStringArray(resource: ResourceObject, key: string): string[] {
  const attributes = asRecord(resource["attributes"]);
  const value = attributes[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function relationshipsIds(
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

export function relationshipDataIds(resource: ResourceObject, relationship: string): string[] {
  return relationshipsIds(asRecord(resource["relationships"]), relationship);
}

// Tracks are only seconds long in practice ("PT2M58S"); the parser covers the
// H/M/S components and ignores days for forward compatibility.
export function iso8601DurationToSeconds(value: string): number {
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

export function mediaTagToQuality(mediaTags: string[]): string | null {
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

export function artworkFileHref(
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

export function trackFromV2Resource(
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
export function tracksFromSearch(document: MultiResourceDocument): Track[] {
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
export function tracksFromItems(document: RelationshipDocument): Track[] {
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
export function tracksFromTracksDocument(document: MultiResourceDocument): Track[] {
  const byId = indexResources(document.included);
  return document.data
    .filter((resource) => resource["type"] === "tracks")
    .map((resource) => trackFromV2Resource(resource, byId, null, null));
}
