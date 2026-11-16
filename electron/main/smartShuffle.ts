// Smart shuffle: tracks heard fewer times play first, so the whole collection
// gets its turn instead of the same favorites coming up again and again.
//
// Tracks are grouped by how many times they were played, each group is
// shuffled (so two runs never sound the same and ties are broken fairly), and
// the groups are joined from least to most played.

export type RandomSource = () => number;

function shuffleInPlace<Item>(items: Item[], random: RandomSource): void {
  for (let index = items.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
}

// `shuffleLevelById` holds each track's level (plays plus the baseline it
// entered with); a track missing from it counts as never played.
export function smartShuffleOrder(
  trackIds: string[],
  shuffleLevelById: ReadonlyMap<string, number>,
  random: RandomSource = Math.random,
): string[] {
  const idsByLevel = new Map<number, string[]>();
  for (const trackId of trackIds) {
    const level = shuffleLevelById.get(trackId) ?? 0;
    const group = idsByLevel.get(level);
    if (group) group.push(trackId);
    else idsByLevel.set(level, [trackId]);
  }
  const ordered: string[] = [];
  for (const level of [...idsByLevel.keys()].sort((left, right) => left - right)) {
    const group = idsByLevel.get(level) ?? [];
    shuffleInPlace(group, random);
    ordered.push(...group);
  }
  return ordered;
}
