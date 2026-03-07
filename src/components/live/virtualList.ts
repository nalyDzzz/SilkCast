type VirtualListRangeArgs = {
  itemCount: number;
  itemHeight: number;
  gap: number;
  scrollTop: number;
  viewportHeight: number;
  overscanItems?: number;
};

type VirtualListRange = {
  startIndex: number;
  endIndex: number;
  topSpacerHeight: number;
  bottomSpacerHeight: number;
  totalHeight: number;
};

export function getVirtualListRange({
  itemCount,
  itemHeight,
  gap,
  scrollTop,
  viewportHeight,
  overscanItems = 6,
}: VirtualListRangeArgs): VirtualListRange {
  if (
    itemCount === 0 ||
    itemHeight <= 0 ||
    gap < 0 ||
    viewportHeight <= 0
  ) {
    return {
      startIndex: 0,
      endIndex: 0,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
      totalHeight: 0,
    };
  }

  const safeOverscanItems = Math.max(0, overscanItems);
  const totalHeight =
    itemCount * itemHeight + Math.max(0, itemCount - 1) * gap;
  const safeScrollTop = Math.min(
    Math.max(0, scrollTop),
    Math.max(0, totalHeight - viewportHeight)
  );
  const stride = itemHeight + gap;
  const startIndex = Math.max(
    0,
    Math.floor(safeScrollTop / stride) - safeOverscanItems
  );
  const endIndex = Math.min(
    itemCount,
    Math.ceil((safeScrollTop + viewportHeight) / stride) + safeOverscanItems
  );

  return {
    startIndex,
    endIndex,
    topSpacerHeight: startIndex * stride,
    bottomSpacerHeight: Math.max(0, (itemCount - endIndex) * stride),
    totalHeight,
  };
}
