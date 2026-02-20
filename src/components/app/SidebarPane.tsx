import { FormEvent } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import { useAppStore } from "../../store/appStore";
import { ALL_GROUPS } from "./types";
import { useShallow } from "zustand/react/shallow";

export function SidebarPane() {
  const {
    loading,
    m3uName,
    m3uLocation,
    importMessage,
    sources,
    selectedSourceId,
    groups,
    selectedGroup,
    selectedSourceExists,
    setM3uName,
    setM3uLocation,
    setSelectedSourceId,
    setSelectedGroup,
    refreshEverything,
    addM3uSource,
    refreshSource,
    deleteSource,
  } = useAppStore(useShallow((state) => ({
    loading: state.loading,
    m3uName: state.m3uName,
    m3uLocation: state.m3uLocation,
    importMessage: state.importMessage,
    sources: state.sources,
    selectedSourceId: state.selectedSourceId,
    groups: state.groups,
    selectedGroup: state.selectedGroup,
    selectedSourceExists: state.selectedSourceId !== null,
    setM3uName: state.setM3uName,
    setM3uLocation: state.setM3uLocation,
    setSelectedSourceId: state.setSelectedSourceId,
    setSelectedGroup: state.setSelectedGroup,
    refreshEverything: state.refreshEverything,
    addM3uSource: state.addM3uSource,
    refreshSource: state.refreshSource,
    deleteSource: state.deleteSource,
  })));

  const totalGroupChannels = groups.reduce((sum, group) => sum + group.channel_count, 0);

  const handleImportSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void addM3uSource(m3uName, m3uLocation);
  };

  return (
    <aside className="pane sidebar-pane">
      <section className="card">
        <h1>OpenTV v0.1</h1>
        <p className="muted">M3U MVP</p>
        <button onClick={() => void refreshEverything()} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh All"}
        </button>
      </section>

      <section className="card">
        <h2>Import M3U</h2>
        <form onSubmit={handleImportSubmit} className="stack">
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
        </div>
        <div className="list">
          {sources.map((source) => (
            <div key={source.id} className="source-row">
              <button
                type="button"
                className={
                  source.id === selectedSourceId
                    ? "source-select active list-item"
                    : "source-select list-item"
                }
                onClick={() => {
                  setSelectedSourceId(source.id);
                  setSelectedGroup(ALL_GROUPS);
                }}
              >
                <span>{source.name}</span>
                <small>{source.source_type}</small>
              </button>
              <div className="source-actions">
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => void refreshSource(source.id)}
                  aria-label={`Refresh ${source.name}`}
                  title={`Refresh ${source.name}`}
                >
                  <RefreshCw size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="icon-button danger"
                  onClick={() => {
                    const confirmed = window.confirm(
                      `Delete playlist "${source.name}"? This removes all its channels.`
                    );
                    if (!confirmed) {
                      return;
                    }
                    void deleteSource(source);
                  }}
                  aria-label={`Delete ${source.name}`}
                  title={`Delete ${source.name}`}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
          {sources.length === 0 ? <p className="muted">No sources yet.</p> : null}
        </div>
      </section>

      <section className="card">
        <h2>Groups</h2>
        <div className="list">
          <button
            type="button"
            className={selectedGroup === ALL_GROUPS ? "active list-item" : "list-item"}
            onClick={() => setSelectedGroup(ALL_GROUPS)}
            disabled={!selectedSourceExists}
          >
            <span>All Channels</span>
            <small>{totalGroupChannels}</small>
          </button>
          {groups.map((group) => (
            <button
              key={group.name}
              type="button"
              className={selectedGroup === group.name ? "active list-item" : "list-item"}
              onClick={() => setSelectedGroup(group.name)}
            >
              <span>{group.name}</span>
              <small>{group.channel_count}</small>
            </button>
          ))}
          {selectedSourceExists && groups.length === 0 ? (
            <p className="muted">No groups for this source.</p>
          ) : null}
        </div>
      </section>
    </aside>
  );
}

(SidebarPane as any).whyDidYouRender = true;
