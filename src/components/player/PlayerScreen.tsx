import { useCallback, useMemo, useRef, useState, type WheelEvent } from 'react';
import type { ChannelRecord } from '@/components/app/types';
import { useChannelEpg } from '@/components/player/hooks/useChannelEpg';
import { useFullscreen } from '@/components/player/hooks/useFullscreen';
import { useIdleVisibility } from '@/components/player/hooks/useIdleVisibility';
import { useMediaPlaybackState } from '@/components/player/hooks/useMediaElementState';
import { usePlayerShortcuts } from '@/components/player/hooks/usePlayerShortcuts';
import {
  resumeKeyFor,
  useResumeTracking,
} from '@/components/player/hooks/useResumeTracking';
import { useStreamController } from '@/components/player/hooks/useStreamController';
import { PlayerControlBar } from '@/components/player/PlayerControlBar';
import { PlayerQueuePanel } from '@/components/player/PlayerQueuePanel';
import { PlayerShortcutsDialog } from '@/components/player/PlayerShortcutsDialog';
import { PlayerStatusOverlay } from '@/components/player/PlayerStatusOverlay';
import { PlayerTopBar } from '@/components/player/PlayerTopBar';
import { PlayerTransientNotice } from '@/components/player/PlayerTransientNotice';
import { PlayerUpNext } from '@/components/player/PlayerUpNext';
import { Button } from '@/components/ui/button';
import { ENGINE_LABELS } from '@/lib/player/engines';
import { formatPlaybackTime } from '@/lib/player/formatTime';
import {
  getResumeEntry,
  readStoredVolume,
  writeStoredVolume,
} from '@/lib/player/playerStorage';
import type { StreamSource } from '@/lib/player/streamController';
import {
  buildPlaybackUrl,
  buildPlaylistUrl,
  planStream,
} from '@/lib/player/streamSource';
import { cn } from '@/lib/utils';
import { displayTitle } from '@/lib/catalog/cleanName';

const SEEK_STEP_SECONDS = 10;
const VOLUME_STEP = 0.05;
/** Resuming a live channel after this long jumps back to the live edge. */
const LIVE_RESYNC_AFTER_PAUSE_MS = 30_000;

type PlayerScreenProps = {
  channel: ChannelRecord;
  queue: ChannelRecord[];
  proxyBaseUrl: string | null;
  mpvAvailable: boolean;
  epgEnabled: boolean;
  onBack: () => void;
  onSelectItem: (item: ChannelRecord) => void;
  onOpenInMpv: (startSeconds: number | null) => Promise<void>;
};

type Notice = { id: number; text: string };

function itemNounFor(mediaKind: ChannelRecord['media_kind']) {
  return mediaKind === 'live'
    ? 'channel'
    : mediaKind === 'series'
      ? 'episode'
      : 'item';
}

export function PlayerScreen({
  channel,
  queue,
  proxyBaseUrl,
  mpvAvailable,
  epgEnabled,
  onBack,
  onSelectItem,
  onOpenInMpv,
}: PlayerScreenProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [openingMpv, setOpeningMpv] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [dismissedUpNextFor, setDismissedUpNextFor] = useState<string | null>(
    null
  );
  const livePausedAtRef = useRef<number | null>(null);

  const isLive = channel.media_kind === 'live';
  const itemNoun = itemNounFor(channel.media_kind);
  const resumeKey = resumeKeyFor(channel);

  const attachVideo = useCallback((node: HTMLVideoElement | null) => {
    if (node) {
      const stored = readStoredVolume();
      node.volume = stored.volume;
      node.muted = stored.muted;
    }
    setVideo(node);
  }, []);

  const source = useMemo<StreamSource>(() => {
    const plan = planStream(channel.stream_url, channel.media_kind);
    return {
      url: buildPlaybackUrl(proxyBaseUrl, channel.stream_url),
      playlistUrl: buildPlaylistUrl(proxyBaseUrl, channel.stream_url),
      engines: plan.engines,
      isLive: plan.isLive,
      startPosition: plan.isLive
        ? null
        : (getResumeEntry(resumeKey)?.position ?? null),
    };
  }, [channel.media_kind, channel.stream_url, proxyBaseUrl, resumeKey]);

  const { controller, state: stream } = useStreamController(video, source);
  const media = useMediaPlaybackState(video);
  const { isFullscreen, setFullscreen, toggleFullscreen } =
    useFullscreen(containerRef);
  const idle = useIdleVisibility(3000);
  const epg = useChannelEpg(isLive ? channel.id : null, isLive && epgEnabled);
  useResumeTracking(video, resumeKey, !isLive);

  // Playlists often list the same stream in several groups, so match the exact
  // record first and only fall back to the URL.
  const queueIndex = useMemo(() => {
    const exact = queue.indexOf(channel);
    return exact >= 0
      ? exact
      : queue.findIndex((item) => item.stream_url === channel.stream_url);
  }, [channel, queue]);
  const hasQueue = queue.length > 1 && queueIndex >= 0;
  // Live channels wrap around like a TV; episodes stop at the ends.
  const previousItem = hasQueue
    ? queueIndex > 0
      ? queue[queueIndex - 1]
      : isLive
        ? queue[queue.length - 1]
        : null
    : null;
  const nextItem = hasQueue
    ? queueIndex < queue.length - 1
      ? queue[queueIndex + 1]
      : isLive
        ? queue[0]
        : null
    : null;

  const controlsVisible =
    idle.active ||
    media.paused ||
    menuOpen ||
    queueOpen ||
    stream.phase !== 'playing';
  const showUpNext =
    channel.media_kind === 'series' &&
    media.ended &&
    nextItem !== null &&
    dismissedUpNextFor !== channel.stream_url;

  const showNotice = (text: string) => {
    setNotice((current) => ({ id: (current?.id ?? 0) + 1, text }));
  };

  const selectItem = (item: ChannelRecord | null) => {
    if (!item) {
      return;
    }
    setQueueOpen(false);
    onSelectItem(item);
    showNotice(displayTitle(item.name));
  };

  const togglePlay = () => {
    if (!video) {
      return;
    }

    if (video.paused) {
      const pausedAt = livePausedAtRef.current;
      livePausedAtRef.current = null;
      if (
        isLive &&
        pausedAt !== null &&
        Date.now() - pausedAt > LIVE_RESYNC_AFTER_PAUSE_MS
      ) {
        controller?.retry();
        return;
      }
      void video.play()?.catch(() => undefined);
    } else {
      if (isLive) {
        livePausedAtRef.current = Date.now();
      }
      video.pause();
    }
  };

  const seekTo = (seconds: number) => {
    if (!video || isLive || !Number.isFinite(video.duration)) {
      return;
    }
    video.currentTime = Math.min(Math.max(seconds, 0), video.duration);
  };

  const seekBy = (delta: number) => {
    if (!video || isLive) {
      return;
    }
    seekTo(video.currentTime + delta);
    showNotice(
      `${delta > 0 ? '+' : '−'}${Math.abs(delta)}s · ${formatPlaybackTime(video.currentTime)}`
    );
  };

  const setVolume = (next: number) => {
    if (!video) {
      return;
    }
    const volume = Math.min(Math.max(next, 0), 1);
    video.volume = volume;
    video.muted = volume === 0;
    writeStoredVolume({ volume, muted: video.muted });
  };

  const stepVolume = (delta: number) => {
    if (!video) {
      return;
    }
    const base = video.muted ? 0 : video.volume;
    const next = Math.min(Math.max(base + delta, 0), 1);
    setVolume(next);
    showNotice(`Volume ${Math.round(next * 100)}%`);
  };

  const toggleMute = () => {
    if (!video) {
      return;
    }
    const muted = !video.muted;
    video.muted = muted;
    if (!muted && video.volume === 0) {
      video.volume = 0.5;
    }
    writeStoredVolume({ volume: video.volume, muted });
    showNotice(muted ? 'Muted' : `Volume ${Math.round(video.volume * 100)}%`);
  };

  const togglePip = () => {
    if (!video) {
      return;
    }
    if (document.pictureInPictureElement) {
      void document.exitPictureInPicture().catch(() => undefined);
    } else {
      void video.requestPictureInPicture().catch(() => undefined);
    }
  };

  const openInMpv = async () => {
    if (openingMpv) {
      return;
    }
    setOpeningMpv(true);
    const startSeconds =
      !isLive && video && video.currentTime > 5
        ? Math.floor(video.currentTime)
        : null;
    video?.pause();
    try {
      await setFullscreen(false);
      await onOpenInMpv(startSeconds);
    } finally {
      setOpeningMpv(false);
    }
  };

  const exit = () => {
    if (menuOpen) {
      return;
    }
    if (queueOpen) {
      setQueueOpen(false);
      return;
    }
    if (isFullscreen) {
      void setFullscreen(false);
      return;
    }
    onBack();
  };

  usePlayerShortcuts(
    {
      togglePlay,
      toggleFullscreen: () => void toggleFullscreen(),
      toggleMute,
      seekBackward: () => seekBy(-SEEK_STEP_SECONDS),
      seekForward: () => seekBy(SEEK_STEP_SECONDS),
      volumeUp: () => stepVolume(VOLUME_STEP),
      volumeDown: () => stepVolume(-VOLUME_STEP),
      previousItem: () => selectItem(previousItem),
      nextItem: () => selectItem(nextItem),
      toggleQueue: () => hasQueue && setQueueOpen((open) => !open),
      showShortcuts: () => setShortcutsOpen(true),
      exit,
    },
    // Menus handle their own keys (and type-ahead on letters).
    !shortcutsOpen && !menuOpen
  );

  const handleWheel = (event: WheelEvent<HTMLElement>) => {
    if (event.deltaY === 0) {
      return;
    }
    stepVolume(event.deltaY < 0 ? VOLUME_STEP : -VOLUME_STEP);
  };

  const pipSupported =
    typeof document !== 'undefined' &&
    document.pictureInPictureEnabled === true;
  const resumePosition = source.startPosition ?? 0;

  return (
    <div
      ref={containerRef}
      className={cn(
        'dark relative h-full w-full overflow-hidden bg-black text-white select-none',
        !controlsVisible && 'cursor-none'
      )}
      onPointerMove={idle.poke}
      onPointerDown={idle.poke}
      onPointerLeave={() => !media.paused && idle.hide()}
    >
      <video
        ref={attachVideo}
        className="absolute inset-0 h-full w-full bg-black object-contain"
        playsInline
        onClick={togglePlay}
        onDoubleClick={() => void toggleFullscreen()}
        onWheel={handleWheel}
      />

      <PlayerStatusOverlay
        stream={stream}
        waiting={media.waiting}
        paused={media.paused && !showUpNext}
        onRetry={() => controller?.retry()}
        onTogglePlay={togglePlay}
        onOpenInMpv={mpvAvailable ? () => void openInMpv() : null}
        onNextItem={isLive && nextItem ? () => selectItem(nextItem) : null}
      />

      <div className="pointer-events-none absolute inset-x-0 top-16 z-20 flex justify-center">
        {notice ? (
          <PlayerTransientNotice key={notice.id} durationMs={1200}>
            {notice.text}
          </PlayerTransientNotice>
        ) : null}
      </div>

      <div
        className={cn(
          'absolute inset-x-0 top-0 z-20 bg-linear-to-b from-black/85 via-black/40 to-transparent transition-opacity duration-300',
          controlsVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
      >
        <PlayerTopBar
          channel={channel}
          epg={epg}
          positionLabel={
            hasQueue ? `${queueIndex + 1} of ${queue.length}` : null
          }
          onBack={onBack}
          onShowShortcuts={() => setShortcutsOpen(true)}
        />
        {resumePosition > 0 ? (
          <div className="flex px-5">
            <PlayerTransientNotice
              key={source.url}
              durationMs={8000}
              className="pointer-events-auto flex items-center gap-3 rounded-lg py-1.5 pr-1.5"
            >
              Resumed at {formatPlaybackTime(resumePosition)}
              <Button
                type="button"
                size="xs"
                variant="secondary"
                onClick={() => seekTo(0)}
              >
                Start over
              </Button>
            </PlayerTransientNotice>
          </div>
        ) : null}
      </div>

      <div
        className={cn(
          'absolute inset-x-0 bottom-0 z-20 bg-linear-to-t from-black/90 via-black/50 to-transparent transition-opacity duration-300',
          controlsVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
      >
        <PlayerControlBar
          video={video}
          isLive={isLive}
          paused={media.paused}
          volume={media.volume}
          muted={media.muted}
          playbackRate={media.playbackRate}
          itemNoun={itemNoun}
          canGoPrevious={previousItem !== null}
          canGoNext={nextItem !== null}
          queueLabel={hasQueue ? (isLive ? 'Channels' : 'Episodes') : null}
          engine={controller?.getEngine() ?? null}
          tracksVersion={stream.tracksVersion}
          engineLabel={stream.engine ? ENGINE_LABELS[stream.engine] : null}
          isFullscreen={isFullscreen}
          pipSupported={pipSupported}
          mpvAvailable={mpvAvailable}
          openingMpv={openingMpv}
          onTogglePlay={togglePlay}
          onSeekBy={seekBy}
          onSeekTo={seekTo}
          onPrevious={() => selectItem(previousItem)}
          onNext={() => selectItem(nextItem)}
          onVolumeChange={setVolume}
          onToggleMute={toggleMute}
          onPlaybackRateChange={(rate) => {
            if (video) {
              video.playbackRate = rate;
            }
          }}
          onToggleQueue={() => setQueueOpen((open) => !open)}
          onTogglePip={togglePip}
          onOpenInMpv={() => void openInMpv()}
          onToggleFullscreen={() => void toggleFullscreen()}
          onMenuOpenChange={setMenuOpen}
        />
      </div>

      {showUpNext && nextItem ? (
        <PlayerUpNext
          key={channel.stream_url}
          nextItem={nextItem}
          onPlayNext={() => selectItem(nextItem)}
          onCancel={() => setDismissedUpNextFor(channel.stream_url)}
        />
      ) : null}

      {hasQueue ? (
        <PlayerQueuePanel
          open={queueOpen}
          onOpenChange={setQueueOpen}
          items={queue}
          activeItem={channel}
          title={isLive ? 'Channels' : 'Episodes'}
          onSelect={selectItem}
        />
      ) : null}

      <PlayerShortcutsDialog
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
      />
    </div>
  );
}
