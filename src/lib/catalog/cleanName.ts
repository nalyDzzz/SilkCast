/**
 * Turns raw provider names ("UK| ARC SPORTS 1 FHD ⁶⁰ᶠᵖˢ", "4K-A+ - Glass Orchard (2024)",
 * "123.Low.Tide.Motel.1997") into what SilkCast shows: a clean title, a year, and
 * small tags (country/language and quality). Display-only; the raw name is kept
 * everywhere else (search, playback, storage).
 */
export type CleanName = {
  title: string;
  year: number | null;
  /** Country/language first, then quality, e.g. ["UK", "FHD", "60 fps"]. */
  tags: string[];
  /** The country/language tag, if any ("UK", "EN"). */
  region: string | null;
  /** Provider divider rows like "##### SPORTS #####"; hide these from lists. */
  isSeparator: boolean;
};

const SUPERSCRIPTS: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  'ᴬ': 'A', 'ᴮ': 'B', 'ᶜ': 'C', 'ᴰ': 'D', 'ᴱ': 'E', 'ᶠ': 'F', 'ᴳ': 'G', 'ᴴ': 'H', 'ᴵ': 'I', 'ᴶ': 'J',
  'ᴷ': 'K', 'ᴸ': 'L', 'ᴹ': 'M', 'ᴺ': 'N', 'ᴼ': 'O', 'ᴾ': 'P', 'ᴿ': 'R', 'ˢ': 'S', 'ᵀ': 'T', 'ᵁ': 'U',
  'ⱽ': 'V', 'ᵂ': 'W', 'ᵃ': 'A', 'ᵇ': 'B', 'ᵈ': 'D', 'ᵉ': 'E', 'ᵍ': 'G', 'ʰ': 'H', 'ⁱ': 'I',
  'ʲ': 'J', 'ᵏ': 'K', 'ˡ': 'L', 'ᵐ': 'M', 'ⁿ': 'N', 'ᵒ': 'O', 'ᵖ': 'P', 'ʳ': 'R', 'ᵗ': 'T', 'ᵘ': 'U',
  'ᵛ': 'V', 'ʷ': 'W', 'ˣ': 'X', 'ʸ': 'Y', 'ᶻ': 'Z', '⁺': '+',
};
const SUPERSCRIPT_RUN = new RegExp(`[${Object.keys(SUPERSCRIPTS).join('')}]+`, 'g');

/** Decorative symbols providers sprinkle into names (☼ ★ ✪ ▶ etc.). */
const DECORATION = /[←-⇿─-➿⬀-⯿\u{1F300}-\u{1FAFF}]/gu;
const DIVIDER_CHARS = '#=*~_\\-━─═▬•|+';
const DIVIDER_EDGE = new RegExp(`^[\\s${DIVIDER_CHARS}]{2,}|[\\s${DIVIDER_CHARS}]{2,}$`, 'g');
const ONLY_DIVIDERS = new RegExp(`^[\\s${DIVIDER_CHARS}]*$`);
const STARTS_WITH_DIVIDER = new RegExp(`^\\s*[#=*~━─═▬]{2,}`);
const ENDS_WITH_DIVIDER = new RegExp(`[#=*~━─═▬]{2,}\\s*$`);

const COUNTRY_PREFIX = /^\s*[[(|]?\s*([A-Z]{2,3})\s*[\])|:]\s*|^\s*([A-Z]{2,3})\s+-\s+/;
const QUALITY_PREFIX = /^\s*(3D|4K|8K|UHD|FHD|HD|SD|HEVC|H\.?265)(?:[-\s]*[A-Z]\+?)?\s*[-|:]\s*/i;
/** "3D-DE - Title", "4K EN | Title": a quality and a country in one prefix. */
const QUALITY_COUNTRY_PREFIX = /^\s*(3D|4K|8K|UHD|FHD|HD|SD)[-\s]+([A-Z]{2,3})\s*[-|:]\s*/;
const BRACKETED = /[[(]\s*(multi[\s-]?subs?|subs?|subbed|multi|dual audio|[A-Z]{2,3})\s*[\])]/gi;
const TRAILING_YEAR = /[\s.([-]*\(?((?:19|20)\d{2})\)?\s*$/;

/** Quality tokens, normalised. Null means "drop it, it isn't useful to show". */
const QUALITY_TOKENS: Record<string, string | null> = {
  '3D': '3D', '4K': '4K', '8K': '8K', UHD: '4K', '2160P': '4K', '3840P': '4K', FHD: 'FHD', '1080P': 'FHD', '1080I': 'FHD',
  HD: 'HD', '720P': 'HD', SD: 'SD', '576P': 'SD', '480P': 'SD', HDR: 'HDR', HDR10: 'HDR', DV: 'HDR',
  '60FPS': '60 fps', '50FPS': '50 fps', FPS: null, RAW: null, HEVC: null, H265: null, 'H.265': null,
  X264: null, X265: null, 'WEB-DL': null, WEBDL: null, WEBRIP: null, BLURAY: null, BRRIP: null, DOLBY: null,
  VISION: null, ATMOS: null, '+': null,
};

/** Acronyms that stay upper-case when a shouted name is converted to title case. */
const ACRONYMS = new Set([
  'TV', 'UK', 'US', 'USA', 'EU', 'BBC', 'ITV', 'CNN', 'HBO', 'ESPN', 'NBC', 'CBS', 'ABC', 'FOX', 'AMC', 'TNT',
  'TBS', 'MTV', 'CNBC', 'MSNBC', 'NFL', 'NBA', 'NHL', 'MLB', 'UFC', 'WWE', 'PBS', 'RTE', 'DAZN', 'TSN', 'CTV',
  'NHK', 'RT', 'DW', 'CBC', 'SBS', 'TCM', 'TLC', 'BET', 'CMT', 'IFC', 'FX', 'FXX', 'HGTV', 'PPV', 'GAA', 'F1',
  'NBCSN', 'BT', 'TVE', 'RAI', 'ZDF', 'ARD', 'TF1', 'M6', 'SKY', 'UEFA', 'FIFA', 'NASA', 'II', 'III', 'IV',
  'VI', 'VII', 'VIII', 'IX', 'XI', 'XII', 'OK', 'DJ', 'MMA', 'NCAA', 'MLS', 'EPL', 'AFL', 'NRL', 'IPL', 'LA', 'NY',
]);

const SMALL_WORDS = new Set(['a', 'an', 'and', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'v', 'vs']);

function normaliseSuperscripts(value: string) {
  return value.replace(SUPERSCRIPT_RUN, (run) => ` ${[...run].map((ch) => SUPERSCRIPTS[ch]).join('')} `);
}

function addTag(tags: string[], tag: string | null) {
  if (tag && !tags.includes(tag)) {
    tags.push(tag);
  }
}

function qualityFor(token: string): string | null | undefined {
  const key = token.toUpperCase().replace(/[^A-Z0-9.+-]/g, '');
  return key in QUALITY_TOKENS ? QUALITY_TOKENS[key] : undefined;
}

function isShouting(value: string) {
  const letters = value.replace(/[^A-Za-z]/g, '');
  return letters.length >= 4 && letters === letters.toUpperCase();
}

function toTitleCase(value: string) {
  return value
    .split(/(\s+|\/|-)/)
    .map((part, index) => {
      if (!/[A-Za-z]/.test(part)) return part;
      const upper = part.toUpperCase();
      if (ACRONYMS.has(upper.replace(/[^A-Z0-9]/g, '')) || /\d/.test(part)) return upper;
      const lower = part.toLowerCase();
      if (index > 0 && SMALL_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join('');
}

const cache = new Map<string, CleanName>();

export function cleanName(raw: string | null | undefined): CleanName {
  const input = (raw ?? '').trim();
  const cached = cache.get(input);
  if (cached) return cached;

  const result = computeCleanName(input);
  cache.set(input, result);
  return result;
}

function computeCleanName(input: string): CleanName {
  if (
    input === '' ||
    ONLY_DIVIDERS.test(input) ||
    (STARTS_WITH_DIVIDER.test(input) && ENDS_WITH_DIVIDER.test(input))
  ) {
    const title = input.replace(DIVIDER_EDGE, '').trim();
    return {
      title: title === '' ? input : toTitleCase(title),
      year: null,
      tags: [],
      region: null,
      isSeparator: input !== '',
    };
  }

  const countryTags: string[] = [];
  const qualityTags: string[] = [];
  let text = normaliseSuperscripts(input).replace(DECORATION, ' ');

  // Leading tags, in any order: "UK|", "EN - ", "4K-A+ - ", "[US]".
  for (let guard = 0; guard < 3; guard += 1) {
    const country = COUNTRY_PREFIX.exec(text);
    if (country) {
      const code = (country[1] ?? country[2]).toUpperCase();
      const quality = qualityFor(code);
      if (quality !== undefined) addTag(qualityTags, quality);
      else addTag(countryTags, code);
      text = text.slice(country[0].length);
      continue;
    }
    const both = QUALITY_COUNTRY_PREFIX.exec(text);
    if (both) {
      addTag(countryTags, both[2]);
      addTag(qualityTags, qualityFor(both[1]) ?? null);
      text = text.slice(both[0].length);
      continue;
    }
    const quality = QUALITY_PREFIX.exec(text);
    if (quality) {
      addTag(qualityTags, qualityFor(quality[1]) ?? null);
      text = text.slice(quality[0].length);
      continue;
    }
    break;
  }

  text = text.replace(BRACKETED, (_, inner: string) => {
    const lower = inner.toLowerCase();
    if (lower.includes('sub')) addTag(qualityTags, 'Subs');
    else if (/^[a-z]{2,3}$/i.test(inner) && inner === inner.toUpperCase()) addTag(countryTags, inner);
    return ' ';
  });

  // Scene-style names: "123.Low.Tide.Motel.1997" or "Velvet.Underpass.2021.1080p".
  if (!/\s/.test(text.trim()) && (text.match(/\./g) ?? []).length >= 2) {
    text = text
      .replace(/\./g, ' ')
      .replace(/^\s*\d{1,4}\s+(?=\D)/, '')
      // "L A Confidential" -> "L.A. Confidential"
      .replace(/\b(?:[A-Z] ){1,}[A-Z]\b/g, (letters) => `${letters.replace(/ /g, '.')}.`);
  }

  // Quality tokens anywhere (usually trailing, often from superscripts).
  const words = text.split(/\s+/).filter(Boolean);
  const kept: string[] = [];
  for (const word of words) {
    const quality = qualityFor(word);
    const parts = word.split('/');
    if (quality !== undefined) {
      addTag(qualityTags, quality);
    } else if (parts.length > 1 && parts.every((part) => part === '' || qualityFor(part) !== undefined)) {
      // "HD/RAW", "ᴴᴰ/ᴿᴬᵂ"
      parts.forEach((part) => part && addTag(qualityTags, qualityFor(part) ?? null));
    } else if (!/^[/|·•]+$/.test(word)) {
      kept.push(word);
    }
  }
  text = kept.join(' ');

  let year: number | null = null;
  const yearMatch = TRAILING_YEAR.exec(text);
  if (yearMatch && yearMatch.index > 0) {
    year = Number(yearMatch[1]);
    text = text.slice(0, yearMatch.index);
  }

  text = text
    .replace(/\s+/g, ' ')
    .replace(/^[\s|:\-–—#*.]+|[\s|:\-–—#*.,]+$/g, '')
    .trim();

  if (text === '') {
    // Names made only of tags ("4K| ᵁᴴᴰ ³⁸⁴⁰ᴾ") read best as the tags themselves.
    const onlyTags = [...countryTags, ...qualityTags];
    return {
      title: onlyTags.length > 0 ? onlyTags.join(' ') : input,
      year: null,
      tags: [],
      region: countryTags[0] ?? null,
      isSeparator: false,
    };
  }

  return {
    title: isShouting(text) ? toTitleCase(text) : text,
    year,
    tags: [...countryTags, ...qualityTags],
    region: countryTags[0] ?? null,
    isSeparator: false,
  };
}

/** Just the clean title, for places that only have room for text. */
export function displayTitle(raw: string | null | undefined) {
  return cleanName(raw).title;
}
