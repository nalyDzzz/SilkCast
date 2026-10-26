import { Outlet } from 'react-router';
import { useAppBootstrap } from '@/components/layouts/useAppBootstrap';
import { useCatalogInvalidation } from '@/components/layouts/useCatalogInvalidation';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';

export function RootLayout() {
  useAppBootstrap();
  useCatalogInvalidation();

  return (
    <TooltipProvider delayDuration={300}>
      <Outlet />
      <Toaster position="bottom-right" closeButton />
    </TooltipProvider>
  );
}
