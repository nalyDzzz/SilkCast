import { useMemo, useSyncExternalStore } from 'react';

const MEDIA_EVENTS = [
  'play',
  'pause',
  'playing',
  'waiting',
  'seeking',
  'seeked',
  'timeupdate',
  'durationchange',
  'progress',
  'volumechange',
  'ratechange',
  'loadedmetadata',
  'loadeddata',
  'canplay',
  'emptied',
  'ended',
] as const;

export type MediaPlaybackSnapshot = {
  paused: boolean;
  waiting: boolean;
  ended: boolean;
  volume: number;
  muted: boolean;
  playbackRate: number;
  hasVideoFrame: boolean;
};

export type MediaTimeSnapshot = {
  currentTime: number;
  duration: number;
  bufferedEnd: number;
};

const EMPTY_PLAYBACK: MediaPlaybackSnapshot = {
  paused: true,
  waiting: false,
  ended: false,
  volume: 1,
  muted: false,
  playbackRate: 1,
  hasVideoFrame: false,
};

const EMPTY_TIME: MediaTimeSnapshot = {
  currentTime: 0,
  duration: 0,
  bufferedEnd: 0,
};

// HTMLMediaElement.HAVE_CURRENT_DATA
const HAVE_CURRENT_DATA = 2;

function readPlayback(video: HTMLVideoElement): MediaPlaybackSnapshot {
  return {
    paused: video.paused,
    // readyState drops below HAVE_FUTURE_DATA while buffering.
    waiting: !video.paused && video.readyState < 3 && !video.ended,
    ended: video.ended,
    volume: video.volume,
    muted: video.muted,
    playbackRate: video.playbackRate,
    hasVideoFrame: video.readyState >= HAVE_CURRENT_DATA,
  };
}

function bufferedEndAt(video: HTMLVideoElement) {
  const { buffered, currentTime } = video;
  for (let index = 0; index < buffered.length; index += 1) {
    if (
      buffered.start(index) <= currentTime + 0.5 &&
      buffered.end(index) >= currentTime
    ) {
      return buffered.end(index);
    }
  }
  return currentTime;
}

function readTime(video: HTMLVideoElement): MediaTimeSnapshot {
  return {
    currentTime: video.currentTime,
    duration: video.duration,
    bufferedEnd: bufferedEndAt(video),
  };
}

function shallowEqual<T extends Record<string, unknown>>(a: T, b: T) {
  for (const key of Object.keys(a)) {
    if (!Object.is(a[key], b[key])) {
      return false;
    }
  }
  return true;
}

function createMediaStore<T extends Record<string, unknown>>(
  video: HTMLVideoElement | null,
  read: (video: HTMLVideoElement) => T,
  empty: T
) {
  let snapshot = video ? read(video) : empty;

  return {
    getSnapshot: () => snapshot,
    subscribe: (onChange: () => void) => {
      if (!video) {
        return () => undefined;
      }

      const handleEvent = () => {
        const next = read(video);
        if (!shallowEqual(next, snapshot)) {
          snapshot = next;
          onChange();
        }
      };

      for (const eventName of MEDIA_EVENTS) {
        video.addEventListener(eventName, handleEvent);
      }
      handleEvent();

      return () => {
        for (const eventName of MEDIA_EVENTS) {
          video.removeEventListener(eventName, handleEvent);
        }
      };
    },
  };
}

/** Coarse playback flags; does not re-render on every time update. */
export function useMediaPlaybackState(video: HTMLVideoElement | null) {
  const store = useMemo(
    () => createMediaStore(video, readPlayback, EMPTY_PLAYBACK),
    [video]
  );
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

/** Time and buffer position; re-renders a few times per second. */
export function useMediaTimeState(video: HTMLVideoElement | null) {
  const store = useMemo(
    () => createMediaStore(video, readTime, EMPTY_TIME),
    [video]
  );
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
