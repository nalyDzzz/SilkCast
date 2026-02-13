import { FormEvent, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./App.css";

type RuntimeInfo = {
  debug_mode: boolean;
  db_path: string;
  log_path: string;
  crash_dir: string;
};

type SourceRecord = {
  id: number;
  source_type: string;
  name: string;
  config: Record<string, unknown>;
  created_at: number;
};

type BackendEvent = {
  event: string;
  payload: Record<string, unknown>;
  ts: number;
};

type PlaybackStatus = {
  state: string;
  attached_hwnd: number | null;
  current_url: string | null;
  backend: string;
  last_error: string | null;
};

function App() {
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null);
  const [sources, setSources] = useState<SourceRecord[]>([]);
  const [events, setEvents] = useState<BackendEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [m3uName, setM3uName] = useState("");
  const [m3uLocation, setM3uLocation] = useState("");
  const [xtreamName, setXtreamName] = useState("");
  const [xtreamServerUrl, setXtreamServerUrl] = useState("");
  const [xtreamUsername, setXtreamUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [playback, setPlayback] = useState<PlaybackStatus | null>(null);
  const [playbackUrl, setPlaybackUrl] = useState("");
  const [playbackHwnd, setPlaybackHwnd] = useState("");

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [runtimeInfo, sourceList] = await Promise.all([
        invoke<RuntimeInfo>("get_runtime_info"),
        invoke<SourceRecord[]>("list_registered_sources"),
      ]);
      const playbackStatus = await invoke<PlaybackStatus>("playback_state");
      setRuntime(runtimeInfo);
      setSources(sourceList);
      setPlayback(playbackStatus);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    refresh();

    listen<BackendEvent>("backend:event", (event) => {
      setEvents((current) => [event.payload, ...current].slice(0, 15));
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

  async function onAddM3u(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await invoke("add_m3u_source", { name: m3uName, location: m3uLocation });
      setM3uName("");
      setM3uLocation("");
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  }

  async function onAddXtream(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await invoke("add_xtream_source", {
        name: xtreamName,
        server_url: xtreamServerUrl,
        username: xtreamUsername,
      });
      setXtreamName("");
      setXtreamServerUrl("");
      setXtreamUsername("");
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  }

  async function onToggleDebug() {
    if (!runtime) {
      return;
    }

    setError(null);
    try {
      await invoke("set_debug_mode", { enabled: !runtime.debug_mode });
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  }

  async function onEmitPing() {
    setError(null);
    try {
      await invoke("emit_phase0_ping");
    } catch (err) {
      setError(String(err));
    }
  }

  async function onAttachPlaybackWindow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await invoke("playback_attach_window", { hwnd: Number(playbackHwnd) });
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  }

  async function onAttachCurrentPlaybackWindow() {
    setError(null);
    try {
      const windowId = await invoke<number>("playback_attach_current_window");
      setPlaybackHwnd(String(windowId));
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  }

  async function onLoadPlaybackUrl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await invoke("playback_load_url", { url: playbackUrl });
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  }

  async function onPausePlayback(paused: boolean) {
    setError(null);
    try {
      await invoke("playback_pause", { paused });
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  }

  async function onStopPlayback() {
    setError(null);
    try {
      await invoke("playback_stop");
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <main className="container">
      <header className="panel">
        <h1>OpenTV Phase 0 Foundation</h1>
        <div className="actions">
          <button onClick={refresh} disabled={loading}>
            Refresh
          </button>
          <button onClick={onToggleDebug} disabled={!runtime}>
            Debug: {runtime?.debug_mode ? "On" : "Off"}
          </button>
          <button onClick={onEmitPing}>Emit Event Ping</button>
        </div>
        {error ? <p className="error">{error}</p> : null}
      </header>

      <section className="panel">
        <h2>Runtime Diagnostics</h2>
        <p>
          <strong>DB:</strong> {runtime?.db_path ?? "..."}
        </p>
        <p>
          <strong>Log:</strong> {runtime?.log_path ?? "..."}
        </p>
        <p>
          <strong>Crash Reports:</strong> {runtime?.crash_dir ?? "..."}
        </p>
      </section>

      <section className="panel grid">
        <form onSubmit={onAddM3u}>
          <h2>Add M3U Source</h2>
          <input
            value={m3uName}
            onChange={(e) => setM3uName(e.currentTarget.value)}
            placeholder="Display name"
            required
          />
          <input
            value={m3uLocation}
            onChange={(e) => setM3uLocation(e.currentTarget.value)}
            placeholder="File path or URL"
            required
          />
          <button type="submit">Save M3U</button>
        </form>

        <form onSubmit={onAddXtream}>
          <h2>Add Xtream Source</h2>
          <input
            value={xtreamName}
            onChange={(e) => setXtreamName(e.currentTarget.value)}
            placeholder="Display name"
            required
          />
          <input
            value={xtreamServerUrl}
            onChange={(e) => setXtreamServerUrl(e.currentTarget.value)}
            placeholder="Server URL"
            required
          />
          <input
            value={xtreamUsername}
            onChange={(e) => setXtreamUsername(e.currentTarget.value)}
            placeholder="Username"
            required
          />
          <button type="submit">Save Xtream</button>
        </form>
      </section>

      <section className="panel">
        <h2>Registered Sources</h2>
        <ul>
          {sources.map((source) => (
            <li key={source.id}>
              <strong>{source.name}</strong> ({source.source_type}) - id {source.id}
            </li>
          ))}
        </ul>
        {sources.length === 0 ? <p>No sources registered yet.</p> : null}
      </section>

      <section className="panel">
        <h2>Event Bus Activity</h2>
        <ul>
          {events.map((event, idx) => (
            <li key={`${event.ts}-${idx}`}>
              <strong>{event.event}</strong> at {event.ts}
            </li>
          ))}
        </ul>
        {events.length === 0 ? <p>No events received yet.</p> : null}
      </section>

      <section className="panel grid">
        <div>
          <h2>Playback Core</h2>
          <p>
            <strong>Backend:</strong> {playback?.backend ?? "..."}
          </p>
          <p>
            <strong>State:</strong> {playback?.state ?? "..."}
          </p>
          <p>
            <strong>Window ID:</strong> {playback?.attached_hwnd ?? "none"}
          </p>
          <p>
            <strong>URL:</strong> {playback?.current_url ?? "none"}
          </p>
          <p>
            <strong>Last Error:</strong> {playback?.last_error ?? "none"}
          </p>
          <div className="actions">
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
        </div>

        <div>
          <form onSubmit={onAttachPlaybackWindow}>
            <h2>Attach Window ID</h2>
            <input
              type="number"
              value={playbackHwnd}
              onChange={(e) => setPlaybackHwnd(e.currentTarget.value)}
              placeholder="Native window ID (HWND/XID)"
              required
            />
            <div className="actions">
              <button type="button" onClick={onAttachCurrentPlaybackWindow}>
                Attach Current Window
              </button>
              <button type="submit">Attach Window</button>
            </div>
          </form>

          <form onSubmit={onLoadPlaybackUrl}>
            <h2>Load Stream URL</h2>
            <input
              value={playbackUrl}
              onChange={(e) => setPlaybackUrl(e.currentTarget.value)}
              placeholder="https://example.com/live.m3u8"
              required
            />
            <button type="submit">Load URL</button>
          </form>
        </div>
      </section>
    </main>
  );
}

export default App;
