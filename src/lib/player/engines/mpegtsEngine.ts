import type { PlaybackFailure } from '@/lib/player/playbackFailure';
import type { EngineFactory } from './types';

type MpegtsErrorInfo = {
  code?: number;
  msg?: string;
};

export function mapMpegtsError(
  errorType: string,
  errorDetail: string,
  info: MpegtsErrorInfo | undefined
): PlaybackFailure {
  const detail = `${errorType}: ${errorDetail}${info?.msg ? ` (${info.msg})` : ''}`;

  if (errorDetail === 'HttpStatusCodeInvalid' && info?.code) {
    return { category: 'http', detail, httpStatus: info.code };
  }

  if (errorDetail === 'ConnectingTimeout') {
    return { category: 'timeout', detail };
  }

  if (errorType === 'NetworkError') {
    return { category: 'network', detail };
  }

  if (errorDetail === 'CodecUnsupported' || errorDetail === 'MediaMSEError') {
    return { category: 'unsupported', detail };
  }

  if (errorType === 'MediaError') {
    // FormatError / FormatUnsupported: the payload isn't MPEG-TS at all.
    return { category: 'format', detail };
  }

  return { category: 'unknown', detail };
}

export const startMpegtsEngine: EngineFactory = async ({
  video,
  url,
  isLive,
  isCurrent,
  callbacks,
}) => {
  const { default: mpegts } = await import('mpegts.js');
  if (!isCurrent()) {
    return { kind: 'mpegts', destroy: () => undefined };
  }

  if (!mpegts.getFeatureList().mseLivePlayback) {
    throw {
      category: 'unsupported',
      detail: 'Media Source Extensions are unavailable for MPEG-TS playback.',
    } satisfies PlaybackFailure;
  }

  mpegts.LoggingControl.applyConfig({
    enableDebug: false,
    enableVerbose: false,
    enableInfo: false,
  });

  const player = mpegts.createPlayer(
    {
      type: 'mpegts',
      isLive,
      url,
    },
    {
      enableWorker: true,
      enableStashBuffer: true,
      stashInitialSize: 384 * 1024,
      isLive,
      lazyLoad: !isLive,
      autoCleanupSourceBuffer: true,
      autoCleanupMaxBackwardDuration: 60,
      autoCleanupMinBackwardDuration: 30,
      // Favor smooth playback over low latency; IPTV feeds are bursty.
      liveBufferLatencyChasing: false,
      fixAudioTimestampGap: true,
    }
  );

  player.on(
    mpegts.Events.ERROR,
    (errorType: string, errorDetail: string, info?: MpegtsErrorInfo) => {
      callbacks.onFatal(mapMpegtsError(errorType, errorDetail, info));
    }
  );

  if (isLive) {
    // A live feed "completing" means the provider closed the connection.
    player.on(mpegts.Events.LOADING_COMPLETE, () => {
      callbacks.onFatal({
        category: 'network',
        detail: 'The provider closed the live stream connection.',
      });
    });
  }

  player.attachMediaElement(video);
  player.load();

  return {
    kind: 'mpegts',
    destroy: () => {
      try {
        player.pause();
        player.unload();
        player.detachMediaElement();
      } finally {
        player.destroy();
      }
    },
  };
};
