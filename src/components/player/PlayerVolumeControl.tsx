import { Volume1, Volume2, VolumeX } from 'lucide-react';
import { PlayerIconButton } from '@/components/player/PlayerIconButton';
import { releaseSliderFocus } from '@/components/player/sliderFocus';
import { Slider } from '@/components/ui/slider';

type PlayerVolumeControlProps = {
  volume: number;
  muted: boolean;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
};

export function PlayerVolumeControl({
  volume,
  muted,
  onVolumeChange,
  onToggleMute,
}: PlayerVolumeControlProps) {
  const effectiveVolume = muted ? 0 : volume;
  const Icon =
    effectiveVolume === 0 ? VolumeX : effectiveVolume < 0.5 ? Volume1 : Volume2;

  return (
    <div className="group/volume flex items-center">
      <PlayerIconButton
        label={muted ? 'Unmute' : 'Mute'}
        shortcut="M"
        onClick={onToggleMute}
      >
        <Icon />
      </PlayerIconButton>
      <div className="w-0 overflow-hidden opacity-0 transition-all duration-200 group-focus-within/volume:w-24 group-focus-within/volume:opacity-100 group-hover/volume:w-24 group-hover/volume:opacity-100">
        <Slider
          aria-label="Volume"
          min={0}
          max={100}
          step={1}
          value={[Math.round(effectiveVolume * 100)]}
          onValueChange={([value]) => onVolumeChange(value / 100)}
          onValueCommit={releaseSliderFocus}
          className="mx-2 w-20 cursor-pointer"
          trackClassName="bg-white/25 data-[orientation=horizontal]:h-1"
          rangeClassName="bg-white"
          thumbClassName="size-3 border-white"
        />
      </div>
    </div>
  );
}
