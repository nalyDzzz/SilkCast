import { Outlet } from 'react-router';
import { CommandPalette } from '@/components/command/CommandPalette';
import { TopBar } from '@/components/layouts/TopBar';
import { useGuideRefreshEvents } from '@/components/sources/useSourceActions';

export function AppLayout() {
  useGuideRefreshEvents();

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar />
      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
        <Outlet />
      </div>
      <CommandPalette />
    </div>
  );
}
