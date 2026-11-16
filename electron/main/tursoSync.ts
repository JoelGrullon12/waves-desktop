import type { Client, InStatement } from "@libsql/client";
import { handleTrusted } from "./secureIpc";
import { getPlayCountRepository, type PlayCountRepository } from "./playCountRepository";
import { isWorthSyncing, planSync, type PlayRow } from "./playSync";

// Cloud copy of the play counts (Turso / libSQL), so they follow the user
// across devices. Everything keeps working without it: with no TURSO_* values
// in the environment, or with no network, plays are only stored locally and
// are sent at the next successful sync.
//
// Strategy (single user, no conflict resolution): at startup both sides are
// compared and each track moves to the higher count; after that every counted
// play is written to the cloud right away.

// Overridable so automated checks can use a throwaway table instead of the
// real one.
const REMOTE_TABLE = /^[a-z_]{1,40}$/.test(process.env["WAVES_SYNC_TABLE"] ?? "")
  ? (process.env["WAVES_SYNC_TABLE"] as string)
  : "track_plays";
const REMOTE_WRITE_BATCH = 200;

export interface SyncStatus {
  // False when the TURSO_* environment values are missing.
  isConfigured: boolean;
  state: "disabled" | "idle" | "syncing" | "error";
  lastSyncedAt: string | null;
  lastError: string | null;
  // Plays counted locally that have not reached the cloud yet.
  pendingTracks: number;
}

// The two calls the sync needs from the libSQL client.
export type RemoteDatabase = Pick<Client, "execute" | "batch">;

function upsertStatement(row: PlayRow): InStatement {
  return {
    // A count can only grow and the latest date wins; the baseline is kept
    // from whichever device wrote the track first.
    sql: `INSERT INTO ${REMOTE_TABLE} (track_id, play_count, baseline_count, last_played_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(track_id) DO UPDATE SET
            play_count = MAX(play_count, excluded.play_count),
            last_played_at = CASE
              WHEN last_played_at IS NULL THEN excluded.last_played_at
              WHEN excluded.last_played_at IS NULL THEN last_played_at
              ELSE MAX(last_played_at, excluded.last_played_at)
            END`,
    args: [row.trackId, row.playCount, row.baselineCount, row.lastPlayedAt],
  };
}

export class TursoSync {
  private status: SyncStatus;
  private readonly pendingTrackIds = new Set<string>();
  private isSchemaReady = false;
  private fullSyncInFlight: Promise<SyncStatus> | null = null;

  constructor(
    private readonly remote: RemoteDatabase | null,
    private readonly repository: PlayCountRepository,
  ) {
    this.status = {
      isConfigured: remote !== null,
      state: remote ? "idle" : "disabled",
      lastSyncedAt: null,
      lastError: null,
      pendingTracks: 0,
    };
  }

  getStatus(): SyncStatus {
    return { ...this.status, pendingTracks: this.pendingTrackIds.size };
  }

  // Compares every track on both sides and brings each side up to date.
  syncEverything(): Promise<SyncStatus> {
    if (!this.remote) return Promise.resolve(this.getStatus());
    this.fullSyncInFlight ??= this.runFullSync(this.remote).finally(() => {
      this.fullSyncInFlight = null;
    });
    return this.fullSyncInFlight;
  }

  // Sends one track's row after a play was counted. Never throws: a failure
  // leaves the track pending for the next attempt.
  async pushTrack(trackId: string): Promise<void> {
    if (!this.remote) return;
    this.pendingTrackIds.add(trackId);
    try {
      await this.ensureSchema(this.remote);
      const rows = [...this.pendingTrackIds]
        .map((pendingId) => this.repository.row(pendingId))
        .filter((row): row is PlayRow => row !== null && isWorthSyncing(row));
      await this.writeRemote(this.remote, rows);
      for (const row of rows) this.pendingTrackIds.delete(row.trackId);
      this.markSynced();
    } catch (error) {
      this.markFailed(error);
    }
  }

  private async runFullSync(remote: RemoteDatabase): Promise<SyncStatus> {
    this.status = { ...this.status, state: "syncing" };
    try {
      await this.ensureSchema(remote);
      const remoteRows = await this.readRemote(remote);
      const plan = planSync(this.repository.allRows(), remoteRows);
      this.repository.applySyncedRows(plan.toLocal);
      await this.writeRemote(remote, plan.toRemote);
      this.pendingTrackIds.clear();
      this.markSynced();
      console.info(
        `turso-sync: pulled ${plan.toLocal.length} and pushed ${plan.toRemote.length} tracks ` +
          `(cloud had ${remoteRows.length})`,
      );
    } catch (error) {
      this.markFailed(error);
    }
    return this.getStatus();
  }

  private async ensureSchema(remote: RemoteDatabase): Promise<void> {
    if (this.isSchemaReady) return;
    await remote.execute(
      `CREATE TABLE IF NOT EXISTS ${REMOTE_TABLE} (
         track_id        TEXT PRIMARY KEY,
         play_count      INTEGER NOT NULL DEFAULT 0,
         baseline_count  INTEGER NOT NULL DEFAULT 0,
         last_played_at  TEXT
       )`,
    );
    this.isSchemaReady = true;
  }

  private async readRemote(remote: RemoteDatabase): Promise<PlayRow[]> {
    const result = await remote.execute(
      `SELECT track_id, play_count, baseline_count, last_played_at FROM ${REMOTE_TABLE}`,
    );
    return result.rows.map((row) => ({
      trackId: String(row["track_id"]),
      playCount: Number(row["play_count"]),
      baselineCount: Number(row["baseline_count"]),
      lastPlayedAt: row["last_played_at"] == null ? null : String(row["last_played_at"]),
    }));
  }

  private async writeRemote(remote: RemoteDatabase, rows: PlayRow[]): Promise<void> {
    for (let start = 0; start < rows.length; start += REMOTE_WRITE_BATCH) {
      await remote.batch(rows.slice(start, start + REMOTE_WRITE_BATCH).map(upsertStatement), "write");
    }
  }

  private markSynced(): void {
    this.status = {
      ...this.status,
      state: "idle",
      lastSyncedAt: new Date().toISOString(),
      lastError: null,
    };
  }

  private markFailed(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`turso-sync: ${message}`);
    this.status = { ...this.status, state: "error", lastError: message };
  }
}

let tursoSync: TursoSync | null = null;

// Uses the HTTP client (`@libsql/client/web`): it needs no native module, so
// it works inside Electron on every platform without a rebuild.
async function createRemoteDatabase(): Promise<RemoteDatabase | null> {
  const url = (process.env["TURSO_DATABASE_URL"] ?? "").trim();
  const authToken = (process.env["TURSO_AUTH_TOKEN"] ?? "").trim();
  if (!url || !authToken) return null;
  const { createClient } = await import("@libsql/client/web");
  return createClient({ url, authToken });
}

// Called once at startup, after the local database is open. The first full
// sync runs in the background so the window never waits for the network.
export async function startTursoSync(): Promise<void> {
  let remote: RemoteDatabase | null = null;
  try {
    remote = await createRemoteDatabase();
  } catch (error) {
    console.error(`turso-sync: could not create the client: ${error instanceof Error ? error.message : error}`);
  }
  tursoSync = new TursoSync(remote, getPlayCountRepository());
  if (remote) void tursoSync.syncEverything();
  else console.info("turso-sync: disabled (TURSO_DATABASE_URL / TURSO_AUTH_TOKEN not set)");
}

export function pushPlayedTrack(trackId: string): void {
  void tursoSync?.pushTrack(trackId);
}

const DISABLED_STATUS: SyncStatus = {
  isConfigured: false,
  state: "disabled",
  lastSyncedAt: null,
  lastError: null,
  pendingTracks: 0,
};

export function registerSyncHandlers(): void {
  handleTrusted("sync:get-status", () => tursoSync?.getStatus() ?? DISABLED_STATUS);
  handleTrusted("sync:run-now", () => tursoSync?.syncEverything() ?? DISABLED_STATUS);
}
