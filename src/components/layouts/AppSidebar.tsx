import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import {
  CircleHelp,
  Clock,
  Film,
  Home,
  LogOut,
  RefreshCw,
  Settings,
  Tv,
  TvMinimal,
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useAppStore } from '@/store/appStore.ts';
import { useShallow } from 'zustand/react/shallow';
import { useEffect, useMemo, useState } from 'react';
import { type BackendEvent } from '@/components/app/types';
import { refreshSourceEpg } from '@/lib/api/epgApi';
import { useBackendEvents } from '@/hooks/useBackendEvents';

const data = {
  navMain: [
    {
      title: 'Home',
      href: '/dashboard',
      icon: Home,
    },
    {
      title: 'Live TV',
      href: '/dashboard/live',
      icon: Tv,
    },
    {
      title: 'Movies',
      href: '/dashboard/movies',
      icon: Film,
    },
    {
      title: 'Series',
      href: '/dashboard/series',
      icon: TvMinimal,
    },
    {
      title: 'Recents',
      href: '/dashboard/recents',
      icon: Clock,
    },
  ],
};

export function AppSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isRefreshingSource, setIsRefreshingSource] = useState(false);
  const [isRefreshingEpg, setIsRefreshingEpg] = useState(false);

  const { logout, refreshSource, selectedSourceId, sources } = useAppStore(
    useShallow((state) => ({
      logout: state.logout,
      refreshSource: state.refreshSource,
      selectedSourceId: state.selectedSourceId,
      sources: state.sources,
    }))
  );

  const selectedSource = useMemo(
    () => sources.find((source) => source.id === selectedSourceId) ?? null,
    [selectedSourceId, sources]
  );

  const isLiveRoute = location.pathname.startsWith('/dashboard/live');
  const canRefreshEpg =
    selectedSourceId !== null &&
    selectedSource?.source_type === 'xtream' &&
    isLiveRoute &&
    !isRefreshingEpg;

  useEffect(() => {
    if (selectedSourceId === null) {
      setIsRefreshingEpg(false);
    }
  }, [selectedSourceId]);

  useBackendEvents(
    (backendEvent: BackendEvent) => {
      if (backendEvent.event !== 'epg_updated') {
        return;
      }

      const payloadSourceId = backendEvent.payload['source_id'];
      if (
        typeof payloadSourceId === 'number' &&
        selectedSourceId !== null &&
        payloadSourceId === selectedSourceId
      ) {
        setIsRefreshingEpg(false);
      }
    },
    () => setIsRefreshingEpg(false)
  );

  const handleLogout = () => {
    logout();
    navigate('/', { replace: true });
  };

  const handleRefreshSource = async () => {
    if (selectedSourceId === null || isRefreshingSource) {
      return;
    }

    const mediaKind = location.pathname.startsWith('/dashboard/movies')
      ? 'movie'
      : location.pathname.startsWith('/dashboard/series')
        ? 'series'
        : 'live';

    setIsRefreshingSource(true);
    try {
      await refreshSource(selectedSourceId, mediaKind);
    } finally {
      setIsRefreshingSource(false);
    }
  };

  const handleRefreshEpg = () => {
    if (!canRefreshEpg || selectedSourceId === null) {
      return;
    }

    setIsRefreshingEpg(true);
    void refreshSourceEpg(selectedSourceId, 2).catch(() => {
      setIsRefreshingEpg(false);
    });
  };

  return (
    <Sidebar
      collapsible="icon"
      className="top-(--header-height) h-[calc(100svh-var(--header-height))]!"
    >
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {data.navMain.map((i) => (
              <SidebarMenuItem key={i.title}>
                <SidebarMenuButton
                  asChild
                  size="lg"
                  isActive={location.pathname === i.href}
                  className="cursor-pointer [&>svg]:size-6!"
                >
                  <Link to={i.href}>
                    {i.icon && <i.icon />}
                    <span>{i.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup />
      </SidebarContent>
      <SidebarFooter>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                className="cursor-pointer"
                disabled={!canRefreshEpg}
                onClick={() => void handleRefreshEpg()}
              >
                <RefreshCw
                  className={isRefreshingEpg ? 'animate-spin' : undefined}
                />
                <span>{isRefreshingEpg ? 'Refreshing EPG...' : 'Refresh EPG'}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                className="cursor-pointer"
                disabled={selectedSourceId === null || isRefreshingSource}
                onClick={() => void handleRefreshSource()}
              >
                <RefreshCw
                  className={isRefreshingSource ? 'animate-spin' : undefined}
                />
                <span>
                  {isRefreshingSource ? 'Refreshing...' : 'Refresh Source'}
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                className="cursor-pointer"
                isActive={location.pathname === '/dashboard/help'}
              >
                <Link to={'/dashboard/help'}>
                  <CircleHelp />
                  <span>Guide</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                className="cursor-pointer"
                isActive={location.pathname === '/dashboard/settings'}
              >
                <Link to={'/dashboard/settings'}>
                  <Settings />
                  <span>Settings</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                className="cursor-pointer"
                onClick={handleLogout}
              >
                <div>
                  <LogOut />
                  <span>Switch Source</span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarFooter>
    </Sidebar>
  );
}
