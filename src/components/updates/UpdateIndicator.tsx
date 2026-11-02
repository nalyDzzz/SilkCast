import { CircleArrowUp, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { ThreadProgress } from '@/components/brand/ThreadProgress';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { installPendingUpdate } from '@/components/updates/installPendingUpdate';
import { openReleaseNotes } from '@/lib/api/updatesApi';
import { selectDownloadProgress, useAppUpdateStore } from '@/store/appUpdateStore';

function formatPercent(progress: number | null) {
  return progress === null ? '' : ` ${Math.round(progress * 100)}%`;
}

function showReleaseNotes(version: string) {
  openReleaseNotes(version).catch((error) => {
    toast.error("Couldn't open the release notes", { description: String(error) });
  });
}

/** Top-bar pill that stays visible while a newer version is waiting to install. */
export function UpdateIndicator() {
  const update = useAppUpdateStore((state) => state.update);
  const phase = useAppUpdateStore((state) => state.phase);
  const progress = useAppUpdateStore(selectDownloadProgress);

  if (!update) {
    return null;
  }

  const installing = phase === 'installing';
  const busy = phase === 'downloading' || installing;
  const pillLabel = installing
    ? 'Restarting…'
    : busy
      ? `Updating${formatPercent(progress)}`
      : 'Update available';

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger
            aria-label={pillLabel}
            className="relative flex h-10 shrink-0 items-center gap-2 overflow-hidden rounded-full border border-thread/45 bg-thread/10 px-[10px] text-sm font-semibold transition-colors hover:bg-thread/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-[state=open]:bg-thread/20 xl:px-3"
          >
            <CircleArrowUp className="size-[18px] shrink-0 text-thread" />
            {/* Narrower windows need this room for search and the source name. */}
            <span className="hidden whitespace-nowrap xl:inline">{pillLabel}</span>
            {busy ? (
              <ThreadProgress
                value={installing ? 1 : (progress ?? 0)}
                bead={false}
                className="absolute inset-x-3 bottom-1 w-auto"
              />
            ) : null}
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{pillLabel}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" sideOffset={8} className="w-80 space-y-3.5">
        <PopoverHeader>
          <PopoverTitle className="text-[15px]">
            {busy ? `Updating to ${update.version}` : `SilkCast ${update.version} is available`}
          </PopoverTitle>
          <PopoverDescription>
            {busy
              ? 'SilkCast will restart by itself when this finishes.'
              : `You have ${update.currentVersion}. Installing restarts the app.`}
          </PopoverDescription>
        </PopoverHeader>

        {busy ? (
          <div className="space-y-2 pt-1 pb-0.5">
            <ThreadProgress value={installing ? 1 : (progress ?? 0)} label="Update download" />
            <p className="text-xs text-muted-foreground">
              {installing ? 'Installing…' : `Downloading…${formatPercent(progress)}`}
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={() => void installPendingUpdate()}>
              Install and restart
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => showReleaseNotes(update.version)}
            >
              What's new
              <ExternalLink />
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
