import { ipcMain, net } from "electron";
import type { ConfigStore } from "./configStore";
import type { WhatsNewEntry, WhatsNewPayload } from "../shared/types";
import { compareVersions } from "../shared/version";
import { logError } from "./logger";

const OWNER = "MISQZY";
const REPO = "OBScure";
const LAST_SEEN_VERSION_SETTING = "app.lastSeenVersion";

/** Noise a commit-based changelog shouldn't repeat back to the user: the release's own version-bump commit and merge commits. Matches both "chore: bump version to X.Y.Z" (current convention) and the earlier "chore: bump to X.Y.Z". */
const BUMP_COMMIT_RE = /^chore:\s*bump(?:\s+version)?\s+to\s+\d/i;

interface GithubRelease {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
}

interface GithubCompare {
  commits: { commit: { message: string } }[];
}

async function githubGet<T>(path: string): Promise<T> {
  const response = await net.fetch(`https://api.github.com/repos/${OWNER}/${REPO}${path}`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!response.ok) {
    throw new Error(`GitHub API returned ${response.status} for ${path}`);
  }
  return (await response.json()) as T;
}

/**
 * Commit subjects (first line of each commit message) between two tags, in
 * the order GitHub returns them (oldest first) — this project pushes
 * directly to main rather than through PRs, so these subjects, not GitHub's
 * PR-based `--generate-notes` body, are the real changelog.
 */
async function commitSubjectsBetween(base: string, head: string): Promise<string[]> {
  const { commits } = await githubGet<GithubCompare>(`/compare/${base}...${head}`);
  return commits
    .map((commit) => commit.commit.message.split("\n")[0].trim())
    .filter((subject) => subject && !subject.startsWith("Merge ") && !BUMP_COMMIT_RE.test(subject));
}

async function fetchNewReleases(
  sinceVersion: string,
  upToVersion: string,
): Promise<WhatsNewEntry[]> {
  const releases = await githubGet<GithubRelease[]>("/releases?per_page=100");

  const inRange = releases
    // GitHub returns releases newest-first, so the next item is always the
    // tag immediately before this one — exactly the base a per-release
    // commit diff needs.
    .map((release, index) => ({ release, previousTag: releases[index + 1]?.tag_name }))
    .filter(({ release }) => !release.draft && !release.prerelease)
    .filter(
      ({ release }) =>
        compareVersions(release.tag_name, sinceVersion) > 0 &&
        compareVersions(release.tag_name, upToVersion) <= 0,
    );

  const entries = await Promise.all(
    inRange.map(
      async ({ release, previousTag }): Promise<WhatsNewEntry> => ({
        version: release.tag_name.replace(/^v/, ""),
        notes: previousTag ? await commitSubjectsBetween(previousTag, release.tag_name) : [],
      }),
    ),
  );

  return entries.sort((a, b) => compareVersions(b.version, a.version));
}

/**
 * Registers `whatsNew:get`, which resolves once with every release between
 * the version this profile last saw and the one now running (null if there's
 * nothing to show: first run, no version change, or the GitHub fetch
 * failed). The last-seen version is recorded immediately, before the fetch
 * even starts, so a version is never re-announced just because release notes
 * failed to load once.
 */
export function initWhatsNew(config: ConfigStore, currentVersion: string): void {
  const lastSeenVersion = config.getSetting<string | null>(
    LAST_SEEN_VERSION_SETTING,
    null,
  );
  config.setSetting(LAST_SEEN_VERSION_SETTING, currentVersion);

  const result: Promise<WhatsNewPayload | null> =
    !lastSeenVersion || compareVersions(currentVersion, lastSeenVersion) <= 0
      ? Promise.resolve(null)
      : fetchNewReleases(lastSeenVersion, currentVersion)
          .then((entries): WhatsNewPayload | null =>
            entries.length === 0
              ? null
              : { fromVersion: lastSeenVersion, toVersion: currentVersion, entries },
          )
          .catch((error: unknown) => {
            logError("whatsNew", "failed to fetch release notes", error);
            return null;
          });

  ipcMain.handle("whatsNew:get", () => result);
}
