import { describe, expect, it } from "vitest";
import {
  PLAYLIST_SORT_LABELS,
  isSortKeyOf,
  sortAlbums,
  sortArtists,
  sortPlaylists,
  startsDescending,
} from "@/lib/librarySort";
import type { PlaylistSummary } from "@/types/media";

function playlist(title: string, numberOfItems: number, lastModifiedAt: string): PlaylistSummary {
  return { id: title, title, numberOfItems, duration: 0, lastModifiedAt };
}

// In the order TIDAL returns them: most recently added first.
const playlists = [
  playlist("rock 10", 30, "2026-03-01"),
  playlist("Álbum de fotos", 5, "2026-11-01"),
  playlist("rock 2", 30, "2025-01-01"),
  playlist("Zen", 120, "2026-06-01"),
];
const titles = (list: PlaylistSummary[]) => list.map((item) => item.title);

describe("sortPlaylists", () => {
  it("keeps or reverses TIDAL's order for the date added", () => {
    expect(titles(sortPlaylists(playlists, "added", true))).toEqual(titles(playlists));
    expect(titles(sortPlaylists(playlists, "added", false))).toEqual(titles(playlists).reverse());
  });

  it("sorts names ignoring case and accents, with numbers in natural order", () => {
    expect(titles(sortPlaylists(playlists, "name", false))).toEqual([
      "Álbum de fotos",
      "rock 2",
      "rock 10",
      "Zen",
    ]);
    expect(titles(sortPlaylists(playlists, "name", true))[0]).toBe("Zen");
  });

  it("sorts by number of tracks, ties in TIDAL's order", () => {
    expect(titles(sortPlaylists(playlists, "tracks", true))).toEqual([
      "Zen",
      "rock 10",
      "rock 2",
      "Álbum de fotos",
    ]);
    expect(titles(sortPlaylists(playlists, "tracks", false))[0]).toBe("Álbum de fotos");
  });

  it("sorts by last modification", () => {
    expect(titles(sortPlaylists(playlists, "modified", true))).toEqual([
      "Álbum de fotos",
      "Zen",
      "rock 10",
      "rock 2",
    ]);
  });

  it("never changes the list it was given", () => {
    const before = titles(playlists);
    sortPlaylists(playlists, "name", false);
    expect(titles(playlists)).toEqual(before);
  });
});

describe("sortAlbums and sortArtists", () => {
  const albums = [
    { id: "1", title: "B side", artists: [{ id: "a", name: "Zed" }], numberOfItems: 1, releaseDate: "2020-01-01" },
    { id: "2", title: "A side", artists: [{ id: "b", name: "Abel" }], numberOfItems: 1, releaseDate: "2024-01-01" },
  ];

  it("sorts albums by title, artist and release date", () => {
    expect(sortAlbums(albums, "name", false).map((album) => album.id)).toEqual(["2", "1"]);
    expect(sortAlbums(albums, "artist", false).map((album) => album.id)).toEqual(["2", "1"]);
    expect(sortAlbums(albums, "released", false).map((album) => album.id)).toEqual(["1", "2"]);
    expect(sortAlbums(albums, "added", true).map((album) => album.id)).toEqual(["1", "2"]);
  });

  it("sorts artists by name", () => {
    const artists = [
      { id: "1", name: "zeta" },
      { id: "2", name: "Alfa" },
    ];
    expect(sortArtists(artists, "name", false).map((artist) => artist.id)).toEqual(["2", "1"]);
    expect(sortArtists(artists, "name", true).map((artist) => artist.id)).toEqual(["1", "2"]);
  });
});

describe("sort helpers", () => {
  it("recognizes stored sort keys", () => {
    const isPlaylistKey = isSortKeyOf(PLAYLIST_SORT_LABELS);
    expect(isPlaylistKey("tracks")).toBe(true);
    expect(isPlaylistKey("color")).toBe(false);
    expect(isPlaylistKey(undefined)).toBe(false);
  });

  it("starts dates and sizes descending and text ascending", () => {
    expect(startsDescending("modified")).toBe(true);
    expect(startsDescending("tracks")).toBe(true);
    expect(startsDescending("name")).toBe(false);
  });
});
