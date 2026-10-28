import { type UIEvent, useState } from 'react';
import { Outlet, useMatch } from 'react-router';
import { CommandPalette } from '@/components/command/CommandPalette';
import { TopBar } from '@/components/layouts/TopBar';
import { useGuideAutoRefresh, useGuideRefreshEvents } from '@/components/sources/useSourceActions';

/** Scroll distance after which the floating top bar turns solid. */
const SOLID_AFTER_PX = 24;

export function AppLayout() {
  useGuideRefreshEvents();
  useGuideAutoRefresh();
  // Home's hero runs under a transparent top bar.
  const isHome = useMatch({ path: '/dashboard', end: true }) !== null;
  const [scrolled, setScrolled] = useState(false);

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const next = event.currentTarget.scrollTop > SOLID_AFTER_PX;
    if (next !== scrolled) setScrolled(next);
  };

  return (
    <div className="relative flex h-screen flex-col overflow-hidden">
      <TopBar overlay={isHome} solid={!isHome || scrolled} />
      <div
        key={isHome ? 'home' : 'page'}
        onScroll={isHome ? handleScroll : undefined}
        className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto"
      >
        <Outlet />
      </div>
      <CommandPalette />
    </div>
  );
}
