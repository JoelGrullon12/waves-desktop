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

// One page of any track list (album, playlist or mix). `nextCursor` is null when
// the last page has been reached.
export interface TrackPage {
  tracks: Track[];
  nextCursor: string | null;
}

// One page of the identifier-only likes walk used to drive like state. `ids` are
// track ids; `nextCursor` is null on the last page.
export interface LikedTrackIdsPage {
  ids: string[];
  nextCursor: string | null;
}