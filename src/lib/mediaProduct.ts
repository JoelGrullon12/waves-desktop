import type { MediaProduct } from "@tidal-music/player";
import type { PlaybackSource } from "@/store/queueStore";
import type { Track } from "@/types/track";

// Maps an app-visible track to the media product shape the TIDAL Web SDK
// expects. referenceId carries the track id so queue navigation can be kept in
// sync when the SDK emits media-product-transition events.
export function mediaProductFor(track: Track, source: PlaybackSource): MediaProduct {
  return {
    productId: String(track.id),
    productType: "track",
    referenceId: String(track.id),
    sourceId: source.sourceId,
    sourceType: source.sourceType,
  };
}