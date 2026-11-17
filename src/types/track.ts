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
// A match of the search inside the local copy of the library.
export interface CachedSearchResult {
  track: Track;
  isLiked: boolean;
  // The user's playlists that contain the track.
  playlists: Array<{ id: string; title: string }>;
}

// Lyrics of a track (Musixmatch, through TIDAL). `lrcText` has a timestamp per
// line ("[01:02.34]text") and allows following the song; `text` is the plain
// version. Either can be missing.
export interface TrackLyrics {
  text: string | null;
  lrcText: string | null;
  provider: string | null;
  isRightToLeft: boolean;
}

// One person and what they did on a track ("Freddie Mercury", "Vocal").
export interface TrackCredit {
  name: string;
  role: string;
  // Broad group of the role: Performer, Producer, Songwriter, Engineer...
  category: string | null;
  // Present when the person has a TIDAL artist page.
  artistId: string | null;
}
