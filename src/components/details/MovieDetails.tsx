import { useMemo, useReducer } from 'react';
import { MonitorPlay, Play, RotateCcw } from 'lucide-react';
import type { ChannelRecord, Phase1Settings } from '@/components/app/types';
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
import { RelatedRail } from '@/components/details/RelatedRail';
import { backdropFor, detailFacts, posterFor } from '@/components/details/detailsFormat';
import { useMediaDetails } from '@/components/details/mediaDetailsStore';
import { formatSecondsLeft } from '@/components/home/homeItems';
import { resumeKeyFor } from '@/components/player/hooks/useResumeTracking';
import { Button } from '@/components/ui/button';
import { cleanName } from '@/lib/catalog/cleanName';
import { formatPlaybackTime } from '@/lib/player/formatTime';
import { clearResumePosition, getResumeEntry } from '@/lib/player/playerStorage';

type MovieDetailsProps = {
  movie: ChannelRecord;
  /** Playback is starting for this movie. */
  isStarting: boolean;
  preferredPlayer: Phase1Settings['preferred_player'];
  mpvAvailable: boolean;
  backLabel: string;
  onBack: () => void;
  onPlay: (movie: ChannelRecord) => void;
  onOpenInMpv: (movie: ChannelRecord, startSeconds: number | null) => void;
  onToggleFavorite: (movie: ChannelRecord) => void;
  /** Opens another movie's page from the "More in …" row. */
  onOpenRelated: (movie: ChannelRecord) => void;
};

/**
 * A movie's page: backdrop, poster, facts, plot and credits from the
 * provider, with Resume as the main action and the thread showing where the
 * viewer stopped.
 */
export function MovieDetails({
  movie,
  isStarting,
  preferredPlayer,
  mpvAvailable,
  backLabel,
  onBack,
  onPlay,
  onOpenInMpv,
  onToggleFavorite,
  onOpenRelated,
}: MovieDetailsProps) {
  const { details, loading, error, retry } = useMediaDetails(movie);
  const facts = detailFacts(movie, details);
  const group = cleanName(movie.group_name).title;

  // Bumped after "Play from start" clears the stored position.
  const [resumeVersion, rereadResume] = useReducer((version: number) => version + 1, 0);
  const resume = useMemo(() => {
    void resumeVersion;
    const entry = getResumeEntry(resumeKeyFor(movie));
    return entry && entry.duration > 0 ? entry : null;
  }, [movie, resumeVersion]);

  const playsInMpv = preferredPlayer === 'mpv';
  const resumeOrPlay = () => {
    // The built-in player resumes by itself; MPV needs the position.
    if (playsInMpv && resume) {
      onOpenInMpv(movie, Math.floor(resume.position));
    } else {
      onPlay(movie);
    }
  };
  const playFromStart = () => {
    clearResumePosition(resumeKeyFor(movie));
    rereadResume();
    onPlay(movie);
  };

  const header = (
    <>
      <DetailsEyebrow>Movie{group ? ` · ${group}` : ''}</DetailsEyebrow>
      <DetailsTitle>{facts.title}</DetailsTitle>
      <FactsRow className="mt-4" facts={facts} />
      <Plot className="mt-5" plot={details?.plot ?? null} loading={loading} />
      <Credits className="mt-5" details={details} />
      <DetailsError error={error} onRetry={retry} />

      <div className="mt-7 flex flex-wrap items-center gap-3">
        <Button type="button" autoFocus className={detailsActionButton} disabled={isStarting} onClick={resumeOrPlay}>
          <Play className="fill-current" />
          {isStarting
            ? 'Opening…'
            : resume
              ? `Resume · ${formatSecondsLeft(resume.duration - resume.position)}`
              : 'Play'}
        </Button>
        {resume ? (
          <Button type="button" variant="secondary" className={detailsActionButton} disabled={isStarting} onClick={playFromStart}>
            <RotateCcw />
            Play from start
          </Button>
        ) : null}
        {!playsInMpv && mpvAvailable ? (
          <Button
            type="button"
            variant="ghost"
            className={detailsActionButton}
            disabled={isStarting}
            onClick={() => onOpenInMpv(movie, resume ? Math.floor(resume.position) : null)}
          >
            <MonitorPlay />
            Open in MPV
          </Button>
        ) : null}
        <TrailerButton url={details?.trailer_url} />
        <FavoriteButton title={facts.title} isFavorite={movie.is_favorite} onToggle={() => onToggleFavorite(movie)} />
      </div>

      {resume ? (
        <div className="mt-5 flex max-w-md items-center gap-3 text-xs text-muted-foreground">
          <ThreadProgress
            value={resume.position / resume.duration}
            className="flex-1"
            label={`${Math.round((resume.position / resume.duration) * 100)}% watched`}
          />
          <span className="shrink-0 tabular-nums">
            Stopped at {formatPlaybackTime(resume.position)} of {formatPlaybackTime(resume.duration)}
          </span>
        </div>
      ) : null}
    </>
  );

  return (
    <DetailsLayout
      kind="movie"
      poster={posterFor(movie, details)}
      backdrop={backdropFor(details)}
      backLabel={backLabel}
      onBack={onBack}
      header={header}
    >
      <RelatedRail item={movie} onOpen={onOpenRelated} />
    </DetailsLayout>
  );
}
