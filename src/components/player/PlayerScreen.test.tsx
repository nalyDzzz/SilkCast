import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import type { ChannelRecord } from '@/components/app/types';
import type {
  EngineCallbacks,
  EngineStartArgs,
} from '@/lib/player/engines/types';
import { ENGINE_FACTORIES } from '@/lib/player/engines';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PlayerScreen } from './PlayerScreen';

vi.mock('@/lib/player/engines', () => ({
  ENGINE_FACTORIES: { hls: vi.fn(), mpegts: vi.fn(), native: vi.fn() },
  ENGINE_LABELS: { hls: 'HLS', mpegts: 'MPEG-TS', native: 'Direct' },
}));

vi.mock('@/lib/api/epgApi', () => ({
  listChannelEpg: vi.fn(() => Promise.resolve([])),
  refreshChannelEpg: vi.fn(() => Promise.resolve([])),
}));

const PROXY = 'http://127.0.0.1:4000/token';

function channel(overrides: Partial<ChannelRecord> = {}): ChannelRecord {
  return {
    id: 7,
    source_id: 1,
    name: 'News One',
    group_name: 'News',
    logo: null,
    tvg_id: null,
    tvg_name: null,
    stream_url: 'http://provider.example/live/u/p/7.m3u8',
    media_kind: 'live',
    is_favorite: false,
    ...overrides,
  };
}

const started: Array<EngineStartArgs & { kind: string }> = [];

function lastCallbacks(): EngineCallbacks {
  const last = started.at(-1);
  if (!last) {
    throw new Error('no engine started');
  }
  return last.callbacks;
}

function renderPlayer(
  props: Partial<ComponentProps<typeof PlayerScreen>> = {}
) {
  const handlers = {
    onBack: vi.fn(),
    onSelectItem: vi.fn(),
    onOpenInMpv: vi.fn(() => Promise.resolve()),
  };
  const active = props.channel ?? channel();

  render(
    <TooltipProvider>
      <PlayerScreen
        channel={active}
        queue={[active]}
        proxyBaseUrl={PROXY}
        mpvAvailable
        epgEnabled={false}
        {...handlers}
        {...props}
      />
    </TooltipProvider>
  );

  return handlers;
}

describe('PlayerScreen', () => {
  beforeEach(() => {
    started.length = 0;
    for (const kind of ['hls', 'mpegts', 'native'] as const) {
      vi.mocked(ENGINE_FACTORIES[kind]).mockImplementation(async (args) => {
        started.push({ ...args, kind });
        return { kind, destroy: vi.fn() };
      });
    }
  });

  it('plays HLS channels through the stream proxy', async () => {
    renderPlayer();

    expect(
      screen.getByRole('heading', { name: 'News One' })
    ).toBeInTheDocument();
    expect(screen.getByText('LIVE')).toBeInTheDocument();

    await waitFor(() => expect(started).toHaveLength(1));
    expect(started[0]).toMatchObject({
      kind: 'hls',
      isLive: true,
      url: `${PROXY}/stream?url=${encodeURIComponent('http://provider.example/live/u/p/7.m3u8')}`,
    });
    expect(screen.getByText('Connecting to stream…')).toBeInTheDocument();
  });

  it('falls back from MPEG-TS to HLS for extensionless live streams', async () => {
    renderPlayer({
      channel: channel({ stream_url: 'http://provider.example:8080/u/p/7' }),
    });

    await waitFor(() => expect(started).toHaveLength(1));
    expect(started[0].kind).toBe('mpegts');

    act(() => {
      lastCallbacks().onFatal({ category: 'format', detail: 'not TS' });
    });

    await waitFor(() => expect(started).toHaveLength(2));
    expect(started[1].kind).toBe('hls');
  });

  it('offers MPV when the stream format is unsupported', async () => {
    const user = userEvent.setup();
    const { onOpenInMpv } = renderPlayer({
      channel: channel({
        media_kind: 'movie',
        stream_url: 'http://provider.example/movie/u/p/9.avi',
      }),
    });

    expect(
      await screen.findByText("The built-in player can't decode this stream")
    ).toBeInTheDocument();
    expect(started).toHaveLength(0);

    await user.click(
      within(screen.getByRole('alert')).getByRole('button', {
        name: 'Open in MPV',
      })
    );
    expect(onOpenInMpv).toHaveBeenCalledWith(null);
  });

  it('explains provider HTTP errors and retries on demand', async () => {
    const user = userEvent.setup();
    renderPlayer();
    await waitFor(() => expect(started).toHaveLength(1));

    act(() => {
      lastCallbacks().onFatal({
        category: 'http',
        detail: 'networkError: manifestLoadError',
        httpStatus: 403,
      });
    });

    expect(
      await screen.findByText('Provider refused the stream (HTTP 403)')
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(started).toHaveLength(2));
  });

  it('zaps through the channel queue with buttons and keys, wrapping around', async () => {
    const user = userEvent.setup();
    const first = channel({
      id: 1,
      name: 'One',
      stream_url: 'http://p/1.m3u8',
    });
    const second = channel({
      id: 2,
      name: 'Two',
      stream_url: 'http://p/2.m3u8',
    });
    const third = channel({
      id: 3,
      name: 'Three',
      stream_url: 'http://p/3.m3u8',
    });

    const { onSelectItem } = renderPlayer({
      channel: first,
      queue: [first, second, third],
    });

    await user.click(screen.getByRole('button', { name: 'Next channel' }));
    expect(onSelectItem).toHaveBeenLastCalledWith(second);

    await user.click(screen.getByRole('button', { name: 'Previous channel' }));
    expect(onSelectItem).toHaveBeenLastCalledWith(third);

    fireEvent.keyDown(window, { key: 'n' });
    expect(onSelectItem).toHaveBeenLastCalledWith(second);
    expect(screen.getByText('1 of 3', { exact: false })).toBeInTheDocument();
  });

  it('zaps past duplicate stream URLs listed in several groups', () => {
    const first = channel({
      id: 1,
      name: 'BBC (UK)',
      stream_url: 'http://p/bbc',
    });
    const duplicate = channel({
      id: 2,
      name: 'BBC (News)',
      stream_url: 'http://p/bbc',
    });
    const next = channel({ id: 3, name: 'CNN', stream_url: 'http://p/cnn' });

    const { onSelectItem } = renderPlayer({
      channel: duplicate,
      queue: [first, duplicate, next],
    });

    fireEvent.keyDown(window, { key: 'PageDown' });
    expect(onSelectItem).toHaveBeenLastCalledWith(next);
  });

  it('leaves the player on Escape', () => {
    const { onBack } = renderPlayer();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onBack).toHaveBeenCalled();
  });

  it('counts down to the next episode when an episode ends', async () => {
    const episode = (number: number) =>
      channel({
        id: 50,
        media_kind: 'series',
        name: `S01E0${number} · Episode ${number}`,
        group_name: 'Show',
        stream_url: `http://p/series/u/p/${number}.mp4`,
      });
    const first = episode(1);
    const second = episode(2);
    const { onSelectItem } = renderPlayer({
      channel: first,
      queue: [first, second],
    });
    await waitFor(() => expect(started).toHaveLength(1));

    const video = document.querySelector('video');
    expect(video).not.toBeNull();
    Object.defineProperty(video, 'ended', { configurable: true, value: true });
    act(() => {
      video?.dispatchEvent(new Event('ended'));
    });

    expect(await screen.findByText('Up next in 10s')).toBeInTheDocument();
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Play now' }));
    expect(onSelectItem).toHaveBeenCalledWith(second);
  });
});
