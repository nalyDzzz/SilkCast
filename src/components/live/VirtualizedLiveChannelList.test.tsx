import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ChannelRecord } from '@/components/app/types';
import { VirtualizedLiveChannelList } from '@/components/live/VirtualizedLiveChannelList';

function buildChannels(count: number): ChannelRecord[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    source_id: 1,
    name: `Channel ${index}`,
    group_name: 'News',
    logo: null,
    tvg_id: null,
    tvg_name: null,
    stream_url: `https://provider.example/live/${index}.m3u8`,
    media_kind: 'live' as const,
    is_favorite: false,
  }));
}

const clientHeightDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'clientHeight'
);

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => 400,
  });
});

afterAll(() => {
  if (clientHeightDescriptor) {
    Object.defineProperty(
      HTMLElement.prototype,
      'clientHeight',
      clientHeightDescriptor
    );
    return;
  }

  delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight;
});

describe('VirtualizedLiveChannelList', () => {
  it('renders only a subset of channels for large lists', async () => {
    render(
      <VirtualizedLiveChannelList
        channels={buildChannels(500)}
        activeChannelId={null}
        playingChannelId={null}
        onPlay={vi.fn()}
        onToggleFavorite={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Channel 0')).toBeInTheDocument();
    });

    expect(screen.queryByText('Channel 250')).not.toBeInTheDocument();
    expect(screen.queryByText('Channel 499')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Play' }).length).toBeLessThan(
      40
    );
  });

  it('shifts rendered rows when scrolled', async () => {
    const { container } = render(
      <VirtualizedLiveChannelList
        channels={buildChannels(500)}
        activeChannelId={null}
        playingChannelId={null}
        onPlay={vi.fn()}
        onToggleFavorite={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Channel 0')).toBeInTheDocument();
    });

    const scrollContainer = container.firstElementChild as HTMLDivElement | null;
    expect(scrollContainer).not.toBeNull();
    if (!scrollContainer) {
      return;
    }

    scrollContainer.scrollTop = 50000;
    fireEvent.scroll(scrollContainer);

    await waitFor(() => {
      expect(screen.getByText('Channel 499')).toBeInTheDocument();
    });
    expect(screen.queryByText('Channel 0')).not.toBeInTheDocument();
  });
});
