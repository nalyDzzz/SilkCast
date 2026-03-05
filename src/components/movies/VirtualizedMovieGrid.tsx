import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  estimateMovieCardRowHeight,
  getVirtualMovieRange,
  resolveMovieGridColumns,
} from "./virtualGrid";

type VirtualizedMovieGridProps<TItem> = {
  items: TItem[];
  getItemKey: (item: TItem) => number | string;
  renderItem: (item: TItem) => ReactNode;
  className?: string;
};

export function VirtualizedMovieGrid<TItem>({
  items,
  getItemKey,
  renderItem,
  className = "",
}: VirtualizedMovieGridProps<TItem>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    const updateMeasurements = () => {
      setViewportHeight(element.clientHeight);
      setContainerWidth(element.clientWidth);
    };

    const onScroll = () => {
      setScrollTop(element.scrollTop);
    };

    updateMeasurements();
    element.addEventListener("scroll", onScroll, { passive: true });

    const resizeObserver = new ResizeObserver(updateMeasurements);
    resizeObserver.observe(element);

    return () => {
      element.removeEventListener("scroll", onScroll);
      resizeObserver.disconnect();
    };
  }, []);

  const columns = useMemo(
    () => resolveMovieGridColumns(containerWidth),
    [containerWidth]
  );
  const rowHeight = useMemo(
    () => estimateMovieCardRowHeight(containerWidth, columns),
    [columns, containerWidth]
  );

  const range = useMemo(
    () =>
      getVirtualMovieRange({
        itemCount: items.length,
        columns,
        rowHeight,
        scrollTop,
        viewportHeight,
      }),
    [columns, items.length, rowHeight, scrollTop, viewportHeight]
  );

  const visibleItems = useMemo(
    () => items.slice(range.startIndex, range.endIndex),
    [items, range.endIndex, range.startIndex]
  );

  return (
    <div ref={containerRef} className={`h-full min-h-0 overflow-y-auto pr-1 ${className}`}>
      <div style={{ height: range.topSpacerHeight }} aria-hidden="true" />
      <section
        className="grid gap-4"
        style={{
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        }}
      >
        {visibleItems.map((item) => (
          <div key={getItemKey(item)}>{renderItem(item)}</div>
        ))}
      </section>
      <div style={{ height: range.bottomSpacerHeight }} aria-hidden="true" />
    </div>
  );
}
