import type { AlbumSummary, MediaSummary, PlaylistSummary } from "@/types/media";

// Turns the API's playlist / album summaries into the card shape shared by
// Home, the library, search and artist pages.

function playlistSubtitle(playlist: PlaylistSummary): string {
  const playlistType = (playlist.playlistType ?? "").toUpperCase();
  if (playlistType.includes("EDITORIAL") || playlistType.includes("TIDAL")) return "TIDAL";
  if (playlist.numberOfItems > 0) {
    return `${playlist.numberOfItems} ${playlist.numberOfItems === 1 ? "track" : "tracks"}`;
  }
  return "Playlist";
}

export function playlistToMedia(playlist: PlaylistSummary): MediaSummary {
  return {
    id: playlist.id,
    type: "playlist",
    title: playlist.title,
    subtitle: playlistSubtitle(playlist),
    cover: playlist.cover,
    numberOfItems: playlist.numberOfItems,
  };
}

export function albumToMedia(album: AlbumSummary): MediaSummary {
  const artistNames = album.artists.map((artist) => artist.name).join(", ");
  return {
    id: album.id,
    type: "album",
    title: album.title,
    subtitle: artistNames || "Album",
    cover: album.cover,
    numberOfItems: album.numberOfItems,
    releaseDate: album.releaseDate ?? undefined,
  };
}

// "2024" for an ISO date; albums are told apart by year on an artist page.
export function releaseYear(releaseDate: string | null | undefined): string | null {
  const year = releaseDate?.slice(0, 4);
  return year && /^\d{4}$/.test(year) ? year : null;
}

// Path of the detail page behind a card.
export function mediaPath(media: MediaSummary): string {
  if (media.type === "album") return `/albums/${media.id}`;
  if (media.type === "playlist") return `/playlists/${media.id}`;
  return `/mixes/${media.mixType ?? "playlists"}/${media.id}`;
}
