import { describe, expect, it } from "vitest";
import {
  filterTracks,
  normalizeForSearch,
  searchTerms,
  trackMatchesTerms,
} from "@/lib/textSearch";
import type { Track } from "@/types/track";

function track(title: string, artist: string, album: string): Track {
  return {
    id: title,
    title,
    duration: 100,
    artists: [{ id: artist, name: artist }],
    album: { id: album, title: album },
    isPlayable: true,
  };
}

const library = [
  track("Canción del Mar", "Niña Pastori", "Esperando Verte"),
  track("Weird Fishes / Arpeggi", "Radiohead", "In Rainbows"),
  track("Reckoner", "Radiohead", "In Rainbows"),
  track("Rainbow", "Kacey Musgraves", "Golden Hour"),
];

describe("normalizeForSearch", () => {
  it("ignores case, accents and surrounding spaces", () => {
    expect(normalizeForSearch("  Canción ÑANDÚ ")).toBe("cancion nandu");
  });
});

describe("searchTerms", () => {
  it("splits on any whitespace and drops empties", () => {
    expect(searchTerms("  in   rainbows ")).toEqual(["in", "rainbows"]);
    expect(searchTerms("   ")).toEqual([]);
  });
});

describe("trackMatchesTerms", () => {
  it("requires every term, across title, artist and album", () => {
    expect(trackMatchesTerms(library[1], ["radiohead", "fishes"])).toBe(true);
    expect(trackMatchesTerms(library[1], ["radiohead", "reckoner"])).toBe(false);
  });

  it("matches nothing for an empty query", () => {
    expect(trackMatchesTerms(library[0], [])).toBe(false);
  });
});

describe("filterTracks", () => {
  it("finds tracks regardless of accents and term order", () => {
    expect(filterTracks(library, "cancion pastori").map((found) => found.title)).toEqual([
      "Canción del Mar",
    ]);
    expect(filterTracks(library, "rainbows radiohead").map((found) => found.title)).toEqual([
      "Weird Fishes / Arpeggi",
      "Reckoner",
    ]);
  });

  it("matches partial words", () => {
    expect(filterTracks(library, "rainbow").map((found) => found.title)).toEqual([
      "Weird Fishes / Arpeggi",
      "Reckoner",
      "Rainbow",
    ]);
  });

  it("returns nothing for a blank query", () => {
    expect(filterTracks(library, "  ")).toEqual([]);
  });
});
