// Pure rules of the play-count sync between this device and the cloud copy.
// Kept free of database and network code so they can be tested on their own.

export interface PlayRow {
  trackId: string;
  playCount: number;
  baselineCount: number;
  lastPlayedAt: string | null;
}

function laterOf(left: string | null, right: string | null): string | null {
  if (left === null) return right;
  if (right === null) return left;
  return left >= right ? left : right;
}

// One user, no conflict resolution: for each track the higher count and the
// later date win. The baseline is set once, by whichever device saw the track
// first, so an existing one is never replaced.
export function mergePlayRows(local: PlayRow | undefined, remote: PlayRow | undefined): PlayRow {
  if (!local && !remote) throw new Error("Nothing to merge.");
  if (!local) return remote as PlayRow;
  if (!remote) return local;
  return {
    trackId: local.trackId,
    playCount: Math.max(local.playCount, remote.playCount),
    baselineCount: local.baselineCount,
    lastPlayedAt: laterOf(local.lastPlayedAt, remote.lastPlayedAt),
  };
}

function sameRow(left: PlayRow, right: PlayRow): boolean {
  return (
    left.playCount === right.playCount &&
    left.baselineCount === right.baselineCount &&
    left.lastPlayedAt === right.lastPlayedAt
  );
}

// A track never played and with no baseline is the same as an unknown track;
// sending thousands of those rows to the cloud would be noise.
export function isWorthSyncing(row: PlayRow): boolean {
  return row.playCount > 0 || row.baselineCount > 0;
}

export interface SyncPlan {
  // Rows to write locally (the cloud was ahead or had tracks this device lacks).
  toLocal: PlayRow[];
  // Rows to write to the cloud (this device was ahead).
  toRemote: PlayRow[];
}

export function planSync(localRows: PlayRow[], remoteRows: PlayRow[]): SyncPlan {
  const localById = new Map(localRows.map((row) => [row.trackId, row]));
  const remoteById = new Map(remoteRows.map((row) => [row.trackId, row]));
  const plan: SyncPlan = { toLocal: [], toRemote: [] };
  for (const trackId of new Set([...localById.keys(), ...remoteById.keys()])) {
    const local = localById.get(trackId);
    const remote = remoteById.get(trackId);
    const merged = mergePlayRows(local, remote);
    if (!local || !sameRow(local, merged)) plan.toLocal.push(merged);
    // The cloud keeps its own baseline, so only counts and dates are compared.
    const remoteIsBehind =
      !remote ||
      remote.playCount < merged.playCount ||
      remote.lastPlayedAt !== laterOf(remote.lastPlayedAt, merged.lastPlayedAt);
    if (remoteIsBehind && isWorthSyncing(merged)) plan.toRemote.push(merged);
  }
  return plan;
}
