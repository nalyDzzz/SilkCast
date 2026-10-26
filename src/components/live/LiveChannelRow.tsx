import { memo } from 'react';
import { Heart, Play, Tv } from 'lucide-react';
import { ChannelRecord } from '@/components/app/types';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item';
import { Button } from '@/components/ui/button';

type LiveChannelRowProps = {
  channel: ChannelRecord;
  epgNowTitle?: string | null;
  isActive: boolean;
  isPlaying: boolean;
  onPlay: (channel: ChannelRecord) => void;
  onToggleFavorite: (channel: ChannelRecord) => void;
};

export const LiveChannelRow = memo(function LiveChannelRow({
  channel,
  epgNowTitle,
  isActive,
  isPlaying,
  onPlay,
  onToggleFavorite,
}: LiveChannelRowProps) {
  const favoriteLabel = channel.is_favorite
    ? `Remove ${channel.name} from favorites`
    : `Add ${channel.name} to favorites`;

  return (
    <Item
      variant={isActive ? 'outline-selected' : 'outline'}
      className="gap-3 rounded-lg bg-card/85 px-3 py-2 transition-colors hover:bg-accent/60 sm:flex-nowrap"
    >
      <ItemMedia
        variant={channel.logo ? 'image' : 'icon'}
        className={
          channel.logo
            ? 'size-11 rounded-md border bg-muted/30 [&_img]:object-contain'
            : 'size-11 rounded-md border bg-muted/40 text-muted-foreground'
        }
      >
        {channel.logo ? (
          <img src={channel.logo} alt="" loading="lazy" />
        ) : (
          <Tv size={16} aria-hidden="true" />
        )}
      </ItemMedia>

      <ItemContent
        className="min-w-0 cursor-pointer"
        onClick={() => onPlay(channel)}
      >
        <ItemTitle className="w-full min-w-0">
          <span className="truncate">{channel.name}</span>
        </ItemTitle>
        <ItemDescription className="truncate">
          {epgNowTitle ? (
            <span className="text-emerald-600 dark:text-emerald-400">
              Now: {epgNowTitle}
            </span>
          ) : (
            channel.group_name || 'Ungrouped'
          )}
        </ItemDescription>
      </ItemContent>

      <ItemActions className="ml-auto">
        <Button
          type="button"
          size="sm"
          variant={isActive ? 'secondary' : 'outline'}
          disabled={isPlaying}
          onClick={() => onPlay(channel)}
        >
          <Play size={14} />
          {isPlaying ? 'Opening...' : isActive ? 'Playing' : 'Play'}
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="group hover:text-red-500"
          data-is-favorite={channel.is_favorite}
          aria-label={favoriteLabel}
          onClick={() => onToggleFavorite(channel)}
        >
          <Heart className="group-data-[is-favorite=true]:fill-red-500 group-data-[is-favorite=true]:text-red-500" />
        </Button>
      </ItemActions>
    </Item>
  );
});
