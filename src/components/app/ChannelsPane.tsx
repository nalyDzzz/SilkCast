import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store/appStore.ts';

export function ChannelsPane() {
  const {
    sources,
    selectedSourceId,
    searchQuery,
    favoritesOnly,
    channels,
    selectedSourceExists,
    setSearchQuery,
    setFavoritesOnly,
    playChannel,
    toggleFavorite,
  } = useAppStore(
    useShallow((state) => ({
      sources: state.sources,
      selectedSourceId: state.selectedSourceId,
      searchQuery: state.searchQuery,
      favoritesOnly: state.favoritesOnly,
      channels: state.channels,
      selectedSourceExists: state.selectedSourceId !== null,
      setSearchQuery: state.setSearchQuery,
      setFavoritesOnly: state.setFavoritesOnly,
      playChannel: state.playChannel,
      toggleFavorite: state.toggleFavorite,
    }))
  );

  const selectedSource = useMemo(
    () => sources.find((source) => source.id === selectedSourceId) ?? null,
    [sources, selectedSourceId]
  );

  return (
    <section className="pane channels-pane">
      <section className="card channel-controls">
        <h2>Channels</h2>
        <div className="toolbar">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.currentTarget.value)}
            placeholder="Search channels"
            disabled={!selectedSourceExists}
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
            ? `${selectedSource.name} - ${channels.length} channels`
            : 'Select or import a source'}
        </p>
      </section>

      <section className="card channel-list">
        {channels.map((channel) => (
          <article key={channel.id} className="channel-row">
            <button
              type="button"
              className="channel-play"
              onClick={() => void playChannel(channel.id)}
            >
              Play
            </button>
            {channel.logo ? (
              <img
                src={channel.logo}
                alt=""
                className="channel-logo"
                loading="lazy"
              />
            ) : null}
            <div className="channel-meta">
              <h3>{channel.name}</h3>
              <p>{channel.group_name}</p>
            </div>
            <button
              type="button"
              className={channel.is_favorite ? 'favorite active' : 'favorite'}
              onClick={() => void toggleFavorite(channel)}
              aria-label={
                channel.is_favorite ? 'Remove favorite' : 'Add favorite'
              }
            >
              *
            </button>
          </article>
        ))}
        {selectedSourceExists && channels.length === 0 ? (
          <p className="muted">No channels match your filters.</p>
        ) : null}
      </section>
    </section>
  );
}

(ChannelsPane as any).whyDidYouRender = true;
