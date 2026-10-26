import {
  ExternalLink,
  ListVideo,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import type { EngineInstance } from '@/lib/player/engines/types';
import { PlayerIconButton } from '@/components/player/PlayerIconButton';
import { PlayerSettingsMenu } from '@/components/player/PlayerSettingsMenu';
import { PlayerTimeline } from '@/components/player/PlayerTimeline';
import { PlayerVolumeControl } from '@/components/player/PlayerVolumeControl';

type PlayerControlBarProps = {
  video: HTMLVideoElement | null;
  isLive: boolean;
  paused: boolean;
  volume: number;
  muted: boolean;
  playbackRate: number;
  itemNoun: string;
  canGoPrevious: boolean;
  canGoNext: boolean;
  queueLabel: string | null;
  engine: EngineInstance | null;
  tracksVersion: number;
  engineLabel: string | null;
  isFullscreen: boolean;
  pipSupported: boolean;
  mpvAvailable: boolean;
  openingMpv: boolean;
  onTogglePlay: () => void;
  onSeekBy: (deltaSeconds: number) => void;
  onSeekTo: (seconds: number) => void;
  onPrevious: () => void;
  onNext: () => void;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
  onPlaybackRateChange: (rate: number) => void;
  onToggleQueue: () => void;
  onTogglePip: () => void;
  onOpenInMpv: () => void;
  onToggleFullscreen: () => void;
  onMenuOpenChange: (open: boolean) => void;
};

export function PlayerControlBar({
  video,
  isLive,
  paused,
  volume,
  muted,
  playbackRate,
  itemNoun,
  canGoPrevious,
  canGoNext,
  queueLabel,
  engine,
  tracksVersion,
  engineLabel,
  isFullscreen,
  pipSupported,
  mpvAvailable,
  openingMpv,
  onTogglePlay,
  onSeekBy,
  onSeekTo,
  onPrevious,
  onNext,
  onVolumeChange,
  onToggleMute,
  onPlaybackRateChange,
  onToggleQueue,
  onTogglePip,
  onOpenInMpv,
  onToggleFullscreen,
  onMenuOpenChange,
}: PlayerControlBarProps) {
  return (
    <div className="space-y-2 px-4 pt-10 pb-4 sm:px-6">
      {!isLive ? <PlayerTimeline video={video} onSeek={onSeekTo} /> : null}

      <div className="flex items-center gap-1">
        {canGoPrevious ? (
          <PlayerIconButton
            label={`Previous ${itemNoun}`}
            shortcut="PgUp"
            onClick={onPrevious}
          >
            <SkipBack />
          </PlayerIconButton>
        ) : null}

        <PlayerIconButton
          label={paused ? 'Play' : 'Pause'}
          shortcut="Space"
          onClick={onTogglePlay}
          className="[&_svg]:size-6"
        >
          {paused ? (
            <Play className="fill-current" />
          ) : (
            <Pause className="fill-current" />
          )}
        </PlayerIconButton>

        {canGoNext ? (
          <PlayerIconButton
            label={`Next ${itemNoun}`}
            shortcut="PgDn"
            onClick={onNext}
          >
            <SkipForward />
          </PlayerIconButton>
        ) : null}

        {!isLive ? (
          <>
            <PlayerIconButton
              label="Back 10 seconds"
              shortcut="←"
              onClick={() => onSeekBy(-10)}
            >
              <RotateCcw />
            </PlayerIconButton>
            <PlayerIconButton
              label="Forward 10 seconds"
              shortcut="→"
              onClick={() => onSeekBy(10)}
            >
              <RotateCw />
            </PlayerIconButton>
          </>
        ) : null}

        <PlayerVolumeControl
          volume={volume}
          muted={muted}
          onVolumeChange={onVolumeChange}
          onToggleMute={onToggleMute}
        />

        <div className="ml-auto flex items-center gap-1">
          {queueLabel ? (
            <PlayerIconButton
              label={queueLabel}
              shortcut="C"
              onClick={onToggleQueue}
            >
              <ListVideo />
            </PlayerIconButton>
          ) : null}

          <PlayerSettingsMenu
            engine={engine}
            tracksVersion={tracksVersion}
            engineLabel={engineLabel}
            isLive={isLive}
            playbackRate={playbackRate}
            onPlaybackRateChange={onPlaybackRateChange}
            onOpenChange={onMenuOpenChange}
          />

          {pipSupported ? (
            <PlayerIconButton label="Picture in picture" onClick={onTogglePip}>
              <PictureInPicture2 />
            </PlayerIconButton>
          ) : null}

          {mpvAvailable ? (
            <PlayerIconButton
              label={openingMpv ? 'Opening in MPV…' : 'Open in MPV'}
              onClick={onOpenInMpv}
              disabled={openingMpv}
            >
              <ExternalLink />
            </PlayerIconButton>
          ) : null}

          <PlayerIconButton
            label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            shortcut="F"
            onClick={onToggleFullscreen}
          >
            {isFullscreen ? <Minimize /> : <Maximize />}
          </PlayerIconButton>
        </div>
      </div>
    </div>
  );
}
