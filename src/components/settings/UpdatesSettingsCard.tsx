import { ThreadProgress } from '@/components/brand/ThreadProgress';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { installPendingUpdate } from '@/components/updates/installPendingUpdate';
import { selectDownloadProgress, useAppUpdateStore } from '@/store/appUpdateStore';

export function UpdatesSettingsCard() {
  const phase = useAppUpdateStore((state) => state.phase);
  const version = useAppUpdateStore((state) => state.update?.version ?? null);
  const upToDate = useAppUpdateStore((state) => state.upToDate);
  const checkError = useAppUpdateStore((state) => state.checkError);
  const checkForUpdate = useAppUpdateStore((state) => state.checkForUpdate);
  const progress = useAppUpdateStore(selectDownloadProgress);

  const installing = phase === 'downloading' || phase === 'installing';

  const status = () => {
    if (phase === 'installing') return 'Installing update...';
    if (phase === 'downloading') {
      return progress === null
        ? 'Downloading update...'
        : `${Math.round(progress * 100)}% downloaded`;
    }
    if (checkError) return checkError;
    if (version) return `Version ${version} is ready to install.`;
    return upToDate ? 'SilkCast is up to date.' : null;
  };
  const statusText = status();

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
            onClick={() => void checkForUpdate()}
            disabled={phase !== 'idle'}
          >
            {phase === 'checking' ? 'Checking...' : 'Check for Updates'}
          </Button>
          {version && !installing ? (
            <Button type="button" onClick={() => void installPendingUpdate()}>
              Install Update
            </Button>
          ) : null}
        </div>
        {installing ? (
          <ThreadProgress value={progress ?? 0} label="Update download" />
        ) : null}
        {statusText ? (
          <p className="text-sm text-muted-foreground">{statusText}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
