import { useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  ArrowLeft,
  ExternalLink,
  FastForward,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Rewind,
  Square,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { ChannelRecord } from '@/components/app/types';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';

type PlayerScreenProps = {
  activeChannel: ChannelRecord | null;
  onBack: () => void;
  onStop: () => void;
  onOpenInMpv: () => Promise<void>;
};

type VideoState = 'idle' | 'loading' | 'playing' | 'paused' | 'error';
type PlaybackEngine = 'hlsjs' | 'native' | 'none';

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '00:00';
  }

  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function isLikelyHlsUrl(url: string) {
  const normalized = url.toLowerCase();
  return normalized.includes('.m3u8') || normalized.includes('m3u8');
}

export function PlayerScreen({
  activeChannel,
  onBack,
  onStop,
  onOpenInMpv,
}: PlayerScreenProps) {
  const playerShellRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hlsNativeFallbackTriedRef = useRef(false);

  const [videoState, setVideoState] = useState<VideoState>('idle');
  const [videoError, setVideoError] = useState<string | null>(null);
  const [playbackEngine, setPlaybackEngine] = useState<PlaybackEngine>('none');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [openingExternalPlayer, setOpeningExternalPlayer] = useState(false);

  const destroyHlsPlayer = () => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
  };

  const teardownInAppPlayer = () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    destroyHlsPlayer();
    video.pause();
    video.removeAttribute('src');
    video.load();
    setVideoState('idle');
    setVideoError(null);
    setCurrentTime(0);
    setDuration(0);
    setPlaybackEngine('none');
  };

  const startNativePlayback = (video: HTMLVideoElement, url: string) => {
    destroyHlsPlayer();
    setPlaybackEngine('native');
    video.src = url;
    video.load();
    void video.play().catch((err) => {
      setVideoState('error');
      setVideoError(String(err));
    });
  };

  const startHlsPlayback = (video: HTMLVideoElement, url: string) => {
    destroyHlsPlayer();
    setPlaybackEngine('hlsjs');
    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
    });
    hlsRef.current = hls;

    hls.on(Hls.Events.MEDIA_ATTACHED, () => {
      hls.loadSource(url);
    });

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      void video.play().catch((err) => {
        setVideoState('error');
        setVideoError(String(err));
      });
    });

    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (!data.fatal) {
        return;
      }

      destroyHlsPlayer();
      if (!hlsNativeFallbackTriedRef.current) {
        hlsNativeFallbackTriedRef.current = true;
        startNativePlayback(video, url);
        return;
      }

      setVideoState('error');
      setVideoError(`hls.js fatal error (${data.type}/${data.details})`);
    });

    hls.attachMedia(video);
  };

  const handleSeekRelative = (seconds: number) => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    video.currentTime = Math.max(
      0,
      Math.min(video.duration || 0, video.currentTime + seconds)
    );
  };

  const handleSeekToPercent = (percent: number) => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const playableDuration =
      Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : duration;

    if (playableDuration <= 0) {
      return;
    }

    video.currentTime = (percent / 100) * playableDuration;
  };

  const handleTogglePlayPause = async () => {
    const video = videoRef.current;
    if (!video || !activeChannel) {
      return;
    }

    try {
      if (video.paused) {
        await video.play();
      } else {
        video.pause();
      }
    } catch (err) {
      setVideoState('error');
      setVideoError(String(err));
    }
  };

  const handleToggleFullscreen = async () => {
    const shell = playerShellRef.current;
    if (!shell) {
      return;
    }

    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    await shell.requestFullscreen();
  };

  const handleOpenInMpv = async () => {
    if (!activeChannel || openingExternalPlayer) {
      return;
    }

    setOpeningExternalPlayer(true);
    try {
      teardownInAppPlayer();
      await onOpenInMpv();
    } catch (err) {
      setVideoState('error');
      setVideoError(String(err));
    } finally {
      setOpeningExternalPlayer(false);
    }
  };

  const handleStop = () => {
    teardownInAppPlayer();
    onStop();
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    hlsNativeFallbackTriedRef.current = false;

    if (!activeChannel) {
      teardownInAppPlayer();
      return;
    }

    setVideoState('loading');
    setVideoError(null);
    setCurrentTime(0);
    setDuration(0);

    if (Hls.isSupported() && isLikelyHlsUrl(activeChannel.stream_url)) {
      startHlsPlayback(video, activeChannel.stream_url);
    } else {
      startNativePlayback(video, activeChannel.stream_url);
    }
  }, [activeChannel]);

  useEffect(() => {
    return () => {
      destroyHlsPlayer();
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    video.volume = volume / 100;
    video.muted = isMuted;
  }, [isMuted, volume]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, []);

  useEffect(() => {
    const isInteractiveTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) {
        return false;
      }
      if (target.isContentEditable) {
        return true;
      }

      const tagName = target.tagName.toLowerCase();
      return (
        tagName === 'input' ||
        tagName === 'textarea' ||
        tagName === 'select' ||
        tagName === 'button'
      );
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }

      if (isInteractiveTarget(event.target)) {
        return;
      }

      if (!activeChannel) {
        return;
      }

      const key = event.key.toLowerCase();
      if (event.code === 'Space' || key === 'spacebar') {
        event.preventDefault();
        void handleTogglePlayPause();
        return;
      }

      if (key === 'f') {
        event.preventDefault();
        void handleToggleFullscreen();
        return;
      }

      if (key === 'm') {
        event.preventDefault();
        setIsMuted((current) => !current);
        return;
      }

      if (key === 'arrowleft') {
        event.preventDefault();
        handleSeekRelative(-10);
        return;
      }

      if (key === 'arrowright') {
        event.preventDefault();
        handleSeekRelative(10);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [activeChannel]);

  const playerOverlayMessage = useMemo(() => {
    if (videoState === 'loading') {
      return 'Loading stream...';
    }

    if (videoState === 'error') {
      return (
        videoError ??
        'This stream could not be played in the in-app web player.'
      );
    }

    if (!activeChannel) {
      return 'Pick something from Live TV or Movies to start playback.';
    }

    return null;
  }, [activeChannel, videoError, videoState]);

  const playbackProgressPercent =
    duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <main className="relative h-full min-h-0 overflow-hidden bg-black text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.35),_transparent_45%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.85),_rgba(0,0,0,0.95))]" />
      <section className="relative h-full min-h-0 p-3 sm:p-5">
        <div
          ref={playerShellRef}
          className="relative flex h-full min-h-0 overflow-hidden rounded-2xl border border-white/20 bg-black shadow-2xl shadow-black/70"
        >
          <video
            ref={videoRef}
            className="h-full w-full bg-black object-contain"
            playsInline
            onCanPlay={() => {
              if (videoState !== 'playing') {
                setVideoState('playing');
              }
            }}
            onPlaying={() => setVideoState('playing')}
            onPause={() => setVideoState('paused')}
            onWaiting={() => setVideoState('loading')}
            onError={() => {
              const mediaError = videoRef.current?.error;
              const message = mediaError
                ? `Media error code ${mediaError.code}.`
                : 'Unknown media error.';
              setVideoState('error');
              setVideoError(message);
            }}
            onTimeUpdate={() => {
              const video = videoRef.current;
              if (!video) {
                return;
              }

              setCurrentTime(video.currentTime);
              setDuration(video.duration || 0);
            }}
          />

          {playerOverlayMessage ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 p-4 text-center text-base font-medium text-white sm:text-lg">
              {playerOverlayMessage}
            </div>
          ) : null}

          <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-black/95 via-black/65 to-transparent" />
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
          </div>

          <div className="absolute inset-x-0 bottom-0 space-y-3 bg-gradient-to-t from-black/95 via-black/72 to-transparent p-3 sm:p-4">
            <div className="flex items-center gap-3 text-xs text-white/80 sm:text-sm">
              <span className="min-w-12 text-right">{formatTime(currentTime)}</span>
              <Slider
                min={0}
                max={100}
                step={0.1}
                value={[playbackProgressPercent]}
                onValueCommit={(value) => handleSeekToPercent(value[0] ?? 0)}
                disabled={!activeChannel || duration <= 0}
              />
              <span className="min-w-12">{formatTime(duration)}</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="bg-white/90 text-black hover:bg-white"
                onClick={() => void handleTogglePlayPause()}
                disabled={!activeChannel}
              >
                {videoState === 'playing' ? <Pause /> : <Play />}
                {videoState === 'playing' ? 'Pause' : 'Play'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="border border-white/25 bg-black/55 text-white hover:bg-black/70"
                onClick={() => handleSeekRelative(-10)}
                disabled={!activeChannel}
              >
                <Rewind />
                -10s
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="border border-white/25 bg-black/55 text-white hover:bg-black/70"
                onClick={() => handleSeekRelative(10)}
                disabled={!activeChannel}
              >
                <FastForward />
                +10s
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="border border-white/25 bg-black/55 text-white hover:bg-black/70"
                onClick={() => setIsMuted((current) => !current)}
                disabled={!activeChannel}
              >
                {isMuted ? <VolumeX /> : <Volume2 />}
                {isMuted ? 'Unmute' : 'Mute'}
              </Button>
              <div className="flex w-full items-center gap-2 sm:w-52">
                <span className="w-12 text-xs text-white/70">Volume</span>
                <Slider
                  min={0}
                  max={100}
                  step={1}
                  value={[Math.round(volume)]}
                  onValueChange={(value) => {
                    const nextVolume = value[0] ?? 0;
                    setVolume(nextVolume);
                    if (nextVolume > 0) {
                      setIsMuted(false);
                    }
                  }}
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="border border-white/25 bg-black/55 text-white hover:bg-black/70"
                onClick={() => void handleToggleFullscreen()}
                disabled={!activeChannel}
              >
                {isFullscreen ? <Minimize2 /> : <Maximize2 />}
                {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="border border-white/25 bg-black/55 text-white hover:bg-black/70"
                onClick={handleStop}
                disabled={!activeChannel}
              >
                <Square />
                Stop
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-white/60">
              <span>Status: {videoState}</span>
              <span>Engine: {playbackEngine}</span>
              <span>Shortcuts: Space, F, M, ←, →</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
