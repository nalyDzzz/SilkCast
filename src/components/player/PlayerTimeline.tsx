import { useState } from 'react';
import { Slider } from '@/components/ui/slider';
import { useMediaTimeState } from '@/components/player/hooks/useMediaElementState';
import { releaseSliderFocus } from '@/components/player/sliderFocus';
import { formatPlaybackTime } from '@/lib/player/formatTime';

type PlayerTimelineProps = {
  video: HTMLVideoElement | null;
  onSeek: (seconds: number) => void;
};

/** Seek bar with buffered range and elapsed / total time for on-demand media. */
export function PlayerTimeline({ video, onSeek }: PlayerTimelineProps) {
  const { currentTime, duration, bufferedEnd } = useMediaTimeState(video);
  const [scrubValue, setScrubValue] = useState<number | null>(null);

  const hasDuration = Number.isFinite(duration) && duration > 0;
  const displayedTime = scrubValue ?? currentTime;
  const bufferedPercent = hasDuration
    ? Math.min((bufferedEnd / duration) * 100, 100)
    : 0;

  return (
    <div className="flex items-center gap-3 text-xs font-medium text-white/85 tabular-nums">
      <span className="min-w-12 text-right">
        {formatPlaybackTime(displayedTime)}
      </span>
      <Slider
        aria-label="Seek"
        min={0}
        max={hasDuration ? duration : 1}
        step={1}
        value={[hasDuration ? Math.min(displayedTime, duration) : 0]}
        disabled={!hasDuration}
        onValueChange={([value]) => setScrubValue(value)}
        onValueCommit={([value]) => {
          setScrubValue(null);
          onSeek(value);
          releaseSliderFocus();
        }}
        className="group/timeline h-4 cursor-pointer"
        trackClassName="bg-white/20 transition-[height] data-[orientation=horizontal]:h-1 group-hover/timeline:data-[orientation=horizontal]:h-1.5"
        rangeClassName="bg-sky-400"
        thumbClassName="size-3.5 border-sky-300 opacity-0 transition-opacity group-hover/timeline:opacity-100 focus-visible:opacity-100"
        trackChildren={
          <span
            aria-hidden="true"
            className="absolute inset-y-0 left-0 bg-white/30"
            style={{ width: `${bufferedPercent}%` }}
          />
        }
      />
      <span className="min-w-12">
        {hasDuration ? formatPlaybackTime(duration) : '--:--'}
      </span>
    </div>
  );
}
