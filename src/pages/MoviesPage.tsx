import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useShallow } from "zustand/react/shallow";
import { BackendEvent, ChannelRecord, GroupRecord } from "@/components/app/types";
import { MovieCard } from "@/components/movies/MovieCard";
import { VirtualizedMovieGrid } from "@/components/movies/VirtualizedMovieGrid";
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
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playingMovieId, setPlayingMovieId] = useState<number | null>(null);
  const [lastPlayedMovieId, setLastPlayedMovieId] = useState<number | null>(null);
  const [playbackMessage, setPlaybackMessage] = useState<string | null>(null);
  const [lastPlayedMovieUrl, setLastPlayedMovieUrl] = useState<string | null>(null);
  const [brokenPosterIds, setBrokenPosterIds] = useState<Record<number, true>>({});
  const requestVersionRef = useRef(0);

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
    const timeoutId = window.setTimeout(() => {
      setDebouncedQuery(query);
    }, 180);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [query]);

  useEffect(() => {
    if (selectedSourceId === null) {
      setMovies([]);
      return;
    }

    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;

    setLoading(true);
    setError(null);
    void listSourceChannels({
      sourceId: selectedSourceId,
      mediaKind: "movie",
      groupName: selectedGroupName,
      query: debouncedQuery.trim() === "" ? null : debouncedQuery.trim(),
      favoritesOnly,
    })
      .then((nextMovies) => {
        if (requestVersionRef.current === requestVersion) {
          setMovies(nextMovies);
        }
      })
      .catch((err) => {
        if (requestVersionRef.current === requestVersion) {
          setError(String(err));
        }
      })
      .finally(() => {
        if (requestVersionRef.current === requestVersion) {
          setLoading(false);
        }
      });
  }, [debouncedQuery, favoritesOnly, selectedGroupName, selectedSourceId]);

  const handleToggleFavorite = useCallback(async (movie: ChannelRecord) => {
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
  }, []);

  const handlePlayMovie = useCallback(async (movie: ChannelRecord) => {
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
  }, [navigate, playChannelRecord, settings.preferred_player]);

  const handlePosterError = useCallback((movieId: number) => {
    setBrokenPosterIds((current) => {
      if (current[movieId]) {
        return current;
      }
      return {
        ...current,
        [movieId]: true,
      };
    });
  }, []);

  return (
    <main className="box-border h-full overflow-hidden p-4 md:p-6">
      <section className="flex h-full min-h-0 flex-col gap-4">
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

        <div className="min-h-0 flex-1">
          <VirtualizedMovieGrid
            items={movies}
            getItemKey={(movie) => movie.id}
            renderItem={(movie) => (
              <MovieCard
                movie={movie}
                isPlaying={playingMovieId === movie.id}
                isLastPlayed={lastPlayedMovieId === movie.id}
                isPosterBroken={Boolean(brokenPosterIds[movie.id])}
                onPlay={(nextMovie) => void handlePlayMovie(nextMovie)}
                onToggleFavorite={(nextMovie) => void handleToggleFavorite(nextMovie)}
                onPosterError={handlePosterError}
              />
            )}
          />
        </div>

        {!loading && movies.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            No movies matched these filters for the selected source.
          </p>
        ) : null}
      </section>
    </main>
  );
}
