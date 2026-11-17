import type { ChannelRecord } from '@/components/app/types';
import { DetailsPoster } from '@/components/details/DetailsPoster';
import { useRelatedItems } from '@/components/details/useRelatedItems';
import { Skeleton } from '@/components/ui/skeleton';
import { cleanName } from '@/lib/catalog/cleanName';

function RelatedPoster({ item, onOpen }: { item: ChannelRecord; onOpen: (item: ChannelRecord) => void }) {
  const { title, year } = cleanName(item.name);
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      aria-label={`Open ${title}`}
      className="group w-36 shrink-0 text-left focus-visible:outline-none"
    >
      <DetailsPoster
        src={item.logo}
        kind={item.media_kind === 'series' ? 'series' : 'movie'}
        className="w-full shadow-none transition duration-200 group-hover:-translate-y-0.5 group-hover:ring-thread/40 group-focus-visible:ring-2 group-focus-visible:ring-ring"
      />
      <span className="mt-2 block truncate text-sm font-medium">{title}</span>
      <span className="block h-4 text-xs text-muted-foreground">{year}</span>
    </button>
  );
}

/** "More in <group>": neighbouring titles from the same group. */
export function RelatedRail({ item, onOpen }: { item: ChannelRecord; onOpen: (item: ChannelRecord) => void }) {
  const { items, loading } = useRelatedItems(item);
  const group = cleanName(item.group_name).title;

  if (!loading && items.length === 0) {
    return null;
  }

  return (
    <section className="mt-14" aria-label={`More in ${group}`}>
      <h2 className="mb-3 text-lg font-semibold tracking-tight">More in {group}</h2>
      <div className="-mx-6 flex gap-4 overflow-x-auto px-6 pt-1 pb-3 [scrollbar-width:thin] lg:-mx-14 lg:px-14">
        {loading
          ? Array.from({ length: 8 }, (_, index) => (
              <Skeleton key={index} className="aspect-2/3 w-36 shrink-0 rounded-xl" />
            ))
          : items.map((related) => <RelatedPoster key={related.id} item={related} onOpen={onOpen} />)}
      </div>
    </section>
  );
}
