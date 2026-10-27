import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Film, ListVideo, Play, Tv } from 'lucide-react';
import type { ChannelRecord } from '@/components/app/types';
import { ThreadProgress } from '@/components/brand/ThreadProgress';
import { TagBadges } from '@/components/catalog/TagBadges';
import type { ContinueItem } from '@/components/home/homeItems';
import { formatSecondsLeft } from '@/components/home/homeItems';
import { Button } from '@/components/ui/button';
import { cleanName } from '@/lib/catalog/cleanName';
import { type EpgProgramme, formatTimeLeft, programmeProgress } from '@/lib/epg/schedule';
import { formatClockTime } from '@/lib/player/formatTime';
import { cn } from '@/lib/utils';

export type HeroFeature =
  | { kind: 'resume'; entry: ContinueItem }
  | { kind: 'live'; channel: ChannelRecord; programme: EpgProgramme }
  | { kind: 'welcome' };

function HeroFrame({
  art,
  backdrop,
  children,
}: {
  art?: ReactNode;
  backdrop?: string | null;
  children: ReactNode;
}) {
  return (
    <section className="relative isolate h-[460px] overflow-hidden">
      {backdrop ? (
        <img
          src={backdrop}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 -z-20 size-full scale-125 object-cover opacity-45 blur-3xl saturate-150"
        />
      ) : null}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_70%_90%_at_85%_10%,color-mix(in_oklab,var(--primary)_22%,transparent),transparent_70%)]" />
      <div className="absolute inset-0 -z-10 bg-linear-to-r from-background via-background/75 to-background/10" />
      <div className="absolute inset-x-0 bottom-0 -z-10 h-56 bg-linear-to-t from-background via-background/60 to-transparent" />
      {art ? <div className="absolute right-[7%] bottom-12 hidden md:block">{art}</div> : null}
      <div className="flex h-full max-w-[640px] flex-col justify-end px-8 pt-24 pb-14">{children}</div>
    </section>
  );
}

function Eyebrow({ children, live = false }: { children: ReactNode; live?: boolean }) {
  return (
    <p className={cn('mb-3 flex items-center gap-2 text-xs font-semibold tracking-[0.14em] uppercase', live ? 'text-live' : 'text-sheen')}>
      {live ? <span className="size-1.5 rounded-full bg-live motion-safe:animate-pulse" /> : null}
      {children}
    </p>
  );
}

function HeroTitle({ children }: { children: ReactNode }) {
  return (
    <h1 className="line-clamp-2 pb-1 font-display-italic text-[clamp(2.75rem,5vw,4.25rem)] leading-[0.98] font-medium text-balance">
      {children}
    </h1>
  );
}

function Meta({ items, tags = [] }: { items: (string | number | null | undefined)[]; tags?: string[] }) {
  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-muted-foreground">
      {items.filter(Boolean).map((item, index) => (
        <span key={index} className="flex items-center gap-2.5">
          {index > 0 ? <span aria-hidden="true" className="size-[3px] rounded-full bg-muted-foreground/60" /> : null}
          {item}
        </span>
      ))}
      <TagBadges tags={tags} />
    </p>
  );
}

const heroButton = 'h-12 rounded-full px-6 text-[15px]';

export function HomeHero({
  feature,
  nowSeconds,
  onOpen,
  onBrowseGroup,
}: {
  feature: HeroFeature;
  nowSeconds: number;
  onOpen: (item: ChannelRecord) => void;
  onBrowseGroup: (item: ChannelRecord) => void;
}) {
  if (feature.kind === 'resume') {
    const { item, progress, secondsLeft } = feature.entry;
    const { title, year, tags } = cleanName(item.name);
    const group = cleanName(item.group_name).title;
    const isSeries = item.media_kind === 'series';
    return (
      <HeroFrame
        backdrop={item.logo}
        art={
          item.logo ? (
            <img src={item.logo} alt="" className="h-[300px] rounded-xl object-cover shadow-[0_30px_60px_-20px_#000c] ring-1 ring-white/10" />
          ) : null
        }
      >
        <Eyebrow>Continue watching · {isSeries ? 'Series' : 'Movie'}</Eyebrow>
        <HeroTitle>{title}</HeroTitle>
        <Meta items={[year, group]} tags={tags} />
        {progress !== null && secondsLeft !== null ? (
          <div className="mt-5 flex max-w-sm items-center gap-3">
            <ThreadProgress value={progress} className="flex-1" label={`${Math.round(progress * 100)}% watched`} />
            <span className="shrink-0 text-sm text-muted-foreground tabular-nums">{formatSecondsLeft(secondsLeft)}</span>
          </div>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <Button className={heroButton} onClick={() => onOpen(item)}>
            {isSeries ? <ListVideo /> : <Play className="fill-current" />}
            {isSeries ? 'Episodes' : progress !== null ? 'Resume' : 'Play'}
          </Button>
          {group ? (
            <Button variant="secondary" className={heroButton} onClick={() => onBrowseGroup(item)}>
              More in {group}
            </Button>
          ) : null}
        </div>
      </HeroFrame>
    );
  }

  if (feature.kind === 'live') {
    const { channel, programme } = feature;
    const { title: channelTitle, tags } = cleanName(channel.name);
    return (
      <HeroFrame
        backdrop={channel.logo}
        art={
          channel.logo ? (
            <span className="grid size-44 place-items-center rounded-3xl bg-foreground/[0.06] p-7 shadow-[0_30px_60px_-20px_#000c] ring-1 ring-white/10 backdrop-blur">
              <img src={channel.logo} alt="" className="size-full object-contain" />
            </span>
          ) : null
        }
      >
        <Eyebrow live>On now · {channelTitle}</Eyebrow>
        <HeroTitle>{programme.title}</HeroTitle>
        <Meta
          items={[`${formatClockTime(programme.start)} – ${formatClockTime(programme.end)}`, formatTimeLeft(programme.end, nowSeconds)]}
          tags={tags}
        />
        <ThreadProgress value={programmeProgress(programme, nowSeconds)} live className="mt-5 max-w-sm" />
        <div className="mt-6 flex flex-wrap gap-3">
          <Button className={heroButton} onClick={() => onOpen(channel)}>
            <Play className="fill-current" />
            Watch
          </Button>
          <Button asChild variant="secondary" className={heroButton}>
            <Link to="/dashboard/live">Browse Live TV</Link>
          </Button>
        </div>
      </HeroFrame>
    );
  }

  return (
    <HeroFrame>
      <Eyebrow>Home</Eyebrow>
      <HeroTitle>Pick something to watch</HeroTitle>
      <p className="mt-3 max-w-md text-muted-foreground">
        Channels you favorite and the movies and series you start show up here, ready to resume.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button asChild className={heroButton}>
          <Link to="/dashboard/live">
            <Tv />
            Browse Live TV
          </Link>
        </Button>
        <Button asChild variant="secondary" className={heroButton}>
          <Link to="/dashboard/movies">
            <Film />
            Browse movies
          </Link>
        </Button>
      </div>
    </HeroFrame>
  );
}
