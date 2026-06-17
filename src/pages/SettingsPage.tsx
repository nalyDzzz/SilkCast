import { FormEvent, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Phase1Settings } from '@/components/app/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  checkForAppUpdate,
  installAppUpdate,
  type DownloadEvent,
  type Update,
} from '@/lib/api/updatesApi';
import { type AppTheme, useAppStore } from '@/store/appStore';

type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'current'
  | 'installing';

export function SettingsPage() {
  const { settings, theme, error, setSettings, setTheme, saveSettings } =
    useAppStore(
      useShallow((state) => ({
        settings: state.settings,
        theme: state.theme,
        error: state.error,
        setSettings: state.setSettings,
        setTheme: state.setTheme,
        saveSettings: state.saveSettings,
      }))
    );
  const [draftSettings, setDraftSettings] = useState<Phase1Settings>(settings);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<Update | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle');
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [downloadTotalBytes, setDownloadTotalBytes] = useState<number | null>(
    null
  );

  const handleSaveSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaveMessage(null);
    setIsSaving(true);

    setSettings(() => draftSettings);
    await saveSettings();

    if (useAppStore.getState().error === null) {
      setSaveMessage('Settings saved.');
    }
    setIsSaving(false);
  };

  const handleCheckForUpdates = async () => {
    setPendingUpdate(null);
    setUpdateMessage(null);
    setDownloadedBytes(0);
    setDownloadTotalBytes(null);
    setUpdateStatus('checking');

    try {
      const update = await checkForAppUpdate();

      if (!update) {
        setUpdateStatus('current');
        setUpdateMessage('SilkCast is up to date.');
        return;
      }

      setPendingUpdate(update);
      setUpdateStatus('available');
      setUpdateMessage(`Version ${update.version} is ready to install.`);
    } catch (error) {
      setUpdateStatus('idle');
      setUpdateMessage(
        error instanceof Error
          ? error.message
          : 'Could not check for updates right now.'
      );
    }
  };

  const handleDownloadEvent = (event: DownloadEvent) => {
    if (event.event === 'Started') {
      setDownloadedBytes(0);
      setDownloadTotalBytes(event.data.contentLength ?? null);
      return;
    }

    if (event.event === 'Progress') {
      setDownloadedBytes((current) => current + event.data.chunkLength);
    }
  };

  const handleInstallUpdate = async () => {
    if (!pendingUpdate) {
      return;
    }

    setUpdateStatus('installing');
    setUpdateMessage('Downloading update...');

    try {
      await installAppUpdate(pendingUpdate, handleDownloadEvent);
      setUpdateMessage('Update installed. Relaunching...');
    } catch (error) {
      setUpdateStatus('available');
      setUpdateMessage(
        error instanceof Error
          ? error.message
          : 'Could not install the update right now.'
      );
    }
  };

  const progressLabel =
    updateStatus === 'installing' && downloadTotalBytes
      ? `${Math.round((downloadedBytes / downloadTotalBytes) * 100)}% downloaded`
      : updateMessage;

  return (
    <main className="p-4 md:p-6">
      <section className="mx-auto w-full max-w-3xl space-y-4">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Settings
          </h1>
          <p className="text-sm text-muted-foreground">
            Control playback behavior and choose your default player.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Playback</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(event) => void handleSaveSettings(event)}
              className="space-y-4"
            >
              <Field
                orientation="horizontal"
                className="items-center justify-between rounded-md border px-3 py-2"
              >
                <FieldLabel htmlFor="hardware-decode">
                  Hardware decode
                </FieldLabel>
                <Checkbox
                  id="hardware-decode"
                  checked={draftSettings.hardware_decode}
                  onCheckedChange={(checked) =>
                    setDraftSettings((current) => ({
                      ...current,
                      hardware_decode: checked === true,
                    }))
                  }
                />
              </Field>

              <Field>
                <FieldLabel>Startup behavior</FieldLabel>
                <Select
                  value={draftSettings.startup_behavior}
                  onValueChange={(value) =>
                    setDraftSettings((current) => ({
                      ...current,
                      startup_behavior:
                        value as Phase1Settings['startup_behavior'],
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select startup behavior" />
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
                  value={draftSettings.preferred_player}
                  onValueChange={(value) =>
                    setDraftSettings((current) => ({
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

              <Field>
                <FieldLabel>Buffering</FieldLabel>
                <Select value={draftSettings.buffering_preset} disabled>
                  <SelectTrigger>
                    <SelectValue>Normal</SelectValue>
                  </SelectTrigger>
                </Select>
              </Field>

              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? 'Saving...' : 'Save Settings'}
                </Button>
                {saveMessage ? (
                  <p className="text-sm text-emerald-700">{saveMessage}</p>
                ) : null}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Field>
              <FieldLabel>Theme</FieldLabel>
              <Select
                value={theme}
                onValueChange={(value) => setTheme(value as AppTheme)}
              >
                <SelectTrigger aria-label="Theme">
                  <SelectValue placeholder="Select theme" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <p className="text-sm text-muted-foreground">
              Theme changes apply immediately and are saved on this device.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>App updates</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => void handleCheckForUpdates()}
                disabled={
                  updateStatus === 'checking' || updateStatus === 'installing'
                }
              >
                {updateStatus === 'checking'
                  ? 'Checking...'
                  : 'Check for Updates'}
              </Button>
              {pendingUpdate && updateStatus !== 'installing' ? (
                <Button
                  type="button"
                  onClick={() => void handleInstallUpdate()}
                >
                  Install Update
                </Button>
              ) : null}
            </div>
            {progressLabel ? (
              <p className="text-sm text-muted-foreground">{progressLabel}</p>
            ) : null}
          </CardContent>
        </Card>

        {error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </section>
    </main>
  );
}
