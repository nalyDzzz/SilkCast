import { useState } from 'react';
import {
  MediaPlayer,
  MediaProvider,
  type MediaPlayerProps,
} from '@vidstack/react';
import {
  DefaultVideoLayout,
  defaultLayoutIcons,
} from '@vidstack/react/player/layouts/default';
import '@vidstack/react/player/styles/default/theme.css';
import '@vidstack/react/player/styles/default/layouts/video.css';
import { ArrowLeft, ExternalLink, Square } from 'lucide-react';
import { ChannelRecord } from '@/components/app/types';
import { Button } from '@/components/ui/button';

type PlayerScreenProps = {
  activeChannel: ChannelRecord | null;
  onBack: () => void;
  onStop: () => void;
  onOpenInMpv: () => Promise<void>;
};

function resolveStreamType(
  activeChannel: ChannelRecord | null
): MediaPlayerProps['streamType'] {
  if (activeChannel?.media_kind === 'live') {
    return 'live';
  }

  return 'on-demand';
}

function normalizeStreamUrl(streamUrl: string) {
  const normalizedUrl = streamUrl.trim().toLowerCase();
  const normalizedPath = normalizedUrl.split(/[?#]/)[0] ?? '';
  return { normalizedUrl, normalizedPath };
}

function isLikelyHlsUrl(streamUrl: string) {
  const { normalizedUrl, normalizedPath } = normalizeStreamUrl(streamUrl);

  if (normalizedPath.endsWith('.m3u8') || normalizedUrl.includes('.m3u8')) {
    return true;
  }

  return (
    /(?:^|[?&#])(?:output|format|type)=m3u8(?:&|$)/.test(normalizedUrl) ||
    /(?:^|[?&#])(?:output|format|type)=hls(?:&|$)/.test(normalizedUrl)
  );
}

function isLikelyDashUrl(streamUrl: string) {
  const { normalizedUrl, normalizedPath } = normalizeStreamUrl(streamUrl);

  if (normalizedPath.endsWith('.mpd') || normalizedUrl.includes('.mpd')) {
    return true;
  }

  return (
    /(?:^|[?&#])(?:output|format|type)=mpd(?:&|$)/.test(normalizedUrl) ||
    /(?:^|[?&#])(?:output|format|type)=dash(?:&|$)/.test(normalizedUrl)
  );
}

type KnownVideoMimeType =
  | 'video/webm'
  | 'video/ogg'
  | 'video/avi'
  | 'video/mpeg'
  | 'video/mp4';

function resolveKnownVideoType(streamUrl: string): KnownVideoMimeType | null {
  const { normalizedPath } = normalizeStreamUrl(streamUrl);

  if (normalizedPath.endsWith('.webm')) {
    return 'video/webm';
  }

  if (normalizedPath.endsWith('.ogv') || normalizedPath.endsWith('.ogg')) {
    return 'video/ogg';
  }

  if (normalizedPath.endsWith('.avi')) {
    return 'video/avi';
  }

  if (
    normalizedPath.endsWith('.mpeg') ||
    normalizedPath.endsWith('.mpg') ||
    normalizedPath.endsWith('.ts')
  ) {
    return 'video/mpeg';
  }

  if (
    normalizedPath.endsWith('.mp4') ||
    normalizedPath.endsWith('.mov') ||
    normalizedPath.endsWith('.m4v')
  ) {
    return 'video/mp4';
  }

  return null;
}

function shouldUseNativeVideoPlayer(streamUrl: string) {
  const { normalizedPath } = normalizeStreamUrl(streamUrl);
  return normalizedPath.endsWith('.mkv');
}

function resolvePlayerSource(streamUrl: string): MediaPlayerProps['src'] {
  if (isLikelyHlsUrl(streamUrl)) {
    return {
      src: streamUrl,
      type: 'application/x-mpegurl',
    };
  }

  if (isLikelyDashUrl(streamUrl)) {
    return {
      src: streamUrl,
      type: 'application/dash+xml',
    };
  }

  const knownVideoType = resolveKnownVideoType(streamUrl);
  if (knownVideoType) {
    return {
      src: streamUrl,
      type: knownVideoType,
    };
  }

  // Let the browser and player infer unknown stream types instead of forcing MP4.
  return streamUrl;
}

export function PlayerScreen({
  activeChannel,
  onBack,
  onStop,
  onOpenInMpv,
}: PlayerScreenProps) {
  const [openingExternalPlayer, setOpeningExternalPlayer] = useState(false);

  const handleOpenInMpv = async () => {
    if (!activeChannel || openingExternalPlayer) {
      return;
    }

    setOpeningExternalPlayer(true);
    try {
      await onOpenInMpv();
    } finally {
      setOpeningExternalPlayer(false);
    }
  };

  return (
    <main className="relative h-full min-h-0 overflow-hidden bg-black text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.28),transparent_45%),radial-gradient(circle_at_bottom,rgba(15,23,42,0.85),rgba(0,0,0,0.95))]" />
      <section className="relative h-full min-h-0 p-3 sm:p-5">
        <div className="relative flex h-full min-h-0 overflow-hidden rounded-2xl border border-white/20 bg-black shadow-2xl shadow-black/70">
          {activeChannel ? (
            shouldUseNativeVideoPlayer(activeChannel.stream_url) ? (
              <video
                key={`${activeChannel.id}-${activeChannel.stream_url}`}
                className="h-full w-full bg-black object-contain"
                src={activeChannel.stream_url}
                controls
                playsInline
                autoPlay
              />
            ) : (
              <MediaPlayer
                key={`${activeChannel.id}-${activeChannel.stream_url}`}
                className="h-full w-full bg-black"
                title={activeChannel.name}
                src={resolvePlayerSource(activeChannel.stream_url)}
                streamType={resolveStreamType(activeChannel)}
                viewType="video"
                playsInline
                autoPlay
              >
                <MediaProvider />
                <DefaultVideoLayout icons={defaultLayoutIcons} />
              </MediaPlayer>
            )
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 p-4 text-center text-base font-medium text-white sm:text-lg">
              Pick something from Live TV or Movies to start playback.
            </div>
          )}

          <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-linear-to-b from-black/95 via-black/65 to-transparent" />
          <div className="absolute inset-x-0 top-0 flex flex-wrap items-center justify-between gap-2 p-3 sm:p-4">
            <Button
              type="button"
              variant="secondary"
              className="border border-white/25 bg-black/55 text-white hover:bg-black/70"
              onClick={onBack}
            >
              <ArrowLeft />
              Back
            </Button>

            <div className="rounded-full border border-white/20 bg-black/55 px-3 py-1 text-sm font-medium backdrop-blur-sm sm:px-4 sm:text-base">
              {activeChannel?.name ?? 'Now Playing'}
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                className="border border-white/25 bg-black/55 text-white hover:bg-black/70"
                onClick={() => void handleOpenInMpv()}
                disabled={!activeChannel || openingExternalPlayer}
              >
                <ExternalLink />
                {openingExternalPlayer ? 'Opening...' : 'Open In MPV'}
              </Button>

              <Button
                type="button"
                variant="secondary"
                className="border border-white/25 bg-black/55 text-white hover:bg-black/70"
                onClick={onStop}
                disabled={!activeChannel}
              >
                <Square />
                Stop
              </Button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
