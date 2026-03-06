import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store/appStore.ts';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Heart } from 'lucide-react';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Checkbox } from '@/components/ui/checkbox.tsx';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field.tsx';

export function ChannelsPane() {
  const navigate = useNavigate();
  const location = useLocation();

  const {
    sources,
    selectedSourceId,
    searchQuery,
    favoritesOnly,
    settings,
    channels,
    selectedSourceExists,
    setSearchQuery,
    setFavoritesOnly,
    playChannel,
    toggleFavorite,
  } = useAppStore(
    useShallow((state) => ({
      sources: state.sources,
      selectedSourceId: state.selectedSourceId,
      searchQuery: state.searchQuery,
      favoritesOnly: state.favoritesOnly,
      settings: state.settings,
      channels: state.channels,
      selectedSourceExists: state.selectedSourceId !== null,
      setSearchQuery: state.setSearchQuery,
      setFavoritesOnly: state.setFavoritesOnly,
      playChannel: state.playChannel,
      toggleFavorite: state.toggleFavorite,
    }))
  );

  const selectedSource = useMemo(
    () => sources.find((source) => source.id === selectedSourceId) ?? null,
    [sources, selectedSourceId]
  );

  const handlePlayChannel = async (channelId: number) => {
    await playChannel(channelId);
    if (settings.preferred_player === 'web') {
      navigate('/dashboard/player', {
        state: {
          returnTo: location.pathname,
        },
      });
    }
  };

  return (
    <section className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Channels</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.currentTarget.value)}
            placeholder="Search channels"
            disabled={!selectedSourceExists}
          />
          <FieldGroup className="mx-auto w-56">
            <Field orientation="horizontal">
              <Checkbox
                id="favorites-only"
                name="favorites-only"
                checked={favoritesOnly}
                onCheckedChange={(e) => setFavoritesOnly(e === true)}
              />
              <FieldLabel htmlFor="favorites-only">Favorites only</FieldLabel>
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter>
          <p className="text-muted-foreground">
            {selectedSource
              ? `${selectedSource.name} - ${channels.length} channels`
              : 'Select or import a source'}
          </p>
        </CardFooter>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-2">
          {channels.map((channel) => (
            <Item key={channel.id} variant="outline">
              <ItemMedia>
                {channel.logo ? (
                  <img
                    src={channel.logo}
                    alt=""
                    className="h-8 w-8 rounded object-cover"
                    loading="lazy"
                  />
                ) : null}
              </ItemMedia>
              <ItemContent
                className="cursor-pointer"
                onClick={() => void handlePlayChannel(channel.id)}
              >
                <ItemTitle>{channel.name}</ItemTitle>
                <ItemDescription>{channel.group_name}</ItemDescription>
              </ItemContent>
              <ItemActions>
                <Button
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                  className="group cursor-pointer hover:text-red-500"
                  data-is-favorite={channel.is_favorite}
                  onClick={() => void toggleFavorite(channel)}
                >
                  <Heart className="group-data-[is-favorite=true]:fill-red-500 group-data-[is-favorite=true]:text-red-500" />
                </Button>
              </ItemActions>
            </Item>
          ))}
          {selectedSourceExists && channels.length === 0 ? (
            <p className="text-muted-foreground">
              No channels match your filters.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}

(ChannelsPane as any).whyDidYouRender = true;
