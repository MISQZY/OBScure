import { app } from "electron";
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";

const MAX_LOG_BYTES = 2 * 1024 * 1024;

let logFilePath: string | null = null;

function getLogFilePath(): string {
  logFilePath ??= (() => {
    const dir = join(app.getPath("userData"), "logs");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return join(dir, "main.log");
  })();
  return logFilePath;
}

function rotateIfNeeded(path: string): void {
  try {
    if (statSync(path).size > MAX_LOG_BYTES) renameSync(path, `${path}.old`);
  } catch {
    // Nothing to rotate yet.
  }
}

/** Appends to <userData>/logs/main.log so integration failures survive a packaged app's invisible console — send this file when debugging a report. */
export function logError(scope: string, message: string, error?: unknown): void {
  const detail =
    error instanceof Error
      ? `${error.message}\n${error.stack ?? ""}`
      : error !== undefined
        ? String(error)
        : "";
  const line = `[${new Date().toISOString()}] [${scope}] ${message}${detail ? ` — ${detail}` : ""}\n`;

  console.error(line.trim());
  try {
    const path = getLogFilePath();
    rotateIfNeeded(path);
    appendFileSync(path, line, "utf8");
  } catch {
    // Best-effort — a logging failure shouldn't break the caller.
  }
}
