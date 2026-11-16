import type { AlbumSummary, ArtistCard, PlaylistSummary } from "@/types/media";

// Ordering of the user's library lists (sidebar and Library screen). TIDAL
// returns each list most recently added first; "added" keeps that order.

export type PlaylistSortKey = "added" | "modified" | "name" | "tracks";
export type AlbumSortKey = "added" | "name" | "artist" | "released";
export type ArtistSortKey = "added" | "name";

export const PLAYLIST_SORT_LABELS: Record<PlaylistSortKey, string> = {
  added: "Date added",
  modified: "Last modified",
  name: "Name",
  tracks: "Number of tracks",
};
export const ALBUM_SORT_LABELS: Record<AlbumSortKey, string> = {
  added: "Date added",
  name: "Title",
  artist: "Artist",
  released: "Release date",
};
export const ARTIST_SORT_LABELS: Record<ArtistSortKey, string> = {
  added: "Date added",
  name: "Name",
};

export function isSortKeyOf<Key extends string>(labels: Record<Key, string>) {
  return (value: unknown): value is Key => typeof value === "string" && value in labels;
}

// The direction each key starts with: newest / biggest first for dates and
// sizes, A to Z for text.
export function startsDescending(key: string): boolean {
  return key === "added" || key === "modified" || key === "tracks" || key === "released";
}

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

function compareText(left: string, right: string): number {
  return collator.compare(left, right);
}

// Sorts a copy. `ascendingValue` gives the value compared in ascending order;
// items whose value ties keep the order TIDAL returned them in.
function sortedBy<Item>(
  items: Item[],
  compareAscending: (left: Item, right: Item) => number,
  descending: boolean,
): Item[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const order = compareAscending(left.item, right.item);
      if (order !== 0) return descending ? -order : order;
      return left.index - right.index;
    })
    .map((entry) => entry.item);
}

// "Date added" has no value to compare: it is the position in TIDAL's answer
// (newest first), so ascending is simply that list reversed.
function byAddedOrder<Item>(items: Item[], descending: boolean): Item[] {
  return descending ? [...items] : [...items].reverse();
}

export function sortPlaylists(
  playlists: PlaylistSummary[],
  key: PlaylistSortKey,
  descending: boolean,
): PlaylistSummary[] {
  if (key === "added") return byAddedOrder(playlists, descending);
  if (key === "name") {
    return sortedBy(playlists, (left, right) => compareText(left.title, right.title), descending);
  }
  if (key === "tracks") {
    return sortedBy(playlists, (left, right) => left.numberOfItems - right.numberOfItems, descending);
  }
  return sortedBy(
    playlists,
    (left, right) => (left.lastModifiedAt ?? "").localeCompare(right.lastModifiedAt ?? ""),
    descending,
  );
}

export function sortAlbums(albums: AlbumSummary[], key: AlbumSortKey, descending: boolean): AlbumSummary[] {
  if (key === "added") return byAddedOrder(albums, descending);
  if (key === "name") {
    return sortedBy(albums, (left, right) => compareText(left.title, right.title), descending);
  }
  if (key === "artist") {
    return sortedBy(
      albums,
      (left, right) => compareText(left.artists[0]?.name ?? "", right.artists[0]?.name ?? ""),
      descending,
    );
  }
  return sortedBy(
    albums,
    (left, right) => (left.releaseDate ?? "").localeCompare(right.releaseDate ?? ""),
    descending,
  );
}

export function sortArtists(artists: ArtistCard[], key: ArtistSortKey, descending: boolean): ArtistCard[] {
  if (key === "added") return byAddedOrder(artists, descending);
  return sortedBy(artists, (left, right) => compareText(left.name, right.name), descending);
}
