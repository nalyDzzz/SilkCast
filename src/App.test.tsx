import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { useAppStore } from './store/appStore';

vi.mock('@/router', async () => {
  const { createMemoryRouter } = await import('react-router');

  return {
    appRouter: createMemoryRouter(
      [
        {
          path: '*',
          element: <div>Router Ready</div>,
        },
      ],
      {
        initialEntries: ['/'],
      }
    ),
  };
});

describe('App', () => {
  beforeEach(() => {
    useAppStore.getState().setTheme('light');
    document.documentElement.classList.remove('dark');
  });

  it('renders the configured router', () => {
    render(<App />);

    expect(screen.getByText('Router Ready')).toBeInTheDocument();
  });

  it('applies the dark theme class', async () => {
    useAppStore.getState().setTheme('dark');

    render(<App />);

    await waitFor(() => {
      expect(document.documentElement).toHaveClass('dark');
    });
  });
});
