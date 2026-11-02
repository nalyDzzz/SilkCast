import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkForAppUpdate,
  installAppUpdate,
  type DownloadEvent,
  type Update,
} from '@/lib/api/updatesApi';
import {
  markUpdateAnnounced,
  selectDownloadProgress,
  useAppUpdateStore,
  wasUpdateAnnounced,
} from '@/store/appUpdateStore';

vi.mock('@/lib/api/updatesApi', () => ({
  checkForAppUpdate: vi.fn(),
  installAppUpdate: vi.fn(),
}));

function fakeUpdate(version: string) {
  return {
    version,
    currentVersion: '0.4.1',
    close: vi.fn(() => Promise.resolve()),
  } as unknown as Update;
}

const store = () => useAppUpdateStore.getState();

describe('appUpdateStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    window.localStorage.clear();
    useAppUpdateStore.setState({
      phase: 'idle',
      update: null,
      upToDate: false,
      checkError: null,
      downloadedBytes: 0,
      downloadTotalBytes: null,
    });
  });

  describe('checkForUpdate', () => {
    it('reports when nothing newer exists', async () => {
      vi.mocked(checkForAppUpdate).mockResolvedValue(null);

      await store().checkForUpdate();

      expect(store()).toMatchObject({ phase: 'idle', update: null, upToDate: true });
    });

    it('keeps the update it finds', async () => {
      const update = fakeUpdate('0.5.0');
      vi.mocked(checkForAppUpdate).mockResolvedValue(update);

      await store().checkForUpdate({ background: true });

      expect(store()).toMatchObject({ phase: 'idle', update, upToDate: false });
    });

    it('shows why a check the user asked for failed', async () => {
      vi.mocked(checkForAppUpdate).mockRejectedValue('error sending request');

      await store().checkForUpdate();

      expect(store()).toMatchObject({ phase: 'idle', checkError: 'error sending request' });
    });

    it('stays quiet when a background check fails', async () => {
      const update = fakeUpdate('0.5.0');
      useAppUpdateStore.setState({ update });
      vi.mocked(checkForAppUpdate).mockRejectedValue('offline');

      await store().checkForUpdate({ background: true });

      expect(store()).toMatchObject({ phase: 'idle', update, checkError: null });
    });

    it('does not run two checks at once', async () => {
      let finish: (update: Update | null) => void = () => undefined;
      vi.mocked(checkForAppUpdate).mockReturnValue(
        new Promise((resolve) => {
          finish = resolve;
        })
      );

      const first = store().checkForUpdate({ background: true });
      await store().checkForUpdate();
      finish(null);
      await first;

      expect(checkForAppUpdate).toHaveBeenCalledOnce();
    });

    it('keeps the update it has when a recheck finds the same version', async () => {
      const current = fakeUpdate('0.5.0');
      const again = fakeUpdate('0.5.0');
      useAppUpdateStore.setState({ update: current });
      vi.mocked(checkForAppUpdate).mockResolvedValue(again);

      await store().checkForUpdate({ background: true });

      expect(store().update).toBe(current);
      expect(again.close).toHaveBeenCalledOnce();
      expect(current.close).not.toHaveBeenCalled();
    });

    it('replaces the update when an even newer version ships', async () => {
      const current = fakeUpdate('0.5.0');
      const newer = fakeUpdate('0.6.0');
      useAppUpdateStore.setState({ update: current });
      vi.mocked(checkForAppUpdate).mockResolvedValue(newer);

      await store().checkForUpdate({ background: true });

      expect(store().update).toBe(newer);
      expect(current.close).toHaveBeenCalledOnce();
    });

    it('leaves a running install alone when a check finishes late', async () => {
      const current = fakeUpdate('0.5.0');
      const late = fakeUpdate('0.6.0');
      let finish: (update: Update | null) => void = () => undefined;
      vi.mocked(checkForAppUpdate).mockReturnValue(
        new Promise((resolve) => {
          finish = resolve;
        })
      );
      vi.mocked(installAppUpdate).mockReturnValue(new Promise(() => undefined));
      useAppUpdateStore.setState({ update: current });

      const checking = store().checkForUpdate({ background: true });
      void store().installUpdate();
      finish(late);
      await checking;

      expect(store()).toMatchObject({ phase: 'downloading', update: current });
      expect(late.close).toHaveBeenCalledOnce();
    });

    it('counts only background finds as still needing an announcement', async () => {
      vi.mocked(checkForAppUpdate).mockResolvedValueOnce(fakeUpdate('0.5.0'));
      await store().checkForUpdate({ background: true });
      expect(wasUpdateAnnounced('0.5.0')).toBe(false);

      vi.mocked(checkForAppUpdate).mockResolvedValueOnce(fakeUpdate('0.6.0'));
      await store().checkForUpdate();
      expect(wasUpdateAnnounced('0.6.0')).toBe(true);
    });
  });

  describe('installUpdate', () => {
    it('tracks the download through to installing', async () => {
      const update = fakeUpdate('0.5.0');
      useAppUpdateStore.setState({ update });
      const seen: Array<number | null> = [];
      vi.mocked(installAppUpdate).mockImplementation(async (_update, onEvent) => {
        const emit = (event: DownloadEvent) => {
          onEvent(event);
          seen.push(selectDownloadProgress(store()));
        };
        emit({ event: 'Started', data: { contentLength: 200 } });
        emit({ event: 'Progress', data: { chunkLength: 50 } });
        emit({ event: 'Progress', data: { chunkLength: 150 } });
        emit({ event: 'Finished' });
      });

      await expect(store().installUpdate()).resolves.toBeNull();

      expect(seen).toEqual([0, 0.25, 1, 1]);
      expect(store().phase).toBe('installing');
    });

    it('returns the failure and allows another try', async () => {
      const update = fakeUpdate('0.5.0');
      useAppUpdateStore.setState({ update });
      vi.mocked(installAppUpdate).mockRejectedValue('bad signature');

      await expect(store().installUpdate()).resolves.toBe('bad signature');

      expect(store()).toMatchObject({ phase: 'idle', update });
    });

    it('does nothing without an update or while one is installing', async () => {
      await store().installUpdate();
      useAppUpdateStore.setState({ update: fakeUpdate('0.5.0'), phase: 'downloading' });
      await store().installUpdate();

      expect(installAppUpdate).not.toHaveBeenCalled();
    });
  });

  describe('selectDownloadProgress', () => {
    it('is unknown until the size is known', () => {
      expect(selectDownloadProgress({ downloadedBytes: 10, downloadTotalBytes: null })).toBeNull();
    });

    it('moves in whole percents', () => {
      expect(selectDownloadProgress({ downloadedBytes: 1999, downloadTotalBytes: 10_000 })).toBe(0.19);
    });
  });

  it('remembers the announced version', () => {
    markUpdateAnnounced('0.5.0');

    expect(wasUpdateAnnounced('0.5.0')).toBe(true);
    expect(wasUpdateAnnounced('0.6.0')).toBe(false);
  });
});
