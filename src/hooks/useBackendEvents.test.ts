import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { BackendEvent } from '@/components/app/types';
import { subscribeBackendEvents } from '@/lib/api/eventsApi';
import { useBackendEvents } from '@/hooks/useBackendEvents';

vi.mock('@/lib/api/eventsApi', () => ({
  subscribeBackendEvents: vi.fn(),
}));

describe('useBackendEvents', () => {
  beforeEach(() => {
    vi.mocked(subscribeBackendEvents).mockReset();
  });

  it('releases a subscription that resolves after unmount', async () => {
    const unsubscribe = vi.fn();
    let resolve: ((value: () => void) => void) | undefined;
    vi.mocked(subscribeBackendEvents).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      })
    );

    const { unmount } = renderHook(() => useBackendEvents(vi.fn()));
    unmount();
    resolve?.(unsubscribe);
    await Promise.resolve();
    await Promise.resolve();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('delivers events to the latest handler', async () => {
    let emit: ((event: BackendEvent) => void) | undefined;
    vi.mocked(subscribeBackendEvents).mockImplementation(async (handler) => {
      emit = handler;
      return vi.fn();
    });
    const first = vi.fn();
    const second = vi.fn();

    const { rerender } = renderHook(
      ({ handler }) => useBackendEvents(handler),
      {
        initialProps: { handler: first },
      }
    );
    rerender({ handler: second });
    emit?.({ event: 'sources_updated', payload: {}, ts: 1 });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(subscribeBackendEvents).toHaveBeenCalledTimes(1);
  });
});
