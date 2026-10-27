import { memo } from 'react';
import { Heart, Tv } from 'lucide-react';
import type { ChannelRecord } from '@/components/app/types';
import { ThreadProgress } from '@/components/brand/ThreadProgress';
import { TagBadges } from '@/components/catalog/TagBadges';
import { cleanName } from '@/lib/catalog/cleanName';
import { type EpgProgramme, formatTimeLeft, programmeProgress } from '@/lib/epg/schedule';
import { cn } from '@/lib/utils';

type LiveChannelRowProps = {
  channel: ChannelRecord;
  programme: EpgProgramme | null;
  nowSeconds: number;
  selected: boolean;
  playing: boolean;
  onSelect: (channel: ChannelRecord) => void;
  onWatch: (channel: ChannelRecord) => void;
};

export const LiveChannelRow = memo(function LiveChannelRow({
  channel,
  programme,
  nowSeconds,
  selected,
  playing,
  onSelect,
  onWatch,
}: LiveChannelRowProps) {
  const { title, tags } = cleanName(channel.name);

  return (
    <div
      id={`live-channel-${channel.id}`}
      role="option"
      aria-selected={selected}
      aria-label={title}
      onClick={() => onSelect(channel)}
      onDoubleClick={() => onWatch(channel)}
      className={cn(
        'relative flex h-[72px] cursor-pointer items-center gap-3 rounded-xl border px-3 transition-colors',
        selected
          ? 'border-thread/35 bg-primary/12 before:absolute before:inset-y-3 before:-left-px before:w-[3px] before:rounded-full before:bg-thread'
          : 'border-transparent hover:bg-foreground/[0.04]'
      )}
    >
      <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-foreground/[0.06]">
        {channel.logo ? (
          <img src={channel.logo} alt="" loading="lazy" className="size-full object-contain p-0.5" />
        ) : (
          <Tv className="size-4 text-muted-foreground" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-semibold">{title}</span>
          <TagBadges tags={tags} max={2} />
          {channel.is_favorite ? (
            <Heart className="size-3 shrink-0 fill-thread text-thread" aria-label="Favorite" />
          ) : null}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
          {playing ? (
            <span className="shrink-0 text-[10px] font-bold tracking-wider text-thread">PLAYING</span>
          ) : programme ? (
            <span className="size-1.5 shrink-0 rounded-full bg-live" aria-hidden="true" />
          ) : null}
          <span className="truncate">{programme ? programme.title : cleanName(channel.group_name).title}</span>
        </span>
        {programme ? (
          <ThreadProgress value={programmeProgress(programme, nowSeconds)} bead={false} className="mt-1.5 max-w-60" />
        ) : null}
      </span>
      {programme ? (
        <span className="shrink-0 self-start pt-3.5 text-xs text-muted-foreground tabular-nums">
          {formatTimeLeft(programme.end, nowSeconds).replace(' left', '')}
        </span>
      ) : null}
    </div>
  );
});
