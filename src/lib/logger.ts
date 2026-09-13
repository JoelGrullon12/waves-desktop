import { invoke } from "@tauri-apps/api/core";

// Forwards frontend diagnostics to the Rust process (cmd_log), which prints
// them to stdout/stderr of `cargo tauri dev`. WebKitGTK does not forward
// webview console output to the terminal, so without this there is no way to
// see what the TIDAL Web SDK is doing on Linux.
export function logToTerminal(level: "info" | "error", message: string): void {
  void invoke("cmd_log", { level, message }).catch(() => {});
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "object" && error != null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}