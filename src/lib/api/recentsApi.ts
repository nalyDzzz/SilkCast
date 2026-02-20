import { tauriInvoke } from "../tauriClient";
import { RecentChannelRecord } from "../../components/app/types";

export function listRecentlyPlayed(limit = 20) {
  return tauriInvoke<RecentChannelRecord[]>("list_recently_played", { limit });
}
