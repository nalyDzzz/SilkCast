import { useMemo, useState } from 'react';
import { ArrowLeft, Play, RotateCw, TvMinimal } from 'lucide-react';
import type {
  ChannelRecord,
  SeriesEpisodeRecord,
} from '@/components/app/types';
import { resumeKeyFor } from '@/components/player/hooks/useResumeTracking';
import {
  cleanEpisodeTitle,
  formatEpisodeCode,
  groupEpisodesBySeason,
} from '@/components/media/seriesEpisodes';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatPlaybackTime } from '@/lib/player/formatTime';
import { getResumeEntries, type ResumeEntry } from '@/lib/player/playerStorage';
import { displayTitle } from '@/lib/catalog/cleanName';

type SeriesEpisodeListProps = {
  series: ChannelRecord;
  episodes: SeriesEpisodeRecord[];
  episodeRecords: ChannelRecord[];
  loading: boolean;
  error: string | null;
  playingSeriesId: number | null;
  onBack: () => void;
  onRetry: () => void;
  onPlayEpisode: (episode: SeriesEpisodeRecord) => void;
};

function EpisodeRow({
  series,
  episode,
  resume,
  disabled,
  onPlay,
}: {
  series: ChannelRecord;
  episode: SeriesEpisodeRecord;
  resume: ResumeEntry | null;
  disabled: boolean;
  onPlay: () => void;
}) {
  const title =
    cleanEpisodeTitle(series.name, episode.title) || 'Untitled episode';
  const progress = resume ? Math.min(resume.position / resume.duration, 1) : 0;

  return (
    <button
      type="button"
      className="group flex w-full items-center gap-4 rounded-lg border bg-background/80 px-4 py-3 text-left transition hover:border-primary/40 hover:bg-accent disabled:opacity-60"
      onClick={onPlay}
      disabled={disabled}
      aria-label={`Play ${formatEpisodeCode(episode)} ${title}`}
    >
      <span className="w-10 shrink-0 text-center text-lg font-semibold text-muted-foreground tabular-nums">
        {episode.episode_number}
      </span>
      <span className="min-w-0 flex-1 space-y-1">
        <span className="block truncate font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">
          {formatEpisodeCode(episode)}
          {resume ? ` · ${formatPlaybackTime(resume.position)} watched` : ''}
        </span>
        {resume ? (
          <span className="block h-1 w-full max-w-60 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full bg-primary"
              style={{ width: `${progress * 100}%` }}
            />
          </span>
        ) : null}
      </span>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full border bg-background transition group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground">
        <Play className="size-4 translate-x-px fill-current" />
      </span>
    </button>
  );
}

export function SeriesEpisodeList({
  series,
  episodes,
  episodeRecords,
  loading,
  error,
  playingSeriesId,
  onBack,
  onRetry,
  onPlayEpisode,
}: SeriesEpisodeListProps) {
  const seasons = useMemo(() => groupEpisodesBySeason(episodes), [episodes]);

  // Read once per episode list; positions are saved while the player is open.
  const resumeByStreamUrl = useMemo(() => {
    const entries = getResumeEntries();
    const map = new Map<string, ResumeEntry>();
    for (const record of episodeRecords) {
      const entry = entries[resumeKeyFor(record)];
      if (entry) {
        map.set(record.stream_url, entry);
      }
    }
    return map;
  }, [episodeRecords]);

  const continueEpisode = useMemo(() => {
    let latest: { episode: SeriesEpisodeRecord; updatedAt: number } | null =
      null;
    for (const episode of episodes) {
      const entry = resumeByStreamUrl.get(episode.stream_url);
      if (entry && (!latest || entry.updatedAt > latest.updatedAt)) {
        latest = { episode, updatedAt: entry.updatedAt };
      }
    }
    return latest?.episode ?? null;
  }, [episodes, resumeByStreamUrl]);

  const [chosenSeason, setChosenSeason] = useState<number | null>(null);
  const activeSeason =
    chosenSeason ??
    (continueEpisode ? Math.max(continueEpisode.season_number, 1) : null) ??
    seasons[0]?.season ??
    1;
  const seasonEpisodes =
    seasons.find((group) => group.season === activeSeason)?.episodes ?? [];
  const isStarting = playingSeriesId === series.id;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 rounded-xl border bg-card/80 p-4 backdrop-blur">
      <div className="flex items-start gap-4">
        {series.logo ? (
          <img
            src={series.logo}
            alt=""
            className="hidden aspect-2/3 w-20 shrink-0 rounded-md object-cover shadow sm:block"
          />
        ) : (
          <div className="hidden aspect-2/3 w-20 shrink-0 items-center justify-center rounded-md bg-muted sm:flex">
            <TvMinimal className="size-6 text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-2"
            onClick={onBack}
          >
            <ArrowLeft />
            All series
          </Button>
          <h2 className="truncate text-xl font-semibold">{displayTitle(series.name)}</h2>
          <p className="text-sm text-muted-foreground">
            {loading
              ? 'Loading episodes…'
              : `${episodes.length} episodes · ${seasons.length} ${seasons.length === 1 ? 'season' : 'seasons'}`}
          </p>
          {continueEpisode ? (
            <Button
              type="button"
              size="sm"
              disabled={isStarting}
              onClick={() => onPlayEpisode(continueEpisode)}
            >
              <Play className="fill-current" />
              Resume {formatEpisodeCode(continueEpisode)}
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <span>Couldn't load episodes: {error}</span>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            <RotateCw />
            Retry
          </Button>
        </div>
      ) : null}

      {seasons.length > 1 ? (
        <Tabs
          value={String(activeSeason)}
          onValueChange={(value) => setChosenSeason(Number(value))}
        >
          <TabsList className="h-auto max-w-full flex-wrap justify-start">
            {seasons.map((group) => (
              <TabsTrigger key={group.season} value={String(group.season)}>
                Season {group.season}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {loading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : !error && episodes.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            The provider didn't return any episodes for this series.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {seasonEpisodes.map((episode) => (
              <EpisodeRow
                key={episode.episode_id}
                series={series}
                episode={episode}
                resume={resumeByStreamUrl.get(episode.stream_url) ?? null}
                disabled={isStarting}
                onPlay={() => onPlayEpisode(episode)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
