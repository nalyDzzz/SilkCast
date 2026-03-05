import { Outlet } from 'react-router';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar.tsx';
import { AppSidebar } from '@/components/layouts/AppSidebar.tsx';

export function AppLayout() {
  return (
    <div className="[--header-height:calc(--spacing(12))] h-screen overflow-hidden">
      <SidebarProvider className="flex h-full min-h-0 flex-col overflow-hidden">
        <header className="sticky top-0 z-50 flex w-full items-center border-b bg-background">
          <div className="flex h-(--header-height) w-full items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1 [&>svg]:size-5! size-10!" />
          </div>
        </header>
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <AppSidebar />
          <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
            <Outlet />
          </div>
        </div>
      </SidebarProvider>
    </div>
  );
}
