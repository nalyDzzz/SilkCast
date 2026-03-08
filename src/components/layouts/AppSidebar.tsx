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
import { useState } from 'react';

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
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { logout, refreshSource, selectedSourceId } = useAppStore(
    useShallow((state) => ({
      logout: state.logout,
      refreshSource: state.refreshSource,
      selectedSourceId: state.selectedSourceId,
    }))
  );

  const handleLogout = () => {
    logout();
    navigate('/', { replace: true });
  };

  const handleRefreshSource = async () => {
    if (selectedSourceId === null || isRefreshing) {
      return;
    }

    const mediaKind = location.pathname.startsWith('/dashboard/movies')
      ? 'movie'
      : location.pathname.startsWith('/dashboard/series')
        ? 'series'
        : 'live';

    setIsRefreshing(true);
    try {
      await refreshSource(selectedSourceId, mediaKind);
    } finally {
      setIsRefreshing(false);
    }
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
                disabled={selectedSourceId === null || isRefreshing}
                onClick={() => void handleRefreshSource()}
              >
                <RefreshCw
                  className={isRefreshing ? 'animate-spin' : undefined}
                />
                <span>{isRefreshing ? 'Refreshing...' : 'Refresh Source'}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild className="cursor-pointer">
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
