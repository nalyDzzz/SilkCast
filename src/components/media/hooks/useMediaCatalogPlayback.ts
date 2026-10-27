import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { ChannelRecord, Phase1Settings } from '@/components/app/types';
import { displayTitle } from '@/lib/catalog/cleanName';
import { useAppStore } from '@/store/appStore';

type UseMediaCatalogPlaybackArgs = {
  singularLabel: string;
  preferredPlayer: Phase1Settings['preferred_player'];
  playChannelRecord: (
    channel: ChannelRecord,
    queue?: ChannelRecord[]
  ) => Promise<void>;
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
  const [lastPlayedItemUrl, setLastPlayedItemUrl] = useState<string | null>(
    null
  );
  const [brokenPosterIds, setBrokenPosterIds] = useState<Record<number, true>>(
    {}
  );

  const handlePlayItem = useCallback(
    async (item: ChannelRecord, queue?: ChannelRecord[]) => {
      try {
        setPlayingItemId(item.id);
        await playChannelRecord(item, queue);

        const storeError = useAppStore.getState().error;
        if (storeError !== null) {
          reportError(storeError);
          return;
        }

        setLastPlayedItemId(item.id);
        setLastPlayedItemUrl(
          preferredPlayer === 'mpv' ? item.stream_url : null
        );

        if (preferredPlayer === 'web') {
          navigateToPlayer();
        } else {
          toast.success(`Playing "${displayTitle(item.name)}" in MPV`);
        }
      } catch (err) {
        reportError(String(err));
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
        toast(`${singularLabel} playback in MPV ended`);
      }
    },
    [lastPlayedItemUrl, singularLabel]
  );

  return {
    playingItemId,
    lastPlayedItemId,
    lastPlayedItemUrl,
    brokenPosterIds,
    handlePlayItem,
    handlePosterError,
    handleExternalPlaybackClosed,
  };
}
