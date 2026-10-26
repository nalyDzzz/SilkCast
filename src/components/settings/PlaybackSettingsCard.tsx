import { FormEvent, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import type { Phase1Settings } from '@/components/app/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAppStore } from '@/store/appStore';

function MpvStatus({ available }: { available: boolean | null }) {
  if (available === null) {
    return <Badge variant="outline">Checking…</Badge>;
  }

  return available ? (
    <Badge className="bg-emerald-600 text-white">MPV detected</Badge>
  ) : (
    <Badge variant="destructive">MPV not found</Badge>
  );
}

export function PlaybackSettingsCard() {
  const { settings, mpvAvailable, setSettings, saveSettings } = useAppStore(
    useShallow((state) => ({
      settings: state.settings,
      mpvAvailable: state.playerEnvironment?.mpv_available ?? null,
      setSettings: state.setSettings,
      saveSettings: state.saveSettings,
    }))
  );
  // Only edited fields live here, so settings that finish loading after the
  // page opens still show up.
  const [edits, setEdits] = useState<Partial<Phase1Settings>>({});
  const [isSaving, setIsSaving] = useState(false);
  const draft: Phase1Settings = { ...settings, ...edits };
  const isDirty = (Object.keys(edits) as (keyof Phase1Settings)[]).some(
    (key) => edits[key] !== settings[key]
  );

  const updateDraft = (patch: Partial<Phase1Settings>) => {
    setEdits((current) => ({ ...current, ...patch }));
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setSettings(() => draft);
    await saveSettings();
    setIsSaving(false);

    const { error } = useAppStore.getState();
    if (error === null) {
      setEdits({});
      toast.success('Settings saved');
    } else {
      toast.error("Couldn't save settings", { description: error });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Playback</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(event) => void handleSave(event)}
          className="space-y-5"
        >
          <Field>
            <FieldLabel>Default Player</FieldLabel>
            <Select
              value={draft.preferred_player}
              onValueChange={(value) =>
                updateDraft({
                  preferred_player: value as Phase1Settings['preferred_player'],
                })
              }
            >
              <SelectTrigger aria-label="Default player">
                <SelectValue placeholder="Select a default player" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="web">In-app player (recommended)</SelectItem>
                <SelectItem value="mpv">MPV pop-out window</SelectItem>
              </SelectContent>
            </Select>
            <FieldDescription>
              The in-app player handles live HLS and MPEG-TS channels, MP4 and
              MKV files, channel switching, and resume. MPV opens a separate
              window and plays every format. You can always hand a stream to MPV
              from the player.
            </FieldDescription>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <MpvStatus available={mpvAvailable} />
              {mpvAvailable === false ? (
                <span className="text-muted-foreground">
                  Install with <code>winget install mpv</code>, then restart
                  SilkCast.{' '}
                  <Link
                    to="/dashboard/help"
                    className="underline underline-offset-4"
                  >
                    More help
                  </Link>
                </span>
              ) : null}
            </div>
          </Field>

          <Field>
            <FieldLabel>Startup behavior</FieldLabel>
            <Select
              value={draft.startup_behavior}
              onValueChange={(value) =>
                updateDraft({
                  startup_behavior: value as Phase1Settings['startup_behavior'],
                })
              }
            >
              <SelectTrigger aria-label="Startup behavior">
                <SelectValue placeholder="Select startup behavior" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="home">Open the catalog</SelectItem>
                <SelectItem value="resume_last">
                  Resume the last channel
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field
            orientation="horizontal"
            className="items-start rounded-md border p-3"
          >
            <Checkbox
              id="hardware-decode"
              checked={draft.hardware_decode}
              onCheckedChange={(checked) =>
                updateDraft({ hardware_decode: checked === true })
              }
            />
            <FieldContent>
              <FieldLabel htmlFor="hardware-decode">
                Hardware decode in MPV
              </FieldLabel>
              <FieldDescription>
                Uses your GPU to decode video in the MPV window. Turn off if you
                see green frames or glitches. The in-app player always uses the
                GPU when it can.
              </FieldDescription>
            </FieldContent>
          </Field>

          <Button type="submit" disabled={isSaving || !isDirty}>
            {isSaving ? 'Saving...' : 'Save Settings'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
