export function formatDuration(totalSeconds: number | undefined): string {
  if (totalSeconds == null || !Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return "0:00";
  }
  const seconds = Math.floor(totalSeconds);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

export function formatTotalDuration(totalSeconds: number | undefined): string {
  if (totalSeconds == null || !Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return "0 min";
  }
  const totalMinutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours} hr ${minutes.toString().padStart(2, "0")} min`;
  }
  return `${minutes} min`;
}

const AUDIO_QUALITY_LABELS: Record<string, string> = {
  LOW: "Low",
  HIGH: "High",
  LOSSLESS: "Lossless",
  HI_RES_LOSSLESS: "Max",
  HI_RES: "Max",
};

// "Lossless · 16-bit / 44.1 kHz" for the player bar; null when nothing is known.
export function formatAudioFormat(format: {
  audioQuality: string | null;
  bitDepth: number | null;
  sampleRate: number | null;
} | null): string | null {
  if (!format || !format.audioQuality) return null;
  const quality = AUDIO_QUALITY_LABELS[format.audioQuality] ?? format.audioQuality;
  if (!format.bitDepth || !format.sampleRate) return quality;
  const kilohertz = Number((format.sampleRate / 1000).toFixed(1));
  return `${quality} · ${format.bitDepth}-bit / ${kilohertz} kHz`;
}
