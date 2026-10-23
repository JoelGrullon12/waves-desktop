// Fisher-Yates shuffle on a copy. Playback helpers never mutate the source
// list, so the caller's collection keeps its original order.
export function shuffleCopy<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Random selection without repetition. Returns at most `count` items (fewer
// when the source list is shorter).
export function randomSubset<T>(items: T[], count: number): T[] {
  const copy = shuffleCopy(items);
  return copy.slice(0, count);
}