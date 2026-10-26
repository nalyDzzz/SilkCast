import { describe, expect, it } from 'vitest';
import {
  buildPlaybackUrl,
  containerLabel,
  detectStreamFormat,
  planStream,
} from '@/lib/player/streamSource';

describe('detectStreamFormat', () => {
  it.each([
    ['http://host/live/user/pass/101.m3u8', 'hls'],
    ['http://host/live/play?format=m3u8&token=abc', 'hls'],
    ['http://host/get.php?username=a&output=hls', 'hls'],
    ['http://host/live/user/pass/101.ts', 'mpegts'],
    ['http://host/stream?output=ts', 'mpegts'],
    ['http://host/movie/user/pass/202.mkv', 'progressive'],
    ['http://host/movie/user/pass/202.MP4?token=1', 'progressive'],
    ['http://host/movie/user/pass/202.avi', 'unsupported-container'],
    ['http://host:8080/user/pass/12345', 'unknown'],
    ['not a url', 'unknown'],
  ])('%s -> %s', (url, expected) => {
    expect(detectStreamFormat(url)).toBe(expected);
  });
});

describe('planStream', () => {
  it('tries MPEG-TS first for extensionless live streams', () => {
    expect(planStream('http://host:8080/user/pass/12345', 'live')).toEqual({
      format: 'unknown',
      isLive: true,
      engines: ['mpegts', 'hls', 'native'],
    });
  });

  it('tries the native element first for extensionless on-demand streams', () => {
    expect(planStream('http://host/vod/12345', 'movie').engines).toEqual([
      'native',
      'mpegts',
      'hls',
    ]);
  });

  it('uses hls.js only for HLS playlists', () => {
    expect(planStream('http://host/a.m3u8', 'live').engines).toEqual(['hls']);
  });

  it('has no engines for containers the webview cannot demux', () => {
    expect(planStream('http://host/a.avi', 'movie').engines).toEqual([]);
  });
});

describe('buildPlaybackUrl', () => {
  it('returns the original url when no proxy is available', () => {
    expect(buildPlaybackUrl(null, 'http://host/a.ts')).toBe('http://host/a.ts');
  });

  it('percent-encodes the upstream url into the proxy query', () => {
    expect(
      buildPlaybackUrl(
        'http://127.0.0.1:5000/token/',
        'http://host/a.m3u8?x=1&y=2'
      )
    ).toBe(
      'http://127.0.0.1:5000/token/stream?url=http%3A%2F%2Fhost%2Fa.m3u8%3Fx%3D1%26y%3D2'
    );
  });
});

describe('containerLabel', () => {
  it('extracts the file extension', () => {
    expect(containerLabel('http://host/movie/1.mkv?x=1')).toBe('MKV');
    expect(containerLabel('http://host/live/1')).toBeNull();
  });
});
