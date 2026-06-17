import {
  check,
  type DownloadEvent,
  type Update,
} from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export type { DownloadEvent, Update };

export function checkForAppUpdate(): Promise<Update | null> {
  return check({ timeout: 30_000 });
}

export async function installAppUpdate(
  update: Update,
  onEvent: (event: DownloadEvent) => void
): Promise<void> {
  await update.downloadAndInstall(onEvent, { timeout: 120_000 });
  await relaunch();
}
