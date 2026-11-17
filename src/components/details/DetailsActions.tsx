import { Clapperboard, Heart, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { openTrailer } from '@/lib/api/mediaDetailsApi';
import { cn } from '@/lib/utils';

export const detailsActionButton = 'h-11 rounded-full px-5 text-[15px]';

export function TrailerButton({ url }: { url: string | null | undefined }) {
  if (!url) {
    return null;
  }
  return (
    <Button
      type="button"
      variant="ghost"
      className={detailsActionButton}
      onClick={() => void openTrailer(url).catch(() => undefined)}
    >
      <Clapperboard />
      Trailer
    </Button>
  );
}

export function FavoriteButton({
  title,
  isFavorite,
  onToggle,
}: {
  title: string;
  isFavorite: boolean;
  onToggle: () => void;
}) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="icon"
      className="size-11 rounded-full"
      aria-label={isFavorite ? `Remove ${title} from favorites` : `Add ${title} to favorites`}
      aria-pressed={isFavorite}
      onClick={onToggle}
    >
      <Heart className={cn('size-[18px]', isFavorite && 'fill-thread text-thread')} />
    </Button>
  );
}

/** Shown when the provider's details call failed; the page still works without them. */
export function DetailsError({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  if (!error) {
    return null;
  }
  return (
    <p className="mt-5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      Couldn&apos;t load details from the provider.
      <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={onRetry}>
        <RotateCw />
        Retry
      </Button>
    </p>
  );
}
