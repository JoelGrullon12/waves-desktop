// Decides when a playback counts as a play. A track counts once it has really
// been listened to for a while (30 seconds by default): starting it, skipping
// through it or leaving it paused does not inflate the statistics.
//
// Listened time is added up from the progress reports of the engine, which
// arrive about twice per second. A jump in position is a seek, not listening,
// so only small forward steps are added.

const MAX_LISTENING_STEP_SECONDS = 2;

export class PlayCounter {
  private listenedSeconds = 0;
  private lastPositionSeconds: number | null = null;
  private hasCounted = false;

  // A new playback started (another track, or the same one again).
  startPlayback(): void {
    this.listenedSeconds = 0;
    this.lastPositionSeconds = null;
    this.hasCounted = false;
  }

  // Returns true exactly once per playback: at the report on which the
  // listened time reaches the threshold.
  reportProgress(positionSeconds: number, isPlaying: boolean, thresholdSeconds: number): boolean {
    const previousPosition = this.lastPositionSeconds;
    this.lastPositionSeconds = positionSeconds;
    if (!isPlaying || previousPosition === null || this.hasCounted) return false;
    const step = positionSeconds - previousPosition;
    if (step <= 0 || step > MAX_LISTENING_STEP_SECONDS) return false;
    this.listenedSeconds += step;
    if (this.listenedSeconds < thresholdSeconds) return false;
    this.hasCounted = true;
    return true;
  }
}
