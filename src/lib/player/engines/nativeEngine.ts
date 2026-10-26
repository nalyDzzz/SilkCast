import type { PlaybackFailure } from '@/lib/player/playbackFailure';
import type { EngineFactory } from './types';

// HTMLMediaElement MediaError codes.
const MEDIA_ERR_NETWORK = 2;
const MEDIA_ERR_DECODE = 3;
const MEDIA_ERR_SRC_NOT_SUPPORTED = 4;
const PROBE_TIMEOUT_MS = 8000;

export function mapMediaError(error: MediaError | null): PlaybackFailure {
  const detail =
    error?.message || `MediaError code ${error?.code ?? 'unknown'}`;

  switch (error?.code) {
    case MEDIA_ERR_NETWORK:
      return { category: 'network', detail };
    case MEDIA_ERR_DECODE:
      return { category: 'unsupported', detail };
    case MEDIA_ERR_SRC_NOT_SUPPORTED:
      return { category: 'format', detail };
    default:
      return { category: 'unknown', detail };
  }
}

/**
 * Chromium reports any failure before metadata (including HTTP 403/404) as
 * "source not supported". Ask the server directly so provider errors are
 * shown as such instead of as a format problem.
 */
export async function probeHttpStatus(url: string): Promise<number | null> {
  const abort = new AbortController();
  const timeoutId = window.setTimeout(() => abort.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Range: 'bytes=0-0' },
      signal: abort.signal,
    });
    void response.body?.cancel().catch(() => undefined);
    return response.status;
  } catch {
    // Network failure, timeout, or CORS on a direct (unproxied) URL.
    return null;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export const startNativeEngine: EngineFactory = async ({
  video,
  url,
  callbacks,
}) => {
  const handleError = () => {
    const failure = mapMediaError(video.error);
    const failedBeforeMetadata = video.readyState === 0;
    if (
      !failedBeforeMetadata ||
      (failure.category !== 'format' && failure.category !== 'network')
    ) {
      callbacks.onFatal(failure);
      return;
    }

    void probeHttpStatus(url).then((status) => {
      callbacks.onFatal(
        status !== null && status >= 400
          ? { category: 'http', detail: failure.detail, httpStatus: status }
          : failure
      );
    });
  };

  video.addEventListener('error', handleError);
  video.src = url;
  video.load();

  return {
    kind: 'native',
    destroy: () => {
      video.removeEventListener('error', handleError);
      video.removeAttribute('src');
      video.load();
    },
  };
};
