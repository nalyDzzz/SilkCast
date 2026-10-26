import { describe, expect, it } from 'vitest';
import {
  estimateMovieCardRowHeight,
  resolveMovieGridColumns,
} from './virtualGrid';

describe('virtualGrid', () => {
  it('fits as many columns as the minimum poster width allows', () => {
    expect(resolveMovieGridColumns(300)).toBe(2);
    expect(resolveMovieGridColumns(500)).toBe(2);
    expect(resolveMovieGridColumns(600)).toBe(3);
    expect(resolveMovieGridColumns(720)).toBe(4);
    expect(resolveMovieGridColumns(1100)).toBe(6);
    expect(resolveMovieGridColumns(5000)).toBe(10);
  });

  it('estimates a positive row height', () => {
    const rowHeight = estimateMovieCardRowHeight(1280, 5);
    expect(rowHeight).toBeGreaterThan(100);
  });
});
