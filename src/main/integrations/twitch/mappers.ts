import type {
  AlertPayload,
  ChatMessagePayload,
  PointsRedemptionPayload,
} from "../../../shared/types";

export function mapNotificationToAlert(
  type: string,
  event: Record<string, unknown>,
): AlertPayload | null {
  switch (type) {
    case "channel.follow":
      return {
        source: "twitch",
        type: "follow",
        user: stringField(event, "user_name", "user_login"),
      };
    case "channel.subscribe":
      return {
        source: "twitch",
        type: "subscription",
        user: stringField(event, "user_name", "user_login"),
      };
    case "channel.raid":
      return {
        source: "twitch",
        type: "raid",
        user: stringField(
          event,
          "from_broadcaster_user_name",
          "from_broadcaster_user_login",
        ),
        amount: typeof event.viewers === "number" ? event.viewers : undefined,
      };
    default:
      return null;
  }
}

export function stringField(
  event: Record<string, unknown>,
  primary: string,
  fallback: string,
): string {
  const value = event[primary] ?? event[fallback];
  return typeof value === "string" ? value : "???";
}

export function mapNotificationToChatMessage(
  event: Record<string, unknown>,
): ChatMessagePayload {
  const message = event.message;
  const text =
    message &&
    typeof message === "object" &&
    typeof (message as Record<string, unknown>).text === "string"
      ? ((message as Record<string, unknown>).text as string)
      : "";
  return {
    source: "twitch",
    user: stringField(event, "chatter_user_name", "chatter_user_login"),
    userId:
      typeof event.chatter_user_id === "string" ? event.chatter_user_id : "",
    text,
  };
}

export function mapNotificationToPointsRedemption(
  event: Record<string, unknown>,
): PointsRedemptionPayload {
  const reward = event.reward;
  const rewardObj =
    reward && typeof reward === "object"
      ? (reward as Record<string, unknown>)
      : {};
  return {
    source: "twitch",
    user: stringField(event, "user_name", "user_login"),
    userId: typeof event.user_id === "string" ? event.user_id : "",
    rewardId: typeof rewardObj.id === "string" ? rewardObj.id : "",
    rewardTitle: typeof rewardObj.title === "string" ? rewardObj.title : "",
  };
}
