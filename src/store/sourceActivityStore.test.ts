import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sourceRecord } from '@/test/sourceRecord';
import {
  formatGuideProgress,
  guideRefreshDue,
  useSourceActivityStore,
} from './sourceActivityStore';

vi.mock('@/lib/api/epgApi', () => ({
  refreshSourceEpg: vi.fn(() => Promise.resolve({ source_id: 1, started: true })),
}));

const NOW = 1_800_000_000;
const HOUR = 3600;

describe('guideRefreshDue', () => {
  const fresh = sourceRecord({
    id: 1,
    source_type: 'xtream',
    name: 'Provider',
    guide_refreshed_at: NOW - HOUR,
    guide_covered_until: NOW + 20 * HOUR,
  });

  it('refreshes guides that never loaded, are old, or run out soon', () => {
    expect(guideRefreshDue(fresh, NOW)).toBe(false);
    expect(guideRefreshDue({ ...fresh, guide_refreshed_at: null }, NOW)).toBe(true);
    expect(guideRefreshDue({ ...fresh, guide_refreshed_at: NOW - 13 * HOUR }, NOW)).toBe(true);
    expect(guideRefreshDue({ ...fresh, guide_covered_until: NOW + 2 * HOUR }, NOW)).toBe(true);
  });

  it('skips sources without a guide and waits an hour after a failure', () => {
    expect(guideRefreshDue({ ...fresh, supports_guide: false, guide_refreshed_at: null }, NOW)).toBe(
      false
    );
    const failed = { ...fresh, guide_refreshed_at: null, guide_error: 'boom' };
    expect(guideRefreshDue({ ...failed, guide_attempted_at: NOW - 600 }, NOW)).toBe(false);
    expect(guideRefreshDue({ ...failed, guide_attempted_at: NOW - 2 * HOUR }, NOW)).toBe(true);
  });
});

describe('formatGuideProgress', () => {
  const progress = {
    source_id: 1,
    phase: 'downloading' as const,
    bytes: 5 * 1_048_576,
    total_bytes: null,
    programmes: 0,
    channels_done: 0,
    channels_total: 0,
  };

  it('describes each phase', () => {
    expect(formatGuideProgress(null)).toBe('Updating guide…');
    expect(formatGuideProgress(progress)).toBe('Updating guide… 5.0 MB');
    expect(formatGuideProgress({ ...progress, total_bytes: 20 * 1_048_576 })).toBe(
      'Updating guide… 25%'
    );
    expect(
      formatGuideProgress({ ...progress, phase: 'fetching', channels_done: 1240, channels_total: 15152 })
    ).toBe(`Updating guide… ${(1240).toLocaleString()} / ${(15152).toLocaleString()} channels`);
    expect(formatGuideProgress({ ...progress, phase: 'saving' })).toBe('Saving guide…');
  });
});

describe('useSourceActivityStore', () => {
  beforeEach(() => {
    useSourceActivityStore.setState({
      refreshingGuideSourceId: null,
      guideProgress: null,
      guideUpdatedAt: {},
      guideErrors: {},
    });
  });

  it('adopts the backend guide status and keeps identities when unchanged', () => {
    const sources = [
      sourceRecord({ id: 1, source_type: 'xtream', name: 'A', guide_refreshed_at: 100 }),
      sourceRecord({ id: 2, source_type: 'm3u', name: 'B', guide_error: 'No guide URL' }),
    ];
    useSourceActivityStore.getState().syncGuideStatus(sources);
    const first = useSourceActivityStore.getState();
    expect(first.guideUpdatedAt).toEqual({ 1: 100_000 });
    expect(first.guideErrors).toEqual({ 2: 'No guide URL' });

    useSourceActivityStore.getState().syncGuideStatus(sources);
    expect(useSourceActivityStore.getState().guideUpdatedAt).toBe(first.guideUpdatedAt);
  });

  it('tracks a refresh from progress to result', async () => {
    await useSourceActivityStore.getState().startGuideRefresh(1);
    useSourceActivityStore.getState().markGuideProgress({
      source_id: 1,
      phase: 'saving',
      bytes: 0,
      total_bytes: null,
      programmes: 10,
      channels_done: 0,
      channels_total: 0,
    });
    expect(useSourceActivityStore.getState().guideProgress?.phase).toBe('saving');

    useSourceActivityStore.getState().markGuideUpdated(1, 'Provider timed out');
    let state = useSourceActivityStore.getState();
    expect(state.refreshingGuideSourceId).toBeNull();
    expect(state.guideProgress).toBeNull();
    expect(state.guideErrors[1]).toBe('Provider timed out');
    expect(state.guideUpdatedAt[1]).toBeUndefined();

    useSourceActivityStore.getState().markGuideUpdated(1);
    state = useSourceActivityStore.getState();
    expect(state.guideErrors[1]).toBeUndefined();
    expect(state.guideUpdatedAt[1]).toBeGreaterThan(0);
  });
});
