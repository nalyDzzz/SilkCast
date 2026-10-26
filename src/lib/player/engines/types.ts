import type { PlaybackFailure } from '@/lib/player/playbackFailure';
import type { EngineKind } from '@/lib/player/streamSource';

export type TrackOption = {
  id: number;
  label: string;
};

export type EngineCallbacks = {
  onFatal: (failure: PlaybackFailure) => void;
  /** Audio tracks or quality levels changed. */
  onTracksChanged: () => void;
};

export type EngineInstance = {
  kind: EngineKind;
  destroy: () => void;
  getAudioTracks?: () => TrackOption[];
  getActiveAudioTrack?: () => number;
  setAudioTrack?: (id: number) => void;
  /** Quality levels; the controller adds an "Auto" option (id -1). */
  getQualityLevels?: () => TrackOption[];
  getActiveQualityLevel?: () => number;
  setQualityLevel?: (id: number) => void;
};

export type EngineStartArgs = {
  video: HTMLVideoElement;
  url: string;
  isLive: boolean;
  /**
   * False once a newer load superseded this one. Engines must check it after
   * any await and before touching the shared <video> element.
   */
  isCurrent: () => boolean;
  callbacks: EngineCallbacks;
};

export type EngineFactory = (args: EngineStartArgs) => Promise<EngineInstance>;
