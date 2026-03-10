import { useCallback, useEffect, useRef, useState } from 'react';
import { ChannelRecord } from '@/components/app/types';
import { MediaCatalogKind } from '@/components/media/mediaCatalogConfig';
import { listChannelEpg } from '@/lib/api/epgApi';

const LIVE_EPG_LIMIT = 2;
const LIVE_EPG_REFRESH_CONCURRENCY = 8;

type UseLiveNowEpgArgs = {
  mediaKind: MediaCatalogKind;
  selectedSourceId: number | null;
  selectedSourceType: string | null | undefined;
  items: ChannelRecord[];
};

export function useLiveNowEpg({
  mediaKind,
  selectedSourceId,
  selectedSourceType,
  items,
}: UseLiveNowEpgArgs) {
  const [liveNowByChannelId, setLiveNowByChannelId] = useState<
    Record<number, string>
  >({});
  const [epgRefreshVersion, setEpgRefreshVersion] = useState(0);
  const liveNowRequestVersionRef = useRef(0);

  const refreshEpg = useCallback(() => {
    setEpgRefreshVersion((current) => current + 1);
  }, []);

  useEffect(() => {
    liveNowRequestVersionRef.current += 1;
    setLiveNowByChannelId({});
  }, [mediaKind, selectedSourceId]);

  const loadLiveNowLines = useCallback(async () => {
    if (mediaKind !== 'live' || selectedSourceType !== 'xtream') {
      setLiveNowByChannelId({});
      return;
    }

    if (items.length === 0) {
      setLiveNowByChannelId({});
      return;
    }

    const requestVersion = liveNowRequestVersionRef.current + 1;
    liveNowRequestVersionRef.current = requestVersion;

    const nextMap: Record<number, string> = {};

    for (
      let index = 0;
      index < items.length;
      index += LIVE_EPG_REFRESH_CONCURRENCY
    ) {
      const chunk = items.slice(index, index + LIVE_EPG_REFRESH_CONCURRENCY);
      const chunkResults = await Promise.all(
        chunk.map(async (channel) => {
          try {
            const entries = await listChannelEpg(channel.id, LIVE_EPG_LIMIT);
            return {
              channelId: channel.id,
              title: entries[0]?.title ?? null,
            };
          } catch {
            return {
              channelId: channel.id,
              title: null,
            };
          }
        })
      );

      if (liveNowRequestVersionRef.current !== requestVersion) {
        return;
      }

      for (const result of chunkResults) {
        if (result.title) {
          nextMap[result.channelId] = result.title;
        }
      }
    }

    if (liveNowRequestVersionRef.current === requestVersion) {
      setLiveNowByChannelId(nextMap);
    }
  }, [items, mediaKind, selectedSourceType]);

  useEffect(() => {
    void loadLiveNowLines();
  }, [epgRefreshVersion, loadLiveNowLines]);

  return {
    liveNowByChannelId,
    refreshEpg,
  };
}
