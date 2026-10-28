import { useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import { ArrowLeft, Loader2, MonitorPlay } from 'lucide-react';
import type { ChannelRecord } from '@/components/app/types';
import { PlayerScreen } from '@/components/player/PlayerScreen';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAppStore } from '@/store/appStore';
import { displayTitle } from '@/lib/catalog/cleanName';

type PlayerLocationState = {
  returnTo?: string;
};

const FALLBACK_RETURN_PATH: Record<ChannelRecord['media_kind'], string> = {
  live: '/dashboard/live',
  movie: '/dashboard/movies',
  series: '/dashboard/series',
};

function resolveReturnPath(candidate: unknown, fallbackPath: string) {
  if (
    typeof candidate === 'string' &&
    candidate.startsWith('/dashboard/') &&
    candidate !== '/dashboard/player'
  ) {
    return candidate;
  }

  return fallbackPath;
}

export function PlayerPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const {
    selectedSourceId,
    sources,
    activeChannel,
    playbackQueue,
    settings,
    playerEnvironment,
    loadPlayerEnvironment,
    playChannelRecord,
    openChannelInMpv,
  } = useAppStore(
    useShallow((state) => ({
      selectedSourceId: state.selectedSourceId,
      sources: state.sources,
      activeChannel: state.activeChannel,
      playbackQueue: state.playbackQueue,
      settings: state.settings,
      playerEnvironment: state.playerEnvironment,
      loadPlayerEnvironment: state.loadPlayerEnvironment,
      playChannelRecord: state.playChannelRecord,
      openChannelInMpv: state.openChannelInMpv,
    }))
  );

  useEffect(() => {
    if (selectedSourceId === null) {
      navigate('/', { replace: true });
    }
  }, [navigate, selectedSourceId]);

  useEffect(() => {
    if (playerEnvironment === null) {
      void loadPlayerEnvironment();
    }
  }, [loadPlayerEnvironment, playerEnvironment]);

  const returnPath = useMemo(() => {
    const state = location.state as PlayerLocationState | null;
    return resolveReturnPath(
      state?.returnTo,
      FALLBACK_RETURN_PATH[activeChannel?.media_kind ?? 'live']
    );
  }, [activeChannel?.media_kind, location.state]);

  const supportsGuide = useMemo(
    () =>
      sources.find((source) => source.id === activeChannel?.source_id)
        ?.supports_guide ?? false,
    [activeChannel?.source_id, sources]
  );

  const handleBack = () => {
    navigate(returnPath);
  };

  const handleOpenInMpv = async (startSeconds: number | null) => {
    if (!activeChannel) {
      return;
    }

    await openChannelInMpv(activeChannel, { startSeconds });
    const { error } = useAppStore.getState();
    if (error === null) {
      toast.success(`Opened "${displayTitle(activeChannel.name)}" in MPV`);
      navigate(returnPath, { replace: true });
    } else {
      toast.error("Couldn't open MPV", { description: error });
    }
  };

  if (selectedSourceId === null) {
    return null;
  }

  if (settings.preferred_player !== 'web') {
    return (
      <main className="flex h-screen min-h-0 items-center justify-center p-4 md:p-6">
        <Card className="w-full max-w-xl">
          <CardHeader>
            <CardTitle>Web Player Is Disabled</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Your default player is set to MPV pop-out. Switch to the in-app
              player in settings to use this screen.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => navigate('/dashboard/settings')}
              >
                Open Settings
              </Button>
              <Button type="button" variant="outline" onClick={handleBack}>
                Back
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (!activeChannel) {
    return (
      <main className="dark flex h-screen flex-col items-center justify-center gap-4 bg-black p-6 text-center text-white">
        <MonitorPlay className="size-12 text-white/50" aria-hidden="true" />
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Nothing is playing</h1>
          <p className="text-sm text-white/60">
            Pick something from Live TV, Movies, or Series to start playback.
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={handleBack}>
          <ArrowLeft />
          Back
        </Button>
      </main>
    );
  }

  if (playerEnvironment === null) {
    return (
      <main className="flex h-screen items-center justify-center bg-black text-white">
        <Loader2
          className="size-8 animate-spin"
          aria-label="Preparing player"
        />
      </main>
    );
  }

  return (
    <main className="h-screen w-screen overflow-hidden bg-black">
      <PlayerScreen
        channel={activeChannel}
        queue={playbackQueue}
        proxyBaseUrl={playerEnvironment.stream_proxy_base_url}
        mpvAvailable={playerEnvironment.mpv_available}
        epgEnabled={supportsGuide}
        onBack={handleBack}
        onSelectItem={(item) => void playChannelRecord(item, playbackQueue)}
        onOpenInMpv={handleOpenInMpv}
      />
    </main>
  );
}
