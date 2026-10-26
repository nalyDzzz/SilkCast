import { GroupRecord } from '@/components/app/types';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type MediaCatalogFiltersBarProps = {
  query: string;
  onQueryChange: (value: string) => void;
  selectedGroup: string;
  onSelectedGroupChange: (value: string) => void;
  groups: GroupRecord[];
  allGroupsValue: string;
  searchPlaceholder: string;
  favoritesFieldId: string;
  favoritesOnly: boolean;
  onFavoritesOnlyChange: (value: boolean) => void;
  disabled: boolean;
};

export function MediaCatalogFiltersBar({
  query,
  onQueryChange,
  selectedGroup,
  onSelectedGroupChange,
  groups,
  allGroupsValue,
  searchPlaceholder,
  favoritesFieldId,
  favoritesOnly,
  onFavoritesOnlyChange,
  disabled,
}: MediaCatalogFiltersBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card/80 p-3 backdrop-blur">
      <Input
        value={query}
        onChange={(event) => onQueryChange(event.currentTarget.value)}
        placeholder={searchPlaceholder}
        disabled={disabled}
        aria-label={searchPlaceholder}
        className="min-w-48 flex-1"
      />
      {/* Wide windows use the group column instead. */}
      <Select value={selectedGroup} onValueChange={onSelectedGroupChange}>
        <SelectTrigger disabled={disabled} className="w-56 lg:hidden" aria-label="Group">
          <SelectValue placeholder="All groups" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={allGroupsValue}>All groups</SelectItem>
          {groups.map((group) => (
            <SelectItem key={group.name} value={group.name}>
              {group.name} ({group.channel_count})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Field
        orientation="horizontal"
        className="w-auto justify-start rounded-md border px-3 py-2"
      >
        <Checkbox
          id={favoritesFieldId}
          checked={favoritesOnly}
          onCheckedChange={(checked) => onFavoritesOnlyChange(checked === true)}
        />
        <FieldLabel htmlFor={favoritesFieldId}>Favorites only</FieldLabel>
      </Field>
    </div>
  );
}
