import { Dialog } from "@base-ui/react/dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageUp, ListMusic, Loader2, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { artworkUrl } from "@/lib/tidalImage";
import { cn } from "@/lib/utils";
import { tidalCatalogService } from "@/services/tidalCatalogService";
import type { PlaylistDetail, PlaylistEditResult, PlaylistSummary } from "@/types/media";

// TIDAL's limits when a playlist is edited.
const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 500;

const FIELD_CLASS =
  "w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring";

interface PlaylistEditDialogProps {
  playlist: PlaylistDetail;
  isOpen: boolean;
  onClose: () => void;
}

// Name, description and cover of a playlist the user owns, and deleting it.
export function PlaylistEditDialog({ playlist, isOpen, onClose }: PlaylistEditDialogProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState(playlist.title);
  const [description, setDescription] = useState(playlist.description ?? "");
  const [busy, setBusy] = useState<"saving" | "cover" | "deleting" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDeleteArmed, setIsDeleteArmed] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName(playlist.title);
    setDescription(playlist.description ?? "");
    setError(null);
    setIsDeleteArmed(false);
  }, [isOpen, playlist]);

  const suggestionsQuery = useQuery({
    queryKey: ["playlist-cover-suggestions", playlist.id],
    queryFn: () => window.api.getSuggestedPlaylistCovers(playlist.id),
    enabled: isOpen,
    retry: false,
  });

  // The header, the sidebar and Library all show the playlist.
  const refreshPlaylist = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["media-detail", "playlist"] }),
      queryClient.invalidateQueries({ queryKey: ["user-playlists"] }),
      queryClient.invalidateQueries({ queryKey: ["cache-memberships"] }),
    ]);
  };

  const runCoverChange = async (change: Promise<PlaylistEditResult | null>) => {
    setBusy("cover");
    setError(null);
    try {
      const result = await change;
      if (!result) return;
      if (!result.success) {
        setError(
          /access tier|403/i.test(result.error)
            ? "TIDAL does not let this app upload covers (the access level of your developer app). You can change the cover in TIDAL's own app or website."
            : `Could not change the cover: ${result.error}`,
        );
        return;
      }
      await refreshPlaylist();
    } finally {
      setBusy(null);
    }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy("saving");
    setError(null);
    try {
      const result = await window.api.updatePlaylist(playlist.id, name, description);
      if (!result.success) {
        setError(`Could not save: ${result.error}`);
        return;
      }
      await refreshPlaylist();
      onClose();
    } catch (saveError) {
      setError(`Could not save: ${saveError instanceof Error ? saveError.message : String(saveError)}`);
    } finally {
      setBusy(null);
    }
  };

  const deletePlaylist = async () => {
    if (!isDeleteArmed) {
      setIsDeleteArmed(true);
      return;
    }
    setBusy("deleting");
    const result = await tidalCatalogService.deletePlaylist(playlist.id);
    setBusy(null);
    if (!result.success) {
      setError(`Could not delete the playlist: ${result.error}`);
      setIsDeleteArmed(false);
      return;
    }
    queryClient.setQueryData<PlaylistSummary[]>(["user-playlists"], (current) =>
      current?.filter((candidate) => candidate.id !== playlist.id),
    );
    onClose();
    void navigate("/library");
  };

  const cover = playlist.cover ? artworkUrl(playlist.cover, 320) : undefined;
  const suggestions = suggestionsQuery.data ?? [];
  const trimmedName = name.trim();

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && busy === null && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Popup
          data-testid="playlist-edit-dialog"
          className="fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-[34rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border bg-popover text-popover-foreground shadow-lg outline-none"
        >
          <form onSubmit={(event) => void save(event)} className="flex min-h-0 flex-1 flex-col">
            <div className="border-b border-border px-5 py-3">
              <Dialog.Title className="text-sm font-semibold">Edit playlist</Dialog.Title>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
              <div className="flex gap-4">
                <div className="flex shrink-0 flex-col items-center gap-2">
                  {cover ? (
                    <img src={cover} alt="Current cover" className="size-32 rounded-lg object-cover" />
                  ) : (
                    <div className="flex size-32 items-center justify-center rounded-lg bg-muted">
                      <ListMusic className="size-8 text-muted-foreground" aria-hidden />
                    </div>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => void runCoverChange(window.api.uploadPlaylistCover(playlist.id))}
                  >
                    {busy === "cover" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ImageUp className="size-4" aria-hidden />}
                    Change cover…
                  </Button>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-3">
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-muted-foreground">Name</span>
                    <input
                      value={name}
                      maxLength={MAX_NAME_LENGTH}
                      onChange={(event) => setName(event.target.value)}
                      className={cn(FIELD_CLASS, "h-8")}
                      aria-label="Playlist name"
                      required
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="flex justify-between text-muted-foreground">
                      Description
                      <span className="text-xs tabular-nums">
                        {description.length}/{MAX_DESCRIPTION_LENGTH}
                      </span>
                    </span>
                    <textarea
                      value={description}
                      maxLength={MAX_DESCRIPTION_LENGTH}
                      onChange={(event) => setDescription(event.target.value)}
                      rows={4}
                      className={cn(FIELD_CLASS, "resize-none py-1.5")}
                      aria-label="Playlist description"
                    />
                  </label>
                </div>
              </div>

              {suggestions.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Covers TIDAL suggests</p>
                  <div className="flex flex-wrap gap-2">
                    {suggestions.map((suggestion) => (
                      <button
                        key={suggestion.artworkId}
                        type="button"
                        disabled={busy !== null}
                        title="Use this cover"
                        onClick={() => void runCoverChange(window.api.setPlaylistCover(playlist.id, suggestion.artworkId))}
                        className="overflow-hidden rounded-md outline-none hover:ring-2 hover:ring-primary focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <img src={suggestion.imageUrl} alt="" className="size-20 object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
              <Button
                type="button"
                variant={isDeleteArmed ? "destructive" : "ghost"}
                size="sm"
                disabled={busy !== null}
                onBlur={() => setIsDeleteArmed(false)}
                onClick={() => void deletePlaylist()}
              >
                {busy === "deleting" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
                {isDeleteArmed ? "Click again to delete" : "Delete playlist"}
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" disabled={busy !== null} onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={busy !== null || trimmedName === ""}>
                  {busy === "saving" && <Loader2 className="size-4 animate-spin" aria-hidden />}
                  Save
                </Button>
              </div>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
