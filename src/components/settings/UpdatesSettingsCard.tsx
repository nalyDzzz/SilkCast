import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  checkForAppUpdate,
  installAppUpdate,
  type DownloadEvent,
  type Update,
} from '@/lib/api/updatesApi';

type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'current'
  | 'installing';

export function UpdatesSettingsCard() {
  const [pendingUpdate, setPendingUpdate] = useState<Update | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle');
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [downloadTotalBytes, setDownloadTotalBytes] = useState<number | null>(
    null
  );

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
            {updateStatus === 'checking' ? 'Checking...' : 'Check for Updates'}
          </Button>
          {pendingUpdate && updateStatus !== 'installing' ? (
            <Button type="button" onClick={() => void handleInstallUpdate()}>
              Install Update
            </Button>
          ) : null}
        </div>
        {progressLabel ? (
          <p className="text-sm text-muted-foreground">{progressLabel}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
