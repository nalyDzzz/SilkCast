import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Artwork behind a details header. A provider backdrop sits on the right and
 * fades into the page; without one, the poster is blurred into a colour wash.
 */
export function DetailsBackdrop({
  backdrop,
  poster,
  className,
}: {
  backdrop: string | null;
  poster: string | null;
  className?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const sharp = backdrop && backdrop !== failedSrc ? backdrop : null;

  return (
    <div aria-hidden="true" className={cn('pointer-events-none absolute inset-x-0 top-0 -z-10 overflow-hidden', className)}>
      {poster ? (
        <img
          src={poster}
          alt=""
          className={cn(
            'absolute inset-0 size-full scale-125 object-cover blur-3xl saturate-150 transition-opacity duration-700',
            sharp && loadedSrc === sharp ? 'opacity-15' : 'opacity-40'
          )}
        />
      ) : null}
      {sharp ? (
        <img
          key={sharp}
          src={sharp}
          alt=""
          onLoad={() => setLoadedSrc(sharp)}
          onError={() => setFailedSrc(sharp)}
          className={cn(
            'absolute inset-y-0 right-0 h-full w-[72%] object-cover object-top transition-opacity duration-700 [mask-image:linear-gradient(90deg,transparent,#000_32%)]',
            loadedSrc === sharp ? 'opacity-85' : 'opacity-0'
          )}
        />
      ) : null}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_90%_at_85%_10%,color-mix(in_oklab,var(--primary)_20%,transparent),transparent_70%)]" />
      <div className="absolute inset-0 bg-linear-to-r from-background via-background/75 to-background/5" />
      <div className="absolute inset-x-0 bottom-0 h-3/5 bg-linear-to-t from-background via-background/70 to-transparent" />
    </div>
  );
}
