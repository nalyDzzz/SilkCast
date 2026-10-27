import { useId } from 'react';
import { cn } from '@/lib/utils';

/** The "Thread" S, shared by both drawings. 1024 grid; see src-tauri/icons/source. */
const THREAD_PATH =
  'M704 312 C668 244 596 212 512 212 C404 212 324 270 324 362 C324 468 430 492 512 512 C598 532 700 560 700 662 C700 756 616 812 512 812 C430 812 356 780 318 712';

/** Sizes at or below this use the simplified drawing, like the app icon. */
const SMALL_DRAWING_MAX_PX = 32;

type BrandMarkProps = {
  size?: number;
  className?: string;
};

/** The SilkCast app icon, inline so it stays crisp at any size. */
export function BrandMark({ size = 28, className }: BrandMarkProps) {
  const id = useId().replace(/:/g, '');
  const small = size <= SMALL_DRAWING_MAX_PX;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      className={cn('shrink-0', className)}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${id}-plum`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2D1733" />
          <stop offset="1" stopColor="#0E0A0F" />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx=".26" cy=".1" r=".95">
          <stop offset="0" stopColor="#D2447F" stopOpacity=".34" />
          <stop offset=".55" stopColor="#D2447F" stopOpacity="0" />
        </radialGradient>
        {small ? null : (
          <>
            <linearGradient
              id={`${id}-thread`}
              gradientUnits="userSpaceOnUse"
              x1="700"
              y1="200"
              x2="320"
              y2="820"
            >
              <stop offset="0" stopColor="#F7B0CD" />
              <stop offset=".42" stopColor="#E4558F" />
              <stop offset="1" stopColor="#B42F69" />
            </linearGradient>
            <radialGradient id={`${id}-bead`} cx=".38" cy=".32" r=".72">
              <stop offset="0" stopColor="#FFFFFF" />
              <stop offset=".55" stopColor="#FCEEDC" />
              <stop offset="1" stopColor="#E9CBA0" />
            </radialGradient>
            <radialGradient id={`${id}-beadglow`}>
              <stop offset="0" stopColor="#FF86B5" stopOpacity=".8" />
              <stop offset=".35" stopColor="#D2447F" stopOpacity=".38" />
              <stop offset="1" stopColor="#D2447F" stopOpacity="0" />
            </radialGradient>
          </>
        )}
      </defs>
      <rect width="1024" height="1024" rx={small ? 220 : 236} fill={`url(#${id}-plum)`} />
      <rect width="1024" height="1024" rx={small ? 220 : 236} fill={`url(#${id}-glow)`} />
      {small ? (
        <g transform="translate(512 512) scale(1.1) translate(-512 -512) translate(80 0) skewX(-9)">
          <path d={THREAD_PATH} fill="none" stroke="#E4558F" strokeWidth="150" strokeLinecap="round" />
          <circle cx="318" cy="712" r="96" fill="#FCEEDC" />
        </g>
      ) : (
        <g transform="translate(80 0) skewX(-9)">
          <path d={THREAD_PATH} fill="none" stroke={`url(#${id}-thread)`} strokeWidth="94" strokeLinecap="round" />
          <circle cx="318" cy="712" r="132" fill={`url(#${id}-beadglow)`} opacity=".85" />
          <circle cx="318" cy="712" r="62" fill={`url(#${id}-bead)`} />
        </g>
      )}
    </svg>
  );
}

/** Icon plus the Bodoni italic "SilkCast" lettering used in the top bar. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <BrandMark size={28} />
      <span className="font-display-italic text-[22px] leading-none font-semibold text-foreground">
        SilkCast
      </span>
    </span>
  );
}
