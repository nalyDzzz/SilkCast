import type { ChannelRecord, MediaDetails } from '@/components/app/types';
import { cleanName } from '@/lib/catalog/cleanName';

/** `108` → `1h 48m`, `45` → `45 min`, `120` → `2h`. */
export function formatRuntime(minutes: number | null | undefined): string | null {
  if (!minutes || minutes <= 0) {
    return null;
  }
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

export function formatRating(rating: number | null | undefined): string | null {
  return rating && rating > 0 ? rating.toFixed(1) : null;
}

/** Up to `max` names, then "and N more". */
export function formatNames(names: string[], max: number): string | null {
  if (names.length === 0) return null;
  if (names.length <= max) return names.join(', ');
  return `${names.slice(0, max).join(', ')} and ${names.length - max} more`;
}

export type DetailFacts = {
  title: string;
  year: number | null;
  genres: string | null;
  runtime: string | null;
  rating: string | null;
  ageRating: string | null;
  /** Country and quality tags from the provider's name ("UK", "4K"). */
  tags: string[];
};

/**
 * What the details header shows: the clean catalog title, with year and the
 * rest from the provider's details when it has them.
 */
export function detailFacts(item: ChannelRecord, details: MediaDetails | null): DetailFacts {
  const { title, year, tags } = cleanName(item.name);
  return {
    title,
    year: details?.year ?? year ?? null,
    genres: details && details.genres.length > 0 ? details.genres.slice(0, 3).join(' / ') : null,
    runtime: formatRuntime(details?.runtime_minutes),
    rating: formatRating(details?.rating),
    ageRating: details?.age_rating ?? null,
    tags,
  };
}

/** Wide artwork for a header: a backdrop when the provider has one. */
export function backdropFor(details: MediaDetails | null): string | null {
  return details?.backdrop_urls[0] ?? null;
}

/**
 * The catalog poster (already shown, and cached, by the grid), else the one
 * from the details, so the header doesn't swap images once details arrive.
 */
export function posterFor(item: ChannelRecord, details: MediaDetails | null): string | null {
  return item.logo ?? details?.poster_url ?? null;
}
