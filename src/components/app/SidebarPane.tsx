import { FormEvent } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { ALL_GROUPS } from './types';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card.tsx';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '@/components/ui/item.tsx';

export function SidebarPane() {
  const {
    loading,
    m3uName,
    m3uLocation,
    importMessage,
    sources,
    selectedSourceId,
    groups,
    selectedGroup,
    selectedSourceExists,
    setM3uName,
    setM3uLocation,
    setSelectedSourceId,
    setSelectedGroup,
    refreshEverything,
    addM3uSource,
    refreshSource,
    deleteSource,
  } = useAppStore(
    useShallow((state) => ({
      loading: state.loading,
      m3uName: state.m3uName,
      m3uLocation: state.m3uLocation,
      importMessage: state.importMessage,
      sources: state.sources,
      selectedSourceId: state.selectedSourceId,
      groups: state.groups,
      selectedGroup: state.selectedGroup,
      selectedSourceExists: state.selectedSourceId !== null,
      setM3uName: state.setM3uName,
      setM3uLocation: state.setM3uLocation,
      setSelectedSourceId: state.setSelectedSourceId,
      setSelectedGroup: state.setSelectedGroup,
      refreshEverything: state.refreshEverything,
      addM3uSource: state.addM3uSource,
      refreshSource: state.refreshSource,
      deleteSource: state.deleteSource,
    }))
  );

  const totalGroupChannels = groups.reduce(
    (sum, group) => sum + group.channel_count,
    0
  );

  const handleImportSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void addM3uSource(m3uName, m3uLocation);
  };

  return (
    <aside className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>OpenTV v0.1</CardTitle>
          <CardDescription>M3U MVP</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            className="w-full cursor-pointer"
            onClick={() => void refreshEverything()}
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh All'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Import M3U</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleImportSubmit} className="flex flex-col gap-3">
            <Input
              value={m3uName}
              onChange={(e) => setM3uName(e.currentTarget.value)}
              placeholder="Playlist name"
              required
            />
            <Input
              value={m3uLocation}
              onChange={(e) => setM3uLocation(e.currentTarget.value)}
              placeholder="https://... or /path/to/file.m3u"
              required
            />
            <Button type="submit">Import Playlist</Button>
          </form>
        </CardContent>
        <CardFooter>
          {importMessage ? (
            <p className="text-green-500">{importMessage}</p>
          ) : null}
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sources</CardTitle>
        </CardHeader>
        <CardContent>
          <ItemGroup className="gap-2">
            {sources.map((source) => (
              <Item
                key={source.id}
                variant={
                  selectedSourceId === source.id
                    ? 'outline-selected'
                    : 'outline'
                }
                size="sm"
              >
                <ItemContent
                  onClick={() => {
                    setSelectedSourceId(source.id);
                    setSelectedGroup(ALL_GROUPS);
                  }}
                  className="cursor-pointer"
                >
                  <ItemTitle>{source.name}</ItemTitle>
                  <ItemDescription>{source.source_type}</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button
                    size="icon-sm"
                    type="button"
                    onClick={() => void refreshSource(source.id)}
                  >
                    <RefreshCw size={16} aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    onClick={() => {
                      const confirmed = window.confirm(
                        `Delete playlist "${source.name}"? This removes all its channels.`
                      );
                      if (!confirmed) {
                        return;
                      }
                      void deleteSource(source);
                    }}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </Button>
                </ItemActions>
              </Item>
            ))}
            {sources.length === 0 ? (
              <p className="text-muted-foreground">No sources yet.</p>
            ) : null}
          </ItemGroup>
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
