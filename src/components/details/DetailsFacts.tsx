import { Star } from 'lucide-react';
import type { MediaDetails } from '@/components/app/types';
import { TagBadges } from '@/components/catalog/TagBadges';
import { type DetailFacts, formatNames } from '@/components/details/detailsFormat';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

function Dot() {
  return <span aria-hidden="true" className="size-[3px] shrink-0 rounded-full bg-muted-foreground/60" />;
}

/** Year · genres · runtime · ★ rating, then the age rating and quality tags. */
export function FactsRow({ facts, extra = [], className }: { facts: DetailFacts; extra?: (string | null)[]; className?: string }) {
  const parts = [facts.year?.toString() ?? null, facts.genres, facts.runtime, ...extra].filter(
    (part): part is string => Boolean(part)
  );

  return (
    <p className={cn('flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-sm text-muted-foreground', className)}>
      {parts.map((part, index) => (
        <span key={part} className="flex items-center gap-2.5">
          {index > 0 ? <Dot /> : null}
          {part}
        </span>
      ))}
      {facts.rating ? (
        <span className="flex items-center gap-2.5">
          {parts.length > 0 ? <Dot /> : null}
          <span className="flex items-center gap-1 font-medium text-foreground" aria-label={`Rated ${facts.rating} out of 10`}>
            <Star className="size-3.5 fill-sheen text-sheen" aria-hidden="true" />
            {facts.rating}
          </span>
        </span>
      ) : null}
      {facts.ageRating ? (
        <span className="rounded-[4px] border border-foreground/25 px-1.5 py-px text-[11px] leading-tight font-semibold text-foreground/80">
          {facts.ageRating}
        </span>
      ) : null}
      <TagBadges tags={facts.tags} />
    </p>
  );
}

/** The provider's synopsis, with placeholder lines while it loads. */
export function Plot({ plot, loading, className }: { plot: string | null; loading: boolean; className?: string }) {
  if (loading) {
    return (
      <div className={cn('flex max-w-xl flex-col gap-2', className)} aria-label="Loading details">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-3/5" />
      </div>
    );
  }
  if (!plot) {
    return null;
  }
  return (
    <p className={cn('line-clamp-5 max-w-xl text-[15px] leading-relaxed text-foreground/82', className)}>{plot}</p>
  );
}

/** Director, cast and country, as label/value rows. */
export function Credits({ details, className }: { details: MediaDetails | null; className?: string }) {
  if (!details) {
    return null;
  }
  const rows = [
    { label: details.directors.length > 1 ? 'Directors' : 'Director', value: formatNames(details.directors, 3) },
    { label: 'Cast', value: formatNames(details.cast, 6) },
    { label: 'Country', value: details.country },
  ].filter((row): row is { label: string; value: string } => Boolean(row.value));

  if (rows.length === 0) {
    return null;
  }
  return (
    <dl className={cn('grid max-w-xl grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]', className)}>
      {rows.map((row) => (
        <div key={row.label} className="contents">
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className="text-foreground">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
