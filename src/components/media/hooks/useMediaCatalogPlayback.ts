import { useCallback, useState } from 'react';
import { ChannelRecord, Phase1Settings } from '@/components/app/types';

type UseMediaCatalogPlaybackArgs = {
  singularLabel: string;
  preferredPlayer: Phase1Settings['preferred_player'];
  playChannelRecord: (channel: ChannelRecord) => Promise<void>;
  navigateToPlayer: () => void;
  reportError: (message: string) => void;
};

export function useMediaCatalogPlayback({
  singularLabel,
  preferredPlayer,
  playChannelRecord,
  navigateToPlayer,
  reportError,
}: UseMediaCatalogPlaybackArgs) {
  const [playingItemId, setPlayingItemId] = useState<number | null>(null);
  const [lastPlayedItemId, setLastPlayedItemId] = useState<number | null>(null);
  const [playbackMessage, setPlaybackMessage] = useState<string | null>(null);
  const [lastPlayedItemUrl, setLastPlayedItemUrl] = useState<string | null>(
    null
  );
  const [brokenPosterIds, setBrokenPosterIds] = useState<Record<number, true>>(
    {}
  );

  const handlePlayItem = useCallback(
    async (item: ChannelRecord) => {
      try {
        setPlayingItemId(item.id);
        setPlaybackMessage(`Starting "${item.name}"...`);
        await playChannelRecord(item);
        setLastPlayedItemId(item.id);
        setLastPlayedItemUrl(preferredPlayer === 'mpv' ? item.stream_url : null);
        setPlaybackMessage(
          preferredPlayer === 'mpv'
            ? `Now playing "${item.name}" in MPV pop-out.`
            : `Now playing "${item.name}" in the in-app player.`
        );

        if (preferredPlayer === 'web') {
          navigateToPlayer();
        }
      } catch (err) {
        reportError(String(err));
        setPlaybackMessage(null);
      } finally {
        setPlayingItemId(null);
      }
    },
    [navigateToPlayer, playChannelRecord, preferredPlayer, reportError]
  );

  const handlePosterError = useCallback((itemId: number) => {
    setBrokenPosterIds((current) => {
      if (current[itemId]) {
        return current;
      }

      return {
        ...current,
        [itemId]: true,
      };
    });
  }, []);

  const handleExternalPlaybackClosed = useCallback(
    (closedUrl: unknown) => {
      if (
        typeof closedUrl === 'string' &&
        lastPlayedItemUrl !== null &&
        closedUrl === lastPlayedItemUrl
      ) {
        setPlayingItemId(null);
        setLastPlayedItemId(null);
        setLastPlayedItemUrl(null);
        setPlaybackMessage(`${singularLabel} playback ended.`);
      }
    },
    [lastPlayedItemUrl, singularLabel]
  );

  return {
    playingItemId,
    lastPlayedItemId,
    playbackMessage,
    lastPlayedItemUrl,
    brokenPosterIds,
    handlePlayItem,
    handlePosterError,
    handleExternalPlaybackClosed,
  };
}
