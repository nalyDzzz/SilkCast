import type { ErrorData } from 'hls.js';
import type { PlaybackFailure } from '@/lib/player/playbackFailure';
import type { EngineFactory, TrackOption } from './types';

const FORMAT_ERROR_DETAILS = new Set([
  'manifestParsingError',
  'manifestIncompatibleCodecsError',
  'bufferIncompatibleCodecsError',
  'levelEmptyError',
]);

/**
 * The stream proxy's answer when a playlist URL serves media instead (see
 * buildPlaylistUrl). The next engine can usually play it.
 */
const NOT_A_PLAYLIST_STATUS = 415;

export function mapHlsError(data: ErrorData): PlaybackFailure {
  const httpStatus = data.response?.code;
  const detail = `${data.type}: ${data.details}${data.reason ? ` (${data.reason})` : ''}`;

  if (httpStatus === NOT_A_PLAYLIST_STATUS) {
    return {
      category: 'format',
      detail: `${detail}: the server sent media, not an HLS playlist`,
    };
  }

  if (typeof httpStatus === 'number' && httpStatus >= 400) {
    return { category: 'http', detail, httpStatus };
  }

  if (FORMAT_ERROR_DETAILS.has(data.details)) {
    return { category: 'format', detail };
  }

  if (data.type === 'networkError') {
    return {
      category: data.details.toLowerCase().includes('timeout')
        ? 'timeout'
        : 'network',
      detail,
    };
  }

  if (data.type === 'mediaError') {
    return { category: 'unsupported', detail };
  }

  return { category: 'unknown', detail };
}

function describeLevel(level: {
  height?: number;
  bitrate?: number;
  name?: string;
}): string {
  if (level.height) {
    return `${level.height}p`;
  }

  if (level.bitrate) {
    return `${Math.round(level.bitrate / 1000)} kbps`;
  }

  return level.name || 'Unknown';
}

export const startHlsEngine: EngineFactory = async ({
  video,
  url,
  isLive,
  isCurrent,
  callbacks,
}) => {
  const { default: Hls } = await import('hls.js');
  if (!isCurrent()) {
    return { kind: 'hls', destroy: () => undefined };
  }

  if (!Hls.isSupported()) {
    throw {
      category: 'unsupported',
      detail: 'Media Source Extensions are unavailable for HLS playback.',
    } satisfies PlaybackFailure;
  }

  const hls = new Hls({
    enableWorker: true,
    lowLatencyMode: false,
    liveDurationInfinity: true,
    backBufferLength: isLive ? 30 : 90,
    maxBufferLength: 30,
    manifestLoadPolicy: {
      default: {
        maxTimeToFirstByteMs: 15_000,
        maxLoadTimeMs: 20_000,
        timeoutRetry: { maxNumRetry: 1, retryDelayMs: 0, maxRetryDelayMs: 0 },
        errorRetry: {
          maxNumRetry: 1,
          retryDelayMs: 1000,
          maxRetryDelayMs: 4000,
          // Retrying 4xx responses (expired account, connection limit) only
          // delays the error the user needs to see.
          shouldRetry: (_config, _retryCount, _isTimeout, response, retry) =>
            retry &&
            !(response?.code && response.code >= 400 && response.code < 500),
        },
      },
    },
  });

  let mediaErrorRecoveries = 0;

  hls.on(Hls.Events.ERROR, (_event, data) => {
    if (!data.fatal) {
      return;
    }

    if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaErrorRecoveries < 2) {
      mediaErrorRecoveries += 1;
      if (mediaErrorRecoveries === 2) {
        hls.swapAudioCodec();
      }
      hls.recoverMediaError();
      return;
    }

    callbacks.onFatal(mapHlsError(data));
  });

  hls.on(Hls.Events.MANIFEST_PARSED, callbacks.onTracksChanged);
  hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, callbacks.onTracksChanged);
  hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, callbacks.onTracksChanged);
  hls.on(Hls.Events.LEVEL_SWITCHED, callbacks.onTracksChanged);

  hls.attachMedia(video);
  hls.loadSource(url);

  return {
    kind: 'hls',
    destroy: () => {
      hls.destroy();
    },
    getAudioTracks: (): TrackOption[] =>
      hls.audioTracks.map((track) => ({
        id: track.id,
        label:
          [track.name, track.lang].filter(Boolean).join(' · ') ||
          `Track ${track.id + 1}`,
      })),
    getActiveAudioTrack: () => hls.audioTrack,
    setAudioTrack: (id: number) => {
      hls.audioTrack = id;
    },
    getQualityLevels: (): TrackOption[] =>
      hls.levels.map((level, index) => ({
        id: index,
        label: describeLevel(level),
      })),
    getActiveQualityLevel: () => (hls.autoLevelEnabled ? -1 : hls.currentLevel),
    setQualityLevel: (id: number) => {
      hls.currentLevel = id;
    },
  };
};
