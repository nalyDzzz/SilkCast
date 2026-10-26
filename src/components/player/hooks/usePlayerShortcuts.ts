import { useEffect, useRef } from 'react';
import {
  resolvePlayerAction,
  type PlayerAction,
} from '@/components/player/playerShortcuts';

export type PlayerActionHandlers = Partial<Record<PlayerAction, () => void>>;

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  );
}

/** Global keyboard shortcuts for the player. Handlers may change every render. */
export function usePlayerShortcuts(
  handlers: PlayerActionHandlers,
  enabled: boolean
) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditableTarget(event.target)) {
        return;
      }

      const action = resolvePlayerAction(event);
      const handler = action ? handlersRef.current[action] : undefined;
      if (!handler) {
        return;
      }

      event.preventDefault();
      handler();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled]);
}
