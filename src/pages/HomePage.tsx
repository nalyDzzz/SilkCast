import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAppStore } from '@/store/appStore';

export function HomePage() {
  const navigate = useNavigate();

  const {
    loading,
    error,
    importMessage,
    sources,
    selectedSourceId,
    hasPersistedSourceSelection,
    m3uName,
    m3uLocation,
    setError,
    setM3uName,
    setM3uLocation,
    setSelectedSourceId,
    loadSources,
    addM3uSource,
    deleteSource,
  } = useAppStore(
    useShallow((state) => ({
      loading: state.loading,
      error: state.error,
      importMessage: state.importMessage,
      sources: state.sources,
      selectedSourceId: state.selectedSourceId,
      hasPersistedSourceSelection: state.hasPersistedSourceSelection,
      m3uName: state.m3uName,
      m3uLocation: state.m3uLocation,
      setError: state.setError,
      setM3uName: state.setM3uName,
      setM3uLocation: state.setM3uLocation,
      setSelectedSourceId: state.setSelectedSourceId,
      loadSources: state.loadSources,
      addM3uSource: state.addM3uSource,
      deleteSource: state.deleteSource,
    }))
  );
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  useEffect(() => {
    void loadSources().catch((err) => setError(String(err)));
  }, [loadSources, setError]);

  useEffect(() => {
    const hasValidRememberedSource =
      hasPersistedSourceSelection &&
      selectedSourceId !== null &&
      sources.some((source) => source.id === selectedSourceId);

    if (hasValidRememberedSource) {
      navigate('/dashboard');
    }
  }, [hasPersistedSourceSelection, navigate, selectedSourceId, sources]);

  const handleImportSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void addM3uSource(m3uName, m3uLocation);
  };

  const selectedSource =
    selectedSourceId === null
      ? null
      : sources.find((source) => source.id === selectedSourceId) ?? null;
  const isDeletingSource = pendingDeleteId !== null;
  const isDeletingSelectedSource =
    pendingDeleteId !== null && pendingDeleteId === selectedSourceId;

  const handleDeleteSelected = async () => {
    if (!selectedSource) {
      return;
    }

    const confirmed = window.confirm(
      `Delete "${selectedSource.name}"? This removes the playlist and its imported channels.`
    );

    if (!confirmed) {
      return;
    }

    setPendingDeleteId(selectedSource.id);

    try {
      await deleteSource(selectedSource);
    } finally {
      setPendingDeleteId(null);
    }
  };

  return (
    <main className="min-h-screen p-4 md:p-8">
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">OpenTV</h1>
          <p className="text-muted-foreground">
            Import an M3U playlist, then log in to the dashboard with the
            playlist you want to watch.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Select Playlist</CardTitle>
            <CardDescription>
              Choose an imported playlist to continue or remove it.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select
              value={selectedSourceId?.toString() ?? ''}
              onValueChange={(value) => setSelectedSourceId(Number(value))}
            >
              <SelectTrigger className="w-full" disabled={isDeletingSource}>
                <SelectValue placeholder="Select a playlist" />
              </SelectTrigger>
              <SelectContent>
                {sources.map((source) => (
                  <SelectItem key={source.id} value={source.id.toString()}>
                    {source.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {sources.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No playlists imported yet.
              </p>
            ) : null}
          </CardContent>
          <CardFooter className="flex-col gap-3 sm:flex-row">
            <Button
              className="w-full sm:flex-1"
              onClick={() => navigate('/dashboard')}
              disabled={selectedSourceId === null || isDeletingSource}
            >
              Log In To Dashboard
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="w-full sm:flex-1"
              onClick={() => void handleDeleteSelected()}
              disabled={selectedSource === null || loading || isDeletingSource}
            >
              {isDeletingSelectedSource
                ? 'Deleting...'
                : 'Delete Selected Playlist'}
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Import M3U Playlist</CardTitle>
            <CardDescription>
              Add a playlist URL or local file path.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleImportSubmit} className="flex flex-col gap-3">
              <Input
                value={m3uName}
                onChange={(event) => setM3uName(event.currentTarget.value)}
                placeholder="Playlist name"
                required
              />
              <Input
                value={m3uLocation}
                onChange={(event) => setM3uLocation(event.currentTarget.value)}
                placeholder="https://... or /path/to/file.m3u"
                required
              />
              <Button type="submit" disabled={loading || isDeletingSource}>
                {loading ? 'Importing...' : 'Import Playlist'}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="flex-col items-start gap-2">
            {importMessage ? (
              <p className="text-sm text-green-600">{importMessage}</p>
            ) : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </CardFooter>
        </Card>
      </section>
    </main>
  );
}
