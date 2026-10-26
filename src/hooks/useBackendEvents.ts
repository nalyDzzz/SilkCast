import { useEffect, useRef } from 'react';
import type { BackendEvent } from '@/components/app/types';
import { subscribeBackendEvents } from '@/lib/api/eventsApi';

/**
 * Subscribes to backend events for the component's lifetime. Handlers may
 * change every render; the subscription itself is made once.
 */
export function useBackendEvents(
  onEvent: (event: BackendEvent) => void,
  onError?: (error: unknown) => void
) {
  const onEventRef = useRef(onEvent);
  const onErrorRef = useRef(onError);
  onEventRef.current = onEvent;
  onErrorRef.current = onError;

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    subscribeBackendEvents((event) => onEventRef.current(event))
      .then((unsubscribe) => {
        // Cleanup may run before the subscription resolves (StrictMode does
        // this on every mount); release the listener instead of leaking it.
        if (disposed) {
          unsubscribe();
        } else {
          unlisten = unsubscribe;
        }
      })
      .catch((error) => onErrorRef.current?.(error));

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
}
