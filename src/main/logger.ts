import { app } from "electron";
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

const LATEST_LOG_NAME = "latest.log";

let logDir: string | null = null;

function getLogDir(): string {
  logDir ??= (() => {
    const dir = join(app.getPath("userData"), "logs");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
  })();
  return logDir;
}

/** Filesystem-safe stand-in for "date:time" — Windows paths can't contain ':'. */
function timestampForFilename(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
  );
}

/**
 * Archives the previous run's latest.log (named after its own last-write
 * time) and starts a fresh one for this run. Call once at startup, before
 * any log() calls — logging still works if this is skipped, it just won't
 * have rotated the prior run's file.
 */
export function initLogger(): void {
  const dir = getLogDir();
  const latestPath = join(dir, LATEST_LOG_NAME);
  if (!existsSync(latestPath)) return;

  try {
    const mtime = statSync(latestPath).mtime;
    let archivePath = join(dir, `log_${timestampForFilename(mtime)}.log`);
    let suffix = 1;
    while (existsSync(archivePath)) {
      archivePath = join(dir, `log_${timestampForFilename(mtime)}_${suffix}.log`);
      suffix += 1;
    }
    renameSync(latestPath, archivePath);
  } catch {
    // Rotation failed (e.g. file in use) — keep appending to the existing latest.log.
  }
}

function errorDetail(error: unknown): string {
  if (error instanceof Error) return ` — ${error.message}${error.stack ? `\n${error.stack}` : ""}`;
  if (error === undefined) return "";
  return ` — ${String(error)}`;
}

function write(level: LogLevel, system: string, message: string): void {
  const line = `[${new Date().toISOString()}] [${level}] [${system}] ${message}`;

  (level === "ERROR" || level === "WARN" ? console.error : console.log)(line);
  try {
    appendFileSync(join(getLogDir(), LATEST_LOG_NAME), `${line}\n`, "utf8");
  } catch {
    // Best-effort — a logging failure shouldn't break the caller.
  }
}

export function logDebug(system: string, message: string): void {
  write("DEBUG", system, message);
}

export function logInfo(system: string, message: string): void {
  write("INFO", system, message);
}

export function logWarn(system: string, message: string, error?: unknown): void {
  write("WARN", system, message + errorDetail(error));
}

export function logError(system: string, message: string, error?: unknown): void {
  write("ERROR", system, message + errorDetail(error));
}
