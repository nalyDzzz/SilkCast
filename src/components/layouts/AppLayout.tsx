import { Link, Outlet } from 'react-router';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar.tsx';
import { AppSidebar } from '@/components/layouts/AppSidebar.tsx';
import { Separator } from '@/components/ui/separator';
import { useAppStore } from '@/store/appStore';

function ActiveSourceLabel() {
  const sourceName = useAppStore(
    (state) =>
      state.sources.find((source) => source.id === state.selectedSourceId)
        ?.name ?? null
  );

  if (!sourceName) {
    return null;
  }

  return (
    <>
      <Separator orientation="vertical" className="mx-1 h-5!" />
      <Link
        to="/"
        className="truncate text-sm text-muted-foreground hover:text-foreground"
        title="Switch source"
      >
        {sourceName}
      </Link>
    </>
  );
}

export function AppLayout() {
  return (
    <div className="h-screen overflow-hidden [--header-height:calc(--spacing(12))]">
      <SidebarProvider className="flex h-full min-h-0 flex-col overflow-hidden">
        <header className="sticky top-0 z-50 flex w-full items-center border-b bg-background">
          <div className="flex h-(--header-height) w-full min-w-0 items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1 size-10! [&>svg]:size-5!" />
            <span className="font-semibold tracking-tight">SilkCast</span>
            <ActiveSourceLabel />
          </div>
        </header>
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <AppSidebar />
          <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
            <Outlet />
          </div>
        </div>
      </SidebarProvider>
    </div>
  );
}
