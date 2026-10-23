import { shuffleCopy } from "@/lib/random";
import { tidalCatalogService } from "@/services/tidalCatalogService";
import { usePlayerStore } from "@/store/playerStore";
import type { PlaybackSource } from "@/store/queueStore";
import type { MediaSummary } from "@/types/media";
import type { Track, TrackPage } from "@/types/track";
import type { Result } from "@/services/tidalCatalogService";

// Walks every page of a track list. Playback needs the complete list, so unlike
// the detail view (which prefetches in the background for infinite scroll) this
// loop blocks until the last page.
async function loadAllTrackPages(
  fetchPage: (cursor: string | null) => Promise<Result<TrackPage>>,
): Promise<Track[]> {
  const tracks: Track[] = [];
  let cursor: string | null = null;
  for (;;) {
    const result = await fetchPage(cursor);
    if (!result.success) throw new Error(result.error);
    tracks.push(...result.data.tracks);
    if (!result.data.nextCursor || result.data.nextCursor === cursor) break;
    cursor = result.data.nextCursor;
  }
  return tracks;
}

// Loads the full track list behind a Home card / detail entry. Each media kind
// resolves through its own paginated items endpoint; mixes carry the TIDAL
// resource type (`mixType`) needed to build that endpoint.
export async function loadTracksForMedia(media: MediaSummary): Promise<Track[]> {
  if (media.type === "playlist") {
    return loadAllTrackPages((cursor) =>
      tidalCatalogService.getPlaylistTracksPage(media.id, cursor),
    );
  }
  if (media.type === "album") {
    return loadAllTrackPages((cursor) =>
      tidalCatalogService.getAlbumTracksPage(media.id, cursor),
    );
  }
  if (!media.mixType) {
    throw new Error("Missing mix type for playback.");
  }
  return loadAllTrackPages((cursor) =>
    tidalCatalogService.getMixTracksPage(media.mixType as string, media.id, cursor),
  );
}

// Replaces the current queue with ONLY this media's tracks (shuffled when
// requested) and starts playback — matching the "play this, discard the rest"
// contract of the Home cards and the detail view.
export async function playMedia(media: MediaSummary, shuffle: boolean): Promise<void> {
  const tracks = await loadTracksForMedia(media);
  if (tracks.length === 0) {
    throw new Error("This item has no streamable tracks.");
  }
  const source: PlaybackSource = { sourceType: media.type, sourceId: media.id };
  const queue = shuffle ? shuffleCopy(tracks) : tracks;
  await usePlayerStore.getState().playQueue(queue, 0, source);
}
