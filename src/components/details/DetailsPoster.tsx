import { useState } from 'react';
import { Film, TvMinimal } from 'lucide-react';
import { cn } from '@/lib/utils';

/** The tall poster beside a details header, or a branded stand-in. */
export function DetailsPoster({
  src,
  kind,
  className,
}: {
  src: string | null;
  kind: 'movie' | 'series';
  className?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const Icon = kind === 'series' ? TvMinimal : Film;

  return src && src !== failedSrc ? (
    <img
      src={src}
      alt=""
      onError={() => setFailedSrc(src)}
      className={cn('aspect-2/3 shrink-0 rounded-xl object-cover shadow-[0_30px_60px_-24px_#000] ring-1 ring-white/10', className)}
    />
  ) : (
    <div
      className={cn(
        'grid aspect-2/3 shrink-0 place-items-center rounded-xl bg-linear-to-br from-primary/45 via-secondary to-background ring-1 ring-white/10',
        className
      )}
    >
      <Icon className="size-8 text-foreground/45" />
    </div>
  );
}

/** Small uppercase label above a details title. */
export function DetailsEyebrow({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 text-xs font-semibold tracking-[0.14em] text-sheen uppercase">{children}</p>;
}
