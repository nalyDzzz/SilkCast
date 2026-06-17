import { useCallback, useEffect, useRef, useState } from 'react';
import { ChannelRecord } from '@/components/app/types';
import { MediaCatalogKind } from '@/components/media/mediaCatalogConfig';
import { listSourceLiveNowEpg } from '@/lib/api/epgApi';

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

    if (selectedSourceId === null) {
      setLiveNowByChannelId({});
      return;
    }

    let records: Awaited<ReturnType<typeof listSourceLiveNowEpg>>;
    try {
      records = await listSourceLiveNowEpg(selectedSourceId);
    } catch {
      if (liveNowRequestVersionRef.current === requestVersion) {
        setLiveNowByChannelId({});
      }
      return;
    }

    if (liveNowRequestVersionRef.current !== requestVersion) {
      return;
    }

    const nextMap: Record<number, string> = {};
    for (const record of records) {
      nextMap[record.channel_id] = record.title;
    }

    if (liveNowRequestVersionRef.current === requestVersion) {
      setLiveNowByChannelId(nextMap);
    }
  }, [items.length, mediaKind, selectedSourceId, selectedSourceType]);

  useEffect(() => {
    void loadLiveNowLines();
  }, [epgRefreshVersion, loadLiveNowLines]);

  return {
    liveNowByChannelId,
    refreshEpg,
  };
}
