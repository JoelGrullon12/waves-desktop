import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { DATABASE_SCHEMA } from "./databaseSchema";
import { LIKED_COLLECTION_ID, MetadataCacheRepository } from "./metadataCacheRepository";
import type { Track } from "./tidalParsers";

function track(id: string, title: string, artist = "Artist"): Track {
  return {
    id,
    title,
    duration: 200,
    artists: [{ id: `artist-${artist}`, name: artist }],
    album: { id: `album-${id}`, title: `Album of ${title}`, cover: `https://img/${id}.jpg` },
    isPlayable: true,
  } as Track;
}

let cache: MetadataCacheRepository;

beforeEach(() => {
  const databaseConnection = new DatabaseSync(":memory:");
  databaseConnection.exec(DATABASE_SCHEMA);
  cache = new MetadataCacheRepository(databaseConnection);
});

describe("MetadataCacheRepository", () => {
  it("tells an uncached collection apart from an empty one", () => {
    expect(cache.collectionTracks("p1")).toBeNull();
    cache.replaceCollection("p1", "playlist", "Empty", []);
    expect(cache.collectionTracks("p1")).toEqual([]);
  });

  it("returns a collection in order, duplicates included, with full metadata", () => {
    const a = track("a", "Alpha");
    const b = track("b", "Beta");
    cache.replaceCollection("p1", "playlist", "Mix", [b, a, b]);
    expect(cache.collectionTracks("p1")).toEqual([b, a, b]);
  });

  it("replaces the previous content of a collection", () => {
    cache.replaceCollection("p1", "playlist", "Mix", [track("a", "Alpha"), track("b", "Beta")]);
    cache.replaceCollection("p1", "playlist", "Mix", [track("c", "Gamma")]);
    expect(cache.collectionTracks("p1")?.map((item) => item.id)).toEqual(["c"]);
  });

  it("lists the playlists each track is in, once per playlist", () => {
    const a = track("a", "Alpha");
    cache.replaceCollection(LIKED_COLLECTION_ID, "liked", "Liked", [a]);
    cache.replaceCollection("p2", "playlist", "Zeta list", [a, a]);
    cache.replaceCollection("p1", "playlist", "Alpha list", [a, track("b", "Beta")]);
    expect(cache.playlistsContaining(["a", "b", "x"])).toEqual(
      new Map([
        ["a", [
          { id: "p1", title: "Alpha list" },
          { id: "p2", title: "Zeta list" },
        ]],
        ["b", [{ id: "p1", title: "Alpha list" }]],
      ]),
    );
  });

  it("searches likes and playlists, liked first, ignoring accents and word order", () => {
    cache.replaceCollection(LIKED_COLLECTION_ID, "liked", "Liked", [track("l", "Canción del mar", "Niña")]);
    cache.replaceCollection("p1", "playlist", "Road", [track("p", "Mar adentro", "Otro"), track("z", "Zzz")]);

    const results = cache.search("mar", 10);
    expect(results.map((result) => result.track.id)).toEqual(["l", "p"]);
    expect(results[0]).toMatchObject({ isLiked: true, playlists: [] });
    expect(results[1]).toMatchObject({ isLiked: false, playlists: [{ id: "p1", title: "Road" }] });
    expect(cache.search("nina cancion", 10).map((result) => result.track.id)).toEqual(["l"]);
    expect(cache.search("  ", 10)).toEqual([]);
    expect(cache.search("mar", 1)).toHaveLength(1);
  });

  it("sees writes made after a search", () => {
    cache.replaceCollection("p1", "playlist", "Road", [track("a", "Alpha")]);
    expect(cache.search("beta", 10)).toEqual([]);
    cache.addTracks("p1", [track("b", "Beta")], "end");
    expect(cache.search("beta", 10)).toHaveLength(1);
    expect(cache.collectionTracks("p1")?.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("puts a newly liked track first without duplicating it and removes unliked ones", () => {
    const a = track("a", "Alpha");
    const b = track("b", "Beta");
    cache.replaceCollection(LIKED_COLLECTION_ID, "liked", "Liked", [a, b]);
    cache.addTracks(LIKED_COLLECTION_ID, [b], "start");
    expect(cache.collectionTracks(LIKED_COLLECTION_ID)?.map((item) => item.id)).toEqual(["b", "a"]);
    cache.removeTracks(LIKED_COLLECTION_ID, ["a"]);
    expect(cache.collectionTracks(LIKED_COLLECTION_ID)?.map((item) => item.id)).toEqual(["b"]);
  });

  it("ignores edits of a collection that is not cached", () => {
    cache.addTracks("unknown", [track("a", "Alpha")], "end");
    expect(cache.collectionTracks("unknown")).toBeNull();
  });

  it("forgets playlists that left the library and their orphaned tracks", () => {
    cache.replaceCollection(LIKED_COLLECTION_ID, "liked", "Liked", [track("a", "Alpha")]);
    cache.replaceCollection("gone", "playlist", "Gone", [track("a", "Alpha"), track("only", "Only here")]);
    cache.keepOnlyCollections([LIKED_COLLECTION_ID]);

    expect(cache.collectionTracks("gone")).toBeNull();
    expect(cache.summary()).toMatchObject({ trackCount: 1, playlistCount: 0, likedTrackCount: 1 });
  });

  it("summarizes and clears the cache", () => {
    expect(cache.summary()).toEqual({ trackCount: 0, playlistCount: 0, likedTrackCount: 0, refreshedAt: null });
    cache.replaceCollection("p1", "playlist", "Road", [track("a", "Alpha")]);
    expect(cache.summary().refreshedAt).not.toBeNull();
    cache.clear();
    expect(cache.summary().trackCount).toBe(0);
  });
});
