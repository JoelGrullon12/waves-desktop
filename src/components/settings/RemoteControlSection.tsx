import { useQuery, useQueryClient } from "@tanstack/react-query";
import qrcode from "qrcode-generator";
import { useMemo, useState, type FormEvent } from "react";
import { SETTINGS_INPUT_CLASS } from "@/components/settings/SettingsField";
import { Button } from "@/components/ui/button";
import type { RemoteControlInfo } from "@/types/player";

const QUERY_KEY = ["remote-control-info"];
const QR_QUIET_ZONE_MODULES = 4;

// QR code drawn as SVG rectangles, always dark on white so phones read it in
// either theme.
function QrCode({ text }: { text: string }) {
  const { size, darkModules } = useMemo(() => {
    const code = qrcode(0, "M");
    code.addData(text);
    code.make();
    const moduleCount = code.getModuleCount();
    const dark: Array<{ row: number; column: number }> = [];
    for (let row = 0; row < moduleCount; row++) {
      for (let column = 0; column < moduleCount; column++) {
        if (code.isDark(row, column)) dark.push({ row, column });
      }
    }
    return { size: moduleCount + QR_QUIET_ZONE_MODULES * 2, darkModules: dark };
  }, [text]);

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="QR code to open the remote on your phone"
      className="size-44 rounded-lg"
      shapeRendering="crispEdges"
      data-testid="remote-qr"
    >
      <rect width={size} height={size} fill="#ffffff" />
      {darkModules.map(({ row, column }) => (
        <rect
          key={`${row}-${column}`}
          x={column + QR_QUIET_ZONE_MODULES}
          y={row + QR_QUIET_ZONE_MODULES}
          width={1}
          height={1}
          fill="#000000"
        />
      ))}
    </svg>
  );
}

const MINIMUM_PORT = 1024;
const MAXIMUM_PORT = 65535;

// The port can be changed unless REMOTE_CONTROL_WEBSOCKET_PORT in .env sets it.
function PortSetting({ info, onSave }: { info: RemoteControlInfo; onSave: (port: number) => Promise<void> }) {
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? String(info.port);
  const port = Number(value);
  const isValid = Number.isInteger(port) && port >= MINIMUM_PORT && port <= MAXIMUM_PORT;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!isValid || port === info.port) return;
    await onSave(port);
    setDraft(null);
  };

  return (
    <form onSubmit={(event) => void save(event)} className="flex flex-wrap items-center gap-2 text-sm">
      <label className="flex items-center gap-2">
        Port
        <input
          type="number"
          min={MINIMUM_PORT}
          max={MAXIMUM_PORT}
          value={value}
          disabled={info.isPortFromEnvironment}
          aria-label="Remote port"
          onChange={(event) => setDraft(event.target.value)}
          className={`${SETTINGS_INPUT_CLASS} w-24`}
        />
      </label>
      {draft !== null && port !== info.port && (
        <Button type="submit" size="sm" variant="outline" disabled={!isValid}>
          Save port
        </Button>
      )}
      {info.isPortFromEnvironment && (
        <span className="text-muted-foreground">Set by REMOTE_CONTROL_WEBSOCKET_PORT in the .env file.</span>
      )}
      {!isValid && <span className="text-destructive">Use a number from 1024 to 65535.</span>}
    </form>
  );
}

// Turns the phone remote on and off and shows the QR code that pairs a phone.
export function RemoteControlSection() {
  const queryClient = useQueryClient();
  const infoQuery = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => window.api.getRemoteControlInfo(),
    refetchInterval: 5000,
  });
  const info = infoQuery.data;
  const apply = async (change: Promise<RemoteControlInfo>) =>
    queryClient.setQueryData(QUERY_KEY, await change);

  return (
    <section className="rounded-lg border p-5">
      <h2 className="text-base font-semibold">Phone remote</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Control playback from your phone's browser, with nothing to install. The phone must be on
        the same network as this computer.
      </p>
      {info && (
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={info.isEnabled ? "outline" : "default"}
              onClick={() => void apply(window.api.setRemoteControlEnabled(!info.isEnabled))}
            >
              {info.isEnabled ? "Turn off" : "Turn on"}
            </Button>
            {info.isRunning && (
              <span className="text-sm text-muted-foreground" data-testid="remote-status">
                On, port {info.port} ·{" "}
                {info.connectedClients === 1
                  ? "1 phone connected"
                  : `${info.connectedClients} phones connected`}
              </span>
            )}
          </div>
          <PortSetting
            info={info}
            onSave={async (port) => {
              await apply(window.api.setRemoteControlPort(port));
            }}
          />
          {info.error && (
            <p role="alert" className="text-sm text-destructive">
              Could not start the remote: {info.error}
            </p>
          )}
          {info.isRunning && info.url && (
            <div className="flex flex-wrap items-start gap-4">
              <QrCode text={info.url} />
              <div className="min-w-0 flex-1 text-sm">
                <p>Scan the code with your phone's camera.</p>
                <p className="mt-2 text-muted-foreground">
                  If the page does not open, the computer's firewall may be blocking port{" "}
                  {info.port}.
                </p>
                <p className="mt-2 text-muted-foreground">
                  Anyone with this code can control playback. Make a new one to disconnect every
                  phone paired so far.
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={() => void apply(window.api.regenerateRemoteControlToken())}
                >
                  Make a new code
                </Button>
              </div>
            </div>
          )}
          {info.isRunning && !info.url && (
            <p className="text-sm text-muted-foreground">
              This computer is not connected to a network right now.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
