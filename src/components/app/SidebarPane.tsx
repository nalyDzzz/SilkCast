import { LogOut, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useAppStore } from '@/store/appStore';
import { ALL_GROUPS } from './types';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/button.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card.tsx';
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '@/components/ui/item.tsx';

export function SidebarPane() {
  const navigate = useNavigate();

  const {
    loading,
    groups,
    selectedGroup,
    selectedSourceExists,
    logout,
    setSelectedGroup,
    refreshEverything,
  } = useAppStore(
    useShallow((state) => ({
      loading: state.loading,
      groups: state.groups,
      selectedGroup: state.selectedGroup,
      selectedSourceExists: state.selectedSourceId !== null,
      logout: state.logout,
      setSelectedGroup: state.setSelectedGroup,
      refreshEverything: state.refreshEverything,
    }))
  );

  const totalGroupChannels = groups.reduce(
    (sum, group) => sum + group.channel_count,
    0
  );

  const handleLogout = () => {
    logout();
    navigate('/', { replace: true });
  };

  return (
    <aside className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>OpenTV v0.1</CardTitle>
          <CardDescription>M3U MVP</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2">
            <Button
              className="w-full cursor-pointer"
              onClick={() => void refreshEverything()}
              disabled={loading}
            >
              <RefreshCw size={16} aria-hidden="true" />
              {loading ? 'Refreshing...' : 'Refresh All'}
            </Button>
            <Button
              className="w-full cursor-pointer"
              variant="outline"
              type="button"
              onClick={handleLogout}
            >
              <LogOut size={16} aria-hidden="true" />
              Log Out
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Channels</CardTitle>
        </CardHeader>
        <CardContent>
          <ItemGroup className="gap-2">
            <Item
              variant={
                selectedGroup === ALL_GROUPS ? 'outline-selected' : 'outline'
              }
              size="sm"
            >
              <ItemContent
                className="cursor-pointer"
                onClick={() => setSelectedGroup(ALL_GROUPS)}
              >
                <ItemTitle>All Channels</ItemTitle>
                <ItemDescription>{totalGroupChannels}</ItemDescription>
              </ItemContent>
            </Item>
            {groups.map((group) => (
              <Item
                key={group.name}
                variant={
                  selectedGroup === group.name ? 'outline-selected' : 'outline'
                }
                size="sm"
                onClick={() => setSelectedGroup(group.name)}
              >
                <ItemContent className="cursor-pointer">
                  <ItemTitle>{group.name}</ItemTitle>
                  <ItemDescription>{group.channel_count}</ItemDescription>
                </ItemContent>
              </Item>
            ))}
            {selectedSourceExists && groups.length === 0 ? (
              <p className="text-muted-foreground">
                No groups for this source.
              </p>
            ) : null}
          </ItemGroup>
        </CardContent>
      </Card>
    </aside>
  );
}

(SidebarPane as any).whyDidYouRender = true;
