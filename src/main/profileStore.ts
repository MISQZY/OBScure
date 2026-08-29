import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  AVATAR_COLORS,
  DEFAULT_PROFILE_NAME,
  MAX_PROFILES,
  type AvatarColor,
  type Profile,
} from "../shared/profiles";

interface ProfilesFile {
  activeProfileId: string;
  profiles: Profile[];
}

export class ProfileManager {
  private readonly rootDir: string;
  private readonly indexPath: string;
  private data: ProfilesFile;

  constructor(userDataDir: string) {
    this.rootDir = join(userDataDir, "profiles");
    this.indexPath = join(userDataDir, "profiles.json");
    if (!existsSync(this.rootDir)) mkdirSync(this.rootDir, { recursive: true });
    this.data = this.load(userDataDir);
  }

  private load(userDataDir: string): ProfilesFile {
    if (existsSync(this.indexPath)) {
      try {
        const parsed = JSON.parse(
          readFileSync(this.indexPath, "utf-8"),
        ) as ProfilesFile;
        if (
          parsed.profiles?.length &&
          parsed.profiles.some((p) => p.id === parsed.activeProfileId)
        ) {
          return parsed;
        }
      } catch {
        /* fall through to (re)migrate/create default below */
      }
    }
    return this.migrateOrCreateDefault(userDataDir);
  }

  private migrateOrCreateDefault(userDataDir: string): ProfilesFile {
    const defaultProfile: Profile = {
      id: randomUUID(),
      name: DEFAULT_PROFILE_NAME,
      avatarColor: AVATAR_COLORS[0],
      createdAt: Date.now(),
    };
    const profileDir = this.dirFor(defaultProfile.id);
    mkdirSync(profileDir, { recursive: true });

    const legacyConfigPath = join(userDataDir, "config.json");
    if (existsSync(legacyConfigPath)) {
      try {
        renameSync(legacyConfigPath, join(profileDir, "config.json"));
      } catch {
        /* best-effort; ConfigStore just starts empty for this profile */
      }
    }

    const file: ProfilesFile = {
      activeProfileId: defaultProfile.id,
      profiles: [defaultProfile],
    };
    this.data = file;
    this.save();
    return file;
  }

  private save(): void {
    writeFileSync(this.indexPath, JSON.stringify(this.data, null, 2), "utf-8");
  }

  private dirFor(id: string): string {
    return join(this.rootDir, id);
  }

  list(): Profile[] {
    return this.data.profiles;
  }

  getActiveId(): string {
    return this.data.activeProfileId;
  }

  getActiveProfileDir(): string {
    return this.dirFor(this.data.activeProfileId);
  }

  create(name: string): Profile {
    if (this.data.profiles.length >= MAX_PROFILES) {
      throw new Error(`Maximum of ${MAX_PROFILES} profiles reached`);
    }
    const trimmed = name.trim();
    const profile: Profile = {
      id: randomUUID(),
      name: trimmed || `Профиль ${this.data.profiles.length + 1}`,
      avatarColor:
        AVATAR_COLORS[this.data.profiles.length % AVATAR_COLORS.length],
      createdAt: Date.now(),
    };
    mkdirSync(this.dirFor(profile.id), { recursive: true });
    this.data.profiles.push(profile);
    this.save();
    return profile;
  }

  rename(id: string, name: string): void {
    const profile = this.data.profiles.find((p) => p.id === id);
    const trimmed = name.trim();
    if (!profile || !trimmed) return;
    profile.name = trimmed;
    this.save();
  }

  setAvatarColor(id: string, color: AvatarColor): void {
    const profile = this.data.profiles.find((p) => p.id === id);
    if (!profile || !AVATAR_COLORS.includes(color)) return;
    profile.avatarColor = color;
    this.save();
  }

  delete(id: string): boolean {
    if (this.data.profiles.length <= 1) return false;
    const index = this.data.profiles.findIndex((p) => p.id === id);
    if (index === -1) return false;

    this.data.profiles.splice(index, 1);
    try {
      rmSync(this.dirFor(id), { recursive: true, force: true });
    } catch {
      /* ignore */
    }

    const wasActive = this.data.activeProfileId === id;
    if (wasActive) this.data.activeProfileId = this.data.profiles[0].id;
    this.save();
    return wasActive;
  }

  setActive(id: string): void {
    if (!this.data.profiles.some((p) => p.id === id)) return;
    this.data.activeProfileId = id;
    this.save();
  }
}
