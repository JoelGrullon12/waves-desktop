import { useQuery } from "@tanstack/react-query";
import { FolderOpen } from "lucide-react";
import { useState } from "react";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { Button } from "@/components/ui/button";
import type { AppDataMoveResult } from "@/types/player";

// Where settings.ini, the database and the encrypted secrets live. Moving
// them restarts the app; the TIDAL sign-in stays where it is.
export function AppDataSection() {
  const infoQuery = useQuery({ queryKey: ["app-data-info"], queryFn: () => window.api.getAppDataInfo() });
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const info = infoQuery.data;

  const handleMove = (result: AppDataMoveResult | null) => {
    if (!result) return;
    setMessage(
      result.success
        ? {
            text: result.usedExistingData
              ? "That folder already has Waves data, which will be used. Restarting…"
              : "Data moved. Restarting…",
            isError: false,
          }
        : { text: result.error, isError: true },
    );
  };

  const openFolder = async () => {
    const result = await window.api.openAppDataFolder();
    if (!result.success) setMessage({ text: result.error ?? "Could not open the folder.", isError: true });
  };

  return (
    <SettingsSection
      title="App data"
      description="Settings (settings.ini, which you can also edit by hand while Waves is closed), the local database and the encrypted credentials are kept in this folder. Moving it restarts Waves."
    >
      {info && (
        <div className="flex flex-col gap-3">
          <code className="break-all rounded-md bg-muted px-2 py-1.5 text-xs" data-testid="app-data-directory">
            {info.directory}
          </code>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void openFolder()}>
              <FolderOpen className="size-4" aria-hidden />
              Open folder
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void window.api.changeAppDataLocation().then(handleMove)}
            >
              Change location…
            </Button>
            {!info.isDefault && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void window.api.useDefaultAppDataLocation().then(handleMove)}
              >
                Move back to {info.defaultDirectory}
              </Button>
            )}
          </div>
          {message && (
            <p role={message.isError ? "alert" : "status"} className={message.isError ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
              {message.text}
            </p>
          )}
        </div>
      )}
    </SettingsSection>
  );
}
