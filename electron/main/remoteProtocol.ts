import { timingSafeEqual } from "node:crypto";

// Messages of the phone remote. Everything arriving from the network is
// checked here before it can reach the player.

export type RemoteCommand =
  | { type: "play" }
  | { type: "pause" }
  | { type: "next" }
  | { type: "previous" }
  | { type: "set_volume"; value: number }
  | { type: "seek"; value: number };

// What the remote shows; sent to every connected phone on each change.
export interface RemoteState {
  trackId: string | null;
  title: string | null;
  artist: string | null;
  album: string | null;
  artworkUrl: string | null;
  isPlaying: boolean;
  positionSeconds: number;
  durationSeconds: number;
  volume: number;
}

export const EMPTY_REMOTE_STATE: RemoteState = {
  trackId: null,
  title: null,
  artist: null,
  album: null,
  artworkUrl: null,
  isPlaying: false,
  positionSeconds: 0,
  durationSeconds: 0,
  volume: 0,
};

const MAX_MESSAGE_LENGTH = 200;
const MAX_SEEK_SECONDS = 24 * 60 * 60;
const SIMPLE_COMMANDS = ["play", "pause", "next", "previous"] as const;

function finiteNumberIn(value: unknown, minimum: number, maximum: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < minimum || value > maximum) return null;
  return value;
}

// Returns null for anything that is not a well-formed command.
export function parseRemoteCommand(rawMessage: string): RemoteCommand | null {
  if (rawMessage.length > MAX_MESSAGE_LENGTH) return null;
  let message: unknown;
  try {
    message = JSON.parse(rawMessage);
  } catch {
    return null;
  }
  if (typeof message !== "object" || message === null) return null;
  const { type, value } = message as { type?: unknown; value?: unknown };
  const simple = SIMPLE_COMMANDS.find((command) => command === type);
  if (simple) return { type: simple };
  if (type === "set_volume") {
    const volume = finiteNumberIn(value, 0, 100);
    return volume === null ? null : { type: "set_volume", value: Math.round(volume) };
  }
  if (type === "seek") {
    const seconds = finiteNumberIn(value, 0, MAX_SEEK_SECONDS);
    return seconds === null ? null : { type: "seek", value: seconds };
  }
  return null;
}

// Compared in constant time so the token can not be guessed a character at a
// time from response timing.
export function isPairingTokenValid(candidate: string | null, pairingToken: string): boolean {
  if (!candidate || pairingToken.length === 0) return false;
  const candidateBytes = Buffer.from(candidate);
  const tokenBytes = Buffer.from(pairingToken);
  if (candidateBytes.length !== tokenBytes.length) return false;
  return timingSafeEqual(candidateBytes, tokenBytes);
}

function textOrNull(value: unknown, maximumLength: number): string | null {
  return typeof value === "string" ? value.slice(0, maximumLength) : null;
}

// The state comes from the app's own renderer, but it is forwarded to other
// devices, so it is rebuilt field by field instead of passed through.
export function sanitizeRemoteState(value: unknown): RemoteState {
  if (typeof value !== "object" || value === null) return EMPTY_REMOTE_STATE;
  const state = value as Record<string, unknown>;
  const artworkUrl = textOrNull(state["artworkUrl"], 500);
  return {
    trackId: textOrNull(state["trackId"], 64),
    title: textOrNull(state["title"], 300),
    artist: textOrNull(state["artist"], 300),
    album: textOrNull(state["album"], 300),
    artworkUrl: artworkUrl && artworkUrl.startsWith("https://") ? artworkUrl : null,
    isPlaying: state["isPlaying"] === true,
    positionSeconds: finiteNumberIn(state["positionSeconds"], 0, MAX_SEEK_SECONDS) ?? 0,
    durationSeconds: finiteNumberIn(state["durationSeconds"], 0, MAX_SEEK_SECONDS) ?? 0,
    volume: finiteNumberIn(state["volume"], 0, 100) ?? 0,
  };
}
