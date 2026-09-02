import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve, sep } from "node:path";
import type { CustomThemePack } from "../shared/customConfig";

/**
 * Persists CustomThemePack objects as individual JSON files inside
 * `<userDataDir>/themes/<id>.json`.
 *
 * Unlike OverlayStore, ThemeStore is NOT profile-scoped: one shared
 * `themes/` folder lives directly under `userData`.
 */
export class ThemeStore {
  private readonly dir: string;

  constructor(userDataDir: string) {
    this.dir = join(userDataDir, "themes");

    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Resolves the on-disk path for `id`, rejecting anything that would escape `dir` (e.g. an id containing `..` or a path separator) — same boundary check as OverlayServer.handleRequest. */
  private pathFor(id: string): string {
    const boundary = this.dir.endsWith(sep) ? this.dir : this.dir + sep;
    const filePath = resolve(join(this.dir, `${id}.json`));
    if (!filePath.startsWith(boundary)) {
      throw new Error(`Invalid theme id: ${id}`);
    }
    return filePath;
  }

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  listThemes(): CustomThemePack[] {
    return readdirSync(this.dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        try {
          return JSON.parse(
            readFileSync(join(this.dir, f), "utf-8"),
          ) as CustomThemePack;
        } catch {
          return null;
        }
      })
      .filter((t): t is CustomThemePack => t !== null);
  }

  saveTheme(theme: CustomThemePack): void {
    writeFileSync(
      this.pathFor(theme.id),
      JSON.stringify(theme, null, 2),
      "utf-8",
    );
  }

  deleteTheme(id: string): void {
    const p = this.pathFor(id);
    if (existsSync(p)) rmSync(p);
  }
}
