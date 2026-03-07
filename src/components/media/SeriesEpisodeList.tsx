import { ChannelRecord, SeriesEpisodeRecord } from '@/components/app/types';
import { Button } from '@/components/ui/button';

type SeriesEpisodeListProps = {
  series: ChannelRecord;
  episodes: SeriesEpisodeRecord[];
  loading: boolean;
  error: string | null;
  playingSeriesId: number | null;
  onBack: () => void;
  onPlayEpisode: (episode: SeriesEpisodeRecord) => void;
};

function formatEpisodeLabel(episode: SeriesEpisodeRecord) {
  const season = String(Math.max(episode.season_number, 1)).padStart(2, '0');
  const number = String(Math.max(episode.episode_number, 1)).padStart(2, '0');
  return `S${season}E${number}`;
}

export function SeriesEpisodeList({
  series,
  episodes,
  loading,
  error,
  playingSeriesId,
  onBack,
  onPlayEpisode,
}: SeriesEpisodeListProps) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 rounded-xl border bg-card/80 p-3 backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Episodes
          </p>
          <h2 className="text-lg font-semibold">{series.name}</h2>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onBack}>
          Back to series
        </Button>
      </div>

      {loading ? (
        <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          Loading episodes...
        </p>
      ) : null}

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {!loading && !error && episodes.length === 0 ? (
        <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          No episodes were returned for this series.
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="flex flex-col gap-2">
          {episodes.map((episode) => (
            <button
              key={episode.episode_id}
              type="button"
              className="flex w-full items-center justify-between rounded-lg border bg-background/80 px-3 py-2 text-left transition hover:border-primary/40 hover:bg-accent"
              onClick={() => onPlayEpisode(episode)}
              disabled={playingSeriesId === series.id}
              aria-label={`Play ${episode.title}`}
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold text-muted-foreground">
                  {formatEpisodeLabel(episode)}
                </p>
                <p className="truncate text-sm font-medium">{episode.title}</p>
              </div>
              <span className="text-xs font-medium text-primary">
                {playingSeriesId === series.id ? 'Starting...' : 'Play'}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
