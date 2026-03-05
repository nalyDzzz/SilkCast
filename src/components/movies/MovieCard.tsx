import { memo } from "react";
import { Heart, Play } from "lucide-react";
import { ChannelRecord } from "@/components/app/types";
import { Button } from "@/components/ui/button";

const movieBackdropGradients = [
  "from-sky-500/80 via-indigo-600/80 to-violet-800/80",
  "from-amber-500/80 via-orange-600/80 to-rose-700/80",
  "from-emerald-500/80 via-teal-600/80 to-cyan-800/80",
  "from-fuchsia-500/80 via-pink-600/80 to-rose-800/80",
];

function gradientForMovie(name: string) {
  let hash = 0;
  for (let idx = 0; idx < name.length; idx += 1) {
    hash = (hash * 31 + name.charCodeAt(idx)) >>> 0;
  }
  return movieBackdropGradients[hash % movieBackdropGradients.length];
}

type MovieCardProps = {
  movie: ChannelRecord;
  isPlaying: boolean;
  isLastPlayed: boolean;
  isPosterBroken: boolean;
  onPlay: (movie: ChannelRecord) => void;
  onToggleFavorite: (movie: ChannelRecord) => void;
  onPosterError: (movieId: number) => void;
};

export const MovieCard = memo(function MovieCard({
  movie,
  isPlaying,
  isLastPlayed,
  isPosterBroken,
  onPlay,
  onToggleFavorite,
  onPosterError,
}: MovieCardProps) {
  return (
    <article
      className={`group overflow-hidden rounded-xl border bg-card/85 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg hover:cursor-pointer ${
        isLastPlayed ? "ring-2 ring-emerald-500/70 ring-offset-2" : ""
      }`}
    >
      <button
        type="button"
        className="relative block w-full text-left hover:cursor-pointer"
        onClick={() => onPlay(movie)}
        disabled={isPlaying}
      >
        <div className="relative aspect-2/3 overflow-hidden">
          {movie.logo && !isPosterBroken ? (
            <img
              src={movie.logo}
              alt=""
              className="h-full w-full cursor-pointer object-cover transition duration-300 group-hover:scale-[1.03]"
              loading="lazy"
              onError={() => onPosterError(movie.id)}
            />
          ) : (
            <div className={`h-full w-full bg-linear-to-br ${gradientForMovie(movie.name)}`} />
          )}
          <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/85 via-black/20 to-transparent" />
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
            <span className="line-clamp-2 text-sm font-semibold text-white">{movie.name}</span>
            <span className="rounded-full bg-black/45 p-2 text-white backdrop-blur-sm">
              {isPlaying ? (
                <span className="text-xs font-semibold">...</span>
              ) : (
                <Play size={14} />
              )}
            </span>
          </div>
        </div>
      </button>
      <div className="flex items-center justify-between gap-2 p-2">
        <p className="truncate text-xs text-muted-foreground">{movie.group_name}</p>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="group hover:text-red-500"
          data-is-favorite={movie.is_favorite}
          onClick={() => onToggleFavorite(movie)}
        >
          <Heart className="group-data-[is-favorite=true]:fill-red-500 group-data-[is-favorite=true]:text-red-500" />
        </Button>
      </div>
    </article>
  );
});
