import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { VirtualizedMovieGrid } from '@/components/movies/VirtualizedMovieGrid';

type MovieItem = {
  id: number;
  label: string;
};

const clientHeightDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'clientHeight'
);
const clientWidthDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'clientWidth'
);

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => 500,
  });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => 1200,
  });
});

afterAll(() => {
  if (clientHeightDescriptor) {
    Object.defineProperty(
      HTMLElement.prototype,
      'clientHeight',
      clientHeightDescriptor
    );
  } else {
    delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight;
  }

  if (clientWidthDescriptor) {
    Object.defineProperty(
      HTMLElement.prototype,
      'clientWidth',
      clientWidthDescriptor
    );
  } else {
    delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
  }
});

function buildMovies(count: number): MovieItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    label: `Movie ${index}`,
  }));
}

describe('VirtualizedMovieGrid', () => {
  it('renders only a subset of movies for large grids', async () => {
    render(
      <VirtualizedMovieGrid
        items={buildMovies(1000)}
        getItemKey={(item) => item.id}
        renderItem={(item) => <div>{item.label}</div>}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Movie 0')).toBeInTheDocument();
    });

    expect(screen.queryByText('Movie 600')).not.toBeInTheDocument();
    expect(screen.getAllByText(/Movie \d+/).length).toBeLessThan(80);
  });

  it('updates rendered rows when scrolling', async () => {
    const { container } = render(
      <VirtualizedMovieGrid
        items={buildMovies(1000)}
        getItemKey={(item) => item.id}
        renderItem={(item) => <div>{item.label}</div>}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Movie 0')).toBeInTheDocument();
    });

    const scrollContainer = container.firstElementChild as HTMLDivElement | null;
    expect(scrollContainer).not.toBeNull();
    if (!scrollContainer) {
      return;
    }

    scrollContainer.scrollTop = 200000;
    fireEvent.scroll(scrollContainer);

    await waitFor(() => {
      expect(screen.getByText('Movie 999')).toBeInTheDocument();
    });
    expect(screen.queryByText('Movie 0')).not.toBeInTheDocument();
  });
});
