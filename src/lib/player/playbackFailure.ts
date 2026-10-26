export type PlaybackFailureCategory =
  | 'http'
  | 'network'
  | 'format'
  | 'unsupported'
  | 'timeout'
  | 'unknown';

export type PlaybackFailure = {
  category: PlaybackFailureCategory;
  /** Technical detail from the engine, shown in a collapsible section. */
  detail: string;
  httpStatus?: number;
};

export type FailureDescription = {
  title: string;
  message: string;
  /** Whether opening the stream in MPV is likely to help. */
  suggestMpv: boolean;
};

/** Wrong-engine failures: the next engine in the plan may still succeed. */
export function isEngineMismatch(failure: PlaybackFailure) {
  return failure.category === 'format' || failure.category === 'unsupported';
}

export function describeFailure(failure: PlaybackFailure): FailureDescription {
  if (failure.category === 'http' && failure.httpStatus !== undefined) {
    const status = failure.httpStatus;

    if (status === 401 || status === 403) {
      return {
        title: `Provider refused the stream (HTTP ${status})`,
        message:
          'Your subscription may have expired, or the provider is blocking this connection. If another device is watching on this account, stop it and retry.',
        suggestMpv: false,
      };
    }

    if (status === 404 || status === 410) {
      return {
        title: `Stream not found (HTTP ${status})`,
        message:
          'The provider no longer serves this item. Refreshing the source may pick up its new address.',
        suggestMpv: false,
      };
    }

    if (status === 429 || status === 456 || status === 458 || status === 509) {
      return {
        title: `Connection limit reached (HTTP ${status})`,
        message:
          'Your provider limits how many streams can play at once. Close other players using this account, wait a few seconds, and retry.',
        suggestMpv: false,
      };
    }

    if (status === 502) {
      return {
        title: "Couldn't reach the provider",
        message:
          'The provider did not respond. Check your connection or try again in a moment.',
        suggestMpv: false,
      };
    }

    if (status >= 500) {
      return {
        title: `Provider server error (HTTP ${status})`,
        message:
          'The provider had a problem serving this stream. Try again shortly.',
        suggestMpv: false,
      };
    }

    return {
      title: `Stream request failed (HTTP ${status})`,
      message: 'The provider rejected the request for this stream.',
      suggestMpv: true,
    };
  }

  switch (failure.category) {
    case 'network':
    case 'http':
      return {
        title: 'Connection to the stream was lost',
        message:
          'The stream stopped responding. Check your connection, then retry.',
        suggestMpv: true,
      };
    case 'timeout':
      return {
        title: 'The stream took too long to start',
        message:
          'The provider is slow or the channel is offline. Retry, or try another channel.',
        suggestMpv: true,
      };
    case 'format':
    case 'unsupported':
      return {
        title: "The built-in player can't decode this stream",
        message:
          'It likely uses a format the built-in player lacks (for example AVI, HEVC, AC3, or DTS audio). MPV can play almost anything.',
        suggestMpv: true,
      };
    case 'unknown':
      return {
        title: 'Playback failed',
        message: 'Something went wrong while playing this stream.',
        suggestMpv: true,
      };
  }
}
