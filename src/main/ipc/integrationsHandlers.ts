import { ipcMain } from "electron";
import type { SpotifyIntegration } from "../integrations/spotify";
import type { WindowsMediaIntegration } from "../integrations/windowsMedia";
import type { TwitchIntegration } from "../integrations/twitch";
import type { YoutubeIntegration } from "../integrations/youtube";
import type { NowPlayingCache } from "../nowPlayingCache";
import type {
  ConnectResult,
  IntegrationKey,
  IntegrationsStatusMap,
  NowPlayingPayload,
  TwitchChannelStats,
  TwitchCustomReward,
} from "../../shared/types";

interface Integrations {
  spotify: SpotifyIntegration;
  windowsMedia: WindowsMediaIntegration;
  twitch: TwitchIntegration;
  youtube: YoutubeIntegration;
}

interface IntegrationsHandlersDeps {
  integrations: () => Integrations;
  getEffectiveNowPlaying: () => NowPlayingPayload | null;
  nowPlayingFileCache: NowPlayingCache;
}

export function registerIntegrationsHandlers(
  deps: IntegrationsHandlersDeps,
): void {
  const { integrations, getEffectiveNowPlaying, nowPlayingFileCache } = deps;

  ipcMain.handle("integrations:status", (): IntegrationsStatusMap => ({
    spotify: integrations().spotify.getStatus(),
    windowsMedia: integrations().windowsMedia.getStatus(),
    twitch: integrations().twitch.getStatus(),
    youtube: integrations().youtube.getStatus(),
  }));

  ipcMain.handle(
    "integrations:twitch:getRewards",
    async (): Promise<TwitchCustomReward[]> => {
      try {
        return await integrations().twitch.getCustomRewards();
      } catch {
        return [];
      }
    },
  );

  ipcMain.handle(
    "integrations:twitch:getStats",
    async (): Promise<TwitchChannelStats | null> => {
      try {
        return await integrations().twitch.getChannelStats();
      } catch {
        return null;
      }
    },
  );

  ipcMain.handle("nowPlaying:get", (): NowPlayingPayload | null => {
    const effective = getEffectiveNowPlaying();
    return effective ? nowPlayingFileCache.resolve(effective) : null;
  });

  ipcMain.handle(
    "integrations:connect",
    async (_event, key: IntegrationKey): Promise<ConnectResult> => {
      try {
        await integrations()[key].connect();
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );

  ipcMain.handle(
    "integrations:disconnect",
    async (_event, key: IntegrationKey) => {
      await integrations()[key].disconnect();
    },
  );
}
