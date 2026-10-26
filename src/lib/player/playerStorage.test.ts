import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearResumePosition,
  getResumeEntry,
  isResumable,
  readStoredVolume,
  saveResumePosition,
  writeStoredVolume,
} from '@/lib/player/playerStorage';

describe('playerStorage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('saves and reads resume positions', () => {
    saveResumePosition('movie:1', 600, 5400, 1000);
    expect(getResumeEntry('movie:1')).toEqual({
      position: 600,
      duration: 5400,
      updatedAt: 1000,
    });
  });

  it('clears the entry when the viewer finished or barely started', () => {
    saveResumePosition('movie:1', 600, 5400);
    saveResumePosition('movie:1', 5380, 5400);
    expect(getResumeEntry('movie:1')).toBeNull();

    saveResumePosition('movie:2', 10, 5400);
    expect(getResumeEntry('movie:2')).toBeNull();
  });

  it('ignores live-like infinite durations', () => {
    expect(isResumable(600, Number.POSITIVE_INFINITY)).toBe(false);
  });

  it('evicts the oldest entries beyond the cap', () => {
    for (let index = 0; index < 305; index += 1) {
      saveResumePosition(`item:${index}`, 100, 1000, index);
    }

    expect(getResumeEntry('item:0')).toBeNull();
    expect(getResumeEntry('item:4')).toBeNull();
    expect(getResumeEntry('item:5')).not.toBeNull();
    expect(getResumeEntry('item:304')).not.toBeNull();
  });

  it('clears a single entry', () => {
    saveResumePosition('movie:1', 600, 5400);
    clearResumePosition('movie:1');
    expect(getResumeEntry('movie:1')).toBeNull();
  });

  it('round-trips volume and clamps bad values', () => {
    expect(readStoredVolume()).toEqual({ volume: 1, muted: false });

    writeStoredVolume({ volume: 0.4, muted: true });
    expect(readStoredVolume()).toEqual({ volume: 0.4, muted: true });

    window.localStorage.setItem(
      'silkcast:player:volume',
      JSON.stringify({ volume: 7 })
    );
    expect(readStoredVolume().volume).toBe(1);

    window.localStorage.setItem('silkcast:player:volume', 'not json');
    expect(readStoredVolume()).toEqual({ volume: 1, muted: false });
  });
});
