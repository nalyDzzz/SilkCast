const GRID_GAP_PX = 20;

/** Posters stay at least this wide; the grid adds columns as space allows. */
const MIN_CARD_WIDTH_PX = 160;

export function resolveMovieGridColumns(width: number): number {
  const columns = Math.floor(
    (width + GRID_GAP_PX) / (MIN_CARD_WIDTH_PX + GRID_GAP_PX)
  );
  return Math.min(Math.max(columns, 2), 10);
}

export function estimateMovieCardRowHeight(
  width: number,
  columns: number
): number {
  const safeColumns = Math.max(columns, 1);
  const cardWidth = Math.max(
    0,
    (Math.max(width, 0) - GRID_GAP_PX * (safeColumns - 1)) / safeColumns
  );
  const posterHeight = cardWidth * 1.5;
  const metadataHeight = 52;
  return posterHeight + metadataHeight + GRID_GAP_PX;
}
