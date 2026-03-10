import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  estimateMovieCardRowHeight,
  resolveMovieGridColumns,
} from './virtualGrid';

type VirtualizedMovieGridProps<TItem> = {
  items: TItem[];
  getItemKey: (item: TItem) => number | string;
  renderItem: (item: TItem) => ReactNode;
  className?: string;
};

function initialViewportWidth() {
  if (typeof window === 'undefined') {
    return 0;
  }
  return Math.max(window.innerWidth, 640);
}

function initialViewportHeight() {
  if (typeof window === 'undefined') {
    return 0;
  }
  return Math.max(window.innerHeight, 500);
}

export function VirtualizedMovieGrid<TItem>({
  items,
  getItemKey,
  renderItem,
  className = '',
}: VirtualizedMovieGridProps<TItem>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(() =>
    initialViewportWidth()
  );

  const columns = useMemo(
    () => resolveMovieGridColumns(containerWidth),
    [containerWidth]
  );
  const rowHeight = useMemo(
    () => estimateMovieCardRowHeight(containerWidth, columns),
    [columns, containerWidth]
  );
  const totalRows = useMemo(
    () => Math.ceil(items.length / Math.max(columns, 1)),
    [columns, items.length]
  );

  const rowVirtualizer = useVirtualizer({
    count: totalRows,
    getScrollElement: () => containerRef.current,
    initialRect: {
      width: initialViewportWidth(),
      height: initialViewportHeight(),
    },
    estimateSize: () => rowHeight,
    overscan: 2,
    onChange: (instance) => {
      const nextWidth = instance.scrollRect?.width ?? 0;
      setContainerWidth((currentWidth) =>
        Math.abs(currentWidth - nextWidth) < 1 ? currentWidth : nextWidth
      );
    },
  });

  useEffect(() => {
    rowVirtualizer.measure();
  }, [columns, rowHeight, rowVirtualizer]);

  const virtualRows = rowVirtualizer.getVirtualItems();

  return (
    <div
      ref={containerRef}
      className={`h-full min-h-0 overflow-y-auto pr-1 ${className}`}
    >
      <div
        style={{
          height: rowVirtualizer.getTotalSize(),
          position: 'relative',
        }}
      >
        {virtualRows.map((virtualRow) => {
          const rowStartIndex = virtualRow.index * columns;
          const rowItems = items.slice(rowStartIndex, rowStartIndex + columns);

          return (
            <div
              key={virtualRow.key}
              ref={rowVirtualizer.measureElement}
              data-index={virtualRow.index}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <section
                className="grid gap-4 pb-4"
                style={{
                  gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                }}
              >
                {rowItems.map((item) => (
                  <div key={getItemKey(item)}>{renderItem(item)}</div>
                ))}
              </section>
            </div>
          );
        })}
      </div>
    </div>
  );
}
