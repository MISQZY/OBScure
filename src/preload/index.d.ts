import type {
  AppUpdaterStatus,
  ConnectResult,
  CustomOverlay,
  IntegrationKey,
  IntegrationsStatusMap,
  NowPlayingPayload,
  OverlayAddress,
  OverlayUrls,
  RandomStatePayload,
  RouletteStatePayload,
  SettingKey,
  TwitchChannelStats,
  TwitchCustomReward
} from '../shared/types'
import type { EventsConfigs, EventTarget } from '../shared/eventsConfig'
import type { CanvasConfig } from '../shared/canvasConfig'
import type { AvatarColor, Profile } from '../shared/profiles'
import type { CustomLocalePack, CustomThemePack } from '../shared/customConfig'

export interface MaddonerApi {
  getAppVersion: () => Promise<string>
  getOverlayUrls: () => Promise<OverlayUrls>
  updateOverlayAddress: (address: OverlayAddress) => Promise<OverlayUrls>
  getSystemFonts: () => Promise<string[]>
  getCanvasConfig: () => Promise<CanvasConfig>
  setCanvasConfig: (value: CanvasConfig) => Promise<CanvasConfig>
  uploadCustomSound: (previousFileName: string | null) => Promise<{ fileName: string } | null>
  removeCustomSound: (fileName: string) => Promise<void>
  uploadCustomImage: (previousFileName: string | null) => Promise<{ fileName: string } | null>
  removeCustomImage: (fileName: string) => Promise<void>
  getIntegrationsStatus: () => Promise<IntegrationsStatusMap>
  onIntegrationsStatusUpdate: (callback: (statusMap: IntegrationsStatusMap) => void) => () => void
  getSetting: <T>(key: SettingKey) => Promise<T | null>
  setSetting: (key: SettingKey, value: unknown) => Promise<void>
  connectIntegration: (key: IntegrationKey) => Promise<ConnectResult>
  disconnectIntegration: (key: IntegrationKey) => Promise<void>
  getProfiles: () => Promise<Profile[]>
  getActiveProfileId: () => Promise<string>
  createProfile: (name: string) => Promise<Profile>
  renameProfile: (id: string, name: string) => Promise<void>
  setProfileAvatarColor: (id: string, color: AvatarColor) => Promise<void>
  deleteProfile: (id: string) => Promise<void>
  switchProfile: (id: string) => Promise<void>
  getEventsConfig: <T extends EventTarget>(target: T) => Promise<EventsConfigs[T]>
  setEventsConfig: <T extends EventTarget>(target: T, value: EventsConfigs[T]) => Promise<EventsConfigs[T]>
  commitRandomRoll: (min: number, max: number, count: number) => Promise<RandomStatePayload>
  revealRandomRoll: () => Promise<RandomStatePayload>
  startRoulette: (durationSeconds: number) => Promise<RouletteStatePayload>
  addRouletteEntrant: (name: string) => Promise<RouletteStatePayload>
  removeRouletteEntrant: (id: string) => Promise<RouletteStatePayload>
  cancelRoulette: () => Promise<RouletteStatePayload>
  finishRouletteEarly: () => Promise<RouletteStatePayload>
  getRouletteState: () => Promise<RouletteStatePayload>
  onRouletteState: (callback: (state: RouletteStatePayload) => void) => () => void
  getTwitchRewards: () => Promise<TwitchCustomReward[]>
  getTwitchStats: () => Promise<TwitchChannelStats | null>
  getNowPlaying: () => Promise<NowPlayingPayload | null>
  onNowPlaying: (callback: (payload: NowPlayingPayload | null) => void) => () => void
  getCustomOverlays: () => Promise<CustomOverlay[]>
  saveCustomOverlay: (overlay: CustomOverlay) => Promise<CustomOverlay[]>
  deleteCustomOverlay: (id: string) => Promise<CustomOverlay[]>
  testCustomOverlay: (overlay: CustomOverlay) => Promise<void>
  setTitleBarOverlay: (overlay: { color: string; symbolColor: string }) => Promise<void>
  getCustomThemes: () => Promise<CustomThemePack[]>
  saveCustomTheme: (pack: CustomThemePack) => Promise<CustomThemePack[]>
  deleteCustomTheme: (id: string) => Promise<CustomThemePack[]>
  getCustomLocales: () => Promise<CustomLocalePack[]>
  saveCustomLocale: (pack: CustomLocalePack) => Promise<CustomLocalePack[]>
  deleteCustomLocale: (id: string) => Promise<CustomLocalePack[]>
  openConfigFile: () => Promise<{ fileName: string; content: string } | null>
  saveConfigFile: (defaultFileName: string, content: string) => Promise<boolean>
  getUpdaterStatus: () => Promise<AppUpdaterStatus>
  downloadUpdate: () => Promise<void>
  onUpdaterStatus: (callback: (status: AppUpdaterStatus) => void) => () => void
}

declare global {
  interface Window {
    maddoner: MaddonerApi
  }
}
