import { tauriInvoke } from "../tauriClient";
import { ChannelRecord } from "../../components/app/types";

type ListSourceChannelsArgs = {
  sourceId: number;
  groupName: string | null;
  query: string | null;
  favoritesOnly: boolean;
};

export function listSourceChannels(args: ListSourceChannelsArgs) {
  return tauriInvoke<ChannelRecord[]>("list_source_channels", args);
}

export function setChannelFavoriteState(channelId: number, favorite: boolean) {
  return tauriInvoke<void>("set_channel_favorite_state", { channelId, favorite });
}
