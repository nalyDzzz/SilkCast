import { describe, expect, it } from "vitest";
import {
  estimateMovieCardRowHeight,
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
});
