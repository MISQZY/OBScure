import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  ActionQueueRuntimeState,
  AppUpdaterStatus,
  ConnectResult,
  CustomOverlay,
  GlobalVariable,
  EventLogEntry,
  IntegrationKey,
  IntegrationsStatusMap,
  NowPlayingPayload,
  OverlayAddress,
  OverlayFolder,
  OverlayUrls,
  RandomStatePayload,
  RouletteStatePayload,
  SettingKey,
  StreamerBotGlobalVariable,
  TwitchChannelStats,
  TwitchCustomReward,
  WhatsNewPayload
} from '../shared/types'
import type { ActionConfig, CommandDef, EventsConfigs, EventTarget } from '../shared/eventsConfig'
import type { CanvasConfig } from '../shared/canvasConfig'
import type { AvatarColor, Profile } from '../shared/profiles'
import type { CustomLocalePack, CustomThemePack } from '../shared/customConfig'

const api = {
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('app:openExternal', url),
  getOverlayUrls: (): Promise<OverlayUrls> => ipcRenderer.invoke('overlay:getUrls'),
  updateOverlayAddress: (address: OverlayAddress): Promise<OverlayUrls> =>
    ipcRenderer.invoke('overlay:updateAddress', address),
  getSystemFonts: (): Promise<string[]> => ipcRenderer.invoke('fonts:getSystem'),
  getCanvasConfig: (): Promise<CanvasConfig> => ipcRenderer.invoke('canvas:getConfig'),
  setCanvasConfig: (value: CanvasConfig): Promise<CanvasConfig> => ipcRenderer.invoke('canvas:setConfig', value),
  uploadCustomSound: (previousFileName: string | null): Promise<{ fileName: string } | null> =>
    ipcRenderer.invoke('sounds:uploadCustom', previousFileName),
  removeCustomSound: (fileName: string): Promise<void> => ipcRenderer.invoke('sounds:removeCustom', fileName),
  uploadCustomImage: (previousFileName: string | null): Promise<{ fileName: string } | null> =>
    ipcRenderer.invoke('images:uploadCustom', previousFileName),
  removeCustomImage: (fileName: string): Promise<void> => ipcRenderer.invoke('images:removeCustom', fileName),
  getIntegrationsStatus: (): Promise<IntegrationsStatusMap> => ipcRenderer.invoke('integrations:status'),
  onIntegrationsStatusUpdate: (callback: (statusMap: IntegrationsStatusMap) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, statusMap: IntegrationsStatusMap): void => callback(statusMap)
    ipcRenderer.on('integrations:status-update', listener)
    return () => ipcRenderer.off('integrations:status-update', listener)
  },
  getSetting: <T>(key: SettingKey): Promise<T | null> => ipcRenderer.invoke('settings:get', key),
  setSetting: (key: SettingKey, value: unknown): Promise<void> =>
    ipcRenderer.invoke('settings:set', key, value),
  connectIntegration: (key: IntegrationKey): Promise<ConnectResult> =>
    ipcRenderer.invoke('integrations:connect', key),
  disconnectIntegration: (key: IntegrationKey): Promise<void> =>
    ipcRenderer.invoke('integrations:disconnect', key),
  getProfiles: (): Promise<Profile[]> => ipcRenderer.invoke('profiles:list'),
  getActiveProfileId: (): Promise<string> => ipcRenderer.invoke('profiles:getActiveId'),
  createProfile: (name: string): Promise<Profile> => ipcRenderer.invoke('profiles:create', name),
  renameProfile: (id: string, name: string): Promise<void> => ipcRenderer.invoke('profiles:rename', id, name),
  setProfileAvatarColor: (id: string, color: AvatarColor): Promise<void> =>
    ipcRenderer.invoke('profiles:setAvatarColor', id, color),
  setProfileAvatarImage: (id: string, fileName: string | null): Promise<void> =>
    ipcRenderer.invoke('profiles:setAvatarImage', id, fileName),
  deleteProfile: (id: string): Promise<void> => ipcRenderer.invoke('profiles:delete', id),
  switchProfile: (id: string): Promise<void> => ipcRenderer.invoke('profiles:switch', id),
  getEventsConfig: <T extends EventTarget>(target: T): Promise<EventsConfigs[T]> =>
    ipcRenderer.invoke('events:getConfig', target),
  setEventsConfig: <T extends EventTarget>(target: T, value: EventsConfigs[T]): Promise<EventsConfigs[T]> =>
    ipcRenderer.invoke('events:setConfig', target, value),
  commitRandomRoll: (min: number, max: number, count: number): Promise<RandomStatePayload> =>
    ipcRenderer.invoke('events:random:commit', min, max, count),
  revealRandomRoll: (): Promise<RandomStatePayload> => ipcRenderer.invoke('events:random:reveal'),
  startRoulette: (durationSeconds: number): Promise<RouletteStatePayload> =>
    ipcRenderer.invoke('events:roulette:start', durationSeconds),
  addRouletteEntrant: (name: string): Promise<RouletteStatePayload> =>
    ipcRenderer.invoke('events:roulette:addEntrant', name),
  removeRouletteEntrant: (id: string): Promise<RouletteStatePayload> =>
    ipcRenderer.invoke('events:roulette:removeEntrant', id),
  cancelRoulette: (): Promise<RouletteStatePayload> => ipcRenderer.invoke('events:roulette:cancel'),
  finishRouletteEarly: (): Promise<RouletteStatePayload> => ipcRenderer.invoke('events:roulette:finishEarly'),
  getRouletteState: (): Promise<RouletteStatePayload> => ipcRenderer.invoke('events:roulette:getState'),
  onRouletteState: (callback: (state: RouletteStatePayload) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, state: RouletteStatePayload): void => callback(state)
    ipcRenderer.on('roulette:state', listener)
    return () => ipcRenderer.off('roulette:state', listener)
  },
  getTwitchRewards: (): Promise<TwitchCustomReward[]> => ipcRenderer.invoke('integrations:twitch:getRewards'),
  getTwitchStats: (): Promise<TwitchChannelStats | null> => ipcRenderer.invoke('integrations:twitch:getStats'),
  onTwitchStatsUpdate: (callback: (stats: TwitchChannelStats | null) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, stats: TwitchChannelStats | null): void => callback(stats)
    ipcRenderer.on('twitch-stats:update', listener)
    return () => ipcRenderer.off('twitch-stats:update', listener)
  },
  getNowPlaying: (): Promise<NowPlayingPayload | null> => ipcRenderer.invoke('nowPlaying:get'),
  onNowPlaying: (callback: (payload: NowPlayingPayload | null) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, payload: NowPlayingPayload | null): void => callback(payload)
    ipcRenderer.on('now-playing:update', listener)
    return () => ipcRenderer.off('now-playing:update', listener)
  },
  getCustomOverlays: (): Promise<CustomOverlay[]> => ipcRenderer.invoke('overlay:getCustomOverlays'),
  saveCustomOverlay: (overlay: CustomOverlay): Promise<CustomOverlay[]> =>
    ipcRenderer.invoke('overlay:saveCustomOverlay', overlay),
  deleteCustomOverlay: (id: string): Promise<CustomOverlay[]> => ipcRenderer.invoke('overlay:deleteCustomOverlay', id),
  testCustomOverlay: (overlay: CustomOverlay): Promise<void> => ipcRenderer.invoke('overlay:testCustomOverlay', overlay),
  getCustomOverlayFolders: (): Promise<OverlayFolder[]> => ipcRenderer.invoke('overlay:getCustomOverlayFolders'),
  saveCustomOverlayFolder: (folder: OverlayFolder): Promise<OverlayFolder[]> =>
    ipcRenderer.invoke('overlay:saveCustomOverlayFolder', folder),
  deleteCustomOverlayFolder: (id: string): Promise<OverlayFolder[]> =>
    ipcRenderer.invoke('overlay:deleteCustomOverlayFolder', id),
  setTitleBarOverlay: (overlay: { color: string; symbolColor: string }): Promise<void> =>
    ipcRenderer.invoke('window:setTitleBarOverlay', overlay),
  getCustomThemes: (): Promise<CustomThemePack[]> => ipcRenderer.invoke('theme:getCustomThemes'),
  saveCustomTheme: (pack: CustomThemePack): Promise<CustomThemePack[]> =>
    ipcRenderer.invoke('theme:saveCustomTheme', pack),
  deleteCustomTheme: (id: string): Promise<CustomThemePack[]> => ipcRenderer.invoke('theme:deleteCustomTheme', id),
  getCustomLocales: (): Promise<CustomLocalePack[]> => ipcRenderer.invoke('locale:getCustomLocales'),
  saveCustomLocale: (pack: CustomLocalePack): Promise<CustomLocalePack[]> =>
    ipcRenderer.invoke('locale:saveCustomLocale', pack),
  deleteCustomLocale: (id: string): Promise<CustomLocalePack[]> => ipcRenderer.invoke('locale:deleteCustomLocale', id),
  getGlobalVariables: (): Promise<GlobalVariable[]> => ipcRenderer.invoke('variables:getGlobal'),
  saveGlobalVariable: (variable: GlobalVariable): Promise<GlobalVariable[]> =>
    ipcRenderer.invoke('variables:saveGlobal', variable),
  deleteGlobalVariable: (id: string): Promise<GlobalVariable[]> => ipcRenderer.invoke('variables:deleteGlobal', id),
  openConfigFile: (): Promise<{ fileName: string; content: string } | null> =>
    ipcRenderer.invoke('config:openJsonFile'),
  saveConfigFile: (defaultFileName: string, content: string): Promise<boolean> =>
    ipcRenderer.invoke('config:saveTextFile', defaultFileName, content),
  getUpdaterStatus: (): Promise<AppUpdaterStatus> => ipcRenderer.invoke('updater:getStatus'),
  downloadUpdate: (): Promise<void> => ipcRenderer.invoke('updater:download'),
  onUpdaterStatus: (callback: (status: AppUpdaterStatus) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, status: AppUpdaterStatus): void => callback(status)
    ipcRenderer.on('updater:status', listener)
    return () => ipcRenderer.off('updater:status', listener)
  },
  getWhatsNew: (): Promise<WhatsNewPayload | null> => ipcRenderer.invoke('whatsNew:get'),
  getStreamerBotGlobals: (): Promise<StreamerBotGlobalVariable[]> => ipcRenderer.invoke('streamerbot:getGlobals'),
  onStreamerBotGlobalsUpdate: (callback: (variables: StreamerBotGlobalVariable[]) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, variables: StreamerBotGlobalVariable[]): void => callback(variables)
    ipcRenderer.on('streamerbot-globals:update', listener)
    return () => ipcRenderer.off('streamerbot-globals:update', listener)
  },
  getActions: (): Promise<ActionConfig[]> => ipcRenderer.invoke('actions:getAll'),
  saveAction: (action: ActionConfig): Promise<ActionConfig[]> => ipcRenderer.invoke('actions:save', action),
  deleteAction: (id: string): Promise<ActionConfig[]> => ipcRenderer.invoke('actions:delete', id),
  runAction: (id: string): Promise<void> => ipcRenderer.invoke('actions:run', id),
  getCommands: (): Promise<CommandDef[]> => ipcRenderer.invoke('commands:getAll'),
  saveCommand: (command: CommandDef): Promise<CommandDef[]> => ipcRenderer.invoke('commands:save', command),
  deleteCommand: (id: string): Promise<CommandDef[]> => ipcRenderer.invoke('commands:delete', id),
  getActionQueuesState: (): Promise<ActionQueueRuntimeState[]> => ipcRenderer.invoke('actionQueues:getState'),
  createActionQueue: (name: string): Promise<ActionQueueRuntimeState[]> =>
    ipcRenderer.invoke('actionQueues:create', name),
  renameActionQueue: (id: string, name: string): Promise<ActionQueueRuntimeState[]> =>
    ipcRenderer.invoke('actionQueues:rename', id, name),
  removeActionQueue: (id: string): Promise<ActionQueueRuntimeState[]> =>
    ipcRenderer.invoke('actionQueues:remove', id),
  setActionQueuePaused: (id: string, paused: boolean): Promise<ActionQueueRuntimeState[]> =>
    ipcRenderer.invoke('actionQueues:setPaused', id, paused),
  setActionQueueBlocking: (id: string, blocking: boolean): Promise<ActionQueueRuntimeState[]> =>
    ipcRenderer.invoke('actionQueues:setBlocking', id, blocking),
  resetActionQueueCompleted: (id: string): Promise<ActionQueueRuntimeState[]> =>
    ipcRenderer.invoke('actionQueues:resetCompleted', id),
  onActionQueuesState: (callback: (state: ActionQueueRuntimeState[]) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, state: ActionQueueRuntimeState[]): void => callback(state)
    ipcRenderer.on('actionQueues:state', listener)
    return () => ipcRenderer.off('actionQueues:state', listener)
  },
  getEventLog: (): Promise<EventLogEntry[]> => ipcRenderer.invoke('eventLog:getEntries'),
  clearEventLog: (): Promise<void> => ipcRenderer.invoke('eventLog:clear'),
  onEventLogEntry: (callback: (entry: EventLogEntry) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, entry: EventLogEntry): void => callback(entry)
    ipcRenderer.on('eventLog:entry', listener)
    return () => ipcRenderer.off('eventLog:entry', listener)
  }
}

contextBridge.exposeInMainWorld('obscure', api)
