import type { Track } from "../types/track";

// Search inside lists the app already has in memory (the liked songs, a
// library tab). Case and accents are ignored, so "cancion" finds "Canción".

export function normalizeForSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function searchTerms(query: string): string[] {
  return normalizeForSearch(query)
    .split(/\s+/)
    .filter((term) => term.length > 0);
}

// Every term must appear somewhere in the title, an artist name or the album
// title, in any order ("rainbows radiohead" finds Radiohead's In Rainbows).
export function trackMatchesTerms(track: Track, terms: string[]): boolean {
  if (terms.length === 0) return false;
  const haystack = normalizeForSearch(
    [track.title, ...track.artists.map((artist) => artist.name), track.album?.title ?? ""].join(" "),
  );
  return terms.every((term) => haystack.includes(term));
}

export function filterTracks(tracks: Track[], query: string): Track[] {
  const terms = searchTerms(query);
  if (terms.length === 0) return [];
  return tracks.filter((track) => trackMatchesTerms(track, terms));
}

const MAX_PLAYLIST_NAMES_IN_LABEL = 3;

// "Liked · in 2 playlists: Road trip, Gym" for a search result.
export function collectionMembershipLabel(isLiked: boolean, playlistTitles: string[]): string {
  const parts: string[] = [];
  if (isLiked) parts.push("Liked");
  if (playlistTitles.length > 0) {
    const shown = playlistTitles.slice(0, MAX_PLAYLIST_NAMES_IN_LABEL).join(", ");
    const hidden = playlistTitles.length - MAX_PLAYLIST_NAMES_IN_LABEL;
    const count = playlistTitles.length === 1 ? "1 playlist" : `${playlistTitles.length} playlists`;
    parts.push(`in ${count}: ${shown}${hidden > 0 ? ` and ${hidden} more` : ""}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "Not in a playlist";
}
