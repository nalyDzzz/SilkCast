import { useEffect, useMemo, useState } from "react";
import { Heart, Play } from "lucide-react";
import { useNavigate } from "react-router";
import { useShallow } from "zustand/react/shallow";
import { BackendEvent, ChannelRecord, GroupRecord } from "@/components/app/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listSourceChannels, setChannelFavoriteState } from "@/lib/api/channelsApi";
import { subscribeBackendEvents } from "@/lib/api/eventsApi";
import { listSourceGroups } from "@/lib/api/sourcesApi";
import { useAppStore } from "@/store/appStore";

const ALL_MOVIE_GROUPS = "__all_movies__";

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

export function MoviesPage() {
  const navigate = useNavigate();
  const {
    selectedSourceId,
    settings,
    loadSources,
    loadSettings,
    playChannelRecord,
  } = useAppStore(
    useShallow((state) => ({
      selectedSourceId: state.selectedSourceId,
      settings: state.settings,
      loadSources: state.loadSources,
      loadSettings: state.loadSettings,
      playChannelRecord: state.playChannelRecord,
    }))
  );

  const [movies, setMovies] = useState<ChannelRecord[]>([]);
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [selectedGroup, setSelectedGroup] = useState(ALL_MOVIE_GROUPS);
  const [query, setQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playingMovieId, setPlayingMovieId] = useState<number | null>(null);
  const [lastPlayedMovieId, setLastPlayedMovieId] = useState<number | null>(null);
  const [playbackMessage, setPlaybackMessage] = useState<string | null>(null);
  const [lastPlayedMovieUrl, setLastPlayedMovieUrl] = useState<string | null>(null);
  const [brokenPosterIds, setBrokenPosterIds] = useState<Record<number, true>>({});

  const selectedGroupName = useMemo(
    () => (selectedGroup === ALL_MOVIE_GROUPS ? null : selectedGroup),
    [selectedGroup]
  );

  useEffect(() => {
    void loadSources().catch((err) => setError(String(err)));
    void loadSettings().catch((err) => setError(String(err)));
  }, [loadSettings, loadSources]);

  useEffect(() => {
    if (selectedSourceId === null) {
      navigate("/", { replace: true });
    }
  }, [navigate, selectedSourceId]);

  useEffect(() => {
    if (selectedSourceId === null) {
      setGroups([]);
      return;
    }

    void listSourceGroups(selectedSourceId, "movie")
      .then(setGroups)
      .catch((err) => setError(String(err)));
  }, [selectedSourceId]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    subscribeBackendEvents((backendEvent: BackendEvent) => {
      if (backendEvent.event !== "external_playback_closed") {
        return;
      }

      const closedUrl = backendEvent.payload["url"];
      if (
        typeof closedUrl === "string" &&
        lastPlayedMovieUrl !== null &&
        closedUrl === lastPlayedMovieUrl
      ) {
        setPlayingMovieId(null);
        setLastPlayedMovieId(null);
        setLastPlayedMovieUrl(null);
        setPlaybackMessage("Movie playback ended.");
      }
    })
      .then((unsubscribe) => {
        unlisten = unsubscribe;
      })
      .catch((err) => setError(String(err)));

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [lastPlayedMovieUrl]);

  useEffect(() => {
    if (selectedSourceId === null) {
      setMovies([]);
      return;
    }

    setLoading(true);
    setError(null);
    void listSourceChannels({
      sourceId: selectedSourceId,
      mediaKind: "movie",
      groupName: selectedGroupName,
      query: query.trim() === "" ? null : query.trim(),
      favoritesOnly,
    })
      .then(setMovies)
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [favoritesOnly, query, selectedGroupName, selectedSourceId]);

  const handleToggleFavorite = async (movie: ChannelRecord) => {
    try {
      await setChannelFavoriteState(movie.id, !movie.is_favorite);
      setMovies((current) =>
        current.map((item) =>
          item.id === movie.id
            ? {
                ...item,
                is_favorite: !item.is_favorite,
              }
            : item
        )
      );
    } catch (err) {
      setError(String(err));
    }
  };

  const handlePlayMovie = async (movie: ChannelRecord) => {
    try {
      setPlayingMovieId(movie.id);
      setPlaybackMessage(`Starting "${movie.name}"...`);
      await playChannelRecord(movie);
      setLastPlayedMovieId(movie.id);
      setLastPlayedMovieUrl(
        settings.preferred_player === "mpv" ? movie.stream_url : null
      );
      setPlaybackMessage(
        settings.preferred_player === "mpv"
          ? `Now playing "${movie.name}" in MPV pop-out.`
          : `Now playing "${movie.name}" in the in-app player.`
      );
      if (settings.preferred_player === "web") {
        navigate("/dashboard/live");
      }
    } catch (err) {
      setError(String(err));
      setPlaybackMessage(null);
    } finally {
      setPlayingMovieId(null);
    }
  };

  return (
    <main className="min-h-screen flex-1 overflow-y-auto p-4 md:p-6">
      <section className="space-y-4">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Movies</h1>
          <p className="text-sm text-muted-foreground">
            {loading ? "Loading your movie catalog..." : `${movies.length} movies available`}
          </p>
        </header>

        {playbackMessage ? (
          <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
            {playbackMessage}
          </p>
        ) : null}

        <div className="grid gap-3 rounded-xl border bg-card/80 p-3 backdrop-blur md:grid-cols-[1fr_220px_180px]">
          <Input
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Search movies"
            disabled={selectedSourceId === null}
          />
          <Select value={selectedGroup} onValueChange={setSelectedGroup}>
            <SelectTrigger disabled={selectedSourceId === null}>
              <SelectValue placeholder="All groups" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_MOVIE_GROUPS}>All groups</SelectItem>
              {groups.map((group) => (
                <SelectItem key={group.name} value={group.name}>
                  {group.name} ({group.channel_count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Field orientation="horizontal" className="justify-start rounded-md border px-3">
            <Checkbox
              id="movies-favorites-only"
              checked={favoritesOnly}
              onCheckedChange={(checked) => setFavoritesOnly(checked === true)}
            />
            <FieldLabel htmlFor="movies-favorites-only">Favorites only</FieldLabel>
          </Field>
        </div>

        {error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {movies.map((movie) => (
            <article
              key={movie.id}
              className={`group overflow-hidden rounded-xl border bg-card/85 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg hover:cursor-pointer ${
                lastPlayedMovieId === movie.id
                  ? "ring-2 ring-emerald-500/70 ring-offset-2"
                  : ""
              }`}
            >
              <button
                type="button"
                className="relative block w-full text-left hover:cursor-pointer"
                onClick={() => void handlePlayMovie(movie)}
                disabled={playingMovieId === movie.id}
              >
                <div className="relative aspect-2/3 overflow-hidden">
                  {movie.logo && !brokenPosterIds[movie.id] ? (
                    <img
                      src={movie.logo}
                      alt=""
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03] cursor-pointer"
                      loading="lazy"
                      onError={() =>
                        setBrokenPosterIds((current) => ({
                          ...current,
                          [movie.id]: true,
                        }))
                      }
                    />
                  ) : (
                    <div
                      className={`h-full w-full bg-linear-to-br ${gradientForMovie(movie.name)}`}
                    />
                  )}
                  <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/85 via-black/20 to-transparent" />
                  <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                    <span className="line-clamp-2 text-sm font-semibold text-white">
                      {movie.name}
                    </span>
                    <span className="rounded-full bg-black/45 p-2 text-white backdrop-blur-sm">
                      {playingMovieId === movie.id ? (
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
                  onClick={() => void handleToggleFavorite(movie)}
                >
                  <Heart className="group-data-[is-favorite=true]:fill-red-500 group-data-[is-favorite=true]:text-red-500" />
                </Button>
              </div>
            </article>
          ))}
        </section>

        {!loading && movies.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            No movies matched these filters for the selected source.
          </p>
        ) : null}
      </section>
    </main>
  );
}
