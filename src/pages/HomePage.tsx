import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useShallow } from 'zustand/react/shallow';
import { Link } from 'react-router';
import { CircleHelp, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import { SourceRecord } from '@/components/app/types';
import { DeleteSourceDialog } from '@/components/sources/DeleteSourceDialog';
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
import { useAppStore } from '@/store/appStore';

type ImportSourceType = 'm3u' | 'xtream';

type SourceEditDraft = {
  sourceId: number;
  sourceType: ImportSourceType;
  name: string;
  location: string;
  serverUrl: string;
  username: string;
  password: string;
};

const INITIAL_XTREAM_DRAFT = {
  name: '',
  serverUrl: '',
  username: '',
  password: '',
};

type XtreamDraftField = keyof typeof INITIAL_XTREAM_DRAFT;

const SOURCE_TYPE_LABEL: Record<ImportSourceType, string> = {
  m3u: 'M3U playlist',
  xtream: 'Xtream provider',
};

const readConfigString = (source: SourceRecord, key: string) => {
  const value = source.config[key];
  return typeof value === 'string' ? value : '';
};

const toImportSourceType = (sourceType: string): ImportSourceType =>
  sourceType === 'xtream' ? 'xtream' : 'm3u';

const buildSourceEditDraft = (source: SourceRecord): SourceEditDraft => {
  const sourceType = toImportSourceType(source.source_type);

  return {
    sourceId: source.id,
    sourceType,
    name: source.name,
    location: sourceType === 'm3u' ? readConfigString(source, 'location') : '',
    serverUrl:
      sourceType === 'xtream' ? readConfigString(source, 'server_url') : '',
    username:
      sourceType === 'xtream' ? readConfigString(source, 'username') : '',
    password:
      sourceType === 'xtream' ? readConfigString(source, 'password') : '',
  };
};

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
    addXtreamSource,
    updateSource,
    refreshSource,
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
      addXtreamSource: state.addXtreamSource,
      updateSource: state.updateSource,
      refreshSource: state.refreshSource,
      deleteSource: state.deleteSource,
    }))
  );

  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [pendingRefreshId, setPendingRefreshId] = useState<number | null>(null);
  const [pendingUpdateId, setPendingUpdateId] = useState<number | null>(null);
  const [importSourceType, setImportSourceType] =
    useState<ImportSourceType>('m3u');
  const [xtreamDraft, setXtreamDraft] = useState(INITIAL_XTREAM_DRAFT);
  const [editDraft, setEditDraft] = useState<SourceEditDraft | null>(null);
  const [sourceToDelete, setSourceToDelete] = useState<SourceRecord | null>(
    null
  );

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

  useEffect(() => {
    if (
      editDraft !== null &&
      !sources.some((source) => source.id === editDraft.sourceId)
    ) {
      setEditDraft(null);
    }
  }, [editDraft, sources]);

  const handleImportSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (importSourceType === 'xtream') {
      await addXtreamSource(
        xtreamDraft.name,
        xtreamDraft.serverUrl,
        xtreamDraft.username,
        xtreamDraft.password
      );
      if (useAppStore.getState().error === null) {
        setXtreamDraft(INITIAL_XTREAM_DRAFT);
      }
      return;
    }

    await addM3uSource(m3uName, m3uLocation);
  };

  const isDeletingSource = pendingDeleteId !== null;
  const isRefreshingSource = pendingRefreshId !== null;
  const isUpdatingSource = pendingUpdateId !== null;
  const isSourceActionPending =
    isDeletingSource || isRefreshingSource || isUpdatingSource;

  const updateXtreamDraft = (field: XtreamDraftField, value: string) => {
    setXtreamDraft((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const updateEditDraftField = (
    field: keyof Omit<SourceEditDraft, 'sourceId' | 'sourceType'>,
    value: string
  ) => {
    setEditDraft((current) =>
      current
        ? {
            ...current,
            [field]: value,
          }
        : current
    );
  };

  const handleOpenSource = (sourceId: number) => {
    if (isSourceActionPending) {
      return;
    }

    setSelectedSourceId(sourceId);
    navigate('/dashboard');
  };

  const handleEditSource = (source: SourceRecord) => {
    if (isSourceActionPending) {
      return;
    }

    setEditDraft(buildSourceEditDraft(source));
  };

  const handleRefreshSource = async (source: SourceRecord) => {
    if (isSourceActionPending) {
      return;
    }

    setPendingRefreshId(source.id);
    try {
      await refreshSource(source.id);
    } finally {
      setPendingRefreshId(null);
    }
  };

  const handleDeleteSource = (source: SourceRecord) => {
    if (isSourceActionPending) {
      return;
    }

    setSourceToDelete(source);
  };

  const confirmDeleteSource = async (source: SourceRecord) => {
    setSourceToDelete(null);
    setPendingDeleteId(source.id);

    try {
      await deleteSource(source);
      setEditDraft((current) =>
        current?.sourceId === source.id ? null : current
      );
    } finally {
      setPendingDeleteId(null);
    }
  };

  const handleSaveEditSource = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (editDraft === null || isSourceActionPending) {
      return;
    }

    const config =
      editDraft.sourceType === 'xtream'
        ? {
            server_url: editDraft.serverUrl,
            username: editDraft.username,
            password: editDraft.password,
          }
        : {
            location: editDraft.location,
          };

    setPendingUpdateId(editDraft.sourceId);

    try {
      await updateSource(editDraft.sourceId, editDraft.name, config);
      if (useAppStore.getState().error === null) {
        setEditDraft(null);
      }
    } finally {
      setPendingUpdateId(null);
    }
  };

  return (
    <main className="min-h-screen p-4 md:p-8">
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">SilkCast</h1>
          <p className="text-muted-foreground">
            Import an M3U playlist or connect an Xtream provider, then open the
            dashboard with the source you want to watch.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Select Source</CardTitle>
            <CardDescription>
              Click a source to load it. Use the buttons on each row to edit,
              refresh, or delete.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {sources.length === 0 ? (
              <div className="space-y-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">
                  No sources imported yet.
                </p>
                <p>
                  Add one below. Choose <strong>Xtream provider</strong> if
                  your provider gave you a server address, username, and
                  password: it unlocks movies, series episodes, and the TV
                  guide. Otherwise paste your <strong>M3U playlist</strong>{' '}
                  link.
                </p>
                <Link
                  to="/dashboard/help"
                  className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                >
                  <CircleHelp className="size-4" />
                  Read the getting-started guide
                </Link>
              </div>
            ) : (
              <div
                className="flex flex-col gap-2"
                role="list"
                aria-label="Imported sources"
              >
                {sources.map((source) => {
                  const sourceType = toImportSourceType(source.source_type);
                  const isDeleting = pendingDeleteId === source.id;
                  const isRefreshing = pendingRefreshId === source.id;
                  const isUpdating = pendingUpdateId === source.id;
                  const isEditing = editDraft?.sourceId === source.id;

                  return (
                    <div
                      key={source.id}
                      role="listitem"
                      tabIndex={isSourceActionPending ? -1 : 0}
                      onClick={() => handleOpenSource(source.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          handleOpenSource(source.id);
                        }
                      }}
                      className="flex cursor-pointer flex-col gap-3 rounded-lg border border-border p-3 transition-colors outline-none hover:border-primary focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/35 sm:flex-row sm:items-center"
                    >
                      <div className="flex flex-1 px-2 py-1">
                        <span className="flex flex-col items-start">
                          <span className="font-medium">{source.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {SOURCE_TYPE_LABEL[sourceType]}
                          </span>
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
                        <Button
                          type="button"
                          size="icon-sm"
                          variant={isEditing ? 'secondary' : 'outline'}
                          aria-label="Edit"
                          title="Edit"
                          onKeyDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            handleEditSource(source);
                          }}
                          disabled={isSourceActionPending}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="outline"
                          aria-label="Refresh"
                          title="Refresh"
                          onKeyDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleRefreshSource(source);
                          }}
                          disabled={isSourceActionPending}
                        >
                          <RefreshCw
                            className={
                              isRefreshing ? 'animate-spin' : undefined
                            }
                          />
                        </Button>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="destructive"
                          aria-label="Delete"
                          title="Delete"
                          onKeyDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            handleDeleteSource(source);
                          }}
                          disabled={isSourceActionPending}
                        >
                          <Trash2
                            className={
                              isDeleting || isUpdating
                                ? 'opacity-70'
                                : undefined
                            }
                          />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {editDraft ? (
              <form
                onSubmit={(event) => void handleSaveEditSource(event)}
                className="space-y-3 rounded-lg border bg-muted/20 p-4"
              >
                <p className="text-sm font-medium">Edit source details</p>
                <Input
                  value={editDraft.name}
                  onChange={(event) =>
                    updateEditDraftField('name', event.currentTarget.value)
                  }
                  placeholder="Source name"
                  required
                />

                {editDraft.sourceType === 'xtream' ? (
                  <>
                    <Input
                      value={editDraft.serverUrl}
                      onChange={(event) =>
                        updateEditDraftField(
                          'serverUrl',
                          event.currentTarget.value
                        )
                      }
                      placeholder="https://provider.example:8080"
                      required
                    />
                    <Input
                      value={editDraft.username}
                      onChange={(event) =>
                        updateEditDraftField(
                          'username',
                          event.currentTarget.value
                        )
                      }
                      placeholder="Username"
                      required
                    />
                    <Input
                      type="password"
                      value={editDraft.password}
                      onChange={(event) =>
                        updateEditDraftField(
                          'password',
                          event.currentTarget.value
                        )
                      }
                      placeholder="Password"
                      required
                    />
                  </>
                ) : (
                  <Input
                    value={editDraft.location}
                    onChange={(event) =>
                      updateEditDraftField(
                        'location',
                        event.currentTarget.value
                      )
                    }
                    placeholder="https://... or /path/to/file.m3u"
                    required
                  />
                )}

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="submit"
                    disabled={loading || isSourceActionPending}
                    className="w-full sm:w-auto"
                  >
                    {pendingUpdateId === editDraft.sourceId
                      ? 'Saving...'
                      : 'Save Changes'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full sm:w-auto"
                    onClick={() => setEditDraft(null)}
                    disabled={isSourceActionPending}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Import Source</CardTitle>
            <CardDescription>
              Add a playlist URL or connect directly with Xtream credentials.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(event) => void handleImportSubmit(event)}
              className="flex flex-col gap-3"
            >
              <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/30 p-1">
                <Button
                  type="button"
                  variant={importSourceType === 'm3u' ? 'default' : 'ghost'}
                  className="w-full"
                  onClick={() => setImportSourceType('m3u')}
                >
                  M3U Playlist
                </Button>
                <Button
                  type="button"
                  variant={importSourceType === 'xtream' ? 'default' : 'ghost'}
                  className="w-full"
                  onClick={() => setImportSourceType('xtream')}
                >
                  Xtream Provider
                </Button>
              </div>

              {importSourceType === 'xtream' ? (
                <>
                  <Input
                    value={xtreamDraft.name}
                    onChange={(event) =>
                      updateXtreamDraft('name', event.currentTarget.value)
                    }
                    placeholder="Source name"
                    required
                  />
                  <Input
                    value={xtreamDraft.serverUrl}
                    onChange={(event) =>
                      updateXtreamDraft('serverUrl', event.currentTarget.value)
                    }
                    placeholder="https://provider.example:8080"
                    required
                  />
                  <Input
                    value={xtreamDraft.username}
                    onChange={(event) =>
                      updateXtreamDraft('username', event.currentTarget.value)
                    }
                    placeholder="Username"
                    required
                  />
                  <Input
                    type="password"
                    value={xtreamDraft.password}
                    onChange={(event) =>
                      updateXtreamDraft('password', event.currentTarget.value)
                    }
                    placeholder="Password"
                    required
                  />
                </>
              ) : (
                <>
                  <Input
                    value={m3uName}
                    onChange={(event) => setM3uName(event.currentTarget.value)}
                    placeholder="Playlist name"
                    required
                  />
                  <Input
                    value={m3uLocation}
                    onChange={(event) =>
                      setM3uLocation(event.currentTarget.value)
                    }
                    placeholder="https://... or /path/to/file.m3u"
                    required
                  />
                </>
              )}

              <Button type="submit" disabled={loading || isSourceActionPending}>
                {loading
                  ? 'Importing...'
                  : importSourceType === 'xtream'
                    ? 'Connect Xtream'
                    : 'Import Playlist'}
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
      <DeleteSourceDialog
        source={sourceToDelete}
        onCancel={() => setSourceToDelete(null)}
        onConfirm={(source) => void confirmDeleteSource(source)}
      />
    </main>
  );
}
