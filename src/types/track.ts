export interface ArtistSummary {
  id: string;
  name: string;
}

export interface AlbumSummary {
  id: string;
  title: string;
  cover?: string | null;
}

export interface Track {
  id: string;
  title: string;
  duration: number;
  trackNumber?: number | null;
  volumeNumber?: number | null;
  artists: ArtistSummary[];
  album?: AlbumSummary | null;
  audioQuality?: string | null;
  isPlayable: boolean;
}

// One page of the liked-songs collection. `nextCursor` is null when the last
// page has been reached.
export interface FavoriteTracksPage {
  tracks: Track[];
  nextCursor: string | null;
}