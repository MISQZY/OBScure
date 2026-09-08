import { renameSync, writeFileSync } from "node:fs";

/**
 * Writes to a sibling temp file then renames it over the target. The rename
 * is atomic on both Windows and POSIX, so a crash or power loss mid-write
 * can never leave a truncated/partial file at `filePath` — readers either
 * see the old content or the fully-written new content, never a corrupt mix.
 */
export function writeFileAtomic(filePath: string, data: string, encoding: BufferEncoding = "utf-8"): void {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tempPath, data, encoding);
  renameSync(tempPath, filePath);
}
