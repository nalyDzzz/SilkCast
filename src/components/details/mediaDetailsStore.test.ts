import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChannelRecord } from '@/components/app/types';
import {
  SESSION_DETAILS_TTL_MS,
  loadMediaDetails,
  useMediaDetails,
  useMediaDetailsStore,
} from '@/components/details/mediaDetailsStore';
import { invalidateSourceCatalog } from '@/components/media/catalogViewStore';
import { getMediaDetails } from '@/lib/api/mediaDetailsApi';
import { mediaDetails } from '@/test/mediaDetails';

vi.mock('@/lib/api/mediaDetailsApi', () => ({
  getMediaDetails: vi.fn(),
  openTrailer: vi.fn(),
}));

const item = (id: number, media_kind: ChannelRecord['media_kind']): ChannelRecord => ({
  id,
  source_id: 1,
  name: `Item ${id}`,
  group_name: 'G',
  logo: null,
  stream_url: `http://p.example/${media_kind}/u/p/${id}.mp4`,
  media_kind,
  is_favorite: false,
});

describe('useMediaDetails', () => {
  beforeEach(() => {
    vi.mocked(getMediaDetails).mockReset();
    useMediaDetailsStore.setState({ entries: {} });
  });

  it('loads details once and shares them between components', async () => {
    vi.mocked(getMediaDetails).mockResolvedValue(mediaDetails({ plot: 'A ledger.' }));

    const first = renderHook(() => useMediaDetails(item(1, 'movie')));
    expect(first.result.current.loading).toBe(true);
    await waitFor(() => expect(first.result.current.details?.plot).toBe('A ledger.'));

    const second = renderHook(() => useMediaDetails(item(1, 'movie')));
    expect(second.result.current.details?.plot).toBe('A ledger.');
    expect(getMediaDetails).toHaveBeenCalledTimes(1);
  });

  it('waits while disabled and skips live channels', () => {
    renderHook(() => useMediaDetails(item(2, 'series'), { enabled: false }));
    const live = renderHook(() => useMediaDetails(item(3, 'live')));

    expect(getMediaDetails).not.toHaveBeenCalled();
    expect(live.result.current).toMatchObject({ details: null, loading: false, error: null });
  });

  it('reloads old details in the background and keeps showing them', async () => {
    vi.mocked(getMediaDetails)
      .mockResolvedValueOnce(mediaDetails({ plot: 'First.' }))
      .mockResolvedValueOnce(mediaDetails({ plot: 'Updated.' }));
    const { result } = renderHook(() => useMediaDetails(item(5, 'movie')));
    await waitFor(() => expect(result.current.details?.plot).toBe('First.'));

    loadMediaDetails(5, Date.now() + 60_000);
    expect(getMediaDetails).toHaveBeenCalledTimes(1);

    act(() => loadMediaDetails(5, Date.now() + SESSION_DETAILS_TTL_MS + 1));
    expect(result.current.details?.plot).toBe('First.');
    await waitFor(() => expect(result.current.details?.plot).toBe('Updated.'));
    expect(getMediaDetails).toHaveBeenCalledTimes(2);
  });

  it('forgets details when a catalog changes', async () => {
    vi.mocked(getMediaDetails)
      .mockResolvedValueOnce(mediaDetails({ plot: 'Before refresh.' }))
      .mockResolvedValueOnce(mediaDetails({ plot: 'After refresh.' }));
    const { result } = renderHook(() => useMediaDetails(item(6, 'movie')));
    await waitFor(() => expect(result.current.details?.plot).toBe('Before refresh.'));

    act(() => invalidateSourceCatalog(1));
    // The open page asks again by itself.
    await waitFor(() => expect(result.current.details?.plot).toBe('After refresh.'));
    expect(getMediaDetails).toHaveBeenCalledTimes(2);
  });

  it('reports failures and retries on request', async () => {
    vi.mocked(getMediaDetails)
      .mockRejectedValueOnce('provider down')
      .mockResolvedValueOnce(mediaDetails({ plot: 'Back.' }));

    const { result } = renderHook(() => useMediaDetails(item(4, 'movie')));
    await waitFor(() => expect(result.current.error).toBe('provider down'));

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.details?.plot).toBe('Back.'));
    expect(result.current.error).toBeNull();
  });
});
