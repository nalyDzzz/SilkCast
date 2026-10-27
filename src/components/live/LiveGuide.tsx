import { memo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Tv } from 'lucide-react';
import type { ChannelRecord } from '@/components/app/types';
import { TagBadges } from '@/components/catalog/TagBadges';
import { useChannelSchedules } from '@/components/epg/useChannelSchedules';
import { cleanName } from '@/lib/catalog/cleanName';
import { type GuideWindow, guideWindow, layoutProgrammes, windowOffset } from '@/lib/epg/guideWindow';
import type { EpgProgramme } from '@/lib/epg/schedule';
import { formatClockTime } from '@/lib/player/formatTime';
import { cn } from '@/lib/utils';

const ROW_HEIGHT_PX = 64;
const OVERSCAN_ROWS = 6;
const CHANNEL_COLUMN = 'w-60 shrink-0';

const pct = (fraction: number) => `${fraction * 100}%`;

function NowLine({ timeWindow, nowSeconds }: { timeWindow: GuideWindow; nowSeconds: number }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 z-10 w-0.5 -translate-x-1/2 bg-live shadow-[0_0_8px_var(--live)]"
      style={{ left: pct(windowOffset(nowSeconds, timeWindow)) }}
    />
  );
}

const GuideRow = memo(function GuideRow({
  channel,
  programmes,
  timeWindow,
  nowSeconds,
  hasSchedule,
  onPlay,
}: {
  channel: ChannelRecord;
  programmes: EpgProgramme[];
  timeWindow: GuideWindow;
  nowSeconds: number;
  hasSchedule: boolean;
  onPlay: (channel: ChannelRecord) => void;
}) {
  const { title, tags } = cleanName(channel.name);
  const blocks = layoutProgrammes(programmes, timeWindow, nowSeconds);

  return (
    <div className="flex h-16 border-b border-border/70">
      <button
        type="button"
        onClick={() => onPlay(channel)}
        aria-label={`Watch ${title}`}
        className={cn(
          CHANNEL_COLUMN,
          'flex items-center gap-3 px-3 text-left transition-colors hover:bg-foreground/[0.04] focus-visible:bg-foreground/[0.06] focus-visible:outline-none'
        )}
      >
        <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-foreground/[0.06]">
          {channel.logo ? (
            <img src={channel.logo} alt="" loading="lazy" className="size-full object-contain p-0.5" />
          ) : (
            <Tv className="size-4 text-muted-foreground" />
          )}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{title}</span>
          <TagBadges tags={tags} max={2} className="mt-1" />
        </span>
      </button>
      <div className="relative min-w-0 flex-1">
        {blocks.map(({ programme, left, width, state, clippedStart }) => (
          <button
            key={`${programme.start}-${programme.title}`}
            type="button"
            onClick={() => onPlay(channel)}
            title={`${programme.title}\n${formatClockTime(programme.start)} – ${formatClockTime(programme.end)}`}
            className="absolute inset-y-1.5 px-[2px] focus-visible:outline-none [&:focus-visible>span]:ring-2 [&:focus-visible>span]:ring-ring"
            style={{ left: pct(left), width: pct(width) }}
          >
            <span
              className={cn(
                'flex h-full min-w-0 flex-col justify-center overflow-hidden rounded-lg border px-2.5 text-left transition-colors',
                state === 'past' && 'border-transparent bg-foreground/[0.025] text-muted-foreground/70',
                state === 'now' && 'border-thread/45 bg-primary/16 hover:bg-primary/24',
                state === 'next' && 'border-border bg-card hover:bg-accent'
              )}
            >
              <span className="truncate text-[13px] font-semibold">
                {clippedStart ? '‹ ' : ''}
                {programme.title}
              </span>
              {width > 0.08 ? (
                <span className="truncate text-[11px] text-muted-foreground tabular-nums">
                  {formatClockTime(programme.start)} – {formatClockTime(programme.end)}
                </span>
              ) : null}
            </span>
          </button>
        ))}
        {blocks.length === 0 ? (
          <span className="absolute inset-y-1.5 left-0.5 flex items-center px-3 text-[13px] text-muted-foreground/70">
            {!hasSchedule
              ? 'No guide data'
              : programmes.every((programme) => programme.end <= timeWindow.start)
                ? 'Guide out of date: refresh it from the source menu'
                : 'Nothing listed in this window'}
          </span>
        ) : null}
        <NowLine timeWindow={timeWindow} nowSeconds={nowSeconds} />
      </div>
    </div>
  );
});

/**
 * The guide view: one timeline lane per channel over the next few hours, cut
 * by the NOW line. Picking a programme or channel starts watching it.
 */
export function LiveGuide({
  channels,
  nowSeconds,
  guideEnabled,
  onPlay,
}: {
  channels: ChannelRecord[];
  nowSeconds: number;
  guideEnabled: boolean;
  onPlay: (channel: ChannelRecord) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const timeWindow = guideWindow(nowSeconds);
  const virtualizer = useVirtualizer({
    count: channels.length,
    getScrollElement: () => containerRef.current,
    getItemKey: (index) => channels[index]?.id ?? index,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: OVERSCAN_ROWS,
  });
  const rows = virtualizer.getVirtualItems();
  const schedules = useChannelSchedules(
    rows.map((row) => channels[row.index]?.id).filter((id): id is number => id !== undefined),
    { limit: 8, enabled: guideEnabled }
  );
  const nowLeft = windowOffset(nowSeconds, timeWindow);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card/40">
      <div className="flex h-11 shrink-0 border-b border-border bg-card/80">
        <div className={cn(CHANNEL_COLUMN, 'flex items-center px-3 text-xs font-medium text-muted-foreground')}>
          {new Date(nowSeconds * 1000).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}
        </div>
        <div className="relative min-w-0 flex-1">
          {timeWindow.ticks.map((tick) => {
            const left = windowOffset(tick, timeWindow);
            // Keep the NOW flag readable: drop a label that would sit under it.
            const hideLabel = left <= nowLeft && nowLeft - left < 0.07;
            return (
              <span
                key={tick}
                className="absolute inset-y-0 flex items-center border-l border-border/70 pl-2 text-xs text-muted-foreground tabular-nums"
                style={{ left: pct(left) }}
              >
                {hideLabel ? null : formatClockTime(tick)}
              </span>
            );
          })}
          <span
            className="absolute top-1/2 z-10 -translate-1/2 rounded-md bg-live px-1.5 py-0.5 text-[11px] font-bold text-white tabular-nums shadow-[0_0_10px_var(--live)]"
            style={{ left: pct(nowLeft) }}
          >
            {formatClockTime(nowSeconds)}
          </span>
        </div>
      </div>
      <div ref={containerRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
          {rows.map((row) => {
            const channel = channels[row.index];
            if (!channel) return null;
            return (
              <div
                key={row.key}
                className="absolute inset-x-0 top-0"
                style={{ transform: `translateY(${row.start}px)` }}
              >
                <GuideRow
                  channel={channel}
                  programmes={schedules[channel.id] ?? []}
                  hasSchedule={(schedules[channel.id] ?? []).length > 0}
                  timeWindow={timeWindow}
                  nowSeconds={nowSeconds}
                  onPlay={onPlay}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
