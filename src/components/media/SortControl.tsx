import { ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-react";
import { startsDescending } from "@/lib/librarySort";
import {
  readBooleanPreference,
  readChoicePreference,
  type PreferenceValues,
} from "@/lib/preferences";
import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/store/preferencesStore";

interface SortControlProps<Key extends string> {
  // Name of the list being sorted, for screen readers ("playlists").
  listName: string;
  labels: Record<Key, string>;
  sortKey: Key;
  descending: boolean;
  onChange: (sortKey: Key, descending: boolean) => void;
  className?: string;
}

// "Sort by" menu plus a button that flips the direction.
export function SortControl<Key extends string>({
  listName,
  labels,
  sortKey,
  descending,
  onChange,
  className,
}: SortControlProps<Key>) {
  const DirectionIcon = descending ? ArrowDownWideNarrow : ArrowUpNarrowWide;
  const directionLabel = descending ? "Descending" : "Ascending";
  return (
    <div className={cn("flex min-w-0 items-center gap-1", className)}>
      <select
        value={sortKey}
        aria-label={`Sort ${listName} by`}
        onChange={(event) => {
          const nextKey = event.target.value as Key;
          // A new criterion starts in its natural direction.
          onChange(nextKey, startsDescending(nextKey));
        }}
        className="h-7 min-w-0 flex-1 cursor-pointer rounded-md border border-input bg-background px-1.5 text-xs outline-none focus-visible:border-ring"
      >
        {(Object.keys(labels) as Key[]).map((key) => (
          <option key={key} value={key}>
            {labels[key]}
          </option>
        ))}
      </select>
      <button
        type="button"
        title={`${directionLabel} (click to reverse)`}
        aria-label={`${directionLabel} order of ${listName}; click to reverse`}
        data-descending={descending}
        onClick={() => onChange(sortKey, !descending)}
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <DirectionIcon className="size-4" aria-hidden />
      </button>
    </div>
  );
}

// A sort choice remembered between runs under two preference keys.
export function useStoredSort<Key extends string>(
  keyPreference: string,
  descendingPreference: string,
  isKey: (value: unknown) => value is Key,
  defaultKey: Key,
): { sortKey: Key; descending: boolean; setSort: (sortKey: Key, descending: boolean) => void } {
  const values: PreferenceValues = usePreferencesStore((state) => state.values);
  const setPreference = usePreferencesStore((state) => state.setPreference);
  const sortKey = readChoicePreference(values, keyPreference, isKey, defaultKey);
  const descending = readBooleanPreference(values, descendingPreference, startsDescending(sortKey));
  return {
    sortKey,
    descending,
    setSort: (nextKey, nextDescending) => {
      setPreference(keyPreference, nextKey);
      setPreference(descendingPreference, String(nextDescending));
    },
  };
}
