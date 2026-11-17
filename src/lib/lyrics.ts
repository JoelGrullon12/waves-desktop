// Synced lyrics come as LRC text: "[mm:ss.xx]line". A line may carry several
// timestamps (a repeated chorus) and lines without one are left out.

export interface LyricsLine {
  timeSeconds: number;
  text: string;
}

const TIMESTAMP = /\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g;

export function parseLrc(lrcText: string): LyricsLine[] {
  const lines: LyricsLine[] = [];
  for (const rawLine of lrcText.split(/\r?\n/)) {
    const times: number[] = [];
    let match: RegExpExecArray | null;
    TIMESTAMP.lastIndex = 0;
    let textStart = 0;
    while ((match = TIMESTAMP.exec(rawLine)) !== null) {
      // Only timestamps at the start of the line, one after another.
      if (match.index !== textStart) break;
      const minutes = Number(match[1]);
      const seconds = Number(match[2].replace(":", "."));
      times.push(minutes * 60 + seconds);
      textStart = match.index + match[0].length;
    }
    if (times.length === 0) continue;
    const text = rawLine.slice(textStart).trim();
    for (const timeSeconds of times) lines.push({ timeSeconds, text });
  }
  return lines.sort((first, second) => first.timeSeconds - second.timeSeconds);
}

// The line being sung at `positionSeconds`: the last one that has started.
// -1 before the first line.
export function activeLineIndex(lines: LyricsLine[], positionSeconds: number): number {
  let low = 0;
  let high = lines.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (lines[middle].timeSeconds <= positionSeconds) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}
