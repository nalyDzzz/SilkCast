import { useEffect, useState } from 'react';
import type { ChannelRecord } from '@/components/app/types';
import { listRelatedItems } from '@/lib/api/channelsApi';
import { cleanName } from '@/lib/catalog/cleanName';

const RELATED_LIMIT = 18;

/** A row of other items from `item`'s group, divider rows left out. */
export function useRelatedItems(item: ChannelRecord) {
  const [result, setResult] = useState<{ forId: number; items: ChannelRecord[] } | null>(null);

  // Loading from the backend is a real side effect of showing the page.
  useEffect(() => {
    let cancelled = false;
    listRelatedItems(item.id, RELATED_LIMIT + 4)
      .then((items) => {
        if (!cancelled) {
          const shown = items.filter((related) => !cleanName(related.name).isSeparator).slice(0, RELATED_LIMIT);
          setResult({ forId: item.id, items: shown });
        }
      })
      .catch(() => {
        if (!cancelled) setResult({ forId: item.id, items: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [item.id]);

  const current = result?.forId === item.id ? result.items : null;
  return { items: current ?? [], loading: current === null };
}
