import { ipcMain, type IpcMainInvokeEvent } from "electron";
import { isTrustedSenderUrl, type TrustedRenderer } from "./validation";

// Every IPC handler goes through here so a page other than the app's own
// renderer (e.g. content that ends up in a frame) can never reach the main
// process, which holds the credentials.

let trustedRenderer: TrustedRenderer = { developmentOrigin: null };

export function configureTrustedRenderer(developmentRenderUrl: string | undefined): void {
  trustedRenderer = {
    developmentOrigin: developmentRenderUrl ? new URL(developmentRenderUrl).origin : null,
  };
}

// Handlers receive `unknown` arguments on purpose: each one must validate what
// it uses (see validation.ts) instead of trusting the renderer's types.
export function handleTrusted(
  channel: string,
  listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown,
): void {
  ipcMain.handle(channel, (event, ...args: unknown[]) => {
    const senderUrl = event.senderFrame?.url ?? "";
    if (!isTrustedSenderUrl(senderUrl, trustedRenderer)) {
      throw new Error(`Blocked IPC call to "${channel}" from an untrusted sender.`);
    }
    return listener(event, ...args);
  });
}
