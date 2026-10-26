import { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Play, Tv } from 'lucide-react';
import type { ChannelRecord } from '@/components/app/types';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

const ROW_HEIGHT_PX = 52;

type PlayerQueuePanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: ChannelRecord[];
  activeItem: ChannelRecord;
  title: string;
  onSelect: (item: ChannelRecord) => void;
};

function QueueList({
  items,
  activeItem,
  onSelect,
}: Pick<PlayerQueuePanelProps, 'items' | 'activeItem' | 'onSelect'>) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const activeIndex = items.findIndex((item) => item === activeItem);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: 10,
    initialOffset: Math.max(0, activeIndex * ROW_HEIGHT_PX - ROW_HEIGHT_PX * 4),
    initialRect: { width: 320, height: 600 },
  });

  if (items.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-muted-foreground">
        Nothing matches that search.
      </p>
    );
  }

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
      <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((row) => {
          const item = items[row.index];
          const isActive = item === activeItem;

          return (
            <button
              key={row.key}
              type="button"
              onClick={() => onSelect(item)}
              aria-current={isActive ? 'true' : undefined}
              className={cn(
                'absolute inset-x-0 flex items-center gap-3 rounded-lg px-2 text-left text-sm transition-colors hover:bg-accent',
                isActive && 'bg-accent'
              )}
              style={{
                top: 0,
                height: ROW_HEIGHT_PX - 4,
                transform: `translateY(${row.start}px)`,
              }}
            >
              <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                {item.logo ? (
                  <img
                    src={item.logo}
                    alt=""
                    loading="lazy"
                    className="size-full object-contain"
                  />
                ) : (
                  <Tv className="size-4 text-muted-foreground" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{item.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {item.group_name}
                </span>
              </span>
              {isActive ? (
                <Play className="size-4 shrink-0 fill-current text-sky-400" />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function PlayerQueuePanel({
  open,
  onOpenChange,
  items,
  activeItem,
  title,
  onSelect,
}: PlayerQueuePanelProps) {
  const [query, setQuery] = useState('');
  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return items;
    }
    return items.filter((item) => item.name.toLowerCase().includes(normalized));
  }, [items, query]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <SheetContent
        side="right"
        className="dark w-80 gap-2 border-white/10 bg-background/95 text-foreground backdrop-blur-md sm:max-w-sm"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <SheetHeader className="pb-0">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>
            {items.length} {items.length === 1 ? 'item' : 'items'} · switch
            without leaving the player
          </SheetDescription>
        </SheetHeader>
        <div className="px-4">
          <Input
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Filter…"
            aria-label={`Filter ${title.toLowerCase()}`}
          />
        </div>
        <QueueList
          // Remount on filter changes so the initial scroll offset recomputes.
          key={query}
          items={filteredItems}
          activeItem={activeItem}
          onSelect={onSelect}
        />
      </SheetContent>
    </Sheet>
  );
}
