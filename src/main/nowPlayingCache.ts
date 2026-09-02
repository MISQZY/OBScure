import { net } from "electron";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { NowPlayingPayload } from "../shared/types";

const TITLE_FILE = "title.txt";
const ARTIST_FILE = "artist.txt";
const STATUS_FILE = "status.txt";
const COVER_FILE = "cover";

export class NowPlayingCache {
  private readonly dir: string;

  private readonly onCoverReady?: (payload: NowPlayingPayload) => void;
  private lastKey = "";
  private lastPayload: NowPlayingPayload | null = null;

  private attemptedCoverUrl: string | null = null;
  private cachedCoverDataUri: string | undefined;
  /** Extension of the last `cover.<ext>` file actually written to disk — tracked so writeCoverFile can remove it if a later cover shows up with a different content-type/extension, instead of leaving it behind. */
  private lastCoverExtension: string | null = null;

  constructor(
    baseDir: string,
    onCoverReady?: (payload: NowPlayingPayload) => void,
  ) {
    this.dir = join(baseDir, "now-playing");
    this.onCoverReady = onCoverReady;
  }

  reset(): void {
    this.lastKey = "";
    this.lastPayload = null;
    this.attemptedCoverUrl = null;
    this.cachedCoverDataUri = undefined;
    this.lastCoverExtension = null;
  }

  resolve(payload: NowPlayingPayload): NowPlayingPayload {
    this.ensureDir();

    const key = `${payload.source}|${payload.title}|${payload.artist}|${payload.isPlaying}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      writeFileSync(join(this.dir, TITLE_FILE), payload.title, "utf8");
      writeFileSync(join(this.dir, ARTIST_FILE), payload.artist, "utf8");
      writeFileSync(
        join(this.dir, STATUS_FILE),
        payload.isPlaying ? "Playing" : "Paused",
        "utf8",
      );
    }

    if (!payload.albumArt) {
      this.attemptedCoverUrl = null;
      this.cachedCoverDataUri = undefined;
    } else if (payload.albumArt.startsWith("data:")) {
      this.attemptedCoverUrl = payload.albumArt;
      this.cachedCoverDataUri = payload.albumArt;
      this.writeCoverFile(payload.albumArt);
    } else if (payload.albumArt !== this.attemptedCoverUrl) {
      this.attemptedCoverUrl = payload.albumArt;
      void this.downloadCover(payload.albumArt);
    }

    const resolved = { ...payload, albumArt: this.cachedCoverDataUri };
    this.lastPayload = resolved;
    return resolved;
  }

  private async downloadCover(url: string): Promise<void> {
    try {
      const response = await net.fetch(url);
      if (!response.ok) return;
      const buffer = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get("content-type") || "image/jpeg";
      this.writeCoverFile(
        `data:${contentType};base64,${buffer.toString("base64")}`,
      );

      if (this.attemptedCoverUrl === url && this.lastPayload) {
        this.lastPayload = {
          ...this.lastPayload,
          albumArt: this.cachedCoverDataUri,
        };
        this.onCoverReady?.(this.lastPayload);
      }
    } catch {
      // Keep whatever cover we already had rather than blank it on a failed download.
    }
  }

  private writeCoverFile(dataUri: string): void {
    const match = /^data:([^;]+);base64,(.+)$/.exec(dataUri);
    if (!match) return;
    const [, contentType, base64] = match;
    const extension = contentType.split("/")[1]?.split(";")[0] || "jpg";

    if (this.lastCoverExtension && this.lastCoverExtension !== extension) {
      const stalePath = join(this.dir, `${COVER_FILE}.${this.lastCoverExtension}`);
      if (existsSync(stalePath)) {
        try {
          unlinkSync(stalePath);
        } catch {
          /* best-effort cleanup */
        }
      }
    }

    writeFileSync(
      join(this.dir, `${COVER_FILE}.${extension}`),
      Buffer.from(base64, "base64"),
    );
    this.lastCoverExtension = extension;
    this.cachedCoverDataUri = dataUri;
  }

  private ensureDir(): void {
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
  }
}
