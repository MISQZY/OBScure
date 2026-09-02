import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { WebSocket, WebSocketServer } from "ws";
import { logError } from "./logger";
import type { EventBus } from "./eventBus";
import type {
  AppEvents,
  CustomOverlay,
  GlobalVariable,
  NowPlayingPayload,
  OverlayAddress,
  OverlayUrls,
  RandomStatePayload,
  RouletteStatePayload,
  TwitchChannelStats,
} from "../shared/types";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
};

interface OverlayServerOptions extends OverlayAddress {
  eventBus: EventBus;

  overlaysDir: string;

  customSoundsDir: string;

  customImagesDir: string;
  initialCustomOverlays?: CustomOverlay[];
  initialGlobalVariables?: GlobalVariable[];
}

const OVERLAYS_PREFIX = "/overlays";

const CUSTOM_SOUNDS_PREFIX = `${OVERLAYS_PREFIX}/custom-sounds/`;

const CUSTOM_IMAGES_PREFIX = `${OVERLAYS_PREFIX}/custom-images/`;

export class OverlayServer {
  private host: string;
  private port: number;
  private readonly eventBus: EventBus;
  private readonly overlaysDir: string;
  private readonly customSoundsDir: string;
  private readonly customImagesDir: string;

  private customOverlays: Map<string, CustomOverlay> = new Map();
  private server: Server | null = null;
  private wss: WebSocketServer | null = null;

  private latestNowPlaying: NowPlayingPayload | null = null;

  // Snapshot-for-late-joiners pattern — see docs/main-process.md ("Overlay Server").
  private latestRouletteState: RouletteStatePayload | null = null;
  private latestRandomState: RandomStatePayload | null = null;
  private latestGlobalVariables: GlobalVariable[] = [];
  private latestTwitchStats: TwitchChannelStats | null = null;

  constructor(options: OverlayServerOptions) {
    this.host = options.host;
    this.port = options.port;
    this.eventBus = options.eventBus;
    this.overlaysDir = options.overlaysDir;
    this.customSoundsDir = options.customSoundsDir;
    this.customImagesDir = options.customImagesDir;
    this.customOverlays = new Map(
      (options.initialCustomOverlays ?? []).map((overlay) => [
        overlay.urlKey,
        overlay,
      ]),
    );
    this.latestGlobalVariables = options.initialGlobalVariables ?? [];

    this.eventBus.on("alert", (payload) => this.broadcast("alert", payload));
    this.eventBus.on("roulette-state", (payload) => {
      this.latestRouletteState = payload;
      this.broadcast("roulette-state", payload);
    });
    this.eventBus.on("random-state", (payload) => {
      this.latestRandomState = payload;
      this.broadcast("random-state", payload);
    });
  }

  pushNowPlaying(payload: NowPlayingPayload | null): void {
    this.latestNowPlaying = payload;
    this.broadcast("now-playing", payload);
  }

  /** Called on every add/edit/delete from the "Данные → Переменные" page (see registerCustomPackHandlers' own `onSet` in ipc/overlayHandlers.ts) — pushes the full registry to any already-open OBS Browser Source via the same live-broadcast pattern Random/Roulette use, and updates the late-joiner snapshot a page opened/reloaded afterward reads via GET /overlays/config/global-variables.json. */
  setGlobalVariables(variables: GlobalVariable[]): void {
    this.latestGlobalVariables = variables;
    this.broadcast("global-variables", variables);
  }

  /** Called on every periodic poll from TwitchIntegration (see its own pollStats) while connected, and with `null` on disconnect/profile switch — pushes to any already-open OBS Browser Source via the same live-broadcast pattern setGlobalVariables uses, and updates the late-joiner snapshot a page opened/reloaded afterward reads via GET /overlays/config/twitch-stats.json. */
  pushTwitchStats(stats: TwitchChannelStats | null): void {
    this.latestTwitchStats = stats;
    this.broadcast("twitch-stats", stats);
  }

  setCustomOverlays(overlays: CustomOverlay[]): void {
    this.customOverlays = new Map(
      overlays.map((overlay) => [overlay.urlKey, overlay]),
    );
    this.broadcast("custom-overlay-config", overlays);
  }

  testCustomOverlay(overlay: CustomOverlay): void {
    this.customOverlays.set(overlay.urlKey, overlay);
    this.broadcast("custom-overlay-config", [...this.customOverlays.values()]);
    this.broadcast("custom-overlay-trigger", { urlKey: overlay.urlKey });
  }

  async start(): Promise<void> {
    this.server = createServer((req, res) => {
      void this.handleRequest(req, res);
    });
    this.wss = new WebSocketServer({
      server: this.server,
      path: "/ws",

      verifyClient: ({ origin }: { origin?: string }) => {
        if (!origin) return true;
        const allowed = `http://${this.host}:${this.port}`;
        return (
          origin === allowed ||
          origin === `http://127.0.0.1:${this.port}` ||
          origin === `http://localhost:${this.port}`
        );
      },
    });

    await new Promise<void>((resolvePromise, rejectPromise) => {
      this.server?.once("error", rejectPromise);
      this.server?.listen(this.port, this.host, () => resolvePromise());
    });
  }

  stop(): void {
    this.wss?.close();
    this.server?.close();
    this.wss = null;
    this.server = null;
  }

  async restart(address: Partial<OverlayAddress>): Promise<void> {
    this.stop();
    if (address.host !== undefined) this.host = address.host;
    if (address.port !== undefined) this.port = address.port;
    await this.start();
  }

  getOverlayUrls(): OverlayUrls {
    return {
      customBase: `http://${this.host}:${this.port}${OVERLAYS_PREFIX}`,
      host: this.host,
      port: this.port,
    };
  }

  private broadcast(type: keyof AppEvents, payload: unknown): void {
    const message = JSON.stringify({ type, payload });
    this.wss?.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) client.send(message);
    });
  }

  private buildOverlayCsp(): string {
    const self = `http://${this.host}:${this.port}`;
    return [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      // http:/https: so an Image/Video node's own URL field — which
      // explicitly invites any external link — actually renders once this
      // page is loaded as an OBS Browser Source, instead of the request
      // getting silently dropped by CSP with nothing visible in OBS itself.
      `img-src 'self' data: http: https:`,
      `connect-src 'self' ws://${this.host}:${this.port}`,
      `media-src 'self' ${self} http: https:`,
    ].join("; ");
  }

  private async handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const url = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "localhost"}`,
    );
    const pathname =
      url.pathname === "/" ||
      url.pathname === OVERLAYS_PREFIX ||
      url.pathname === `${OVERLAYS_PREFIX}/`
        ? `${OVERLAYS_PREFIX}/custom.html`
        : url.pathname;

    if (pathname === `${OVERLAYS_PREFIX}/config/custom.json`) {
      const key = url.searchParams.get("key");
      const overlay = key ? (this.customOverlays.get(key) ?? null) : null;
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(overlay));
      return;
    }

    if (pathname === `${OVERLAYS_PREFIX}/config/now-playing.json`) {
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(this.latestNowPlaying));
      return;
    }

    if (pathname === `${OVERLAYS_PREFIX}/config/roulette-state.json`) {
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(this.latestRouletteState));
      return;
    }

    if (pathname === `${OVERLAYS_PREFIX}/config/random-state.json`) {
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(this.latestRandomState));
      return;
    }

    if (pathname === `${OVERLAYS_PREFIX}/config/global-variables.json`) {
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(this.latestGlobalVariables));
      return;
    }

    if (pathname === `${OVERLAYS_PREFIX}/config/twitch-stats.json`) {
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(this.latestTwitchStats));
      return;
    }

    if (!pathname.startsWith(`${OVERLAYS_PREFIX}/`)) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const isCustomSound = pathname.startsWith(CUSTOM_SOUNDS_PREFIX);
    const isCustomImage = pathname.startsWith(CUSTOM_IMAGES_PREFIX);
    const rootDir = isCustomSound
      ? this.customSoundsDir
      : isCustomImage
        ? this.customImagesDir
        : this.overlaysDir;
    const relativePath = isCustomSound
      ? pathname.slice(CUSTOM_SOUNDS_PREFIX.length)
      : isCustomImage
        ? pathname.slice(CUSTOM_IMAGES_PREFIX.length)
        : pathname.slice(OVERLAYS_PREFIX.length);

    const isCustomScenePage =
      !isCustomSound &&
      !isCustomImage &&
      /^\/overlays\/[^/]+\.html$/.test(pathname);
    const filePath = isCustomScenePage
      ? normalize(join(this.overlaysDir, "custom.html"))
      : normalize(join(rootDir, relativePath));

    const safeBoundary = rootDir.endsWith(sep) ? rootDir : rootDir + sep;
    if (!filePath.startsWith(safeBoundary) || !existsSync(filePath)) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    try {
      const contentType =
        MIME_TYPES[extname(filePath)] ?? "application/octet-stream";

      const headers: Record<string, string> = {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
      };

      if (contentType.startsWith("text/html")) {
        headers["Content-Security-Policy"] = this.buildOverlayCsp();
      }

      const isBinary =
        contentType.startsWith("image/") || contentType.startsWith("audio/");
      if (isBinary) {
        res.writeHead(200, headers);
        createReadStream(filePath).pipe(res);
      } else {
        const data = await readFile(filePath);
        res.writeHead(200, headers);
        res.end(data);
      }
    } catch (error) {
      logError("overlayServer", `failed to serve ${pathname}`, error);
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Internal error");
    }
  }
}
