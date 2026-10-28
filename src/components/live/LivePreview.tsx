import { ExternalLink, Heart, Play, RefreshCw, Tv } from 'lucide-react';
import type { ChannelRecord } from '@/components/app/types';
import { ThreadProgress } from '@/components/brand/ThreadProgress';
import { TagBadges } from '@/components/catalog/TagBadges';
import { useChannelSchedules } from '@/components/epg/useChannelSchedules';
import { Button } from '@/components/ui/button';
import { cleanName } from '@/lib/catalog/cleanName';
import {
  type EpgProgramme,
  formatStartsIn,
  formatTimeLeft,
  programmeProgress,
  scheduleSlots,
} from '@/lib/epg/schedule';
import { formatClockTime } from '@/lib/player/formatTime';
import { cn } from '@/lib/utils';

type LivePreviewProps = {
  channel: ChannelRecord;
  nowSeconds: number;
  guideEnabled: boolean;
  guideStatus: string | null;
  isRefreshingGuide: boolean;
  mpvAvailable: boolean;
  onWatch: (channel: ChannelRecord) => void;
  onToggleFavorite: (channel: ChannelRecord) => void;
  onOpenInMpv: (channel: ChannelRecord) => void;
  onRefreshGuide: () => void;
};

function SlotCard({
  label,
  programme,
  detail,
  current = false,
}: {
  label: string;
  programme: EpgProgramme | null;
  detail: string | null;
  current?: boolean;
}) {
  return (
    <div
      className={cn(
        'min-w-0 rounded-xl border p-4',
        current ? 'border-thread/35 bg-primary/10' : 'border-border bg-card'
      )}
    >
      <p className={cn('text-[11px] font-semibold tracking-[0.12em] uppercase', current ? 'text-thread' : 'text-muted-foreground')}>
        {label}
      </p>
      <p className="mt-1 truncate font-semibold">{programme ? programme.title : 'Nothing listed'}</p>
      {programme ? (
        <p className="truncate text-xs text-muted-foreground tabular-nums">
          {formatClockTime(programme.start)} – {formatClockTime(programme.end)}
        </p>
      ) : null}
      {detail ? <p className="mt-1.5 line-clamp-2 text-[13px] text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

/**
 * The theatre's stage: the selected channel, what it's showing, and what's
 * next. It doesn't stream: providers often allow one connection, so playback
 * only starts on Watch.
 */
export function LivePreview({
  channel,
  nowSeconds,
  guideEnabled,
  guideStatus,
  isRefreshingGuide,
  mpvAvailable,
  onWatch,
  onToggleFavorite,
  onOpenInMpv,
  onRefreshGuide,
}: LivePreviewProps) {
  const { title, tags } = cleanName(channel.name);
  const schedules = useChannelSchedules([channel.id], {
    enabled: guideEnabled,
    refreshIfExhausted: true,
  });
  const { now, next, later } = scheduleSlots(schedules[channel.id] ?? [], nowSeconds);

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <div className="relative isolate aspect-video max-h-[calc(100vh-24rem)] min-h-56 w-full overflow-hidden rounded-2xl border border-border bg-card">
        {channel.logo ? (
          <img
            src={channel.logo}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 -z-20 size-full scale-150 object-cover opacity-40 blur-3xl saturate-150"
          />
        ) : null}
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_70%_at_70%_20%,color-mix(in_oklab,var(--primary)_18%,transparent),transparent_70%)]" />
        <div className="absolute inset-0 -z-10 bg-linear-to-t from-black/85 via-black/30 to-transparent" />

        <span className="absolute top-4 right-4 aspect-square w-[min(22%,132px)] rounded-2xl bg-white/[0.07] ring-1 ring-white/10 backdrop-blur-sm">
          {channel.logo ? (
            <img src={channel.logo} alt="" className="absolute inset-[14%] size-[72%] object-contain" />
          ) : (
            <Tv className="absolute inset-1/4 size-1/2 text-white/50" />
          )}
        </span>

        {now ? (
          <span className="absolute top-4 left-4 flex items-center gap-1.5 rounded-full bg-live px-2.5 py-1 text-[11px] font-bold tracking-wider text-white">
            <span className="size-1.5 rounded-full bg-white motion-safe:animate-pulse" />
            LIVE
          </span>
        ) : null}

        <div className="absolute inset-x-0 bottom-0 p-5 text-white">
          <p className="flex items-center gap-2 text-sm text-white/75">
            <span className="truncate font-medium">{title}</span>
            <TagBadges tags={tags} className="[&>span]:border-white/25 [&>span]:text-white/70" />
          </p>
          <h2 className="mt-1 line-clamp-2 text-[clamp(1.25rem,2.2vw,1.75rem)] leading-tight font-semibold">
            {now ? now.title : guideEnabled ? 'No guide data for this channel' : cleanName(channel.group_name).title}
          </h2>
          {now ? (
            <div className="mt-3 flex items-center gap-3 text-sm text-white/75 tabular-nums">
              <span>
                {formatClockTime(now.start)} – {formatClockTime(now.end)}
              </span>
              <ThreadProgress value={programmeProgress(now, nowSeconds)} live className="flex-1 bg-white/20" />
              <span>{formatTimeLeft(now.end, nowSeconds)}</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <Button className="h-11 rounded-full px-6" onClick={() => onWatch(channel)}>
          <Play className="fill-current" />
          Watch
        </Button>
        <Button
          variant="secondary"
          className="h-11 rounded-full px-5"
          aria-pressed={channel.is_favorite}
          onClick={() => onToggleFavorite(channel)}
        >
          <Heart className={cn(channel.is_favorite && 'fill-thread text-thread')} />
          {channel.is_favorite ? 'Favorited' : 'Add to favorites'}
        </Button>
        {mpvAvailable ? (
          <Button variant="outline" className="h-11 rounded-full px-5" onClick={() => onOpenInMpv(channel)}>
            <ExternalLink />
            Open in MPV
          </Button>
        ) : null}
        {guideStatus ? (
          <span className="ml-auto flex items-center gap-1 text-[13px] text-muted-foreground">
            {guideStatus}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Refresh guide"
              disabled={isRefreshingGuide}
              onClick={onRefreshGuide}
            >
              <RefreshCw className={cn(isRefreshingGuide && 'animate-spin')} />
            </Button>
          </span>
        ) : null}
      </div>

      {guideEnabled ? (
        <div className="grid grid-cols-3 gap-3">
          <SlotCard label="Now" programme={now} detail={now?.description ?? null} current />
          <SlotCard
            label="Next"
            programme={next}
            detail={next ? formatStartsIn(next.start, nowSeconds, formatClockTime) : null}
          />
          <SlotCard
            label="Later"
            programme={later}
            detail={later ? formatStartsIn(later.start, nowSeconds, formatClockTime) : null}
          />
        </div>
      ) : null}
    </div>
  );
}
