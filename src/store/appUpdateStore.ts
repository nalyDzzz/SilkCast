import { create } from 'zustand';
import {
  checkForAppUpdate,
  installAppUpdate,
  type Update,
} from '@/lib/api/updatesApi';

const ANNOUNCED_VERSION_KEY = 'silkcast:update:announcedVersion';

export type AppUpdatePhase = 'idle' | 'checking' | 'downloading' | 'installing';

type AppUpdateState = {
  phase: AppUpdatePhase;
  /** A newer release, ready to install. */
  update: Update | null;
  /** The latest finished check found nothing newer. */
  upToDate: boolean;
  /** Why the latest check the user asked for failed. */
  checkError: string | null;
  downloadedBytes: number;
  downloadTotalBytes: number | null;
  /** Background checks stay quiet when they fail: being offline is normal. */
  checkForUpdate: (options?: { background?: boolean }) => Promise<void>;
  /** Restarts the app on success; otherwise resolves with what went wrong. */
  installUpdate: () => Promise<string | null>;
};

function failureMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message;
  }
  // Tauri commands reject with plain strings.
  return typeof error === 'string' && error ? error : fallback;
}

/** Each `Update` holds a backend resource until it is closed. */
function release(update: Update | null) {
  void update?.close().catch(() => undefined);
}

/** Whether the user has already been told about this version. */
export function wasUpdateAnnounced(version: string) {
  return window.localStorage.getItem(ANNOUNCED_VERSION_KEY) === version;
}

export function markUpdateAnnounced(version: string) {
  window.localStorage.setItem(ANNOUNCED_VERSION_KEY, version);
}

/** Shared by the check schedule, the top bar notice and the Settings card. */
export const useAppUpdateStore = create<AppUpdateState>((set, get) => ({
  phase: 'idle',
  update: null,
  upToDate: false,
  checkError: null,
  downloadedBytes: 0,
  downloadTotalBytes: null,
  checkForUpdate: async ({ background = false } = {}) => {
    if (get().phase !== 'idle') {
      return;
    }
    set(
      background
        ? { phase: 'checking' }
        : { phase: 'checking', upToDate: false, checkError: null }
    );

    try {
      const found = await checkForAppUpdate();
      // An install can start during a check; it owns the state from then on.
      if (get().phase !== 'checking') {
        release(found);
        return;
      }
      if (found && !background) {
        // They asked and are looking at the answer; no need to announce it too.
        markUpdateAnnounced(found.version);
      }

      const current = get().update;
      const keepCurrent = found !== null && found.version === current?.version;
      release(keepCurrent ? found : current);
      set({
        phase: 'idle',
        update: keepCurrent ? current : found,
        upToDate: found === null,
        checkError: null,
      });
    } catch (error) {
      if (get().phase !== 'checking') {
        return;
      }
      if (background) {
        console.warn('Background update check failed', error);
        set({ phase: 'idle' });
        return;
      }
      set({
        phase: 'idle',
        checkError: failureMessage(error, 'Could not check for updates right now.'),
      });
    }
  },
  installUpdate: async () => {
    const { update, phase } = get();
    if (!update || phase === 'downloading' || phase === 'installing') {
      return null;
    }
    set({ phase: 'downloading', downloadedBytes: 0, downloadTotalBytes: null });

    try {
      await installAppUpdate(update, (event) => {
        if (event.event === 'Started') {
          set({ downloadTotalBytes: event.data.contentLength ?? null });
        } else if (event.event === 'Progress') {
          set((state) => ({
            downloadedBytes: state.downloadedBytes + event.data.chunkLength,
          }));
        } else {
          set({ phase: 'installing' });
        }
      });
      return null;
    } catch (error) {
      set({ phase: 'idle' });
      return failureMessage(error, 'Could not install the update right now.');
    }
  },
}));

/**
 * Download progress in whole percent, as 0..1, so subscribers re-render once
 * per percent rather than once per chunk. Null when the size isn't known.
 */
export function selectDownloadProgress({
  downloadedBytes,
  downloadTotalBytes,
}: Pick<AppUpdateState, 'downloadedBytes' | 'downloadTotalBytes'>) {
  if (!downloadTotalBytes) {
    return null;
  }
  return Math.min(Math.floor((downloadedBytes / downloadTotalBytes) * 100), 100) / 100;
}
