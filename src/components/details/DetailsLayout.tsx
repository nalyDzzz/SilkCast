import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { DetailsBackdrop } from '@/components/details/DetailsBackdrop';
import { DetailsPoster } from '@/components/details/DetailsPoster';
import { Button } from '@/components/ui/button';

/**
 * The shared frame of the movie and series pages: backdrop, back button,
 * poster beside the header, and the page's own content underneath.
 */
export function DetailsLayout({
  kind,
  poster,
  backdrop,
  backLabel,
  onBack,
  header,
  children,
}: {
  kind: 'movie' | 'series';
  poster: string | null;
  backdrop: string | null;
  backLabel: string;
  onBack: () => void;
  /** Eyebrow, title, facts, plot and actions, beside the poster. */
  header: ReactNode;
  children?: ReactNode;
}) {
  return (
    <main className="relative isolate h-full overflow-y-auto">
      <DetailsBackdrop className="h-[640px]" backdrop={backdrop} poster={poster} />
      <div className="px-6 pt-5 pb-12 lg:px-14">
        <Button type="button" variant="ghost" size="sm" className="-ml-2 text-muted-foreground" onClick={onBack}>
          <ArrowLeft />
          {backLabel}
        </Button>
        <div className="mt-6 flex items-start gap-10">
          <DetailsPoster src={poster} kind={kind} className="hidden w-[212px] md:block" />
          <div className="max-w-2xl min-w-0 flex-1 pt-1">{header}</div>
        </div>
        {children}
      </div>
    </main>
  );
}

/** The display title of a details page. */
export function DetailsTitle({ children }: { children: ReactNode }) {
  return (
    <h1 className="pb-1 font-display-italic text-[clamp(2.75rem,5.5vw,4.75rem)] leading-[0.95] font-medium text-balance">
      {children}
    </h1>
  );
}
