import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlayerScreen } from './PlayerScreen';
import { ChannelRecord } from '@/components/app/types';

vi.mock('@vidstack/react', () => ({
  MediaPlayer: ({ children, src, title, streamType }: any) => (
    <div
      data-testid="media-player"
      data-src={typeof src === 'string' ? src : src?.src ?? ''}
      data-type={typeof src === 'string' ? '' : src?.type ?? ''}
      data-title={title}
      data-stream-type={streamType}
    >
      {children}
    </div>
  ),
  MediaProvider: () => <div data-testid="media-provider" />,
}));

vi.mock('@vidstack/react/player/layouts/default', () => ({
  DefaultVideoLayout: () => <div data-testid="default-video-layout" />,
  defaultLayoutIcons: {},
}));

const activeChannel: ChannelRecord = {
  id: 7,
  source_id: 1,
  name: 'Sample Live Channel',
  group_name: 'News',
  logo: null,
  tvg_id: null,
  tvg_name: null,
  stream_url: 'https://example.com/live.m3u8',
  media_kind: 'live',
  is_favorite: false,
};

const unknownMovieChannel: ChannelRecord = {
  id: 8,
  source_id: 1,
  name: 'Unknown Container Movie',
  group_name: 'Movies',
  logo: null,
  tvg_id: null,
  tvg_name: null,
  stream_url: 'https://example.com/movie/322025.mkv',
  media_kind: 'movie',
  is_favorite: false,
};

const queryBasedHlsChannel: ChannelRecord = {
  id: 9,
  source_id: 1,
  name: 'Query HLS Channel',
  group_name: 'Live',
  logo: null,
  tvg_id: null,
  tvg_name: null,
  stream_url: 'https://example.com/live/play?format=m3u8&token=abc',
  media_kind: 'live',
  is_favorite: false,
};

const extensionlessChannel: ChannelRecord = {
  id: 10,
  source_id: 1,
  name: 'Extensionless Stream',
  group_name: 'Live',
  logo: null,
  tvg_id: null,
  tvg_name: null,
  stream_url: 'https://example.com/live/stream/12345?token=abc',
  media_kind: 'live',
  is_favorite: false,
};

describe('PlayerScreen', () => {
  it('shows the empty player prompt when no channel is active', () => {
    render(
      <PlayerScreen
        activeChannel={null}
        onBack={vi.fn()}
        onStop={vi.fn()}
        onOpenInMpv={vi.fn(async () => undefined)}
      />
    );

    expect(
      screen.getByText('Pick something from Live TV or Movies to start playback.')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('media-player')).not.toBeInTheDocument();
  });

  it('renders Vidstack player and default layout for an active channel', () => {
    render(
      <PlayerScreen
        activeChannel={activeChannel}
        onBack={vi.fn()}
        onStop={vi.fn()}
        onOpenInMpv={vi.fn(async () => undefined)}
      />
    );

    const mediaPlayer = screen.getByTestId('media-player');
    expect(mediaPlayer).toHaveAttribute('data-src', activeChannel.stream_url);
    expect(mediaPlayer).toHaveAttribute('data-type', 'application/x-mpegurl');
    expect(mediaPlayer).toHaveAttribute('data-title', activeChannel.name);
    expect(mediaPlayer).toHaveAttribute('data-stream-type', 'live');
    expect(screen.getByTestId('media-provider')).toBeInTheDocument();
    expect(screen.getByTestId('default-video-layout')).toBeInTheDocument();
  });

  it('uses native video element for mkv movie URLs', () => {
    const { container } = render(
      <PlayerScreen
        activeChannel={unknownMovieChannel}
        onBack={vi.fn()}
        onStop={vi.fn()}
        onOpenInMpv={vi.fn(async () => undefined)}
      />
    );

    const nativeVideo = container.querySelector('video');
    expect(nativeVideo).not.toBeNull();
    expect(nativeVideo).toHaveAttribute('src', unknownMovieChannel.stream_url);
    expect(nativeVideo).toHaveAttribute('controls');
    expect(screen.queryByTestId('media-player')).not.toBeInTheDocument();
  });

  it('detects HLS streams from query params', () => {
    render(
      <PlayerScreen
        activeChannel={queryBasedHlsChannel}
        onBack={vi.fn()}
        onStop={vi.fn()}
        onOpenInMpv={vi.fn(async () => undefined)}
      />
    );

    const mediaPlayer = screen.getByTestId('media-player');
    expect(mediaPlayer).toHaveAttribute('data-src', queryBasedHlsChannel.stream_url);
    expect(mediaPlayer).toHaveAttribute('data-type', 'application/x-mpegurl');
  });

  it('does not force a MIME type for extensionless streams', () => {
    render(
      <PlayerScreen
        activeChannel={extensionlessChannel}
        onBack={vi.fn()}
        onStop={vi.fn()}
        onOpenInMpv={vi.fn(async () => undefined)}
      />
    );

    const mediaPlayer = screen.getByTestId('media-player');
    expect(mediaPlayer).toHaveAttribute('data-src', extensionlessChannel.stream_url);
    expect(mediaPlayer).toHaveAttribute('data-type', '');
  });
});
