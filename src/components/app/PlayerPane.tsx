import { FormEvent, ReactNode } from 'react';
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

export function PlayerPane({
  embeddedSurfaceRef,
  onSetFullscreen,
}: PlayerPaneProps) {
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
  } = useAppStore(
    useShallow((state) => ({
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
    }))
  );

  const playerOverlayMessage = (() => {
    if (playback?.state === 'loading') {
      return 'Loading stream...';
    }
    if (playback?.state === 'error') {
      return playback.last_error ?? 'Playback error';
    }
    if (!playback?.current_url || playback.state === 'stopped') {
      return 'Select a channel to start playback';
    }
    return null;
  })();

  const isBuffering = playback?.state.toLowerCase() === 'loading';

  const handleSaveSettings = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void saveSettings();
  };

  return (
    <aside className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Player</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative mb-3">
            <div
              ref={embeddedSurfaceRef}
              className="aspect-video w-full rounded-lg border bg-muted-foreground"
            />
            {playerOverlayMessage ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-black/55 p-3 text-center font-semibold text-white">
                {playerOverlayMessage}
              </div>
            ) : null}
          </div>

          <InfoLine label="Backend">{playback?.backend ?? '...'}</InfoLine>
          <InfoLine label="Status">{playback?.state ?? 'idle'}</InfoLine>
          <InfoLine label="Buffering">{isBuffering ? 'yes' : 'no'}</InfoLine>
          <InfoLine label="Attached">
            {playback?.attached_hwnd ?? 'none'}
          </InfoLine>
          <InfoLine label="Surface">
            {playback?.embedded_surface_hwnd ?? 'none'}
          </InfoLine>
          <InfoLine label="Mode">
            {playback?.render_mode ?? 'embedded_surface'}
          </InfoLine>
          <InfoLine label="Current URL">
            {playback?.current_url ?? 'none'}
          </InfoLine>
          <InfoLine label="Error">{playback?.last_error ?? 'none'}</InfoLine>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <Button type="button" onClick={() => void pausePlayback(true)}>
              Pause
            </Button>
            <Button type="button" onClick={() => void pausePlayback(false)}>
              Resume
            </Button>
            <Button type="button" onClick={() => void stopPlayback()}>
              Stop
            </Button>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <Button
              type="button"
              onClick={() => void seekPlayback(-10)}
              disabled={!Boolean(playback?.current_url)}
            >
              -10s
            </Button>
            <Button
              type="button"
              onClick={() => void seekPlayback(10)}
              disabled={!Boolean(playback?.current_url)}
            >
              +10s
            </Button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button
              type="button"
              onClick={() => onSetFullscreen(!Boolean(playback?.fullscreen))}
            >
              {playback?.fullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            </Button>
            <Field>
              <FieldLabel>Volume</FieldLabel>
              <Slider
                min={0}
                max={100}
                defaultValue={[Math.round(playback?.volume ?? 100)]}
                onValueChange={(value) => void setVolume(value[0])}
                step={1}
              />
            </Field>
          </div>
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
