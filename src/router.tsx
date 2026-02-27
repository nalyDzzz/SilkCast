import { createHashRouter } from 'react-router';
import { AppLayout } from '@/components/layouts/AppLayout';
import { DashboardPage } from '@/pages/DashboardPage';
import { HomePage } from '@/pages/HomePage';
import { LivePage } from '@/pages/LivePage';
import { MoviesPage } from '@/pages/MoviesPage';
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
        element: <DashboardPage />,
      },
      {
        path: 'live',
        element: <LivePage />,
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
