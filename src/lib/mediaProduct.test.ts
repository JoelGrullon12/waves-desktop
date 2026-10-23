import { describe, expect, it } from "vitest";
import { mediaProductFor } from "@/lib/mediaProduct";
import type { Track } from "@/types/track";

const track: Track = {
  id: "12345",
  title: "Song",
  duration: 120,
  artists: [{ id: "1", name: "Artist" }],
  isPlayable: true,
};

describe("mediaProductFor", () => {
  it("maps a track and its source to the SDK media product", () => {
    expect(mediaProductFor(track, { sourceType: "playlist", sourceId: "abc" })).toEqual({
      productId: "12345",
      productType: "track",
      referenceId: "12345",
      sourceId: "abc",
      sourceType: "playlist",
    });
  });

  it("keeps referenceId equal to the track id so queue sync can find it", () => {
    const product = mediaProductFor(track, { sourceType: "album", sourceId: "9" });

    expect(product.referenceId).toBe(track.id);
  });
});
