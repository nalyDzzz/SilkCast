import { ArrowLeft, Keyboard, Tv } from 'lucide-react';
import type { ChannelRecord } from '@/components/app/types';
import type { ChannelEpgNowNext } from '@/components/player/hooks/useChannelEpg';
import {
  PlayerIconButton,
  playerButtonClassName,
} from '@/components/player/PlayerIconButton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatClockTime } from '@/lib/player/formatTime';
import { cn } from '@/lib/utils';
import { displayTitle } from '@/lib/catalog/cleanName';

type PlayerTopBarProps = {
  channel: ChannelRecord;
  epg: ChannelEpgNowNext;
  positionLabel: string | null;
  onBack: () => void;
  onShowShortcuts: () => void;
};

export function PlayerTopBar({
  channel,
  epg,
  positionLabel,
  onBack,
  onShowShortcuts,
}: PlayerTopBarProps) {
  const isLive = channel.media_kind === 'live';

  return (
    <div className="flex items-start gap-3 p-4 sm:p-5">
      <Button
        type="button"
        variant="ghost"
        onClick={onBack}
        className={cn(playerButtonClassName, 'shrink-0')}
      >
        <ArrowLeft />
        Back
      </Button>

      <div className="flex min-w-0 flex-1 items-start gap-3">
        {channel.logo ? (
          <img
            src={channel.logo}
            alt=""
            className="hidden size-11 shrink-0 rounded-md bg-white/10 object-contain p-1 sm:block"
          />
        ) : isLive ? (
          <div className="hidden size-11 shrink-0 items-center justify-center rounded-md bg-white/10 sm:flex">
            <Tv className="size-5 text-white/70" />
          </div>
        ) : null}

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex min-w-0 items-center gap-2">
            {isLive ? (
              <Badge className="shrink-0 gap-1.5 border-transparent bg-red-600 text-white">
                <span className="size-1.5 animate-pulse rounded-full bg-white" />
                LIVE
              </Badge>
            ) : null}
            <h1 className="truncate text-base font-semibold text-white sm:text-lg">
              {displayTitle(channel.name)}
            </h1>
          </div>

          {isLive && epg.now ? (
            <div className="max-w-xl space-y-1">
              <p className="truncate text-sm text-white/85">
                <span className="text-white/55">
                  {formatClockTime(epg.now.start)}–
                  {formatClockTime(epg.now.end)}
                </span>{' '}
                {epg.now.title}
              </p>
              {epg.progress !== null ? (
                <div className="h-0.5 w-full max-w-xs overflow-hidden rounded-full bg-white/20">
                  <div
                    className="h-full bg-white/80"
                    style={{ width: `${epg.progress * 100}%` }}
                  />
                </div>
              ) : null}
              {epg.next ? (
                <p className="truncate text-xs text-white/55">
                  Next {formatClockTime(epg.next.start)} · {epg.next.title}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="truncate text-sm text-white/60">
              {[channel.group_name, positionLabel].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      </div>

      <PlayerIconButton
        label="Keyboard shortcuts"
        shortcut="?"
        onClick={onShowShortcuts}
        className="shrink-0"
      >
        <Keyboard />
      </PlayerIconButton>
    </div>
  );
}
