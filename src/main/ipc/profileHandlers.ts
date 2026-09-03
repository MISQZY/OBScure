import { ipcMain } from "electron";
import type { ProfileManager } from "../profileStore";
import type { AvatarColor, Profile } from "../../shared/profiles";

interface ProfileHandlersDeps {
  profileManager: ProfileManager;
  reinitializeForActiveProfile: () => Promise<void>;
}

export function registerProfileHandlers(deps: ProfileHandlersDeps): void {
  const { profileManager, reinitializeForActiveProfile } = deps;

  ipcMain.handle("profiles:list", (): Profile[] => profileManager.list());

  ipcMain.handle("profiles:getActiveId", (): string =>
    profileManager.getActiveId(),
  );

  ipcMain.handle("profiles:create", (_event, name: string): Profile =>
    profileManager.create(name),
  );

  ipcMain.handle("profiles:rename", (_event, id: string, name: string) => {
    profileManager.rename(id, name);
  });

  ipcMain.handle(
    "profiles:setAvatarColor",
    (_event, id: string, color: AvatarColor) => {
      profileManager.setAvatarColor(id, color);
    },
  );

  ipcMain.handle(
    "profiles:setAvatarImage",
    (_event, id: string, fileName: string | null) => {
      profileManager.setAvatarImage(id, fileName);
    },
  );

  ipcMain.handle("profiles:delete", async (_event, id: string) => {
    const wasActive = profileManager.delete(id);
    if (wasActive) await reinitializeForActiveProfile();
  });

  ipcMain.handle("profiles:switch", async (_event, id: string) => {
    profileManager.setActive(id);
    await reinitializeForActiveProfile();
  });
}
