import { ipcMain } from "electron";
import type { EventLog } from "../eventLog";
import type { EventLogEntry } from "../../shared/types";

interface EventLogHandlersDeps {
  eventLog: EventLog;
}

export function registerEventLogHandlers(deps: EventLogHandlersDeps): void {
  const { eventLog } = deps;

  ipcMain.handle(
    "eventLog:getEntries",
    (): EventLogEntry[] => eventLog.getEntries(),
  );

  ipcMain.handle("eventLog:clear", (): void => eventLog.clear());
}
