import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { networkInterfaces } from "node:os";
import { WebSocketServer, type WebSocket } from "ws";
import { readAppSecrets, updateAppSecrets } from "./appSecrets";
import type { PreferencesFile } from "./preferencesFile";
import { getPreferences } from "./preferencesRepository";
import { REMOTE_CONTROL_PAGE } from "./remoteControlPage";
import {
  EMPTY_REMOTE_STATE,
  isPairingTokenValid,
  parseRemoteCommand,
  sanitizeRemoteState,
  type RemoteCommand,
  type RemoteState,
} from "./remoteProtocol";
import { handleTrusted } from "./secureIpc";
import { requireNetworkPort } from "./validation";

// Phone remote: a small web page served by the app on the local network. The
// phone opens it by scanning a QR code (no app to install) and sends play /
// pause / next / previous / volume / seek over a WebSocket; the app pushes the
// current track and progress back.
//
// It is off until the user turns it on in Settings. Every request must carry
// the pairing token (it is inside the QR code), so being on the same Wi-Fi is
// not enough to control the player.

const DEFAULT_PORT = 47836;
const ENABLED_PREFERENCE = "remote.enabled";
const PORT_PREFERENCE = "remote.port";
const PAIRING_TOKEN_BYTES = 24;
const MAX_CLIENTS = 8;

export const REMOTE_COMMAND_CHANNEL = "remote:command";

export interface RemoteControlInfo {
  isEnabled: boolean;
  isRunning: boolean;
  port: number;
  // REMOTE_CONTROL_WEBSOCKET_PORT in .env decides the port; Settings can not.
  isPortFromEnvironment: boolean;
  // Address a phone on the same network opens; null when no network is up.
  url: string | null;
  connectedClients: number;
  error: string | null;
}

type CommandListener = (command: RemoteCommand) => void;

function parsePort(value: string | null | undefined): number | null {
  const port = Number.parseInt(value ?? "", 10);
  return Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : null;
}

// REMOTE_CONTROL_WEBSOCKET_PORT in .env (development) wins over the port saved
// in Settings.
function environmentPort(): number | null {
  return parsePort(process.env["REMOTE_CONTROL_WEBSOCKET_PORT"]);
}

// First private IPv4 address of this machine (the one a phone on the same
// Wi-Fi can reach).
function localNetworkAddress(): string | null {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal) return address.address;
    }
  }
  return null;
}

export class RemoteControl {
  private server: Server | null = null;
  private socketServer: WebSocketServer | null = null;
  private readonly clients = new Set<WebSocket>();
  private state: RemoteState = EMPTY_REMOTE_STATE;
  private lastError: string | null = null;
  private commandListener: CommandListener | null = null;
  constructor(private readonly preferences: PreferencesFile) {}

  private get port(): number {
    return environmentPort() ?? parsePort(this.preferences.get(PORT_PREFERENCE)) ?? DEFAULT_PORT;
  }

  // Saves the port and, when the remote is running, restarts it there (paired
  // phones have to scan the new code).
  async setPort(port: number): Promise<RemoteControlInfo> {
    this.preferences.set(PORT_PREFERENCE, String(port));
    if (this.server) {
      await this.stop();
      await this.start();
    }
    return this.getInfo();
  }

  onCommand(listener: CommandListener): void {
    this.commandListener = listener;
  }

  // Starts the server if the user had left the remote turned on.
  async restore(): Promise<void> {
    if (this.isEnabled()) await this.start();
  }

  async setEnabled(enabled: boolean): Promise<RemoteControlInfo> {
    this.preferences.set(ENABLED_PREFERENCE, String(enabled));
    if (enabled) await this.start();
    else await this.stop();
    return this.getInfo();
  }

  // A new token cuts off every phone paired with the old one.
  async regenerateToken(): Promise<RemoteControlInfo> {
    updateAppSecrets({ remotePairingToken: randomBytes(PAIRING_TOKEN_BYTES).toString("hex") });
    for (const client of this.clients) client.close();
    return this.getInfo();
  }

  publishState(state: RemoteState): void {
    this.state = state;
    const message = JSON.stringify({ type: "state_sync", state });
    for (const client of this.clients) client.send(message);
  }

  getInfo(): RemoteControlInfo {
    const address = localNetworkAddress();
    return {
      isEnabled: this.isEnabled(),
      isRunning: this.server !== null,
      port: this.port,
      isPortFromEnvironment: environmentPort() !== null,
      url: address ? `http://${address}:${this.port}/?token=${this.pairingToken()}` : null,
      connectedClients: this.clients.size,
      error: this.lastError,
    };
  }

  async stop(): Promise<void> {
    for (const client of this.clients) client.terminate();
    this.clients.clear();
    this.socketServer?.close();
    this.socketServer = null;
    const server = this.server;
    this.server = null;
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  private isEnabled(): boolean {
    return this.preferences.get(ENABLED_PREFERENCE) === "true";
  }

  private pairingToken(): string {
    const stored = readAppSecrets().remotePairingToken;
    if (stored) return stored;
    const created = randomBytes(PAIRING_TOKEN_BYTES).toString("hex");
    updateAppSecrets({ remotePairingToken: created });
    return created;
  }

  private tokenOf(requestUrl: string | undefined): string | null {
    try {
      return new URL(requestUrl ?? "", "http://remote.local").searchParams.get("token");
    } catch {
      return null;
    }
  }

  private async start(): Promise<void> {
    if (this.server) return;
    const server = createServer((request, response) => {
      const path = new URL(request.url ?? "/", "http://remote.local").pathname;
      if (request.method !== "GET" || path !== "/") {
        response.writeHead(404).end();
        return;
      }
      if (!isPairingTokenValid(this.tokenOf(request.url), this.pairingToken())) {
        response.writeHead(403, { "Content-Type": "text/plain" }).end("Scan the QR code in Waves again.");
        return;
      }
      response
        .writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          // The page only runs its own inline script and talks to this server.
          "Content-Security-Policy":
            "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src https:; connect-src 'self' ws: wss:",
          "Referrer-Policy": "no-referrer",
        })
        .end(REMOTE_CONTROL_PAGE);
    });
    const socketServer = new WebSocketServer({ noServer: true, maxPayload: 1024 });
    server.on("upgrade", (request, socket, head) => {
      const path = new URL(request.url ?? "/", "http://remote.local").pathname;
      const isAllowed =
        path === "/ws" &&
        this.clients.size < MAX_CLIENTS &&
        isPairingTokenValid(this.tokenOf(request.url), this.pairingToken());
      if (!isAllowed) {
        socket.destroy();
        return;
      }
      socketServer.handleUpgrade(request, socket, head, (client) => this.accept(client));
    });

    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(this.port, "0.0.0.0", () => resolve());
      });
      this.server = server;
      this.socketServer = socketServer;
      this.lastError = null;
      console.info(`remote-control: listening on port ${this.port}`);
    } catch (error) {
      socketServer.close();
      this.lastError = error instanceof Error ? error.message : String(error);
      console.error(`remote-control: could not start: ${this.lastError}`);
    }
  }

  private accept(client: WebSocket): void {
    this.clients.add(client);
    client.send(JSON.stringify({ type: "state_sync", state: this.state }));
    client.on("message", (data) => {
      const command = parseRemoteCommand(data.toString());
      if (command) this.commandListener?.(command);
    });
    client.on("close", () => this.clients.delete(client));
    client.on("error", () => this.clients.delete(client));
  }
}

let remoteControl: RemoteControl | null = null;

export function getRemoteControl(): RemoteControl {
  remoteControl ??= new RemoteControl(getPreferences());
  return remoteControl;
}

export function registerRemoteControlHandlers(): void {
  handleTrusted("remote:get-info", () => getRemoteControl().getInfo());
  handleTrusted("remote:set-enabled", (_event, enabled) =>
    getRemoteControl().setEnabled(enabled === true),
  );
  handleTrusted("remote:set-port", (_event, port) => getRemoteControl().setPort(requireNetworkPort(port)));
  handleTrusted("remote:regenerate-token", () => getRemoteControl().regenerateToken());
  handleTrusted("remote:publish-state", (_event, state) =>
    getRemoteControl().publishState(sanitizeRemoteState(state)),
  );
}
