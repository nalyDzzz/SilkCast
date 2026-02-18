import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./App.css";

type SourceRecord = {
  id: number;
  source_type: string;
  name: string;
  config: Record<string, unknown>;
  created_at: number;
};

type GroupRecord = {
  name: string;
  channel_count: number;
};

type ChannelRecord = {
  id: number;
  source_id: number;
  name: string;
  group_name: string;
  logo: string | null;
  tvg_id: string | null;
  tvg_name: string | null;
  stream_url: string;
  is_favorite: boolean;
};

type RecentChannelRecord = {
  channel: ChannelRecord;
  played_at: number;
};

type PlaybackStatus = {
  state: string;
  attached_hwnd: number | null;
  embedded_surface_hwnd: number | null;
  current_url: string | null;
  backend: string;
  last_error: string | null;
  volume: number;
  fullscreen: boolean;
  render_mode: "external_window" | "embedded_surface";
};

type Phase1Settings = {
  hardware_decode: boolean;
  buffering_preset: "low" | "normal" | "high";
  startup_behavior: "home" | "resume_last";
};

type BackendEvent = {
  event: string;
  payload: Record<string, unknown>;
  ts: number;
};

type M3uImportResult = {
  source_id: number;
  imported_channels: number;
};

const ALL_GROUPS = "__all__";
const DEFAULT_SETTINGS: Phase1Settings = {
  hardware_decode: true,
  buffering_preset: "normal",
  startup_behavior: "home",
};

function App() {
  const embeddedSurfaceRef = useRef<HTMLDivElement | null>(null);
  const embeddedSurfaceStartedRef = useRef(false);
  const [sources, setSources] = useState<SourceRecord[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<number | null>(null);
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [selectedGroup, setSelectedGroup] = useState(ALL_GROUPS);
  const [channels, setChannels] = useState<ChannelRecord[]>([]);
  const [recentChannels, setRecentChannels] = useState<RecentChannelRecord[]>([]);
  const [playback, setPlayback] = useState<PlaybackStatus | null>(null);
  const [settings, setSettings] = useState<Phase1Settings>(DEFAULT_SETTINGS);
  const [m3uName, setM3uName] = useState("");
  const [m3uLocation, setM3uLocation] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [preferEmbeddedMode, setPreferEmbeddedMode] = useState(true);

  const selectedSource = useMemo(
    () => sources.find((source) => source.id === selectedSourceId) ?? null,
    [sources, selectedSourceId],
  );

  async function loadSources() {
    const sourceList = await invoke<SourceRecord[]>("list_registered_sources");
    setSources(sourceList);

    if (sourceList.length === 0) {
      setSelectedSourceId(null);
      return;
    }

    setSelectedSourceId((current) => {
      if (current && sourceList.some((source) => source.id === current)) {
        return current;
      }
      return sourceList[0].id;
    });
  }

  async function loadGroups(sourceId: number) {
    const result = await invoke<GroupRecord[]>("list_source_groups", {
      sourceId,
    });
    setGroups(result);
  }

  async function loadChannels(sourceId: number) {
    const groupName = selectedGroup === ALL_GROUPS ? null : selectedGroup;
    const query = searchQuery.trim() === "" ? null : searchQuery;
    const result = await invoke<ChannelRecord[]>("list_source_channels", {
      sourceId,
      groupName,
      query,
      favoritesOnly,
    });
    setChannels(result);
  }

  async function loadRecents() {
    const result = await invoke<RecentChannelRecord[]>("list_recently_played", {
      limit: 20,
    });
    setRecentChannels(result);
  }

  async function loadPlaybackStatus() {
    const status = await invoke<PlaybackStatus>("playback_state");
    setPlayback(status);
  }

  async function loadSettings() {
    const currentSettings = await invoke<Phase1Settings>("get_phase1_settings");
    setSettings(currentSettings);
  }

  async function refreshEverything() {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([
        loadSources(),
        loadPlaybackStatus(),
        loadRecents(),
        loadSettings(),
      ]);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    refreshEverything();

    listen<BackendEvent>("backend:event", (event) => {
      const backendEvent = event.payload;

      if (backendEvent.event === "playback_state_changed") {
        const playbackState = backendEvent.payload["state"] as
          | PlaybackStatus
          | undefined;
        if (playbackState) {
          setPlayback(playbackState);
        }
        return;
      }

      if (backendEvent.event === "sources_updated") {
        loadSources().catch((err) => setError(String(err)));
        return;
      }

      if (backendEvent.event === "settings_updated") {
        loadSettings().catch((err) => setError(String(err)));
        return;
      }

      if (backendEvent.event === "recents_updated") {
        loadRecents().catch((err) => setError(String(err)));
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
  }, []);

  useEffect(() => {
    if (selectedSourceId === null) {
      setGroups([]);
      setChannels([]);
      return;
    }

    setSelectedGroup(ALL_GROUPS);
    setError(null);
    loadGroups(selectedSourceId).catch((err) => setError(String(err)));
  }, [selectedSourceId]);

  useEffect(() => {
    if (selectedSourceId === null) {
      setChannels([]);
      return;
    }

    setError(null);
    loadChannels(selectedSourceId).catch((err) => setError(String(err)));
  }, [selectedSourceId, selectedGroup, searchQuery, favoritesOnly]);

  useEffect(() => {
    let mounted = true;
    let rafId: number | null = null;

    const scheduleSurfaceSync = () => {
      if (rafId !== null) {
        return;
      }
      rafId = window.requestAnimationFrame(async () => {
        rafId = null;
        if (!mounted) {
          return;
        }
        if (!preferEmbeddedMode) {
          return;
        }
        try {
          await ensureEmbeddedSurfaceRunning();
        } catch (err) {
          setError(String(err));
        }
      });
    };

    const observer = new ResizeObserver(() => scheduleSurfaceSync());
    if (embeddedSurfaceRef.current) {
      observer.observe(embeddedSurfaceRef.current);
    }

    if (preferEmbeddedMode) {
      scheduleSurfaceSync();
    }
    window.addEventListener("resize", scheduleSurfaceSync);

    return () => {
      mounted = false;
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      observer.disconnect();
      window.removeEventListener("resize", scheduleSurfaceSync);
      if (preferEmbeddedMode) {
        invoke("playback_stop_embedded_surface_mode").catch(() => {});
      }
    };
  }, [preferEmbeddedMode]);

  async function onAddM3uSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setImportMessage(null);

    try {
      const result = await invoke<M3uImportResult>("add_m3u_source", {
        name: m3uName,
        location: m3uLocation,
      });
      setM3uName("");
      setM3uLocation("");
      setSelectedSourceId(result.source_id);
      setSelectedGroup(ALL_GROUPS);
      setImportMessage(`Imported ${result.imported_channels} channels.`);
      await Promise.all([loadSources(), loadGroups(result.source_id), loadChannels(result.source_id)]);
    } catch (err) {
      setError(String(err));
    }
  }

  async function onRefreshSource() {
    if (selectedSourceId === null) {
      return;
    }

    setError(null);
    setImportMessage(null);

    try {
      const result = await invoke<M3uImportResult>("refresh_m3u_source", {
        sourceId: selectedSourceId,
      });
      setImportMessage(`Refreshed ${result.imported_channels} channels.`);
      await Promise.all([loadGroups(selectedSourceId), loadChannels(selectedSourceId)]);
    } catch (err) {
      setError(String(err));
    }
  }

  async function onPlayChannel(channelId: number) {
    setError(null);
    try {
      await invoke("play_channel", { channelId });
      await Promise.all([loadPlaybackStatus(), loadRecents()]);
    } catch (err) {
      setError(String(err));
    }
  }

  async function onToggleFavorite(channel: ChannelRecord) {
    setError(null);
    try {
      await invoke("set_channel_favorite_state", {
        channelId: channel.id,
        favorite: !channel.is_favorite,
      });
      if (selectedSourceId !== null) {
        await loadChannels(selectedSourceId);
      }
      await loadRecents();
    } catch (err) {
      setError(String(err));
    }
  }

  async function ensureEmbeddedSurfaceRunning() {
    const host = embeddedSurfaceRef.current;
    if (!host) {
      return;
    }

    const rect = host.getBoundingClientRect();
    const bounds = {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };

    if (bounds.width <= 0 || bounds.height <= 0) {
      return;
    }

    if (!embeddedSurfaceStartedRef.current) {
      await invoke<number>("playback_start_embedded_surface_mode", { bounds });
      embeddedSurfaceStartedRef.current = true;
      await loadPlaybackStatus();
      return;
    }

    await invoke("playback_update_embedded_surface_bounds", { bounds });
  }

  async function onUseEmbeddedSurface() {
    setError(null);
    try {
      setPreferEmbeddedMode(true);
      await ensureEmbeddedSurfaceRunning();
    } catch (err) {
      setError(String(err));
    }
  }

  async function onUseExternalWindow() {
    setError(null);
    try {
      setPreferEmbeddedMode(false);
      const currentUrl = playback?.current_url ?? null;
      await invoke("playback_use_external_window_mode");
      embeddedSurfaceStartedRef.current = false;
      if (currentUrl) {
        await invoke("playback_load_url", { url: currentUrl });
      }
      await loadPlaybackStatus();
    } catch (err) {
      setError(String(err));
    }
  }

  async function onPausePlayback(paused: boolean) {
    setError(null);
    try {
      await invoke("playback_pause", { paused });
      await loadPlaybackStatus();
    } catch (err) {
      setError(String(err));
    }
  }

  async function onStopPlayback() {
    setError(null);
    try {
      await invoke("playback_stop");
      await loadPlaybackStatus();
    } catch (err) {
      setError(String(err));
    }
  }

  async function onSetFullscreen(fullscreen: boolean) {
    setError(null);
    try {
      await invoke("playback_set_fullscreen", { fullscreen });
      await loadPlaybackStatus();
    } catch (err) {
      setError(String(err));
    }
  }

  async function onSetVolume(nextVolume: number) {
    setError(null);
    try {
      await invoke("playback_set_volume", { volume: nextVolume });
      setPlayback((current) =>
        current
          ? {
              ...current,
              volume: nextVolume,
            }
          : current,
      );
    } catch (err) {
      setError(String(err));
    }
  }

  async function onSaveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      await invoke("set_phase1_settings", { settings });
      await loadSettings();
    } catch (err) {
      setError(String(err));
    }
  }

  const totalGroupChannels = groups.reduce(
    (sum, group) => sum + group.channel_count,
    0,
  );

  return (
    <main className="phase1-layout">
      <aside className="pane sidebar-pane">
        <section className="card">
          <h1>OpenTV v0.1</h1>
          <p className="muted">M3U MVP</p>
          <button onClick={refreshEverything} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh All"}
          </button>
        </section>

        <section className="card">
          <h2>Import M3U</h2>
          <form onSubmit={onAddM3uSource} className="stack">
            <input
              value={m3uName}
              onChange={(e) => setM3uName(e.currentTarget.value)}
              placeholder="Playlist name"
              required
            />
            <input
              value={m3uLocation}
              onChange={(e) => setM3uLocation(e.currentTarget.value)}
              placeholder="https://... or /path/to/file.m3u"
              required
            />
            <button type="submit">Import Playlist</button>
          </form>
          {importMessage ? <p className="success">{importMessage}</p> : null}
        </section>

        <section className="card">
          <div className="section-head">
            <h2>Sources</h2>
            <button
              type="button"
              onClick={onRefreshSource}
              disabled={selectedSourceId === null}
            >
              Refresh Source
            </button>
          </div>
          <div className="list">
            {sources.map((source) => (
              <button
                key={source.id}
                type="button"
                className={
                  source.id === selectedSourceId
                    ? "list-item active"
                    : "list-item"
                }
                onClick={() => {
                  setSelectedSourceId(source.id);
                  setSelectedGroup(ALL_GROUPS);
                }}
              >
                <span>{source.name}</span>
                <small>{source.source_type}</small>
              </button>
            ))}
            {sources.length === 0 ? <p className="muted">No sources yet.</p> : null}
          </div>
        </section>

        <section className="card">
          <h2>Groups</h2>
          <div className="list">
            <button
              type="button"
              className={
                selectedGroup === ALL_GROUPS ? "list-item active" : "list-item"
              }
              onClick={() => setSelectedGroup(ALL_GROUPS)}
              disabled={selectedSourceId === null}
            >
              <span>All Channels</span>
              <small>{totalGroupChannels}</small>
            </button>
            {groups.map((group) => (
              <button
                key={group.name}
                type="button"
                className={
                  selectedGroup === group.name ? "list-item active" : "list-item"
                }
                onClick={() => setSelectedGroup(group.name)}
              >
                <span>{group.name}</span>
                <small>{group.channel_count}</small>
              </button>
            ))}
            {selectedSourceId !== null && groups.length === 0 ? (
              <p className="muted">No groups for this source.</p>
            ) : null}
          </div>
        </section>
      </aside>

      <section className="pane channels-pane">
        <section className="card channel-controls">
          <h2>Channels</h2>
          <div className="toolbar">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.currentTarget.value)}
              placeholder="Search channels"
              disabled={selectedSourceId === null}
            />
            <label className="checkbox">
              <input
                type="checkbox"
                checked={favoritesOnly}
                onChange={(e) => setFavoritesOnly(e.currentTarget.checked)}
              />
              Favorites only
            </label>
          </div>
          <p className="muted">
            {selectedSource
              ? `${selectedSource.name} · ${channels.length} channels`
              : "Select or import a source"}
          </p>
        </section>

        <section className="card channel-list">
          {channels.map((channel) => (
            <article key={channel.id} className="channel-row">
              <button
                type="button"
                className="channel-play"
                onClick={() => onPlayChannel(channel.id)}
              >
                Play
              </button>
              {channel.logo ? (
                <img src={channel.logo} alt="" className="channel-logo" loading="lazy" />
              ) : null}
              <div className="channel-meta">
                <h3>{channel.name}</h3>
                <p>{channel.group_name}</p>
              </div>
              <button
                type="button"
                className={channel.is_favorite ? "favorite active" : "favorite"}
                onClick={() => onToggleFavorite(channel)}
                aria-label={
                  channel.is_favorite ? "Remove favorite" : "Add favorite"
                }
              >
                *
              </button>
            </article>
          ))}
          {selectedSourceId !== null && channels.length === 0 ? (
            <p className="muted">No channels match your filters.</p>
          ) : null}
        </section>
      </section>

      <aside className="pane player-pane">
        <section className="card">
          <div className="section-head">
            <h2>Player</h2>
            <div className="player-mode-actions">
              <button type="button" onClick={onUseEmbeddedSurface}>
                Embedded
              </button>
              <button type="button" onClick={onUseExternalWindow}>
                External
              </button>
            </div>
          </div>
          <div ref={embeddedSurfaceRef} className="player-surface" />
          <p>
            <strong>Backend:</strong> {playback?.backend ?? "..."}
          </p>
          <p>
            <strong>Status:</strong> {playback?.state ?? "idle"}
          </p>
          <p>
            <strong>Attached:</strong> {playback?.attached_hwnd ?? "none"}
          </p>
          <p>
            <strong>Surface:</strong> {playback?.embedded_surface_hwnd ?? "none"}
          </p>
          <p>
            <strong>Mode:</strong> {playback?.render_mode ?? "external_window"}
          </p>
          <p>
            <strong>Current URL:</strong> {playback?.current_url ?? "none"}
          </p>
          <p>
            <strong>Error:</strong> {playback?.last_error ?? "none"}
          </p>

          <div className="actions-row">
            <button type="button" onClick={() => onPausePlayback(true)}>
              Pause
            </button>
            <button type="button" onClick={() => onPausePlayback(false)}>
              Resume
            </button>
            <button type="button" onClick={onStopPlayback}>
              Stop
            </button>
          </div>

          <div className="actions-row">
            <button
              type="button"
              onClick={() => onSetFullscreen(!Boolean(playback?.fullscreen))}
            >
              {playback?.fullscreen ? "Exit Fullscreen" : "Fullscreen"}
            </button>
            <label className="volume">
              Volume
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(playback?.volume ?? 100)}
                onChange={(e) => onSetVolume(Number(e.currentTarget.value))}
              />
            </label>
          </div>
        </section>

        <section className="card">
          <h2>Settings</h2>
          <form onSubmit={onSaveSettings} className="stack">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={settings.hardware_decode}
                onChange={(e) =>
                  setSettings((current) => ({
                    ...current,
                    hardware_decode: e.currentTarget.checked,
                  }))
                }
              />
              Hardware decode
            </label>

            <label>
              Buffering
              <select
                value={settings.buffering_preset}
                onChange={(e) =>
                  setSettings((current) => ({
                    ...current,
                    buffering_preset: e.currentTarget.value as Phase1Settings["buffering_preset"],
                  }))
                }
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </label>

            <label>
              Startup
              <select
                value={settings.startup_behavior}
                onChange={(e) =>
                  setSettings((current) => ({
                    ...current,
                    startup_behavior: e.currentTarget.value as Phase1Settings["startup_behavior"],
                  }))
                }
              >
                <option value="home">Home view</option>
                <option value="resume_last">Resume last channel</option>
              </select>
            </label>

            <button type="submit">Save Settings</button>
          </form>
        </section>

        <section className="card">
          <h2>Recents</h2>
          <div className="list recents-list">
            {recentChannels.map((recent) => (
              <button
                key={`${recent.channel.id}-${recent.played_at}`}
                type="button"
                className="list-item"
                onClick={() => onPlayChannel(recent.channel.id)}
              >
                <span>{recent.channel.name}</span>
                <small>{new Date(recent.played_at * 1000).toLocaleString()}</small>
              </button>
            ))}
            {recentChannels.length === 0 ? (
              <p className="muted">No recently played channels.</p>
            ) : null}
          </div>
        </section>

        {error ? <p className="error-banner">{error}</p> : null}
      </aside>
    </main>
  );
}

export default App;
