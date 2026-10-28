export type SourceRecord = {
  id: number;
  source_type: string;
  name: string;
  config: Record<string, unknown>;
  created_at: number;
  /** Xtream sources, and playlists with a configured or advertised guide URL. */
  supports_guide: boolean;
  /** Last successful guide refresh (unix seconds). */
  guide_refreshed_at: number | null;
  /** End of the last stored programme (unix seconds). */
  guide_covered_until: number | null;
  /** Why the last guide refresh failed, if it did. */
  guide_error: string | null;
  guide_attempted_at: number | null;
};

export type GroupRecord = {
  name: string;
  channel_count: number;
};

export type ChannelRecord = {
  id: number;
  source_id: number;
  name: string;
  group_name: string;
  logo: string | null;
  tvg_id: string | null;
  tvg_name: string | null;
  stream_url: string;
  media_kind: 'live' | 'movie' | 'series';
  is_favorite: boolean;
};

export type SeriesEpisodeRecord = {
  episode_id: string;
  season_number: number;
  episode_number: number;
  title: string;
  stream_url: string;
};

export type LiveEpgEntryRecord = {
  title: string;
  description: string | null;
  start: string | null;
  end: string | null;
  start_timestamp: number | null;
  end_timestamp: number | null;
};

/** Stored programmes for one channel, as returned by a batched guide read. */
export type ChannelEpgRecord = {
  channel_id: number;
  entries: LiveEpgEntryRecord[];
};

export type RecentChannelRecord = {
  channel: ChannelRecord;
  played_at: number;
};

export type PlaybackStatus = {
  state: string;
  attached_hwnd: number | null;
  embedded_surface_hwnd: number | null;
  current_url: string | null;
  backend: string;
  last_error: string | null;
  volume: number;
  fullscreen: boolean;
  render_mode: 'external_window' | 'embedded_surface';
};

export type PlayerEnvironment = {
  stream_proxy_base_url: string | null;
  mpv_available: boolean;
};

export type Phase1Settings = {
  hardware_decode: boolean;
  buffering_preset: 'normal';
  startup_behavior: 'home' | 'resume_last';
  preferred_player: 'web' | 'mpv';
};

export type BackendEvent = {
  event: string;
  payload: Record<string, unknown>;
  ts: number;
};

export type SourceImportResult = {
  source_id: number;
  imported_channels: number;
};

export type GuideRefreshStarted = {
  source_id: number;
  /** False when a refresh of this source was already running. */
  started: boolean;
};

/** Payload of the `epg_progress` event while a guide refreshes. */
export type GuideProgress = {
  source_id: number;
  phase: 'downloading' | 'saving' | 'fetching';
  bytes: number;
  total_bytes: number | null;
  programmes: number;
  channels_done: number;
  channels_total: number;
};

export const ALL_GROUPS = '__all__';

export const DEFAULT_SETTINGS: Phase1Settings = {
  hardware_decode: true,
  buffering_preset: 'normal',
  startup_behavior: 'home',
  preferred_player: 'web',
};
