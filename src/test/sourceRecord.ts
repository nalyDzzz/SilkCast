import type { SourceRecord } from '@/components/app/types';

/** A source as the backend lists it; Xtream sources support the guide by default. */
export function sourceRecord(
  source: Pick<SourceRecord, 'id' | 'source_type' | 'name'> & Partial<SourceRecord>
): SourceRecord {
  return {
    config: {},
    created_at: 0,
    supports_guide: source.source_type === 'xtream',
    guide_refreshed_at: null,
    guide_covered_until: null,
    guide_error: null,
    guide_attempted_at: null,
    ...source,
  };
}
