import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Film, Tv, TvMinimal } from 'lucide-react';
import type { ChannelRecord } from '@/components/app/types';
import { ThreadProgress } from '@/components/brand/ThreadProgress';
import { TagBadges } from '@/components/catalog/TagBadges';
import type { ContinueItem } from '@/components/home/homeItems';
import { formatSecondsLeft } from '@/components/home/homeItems';
import { Skeleton } from '@/components/ui/skeleton';
import { cleanName } from '@/lib/catalog/cleanName';
import { type EpgProgramme, formatTimeLeft, programmeProgress } from '@/lib/epg/schedule';

export function HomeRail({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3 px-8">
        <h2 className="text-lg font-semibold tracking-tight">
          {title}
          {subtitle ? (
            <span className="ml-3 text-sm font-normal text-muted-foreground">{subtitle}</span>
          ) : null}
        </h2>
        {action}
      </div>
      <div className="flex gap-3 overflow-x-auto px-8 pb-3 [scrollbar-width:thin]">
        {children}
      </div>
    </section>
  );
}

function PosterThumb({ item }: { item: ChannelRecord }) {
  return item.logo ? (
    <img src={item.logo} alt="" loading="lazy" className="size-full object-cover" />
  ) : (
    <span className="grid size-full place-items-center bg-linear-to-br from-primary/60 to-secondary">
      {item.media_kind === 'series' ? (
        <TvMinimal className="size-5 text-foreground/70" />
      ) : (
        <Film className="size-5 text-foreground/70" />
      )}
    </span>
  );
}

/** A watch-history ticket: poster, title, what's left, and the thread. */
export function ContinueCard({
  entry,
  onOpen,
}: {
  entry: ContinueItem;
  onOpen: (item: ChannelRecord) => void;
}) {
  const { item, progress, secondsLeft } = entry;
  const { title, year } = cleanName(item.name);
  const group = cleanName(item.group_name).title;
  const detail = item.media_kind === 'series' ? ['Series', group] : [year, group];

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      aria-label={`${progress !== null ? 'Resume' : 'Open'} ${title}`}
      className="group relative flex h-28 w-[300px] shrink-0 overflow-hidden rounded-xl border border-border bg-card text-left transition-colors hover:border-thread/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span className="block h-full w-[75px] shrink-0 overflow-hidden bg-muted">
        <PosterThumb item={item} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col p-3.5">
        <span className="truncate font-semibold">{title}</span>
        <span className="truncate text-xs text-muted-foreground">
          {detail.filter(Boolean).join(' · ')}
        </span>
        <span className="mt-auto flex items-center justify-between gap-2 text-xs text-muted-foreground tabular-nums">
          {secondsLeft !== null ? formatSecondsLeft(secondsLeft) : item.media_kind === 'series' ? 'Pick an episode' : 'Start watching'}
        </span>
        {progress !== null ? (
          <ThreadProgress value={progress} className="mt-2.5" label={`${Math.round(progress * 100)}% watched`} />
        ) : (
          <span className="mt-2.5 block h-[2px] rounded-full bg-foreground/10" />
        )}
      </span>
    </button>
  );
}

/** A live channel with what it's showing right now. */
export function OnNowCard({
  channel,
  programme,
  nowSeconds,
  onPlay,
}: {
  channel: ChannelRecord;
  programme: EpgProgramme | null;
  nowSeconds: number;
  onPlay: (channel: ChannelRecord) => void;
}) {
  const { title, tags } = cleanName(channel.name);

  return (
    <button
      type="button"
      onClick={() => onPlay(channel)}
      aria-label={`Play ${title}`}
      className="group flex w-[300px] shrink-0 items-center gap-3.5 rounded-xl border border-border bg-card p-3.5 text-left transition-colors hover:border-thread/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-foreground/[0.06]">
        {channel.logo ? (
          <img src={channel.logo} alt="" loading="lazy" className="size-full object-contain p-1" />
        ) : (
          <Tv className="size-5 text-muted-foreground" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="truncate">{title}</span>
          {programme ? (
            <span className="flex shrink-0 items-center gap-1 text-[10px] font-bold tracking-wider text-live">
              <span className="size-1.5 rounded-full bg-live" />
              LIVE
            </span>
          ) : (
            <TagBadges tags={tags} max={1} />
          )}
        </span>
        <span className="block truncate font-semibold">
          {programme ? programme.title : 'No guide data'}
        </span>
        {programme ? (
          <span className="mt-2 flex items-center gap-2.5">
            <ThreadProgress value={programmeProgress(programme, nowSeconds)} live className="flex-1" />
            <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
              {formatTimeLeft(programme.end, nowSeconds).replace(' left', '')}
            </span>
          </span>
        ) : null}
      </span>
    </button>
  );
}

export function LibraryTile({
  to,
  icon,
  label,
  count,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  /** undefined while loading, null when unknown. */
  count: number | null | undefined;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3.5 rounded-xl border border-border bg-card px-4 py-3.5 transition-colors hover:border-thread/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span className="grid size-10 place-items-center rounded-lg bg-primary/12 text-thread [&_svg]:size-5">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block font-semibold">{label}</span>
        <span className="block text-sm text-muted-foreground tabular-nums">
          {count === undefined ? (
            <Skeleton className="mt-1 h-4 w-16" />
          ) : count === null ? (
            'Browse'
          ) : (
            `${count.toLocaleString()} available`
          )}
        </span>
      </span>
    </Link>
  );
}
