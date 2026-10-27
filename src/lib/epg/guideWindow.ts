import type { EpgProgramme } from '@/lib/epg/schedule';

export const GUIDE_SLOT_SECONDS = 30 * 60;

export type GuideWindow = {
  /** Unix seconds. */
  start: number;
  end: number;
  /** Half-hour marks inside the window, for the time ruler. */
  ticks: number[];
};

/**
 * The visible slice of the guide: from half an hour before the current
 * half-hour mark, spanning `spanSeconds` (3 h by default).
 */
export function guideWindow(nowSeconds: number, spanSeconds = 3 * 3600): GuideWindow {
  const start = Math.floor(nowSeconds / GUIDE_SLOT_SECONDS) * GUIDE_SLOT_SECONDS - GUIDE_SLOT_SECONDS;
  const end = start + spanSeconds;
  const ticks: number[] = [];
  for (let tick = start; tick < end; tick += GUIDE_SLOT_SECONDS) {
    ticks.push(tick);
  }
  return { start, end, ticks };
}

/** Position of a moment inside the window, 0..1 (clamped). */
export function windowOffset(seconds: number, window: GuideWindow) {
  return Math.min(Math.max((seconds - window.start) / (window.end - window.start), 0), 1);
}

export type GuideBlock = {
  programme: EpgProgramme;
  /** Fractions of the window width. */
  left: number;
  width: number;
  state: 'past' | 'now' | 'next';
  /** Started before the window; the UI marks the cut edge. */
  clippedStart: boolean;
};

export function layoutProgrammes(
  programmes: EpgProgramme[],
  window: GuideWindow,
  nowSeconds: number
): GuideBlock[] {
  return programmes
    .filter((programme) => programme.end > window.start && programme.start < window.end)
    .map((programme) => {
      const left = windowOffset(programme.start, window);
      const right = windowOffset(programme.end, window);
      const state: GuideBlock['state'] =
        programme.end <= nowSeconds ? 'past' : programme.start <= nowSeconds ? 'now' : 'next';
      return { programme, left, width: right - left, state, clippedStart: programme.start < window.start };
    })
    .filter((block) => block.width > 0);
}
