import { nextCursor, type CollectionItemsDocument } from "./catalog";
import { handleTrusted } from "./secureIpc";
import { DEFAULT_COUNTRY_CODE, fetchJson, TIDAL_CATALOG_BASE } from "./tidalApiClient";
import {
  creditsFromDocument,
  lyricsFromDocument,
  type RelationshipDocument,
  type TrackCredit,
  type TrackLyrics,
} from "./tidalParsers";
import { requireResourceId } from "./validation";

// Lyrics and credits of a track. TIDAL licenses them only to its own clients:
// the v2 endpoints answer empty to the user's developer app, so these two
// requests go out with the playback engine's web session (verified
// 2026-11-16). Without full playback connected they fail with a clear message.

// A credits list rarely needs a second page; this only bounds a bad cursor.
const MAX_CREDIT_PAGES = 5;

function relationshipUrl(trackId: string, relationship: string, include: string, cursor: string | null): string {
  const url = new URL(`${TIDAL_CATALOG_BASE}/tracks/${trackId}/relationships/${relationship}`);
  url.searchParams.set("countryCode", DEFAULT_COUNTRY_CODE);
  url.searchParams.set("include", include);
  if (cursor) url.searchParams.set("page[cursor]", cursor);
  return url.toString();
}

export async function getTrackLyrics(trackId: string): Promise<TrackLyrics | null> {
  const document = (await fetchJson(relationshipUrl(trackId, "lyrics", "lyrics", null), "web")) as RelationshipDocument;
  return lyricsFromDocument(document);
}

export async function getTrackCredits(trackId: string): Promise<TrackCredit[]> {
  const credits: TrackCredit[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_CREDIT_PAGES; page++) {
    const document = (await fetchJson(
      relationshipUrl(trackId, "credits", "credits,credits.category", cursor),
      "web",
    )) as CollectionItemsDocument;
    credits.push(...creditsFromDocument(document));
    cursor = nextCursor(document);
    if (!cursor) break;
  }
  return credits;
}

export function registerTrackDetailsHandlers(): void {
  handleTrusted("catalog:get-lyrics", (_event, trackId) => getTrackLyrics(requireResourceId(trackId, "track id")));
  handleTrusted("catalog:get-track-credits", (_event, trackId) =>
    getTrackCredits(requireResourceId(trackId, "track id")),
  );
}
