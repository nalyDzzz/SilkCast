import { useEffect, useRef, useState } from 'react';
import { SkipForward, X } from 'lucide-react';
import type { ChannelRecord } from '@/components/app/types';
import { Button } from '@/components/ui/button';
import { displayTitle } from '@/lib/catalog/cleanName';

const COUNTDOWN_SECONDS = 10;

type PlayerUpNextProps = {
  nextItem: ChannelRecord;
  onPlayNext: () => void;
  onCancel: () => void;
};

/** Countdown card shown when an episode ends and another follows it. */
export function PlayerUpNext({
  nextItem,
  onPlayNext,
  onCancel,
}: PlayerUpNextProps) {
  const [remaining, setRemaining] = useState(COUNTDOWN_SECONDS);
  const onPlayNextRef = useRef(onPlayNext);
  onPlayNextRef.current = onPlayNext;

  useEffect(() => {
    if (remaining <= 0) {
      onPlayNextRef.current();
      return;
    }

    const timeoutId = window.setTimeout(
      () => setRemaining((value) => value - 1),
      1000
    );
    return () => window.clearTimeout(timeoutId);
  }, [remaining]);

  return (
    <div
      role="status"
      className="absolute right-6 bottom-28 z-30 w-80 space-y-3 rounded-xl border border-white/15 bg-neutral-950/90 p-4 text-white shadow-2xl backdrop-blur-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-white/60 uppercase">
            Up next in {remaining}s
          </p>
          <p className="truncate font-semibold">{displayTitle(nextItem.name)}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Cancel autoplay"
          onClick={onCancel}
          className="text-white/70 hover:bg-white/10 hover:text-white"
        >
          <X />
        </Button>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-white/15">
        <div
          className="h-full bg-sky-400 transition-[width] duration-1000 ease-linear"
          style={{
            width: `${((COUNTDOWN_SECONDS - remaining) / COUNTDOWN_SECONDS) * 100}%`,
          }}
        />
      </div>
      <Button
        type="button"
        onClick={onPlayNext}
        className="w-full bg-white text-black hover:bg-white/90"
      >
        <SkipForward />
        Play now
      </Button>
    </div>
  );
}
