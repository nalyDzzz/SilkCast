import { tauriInvoke } from '../tauriClient';
import { PlaybackStatus } from '../../components/app/types';

type EmbeddedBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function playChannel(channelId: number) {
  return tauriInvoke<void>('play_channel', { channelId });
}

export function recordRecentChannelPlay(channelId: number) {
  return tauriInvoke<void>('record_recent_channel_play', { channelId });
}

export function getPlaybackState() {
  return tauriInvoke<PlaybackStatus>('playback_state');
}

export function pausePlayback(paused: boolean) {
  return tauriInvoke<void>('playback_pause', { paused });
}

export function stopPlayback() {
  return tauriInvoke<void>('playback_stop');
}

export function setFullscreen(fullscreen: boolean) {
  return tauriInvoke<void>('playback_set_fullscreen', { fullscreen });
}

export function setVolume(volume: number) {
  return tauriInvoke<void>('playback_set_volume', { volume });
}

export function seekPlayback(seconds: number) {
  return tauriInvoke<void>('playback_seek', { seconds });
}

export function openExternalWindow(url: string) {
  return tauriInvoke<void>('playback_open_external_window', { url });
}

export function startEmbeddedSurfaceMode(bounds: EmbeddedBounds) {
  return tauriInvoke<number>('playback_start_embedded_surface_mode', {
    bounds,
  });
}

export function updateEmbeddedSurfaceBounds(bounds: EmbeddedBounds) {
  return tauriInvoke<void>('playback_update_embedded_surface_bounds', {
    bounds,
  });
}
