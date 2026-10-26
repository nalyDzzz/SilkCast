import { useMemo, useState } from 'react';
import type { GroupRecord } from '@/components/app/types';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type CatalogGroupListProps = {
  groups: GroupRecord[];
  selectedGroup: string;
  allGroupsValue: string;
  allLabel: string;
  onSelect: (value: string) => void;
  className?: string;
};

function GroupButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number | null;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent',
        active && 'bg-accent font-medium text-accent-foreground'
      )}
    >
      <span className="truncate">{label}</span>
      {count !== null ? (
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {count.toLocaleString()}
        </span>
      ) : null}
    </button>
  );
}

/** Category column for catalogs, the primary way to browse large providers. */
export function CatalogGroupList({
  groups,
  selectedGroup,
  allGroupsValue,
  allLabel,
  onSelect,
  className,
}: CatalogGroupListProps) {
  const [filter, setFilter] = useState('');
  const total = useMemo(
    () => groups.reduce((sum, group) => sum + group.channel_count, 0),
    [groups]
  );
  const visibleGroups = useMemo(() => {
    const normalized = filter.trim().toLowerCase();
    return normalized
      ? groups.filter((group) => group.name.toLowerCase().includes(normalized))
      : groups;
  }, [filter, groups]);

  return (
    <nav
      aria-label="Groups"
      className={cn(
        'flex min-h-0 flex-col gap-2 rounded-xl border bg-card/80 p-2 backdrop-blur',
        className
      )}
    >
      <Input
        value={filter}
        onChange={(event) => setFilter(event.currentTarget.value)}
        placeholder={`Filter ${groups.length.toLocaleString()} groups`}
        aria-label="Filter groups"
        className="h-8"
      />
      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
        {filter.trim() === '' ? (
          <GroupButton
            label={allLabel}
            count={total > 0 ? total : null}
            active={selectedGroup === allGroupsValue}
            onClick={() => onSelect(allGroupsValue)}
          />
        ) : null}
        {visibleGroups.map((group) => (
          <GroupButton
            key={group.name}
            label={group.name || 'Ungrouped'}
            count={group.channel_count}
            active={selectedGroup === group.name}
            onClick={() => onSelect(group.name)}
          />
        ))}
        {visibleGroups.length === 0 ? (
          <p className="px-2.5 py-2 text-sm text-muted-foreground">
            No groups match.
          </p>
        ) : null}
      </div>
    </nav>
  );
}
