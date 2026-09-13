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