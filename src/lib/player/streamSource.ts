import type { ChannelRecord } from '@/components/app/types';

export type EngineKind = 'hls' | 'mpegts' | 'native';

export type StreamFormat =
  | 'hls'
  | 'mpegts'
  | 'progressive'
  | 'unsupported-container'
  | 'unknown';

export type StreamPlan = {
  format: StreamFormat;
  engines: EngineKind[];
  isLive: boolean;
};

const HLS_EXTENSIONS = ['.m3u8'];
const MPEGTS_EXTENSIONS = ['.ts', '.mts', '.m2ts'];
const PROGRESSIVE_EXTENSIONS = [
  '.mp4',
  '.m4v',
  '.mov',
  '.mkv',
  '.webm',
  '.ogv',
  '.ogg',
  '.mp3',
  '.aac',
  '.m4a',
];
// Containers Chromium cannot demux at all; MPV is the only way to play them.
const UNSUPPORTED_EXTENSIONS = [
  '.avi',
  '.wmv',
  '.flv',
  '.rmvb',
  '.divx',
  '.mpd',
  '.mpg',
  '.mpeg',
  '.vob',
];

const FORMAT_QUERY_KEYS = ['output', 'format', 'type', 'extension'];

function splitUrl(rawUrl: string) {
  const trimmed = rawUrl.trim();
  try {
    const parsed = new URL(trimmed);
    return {
      path: parsed.pathname.toLowerCase(),
      params: parsed.searchParams,
    };
  } catch {
    const [pathPart = '', queryPart = ''] = trimmed.split(/[?#]/);
    return {
      path: pathPart.toLowerCase(),
      params: new URLSearchParams(queryPart),
    };
  }
}

function endsWithAny(path: string, extensions: string[]) {
  return extensions.some((extension) => path.endsWith(extension));
}

function formatFromQuery(params: URLSearchParams): StreamFormat | null {
  for (const key of FORMAT_QUERY_KEYS) {
    const value = params.get(key)?.toLowerCase();
    if (!value) {
      continue;
    }

    if (value === 'm3u8' || value === 'hls') {
      return 'hls';
    }

    if (value === 'ts' || value === 'mpegts') {
      return 'mpegts';
    }
  }

  return null;
}

export function detectStreamFormat(rawUrl: string): StreamFormat {
  const { path, params } = splitUrl(rawUrl);

  if (endsWithAny(path, HLS_EXTENSIONS)) {
    return 'hls';
  }

  if (endsWithAny(path, MPEGTS_EXTENSIONS)) {
    return 'mpegts';
  }

  if (endsWithAny(path, PROGRESSIVE_EXTENSIONS)) {
    return 'progressive';
  }

  if (endsWithAny(path, UNSUPPORTED_EXTENSIONS)) {
    return 'unsupported-container';
  }

  return formatFromQuery(params) ?? 'unknown';
}

/**
 * Decide which playback engines to try, in order. Later engines are only
 * attempted when an earlier one reports that it could not parse the stream.
 */
export function planStream(
  rawUrl: string,
  mediaKind: ChannelRecord['media_kind']
): StreamPlan {
  const format = detectStreamFormat(rawUrl);
  const isLive = mediaKind === 'live';

  switch (format) {
    case 'hls':
      return { format, isLive, engines: ['hls'] };
    case 'mpegts':
      return { format, isLive, engines: ['mpegts', 'hls'] };
    case 'progressive':
      return { format, isLive, engines: ['native'] };
    case 'unsupported-container':
      return { format, isLive, engines: [] };
    case 'unknown':
      // Extensionless IPTV URLs are almost always raw MPEG-TS for live TV and
      // progressive files for on-demand content.
      return {
        format,
        isLive,
        engines: isLive
          ? ['mpegts', 'hls', 'native']
          : ['native', 'mpegts', 'hls'],
      };
  }
}

export function buildPlaybackUrl(
  proxyBaseUrl: string | null | undefined,
  streamUrl: string
) {
  if (!proxyBaseUrl) {
    return streamUrl;
  }

  return `${proxyBaseUrl.replace(/\/+$/, '')}/stream?url=${encodeURIComponent(streamUrl.trim())}`;
}

export function containerLabel(rawUrl: string) {
  const { path } = splitUrl(rawUrl);
  const match = /\.([a-z0-9]{2,5})$/.exec(path);
  return match ? match[1].toUpperCase() : null;
}
