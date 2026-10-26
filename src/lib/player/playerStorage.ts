const RESUME_POSITIONS_KEY = 'silkcast:player:resumePositions';
const VOLUME_KEY = 'silkcast:player:volume';
const MAX_RESUME_ENTRIES = 300;

/** Positions closer than this to either end aren't worth resuming. */
const MIN_RESUME_SECONDS = 30;
const END_THRESHOLD_SECONDS = 90;

export type ResumeEntry = {
  position: number;
  duration: number;
  updatedAt: number;
};

type ResumeMap = Record<string, ResumeEntry>;

function readJson<T>(key: string): T | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable; resume is a convenience, not critical.
  }
}

function readResumeMap(): ResumeMap {
  const value = readJson<ResumeMap>(RESUME_POSITIONS_KEY);
  return value && typeof value === 'object' ? value : {};
}

/** All stored resume positions, for rendering progress across many items. */
export function getResumeEntries(): Readonly<Record<string, ResumeEntry>> {
  return readResumeMap();
}

export function getResumeEntry(key: string): ResumeEntry | null {
  const entry = readResumeMap()[key];
  if (
    !entry ||
    typeof entry.position !== 'number' ||
    !Number.isFinite(entry.position)
  ) {
    return null;
  }

  return entry;
}

export function isResumable(position: number, duration: number) {
  return (
    Number.isFinite(position) &&
    Number.isFinite(duration) &&
    duration > 0 &&
    position >= MIN_RESUME_SECONDS &&
    position <= duration - END_THRESHOLD_SECONDS
  );
}

/**
 * Store the watch position, or clear it when the viewer is at the very start
 * or has effectively finished the item.
 */
export function saveResumePosition(
  key: string,
  position: number,
  duration: number,
  now = Date.now()
) {
  const map = readResumeMap();

  if (!isResumable(position, duration)) {
    if (key in map) {
      delete map[key];
      writeJson(RESUME_POSITIONS_KEY, map);
    }
    return;
  }

  map[key] = { position, duration, updatedAt: now };

  const keys = Object.keys(map);
  if (keys.length > MAX_RESUME_ENTRIES) {
    keys
      .sort((a, b) => map[a].updatedAt - map[b].updatedAt)
      .slice(0, keys.length - MAX_RESUME_ENTRIES)
      .forEach((staleKey) => {
        delete map[staleKey];
      });
  }

  writeJson(RESUME_POSITIONS_KEY, map);
}

export function clearResumePosition(key: string) {
  const map = readResumeMap();
  if (key in map) {
    delete map[key];
    writeJson(RESUME_POSITIONS_KEY, map);
  }
}

export type StoredVolume = {
  volume: number;
  muted: boolean;
};

export function readStoredVolume(): StoredVolume {
  const value = readJson<Partial<StoredVolume>>(VOLUME_KEY);
  const volume =
    typeof value?.volume === 'number' && Number.isFinite(value.volume)
      ? Math.min(Math.max(value.volume, 0), 1)
      : 1;

  return { volume, muted: value?.muted === true };
}

export function writeStoredVolume(value: StoredVolume) {
  writeJson(VOLUME_KEY, value);
}
