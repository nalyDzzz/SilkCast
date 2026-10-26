import { afterEach, describe, expect, it, vi } from 'vitest';
import { startNativeEngine } from '@/lib/player/engines/nativeEngine';

function failVideo(video: HTMLVideoElement, code: number) {
  Object.defineProperty(video, 'error', {
    configurable: true,
    value: { code, message: '' },
  });
  video.dispatchEvent(new Event('error'));
}

async function start(video: HTMLVideoElement) {
  const onFatal = vi.fn();
  await startNativeEngine({
    video,
    url: 'http://127.0.0.1:1/token/stream?url=movie.mp4',
    isLive: false,
    isCurrent: () => true,
    callbacks: { onFatal, onTracksChanged: vi.fn() },
  });
  return onFatal;
}

describe('startNativeEngine', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports the provider HTTP status when the file fails before metadata', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(null, { status: 403 }))
    );
    vi.stubGlobal('fetch', fetchMock);
    const video = document.createElement('video');
    const onFatal = await start(video);

    failVideo(video, 4);

    await vi.waitFor(() => {
      expect(onFatal).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'http', httpStatus: 403 })
      );
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:1/token/stream?url=movie.mp4',
      expect.objectContaining({ headers: { Range: 'bytes=0-0' } })
    );
  });

  it('keeps the format failure when the server answers normally', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(null, { status: 206 })))
    );
    const video = document.createElement('video');
    const onFatal = await start(video);

    failVideo(video, 4);

    await vi.waitFor(() => {
      expect(onFatal).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'format' })
      );
    });
  });

  it('reports decode errors without probing', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const video = document.createElement('video');
    const onFatal = await start(video);

    failVideo(video, 3);

    expect(onFatal).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'unsupported' })
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
