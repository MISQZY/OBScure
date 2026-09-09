import { ipcMain } from "electron";
import type { ConfigStore } from "../configStore";
import type { CommandDef } from "../../shared/eventsConfig";
import { normalizeCommandDef } from "../../shared/eventsConfig";

interface CommandsHandlersDeps {
  config: () => ConfigStore;
  commandsSettingKey: string;
  getStoredCommands: () => CommandDef[];
}

/**
 * IPC for the "Команды" (Commands) page — the Streamer.bot-shaped registry
 * Roulette/Actions reference by id instead of each editing their own aliases/
 * prefix/permission inline. Plain CRUD list, same `getAll`/`save`/`delete`
 * shape registerActionsHandlers gives Actions.
 */
export function registerCommandsHandlers(deps: CommandsHandlersDeps): void {
  const { config, commandsSettingKey, getStoredCommands } = deps;

  ipcMain.handle("commands:getAll", (): CommandDef[] => getStoredCommands());

  ipcMain.handle(
    "commands:save",
    (_event, command: CommandDef): CommandDef[] => {
      const normalized = normalizeCommandDef(command);
      const current = getStoredCommands();
      const exists = current.some((c) => c.id === normalized.id);
      const next = exists
        ? current.map((c) => (c.id === normalized.id ? normalized : c))
        : [...current, normalized];
      config().setSetting(commandsSettingKey, next);
      return next;
    },
  );

  ipcMain.handle(
    "commands:delete",
    (_event, id: string): CommandDef[] => {
      const next = getStoredCommands().filter((c) => c.id !== id);
      config().setSetting(commandsSettingKey, next);
      return next;
    },
  );
}
