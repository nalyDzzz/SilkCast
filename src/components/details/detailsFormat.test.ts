import { describe, expect, it } from 'vitest';
import type { ChannelRecord } from '@/components/app/types';
import { detailsErrorMessage } from '@/components/details/DetailsActions';
import {
  detailFacts,
  formatNames,
  formatRating,
  formatRuntime,
  posterFor,
} from '@/components/details/detailsFormat';
import { mediaDetails } from '@/test/mediaDetails';

const movie: ChannelRecord = {
  id: 7,
  source_id: 1,
  name: '4K-A+ - Low Tide Motel (1997)',
  group_name: 'Classics',
  logo: 'https://img.example/grid.jpg',
  stream_url: 'http://p.example/movie/u/p/202.mkv',
  media_kind: 'movie',
  is_favorite: false,
};

describe('detailsFormat', () => {
  it('formats runtimes, ratings and name lists', () => {
    expect(formatRuntime(108)).toBe('1h 48m');
    expect(formatRuntime(45)).toBe('45 min');
    expect(formatRuntime(120)).toBe('2h');
    expect(formatRuntime(null)).toBeNull();
    expect(formatRating(7)).toBe('7.0');
    expect(formatRating(0)).toBeNull();
    expect(formatNames(['A', 'B', 'C'], 2)).toBe('A, B and 1 more');
    expect(formatNames(['A'], 2)).toBe('A');
    expect(formatNames([], 2)).toBeNull();
  });

  it('builds facts from the clean title and the provider details', () => {
    expect(detailFacts(movie, null)).toEqual({
      title: 'Low Tide Motel',
      year: 1997,
      genres: null,
      runtime: null,
      rating: null,
      ageRating: null,
      tags: ['4K'],
    });

    const facts = detailFacts(
      movie,
      mediaDetails({
        year: 1998,
        genres: ['Drama', 'Crime', 'Mystery', 'Noir'],
        runtime_minutes: 108,
        rating: 7.36,
        age_rating: 'R',
      })
    );
    expect(facts).toMatchObject({
      year: 1998,
      genres: 'Drama / Crime / Mystery',
      runtime: '1h 48m',
      rating: '7.4',
      ageRating: 'R',
    });
  });

  it('explains a missing title as a stale catalog', () => {
    expect(
      detailsErrorMessage('xtream server returned an error: HTTP status client error (404 Not Found)')
    ).toMatch(/Refreshing the source/);
    expect(detailsErrorMessage('xtream request failed: timed out')).toBe(
      "Couldn't load details from the provider."
    );
  });

  it('keeps the grid poster so the header does not swap images', () => {
    const details = mediaDetails({ poster_url: 'https://img.example/details.jpg' });
    expect(posterFor(movie, details)).toBe('https://img.example/grid.jpg');
    expect(posterFor({ ...movie, logo: null }, details)).toBe('https://img.example/details.jpg');
  });
});
