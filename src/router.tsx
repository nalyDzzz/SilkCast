import { createHashRouter, Navigate } from 'react-router';
import { AppLayout } from '@/components/layouts/AppLayout';
import { HomePage } from '@/pages/HomePage';
import { LivePage } from '@/pages/LivePage';
import { MoviesPage } from '@/pages/MoviesPage';
import { PlayerPage } from '@/pages/PlayerPage';
import { RouteErrorPage } from '@/pages/RouteErrorPage';
import { SeriesPage } from '@/pages/SeriesPage';
import { SettingsPage } from '@/pages/SettingsPage.tsx';

export const appRouter = createHashRouter([
  {
    path: '/',
    element: <HomePage />,
    errorElement: <RouteErrorPage />,
  },
  {
    path: '/dashboard',
    element: <AppLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        index: true,
        element: <Navigate to="live" replace />,
      },
      {
        path: 'live',
        element: <LivePage />,
      },
      {
        path: 'player',
        element: <PlayerPage />,
      },
      {
        path: 'movies',
        element: <MoviesPage />,
      },
      {
        path: 'series',
        element: <SeriesPage />,
      },
      {
        path: 'settings',
        element: <SettingsPage />,
      },
    ],
  },
]);
