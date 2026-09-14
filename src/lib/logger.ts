// Forwards frontend diagnostics straight to the DevTools console. Chromium
// forwards console output to the Electron terminal with --enable-logging, so
// playback diagnostics remain visible during development.
export function logToTerminal(level: "info" | "error", message: string): void {
  if (level === "error") {
    console.error(message);
  } else {
    console.info(message);
  }
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