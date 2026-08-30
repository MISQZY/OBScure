import { net, shell } from "electron";
import { BaseIntegration } from "./types";
import { waitForRedirect } from "../oauth/callbackServer";
import {
  generateCodeChallenge,
  generateCodeVerifier,
  generateState,
} from "../oauth/pkce";

const REDIRECT_PORT = 47891;
const REDIRECT_PATH = "/callback/spotify";
const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}${REDIRECT_PATH}`;
const SCOPES = "user-read-currently-playing user-read-playback-state";
const POLL_INTERVAL_MS = 5000;

const TOKEN_REFRESH_SKEW_MS = 5000;

async function fetchSpotify(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await net.fetch(url, init);
  } catch (error) {
    const cause =
      error instanceof Error && error.cause instanceof Error
        ? error.cause.message
        : String(error);
    throw new Error(`Не удалось связаться со Spotify: ${cause}`);
  }
}

interface SpotifyTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

interface SpotifyCurrentlyPlaying {
  is_playing: boolean;
  item: {
    name: string;
    artists: Array<{ name: string }>;
    album: { images: Array<{ url: string }> };
  } | null;
}

export class SpotifyIntegration extends BaseIntegration {
  private accessToken: string | null = null;
  private accessTokenExpiresAt = 0;
  private lastKey = "";
  private lastLoggedStatus = 0;

  async start(): Promise<void> {
    const clientId = this.config.getSetting<string | null>(
      "spotify.clientId",
      null,
    );
    const refreshToken = this.config.getSecret("spotify.refreshToken");
    if (!clientId || !refreshToken) {
      this.setStatus("disconnected");
      return;
    }

    try {
      await this.refreshAccessToken(clientId, refreshToken);
      this.setStatus("connected");
      this.startPolling(() => this.poll(), POLL_INTERVAL_MS);
    } catch {
      this.setStatus("error");
    }
  }

  stop(): void {
    this.stopPolling();
    this.lastKey = "";
  }

  private async poll(): Promise<void> {
    const clientId = this.config.getSetting<string | null>(
      "spotify.clientId",
      null,
    );
    const refreshToken = this.config.getSecret("spotify.refreshToken");
    if (!clientId || !refreshToken) return;

    try {
      if (
        !this.accessToken ||
        Date.now() >= this.accessTokenExpiresAt - TOKEN_REFRESH_SKEW_MS
      ) {
        await this.refreshAccessToken(clientId, refreshToken);
      }

      const response = await fetchSpotify(
        `https://api.spotify.com/v1/me/player/currently-playing?_=${Date.now()}`,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            "Cache-Control": "no-cache",
          },
        },
      );

      let isPlaying = false;
      let title = "";
      let artist = "";
      let albumArt: string | undefined;
      if (response.status === 200) {
        const body = (await response.json()) as SpotifyCurrentlyPlaying;
        isPlaying = body.is_playing;
        title = body.item?.name ?? "";
        artist = body.item?.artists.map((a) => a.name).join(", ") ?? "";
        albumArt = body.item?.album.images[0]?.url;
      } else {
        if (response.status !== this.lastLoggedStatus) {
          this.lastLoggedStatus = response.status;
          console.error(
            `[spotify] now-playing poll got HTTP ${response.status} instead of 200 — track will stay frozen until this clears`,
          );
        }
        return;
      }
      this.lastLoggedStatus = 0;

      if (!title && !artist) return;

      const key = `${isPlaying}|${title}|${artist}`;
      if (key === this.lastKey) return;
      this.lastKey = key;

      this.eventBus.emit("now-playing", {
        source: "spotify",
        title,
        artist,
        albumArt,
        isPlaying,
      });
    } catch (error) {
      console.error(
        "[spotify] now-playing poll failed:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  async connect(): Promise<void> {
    const clientId = this.config.getSetting<string | null>(
      "spotify.clientId",
      null,
    );
    if (!clientId) {
      throw new Error("Сначала укажи Client ID");
    }

    this.setStatus("connecting");

    const verifier = generateCodeVerifier();
    const challenge = generateCodeChallenge(verifier);
    const state = generateState();

    const authorizeUrl = new URL("https://accounts.spotify.com/authorize");
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");
    authorizeUrl.searchParams.set("code_challenge", challenge);
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("scope", SCOPES);

    const redirectPromise = waitForRedirect({
      port: REDIRECT_PORT,
      path: REDIRECT_PATH,
    });
    await shell.openExternal(authorizeUrl.toString());

    let params: URLSearchParams;
    try {
      params = await redirectPromise;
    } catch (error) {
      this.setStatus("error");
      throw error;
    }

    if (params.get("state") !== state) {
      this.setStatus("error");
      throw new Error("OAuth state не совпадает — возможна подмена запроса");
    }
    const authError = params.get("error");
    if (authError) {
      this.setStatus("error");
      throw new Error(`Spotify отклонил авторизацию: ${authError}`);
    }
    const code = params.get("code");
    if (!code) {
      this.setStatus("error");
      throw new Error("Spotify не вернул код авторизации");
    }

    const tokenResponse = await fetchSpotify(
      "https://accounts.spotify.com/api/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: REDIRECT_URI,
          client_id: clientId,
          code_verifier: verifier,
        }),
      },
    );

    if (!tokenResponse.ok) {
      this.setStatus("error");
      throw new Error(
        `Spotify отклонил обмен токена (${tokenResponse.status})`,
      );
    }

    const tokens = (await tokenResponse.json()) as SpotifyTokenResponse;
    if (!tokens.refresh_token) {
      this.setStatus("error");
      throw new Error("Spotify не выдал refresh token");
    }

    this.accessToken = tokens.access_token;
    this.accessTokenExpiresAt = Date.now() + tokens.expires_in * 1000;
    this.config.setSecret("spotify.refreshToken", tokens.refresh_token);
    this.setStatus("connected");
    this.startPolling(() => this.poll(), POLL_INTERVAL_MS);
  }

  disconnect(): void {
    this.config.deleteSecret("spotify.refreshToken");
    this.accessToken = null;
    this.accessTokenExpiresAt = 0;
    this.setStatus("disconnected");
    this.stop();
  }

  private async refreshAccessToken(
    clientId: string,
    refreshToken: string,
  ): Promise<void> {
    const response = await fetchSpotify(
      "https://accounts.spotify.com/api/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: clientId,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Не удалось обновить токен Spotify (${response.status})`);
    }

    const tokens = (await response.json()) as SpotifyTokenResponse;
    this.accessToken = tokens.access_token;
    this.accessTokenExpiresAt = Date.now() + tokens.expires_in * 1000;
    if (tokens.refresh_token) {
      this.config.setSecret("spotify.refreshToken", tokens.refresh_token);
    }
  }
}
