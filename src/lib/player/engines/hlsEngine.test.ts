import type { ErrorData } from 'hls.js';
import { describe, expect, it } from 'vitest';
import { mapHlsError } from './hlsEngine';

function manifestLoadError(code: number) {
  return {
    type: 'networkError',
    details: 'manifestLoadError',
    fatal: true,
    response: { code, text: '' },
  } as unknown as ErrorData;
}

describe('mapHlsError', () => {
  it('treats media behind a playlist url as a format mismatch', () => {
    expect(mapHlsError(manifestLoadError(415))).toMatchObject({
      category: 'format',
    });
  });

  it('keeps other HTTP failures as HTTP errors', () => {
    expect(mapHlsError(manifestLoadError(403))).toMatchObject({
      category: 'http',
      httpStatus: 403,
    });
  });
});
