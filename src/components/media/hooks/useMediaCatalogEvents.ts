import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { BackendEvent, PlaybackStatus } from '@/components/app/types';
import { MediaCatalogKind } from '@/components/media/mediaCatalogConfig';
import { subscribeBackendEvents } from '@/lib/api/eventsApi';

type UseMediaCatalogEventsArgs = {
  mediaKind: MediaCatalogKind;
  selectedSourceId: number | null;
  loadSources: () => Promise<void>;
  loadSettings: () => Promise<void>;
  loadRecents: () => Promise<void>;
  loadPlaybackStatus: () => Promise<void>;
  setPlayback: (playback: PlaybackStatus) => void;
  reportError: (message: string) => void;
  onSourcesUpdated: () => void;
  onEpgUpdated: () => void;
  onExternalPlaybackClosed: (closedUrl: unknown) => void;
};

export function useMediaCatalogEvents({
  mediaKind,
  selectedSourceId,
  loadSources,
  loadSettings,
  loadRecents,
  loadPlaybackStatus,
  setPlayback,
  reportError,
  onSourcesUpdated,
  onEpgUpdated,
  onExternalPlaybackClosed,
}: UseMediaCatalogEventsArgs) {
  const navigate = useNavigate();

  useEffect(() => {
    void loadSources().catch((err) => reportError(String(err)));
    void loadSettings().catch((err) => reportError(String(err)));

    if (mediaKind === 'live') {
      void loadRecents().catch((err) => reportError(String(err)));
      void loadPlaybackStatus().catch((err) => reportError(String(err)));
    }
  }, [
    loadPlaybackStatus,
    loadRecents,
    loadSettings,
    loadSources,
    mediaKind,
    reportError,
  ]);

  useEffect(() => {
    if (selectedSourceId === null) {
      navigate('/', { replace: true });
    }
  }, [navigate, selectedSourceId]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    void subscribeBackendEvents((backendEvent: BackendEvent) => {
      if (backendEvent.event === 'playback_state_changed' && mediaKind === 'live') {
        const playbackState = backendEvent.payload['state'] as
          | PlaybackStatus
          | undefined;

        if (playbackState) {
          setPlayback(playbackState);
        }
        return;
      }

      if (backendEvent.event === 'sources_updated') {
        void loadSources().catch((err) => reportError(String(err)));
        onSourcesUpdated();
        return;
      }

      if (backendEvent.event === 'settings_updated') {
        void loadSettings().catch((err) => reportError(String(err)));
        return;
      }

      if (backendEvent.event === 'recents_updated') {
        void loadRecents().catch((err) => reportError(String(err)));
        return;
      }

      if (backendEvent.event === 'epg_updated') {
        const payloadSourceId = backendEvent.payload['source_id'];
        if (
          typeof payloadSourceId === 'number' &&
          selectedSourceId !== null &&
          payloadSourceId === selectedSourceId
        ) {
          onEpgUpdated();
        }
        return;
      }

      if (backendEvent.event !== 'external_playback_closed') {
        return;
      }

      onExternalPlaybackClosed(backendEvent.payload['url']);
    })
      .then((unsubscribe) => {
        unlisten = unsubscribe;
      })
      .catch((err) => reportError(String(err)));

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [
    loadRecents,
    loadSettings,
    loadSources,
    mediaKind,
    onEpgUpdated,
    onExternalPlaybackClosed,
    onSourcesUpdated,
    reportError,
    selectedSourceId,
    setPlayback,
  ]);
}
