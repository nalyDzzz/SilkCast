import { cn } from '@/lib/utils';

type ThreadProgressProps = {
  /** 0..1 */
  value: number;
  /** Show the glowing bead at the playhead. Leave off in dense lists. */
  bead?: boolean;
  /** Live content: the bead breathes (respects reduced motion). */
  live?: boolean;
  label?: string;
  className?: string;
};

/**
 * SilkCast's progress indicator everywhere: a hairline thread with a bead at
 * the playhead. Used for resume points, live programmes and the player.
 */
export function ThreadProgress({ value, bead = true, live = false, label, className }: ThreadProgressProps) {
  const percent = `${Math.round(Math.min(Math.max(value, 0), 1) * 1000) / 10}%`;

  return (
    <span
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(Math.min(Math.max(value, 0), 1) * 100)}
      className={cn('relative block h-[2px] w-full rounded-full bg-foreground/15', className)}
    >
      <span
        className="absolute inset-y-0 left-0 rounded-full bg-linear-to-r from-thread/50 to-thread"
        style={{ width: percent }}
      />
      {bead ? (
        <span
          className={cn(
            'absolute top-1/2 size-[9px] -translate-1/2 rounded-full bg-[#fff6ea] shadow-[0_0_0_3px_color-mix(in_oklab,var(--thread)_28%,transparent),0_0_10px_var(--thread)]',
            live && 'motion-safe:animate-[thread-breathe_2.4s_ease-in-out_infinite]'
          )}
          style={{ left: percent }}
        />
      ) : null}
    </span>
  );
}
