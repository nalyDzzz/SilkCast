import { cn } from '@/lib/utils';

/** Small outlined tags for country and quality ("UK", "FHD", "60 fps"). */
export function TagBadges({
  tags,
  className,
  max = 3,
}: {
  tags: string[];
  className?: string;
  max?: number;
}) {
  if (tags.length === 0) {
    return null;
  }

  return (
    <span className={cn('flex shrink-0 items-center gap-1', className)}>
      {tags.slice(0, max).map((tag) => (
        <span
          key={tag}
          className="rounded-[4px] border border-foreground/15 px-1 py-px text-[10px] leading-none font-semibold tracking-wide whitespace-nowrap text-muted-foreground"
        >
          {tag}
        </span>
      ))}
    </span>
  );
}
