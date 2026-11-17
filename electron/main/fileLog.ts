import fs from "node:fs";
import path from "node:path";
import { format } from "node:util";

// Copies everything the main process prints into `<data folder>/logs/main.log`,
// so a packaged build (which has no terminal) can still be diagnosed: a blank
// window, a crashed page or silent playback leave a trace there.
//
// The file is swapped for a fresh one when it grows past the limit; the
// previous one is kept as main.old.log.

const LOG_FILE = "main.log";
const PREVIOUS_LOG_FILE = "main.old.log";
const MAX_LOG_BYTES = 2 * 1024 * 1024;

let logFilePath: string | null = null;
let writtenBytes = 0;

export function currentLogFile(): string | null {
  return logFilePath;
}

function rotateIfLarge(directory: string): void {
  const filePath = path.join(directory, LOG_FILE);
  try {
    writtenBytes = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
    if (writtenBytes < MAX_LOG_BYTES) return;
    fs.renameSync(filePath, path.join(directory, PREVIOUS_LOG_FILE));
    writtenBytes = 0;
  } catch {
    // A log that can not be rotated keeps growing; it is still useful.
  }
}

function append(level: string, values: unknown[]): void {
  if (!logFilePath) return;
  const line = `${new Date().toISOString()} ${level.padEnd(5)} ${format(...values)}\n`;
  try {
    fs.appendFileSync(logFilePath, line, "utf8");
    writtenBytes += Buffer.byteLength(line);
    if (writtenBytes >= MAX_LOG_BYTES) rotateIfLarge(path.dirname(logFilePath));
  } catch {
    // Never let logging break the app.
  }
}

export function startFileLog(dataDirectory: string): void {
  if (logFilePath) return;
  const directory = path.join(dataDirectory, "logs");
  try {
    fs.mkdirSync(directory, { recursive: true });
  } catch {
    return;
  }
  rotateIfLarge(directory);
  logFilePath = path.join(directory, LOG_FILE);

  for (const level of ["log", "info", "warn", "error"] as const) {
    const original = console[level].bind(console);
    console[level] = (...values: unknown[]) => {
      original(...values);
      append(level, values);
    };
  }
  // Monitors only: Electron keeps its own handling (the error dialog).
  process.on("uncaughtExceptionMonitor", (error) => append("fatal", [error]));
  process.on("unhandledRejection", (reason) => append("error", ["unhandled rejection:", reason]));
}
