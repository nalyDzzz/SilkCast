import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Play, Tv } from 'lucide-react';
import type { ChannelRecord } from '@/components/app/types';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export function MediaRail({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {action}
      </div>
      <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
        {children}
      </div>
    </section>
  );
}

export function BrowseTile({
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
      className="group flex items-center gap-4 rounded-xl border bg-card/80 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
    >
      <span className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary [&_svg]:size-5">
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

export function ChannelTile({
  channel,
  onPlay,
}: {
  channel: ChannelRecord;
  onPlay: (channel: ChannelRecord) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPlay(channel)}
      className="group flex w-40 shrink-0 snap-start flex-col gap-2 rounded-xl border bg-card/80 p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
      aria-label={`Play ${channel.name}`}
    >
      <span className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg bg-muted">
        {channel.logo ? (
          <img
            src={channel.logo}
            alt=""
            loading="lazy"
            className="size-full object-contain p-2"
          />
        ) : (
          <Tv className="size-6 text-muted-foreground" />
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
          <Play className="size-7 fill-white text-white" />
        </span>
      </span>
      <span className="truncate text-sm font-medium">{channel.name}</span>
    </button>
  );
}

export function PosterTile({
  item,
  progress,
  subtitle,
  onSelect,
}: {
  item: ChannelRecord;
  progress: number | null;
  subtitle: string;
  onSelect: (item: ChannelRecord) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className="group w-36 shrink-0 snap-start space-y-2 text-left"
      aria-label={`Open ${item.name}`}
    >
      <span
        className={cn(
          'relative block aspect-2/3 overflow-hidden rounded-xl border bg-muted shadow-sm transition group-hover:-translate-y-0.5 group-hover:shadow-md'
        )}
      >
        {item.logo ? (
          <img
            src={item.logo}
            alt=""
            loading="lazy"
            className="size-full object-cover"
          />
        ) : (
          <span className="flex size-full items-center justify-center bg-linear-to-br from-sky-600 to-indigo-800 p-3 text-center text-sm font-semibold text-white">
            {item.name}
          </span>
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition group-hover:opacity-100">
          <Play className="size-8 fill-white text-white" />
        </span>
        {progress !== null ? (
          <span className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
            <span
              className="block h-full bg-sky-400"
              style={{ width: `${progress * 100}%` }}
            />
          </span>
        ) : null}
      </span>
      <span className="block truncate text-sm font-medium">{item.name}</span>
      <span className="block truncate text-xs text-muted-foreground">
        {subtitle}
      </span>
    </button>
  );
}
