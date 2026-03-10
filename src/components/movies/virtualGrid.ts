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
