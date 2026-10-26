import type { EngineFactory, EngineInstance } from '@/lib/player/engines/types';
import {
  isEngineMismatch,
  type PlaybackFailure,
} from '@/lib/player/playbackFailure';
import type { EngineKind } from '@/lib/player/streamSource';

export type StreamPhase =
  | 'idle'
  | 'loading'
  | 'playing'
  | 'reconnecting'
  | 'error';

export type StreamControllerState = {
  phase: StreamPhase;
  engine: EngineKind | null;
  failure: PlaybackFailure | null;
  reconnectAttempt: number;
  /** Bumped whenever the active engine's audio tracks or levels change. */
  tracksVersion: number;
};

export type StreamSource = {
  url: string;
  engines: EngineKind[];
  isLive: boolean;
  /** Seconds to seek to once the first frame loads (resume support). */
  startPosition?: number | null;
};

type Timers = {
  setTimeout: (callback: () => void, ms: number) => number;
  clearTimeout: (id: number) => void;
  now: () => number;
};

export type StreamControllerOptions = {
  factories: Record<EngineKind, EngineFactory>;
  startupTimeoutMs?: number;
  stallTimeoutMs?: number;
  maxReconnects?: number;
  timers?: Timers;
};

const DEFAULT_TIMERS: Timers = {
  setTimeout: (callback, ms) => window.setTimeout(callback, ms),
  clearTimeout: (id) => window.clearTimeout(id),
  now: () => Date.now(),
};

const INITIAL_STATE: StreamControllerState = {
  phase: 'idle',
  engine: null,
  failure: null,
  reconnectAttempt: 0,
  tracksVersion: 0,
};

/** Reconnect counter resets after this much uninterrupted playback. */
const STABLE_PLAYBACK_MS = 60_000;

function toFailure(error: unknown): PlaybackFailure {
  if (
    typeof error === 'object' &&
    error !== null &&
    'category' in error &&
    'detail' in error
  ) {
    return error as PlaybackFailure;
  }

  return {
    category: 'unknown',
    detail: error instanceof Error ? error.message : String(error),
  };
}

/**
 * Statuses providers return for a few seconds while they release a dropped
 * connection. Final before playback starts, transient after a drop.
 */
const CONNECTION_LIMIT_STATUSES = new Set([403, 429, 456, 458]);
const CONNECTION_LIMIT_RETRY_DELAY_MS = 3000;

function isConnectionLimitError(failure: PlaybackFailure) {
  return (
    failure.category === 'http' &&
    failure.httpStatus !== undefined &&
    CONNECTION_LIMIT_STATUSES.has(failure.httpStatus)
  );
}

function isFinalHttpError(failure: PlaybackFailure, hasPlayedSource: boolean) {
  if (
    failure.category !== 'http' ||
    failure.httpStatus === undefined ||
    failure.httpStatus < 400 ||
    failure.httpStatus >= 500
  ) {
    return false;
  }

  return !(hasPlayedSource && isConnectionLimitError(failure));
}

/**
 * Drives a <video> element through an ordered list of playback engines,
 * falling through on format mismatches and reconnecting dropped streams.
 * Framework-agnostic so it can be unit tested without React.
 */
export class StreamController {
  private readonly video: HTMLVideoElement;
  private readonly factories: Record<EngineKind, EngineFactory>;
  private readonly startupTimeoutMs: number;
  private readonly stallTimeoutMs: number;
  private readonly maxReconnects: number;
  private readonly timers: Timers;
  private readonly listeners = new Set<() => void>();

  private state: StreamControllerState = INITIAL_STATE;
  private source: StreamSource | null = null;
  private engine: EngineInstance | null = null;
  private engineIndex = 0;
  private session = 0;
  private attemptActive = false;
  private firstFrameLoaded = false;
  private hasPlayedSource = false;
  /** False when the viewer had paused before a reconnect. */
  private autoplay = true;
  private reconnects = 0;
  private lastReconnectAt = 0;
  private lastKnownTime = 0;
  private resumeAt: number | null = null;
  private startupTimer: number | null = null;
  private stallTimer: number | null = null;
  private reconnectTimer: number | null = null;

  constructor(video: HTMLVideoElement, options: StreamControllerOptions) {
    this.video = video;
    this.factories = options.factories;
    this.startupTimeoutMs = options.startupTimeoutMs ?? 25_000;
    this.stallTimeoutMs = options.stallTimeoutMs ?? 20_000;
    this.maxReconnects = options.maxReconnects ?? 5;
    this.timers = options.timers ?? DEFAULT_TIMERS;

    video.addEventListener('loadeddata', this.handleLoadedData);
    video.addEventListener('playing', this.handleProgress);
    video.addEventListener('timeupdate', this.handleProgress);
    video.addEventListener('waiting', this.handleWaiting);
    video.addEventListener('pause', this.handlePause);
    video.addEventListener('ended', this.handleEnded);
  }

  getState = () => this.state;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getEngine() {
    return this.engine;
  }

  load(source: StreamSource) {
    this.source = source;
    this.reconnects = 0;
    this.hasPlayedSource = false;
    this.autoplay = true;
    this.lastKnownTime = 0;
    this.resumeAt = source.startPosition ?? null;
    this.setState({ reconnectAttempt: 0 });
    void this.startEngine(0, 'loading');
  }

  /** Restart the current source from the first engine, keeping position. */
  retry() {
    if (!this.source) {
      return;
    }

    this.reconnects = 0;
    this.autoplay = true;
    if (!this.source.isLive && this.lastKnownTime > 0) {
      this.resumeAt = this.lastKnownTime;
    }
    this.setState({ reconnectAttempt: 0 });
    void this.startEngine(0, 'loading');
  }

  destroy() {
    this.session += 1;
    this.clearAllTimers();
    this.teardownEngine();
    this.source = null;
    this.listeners.clear();
    this.video.removeEventListener('loadeddata', this.handleLoadedData);
    this.video.removeEventListener('playing', this.handleProgress);
    this.video.removeEventListener('timeupdate', this.handleProgress);
    this.video.removeEventListener('waiting', this.handleWaiting);
    this.video.removeEventListener('pause', this.handlePause);
    this.video.removeEventListener('ended', this.handleEnded);
  }

  private setState(patch: Partial<StreamControllerState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) {
      listener();
    }
  }

  private async startEngine(index: number, phase: 'loading' | 'reconnecting') {
    this.clearAllTimers();
    this.teardownEngine();

    const session = ++this.session;
    // Reset before any early return: events from the torn-down engine must not
    // be mistaken for progress on this attempt.
    this.firstFrameLoaded = false;
    const source = this.source;
    if (!source) {
      return;
    }

    const kind = source.engines[index];
    if (!kind) {
      this.setState({
        phase: 'error',
        engine: null,
        failure: {
          category: 'unsupported',
          detail: 'No built-in playback engine supports this stream format.',
        },
      });
      return;
    }

    this.engineIndex = index;
    this.attemptActive = true;
    this.setState({ phase, engine: kind, failure: null });

    this.startupTimer = this.timers.setTimeout(() => {
      this.handleFailure(session, {
        category: 'timeout',
        detail: `No video after ${Math.round(this.startupTimeoutMs / 1000)}s using ${kind}.`,
      });
    }, this.startupTimeoutMs);

    try {
      const instance = await this.factories[kind]({
        video: this.video,
        url: source.url,
        isLive: source.isLive,
        isCurrent: () => session === this.session,
        callbacks: {
          onFatal: (failure) => this.handleFailure(session, failure),
          onTracksChanged: () => {
            if (session === this.session) {
              this.setState({ tracksVersion: this.state.tracksVersion + 1 });
            }
          },
        },
      });

      if (session !== this.session) {
        instance.destroy();
        return;
      }

      this.engine = instance;
      if (this.autoplay) {
        this.requestPlay();
      }
    } catch (error) {
      this.handleFailure(session, toFailure(error));
    }
  }

  private requestPlay() {
    try {
      const result = this.video.play();
      // Autoplay may be blocked before user interaction; the UI shows a play
      // button in that case, so the rejection is expected and safe to ignore.
      void result?.catch(() => undefined);
    } catch {
      // Older engines throw synchronously instead of rejecting.
    }
  }

  private handleFailure(session: number, failure: PlaybackFailure) {
    if (session !== this.session || !this.source) {
      return;
    }

    if (this.firstFrameLoaded) {
      // Read before teardown, which pauses the element.
      this.autoplay = !this.video.paused;
    }

    this.session += 1;
    this.clearAllTimers();
    this.teardownEngine();

    const source = this.source;
    const nextIndex = this.engineIndex + 1;

    if (
      !this.firstFrameLoaded &&
      isEngineMismatch(failure) &&
      nextIndex < source.engines.length
    ) {
      void this.startEngine(
        nextIndex,
        this.state.phase === 'reconnecting' ? 'reconnecting' : 'loading'
      );
      return;
    }

    // Live feeds can switch codecs or profiles mid-stream (ad breaks,
    // programme boundaries), so a decode failure after playback is retried.
    const canReconnect =
      this.hasPlayedSource &&
      (!isEngineMismatch(failure) || source.isLive) &&
      !isFinalHttpError(failure, this.hasPlayedSource) &&
      this.reconnects < this.maxReconnects;

    if (canReconnect) {
      this.reconnects += 1;
      this.lastReconnectAt = this.timers.now();
      if (!source.isLive && this.lastKnownTime > 0) {
        this.resumeAt = this.lastKnownTime;
      }

      const backoff = Math.min(1000 * 2 ** (this.reconnects - 1), 8000);
      const delay = isConnectionLimitError(failure)
        ? Math.max(backoff, CONNECTION_LIMIT_RETRY_DELAY_MS)
        : backoff;
      const retryIndex = this.engineIndex;
      this.setState({
        phase: 'reconnecting',
        reconnectAttempt: this.reconnects,
        failure,
      });
      this.reconnectTimer = this.timers.setTimeout(() => {
        this.reconnectTimer = null;
        void this.startEngine(retryIndex, 'reconnecting');
      }, delay);
      return;
    }

    this.setState({ phase: 'error', failure });
  }

  private handleLoadedData = () => {
    if (!this.attemptActive || this.firstFrameLoaded) {
      return;
    }

    this.firstFrameLoaded = true;
    this.hasPlayedSource = true;
    this.clearTimer('startupTimer');

    if (this.resumeAt !== null && this.resumeAt > 0) {
      try {
        this.video.currentTime = this.resumeAt;
      } catch {
        // Seeking can fail on streams without a seekable range.
      }
    }
    this.resumeAt = null;

    this.setState({ phase: 'playing', failure: null });
  };

  private handleProgress = () => {
    if (!this.firstFrameLoaded) {
      return;
    }

    this.clearTimer('stallTimer');
    if (Number.isFinite(this.video.currentTime) && this.video.currentTime > 0) {
      this.lastKnownTime = this.video.currentTime;
    }

    if (
      this.reconnects > 0 &&
      this.timers.now() - this.lastReconnectAt > STABLE_PLAYBACK_MS
    ) {
      this.reconnects = 0;
      this.setState({ reconnectAttempt: 0 });
    }

    if (this.state.phase !== 'playing') {
      this.setState({ phase: 'playing', failure: null });
    }
  };

  private handleWaiting = () => {
    if (!this.firstFrameLoaded || !this.source || this.video.paused) {
      return;
    }

    const session = this.session;
    const timeout = this.source.isLive
      ? this.stallTimeoutMs
      : this.stallTimeoutMs * 2;

    this.clearTimer('stallTimer');
    this.stallTimer = this.timers.setTimeout(() => {
      this.stallTimer = null;
      this.handleFailure(session, {
        category: 'network',
        detail: `Stream stalled for ${Math.round(timeout / 1000)}s.`,
      });
    }, timeout);
  };

  private handlePause = () => {
    this.clearTimer('stallTimer');
  };

  private handleEnded = () => {
    if (this.source?.isLive && this.firstFrameLoaded) {
      this.handleFailure(this.session, {
        category: 'network',
        detail: 'The live stream ended unexpectedly.',
      });
    }
  };

  private teardownEngine() {
    this.attemptActive = false;
    const engine = this.engine;
    this.engine = null;
    if (engine) {
      try {
        engine.destroy();
      } catch {
        // Engines may throw while tearing down a half-initialized pipeline.
      }
    }
  }

  private clearTimer(name: 'startupTimer' | 'stallTimer' | 'reconnectTimer') {
    const id = this[name];
    if (id !== null) {
      this.timers.clearTimeout(id);
      this[name] = null;
    }
  }

  private clearAllTimers() {
    this.clearTimer('startupTimer');
    this.clearTimer('stallTimer');
    this.clearTimer('reconnectTimer');
  }
}
