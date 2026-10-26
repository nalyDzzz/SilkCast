import {
  AlertTriangle,
  ExternalLink,
  Loader2,
  Play,
  RotateCw,
} from 'lucide-react';
import type { StreamControllerState } from '@/lib/player/streamController';
import { describeFailure } from '@/lib/player/playbackFailure';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

type PlayerStatusOverlayProps = {
  stream: StreamControllerState;
  waiting: boolean;
  paused: boolean;
  onRetry: () => void;
  onTogglePlay: () => void;
  onOpenInMpv: (() => void) | null;
  onNextItem: (() => void) | null;
};

function Spinner({ label }: { label: string }) {
  return (
    <div
      role="status"
      className="flex flex-col items-center gap-3 rounded-2xl bg-black/50 px-6 py-5 text-sm font-medium text-white/90 backdrop-blur-sm"
    >
      <Loader2 className="size-9 animate-spin text-white" aria-hidden="true" />
      {label}
    </div>
  );
}

export function PlayerStatusOverlay({
  stream,
  waiting,
  paused,
  onRetry,
  onTogglePlay,
  onOpenInMpv,
  onNextItem,
}: PlayerStatusOverlayProps) {
  if (stream.phase === 'error' && stream.failure) {
    const description = describeFailure(stream.failure);
    // No engine was even attempted: the container can never play here.
    const canRetry = stream.engine !== null;

    return (
      <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-6">
        <div
          role="alert"
          className="w-full max-w-lg space-y-4 rounded-2xl border border-white/15 bg-neutral-950/90 p-6 text-white shadow-2xl"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-6 shrink-0 text-amber-400" />
            <div className="space-y-1.5">
              <h2 className="text-lg font-semibold">{description.title}</h2>
              <p className="text-sm text-white/70">{description.message}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {description.suggestMpv && onOpenInMpv ? (
              <Button
                type="button"
                onClick={onOpenInMpv}
                className="bg-white text-black hover:bg-white/90"
              >
                <ExternalLink />
                Open in MPV
              </Button>
            ) : null}
            {canRetry ? (
              <Button
                type="button"
                variant={
                  description.suggestMpv && onOpenInMpv
                    ? 'secondary'
                    : 'default'
                }
                onClick={onRetry}
                className={
                  description.suggestMpv && onOpenInMpv
                    ? undefined
                    : 'bg-white text-black hover:bg-white/90'
                }
              >
                <RotateCw />
                Retry
              </Button>
            ) : null}
            {onNextItem ? (
              <Button type="button" variant="secondary" onClick={onNextItem}>
                Next channel
              </Button>
            ) : null}
            {!description.suggestMpv && onOpenInMpv ? (
              <Button
                type="button"
                variant="ghost"
                onClick={onOpenInMpv}
                className="text-white hover:bg-white/10 hover:text-white"
              >
                <ExternalLink />
                Try MPV
              </Button>
            ) : null}
          </div>

          <Collapsible>
            <CollapsibleTrigger className="text-xs text-white/50 underline-offset-4 hover:underline">
              Technical details
            </CollapsibleTrigger>
            <CollapsibleContent>
              <p className="mt-2 rounded-md bg-white/5 p-2 font-mono text-xs break-all text-white/60">
                {stream.engine ? `[${stream.engine}] ` : ''}
                {stream.failure.detail}
              </p>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>
    );
  }

  if (stream.phase === 'reconnecting') {
    return (
      <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
        <Spinner
          label={`Connection dropped — reconnecting (attempt ${stream.reconnectAttempt})…`}
        />
      </div>
    );
  }

  if (stream.phase === 'loading') {
    return (
      <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
        <Spinner label="Connecting to stream…" />
      </div>
    );
  }

  if (stream.phase === 'playing' && waiting) {
    return (
      <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
        <Spinner label="Buffering…" />
      </div>
    );
  }

  if (stream.phase === 'playing' && paused) {
    return (
      <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
        <Button
          type="button"
          aria-label="Play"
          onClick={onTogglePlay}
          className="pointer-events-auto size-20 rounded-full bg-white/15 text-white backdrop-blur-md hover:bg-white/25 [&_svg]:size-9"
        >
          <Play className="translate-x-0.5 fill-current" />
        </Button>
      </div>
    );
  }

  return null;
}
