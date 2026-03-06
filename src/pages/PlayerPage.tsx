import { useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useShallow } from 'zustand/react/shallow';
import { PlayerScreen } from '@/components/player/PlayerScreen';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAppStore } from '@/store/appStore';

type PlayerLocationState = {
  returnTo?: string;
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
    activeChannel,
    settings,
    setActiveChannel,
    openChannelInMpv,
  } = useAppStore(
    useShallow((state) => ({
      selectedSourceId: state.selectedSourceId,
      activeChannel: state.activeChannel,
      settings: state.settings,
      setActiveChannel: state.setActiveChannel,
      openChannelInMpv: state.openChannelInMpv,
    }))
  );

  useEffect(() => {
    if (selectedSourceId === null) {
      navigate('/', { replace: true });
    }
  }, [navigate, selectedSourceId]);

  const fallbackReturnPath =
    activeChannel?.media_kind === 'movie' ? '/dashboard/movies' : '/dashboard/live';

  const returnPath = useMemo(() => {
    const state = location.state as PlayerLocationState | null;
    return resolveReturnPath(state?.returnTo, fallbackReturnPath);
  }, [fallbackReturnPath, location.state]);

  const handleBack = () => {
    navigate(returnPath);
  };

  const handleOpenInMpv = async () => {
    if (!activeChannel) {
      return;
    }

    await openChannelInMpv(activeChannel);
    if (useAppStore.getState().error === null) {
      navigate(returnPath, { replace: true });
    }
  };

  if (selectedSourceId === null) {
    return null;
  }

  if (settings.preferred_player !== 'web') {
    return (
      <main className="flex h-full min-h-0 items-center justify-center p-4 md:p-6">
        <Card className="w-full max-w-xl">
          <CardHeader>
            <CardTitle>Web Player Is Disabled</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Your default player is set to MPV pop-out. Switch to the in-app web
              player in settings to use this screen.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => navigate('/dashboard/settings')}>
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

  return (
    <PlayerScreen
      activeChannel={activeChannel}
      onBack={handleBack}
      onStop={() => setActiveChannel(null)}
      onOpenInMpv={handleOpenInMpv}
    />
  );
}
