import { createHashRouter } from 'react-router';
import { AppLayout } from '@/components/layouts/AppLayout';
import { RootLayout } from '@/components/layouts/RootLayout';
import { DashboardHomePage } from '@/pages/DashboardHomePage';
import { HelpPage } from '@/pages/HelpPage';
import { HomePage } from '@/pages/HomePage';
import { LivePage } from '@/pages/LivePage';
import { MoviesPage } from '@/pages/MoviesPage';
import { PlayerPage } from '@/pages/PlayerPage';
import { RecentsPage } from '@/pages/RecentsPage';
import { RouteErrorPage } from '@/pages/RouteErrorPage';
import { SeriesPage } from '@/pages/SeriesPage';
import { SettingsPage } from '@/pages/SettingsPage.tsx';

export const appRouter = createHashRouter([
  {
    element: <RootLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        path: '/',
        element: <HomePage />,
      },
      {
        // Full-window player, rendered outside the sidebar layout.
        path: '/dashboard/player',
        element: <PlayerPage />,
      },
      {
        path: '/dashboard',
        element: <AppLayout />,
        children: [
          {
            index: true,
            element: <DashboardHomePage />,
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
            path: 'recents',
            element: <RecentsPage />,
          },
          {
            path: 'settings',
            element: <SettingsPage />,
          },
          {
            path: 'help',
            element: <HelpPage />,
          },
        ],
      },
    ],
  },
]);
