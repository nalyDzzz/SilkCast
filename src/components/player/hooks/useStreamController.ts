import { useEffect, useState, useSyncExternalStore } from 'react';
import { ENGINE_FACTORIES } from '@/lib/player/engines';
import {
  StreamController,
  type StreamControllerState,
  type StreamSource,
} from '@/lib/player/streamController';

const IDLE_STATE: StreamControllerState = {
  phase: 'idle',
  engine: null,
  failure: null,
  reconnectAttempt: 0,
  tracksVersion: 0,
};

const noopSubscribe = () => () => undefined;
const getIdleState = () => IDLE_STATE;

/**
 * Binds a StreamController to a <video> element. `source` must be memoized by
 * the caller: every new object identity starts a fresh load.
 */
export function useStreamController(
  video: HTMLVideoElement | null,
  source: StreamSource | null
) {
  const [controller, setController] = useState<StreamController | null>(null);

  useEffect(() => {
    if (!video) {
      return;
    }

    const instance = new StreamController(video, {
      factories: ENGINE_FACTORIES,
    });
    setController(instance);

    return () => {
      instance.destroy();
      setController(null);
    };
  }, [video]);

  useEffect(() => {
    if (controller && source) {
      controller.load(source);
    }
  }, [controller, source]);

  const state = useSyncExternalStore(
    controller?.subscribe ?? noopSubscribe,
    controller?.getState ?? getIdleState
  );

  return { controller, state };
}
