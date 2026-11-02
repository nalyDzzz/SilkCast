import { openUrl } from '@tauri-apps/plugin-opener';
import { relaunch } from '@tauri-apps/plugin-process';
import {
  check,
  type DownloadEvent,
  type Update,
} from '@tauri-apps/plugin-updater';

export type { DownloadEvent, Update };

/** Limits the whole download, not idle time, so it has to allow for slow connections. */
const DOWNLOAD_TIMEOUT_MS = 15 * 60_000;

const RELEASE_PAGE_URL = 'https://github.com/nalyDzzz/SilkCast/releases/tag';

export function checkForAppUpdate(): Promise<Update | null> {
  return check({ timeout: 30_000 });
}

export async function installAppUpdate(
  update: Update,
  onEvent: (event: DownloadEvent) => void
): Promise<void> {
  await update.downloadAndInstall(onEvent, { timeout: DOWNLOAD_TIMEOUT_MS });
  await relaunch();
}

/**
 * Opens the release page. `Update.body` can't be shown instead: the manifest is
 * generated before the release notes are written, so it only holds boilerplate.
 */
export function openReleaseNotes(version: string): Promise<void> {
  return openUrl(`${RELEASE_PAGE_URL}/v${version}`);
}
