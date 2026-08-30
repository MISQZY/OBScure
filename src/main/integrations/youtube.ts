import { net, shell } from "electron";
import { BaseIntegration } from "./types";
import { waitForRedirect } from "../oauth/callbackServer";
import { generateState } from "../oauth/pkce";

const REDIRECT_PORT = 47891;
const REDIRECT_PATH = "/callback/youtube";
const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}${REDIRECT_PATH}`;
const SCOPES = "https://www.googleapis.com/auth/youtube.readonly";

async function fetchYoutube(
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
    throw new Error(`Не удалось связаться с YouTube: ${cause}`);
  }
}

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

export class YoutubeIntegration extends BaseIntegration {
  private accessToken: string | null = null;
  private accessTokenExpiresAt = 0;

  async start(): Promise<void> {
    const clientId = this.config.getSetting<string | null>(
      "youtube.clientId",
      null,
    );
    const clientSecret = this.config.getSetting<string | null>(
      "youtube.clientSecret",
      null,
    );
    const refreshToken = this.config.getSecret("youtube.refreshToken");
    if (!clientId || !clientSecret || !refreshToken) {
      this.setStatus("disconnected");
      return;
    }

    try {
      await this.refreshAccessToken(clientId, clientSecret, refreshToken);
      this.setStatus("connected");
    } catch {
      this.setStatus("error");
    }
  }

  stop(): void {}

  async connect(): Promise<void> {
    const clientId = this.config.getSetting<string | null>(
      "youtube.clientId",
      null,
    );
    const clientSecret = this.config.getSetting<string | null>(
      "youtube.clientSecret",
      null,
    );
    if (!clientId || !clientSecret) {
      throw new Error("Сначала укажи Client ID и Client Secret");
    }

    this.setStatus("connecting");
    const state = generateState();

    const authorizeUrl = new URL(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("scope", SCOPES);
    authorizeUrl.searchParams.set("access_type", "offline");
    authorizeUrl.searchParams.set("prompt", "consent");
    authorizeUrl.searchParams.set("state", state);

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
      throw new Error(`Google отклонил авторизацию: ${authError}`);
    }
    const code = params.get("code");
    if (!code) {
      this.setStatus("error");
      throw new Error("Google не вернул код авторизации");
    }

    const tokenResponse = await fetchYoutube(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: REDIRECT_URI,
          client_id: clientId,
          client_secret: clientSecret,
        }),
      },
    );

    if (!tokenResponse.ok) {
      this.setStatus("error");
      throw new Error(`Google отклонил обмен токена (${tokenResponse.status})`);
    }

    const tokens = (await tokenResponse.json()) as GoogleTokenResponse;
    if (!tokens.refresh_token) {
      this.setStatus("error");
      throw new Error(
        "Google не выдал refresh token — отзови доступ приложению в аккаунте Google и попробуй снова",
      );
    }

    this.accessToken = tokens.access_token;
    this.accessTokenExpiresAt = Date.now() + tokens.expires_in * 1000;
    this.config.setSecret("youtube.refreshToken", tokens.refresh_token);
    this.setStatus("connected");
  }

  disconnect(): void {
    this.config.deleteSecret("youtube.refreshToken");
    this.accessToken = null;
    this.accessTokenExpiresAt = 0;
    this.setStatus("disconnected");
    this.stop();
  }

  private async refreshAccessToken(
    clientId: string,
    clientSecret: string,
    refreshToken: string,
  ): Promise<void> {
    const response = await fetchYoutube("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!response.ok) {
      throw new Error(`Не удалось обновить токен Google (${response.status})`);
    }

    const tokens = (await response.json()) as GoogleTokenResponse;
    this.accessToken = tokens.access_token;
    this.accessTokenExpiresAt = Date.now() + tokens.expires_in * 1000;
  }
}
