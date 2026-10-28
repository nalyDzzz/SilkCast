import { type KeyboardEvent, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { ChannelRecord } from '@/components/app/types';
import { useChannelSchedules } from '@/components/epg/useChannelSchedules';
import { LiveChannelRow } from '@/components/live/LiveChannelRow';
import { scheduleSlots } from '@/lib/epg/schedule';

type LiveChannelListProps = {
  channels: ChannelRecord[];
  selectedId: number | null;
  playingId: number | null;
  nowSeconds: number;
  /** Stored guide data is only read for Xtream sources. */
  guideEnabled: boolean;
  onSelect: (channel: ChannelRecord) => void;
  onWatch: (channel: ChannelRecord) => void;
  initialScrollOffset?: number;
  onScrollOffsetChange?: (offset: number) => void;
};

const ROW_HEIGHT_PX = 72;
const ROW_GAP_PX = 2;
const OVERSCAN_ROWS = 6;

function initialViewportHeight() {
  return typeof window === 'undefined' ? 0 : Math.max(window.innerHeight, ROW_HEIGHT_PX * 5);
}

/**
 * The channel column: a virtualized listbox. Arrow keys move the selection
 * (which drives the preview), Enter watches the selected channel.
 */
export function LiveChannelList({
  channels,
  selectedId,
  playingId,
  nowSeconds,
  guideEnabled,
  onSelect,
  onWatch,
  initialScrollOffset = 0,
  onScrollOffsetChange,
}: LiveChannelListProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: channels.length,
    getScrollElement: () => containerRef.current,
    getItemKey: (index) => channels[index]?.id ?? index,
    initialRect: { width: 0, height: initialViewportHeight() },
    estimateSize: () => ROW_HEIGHT_PX,
    gap: ROW_GAP_PX,
    overscan: OVERSCAN_ROWS,
    initialOffset: initialScrollOffset,
    onChange: (instance) => onScrollOffsetChange?.(instance.scrollOffset ?? 0),
  });
  const virtualRows = virtualizer.getVirtualItems();
  const schedules = useChannelSchedules(
    virtualRows.map((row) => channels[row.index]?.id).filter((id): id is number => id !== undefined),
    { enabled: guideEnabled }
  );

  const selectedIndex = channels.findIndex((channel) => channel.id === selectedId);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowDown: 1, ArrowUp: -1, PageDown: 8, PageUp: -8 }[event.key];
    if (step !== undefined && channels.length > 0) {
      event.preventDefault();
      const next = Math.min(Math.max((selectedIndex === -1 ? 0 : selectedIndex) + step, 0), channels.length - 1);
      onSelect(channels[next]);
      virtualizer.scrollToIndex(next, { align: 'auto' });
      return;
    }
    if (event.key === 'Enter' && selectedIndex !== -1) {
      event.preventDefault();
      onWatch(channels[selectedIndex]);
    }
  };

  return (
    <div
      ref={containerRef}
      role="listbox"
      tabIndex={0}
      aria-label="Channels"
      aria-activedescendant={selectedId !== null ? `live-channel-${selectedId}` : undefined}
      onKeyDown={handleKeyDown}
      className="h-full min-h-0 overflow-y-auto rounded-xl p-1 outline-hidden focus-visible:ring-2 focus-visible:ring-ring/70"
    >
      <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
        {virtualRows.map((row) => {
          const channel = channels[row.index];
          if (!channel) return null;
          return (
            <div
              key={row.key}
              data-index={row.index}
              ref={virtualizer.measureElement}
              className="absolute inset-x-0 top-0"
              style={{ transform: `translateY(${row.start}px)` }}
            >
              <LiveChannelRow
                channel={channel}
                programme={scheduleSlots(schedules[channel.id] ?? [], nowSeconds).now}
                nowSeconds={nowSeconds}
                selected={channel.id === selectedId}
                playing={channel.id === playingId}
                onSelect={onSelect}
                onWatch={onWatch}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
