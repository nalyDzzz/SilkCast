import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ChannelRecord } from '@/components/app/types';
import {
  resumeKeyFor,
  useResumeTracking,
} from '@/components/player/hooks/useResumeTracking';
import { getResumeEntry } from '@/lib/player/playerStorage';

function item(overrides: Partial<ChannelRecord>): ChannelRecord {
  return {
    id: 1,
    source_id: 4,
    name: 'Item',
    group_name: 'Group',
    logo: null,
    tvg_id: null,
    tvg_name: null,
    stream_url: 'http://host/movie/alice/secret/202.mp4',
    media_kind: 'movie',
    is_favorite: false,
    ...overrides,
  };
}

describe('resumeKeyFor', () => {
  it('survives the new channel ids a source refresh assigns', () => {
    expect(resumeKeyFor(item({ id: 1 }))).toBe(resumeKeyFor(item({ id: 999 })));
  });

  it('ignores Xtream credentials in the stream path', () => {
    expect(resumeKeyFor(item({}))).toBe(
      resumeKeyFor(
        item({ stream_url: 'http://host/movie/alice/new-password/202.mp4' })
      )
    );
    expect(resumeKeyFor(item({}))).toBe('movie:4:movie/202.mp4');
  });

  it('distinguishes episodes of the same series', () => {
    const first = item({
      media_kind: 'series',
      stream_url: 'http://host/series/u/p/5551.mkv',
    });
    const second = item({
      media_kind: 'series',
      stream_url: 'http://host/series/u/p/5552.mkv',
    });
    expect(resumeKeyFor(first)).not.toBe(resumeKeyFor(second));
  });

  it('uses the whole URL for generic playlists', () => {
    expect(resumeKeyFor(item({ stream_url: 'http://cdn/play?id=7' }))).not.toBe(
      resumeKeyFor(item({ stream_url: 'http://cdn/play?id=8' }))
    );
  });

  it('separates sources', () => {
    expect(resumeKeyFor(item({ source_id: 1 }))).not.toBe(
      resumeKeyFor(item({ source_id: 2 }))
    );
  });
});

describe('useResumeTracking', () => {
  it('saves the last real position even if the element was emptied first', () => {
    const video = document.createElement('video');
    const media = { readyState: 4, currentTime: 0, duration: 3600 };
    for (const key of Object.keys(media) as (keyof typeof media)[]) {
      Object.defineProperty(video, key, {
        configurable: true,
        get: () => media[key],
      });
    }

    const { unmount } = renderHook(() =>
      useResumeTracking(video, 'movie:1:movie/9.mp4', true)
    );

    media.currentTime = 1500;
    video.dispatchEvent(new Event('timeupdate'));
    media.currentTime = 1503;
    video.dispatchEvent(new Event('timeupdate'));

    // The stream controller tears down before this hook's cleanup runs.
    media.readyState = 0;
    media.currentTime = 0;
    unmount();

    expect(getResumeEntry('movie:1:movie/9.mp4')?.position).toBe(1503);
  });
});
