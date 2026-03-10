import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChannelRecord } from '@/components/app/types';
import { LiveChannelRow } from '@/components/live/LiveChannelRow';

type VirtualizedLiveChannelListProps = {
  channels: ChannelRecord[];
  epgNowByChannelId?: Record<number, string>;
  activeChannelId: number | null;
  playingChannelId: number | null;
  onPlay: (channel: ChannelRecord) => void;
  onToggleFavorite: (channel: ChannelRecord) => void;
  className?: string;
};

const ESTIMATED_ROW_HEIGHT_PX = 80;
const ROW_GAP_PX = 8;
const OVERSCAN_ROWS = 8;

function initialViewportHeight() {
  if (typeof window === 'undefined') {
    return 0;
  }
  return Math.max(window.innerHeight, ESTIMATED_ROW_HEIGHT_PX * 5);
}

export function VirtualizedLiveChannelList({
  channels,
  epgNowByChannelId,
  activeChannelId,
  playingChannelId,
  onPlay,
  onToggleFavorite,
  className = '',
}: VirtualizedLiveChannelListProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: channels.length,
    getScrollElement: () => containerRef.current,
    getItemKey: (index) => channels[index]?.id ?? index,
    initialRect: {
      width: 0,
      height: initialViewportHeight(),
    },
    estimateSize: () => ESTIMATED_ROW_HEIGHT_PX,
    overscan: OVERSCAN_ROWS,
    gap: ROW_GAP_PX,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();

  return (
    <div
      ref={containerRef}
      className={`h-full min-h-0 overflow-y-auto pr-1 ${className}`}
    >
      <section
        className="relative"
        style={{ height: rowVirtualizer.getTotalSize() }}
      >
        {virtualRows.map((virtualRow) => {
          const channel = channels[virtualRow.index];
          if (!channel) {
            return null;
          }

          return (
            <div
              key={virtualRow.key}
              ref={rowVirtualizer.measureElement}
              data-index={virtualRow.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <LiveChannelRow
                channel={channel}
                epgNowTitle={epgNowByChannelId?.[channel.id] ?? null}
                isActive={activeChannelId === channel.id}
                isPlaying={playingChannelId === channel.id}
                onPlay={onPlay}
                onToggleFavorite={onToggleFavorite}
              />
            </div>
          );
        })}
      </section>
    </div>
  );
}
