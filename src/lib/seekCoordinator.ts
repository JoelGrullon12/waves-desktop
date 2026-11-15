// Dragging the progress slider fires a change event per pixel. Sending each one
// to the SDK queues overlapping seeks that land out of order, so while one seek
// is in flight only the latest requested target is kept and applied next.
export class SeekCoordinator {
  private pendingTarget: number | null = null;
  private seekInFlight = false;

  constructor(private readonly performSeek: (seconds: number) => Promise<void>) {}

  // The position poll must not overwrite the slider while a seek is settling.
  get isBusy(): boolean {
    return this.seekInFlight;
  }

  async request(seconds: number): Promise<void> {
    this.pendingTarget = seconds;
    if (this.seekInFlight) return;
    this.seekInFlight = true;
    try {
      while (this.pendingTarget != null) {
        const target = this.pendingTarget;
        this.pendingTarget = null;
        await this.performSeek(target);
      }
    } finally {
      this.pendingTarget = null;
      this.seekInFlight = false;
    }
  }
}

export function clampSeekPosition(seconds: number, durationSeconds: number): number {
  if (!Number.isFinite(seconds)) return 0;
  const lowerBounded = Math.max(0, seconds);
  // The duration is 0 until the first transition reports it.
  return durationSeconds > 0 ? Math.min(lowerBounded, durationSeconds) : lowerBounded;
}
