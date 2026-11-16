import type { Track } from "@/types/track";

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
