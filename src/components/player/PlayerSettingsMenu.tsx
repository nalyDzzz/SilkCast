import { Settings } from 'lucide-react';
import type { EngineInstance, TrackOption } from '@/lib/player/engines/types';
import { playerButtonClassName } from '@/components/player/PlayerIconButton';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

type PlayerSettingsMenuProps = {
  engine: EngineInstance | null;
  /** Changes whenever the engine's track lists change, to re-read them. */
  tracksVersion: number;
  engineLabel: string | null;
  isLive: boolean;
  playbackRate: number;
  onPlaybackRateChange: (rate: number) => void;
  onOpenChange: (open: boolean) => void;
};

function TrackSubmenu({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: TrackOption[];
  value: number;
  onChange: (id: number) => void;
}) {
  const current = options.find((option) => option.id === value);

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <span className="flex-1">{label}</span>
        <span className="text-xs text-muted-foreground">
          {current?.label ?? 'Auto'}
        </span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="max-h-80 overflow-y-auto">
        <DropdownMenuRadioGroup
          value={String(value)}
          onValueChange={(next) => onChange(Number(next))}
        >
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.id} value={String(option.id)}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

export function PlayerSettingsMenu({
  engine,
  tracksVersion,
  engineLabel,
  isLive,
  playbackRate,
  onPlaybackRateChange,
  onOpenChange,
}: PlayerSettingsMenuProps) {
  // Track lists live on the engine instance; tracksVersion signals changes.
  void tracksVersion;
  const audioTracks = engine?.getAudioTracks?.() ?? [];
  const qualityLevels = engine?.getQualityLevels?.() ?? [];

  return (
    <DropdownMenu modal={false} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Playback settings"
          className={cn(playerButtonClassName, '[&_svg]:size-5')}
        >
          <Settings />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" className="w-64">
        <DropdownMenuLabel>Playback</DropdownMenuLabel>

        {audioTracks.length > 1 && engine?.setAudioTrack ? (
          <TrackSubmenu
            label="Audio"
            options={audioTracks}
            value={engine.getActiveAudioTrack?.() ?? 0}
            onChange={(id) => engine.setAudioTrack?.(id)}
          />
        ) : null}

        {qualityLevels.length > 1 && engine?.setQualityLevel ? (
          <TrackSubmenu
            label="Quality"
            options={[{ id: -1, label: 'Auto' }, ...qualityLevels]}
            value={engine.getActiveQualityLevel?.() ?? -1}
            onChange={(id) => engine.setQualityLevel?.(id)}
          />
        ) : null}

        {!isLive ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <span className="flex-1">Speed</span>
              <span className="text-xs text-muted-foreground">
                {playbackRate === 1 ? 'Normal' : `${playbackRate}×`}
              </span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={String(playbackRate)}
                onValueChange={(next) => onPlaybackRateChange(Number(next))}
              >
                {PLAYBACK_RATES.map((rate) => (
                  <DropdownMenuRadioItem key={rate} value={String(rate)}>
                    {rate === 1 ? 'Normal' : `${rate}×`}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : null}

        <DropdownMenuSeparator />
        <p className="px-2 py-1.5 text-xs text-muted-foreground">
          {engineLabel ? `Stream engine: ${engineLabel}` : 'Starting stream…'}
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
