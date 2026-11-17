import { useMemo, useState } from 'react';
import { Play, RotateCw } from 'lucide-react';
import type {
  ChannelRecord,
  SeriesEpisodeRecord,
} from '@/components/app/types';
import { ThreadProgress } from '@/components/brand/ThreadProgress';
import {
  DetailsError,
  FavoriteButton,
  TrailerButton,
  detailsActionButton,
} from '@/components/details/DetailsActions';
import { Credits, FactsRow, Plot } from '@/components/details/DetailsFacts';
import { DetailsLayout, DetailsTitle } from '@/components/details/DetailsLayout';
import { DetailsEyebrow } from '@/components/details/DetailsPoster';
import { backdropFor, detailFacts, posterFor } from '@/components/details/detailsFormat';
import { useMediaDetails } from '@/components/details/mediaDetailsStore';
import { resumeKeyFor } from '@/components/player/hooks/useResumeTracking';
import {
  cleanEpisodeTitle,
  formatEpisodeCode,
  groupEpisodesBySeason,
} from '@/components/media/seriesEpisodes';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatPlaybackTime } from '@/lib/player/formatTime';
import { getResumeEntries, type ResumeEntry } from '@/lib/player/playerStorage';
import { cleanName } from '@/lib/catalog/cleanName';
import { cn } from '@/lib/utils';

type SeriesEpisodeListProps = {
  series: ChannelRecord;
  episodes: SeriesEpisodeRecord[];
  episodeRecords: ChannelRecord[];
  loading: boolean;
  error: string | null;
  playingSeriesId: number | null;
  backLabel: string;
  onBack: () => void;
  onRetry: () => void;
  onPlayEpisode: (episode: SeriesEpisodeRecord) => void;
  onToggleFavorite: (series: ChannelRecord) => void;
};

function EpisodeRow({
  series,
  episode,
  resume,
  highlighted,
  disabled,
  onPlay,
}: {
  series: ChannelRecord;
  episode: SeriesEpisodeRecord;
  resume: ResumeEntry | null;
  highlighted: boolean;
  disabled: boolean;
  onPlay: () => void;
}) {
  const title = cleanEpisodeTitle(series.name, episode.title) || 'Untitled episode';
  const progress = resume ? Math.min(resume.position / resume.duration, 1) : 0;

  return (
    <button
      type="button"
      className={cn(
        'group flex w-full items-center gap-5 rounded-xl border px-4 py-3.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60',
        highlighted ? 'border-thread/40 bg-primary/10' : 'border-transparent hover:bg-foreground/[0.04]'
      )}
      onClick={onPlay}
      disabled={disabled}
      aria-label={`Play ${formatEpisodeCode(episode)} ${title}`}
    >
      <span className="w-9 shrink-0 text-2xl font-light text-muted-foreground tabular-nums">
        {String(episode.episode_number).padStart(2, '0')}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{title}</span>
        <span className="block text-[13px] text-muted-foreground">
          {formatEpisodeCode(episode)}
          {resume ? ` · ${formatPlaybackTime(resume.position)} watched` : ''}
        </span>
        {resume ? <ThreadProgress value={progress} className="mt-2.5 max-w-64" /> : null}
      </span>
      <span className="grid size-10 shrink-0 place-items-center rounded-full border border-border transition-colors group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground">
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
  backLabel,
  onBack,
  onRetry,
  onPlayEpisode,
  onToggleFavorite,
}: SeriesEpisodeListProps) {
  // The episode list caches the series details, so ask once it has loaded.
  const detailsQuery = useMediaDetails(series, { enabled: !loading });
  const details = detailsQuery.details;
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

  const facts = detailFacts(series, details);
  const groupTitle = cleanName(series.group_name).title;
  const firstEpisode = seasons[0]?.episodes[0] ?? null;
  const primaryEpisode = continueEpisode ?? firstEpisode;
  const counts = loading
    ? ['Loading episodes…']
    : episodes.length === 0
      ? []
      : [
          `${seasons.length} ${seasons.length === 1 ? 'season' : 'seasons'}`,
          `${episodes.length} ${episodes.length === 1 ? 'episode' : 'episodes'}`,
        ];

  const header = (
    <>
      <DetailsEyebrow>Series{groupTitle ? ` · ${groupTitle}` : ''}</DetailsEyebrow>
      <DetailsTitle>{facts.title}</DetailsTitle>
      <FactsRow className="mt-4" facts={{ ...facts, runtime: null }} extra={counts} />
      <Plot className="mt-5" plot={details?.plot ?? null} loading={detailsQuery.loading} />
      <Credits className="mt-5" details={details} />
      <DetailsError error={detailsQuery.error} onRetry={detailsQuery.retry} />
      <div className="mt-7 flex flex-wrap items-center gap-3">
        {primaryEpisode ? (
          <Button
            type="button"
            autoFocus
            className={detailsActionButton}
            disabled={isStarting}
            onClick={() => onPlayEpisode(primaryEpisode)}
          >
            <Play className="fill-current" />
            {continueEpisode ? 'Resume' : 'Play'} {formatEpisodeCode(primaryEpisode)}
          </Button>
        ) : null}
        <TrailerButton url={details?.trailer_url} />
        <FavoriteButton title={facts.title} isFavorite={series.is_favorite} onToggle={() => onToggleFavorite(series)} />
      </div>
    </>
  );

  return (
    <DetailsLayout
      kind="series"
      poster={posterFor(series, details)}
      backdrop={backdropFor(details)}
      backLabel={backLabel}
      onBack={onBack}
      header={header}
    >
      <div className="mt-10 max-w-5xl">
        {error ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <span>Couldn&apos;t load episodes: {error}</span>
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              <RotateCw />
              Retry
            </Button>
          </div>
        ) : null}

        {seasons.length > 1 ? (
          <div role="tablist" aria-label="Seasons" className="mt-5 flex flex-wrap gap-6 border-b border-border px-1">
            {seasons.map((group) => (
              <button
                key={group.season}
                type="button"
                role="tab"
                aria-selected={group.season === activeSeason}
                onClick={() => setChosenSeason(group.season)}
                className="relative pb-3 text-[15px] font-semibold text-muted-foreground transition-colors after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-thread after:opacity-0 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-selected:text-foreground aria-selected:after:opacity-100"
              >
                Season {group.season}
              </button>
            ))}
          </div>
        ) : null}

        <div className="mt-3">
          {loading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : !error && episodes.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              The provider didn&apos;t return any episodes for this series.
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              {seasonEpisodes.map((episode) => (
                <EpisodeRow
                  key={episode.episode_id}
                  series={series}
                  episode={episode}
                  resume={resumeByStreamUrl.get(episode.stream_url) ?? null}
                  highlighted={continueEpisode?.episode_id === episode.episode_id}
                  disabled={isStarting}
                  onPlay={() => onPlayEpisode(episode)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </DetailsLayout>
  );
}
