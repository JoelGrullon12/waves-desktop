// Pure rules of the play queue: which position follows the current one under
// each repeat mode, and how lists are rearranged for shuffle and insertions.

// "one-once" plays the current track one extra time and then switches itself
// off; "one" repeats the current track until changed; "all" loops the queue.
export type RepeatMode = "off" | "one-once" | "one" | "all";

const REPEAT_MODE_CYCLE: RepeatMode[] = ["off", "one-once", "one", "all"];

export function isRepeatMode(value: unknown): value is RepeatMode {
  return REPEAT_MODE_CYCLE.includes(value as RepeatMode);
}

export function nextRepeatMode(mode: RepeatMode): RepeatMode {
  return REPEAT_MODE_CYCLE[(REPEAT_MODE_CYCLE.indexOf(mode) + 1) % REPEAT_MODE_CYCLE.length];
}

// Position played when the current track ends by itself.
export function indexAfterTrackEnds(
  queueLength: number,
  currentIndex: number | null,
  repeatMode: RepeatMode,
): number | null {
  if (currentIndex == null || queueLength === 0) return null;
  if (repeatMode === "one" || repeatMode === "one-once") return currentIndex;
  return indexAfterSkip(queueLength, currentIndex, repeatMode);
}

// Position played when the user presses Next: repeating one track does not
// trap the user on it.
export function indexAfterSkip(
  queueLength: number,
  currentIndex: number | null,
  repeatMode: RepeatMode,
): number | null {
  if (currentIndex == null || queueLength === 0) return null;
  if (currentIndex + 1 < queueLength) return currentIndex + 1;
  return repeatMode === "all" ? 0 : null;
}

export function indexBefore(
  queueLength: number,
  currentIndex: number | null,
  repeatMode: RepeatMode,
): number | null {
  if (currentIndex == null || queueLength === 0) return null;
  if (currentIndex > 0) return currentIndex - 1;
  return repeatMode === "all" ? queueLength - 1 : null;
}

export function withoutIndex<Item>(
  items: Item[],
  currentIndex: number | null,
  removedIndex: number,
): { items: Item[]; currentIndex: number | null } {
  if (removedIndex < 0 || removedIndex >= items.length) return { items, currentIndex };
  const remaining = items.filter((_, index) => index !== removedIndex);
  let nextIndex = currentIndex;
  if (currentIndex != null) {
    if (removedIndex < currentIndex) nextIndex = currentIndex - 1;
    else if (removedIndex === currentIndex) nextIndex = Math.min(removedIndex, remaining.length - 1);
  }
  if (remaining.length === 0) nextIndex = null;
  return { items: remaining, currentIndex: nextIndex };
}

// "Play next": right after the current item (or at the start of an idle queue).
export function insertedAfterCurrent<Item>(
  items: Item[],
  currentIndex: number | null,
  added: Item[],
): Item[] {
  const insertAt = currentIndex == null ? 0 : currentIndex + 1;
  return [...items.slice(0, insertAt), ...added, ...items.slice(insertAt)];
}

// Drag-and-drop style move; the current item keeps playing wherever it lands.
export function movedItem<Item>(
  items: Item[],
  currentIndex: number | null,
  fromIndex: number,
  toIndex: number,
): { items: Item[]; currentIndex: number | null } {
  const isValid = (index: number) => index >= 0 && index < items.length;
  if (!isValid(fromIndex) || !isValid(toIndex) || fromIndex === toIndex) {
    return { items, currentIndex };
  }
  const reordered = [...items];
  const [moved] = reordered.splice(fromIndex, 1);
  reordered.splice(toIndex, 0, moved);
  let nextIndex = currentIndex;
  if (currentIndex != null) {
    if (currentIndex === fromIndex) nextIndex = toIndex;
    else if (fromIndex < currentIndex && toIndex >= currentIndex) nextIndex = currentIndex - 1;
    else if (fromIndex > currentIndex && toIndex <= currentIndex) nextIndex = currentIndex + 1;
  }
  return { items: reordered, currentIndex: nextIndex };
}

// Where `movedItem` must put the track at `fromIndex` so it plays right after
// the current one. Taking a track out from before the current one shifts the
// current one back by a place, hence the two cases. Null when nothing has to
// move (no current track, or it already plays next / is the current one).
export function indexToPlaceNext(fromIndex: number, currentIndex: number | null): number | null {
  if (currentIndex == null || fromIndex === currentIndex || fromIndex === currentIndex + 1) return null;
  return fromIndex < currentIndex ? currentIndex : currentIndex + 1;
}
