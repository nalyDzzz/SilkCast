import { Outlet } from 'react-router';
import { useAppBootstrap } from '@/components/layouts/useAppBootstrap';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';

export function RootLayout() {
  useAppBootstrap();

  return (
    <TooltipProvider delayDuration={300}>
      <Outlet />
      <Toaster position="bottom-right" closeButton />
    </TooltipProvider>
  );
}
