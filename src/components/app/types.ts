export type SourceRecord = {
  id: number;
  source_type: string;
  name: string;
  config: Record<string, unknown>;
  created_at: number;
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
  is_favorite: boolean;
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

export type Phase1Settings = {
  hardware_decode: boolean;
  buffering_preset: 'normal';
  startup_behavior: 'home' | 'resume_last';
};

export type BackendEvent = {
  event: string;
  payload: Record<string, unknown>;
  ts: number;
};

export type M3uImportResult = {
  source_id: number;
  imported_channels: number;
};

export const ALL_GROUPS = '__all__';

export const DEFAULT_SETTINGS: Phase1Settings = {
  hardware_decode: true,
  buffering_preset: 'normal',
  startup_behavior: 'home',
};
