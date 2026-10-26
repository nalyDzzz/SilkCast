import type { EngineKind } from '@/lib/player/streamSource';
import { startHlsEngine } from './hlsEngine';
import { startMpegtsEngine } from './mpegtsEngine';
import { startNativeEngine } from './nativeEngine';
import type { EngineFactory } from './types';

export const ENGINE_FACTORIES: Record<EngineKind, EngineFactory> = {
  hls: startHlsEngine,
  mpegts: startMpegtsEngine,
  native: startNativeEngine,
};

export const ENGINE_LABELS: Record<EngineKind, string> = {
  hls: 'HLS',
  mpegts: 'MPEG-TS',
  native: 'Direct',
};
