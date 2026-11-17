import type { MediaDetails } from '@/components/app/types';

/** Provider details with nothing filled in, plus whatever a test needs. */
export function mediaDetails(details: Partial<MediaDetails> = {}): MediaDetails {
  return {
    plot: null,
    genres: [],
    directors: [],
    cast: [],
    release_date: null,
    year: null,
    runtime_minutes: null,
    rating: null,
    age_rating: null,
    country: null,
    poster_url: null,
    backdrop_urls: [],
    trailer_url: null,
    ...details,
  };
}
