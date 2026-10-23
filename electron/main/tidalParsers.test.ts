import { describe, expect, it } from "vitest";
import {
  artworkFileHref,
  indexResources,
  iso8601DurationToSeconds,
  mediaTagToQuality,
  trackFromV2Resource,
  tracksFromItems,
  tracksFromSearch,
  tracksFromTracksDocument,
  type ResourceObject,
} from "./tidalParsers";

const artwork: ResourceObject = {
  id: "art1",
  type: "artworks",
  attributes: {
    files: [
      { href: "https://cdn.test/80.jpg", meta: { width: 80 } },
      { href: "https://cdn.test/320.jpg", meta: { width: 320 } },
      { href: "https://cdn.test/640.jpg", meta: { width: 640 } },
    ],
  },
};

const artist: ResourceObject = { id: "ar1", type: "artists", attributes: { name: "Artist One" } };

const album: ResourceObject = {
  id: "al1",
  type: "albums",
  attributes: { title: "Album One" },
  relationships: { coverArt: { data: [{ id: "art1", type: "artworks" }] } },
};

function trackResource(id: string, title: string): ResourceObject {
  return {
    id,
    type: "tracks",
    attributes: { title, duration: "PT2M58S", mediaTags: ["LOSSLESS"] },
    relationships: {
      artists: { data: [{ id: "ar1", type: "artists" }] },
      albums: { data: [{ id: "al1", type: "albums" }] },
    },
  };
}

const included = [artwork, artist, album];

describe("iso8601DurationToSeconds", () => {
  it("parses minute and second components", () => {
    expect(iso8601DurationToSeconds("PT2M58S")).toBe(178);
    expect(iso8601DurationToSeconds("PT45S")).toBe(45);
  });

  it("parses hours", () => {
    expect(iso8601DurationToSeconds("PT1H2M3S")).toBe(3723);
  });

  it("ignores days and returns 0 for empty or malformed input", () => {
    expect(iso8601DurationToSeconds("P1DT1H")).toBe(3600);
    expect(iso8601DurationToSeconds("")).toBe(0);
    expect(iso8601DurationToSeconds("garbage")).toBe(0);
  });
});

describe("mediaTagToQuality", () => {
  it("maps the API's HIRES_LOSSLESS spelling to HI_RES_LOSSLESS", () => {
    expect(mediaTagToQuality(["LOSSLESS", "HIRES_LOSSLESS"])).toBe("HI_RES_LOSSLESS");
  });

  it("picks the best available quality regardless of tag order or case", () => {
    expect(mediaTagToQuality(["high", "lossless"])).toBe("LOSSLESS");
    expect(mediaTagToQuality(["HIGH", "DOLBY_ATMOS"])).toBe("DOLBY_ATMOS");
  });

  it("returns null when no known tag is present", () => {
    expect(mediaTagToQuality([])).toBeNull();
    expect(mediaTagToQuality(["UNKNOWN"])).toBeNull();
  });
});

describe("artworkFileHref", () => {
  const byId = indexResources([artwork]);

  it("chooses the file whose width is closest to the target", () => {
    expect(artworkFileHref("art1", byId)).toBe("https://cdn.test/320.jpg");
    expect(artworkFileHref("art1", byId, 600)).toBe("https://cdn.test/640.jpg");
    expect(artworkFileHref("art1", byId, 1)).toBe("https://cdn.test/80.jpg");
  });

  it("returns null for a missing id, an unknown resource or no files", () => {
    expect(artworkFileHref(null, byId)).toBeNull();
    expect(artworkFileHref("nope", byId)).toBeNull();
    expect(artworkFileHref("empty", indexResources([{ id: "empty", attributes: {} }]))).toBeNull();
  });
});

describe("trackFromV2Resource", () => {
  const byId = indexResources(included);

  it("resolves artists, album, cover, duration and quality", () => {
    expect(trackFromV2Resource(trackResource("t1", "Song"), byId, 3, 1)).toEqual({
      id: "t1",
      title: "Song",
      duration: 178,
      trackNumber: 3,
      volumeNumber: 1,
      artists: [{ id: "ar1", name: "Artist One" }],
      album: { id: "al1", title: "Album One", cover: "https://cdn.test/320.jpg" },
      audioQuality: "LOSSLESS",
      isPlayable: true,
    });
  });

  it("degrades gracefully when related resources are missing", () => {
    const bare: ResourceObject = { id: "t2", type: "tracks", attributes: {} };

    expect(trackFromV2Resource(bare, byId, null, null)).toEqual({
      id: "t2",
      title: "",
      duration: 0,
      trackNumber: null,
      volumeNumber: null,
      artists: [],
      album: null,
      audioQuality: null,
      isPlayable: true,
    });
  });
});

describe("tracksFromSearch", () => {
  it("follows the relevance order of the tracks relationship and drops duplicates", () => {
    const document = {
      data: [
        {
          id: "search",
          relationships: {
            tracks: {
              data: [
                { id: "t2", type: "tracks" },
                { id: "t1", type: "tracks" },
                { id: "t2", type: "tracks" },
                { id: "missing", type: "tracks" },
              ],
            },
          },
        },
      ],
      included: [...included, trackResource("t1", "First"), trackResource("t2", "Second")],
    };

    expect(tracksFromSearch(document).map((track) => track.id)).toEqual(["t2", "t1"]);
  });
});

describe("tracksFromItems", () => {
  it("keeps relationship order, skips non-tracks and unresolved items, and reads meta numbers", () => {
    const document = {
      data: [
        { id: "t2", type: "tracks", meta: { trackNumber: 2, volumeNumber: 1 } },
        { id: "v1", type: "videos" },
        { id: "gone", type: "tracks" },
        { id: "t1", type: "tracks" },
      ],
      included: [...included, trackResource("t1", "First"), trackResource("t2", "Second")],
    };

    const tracks = tracksFromItems(document);

    expect(tracks.map((track) => track.id)).toEqual(["t2", "t1"]);
    expect(tracks[0]).toMatchObject({ trackNumber: 2, volumeNumber: 1 });
    expect(tracks[1]).toMatchObject({ trackNumber: null, volumeNumber: null });
  });
});

describe("tracksFromTracksDocument", () => {
  it("returns only track resources in the echoed request order", () => {
    const document = {
      data: [trackResource("t2", "Second"), { id: "x", type: "videos" }, trackResource("t1", "First")],
      included,
    };

    expect(tracksFromTracksDocument(document).map((track) => track.id)).toEqual(["t2", "t1"]);
  });
});
