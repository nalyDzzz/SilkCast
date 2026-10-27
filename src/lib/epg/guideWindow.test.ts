import { describe, expect, it } from 'vitest';
import { guideWindow, layoutProgrammes, windowOffset } from '@/lib/epg/guideWindow';

// 18:42 on an arbitrary day, in unix seconds (UTC-aligned half hours).
const at = (h: number, m: number) => Date.UTC(2026, 9, 26, h, m) / 1000;
const NOW = at(18, 42);

const programme = (title: string, start: number, end: number) => ({ title, description: null, start, end });

describe('guideWindow', () => {
  it('starts half an hour before the current half-hour and spans three hours', () => {
    const window = guideWindow(NOW);
    expect(window.start).toBe(at(18, 0));
    expect(window.end).toBe(at(21, 0));
    expect(window.ticks).toEqual([at(18, 0), at(18, 30), at(19, 0), at(19, 30), at(20, 0), at(20, 30)]);
  });

  it('places the current time inside the window', () => {
    expect(windowOffset(NOW, guideWindow(NOW))).toBeCloseTo(42 / 180);
  });
});

describe('layoutProgrammes', () => {
  const window = guideWindow(NOW);

  it('clips programmes to the window and marks past, on-air and upcoming', () => {
    const blocks = layoutProgrammes(
      [
        programme('Build-up', at(16, 0), at(17, 30)),
        programme('Rugby', at(17, 30), at(19, 30)),
        programme('Highlights', at(19, 30), at(20, 0)),
        programme('Late show', at(20, 30), at(22, 0)),
      ],
      window,
      NOW
    );

    expect(blocks.map((block) => [block.programme.title, block.state])).toEqual([
      ['Rugby', 'now'],
      ['Highlights', 'next'],
      ['Late show', 'next'],
    ]);
    expect(blocks[0]).toMatchObject({ left: 0, clippedStart: true });
    expect(blocks[0].width).toBeCloseTo(90 / 180);
    expect(blocks[2].left + blocks[2].width).toBeCloseTo(1);
  });

  it('marks programmes that already ended as past', () => {
    const [block] = layoutProgrammes([programme('News', at(18, 0), at(18, 30))], window, NOW);
    expect(block.state).toBe('past');
  });
});
