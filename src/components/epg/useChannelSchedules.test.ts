import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { listChannelsEpg } from '@/lib/api/epgApi';
import { guideWindow } from '@/lib/epg/guideWindow';
import { clearScheduleCache, scheduleWindow, useChannelSchedules } from './useChannelSchedules';

vi.mock('@/lib/api/epgApi', () => ({
  listChannelsEpg: vi.fn(() => Promise.resolve([])),
  refreshChannelEpg: vi.fn(() => Promise.resolve([])),
}));

const programme = (title: string, start: number, end: number) => ({
  title,
  description: null,
  start: null,
  end: null,
  start_timestamp: start,
  end_timestamp: end,
});

describe('scheduleWindow', () => {
  it('starts with the guide timeline and reaches 12 hours ahead', () => {
    const now = 1_800_000_000 + 1234;
    const { from, to } = scheduleWindow(now);
    expect(from).toBe(guideWindow(now).start);
    expect(to - from).toBe(12 * 3600);
  });
});

describe('useChannelSchedules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearScheduleCache();
  });

  it('reads every visible row in one call and only fetches new rows on scroll', async () => {
    const now = Math.floor(Date.now() / 1000);
    vi.mocked(listChannelsEpg).mockImplementation(async (channelIds) =>
      channelIds
        .filter((id) => id !== 3)
        .map((id) => ({ channel_id: id, entries: [programme(`Show ${id}`, now - 60, now + 600)] }))
    );

    const { result, rerender } = renderHook(({ ids }) => useChannelSchedules(ids), {
      initialProps: { ids: [1, 2, 3] },
    });

    await waitFor(() => expect(result.current[1]?.[0]?.title).toBe('Show 1'));
    expect(listChannelsEpg).toHaveBeenCalledTimes(1);
    const { from, to } = scheduleWindow(Date.now() / 1000);
    expect(listChannelsEpg).toHaveBeenCalledWith([1, 2, 3], from, to);
    // A channel without stored programmes is cached as empty, not refetched.
    expect(result.current[3]).toEqual([]);

    rerender({ ids: [2, 3, 4] });
    await waitFor(() => expect(result.current[4]?.[0]?.title).toBe('Show 4'));
    expect(listChannelsEpg).toHaveBeenCalledTimes(2);
    expect(vi.mocked(listChannelsEpg).mock.calls[1][0]).toEqual([4]);
  });
});
