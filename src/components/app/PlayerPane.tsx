import {
  FormEvent,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Hls from 'hls.js';
import { useAppStore } from '@/store/appStore';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/button.tsx';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card.tsx';
import { Field, FieldLabel } from '@/components/ui/field.tsx';
import { Slider } from '@/components/ui/slider.tsx';
import { Checkbox } from '@/components/ui/checkbox.tsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.tsx';
import { Phase1Settings } from '@/components/app/types.ts';
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '@/components/ui/item.tsx';

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

export function PlayerPane() {
  const {
    activeChannel,
    playback,
    settings,
    recentChannels,
    error,
    setError,
    setSettings,
    saveSettings,
    playChannel,
    openChannelInMpv,
  } = useAppStore(
    useShallow((state) => ({
      activeChannel: state.activeChannel,
      playback: state.playback,
      settings: state.settings,
      recentChannels: state.recentChannels,
      error: state.error,
      setError: state.setError,
      setSettings: state.setSettings,
      saveSettings: state.saveSettings,
      playChannel: state.playChannel,
      openChannelInMpv: state.openChannelInMpv,
    }))
  );

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerShellRef = useRef<HTMLDivElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hlsNativeFallbackTriedRef = useRef(false);
  const [videoState, setVideoState] = useState<
    'idle' | 'loading' | 'playing' | 'paused' | 'error'
  >('idle');
  const [videoError, setVideoError] = useState<string | null>(null);
  const [playbackEngine, setPlaybackEngine] = useState<
    'hlsjs' | 'native' | 'none'
  >('none');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const destroyHlsPlayer = () => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
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

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    hlsNativeFallbackTriedRef.current = false;
    if (!activeChannel) {
      destroyHlsPlayer();
      video.removeAttribute('src');
      video.load();
      setVideoState('idle');
      setVideoError(null);
      setCurrentTime(0);
      setDuration(0);
      setPlaybackEngine('none');
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
        'This stream could not be played in the in-app web player. Use MPV pop-out.'
      );
    }
    if (!activeChannel) {
      if (settings.preferred_player === 'mpv') {
        return 'Select a channel to launch MPV pop-out playback';
      }
      return 'Select a channel to start playback';
    }
    return null;
  }, [activeChannel, settings.preferred_player, videoError, videoState]);

  const handleSaveSettings = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void saveSettings();
  };

  const handleTogglePlayPause = async () => {
    const video = videoRef.current;
    if (!video) {
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

  const handleOpenInMpv = async () => {
    if (!activeChannel) {
      return;
    }

    try {
      teardownInAppPlayer();
      await openChannelInMpv(activeChannel);
    } catch (err) {
      setError(String(err));
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

  return (
    <aside className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>
            Player (
            {settings.preferred_player === 'web'
              ? 'Web Default'
              : 'MPV Default'}
            )
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            ref={playerShellRef}
            className="relative mb-3 aspect-video overflow-hidden rounded-lg border bg-black"
          >
            <video
              ref={videoRef}
              className="h-full w-full"
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
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/55 p-3 text-center font-semibold text-white">
                {playerOverlayMessage}
              </div>
            ) : null}

            <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-black/65 p-2 text-white">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => void handleTogglePlayPause()}
                disabled={!activeChannel}
              >
                {videoState === 'playing' ? 'Pause' : 'Play'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => handleSeekRelative(-10)}
                disabled={!activeChannel}
              >
                -10s
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => handleSeekRelative(10)}
                disabled={!activeChannel}
              >
                +10s
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setIsMuted((current) => !current)}
                disabled={!activeChannel}
              >
                {isMuted ? 'Unmute' : 'Mute'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => void handleToggleFullscreen()}
                disabled={!activeChannel}
              >
                {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              </Button>
            </div>
          </div>

          <Field>
            <FieldLabel>Volume</FieldLabel>
            <Slider
              min={0}
              max={100}
              value={[Math.round(volume)]}
              onValueChange={(value) => setVolume(value[0])}
              step={1}
            />
          </Field>

          <div className="mt-2 flex items-center justify-between text-sm">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button
              type="button"
              onClick={() => void handleOpenInMpv()}
              disabled={!activeChannel}
            >
              Open In MPV Pop-out
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={teardownInAppPlayer}
              disabled={!activeChannel}
            >
              Stop In-App
            </Button>
          </div>

          <InfoLine label="Active Channel">
            {activeChannel?.name ?? 'none'}
          </InfoLine>
          <InfoLine label="Web Status">{videoState}</InfoLine>
          <InfoLine label="Web Engine">{playbackEngine}</InfoLine>
          <InfoLine label="MPV Backend">{playback?.backend ?? '...'}</InfoLine>
          <InfoLine label="MPV Render Mode">
            {playback?.render_mode ?? 'external_window'}
          </InfoLine>
          <InfoLine label="MPV URL">{playback?.current_url ?? 'none'}</InfoLine>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveSettings} className="flex flex-col gap-4">
            <Field orientation="horizontal">
              <Checkbox
                checked={settings.hardware_decode}
                onCheckedChange={(e) =>
                  setSettings((current) => ({
                    ...current,
                    hardware_decode: e === true,
                  }))
                }
              />
              <FieldLabel>Hardware decode</FieldLabel>
            </Field>
            <Field>
              <FieldLabel>Buffering</FieldLabel>
              <Select value="Normal">
                <SelectTrigger>
                  <SelectValue>Normal</SelectValue>
                </SelectTrigger>
              </Select>
            </Field>

            <Field>
              <FieldLabel>Startup</FieldLabel>
              <Select
                value={settings.startup_behavior}
                onValueChange={(e) =>
                  setSettings((current) => ({
                    ...current,
                    startup_behavior: e as Phase1Settings['startup_behavior'],
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a startup behavior" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="home">Home view</SelectItem>
                  <SelectItem value="resume_last">
                    Resume last channel
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Default Player</FieldLabel>
              <Select
                value={settings.preferred_player}
                onValueChange={(value) =>
                  setSettings((current) => ({
                    ...current,
                    preferred_player:
                      value as Phase1Settings['preferred_player'],
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a default player" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="web">In-app web player</SelectItem>
                  <SelectItem value="mpv">MPV pop-out</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Button type="submit">Save Settings</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recents</CardTitle>
        </CardHeader>
        <CardContent>
          <ItemGroup className="max-h-60 gap-2 overflow-y-scroll">
            {recentChannels.map((recent) => (
              <Item
                size="sm"
                variant="outline"
                className="cursor-pointer"
                key={`${recent.channel.id}-${recent.played_at}`}
                onClick={() => void playChannel(recent.channel.id)}
              >
                <ItemContent>
                  <ItemTitle>{recent.channel.name}</ItemTitle>
                  <ItemDescription>
                    {new Date(recent.played_at * 1000).toLocaleString()}
                  </ItemDescription>
                </ItemContent>
              </Item>
            ))}
            {recentChannels.length === 0 ? (
              <p className="text-muted-foreground">
                No recently played channels.
              </p>
            ) : null}
          </ItemGroup>
        </CardContent>
      </Card>
      {error ? (
        <p className="border-destructive-0 m-0 rounded-lg border p-3 font-semibold text-destructive">
          {error}
        </p>
      ) : null}
    </aside>
  );
}

(PlayerPane as any).whyDidYouRender = true;
