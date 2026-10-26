import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

async function setNativeFullscreen(fullscreen: boolean) {
  await getCurrentWindow().setFullscreen(fullscreen);
}

/**
 * Fullscreen for the player. Inside Tauri the whole window goes fullscreen
 * (the player already fills the viewport); in a plain browser it falls back to
 * the Fullscreen API on the container.
 */
export function useFullscreen(containerRef: RefObject<HTMLElement | null>) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const isFullscreenRef = useRef(false);
  isFullscreenRef.current = isFullscreen;

  useEffect(() => {
    if (isTauriRuntime()) {
      return;
    }

    const handleChange = () => {
      setIsFullscreen(document.fullscreenElement !== null);
    };
    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, []);

  // Never leave the app stuck in fullscreen after closing the player.
  useEffect(
    () => () => {
      if (!isFullscreenRef.current) {
        return;
      }

      if (isTauriRuntime()) {
        void setNativeFullscreen(false).catch(() => undefined);
      } else if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => undefined);
      }
    },
    []
  );

  const setFullscreen = useCallback(
    async (next: boolean) => {
      try {
        if (isTauriRuntime()) {
          await setNativeFullscreen(next);
          setIsFullscreen(next);
          return;
        }

        if (next) {
          await containerRef.current?.requestFullscreen();
        } else if (document.fullscreenElement) {
          await document.exitFullscreen();
        }
      } catch {
        // Fullscreen can be refused (permissions, unsupported); stay windowed.
      }
    },
    [containerRef]
  );

  const toggleFullscreen = useCallback(
    () => setFullscreen(!isFullscreenRef.current),
    [setFullscreen]
  );

  return { isFullscreen, setFullscreen, toggleFullscreen };
}
