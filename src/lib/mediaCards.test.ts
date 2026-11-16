import { describe, expect, it } from "vitest";
import { albumToMedia, mediaPath, playlistToMedia, releaseYear } from "@/lib/mediaCards";

describe("playlistToMedia", () => {
  it("labels editorial playlists as TIDAL and user playlists by size", () => {
    const base = { id: "p1", title: "Mix", duration: 0 };
    expect(playlistToMedia({ ...base, numberOfItems: 50, playlistType: "EDITORIAL" }).subtitle).toBe("TIDAL");
    expect(playlistToMedia({ ...base, numberOfItems: 1, playlistType: "USER" }).subtitle).toBe("1 track");
    expect(playlistToMedia({ ...base, numberOfItems: 12, playlistType: "USER" }).subtitle).toBe("12 tracks");
    expect(playlistToMedia({ ...base, numberOfItems: 0, playlistType: "USER" }).subtitle).toBe("Playlist");
  });
});

describe("albumToMedia", () => {
  it("uses the artist names as subtitle", () => {
    const media = albumToMedia({
      id: "a1",
      title: "Album",
      artists: [
        { id: "1", name: "First" },
        { id: "2", name: "Second" },
      ],
      numberOfItems: 10,
      releaseDate: "2024-05-01",
    });
    expect(media).toMatchObject({ type: "album", subtitle: "First, Second", releaseDate: "2024-05-01" });
  });

  it("falls back to a generic subtitle without artists", () => {
    expect(albumToMedia({ id: "a1", title: "Album", artists: [], numberOfItems: 1 }).subtitle).toBe("Album");
  });
});

describe("releaseYear", () => {
  it("extracts the year of an ISO date", () => {
    expect(releaseYear("2023-04-20")).toBe("2023");
    expect(releaseYear(null)).toBeNull();
    expect(releaseYear("soon")).toBeNull();
  });
});

describe("mediaPath", () => {
  it("builds the detail route of each kind of media", () => {
    expect(mediaPath({ id: "1", type: "album", title: "" })).toBe("/albums/1");
    expect(mediaPath({ id: "2", type: "playlist", title: "" })).toBe("/playlists/2");
    expect(mediaPath({ id: "3", type: "mix", mixType: "userDailyMixes", title: "" })).toBe(
      "/mixes/userDailyMixes/3",
    );
    expect(mediaPath({ id: "4", type: "mix", title: "" })).toBe("/mixes/playlists/4");
  });
});
