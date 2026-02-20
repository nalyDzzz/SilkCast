import { FormEvent, ReactNode } from "react";
import { useAppStore } from "../../store/appStore";
import { Phase1Settings } from "./types";
import { useShallow } from "zustand/react/shallow";

type PlayerPaneProps = {
  embeddedSurfaceRef: React.RefObject<HTMLDivElement | null>;
  onSetFullscreen: (fullscreen: boolean) => void;
};

type InfoLineProps = {
  label: string;
  children: ReactNode;
};

function InfoLine({ label, children }: InfoLineProps) {
  return (
    <p>
      <strong>{label}:</strong> {children}
    </p>
  );
}

export function PlayerPane({ embeddedSurfaceRef, onSetFullscreen }: PlayerPaneProps) {
  const {
    playback,
    settings,
    recentChannels,
    error,
    pausePlayback,
    stopPlayback,
    seekPlayback,
    setVolume,
    setSettings,
    saveSettings,
    playChannel,
  } = useAppStore(useShallow((state) => ({
    playback: state.playback,
    settings: state.settings,
    recentChannels: state.recentChannels,
    error: state.error,
    pausePlayback: state.pausePlayback,
    stopPlayback: state.stopPlayback,
    seekPlayback: state.seekPlayback,
    setVolume: state.setVolume,
    setSettings: state.setSettings,
    saveSettings: state.saveSettings,
    playChannel: state.playChannel,
  })));

  const playerOverlayMessage = (() => {
    if (playback?.state === "loading") {
      return "Loading stream...";
    }
    if (playback?.state === "error") {
      return playback.last_error ?? "Playback error";
    }
    if (!playback?.current_url || playback.state === "stopped") {
      return "Select a channel to start playback";
    }
    return null;
  })();

  const isBuffering = playback?.state.toLowerCase() === "loading";

  const handleSaveSettings = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void saveSettings();
  };

  return (
    <aside className="pane player-pane">
      <section className="card">
        <div className="section-head">
          <h2>Player</h2>
        </div>
        <div className="player-surface-shell">
          <div ref={embeddedSurfaceRef} className="player-surface" />
          {playerOverlayMessage ? <div className="player-overlay">{playerOverlayMessage}</div> : null}
        </div>

        <InfoLine label="Backend">{playback?.backend ?? "..."}</InfoLine>
        <InfoLine label="Status">{playback?.state ?? "idle"}</InfoLine>
        <InfoLine label="Buffering">{isBuffering ? "yes" : "no"}</InfoLine>
        <InfoLine label="Attached">{playback?.attached_hwnd ?? "none"}</InfoLine>
        <InfoLine label="Surface">{playback?.embedded_surface_hwnd ?? "none"}</InfoLine>
        <InfoLine label="Mode">{playback?.render_mode ?? "embedded_surface"}</InfoLine>
        <InfoLine label="Current URL">{playback?.current_url ?? "none"}</InfoLine>
        <InfoLine label="Error">{playback?.last_error ?? "none"}</InfoLine>

        <div className="actions-row">
          <button type="button" onClick={() => void pausePlayback(true)}>
            Pause
          </button>
          <button type="button" onClick={() => void pausePlayback(false)}>
            Resume
          </button>
          <button type="button" onClick={() => void stopPlayback()}>
            Stop
          </button>
        </div>

        <div className="actions-row">
          <button type="button" onClick={() => void seekPlayback(-10)} disabled={!Boolean(playback?.current_url)}>
            -10s
          </button>
          <button type="button" onClick={() => void seekPlayback(10)} disabled={!Boolean(playback?.current_url)}>
            +10s
          </button>
        </div>

        <div className="actions-row">
          <button type="button" onClick={() => onSetFullscreen(!Boolean(playback?.fullscreen))}>
            {playback?.fullscreen ? "Exit Fullscreen" : "Fullscreen"}
          </button>
          <label className="volume">
            Volume
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(playback?.volume ?? 100)}
              onChange={(e) => void setVolume(Number(e.currentTarget.value))}
            />
          </label>
        </div>
      </section>

      <section className="card">
        <h2>Settings</h2>
        <form onSubmit={handleSaveSettings} className="stack">
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
            <input value="Normal (fixed for stability)" disabled />
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
              onClick={() => void playChannel(recent.channel.id)}
            >
              <span>{recent.channel.name}</span>
              <small>{new Date(recent.played_at * 1000).toLocaleString()}</small>
            </button>
          ))}
          {recentChannels.length === 0 ? <p className="muted">No recently played channels.</p> : null}
        </div>
      </section>

      {error ? <p className="error-banner">{error}</p> : null}
    </aside>
  );
}

(PlayerPane as any).whyDidYouRender = true;
