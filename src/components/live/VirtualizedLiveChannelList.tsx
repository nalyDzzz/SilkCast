import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChannelRecord } from '@/components/app/types';
import { LiveChannelRow } from '@/components/live/LiveChannelRow';
import { getVirtualListRange } from '@/components/live/virtualList';

type VirtualizedLiveChannelListProps = {
  channels: ChannelRecord[];
  activeChannelId: number | null;
  playingChannelId: number | null;
  onPlay: (channel: ChannelRecord) => void;
  onToggleFavorite: (channel: ChannelRecord) => void;
  className?: string;
};

const DEFAULT_ROW_HEIGHT_PX = 72;
const ROW_GAP_PX = 8;

export function VirtualizedLiveChannelList({
  channels,
  activeChannelId,
  playingChannelId,
  onPlay,
  onToggleFavorite,
  className = '',
}: VirtualizedLiveChannelListProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [rowHeight, setRowHeight] = useState(DEFAULT_ROW_HEIGHT_PX);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    const updateMeasurements = () => {
      setViewportHeight(element.clientHeight);
    };

    const onScroll = () => {
      setScrollTop(element.scrollTop);
    };

    updateMeasurements();
    element.addEventListener('scroll', onScroll, { passive: true });

    const resizeObserver = new ResizeObserver(updateMeasurements);
    resizeObserver.observe(element);

    return () => {
      element.removeEventListener('scroll', onScroll);
      resizeObserver.disconnect();
    };
  }, []);

  const range = useMemo(
    () =>
      getVirtualListRange({
        itemCount: channels.length,
        itemHeight: rowHeight,
        gap: ROW_GAP_PX,
        scrollTop,
        viewportHeight,
      }),
    [channels.length, rowHeight, scrollTop, viewportHeight]
  );

  const visibleChannels = useMemo(
    () => channels.slice(range.startIndex, range.endIndex),
    [channels, range.endIndex, range.startIndex]
  );

  const handleMeasureRow = useCallback((element: HTMLDivElement | null) => {
    if (!element) {
      return;
    }

    const measuredHeight = element.getBoundingClientRect().height;
    if (measuredHeight <= 0) {
      return;
    }

    setRowHeight((currentHeight) =>
      Math.abs(currentHeight - measuredHeight) < 1
        ? currentHeight
        : measuredHeight
    );
  }, []);

  return (
    <div
      ref={containerRef}
      className={`h-full min-h-0 overflow-y-auto pr-1 ${className}`}
    >
      <div style={{ height: range.topSpacerHeight }} aria-hidden="true" />
      <section className="flex flex-col gap-2">
        {visibleChannels.map((channel, visibleIndex) => (
          <div
            key={channel.id}
            ref={visibleIndex === 0 ? handleMeasureRow : undefined}
          >
            <LiveChannelRow
              channel={channel}
              isActive={activeChannelId === channel.id}
              isPlaying={playingChannelId === channel.id}
              onPlay={onPlay}
              onToggleFavorite={onToggleFavorite}
            />
          </div>
        ))}
      </section>
      <div style={{ height: range.bottomSpacerHeight }} aria-hidden="true" />
    </div>
  );
}
