import type { CredentialsStore } from "../../credentialsStore";
import {
  TwitchAuthError,
  fetchTwitch,
  sleep,
  SCOPES,
  DEVICE_GRANT_TYPE,
  BUILTIN_CLIENT_ID,
  TwitchTokenResponse,
} from "./utils";

export function getClientId(credentials: CredentialsStore): string | null {
  return credentials.getClientId("twitch.clientId") || BUILTIN_CLIENT_ID;
}

export async function pollForDeviceToken(
  clientId: string,
  deviceCode: string,
  intervalSeconds: number,
  expiresInSeconds: number,
): Promise<TwitchTokenResponse> {
  const deadline = Date.now() + expiresInSeconds * 1000;
  let delayMs = Math.max(intervalSeconds, 1) * 1000;

  for (;;) {
    await sleep(delayMs);
    if (Date.now() >= deadline) {
      throw new Error("Time to confirm the Twitch authorization ran out");
    }

    const tokenUrl = new URL("https://id.twitch.tv/oauth2/token");
    tokenUrl.searchParams.set("client_id", clientId);
    tokenUrl.searchParams.set("scopes", SCOPES);
    tokenUrl.searchParams.set("device_code", deviceCode);
    tokenUrl.searchParams.set("grant_type", DEVICE_GRANT_TYPE);

    const response = await fetchTwitch(tokenUrl, { method: "POST" });
    if (response.ok) {
      return (await response.json()) as TwitchTokenResponse;
    }

    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    const message = body?.message ?? "";
    if (message === "authorization_pending") continue;
    if (message === "slow_down") {
      delayMs += 5000;
      continue;
    }
    throw new Error(
      `Twitch rejected the device authorization: ${message || response.status}`,
    );
  }
}

export async function refreshAccessToken(
  clientId: string,
  refreshToken: string,
): Promise<TwitchTokenResponse> {
  const tokenUrl = new URL("https://id.twitch.tv/oauth2/token");
  tokenUrl.searchParams.set("client_id", clientId);
  tokenUrl.searchParams.set("grant_type", "refresh_token");
  tokenUrl.searchParams.set("refresh_token", refreshToken);

  const response = await fetchTwitch(tokenUrl, { method: "POST" });
  if (!response.ok) {
    const body = await response.text();

    if (response.status === 400 || response.status === 401) {
      throw new TwitchAuthError(
        `Twitch rejected the refresh token (${response.status}): ${body}`,
      );
    }
    throw new Error(
      `Failed to refresh the Twitch token (${response.status}): ${body}`,
    );
  }

  return (await response.json()) as TwitchTokenResponse;
}
