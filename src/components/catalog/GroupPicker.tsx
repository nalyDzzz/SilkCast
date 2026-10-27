import { useMemo, useState } from 'react';
import { Check, ChevronDown, LayoutGrid } from 'lucide-react';
import type { GroupRecord } from '@/components/app/types';
import { TagBadges } from '@/components/catalog/TagBadges';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cleanName } from '@/lib/catalog/cleanName';
import { cn } from '@/lib/utils';

type GroupPickerProps = {
  groups: GroupRecord[];
  selectedGroup: string;
  allGroupsValue: string;
  allLabel: string;
  onSelect: (value: string) => void;
  disabled?: boolean;
};

/**
 * Providers ship hundreds of groups; a searchable picker replaces the old
 * group column. Group names display cleaned, with country and quality tags.
 */
export function GroupPicker({
  groups,
  selectedGroup,
  allGroupsValue,
  allLabel,
  onSelect,
  disabled,
}: GroupPickerProps) {
  const [open, setOpen] = useState(false);
  const visibleGroups = useMemo(
    () => groups.filter((group) => !cleanName(group.name).isSeparator),
    [groups]
  );
  const total = useMemo(
    () => visibleGroups.reduce((sum, group) => sum + group.channel_count, 0),
    [visibleGroups]
  );
  const selected = visibleGroups.find((group) => group.name === selectedGroup) ?? null;
  const selectedName = selected ? cleanName(selected.name) : null;

  const choose = (value: string) => {
    onSelect(value);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        aria-label={`Group: ${selectedName ? selectedName.title : allLabel}`}
        className="flex h-10 max-w-72 min-w-0 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50 data-[state=open]:bg-accent"
      >
        <LayoutGrid className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{selectedName ? selectedName.title : allLabel}</span>
        {selectedName ? <TagBadges tags={selectedName.tags} max={2} /> : null}
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {(selected ? selected.channel_count : total).toLocaleString()}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <Command>
          <CommandInput placeholder={`Filter ${visibleGroups.length.toLocaleString()} groups`} />
          <CommandList className="max-h-[min(60vh,420px)]">
            <CommandEmpty>No groups match.</CommandEmpty>
            <CommandGroup>
              <CommandItem value={`__all ${allLabel}`} onSelect={() => choose(allGroupsValue)}>
                <Check className={cn('size-4', selected ? 'opacity-0' : 'text-thread')} />
                <span className="flex-1 font-medium">{allLabel}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{total.toLocaleString()}</span>
              </CommandItem>
              {visibleGroups.map((group) => {
                const { title, tags } = cleanName(group.name);
                return (
                  <CommandItem
                    key={group.name}
                    value={`${title} ${tags.join(' ')} ${group.name}`}
                    onSelect={() => choose(group.name)}
                  >
                    <Check className={cn('size-4', group.name === selectedGroup ? 'text-thread' : 'opacity-0')} />
                    <span className="truncate">{title || 'Ungrouped'}</span>
                    <TagBadges tags={tags} max={2} />
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
                      {group.channel_count.toLocaleString()}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
