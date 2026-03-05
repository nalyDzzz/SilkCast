type VirtualRangeArgs = {
  itemCount: number;
  columns: number;
  rowHeight: number;
  scrollTop: number;
  viewportHeight: number;
  overscanRows?: number;
};

type VirtualRange = {
  startIndex: number;
  endIndex: number;
  topSpacerHeight: number;
  bottomSpacerHeight: number;
  totalHeight: number;
};

const GRID_GAP_PX = 16;

export function resolveMovieGridColumns(width: number): number {
  if (width >= 1536) {
    return 6;
  }
  if (width >= 1280) {
    return 5;
  }
  if (width >= 1024) {
    return 4;
  }
  if (width >= 640) {
    return 3;
  }
  return 2;
}

export function estimateMovieCardRowHeight(width: number, columns: number): number {
  const safeColumns = Math.max(columns, 1);
  const cardWidth = Math.max(
    0,
    (Math.max(width, 0) - GRID_GAP_PX * (safeColumns - 1)) / safeColumns
  );
  const posterHeight = cardWidth * 1.5;
  const metadataHeight = 44;
  return posterHeight + metadataHeight + GRID_GAP_PX;
}

export function getVirtualMovieRange({
  itemCount,
  columns,
  rowHeight,
  scrollTop,
  viewportHeight,
  overscanRows = 2,
}: VirtualRangeArgs): VirtualRange {
  if (itemCount === 0 || columns <= 0 || rowHeight <= 0 || viewportHeight <= 0) {
    return {
      startIndex: 0,
      endIndex: 0,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
      totalHeight: 0,
    };
  }

  const safeScrollTop = Math.max(0, scrollTop);
  const totalRows = Math.ceil(itemCount / columns);
  const startRow = Math.max(0, Math.floor(safeScrollTop / rowHeight) - overscanRows);
  const endRowExclusive = Math.min(
    totalRows,
    Math.ceil((safeScrollTop + viewportHeight) / rowHeight) + overscanRows + 1
  );

  const startIndex = startRow * columns;
  const endIndex = Math.min(itemCount, endRowExclusive * columns);

  return {
    startIndex,
    endIndex,
    topSpacerHeight: startRow * rowHeight,
    bottomSpacerHeight: Math.max(0, (totalRows - endRowExclusive) * rowHeight),
    totalHeight: totalRows * rowHeight,
  };
}
