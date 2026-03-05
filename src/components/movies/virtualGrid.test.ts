import { describe, expect, it } from "vitest";
import {
  estimateMovieCardRowHeight,
  getVirtualMovieRange,
  resolveMovieGridColumns,
} from "./virtualGrid";

describe("virtualGrid", () => {
  it("resolves responsive column count from width", () => {
    expect(resolveMovieGridColumns(500)).toBe(2);
    expect(resolveMovieGridColumns(700)).toBe(3);
    expect(resolveMovieGridColumns(1100)).toBe(4);
    expect(resolveMovieGridColumns(1300)).toBe(5);
    expect(resolveMovieGridColumns(1600)).toBe(6);
  });

  it("estimates a positive row height", () => {
    const rowHeight = estimateMovieCardRowHeight(1280, 5);
    expect(rowHeight).toBeGreaterThan(100);
  });

  it("returns the visible range with overscan", () => {
    const range = getVirtualMovieRange({
      itemCount: 3500,
      columns: 5,
      rowHeight: 200,
      scrollTop: 1000,
      viewportHeight: 600,
      overscanRows: 2,
    });

    expect(range.startIndex).toBe(15);
    expect(range.endIndex).toBe(55);
    expect(range.topSpacerHeight).toBe(600);
    expect(range.bottomSpacerHeight).toBe(137800);
    expect(range.totalHeight).toBe(140000);
  });
});
