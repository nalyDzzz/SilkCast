import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Film, Home, LogOut, Settings, Tv, TvMinimal } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useAppStore } from '@/store/appStore.ts';
import { useShallow } from 'zustand/react/shallow';

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
  ],
};

export function AppSidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const { logout } = useAppStore(
    useShallow((state) => ({
      logout: state.logout,
    }))
  );

  const handleLogout = () => {
    logout();
    navigate('/', { replace: true });
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
                  <span>Switch Playlist</span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarFooter>
    </Sidebar>
  );
}
