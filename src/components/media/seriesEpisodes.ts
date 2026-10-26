import type {
  ChannelRecord,
  SeriesEpisodeRecord,
} from '@/components/app/types';

export function formatEpisodeCode(episode: SeriesEpisodeRecord) {
  const season = String(Math.max(episode.season_number, 1)).padStart(2, '0');
  const number = String(Math.max(episode.episode_number, 1)).padStart(2, '0');
  return `S${season}E${number}`;
}

const SEPARATORS = /^[\s\-–—:|·.]+/;
const EPISODE_CODE = /^s\d{1,2}\s*e\d{1,3}\b/i;

/**
 * Providers often prefix episode titles with the series name and code
 * ("Show - S01E02 - Title"); strip both so the UI can show them separately.
 */
export function cleanEpisodeTitle(seriesName: string, rawTitle: string) {
  let title = rawTitle.trim();
  const normalizedSeries = seriesName.trim().toLowerCase();

  if (normalizedSeries && title.toLowerCase().startsWith(normalizedSeries)) {
    title = title.slice(normalizedSeries.length).replace(SEPARATORS, '');
  }

  if (EPISODE_CODE.test(title)) {
    title = title.replace(EPISODE_CODE, '').replace(SEPARATORS, '');
  }

  return title.trim();
}

/**
 * A playable record for an episode. It keeps the series' id (recents and
 * favorites track the series) but carries the episode's stream and title.
 */
export function toEpisodeRecord(
  series: ChannelRecord,
  episode: SeriesEpisodeRecord
): ChannelRecord {
  const code = formatEpisodeCode(episode);
  const title = cleanEpisodeTitle(series.name, episode.title);

  return {
    ...series,
    name: title ? `${code} · ${title}` : code,
    group_name: series.name,
    stream_url: episode.stream_url,
  };
}

export function groupEpisodesBySeason(episodes: SeriesEpisodeRecord[]) {
  const seasons = new Map<number, SeriesEpisodeRecord[]>();
  for (const episode of episodes) {
    const season = Math.max(episode.season_number, 1);
    const list = seasons.get(season) ?? [];
    list.push(episode);
    seasons.set(season, list);
  }

  return [...seasons.entries()]
    .sort(([a], [b]) => a - b)
    .map(([season, list]) => ({
      season,
      episodes: [...list].sort((a, b) => a.episode_number - b.episode_number),
    }));
}
