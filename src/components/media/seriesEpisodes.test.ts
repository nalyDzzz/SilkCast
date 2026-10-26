import { describe, expect, it } from 'vitest';
import type {
  ChannelRecord,
  SeriesEpisodeRecord,
} from '@/components/app/types';
import {
  cleanEpisodeTitle,
  groupEpisodesBySeason,
  toEpisodeRecord,
} from '@/components/media/seriesEpisodes';

const series: ChannelRecord = {
  id: 5,
  source_id: 1,
  name: 'Breaking Bad',
  group_name: 'Drama',
  logo: 'https://img/bb.jpg',
  tvg_id: null,
  tvg_name: null,
  stream_url: 'http://host/series/u/p/5.mp4',
  media_kind: 'series',
  is_favorite: false,
};

function episode(
  season: number,
  number: number,
  title: string
): SeriesEpisodeRecord {
  return {
    episode_id: `${season}-${number}`,
    season_number: season,
    episode_number: number,
    title,
    stream_url: `http://host/series/u/p/${season}${number}.mkv`,
  };
}

describe('cleanEpisodeTitle', () => {
  it.each([
    ['Breaking Bad - S01E02 - Cat in the Bag', 'Cat in the Bag'],
    ['S01E02 - Cat in the Bag', 'Cat in the Bag'],
    ['Cat in the Bag', 'Cat in the Bag'],
    ['Breaking Bad - S01E02', ''],
  ])('%s -> %s', (raw, expected) => {
    expect(cleanEpisodeTitle('Breaking Bad', raw)).toBe(expected);
  });
});

describe('toEpisodeRecord', () => {
  it('keeps the series identity but uses the episode stream and title', () => {
    const record = toEpisodeRecord(
      series,
      episode(1, 2, 'Breaking Bad - S01E02 - Cat in the Bag')
    );

    expect(record).toMatchObject({
      id: 5,
      name: 'S01E02 · Cat in the Bag',
      group_name: 'Breaking Bad',
      stream_url: 'http://host/series/u/p/12.mkv',
      media_kind: 'series',
    });
  });
});

describe('groupEpisodesBySeason', () => {
  it('groups and sorts by season and episode number', () => {
    const grouped = groupEpisodesBySeason([
      episode(2, 1, 'b'),
      episode(1, 2, 'a2'),
      episode(1, 1, 'a1'),
    ]);

    expect(grouped.map((group) => group.season)).toEqual([1, 2]);
    expect(grouped[0].episodes.map((item) => item.title)).toEqual(['a1', 'a2']);
  });
});
