import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  EngineCallbacks,
  EngineFactory,
  EngineInstance,
} from '@/lib/player/engines/types';
import { StreamController } from '@/lib/player/streamController';
import type { EngineKind } from '@/lib/player/streamSource';

type FakeEngine = {
  callbacks: EngineCallbacks;
  url: string;
  instance: EngineInstance & { destroy: ReturnType<typeof vi.fn> };
};

function createVideo() {
  const video = document.createElement('video');
  let currentTime = 0;
  Object.defineProperty(video, 'paused', {
    configurable: true,
    writable: true,
    value: false,
  });
  Object.defineProperty(video, 'currentTime', {
    configurable: true,
    get: () => currentTime,
    set: (value: number) => {
      currentTime = value;
    },
  });
  video.play = vi.fn(() => Promise.resolve());
  return video;
}

function createFactories() {
  const started: Record<EngineKind, FakeEngine[]> = {
    hls: [],
    mpegts: [],
    native: [],
  };

  const makeFactory =
    (kind: EngineKind): EngineFactory =>
    async ({ callbacks, url }) => {
      const instance = { kind, destroy: vi.fn() };
      started[kind].push({ callbacks, url, instance });
      return instance;
    };

  return {
    started,
    factories: {
      hls: makeFactory('hls'),
      mpegts: makeFactory('mpegts'),
      native: makeFactory('native'),
    },
  };
}

async function flush() {
  await vi.advanceTimersByTimeAsync(0);
}

describe('StreamController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('falls through to the next engine when the stream format does not match', async () => {
    const video = createVideo();
    const { started, factories } = createFactories();
    const controller = new StreamController(video, { factories });

    controller.load({
      url: 'http://proxy/stream',
      engines: ['mpegts', 'hls'],
      isLive: true,
    });
    await flush();

    expect(controller.getState()).toMatchObject({
      phase: 'loading',
      engine: 'mpegts',
    });

    started.mpegts[0].callbacks.onFatal({
      category: 'format',
      detail: 'not a TS stream',
    });
    await flush();

    expect(started.mpegts[0].instance.destroy).toHaveBeenCalled();
    expect(started.hls).toHaveLength(1);
    expect(controller.getState().engine).toBe('hls');

    video.dispatchEvent(new Event('loadeddata'));
    expect(controller.getState()).toMatchObject({
      phase: 'playing',
      failure: null,
    });
  });

  it('gives the HLS engine the playlist url and other engines the stream url', async () => {
    const video = createVideo();
    const { started, factories } = createFactories();
    const controller = new StreamController(video, { factories });

    controller.load({
      url: 'http://proxy/stream',
      playlistUrl: 'http://proxy/stream&expect=playlist',
      engines: ['hls', 'mpegts'],
      isLive: true,
    });
    await flush();
    expect(started.hls[0].url).toBe('http://proxy/stream&expect=playlist');

    started.hls[0].callbacks.onFatal({
      category: 'format',
      detail: 'not a playlist',
    });
    await flush();
    expect(started.mpegts[0].url).toBe('http://proxy/stream');
  });

  it('reports HTTP client errors immediately without trying other engines', async () => {
    const video = createVideo();
    const { started, factories } = createFactories();
    const controller = new StreamController(video, { factories });

    controller.load({
      url: 'http://proxy/stream',
      engines: ['mpegts', 'hls', 'native'],
      isLive: true,
    });
    await flush();

    started.mpegts[0].callbacks.onFatal({
      category: 'http',
      detail: 'forbidden',
      httpStatus: 403,
    });
    await flush();

    expect(started.hls).toHaveLength(0);
    expect(controller.getState()).toMatchObject({
      phase: 'error',
      failure: { category: 'http', httpStatus: 403 },
    });
  });

  it('reconnects a dropped live stream with backoff, then gives up', async () => {
    const video = createVideo();
    const { started, factories } = createFactories();
    const controller = new StreamController(video, {
      factories,
      maxReconnects: 2,
    });

    controller.load({
      url: 'http://proxy/stream',
      engines: ['mpegts'],
      isLive: true,
    });
    await flush();
    video.dispatchEvent(new Event('loadeddata'));

    started.mpegts[0].callbacks.onFatal({
      category: 'network',
      detail: 'connection reset',
    });
    expect(controller.getState()).toMatchObject({
      phase: 'reconnecting',
      reconnectAttempt: 1,
    });

    await vi.advanceTimersByTimeAsync(1000);
    expect(started.mpegts).toHaveLength(2);

    // Second drop happens before any frame arrives on the new connection.
    started.mpegts[1].callbacks.onFatal({
      category: 'network',
      detail: 'connection reset',
    });
    expect(controller.getState().reconnectAttempt).toBe(2);

    await vi.advanceTimersByTimeAsync(2000);
    expect(started.mpegts).toHaveLength(3);

    started.mpegts[2].callbacks.onFatal({
      category: 'network',
      detail: 'connection reset',
    });
    expect(controller.getState()).toMatchObject({
      phase: 'error',
      failure: { category: 'network' },
    });
  });

  it('times out when no frame arrives', async () => {
    const video = createVideo();
    const { factories } = createFactories();
    const controller = new StreamController(video, {
      factories,
      startupTimeoutMs: 5000,
    });

    controller.load({
      url: 'http://proxy/stream',
      engines: ['hls'],
      isLive: true,
    });
    await flush();

    await vi.advanceTimersByTimeAsync(5000);
    expect(controller.getState()).toMatchObject({
      phase: 'error',
      failure: { category: 'timeout' },
    });
  });

  it('reconnects when a playing live stream stalls', async () => {
    const video = createVideo();
    const { started, factories } = createFactories();
    const controller = new StreamController(video, {
      factories,
      stallTimeoutMs: 3000,
    });

    controller.load({
      url: 'http://proxy/stream',
      engines: ['mpegts'],
      isLive: true,
    });
    await flush();
    video.dispatchEvent(new Event('loadeddata'));
    video.dispatchEvent(new Event('waiting'));

    await vi.advanceTimersByTimeAsync(3000);
    expect(controller.getState().phase).toBe('reconnecting');

    await vi.advanceTimersByTimeAsync(1000);
    expect(started.mpegts).toHaveLength(2);
  });

  it('does not treat waiting while paused as a stall', async () => {
    const video = createVideo();
    const { factories } = createFactories();
    const controller = new StreamController(video, {
      factories,
      stallTimeoutMs: 3000,
    });

    controller.load({
      url: 'http://proxy/stream',
      engines: ['mpegts'],
      isLive: true,
    });
    await flush();
    video.dispatchEvent(new Event('loadeddata'));
    Object.defineProperty(video, 'paused', { value: true });
    video.dispatchEvent(new Event('waiting'));

    await vi.advanceTimersByTimeAsync(10_000);
    expect(controller.getState().phase).toBe('playing');
  });

  it('seeks to the start position and resumes VOD at the last position after a reconnect', async () => {
    const video = createVideo();
    const { started, factories } = createFactories();
    const controller = new StreamController(video, { factories });

    controller.load({
      url: 'http://proxy/movie.mp4',
      engines: ['native'],
      isLive: false,
      startPosition: 120,
    });
    await flush();
    video.dispatchEvent(new Event('loadeddata'));
    expect(video.currentTime).toBe(120);

    video.currentTime = 300;
    video.dispatchEvent(new Event('timeupdate'));

    started.native[0].callbacks.onFatal({
      category: 'network',
      detail: 'dropped',
    });
    await vi.advanceTimersByTimeAsync(1000);

    video.currentTime = 0;
    video.dispatchEvent(new Event('loadeddata'));
    expect(video.currentTime).toBe(300);
  });

  it('errors immediately when there is no engine for the format', async () => {
    const video = createVideo();
    const { factories } = createFactories();
    const controller = new StreamController(video, { factories });

    controller.load({
      url: 'http://proxy/movie.avi',
      engines: [],
      isLive: false,
    });
    await flush();

    expect(controller.getState()).toMatchObject({
      phase: 'error',
      failure: { category: 'unsupported' },
    });
  });

  it('keeps the error when switching from a playing stream to an unplayable one', async () => {
    const video = createVideo();
    const { factories } = createFactories();
    const controller = new StreamController(video, { factories });

    controller.load({ url: 'a.mkv', engines: ['native'], isLive: false });
    await flush();
    video.dispatchEvent(new Event('loadeddata'));
    expect(controller.getState().phase).toBe('playing');

    controller.load({ url: 'b.avi', engines: [], isLive: false });
    await flush();
    // Tearing down the previous engine resets the element, which fires events.
    video.dispatchEvent(new Event('timeupdate'));
    video.dispatchEvent(new Event('playing'));

    expect(controller.getState()).toMatchObject({
      phase: 'error',
      failure: { category: 'unsupported' },
    });
  });

  it('reconnects a live stream whose codec breaks mid-playback', async () => {
    const video = createVideo();
    const { started, factories } = createFactories();
    const controller = new StreamController(video, { factories });

    controller.load({ url: 'live', engines: ['mpegts', 'hls'], isLive: true });
    await flush();
    video.dispatchEvent(new Event('loadeddata'));

    started.mpegts[0].callbacks.onFatal({
      category: 'unsupported',
      detail: 'MediaMSEError after an ad break',
    });
    expect(controller.getState().phase).toBe('reconnecting');

    await vi.advanceTimersByTimeAsync(1000);
    // Same engine, not a fallback: the stream was known to work with it.
    expect(started.mpegts).toHaveLength(2);
    expect(started.hls).toHaveLength(0);
  });

  it('retries connection-limit responses after a drop, but not before playback', async () => {
    const video = createVideo();
    const { started, factories } = createFactories();
    const controller = new StreamController(video, { factories });

    controller.load({ url: 'live', engines: ['mpegts'], isLive: true });
    await flush();
    started.mpegts[0].callbacks.onFatal({
      category: 'http',
      detail: 'limit',
      httpStatus: 458,
    });
    expect(controller.getState().phase).toBe('error');

    controller.load({ url: 'live', engines: ['mpegts'], isLive: true });
    await flush();
    video.dispatchEvent(new Event('loadeddata'));
    started.mpegts[1].callbacks.onFatal({
      category: 'network',
      detail: 'dropped',
    });
    await vi.advanceTimersByTimeAsync(1000);
    // The provider still holds the old connection for a moment.
    started.mpegts[2].callbacks.onFatal({
      category: 'http',
      detail: 'limit',
      httpStatus: 458,
    });
    expect(controller.getState().phase).toBe('reconnecting');

    await vi.advanceTimersByTimeAsync(3000);
    expect(started.mpegts).toHaveLength(4);
  });

  it('does not resume playback the viewer paused when reconnecting', async () => {
    const video = createVideo();
    const { started, factories } = createFactories();
    const controller = new StreamController(video, { factories });

    controller.load({ url: 'live', engines: ['mpegts'], isLive: true });
    await flush();
    video.dispatchEvent(new Event('loadeddata'));
    expect(video.play).toHaveBeenCalledTimes(1);

    Object.defineProperty(video, 'paused', { value: true });
    started.mpegts[0].callbacks.onFatal({
      category: 'network',
      detail: 'drop',
    });
    await vi.advanceTimersByTimeAsync(1000);

    expect(started.mpegts).toHaveLength(2);
    expect(video.play).toHaveBeenCalledTimes(1);
  });

  it('tells superseded engine factories they are stale', async () => {
    const video = createVideo();
    const seen: boolean[] = [];
    let release: (() => void) | undefined;
    const { factories } = createFactories();
    const slowFactory: EngineFactory = async ({ isCurrent }) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      seen.push(isCurrent());
      return { kind: 'hls', destroy: vi.fn() };
    };

    const controller = new StreamController(video, {
      factories: { ...factories, hls: slowFactory },
    });
    controller.load({ url: 'a', engines: ['hls'], isLive: true });
    controller.load({ url: 'b', engines: ['native'], isLive: true });
    release?.();
    await flush();

    expect(seen).toEqual([false]);
  });

  it('destroys an engine that finishes starting after a newer load', async () => {
    const video = createVideo();
    let resolveFirst: ((instance: EngineInstance) => void) | undefined;
    const firstDestroy = vi.fn();
    const { factories } = createFactories();
    const slowFactory: EngineFactory = () =>
      new Promise((resolve) => {
        resolveFirst = resolve;
      });

    const controller = new StreamController(video, {
      factories: { ...factories, hls: slowFactory },
    });

    controller.load({ url: 'a', engines: ['hls'], isLive: true });
    controller.load({ url: 'b', engines: ['native'], isLive: true });
    await flush();

    resolveFirst?.({ kind: 'hls', destroy: firstDestroy });
    await flush();

    expect(firstDestroy).toHaveBeenCalled();
    expect(controller.getEngine()?.kind).toBe('native');
  });

  it('restarts from the first engine on retry', async () => {
    const video = createVideo();
    const { started, factories } = createFactories();
    const controller = new StreamController(video, { factories });

    controller.load({
      url: 'http://proxy/stream',
      engines: ['hls'],
      isLive: true,
    });
    await flush();
    started.hls[0].callbacks.onFatal({
      category: 'http',
      detail: 'gone',
      httpStatus: 404,
    });
    expect(controller.getState().phase).toBe('error');

    controller.retry();
    await flush();
    expect(started.hls).toHaveLength(2);
    expect(controller.getState()).toMatchObject({
      phase: 'loading',
      failure: null,
    });
  });
});
