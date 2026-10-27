import { memo } from 'react';
import { Film, Heart, Play } from 'lucide-react';
import type { ChannelRecord } from '@/components/app/types';
import { ThreadProgress } from '@/components/brand/ThreadProgress';
import { cleanName } from '@/lib/catalog/cleanName';
import { cn } from '@/lib/utils';

type MovieCardProps = {
  movie: ChannelRecord;
  isPlaying: boolean;
  isLastPlayed: boolean;
  isPosterBroken: boolean;
  /** 0..1 resume position, movies only. */
  progress?: number | null;
  onPlay: (movie: ChannelRecord) => void;
  onToggleFavorite: (movie: ChannelRecord) => void;
  onPosterError: (movieId: number) => void;
};

/** A poster with its clean title underneath; series open, movies play. */
export const MovieCard = memo(function MovieCard({
  movie,
  isPlaying,
  isLastPlayed,
  isPosterBroken,
  progress = null,
  onPlay,
  onToggleFavorite,
  onPosterError,
}: MovieCardProps) {
  const { title, year, tags } = cleanName(movie.name);
  const meta = [year, ...tags.filter((tag) => tag !== cleanName(movie.name).region)].filter(Boolean).join(' · ');
  const favoriteLabel = movie.is_favorite ? `Remove ${title} from favorites` : `Add ${title} to favorites`;

  return (
    <article className="group relative">
      <button
        type="button"
        className="block w-full text-left focus-visible:outline-none"
        onClick={() => onPlay(movie)}
        disabled={isPlaying}
        aria-label={`${movie.media_kind === 'series' ? 'Open' : 'Play'} ${title}`}
      >
        <span
          className={cn(
            'relative block aspect-2/3 overflow-hidden rounded-xl bg-muted ring-1 ring-foreground/10 transition duration-200 group-hover:-translate-y-0.5 group-hover:ring-thread/40 group-focus-within:ring-2 group-focus-within:ring-ring',
            isLastPlayed && 'ring-2 ring-thread/70'
          )}
        >
          {movie.logo && !isPosterBroken ? (
            <img
              src={movie.logo}
              alt=""
              className="size-full object-cover"
              loading="lazy"
              onError={() => onPosterError(movie.id)}
            />
          ) : (
            <span className="flex size-full flex-col items-start justify-end gap-2 bg-linear-to-br from-primary/45 via-secondary to-background p-3">
              <Film className="size-5 text-foreground/50" />
              <span className="line-clamp-3 font-display-italic text-xl leading-tight font-semibold">{title}</span>
            </span>
          )}
          <span className="absolute inset-0 grid place-items-center bg-black/35 opacity-0 transition-opacity group-hover:opacity-100">
            <span className="grid size-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_0_24px_var(--thread)]">
              <Play className="size-5 translate-x-px fill-current" />
            </span>
          </span>
          {isPlaying ? (
            <span className="absolute inset-x-0 bottom-0 bg-black/70 py-1.5 text-center text-xs font-semibold text-white">
              Opening…
            </span>
          ) : null}
          {progress !== null && !isPlaying ? (
            <span className="absolute inset-x-2.5 bottom-2.5">
              <ThreadProgress value={progress} bead={false} className="bg-white/25" />
            </span>
          ) : null}
        </span>
        <span className="mt-2 block truncate text-sm font-medium">{title}</span>
        <span className="block h-4 truncate text-xs text-muted-foreground">{meta}</span>
      </button>
      <button
        type="button"
        aria-label={favoriteLabel}
        aria-pressed={movie.is_favorite}
        data-is-favorite={movie.is_favorite}
        onClick={() => onToggleFavorite(movie)}
        className={cn(
          'absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-opacity hover:bg-black/75 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          movie.is_favorite ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        )}
      >
        <Heart className={cn('size-4', movie.is_favorite && 'fill-thread text-thread')} />
      </button>
    </article>
  );
});
