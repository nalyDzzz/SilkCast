import { Navigate, createHashRouter } from 'react-router';
import { AppLayout } from '@/components/layouts/AppLayout';
import { DashboardPage } from '@/pages/DashboardPage';
import { LibraryPage } from '@/pages/LibraryPage';
import { RouteErrorPage } from '@/pages/RouteErrorPage';

export const appRouter = createHashRouter([
  {
    element: <AppLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        path: '/',
        element: <DashboardPage />,
      },
      {
        path: '/library',
        element: <LibraryPage />,
      },
      {
        path: '*',
        element: <Navigate to="/" replace />,
      },
    ],
  },
]);
