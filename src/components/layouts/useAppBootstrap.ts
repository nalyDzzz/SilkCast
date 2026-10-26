import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAppStore } from '@/store/appStore';

/**
 * Loads app-wide data once at startup and honours the "resume last channel"
 * startup setting for the in-app player. (MPV resume is handled natively by
 * the backend before the window appears.)
 */
export function useAppBootstrap() {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    const store = useAppStore.getState();

    const bootstrap = async () => {
      await Promise.all([
        store.loadSettings().catch((err) => store.setError(String(err))),
        store.loadPlayerEnvironment(),
        store.loadRecents().catch(() => undefined),
      ]);

      if (cancelled) {
        return;
      }

      const {
        settings,
        recentChannels,
        selectedSourceId,
        hasPersistedSourceSelection,
        activeChannel,
      } = useAppStore.getState();

      if (
        settings.startup_behavior !== 'resume_last' ||
        settings.preferred_player !== 'web' ||
        !hasPersistedSourceSelection ||
        selectedSourceId === null ||
        activeChannel !== null
      ) {
        return;
      }

      // Series recents point at the series, not an episode, so only channels
      // and movies can be resumed directly.
      const lastPlayed = recentChannels.find(
        (recent) =>
          recent.channel.source_id === selectedSourceId &&
          recent.channel.media_kind !== 'series'
      );
      if (!lastPlayed) {
        return;
      }

      await useAppStore.getState().playChannelRecord(lastPlayed.channel);
      if (!cancelled) {
        navigate('/dashboard/player');
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
    // Runs once per app launch; navigate is stable for the router's lifetime.
  }, []);
}
