import { describe, expect, it } from 'vitest';
import { getVirtualListRange } from './virtualList';

describe('virtualList', () => {
  it('returns empty values when the viewport cannot be measured', () => {
    const range = getVirtualListRange({
      itemCount: 120,
      itemHeight: 72,
      gap: 8,
      scrollTop: 400,
      viewportHeight: 0,
    });

    expect(range).toEqual({
      startIndex: 0,
      endIndex: 0,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
      totalHeight: 0,
    });
  });

  it('calculates list range with overscan and spacing', () => {
    const range = getVirtualListRange({
      itemCount: 200,
      itemHeight: 72,
      gap: 8,
      scrollTop: 960,
      viewportHeight: 480,
      overscanItems: 2,
    });

    expect(range.startIndex).toBe(10);
    expect(range.endIndex).toBe(20);
    expect(range.topSpacerHeight).toBe(800);
    expect(range.bottomSpacerHeight).toBe(14400);
    expect(range.totalHeight).toBe(15992);
  });

  it('clamps end index to the total item count', () => {
    const range = getVirtualListRange({
      itemCount: 3,
      itemHeight: 70,
      gap: 10,
      scrollTop: 0,
      viewportHeight: 500,
      overscanItems: 5,
    });

    expect(range.startIndex).toBe(0);
    expect(range.endIndex).toBe(3);
    expect(range.topSpacerHeight).toBe(0);
    expect(range.bottomSpacerHeight).toBe(0);
    expect(range.totalHeight).toBe(230);
  });

  it('clamps stale scroll positions to the new list height', () => {
    const range = getVirtualListRange({
      itemCount: 5,
      itemHeight: 72,
      gap: 8,
      scrollTop: 12000,
      viewportHeight: 200,
      overscanItems: 0,
    });

    expect(range.startIndex).toBe(2);
    expect(range.endIndex).toBe(5);
    expect(range.topSpacerHeight).toBe(160);
    expect(range.bottomSpacerHeight).toBe(0);
    expect(range.totalHeight).toBe(392);
  });
});
