import type { ArtistSummary } from "@/types/track";

export type MediaType = "playlist" | "album" | "mix";

// The shared visual for Home cards and the generic detail view. `mixType` is
// only present for mixes: it is the TIDAL resource type (e.g. `userDailyMixes`)
// that the mix items endpoint is keyed by.
export interface MediaSummary {
  id: string;
  type: MediaType;
  mixType?: string;
  title: string;
  subtitle?: string;
  cover?: string | null;
  numberOfItems?: number;
  releaseDate?: string;
}

export interface PlaylistSummary {
  id: string;
  title: string;
  cover?: string | null;
  numberOfItems: number;
  duration: number;
  playlistType?: string | null;
}

export interface AlbumSummary {
  id: string;
  title: string;
  cover?: string | null;
  artists: ArtistSummary[];
  releaseDate?: string | null;
  numberOfItems: number;
}

export interface MixSummary {
  id: string;
  mixType: string;
  title: string;
  cover?: string | null;
  numberOfItems: number;
}

export interface AlbumDetail {
  id: string;
  title: string;
  cover?: string | null;
  artists: ArtistSummary[];
  releaseDate?: string | null;
  numberOfItems: number;
  duration: number;
}

export interface PlaylistDetail {
  id: string;
  title: string;
  cover?: string | null;
  playlistType?: string | null;
  numberOfItems: number;
  duration: number;
}

export type MixRelationName = "myMixes" | "discoveryMixes";