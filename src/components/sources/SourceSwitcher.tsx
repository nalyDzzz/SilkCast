import { ChevronDown, ListPlus, RefreshCw, Settings2, TriangleAlert } from 'lucide-react';
import type { SourceRecord } from '@/components/app/types';
import {
  sourceKindLabel,
  useSourceActions,
} from '@/components/sources/useSourceActions';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

function SourceAvatar({ source, className }: { source: SourceRecord; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-7 shrink-0 place-items-center rounded-full bg-linear-to-br from-primary to-[#7a1f4a] font-display-italic text-[15px] font-semibold text-primary-foreground',
        className
      )}
    >
      {source.name.trim().charAt(0).toUpperCase() || 'S'}
    </span>
  );
}

/** Top-bar pill: the active source, its guide status, and the refresh actions. */
export function SourceSwitcher() {
  const {
    selectedSource,
    otherSources,
    supportsGuide,
    guideStatus,
    isRefreshingSource,
    isRefreshingGuide,
    refreshSource,
    refreshGuide,
    switchSource,
    openSourceManager,
  } = useSourceActions();

  if (!selectedSource) {
    return null;
  }

  const busy = isRefreshingSource || isRefreshingGuide;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex h-10 max-w-56 items-center gap-2 rounded-full border border-border bg-foreground/[0.04] py-1 pr-3 pl-1.5 text-sm font-semibold transition-colors hover:bg-foreground/[0.08] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-[state=open]:bg-foreground/[0.08]"
        aria-label={`Source: ${selectedSource.name}`}
      >
        <SourceAvatar source={selectedSource} />
        <span className="truncate">{selectedSource.name}</span>
        {busy ? (
          <RefreshCw className="size-3.5 shrink-0 animate-spin text-thread" aria-label="Refreshing" />
        ) : null}
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-1.5">
        <div className="flex items-center gap-3 px-2 py-2">
          <SourceAvatar source={selectedSource} className="size-9 text-lg" />
          <div className="min-w-0">
            <p className="truncate font-semibold">{selectedSource.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {sourceKindLabel(selectedSource)}
              {guideStatus ? ` · ${guideStatus}` : ''}
            </p>
          </div>
        </div>
        <DropdownMenuGroup>
          <DropdownMenuItem
            disabled={isRefreshingSource}
            onSelect={() => void refreshSource()}
          >
            <RefreshCw className={cn(isRefreshingSource && 'animate-spin')} />
            {isRefreshingSource ? 'Refreshing source…' : 'Refresh source'}
          </DropdownMenuItem>
          {supportsGuide ? (
            <DropdownMenuItem
              disabled={isRefreshingGuide}
              onSelect={() => void refreshGuide()}
            >
              <RefreshCw className={cn(isRefreshingGuide && 'animate-spin')} />
              {isRefreshingGuide ? 'Updating guide…' : 'Refresh guide'}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuGroup>
        {otherSources.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
              Switch to
            </DropdownMenuLabel>
            <DropdownMenuGroup>
              {otherSources.map((source) => (
                <DropdownMenuItem key={source.id} onSelect={() => switchSource(source.id)}>
                  <SourceAvatar source={source} className="size-6 text-[13px] opacity-80" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{source.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {sourceKindLabel(source)}
                    </span>
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={openSourceManager}>
          <Settings2 />
          Manage sources…
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={openSourceManager}>
          <ListPlus />
          Add source…
        </DropdownMenuItem>
        {!supportsGuide ? (
          <p className="flex gap-2 px-2 pt-1.5 pb-1 text-xs text-muted-foreground">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            Guide data is available for Xtream sources.
          </p>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
