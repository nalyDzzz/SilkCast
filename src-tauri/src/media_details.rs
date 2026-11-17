//! Movie and series details: plot, credits, artwork, rating and runtime.
//!
//! Xtream panels serve them per item through `get_vod_info` and
//! `get_series_info`. Both are metadata calls, so they never open a stream or
//! use one of the account's connections. Details are cached per provider item
//! (not per channel row), so they survive catalog refreshes.

use crate::foundation::{get_channel_by_id, get_source_by_id, open_connection, ChannelRecord};
use crate::xtream::{extract_stream_key_from_url, XtreamConfig};
use rusqlite::{params, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;
use std::path::Path;

pub const MEDIA_DETAILS_SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS media_details (
  source_id INTEGER NOT NULL,
  item_key TEXT NOT NULL,
  details_json TEXT NOT NULL,
  fetched_at INTEGER NOT NULL,
  PRIMARY KEY (source_id, item_key),
  FOREIGN KEY(source_id) REFERENCES sources(id) ON DELETE CASCADE
);
"#;

/// Details rarely change; a week keeps lookups instant without going stale.
const FRESH_FOR_SECONDS: i64 = 7 * 24 * 3600;
/// Panels sometimes fill in details later, so an empty answer is retried sooner.
const EMPTY_FRESH_FOR_SECONDS: i64 = 24 * 3600;
const MAX_CAST: usize = 12;
const MAX_BACKDROPS: usize = 4;
/// Some panels send TMDB image paths (`/abc.jpg`) instead of full URLs.
const TMDB_IMAGE_BASE: &str = "https://image.tmdb.org/t/p/w1280";

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct MediaDetails {
    pub plot: Option<String>,
    pub genres: Vec<String>,
    pub directors: Vec<String>,
    pub cast: Vec<String>,
    /// `YYYY-MM-DD` when the provider gives a full date.
    pub release_date: Option<String>,
    pub year: Option<i32>,
    pub runtime_minutes: Option<u32>,
    /// Out of 10.
    pub rating: Option<f32>,
    pub age_rating: Option<String>,
    pub country: Option<String>,
    pub poster_url: Option<String>,
    pub backdrop_urls: Vec<String>,
    pub trailer_url: Option<String>,
}

impl MediaDetails {
    pub fn is_empty(&self) -> bool {
        *self == Self::default()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DetailsKind {
    Movie,
    Series,
}

/// The provider item a catalog row points at.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DetailsTarget {
    pub kind: DetailsKind,
    pub item_id: String,
}

impl DetailsTarget {
    /// Movies and series ids are separate number spaces on Xtream panels.
    fn cache_key(&self) -> String {
        let kind = match self.kind {
            DetailsKind::Movie => "movie",
            DetailsKind::Series => "series",
        };
        format!("{kind}:{}", self.item_id)
    }
}

/// Which provider item to ask about, for movies and series only.
pub fn details_target(channel: &ChannelRecord) -> Option<DetailsTarget> {
    let kind = match channel.media_kind.as_str() {
        "movie" => DetailsKind::Movie,
        "series" => DetailsKind::Series,
        _ => return None,
    };
    // Movie URLs end in the stream id; series rows keep their id in `tvg_id`.
    let from_url = || extract_stream_key_from_url(&channel.stream_url);
    let from_tvg = || channel.tvg_id.clone();
    let raw = match kind {
        DetailsKind::Movie => from_url().filter(|id| is_numeric(id)).or_else(from_tvg),
        DetailsKind::Series => from_tvg().or_else(from_url),
    }?;
    let item_id = raw.trim().to_string();
    (!item_id.is_empty()).then_some(DetailsTarget { kind, item_id })
}

/// Details for a catalog item: from the cache while fresh, otherwise from the
/// provider through `fetch`. `None` when the item has no provider details
/// (live channels, playlist sources).
///
/// A failed lookup falls back to stale cached details when there are any.
pub fn details_for_channel<F>(
    db_path: &Path,
    channel_id: i64,
    now: i64,
    fetch: F,
) -> Result<Option<MediaDetails>, String>
where
    F: FnOnce(&XtreamConfig, &DetailsTarget) -> Result<Value, String>,
{
    let channel = get_channel_by_id(db_path, channel_id)?
        .ok_or_else(|| format!("channel {channel_id} not found"))?;
    let Some(target) = details_target(&channel) else {
        return Ok(None);
    };
    let source = get_source_by_id(db_path, channel.source_id)?
        .ok_or_else(|| format!("source {} not found", channel.source_id))?;
    if source.source_type != "xtream" {
        return Ok(None);
    }

    let key = target.cache_key();
    let cached = read_cached_details(db_path, source.id, &key)?;
    if let Some((details, fetched_at)) = &cached {
        if is_fresh(details, *fetched_at, now) {
            return Ok(cached.map(|(details, _)| details));
        }
    }

    let config = XtreamConfig::from_value(&source.config)?;
    match fetch(&config, &target) {
        Ok(payload) => {
            let details = parse_media_details(&payload);
            store_details(db_path, source.id, &key, &details, now)?;
            Ok(Some(details))
        }
        Err(err) => match cached {
            Some((details, _)) => Ok(Some(details)),
            None => Err(err),
        },
    }
}

/// Caches the details that came with a series' episode list, so opening the
/// series doesn't ask the provider for the same payload twice.
pub fn remember_series_details(
    db_path: &Path,
    channel: &ChannelRecord,
    payload: &Value,
    now: i64,
) -> Result<(), String> {
    let Some(target) = details_target(channel).filter(|t| t.kind == DetailsKind::Series) else {
        return Ok(());
    };
    store_details(
        db_path,
        channel.source_id,
        &target.cache_key(),
        &parse_media_details(payload),
        now,
    )
}

/// Drops a source's cached details when its catalog is re-imported or its
/// account changes: ids can then point at different titles (Dispatcharr
/// renumbers its catalog; an edited source may be another provider).
pub fn forget_source_details(tx: &Transaction<'_>, source_id: i64) -> Result<(), String> {
    tx.execute(
        "DELETE FROM media_details WHERE source_id = ?1",
        params![source_id],
    )
    .map_err(|e| format!("clear media details failed: {e}"))?;
    Ok(())
}

fn is_fresh(details: &MediaDetails, fetched_at: i64, now: i64) -> bool {
    let fresh_for = if details.is_empty() {
        EMPTY_FRESH_FOR_SECONDS
    } else {
        FRESH_FOR_SECONDS
    };
    now.saturating_sub(fetched_at) < fresh_for
}

fn read_cached_details(
    db_path: &Path,
    source_id: i64,
    key: &str,
) -> Result<Option<(MediaDetails, i64)>, String> {
    let connection = open_connection(db_path)?;
    let row: Option<(String, i64)> = connection
        .query_row(
            "SELECT details_json, fetched_at FROM media_details WHERE source_id = ?1 AND item_key = ?2",
            params![source_id, key],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|e| format!("read media details failed: {e}"))?;
    // An unreadable row (older format) is treated as missing and refetched.
    Ok(row.and_then(|(json, fetched_at)| {
        serde_json::from_str(&json)
            .ok()
            .map(|details| (details, fetched_at))
    }))
}

fn store_details(
    db_path: &Path,
    source_id: i64,
    key: &str,
    details: &MediaDetails,
    now: i64,
) -> Result<(), String> {
    let json =
        serde_json::to_string(details).map_err(|e| format!("encode media details failed: {e}"))?;
    let connection = open_connection(db_path)?;
    connection
        .execute(
            r#"
            INSERT INTO media_details(source_id, item_key, details_json, fetched_at)
            VALUES (?1, ?2, ?3, ?4)
            ON CONFLICT(source_id, item_key) DO UPDATE SET
              details_json = excluded.details_json,
              fetched_at = excluded.fetched_at
            "#,
            params![source_id, key, json, now],
        )
        .map_err(|e| format!("store media details failed: {e}"))?;
    Ok(())
}

/// Reads the `info` block of a `get_vod_info` or `get_series_info` payload.
/// Panels differ in key names and value types; anything unusable is dropped.
pub fn parse_media_details(payload: &Value) -> MediaDetails {
    let Some(info) = payload.get("info").filter(|info| info.is_object()) else {
        return MediaDetails::default();
    };

    let release_date = text(
        info,
        &["releasedate", "releaseDate", "release_date", "air_date"],
    )
    .and_then(|raw| normalize_date(&raw));
    let year = release_date
        .as_deref()
        .and_then(leading_year)
        .or_else(|| text(info, &["year"]).as_deref().and_then(leading_year));

    MediaDetails {
        plot: text(info, &["plot", "description", "overview"]),
        genres: list(info, &["genre", "genres"], ['/', ',', '|'].as_slice(), 6),
        directors: list(info, &["director", "directors"], [','].as_slice(), 4),
        cast: list(info, &["cast", "actors"], [','].as_slice(), MAX_CAST),
        release_date,
        year,
        runtime_minutes: runtime_minutes(info),
        rating: rating(info),
        age_rating: text(info, &["mpaa_rating", "age", "certification", "rated"]),
        country: text(info, &["country"]),
        poster_url: image_urls(info, &["movie_image", "cover_big", "cover"])
            .into_iter()
            .next(),
        backdrop_urls: image_urls(info, &["backdrop_path", "backdrop"])
            .into_iter()
            .take(MAX_BACKDROPS)
            .collect(),
        trailer_url: text(info, &["youtube_trailer", "trailer"]).and_then(|raw| trailer_url(&raw)),
    }
}

/// Values panels use to mean "nothing here".
fn is_placeholder(value: &str) -> bool {
    matches!(
        value.to_ascii_lowercase().as_str(),
        "" | "0" | "-" | "n/a" | "na" | "null" | "none" | "unknown" | "[]"
    )
}

fn scalar_text(value: &Value) -> Option<String> {
    let raw = match value {
        Value::String(text) => text.trim().to_string(),
        Value::Number(number) => number.to_string(),
        _ => return None,
    };
    (!is_placeholder(&raw)).then_some(raw)
}

fn text(info: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| info.get(*key).and_then(scalar_text))
}

/// A comma (or slash) separated string, or a JSON array, as distinct names.
/// Panels may send several of the keys, some empty (`cast: ""` beside a
/// filled `actors`), so the first key with any names wins.
fn list(info: &Value, keys: &[&str], separators: &[char], max: usize) -> Vec<String> {
    keys.iter()
        .filter_map(|key| info.get(*key))
        .map(|value| names_in(value, separators, max))
        .find(|names| !names.is_empty())
        .unwrap_or_default()
}

fn names_in(value: &Value, separators: &[char], max: usize) -> Vec<String> {
    let parts: Vec<String> = match value {
        Value::Array(items) => items.iter().filter_map(scalar_text).collect(),
        other => scalar_text(other)
            .map(|joined| joined.split(separators).map(str::to_string).collect())
            .unwrap_or_default(),
    };
    let mut names = Vec::new();
    let mut seen = HashSet::new();
    for part in parts {
        let name = part.trim();
        if is_placeholder(name) || !seen.insert(name.to_lowercase()) {
            continue;
        }
        names.push(name.to_string());
        if names.len() == max {
            break;
        }
    }
    names
}

fn image_urls(info: &Value, keys: &[&str]) -> Vec<String> {
    let mut urls = Vec::new();
    for key in keys {
        let candidates: Vec<String> = match info.get(*key) {
            Some(Value::Array(items)) => items.iter().filter_map(scalar_text).collect(),
            Some(other) => scalar_text(other).into_iter().collect(),
            None => Vec::new(),
        };
        for candidate in candidates {
            let url = if candidate.starts_with("http://") || candidate.starts_with("https://") {
                candidate
            } else if candidate.starts_with('/') && candidate.len() > 1 {
                format!("{TMDB_IMAGE_BASE}{candidate}")
            } else {
                continue;
            };
            if !urls.contains(&url) {
                urls.push(url);
            }
        }
    }
    urls
}

/// `2014-11-05`, `2014-11-05 00:00:00` or `2014` → the date part.
fn normalize_date(raw: &str) -> Option<String> {
    let date = raw.split([' ', 'T']).next()?.trim();
    let year = leading_year(date)?;
    let valid_full = date.len() == 10
        && date.is_ascii()
        && date.as_bytes()[4] == b'-'
        && date.as_bytes()[7] == b'-'
        && date[5..7]
            .parse::<u8>()
            .is_ok_and(|m| (1..=12).contains(&m))
        && date[8..10]
            .parse::<u8>()
            .is_ok_and(|d| (1..=31).contains(&d));
    Some(if valid_full {
        date.to_string()
    } else {
        year.to_string()
    })
}

fn leading_year(raw: &str) -> Option<i32> {
    let digits = raw.trim().get(..4)?;
    let year = digits.parse::<i32>().ok()?;
    (1880..=2100).contains(&year).then_some(year)
}

fn runtime_minutes(info: &Value) -> Option<u32> {
    let from_seconds = text(info, &["duration_secs"])
        .and_then(|raw| raw.parse::<f64>().ok())
        .map(|seconds| (seconds / 60.0).round());
    let from_clock = || text(info, &["duration"]).and_then(|raw| clock_minutes(&raw));
    let from_minutes = || {
        text(info, &["episode_run_time", "runtime"])
            .and_then(|raw| leading_number(&raw))
            .map(f64::round)
    };
    let minutes = from_seconds
        .filter(|m| *m >= 1.0)
        .or_else(from_clock)
        .or_else(from_minutes)?;
    (1.0..=1000.0).contains(&minutes).then_some(minutes as u32)
}

/// `01:58:00` or `58:00` → minutes.
fn clock_minutes(raw: &str) -> Option<f64> {
    let parts: Vec<f64> = raw
        .trim()
        .split(':')
        .map(|part| part.parse::<f64>().ok())
        .collect::<Option<_>>()?;
    let seconds = match parts.as_slice() {
        [h, m, s] => h * 3600.0 + m * 60.0 + s,
        [m, s] => m * 60.0 + s,
        _ => return None,
    };
    Some((seconds / 60.0).round())
}

fn leading_number(raw: &str) -> Option<f64> {
    let normalized = raw.trim().replace(',', ".");
    let end = normalized
        .find(|ch: char| !(ch.is_ascii_digit() || ch == '.'))
        .unwrap_or(normalized.len());
    normalized[..end].parse::<f64>().ok()
}

fn rating(info: &Value) -> Option<f32> {
    let out_of_ten = text(info, &["rating"])
        .and_then(|raw| leading_number(&raw))
        .map(|value| {
            if value > 10.0 && value <= 100.0 {
                value / 10.0
            } else {
                value
            }
        })
        .filter(|value| *value > 0.0 && *value <= 10.0)
        .or_else(|| {
            text(info, &["rating_5based"])
                .and_then(|raw| leading_number(&raw))
                .filter(|value| *value > 0.0 && *value <= 5.0)
                .map(|value| value * 2.0)
        })?;
    Some(((out_of_ten * 10.0).round() / 10.0) as f32)
}

/// A YouTube id or URL as a watch URL; other sites are ignored.
fn trailer_url(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    let is_video_id = trimmed.len() == 11
        && trimmed
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_');
    if is_video_id {
        return Some(format!("https://www.youtube.com/watch?v={trimmed}"));
    }
    let url = url::Url::parse(trimmed).ok()?;
    let host = url
        .host_str()?
        .trim_start_matches("www.")
        .trim_start_matches("m.");
    let is_youtube = matches!(host, "youtube.com" | "youtu.be" | "youtube-nocookie.com");
    (is_youtube && matches!(url.scheme(), "http" | "https"))
        .then(|| trimmed.replacen("http://", "https://", 1))
}

fn is_numeric(raw: &str) -> bool {
    !raw.is_empty() && raw.chars().all(|ch| ch.is_ascii_digit())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::foundation::{
        create_source, ensure_foundation_dirs, init_storage, list_channels_for_source,
        replace_channels_for_source, store_source_catalog, ChannelInsertRecord, FetchedCatalog,
    };
    use serde_json::json;
    use std::cell::Cell;
    use std::path::PathBuf;

    #[test]
    fn parses_a_typical_vod_info_payload() {
        let payload = json!({
            "info": {
                "movie_image": "https://img.example/poster.jpg",
                "backdrop_path": ["https://img.example/back1.jpg", "/tmdb-path.jpg", ""],
                "youtube_trailer": "dQw4w9WgXcQ",
                "genre": "Drama / Crime, drama",
                "plot": "  A motel clerk keeps a ledger.  ",
                "cast": "June Abara, Theo Marsh, , June Abara",
                "director": "Ines Calder",
                "rating": "7.36",
                "releasedate": "1997-04-18",
                "duration_secs": 6480,
                "duration": "01:48:00",
                "mpaa_rating": "R",
                "country": "United States"
            },
            "movie_data": { "stream_id": 202, "name": "Low Tide Motel" }
        });

        let details = parse_media_details(&payload);
        assert_eq!(
            details.plot.as_deref(),
            Some("A motel clerk keeps a ledger.")
        );
        assert_eq!(details.genres, vec!["Drama", "Crime"]);
        assert_eq!(details.cast, vec!["June Abara", "Theo Marsh"]);
        assert_eq!(details.directors, vec!["Ines Calder"]);
        assert_eq!(details.rating, Some(7.4));
        assert_eq!(details.release_date.as_deref(), Some("1997-04-18"));
        assert_eq!(details.year, Some(1997));
        assert_eq!(details.runtime_minutes, Some(108));
        assert_eq!(details.age_rating.as_deref(), Some("R"));
        assert_eq!(details.country.as_deref(), Some("United States"));
        assert_eq!(
            details.poster_url.as_deref(),
            Some("https://img.example/poster.jpg")
        );
        assert_eq!(
            details.backdrop_urls,
            vec![
                "https://img.example/back1.jpg".to_string(),
                format!("{TMDB_IMAGE_BASE}/tmdb-path.jpg"),
            ]
        );
        assert_eq!(
            details.trailer_url.as_deref(),
            Some("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
        );
    }

    #[test]
    fn parses_series_info_key_variants() {
        let payload = json!({
            "info": {
                "cover": "https://img.example/show.jpg",
                "backdrop_path": "https://img.example/show-back.jpg",
                "releaseDate": "2019",
                "episode_run_time": "45",
                "rating": "0",
                "rating_5based": 4.1,
                "genre": ["Comedy", "Drama"],
                "youtube_trailer": "http://www.youtube.com/watch?v=abc",
                "director": "N/A"
            },
            "episodes": {}
        });

        let details = parse_media_details(&payload);
        assert_eq!(details.year, Some(2019));
        assert_eq!(details.release_date.as_deref(), Some("2019"));
        assert_eq!(details.runtime_minutes, Some(45));
        assert_eq!(details.rating, Some(8.2));
        assert_eq!(details.genres, vec!["Comedy", "Drama"]);
        assert!(details.directors.is_empty());
        assert_eq!(
            details.poster_url.as_deref(),
            Some("https://img.example/show.jpg")
        );
        assert_eq!(
            details.backdrop_urls,
            vec!["https://img.example/show-back.jpg"]
        );
        assert_eq!(
            details.trailer_url.as_deref(),
            Some("https://www.youtube.com/watch?v=abc")
        );
    }

    #[test]
    fn empty_or_odd_payloads_give_empty_details() {
        assert!(parse_media_details(&json!({ "info": [] })).is_empty());
        assert!(parse_media_details(&json!([])).is_empty());
        let odd = parse_media_details(&json!({
            "info": {
                "duration": "soon",
                "rating": "great",
                "youtube_trailer": "https://vimeo.com/123",
                "backdrop_path": ["not-a-url"],
                "releasedate": "unknown"
            }
        }));
        assert!(odd.is_empty(), "{odd:?}");
    }

    #[test]
    fn an_empty_cast_falls_back_to_actors() {
        let details = parse_media_details(&json!({
            "info": { "cast": "", "actors": "Kel Mitchell, Kenan Thompson", "director": [] , "directors": "Phil Traill" }
        }));
        assert_eq!(details.cast, vec!["Kel Mitchell", "Kenan Thompson"]);
        assert_eq!(details.directors, vec!["Phil Traill"]);
    }

    #[test]
    fn runtime_falls_back_from_seconds_to_clock_to_minutes() {
        let from_clock =
            parse_media_details(&json!({ "info": { "duration_secs": 0, "duration": "1:32:40" } }));
        assert_eq!(from_clock.runtime_minutes, Some(93));
        let from_minutes = parse_media_details(&json!({ "info": { "runtime": "118 min" } }));
        assert_eq!(from_minutes.runtime_minutes, Some(118));
        let percent_rating = parse_media_details(&json!({ "info": { "rating": 73 } }));
        assert_eq!(percent_rating.rating, Some(7.3));
    }

    #[test]
    fn targets_come_from_the_stream_url_or_tvg_id() {
        let channel = |kind: &str, url: &str, tvg: Option<&str>| ChannelRecord {
            id: 1,
            source_id: 1,
            name: "x".to_string(),
            group_name: "g".to_string(),
            logo: None,
            tvg_id: tvg.map(str::to_string),
            stream_url: url.to_string(),
            media_kind: kind.to_string(),
            is_favorite: false,
        };

        assert_eq!(
            details_target(&channel(
                "movie",
                "http://p.example/movie/u/p/202.mkv",
                Some("9")
            )),
            Some(DetailsTarget {
                kind: DetailsKind::Movie,
                item_id: "202".to_string()
            })
        );
        assert_eq!(
            details_target(&channel("movie", "http://p.example/play/abc", Some("77"))),
            Some(DetailsTarget {
                kind: DetailsKind::Movie,
                item_id: "77".to_string()
            })
        );
        assert_eq!(
            details_target(&channel(
                "series",
                "http://p.example/series/u/p/999.mp4",
                Some("31")
            )),
            Some(DetailsTarget {
                kind: DetailsKind::Series,
                item_id: "31".to_string()
            })
        );
        assert_eq!(
            details_target(&channel("live", "http://p.example/live/u/p/1.ts", None)),
            None
        );
    }

    struct Fixture {
        db_path: PathBuf,
        movie_id: i64,
        series_id: i64,
        playlist_movie_id: i64,
    }

    fn fixture() -> Fixture {
        static NEXT: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
        let seq = NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let root = std::env::temp_dir().join(format!(
            "silkcast-details-test-{}-{seq}-{}",
            std::process::id(),
            crate::guide_refresh::unix_now()
        ));
        let context = ensure_foundation_dirs(&root).expect("dirs");
        init_storage(&context.db_path).expect("storage");

        let config = json!({ "server_url": "http://p.example", "username": "u", "password": "p" });
        let xtream = create_source(&context.db_path, "xtream", "X", &config).expect("source");
        let item = |name: &str, url: &str, tvg: &str, kind: &str| ChannelInsertRecord {
            name: name.to_string(),
            group_name: Some("G".to_string()),
            logo: None,
            tvg_id: Some(tvg.to_string()),
            tvg_name: None,
            stream_url: url.to_string(),
            media_kind: kind.to_string(),
        };
        replace_channels_for_source(
            &context.db_path,
            xtream,
            &[
                item(
                    "Movie",
                    "http://p.example/movie/u/p/202.mp4",
                    "202",
                    "movie",
                ),
                item("Show", "http://p.example/series/u/p/31.mp4", "31", "series"),
            ],
        )
        .expect("channels");
        let playlist =
            create_source(&context.db_path, "m3u", "P", &json!({ "location": "x" })).expect("m3u");
        replace_channels_for_source(
            &context.db_path,
            playlist,
            &[item("Film", "http://cdn.example/film.mp4", "", "movie")],
        )
        .expect("playlist channels");

        let id_of = |source_id: i64, kind: &str| {
            list_channels_for_source(&context.db_path, source_id, Some(kind), None, None, false)
                .expect("list")[0]
                .id
        };
        Fixture {
            movie_id: id_of(xtream, "movie"),
            series_id: id_of(xtream, "series"),
            playlist_movie_id: id_of(playlist, "movie"),
            db_path: context.db_path,
        }
    }

    fn payload(plot: &str) -> Value {
        json!({ "info": { "plot": plot } })
    }

    #[test]
    fn details_are_cached_until_they_go_stale() {
        let fx = fixture();
        let calls = Cell::new(0);
        let fetch = |plot: &'static str| {
            let calls = &calls;
            move |config: &XtreamConfig, target: &DetailsTarget| {
                calls.set(calls.get() + 1);
                assert_eq!(config.username, "u");
                assert_eq!(
                    target,
                    &DetailsTarget {
                        kind: DetailsKind::Movie,
                        item_id: "202".to_string()
                    }
                );
                Ok(payload(plot))
            }
        };

        let first = details_for_channel(&fx.db_path, fx.movie_id, 1_000, fetch("First"))
            .expect("lookup")
            .expect("details");
        assert_eq!(first.plot.as_deref(), Some("First"));

        let cached = details_for_channel(&fx.db_path, fx.movie_id, 1_000 + 3600, fetch("Second"))
            .expect("lookup")
            .expect("details");
        assert_eq!(cached.plot.as_deref(), Some("First"));
        assert_eq!(
            calls.get(),
            1,
            "a fresh cache entry shouldn't hit the provider"
        );

        let refreshed = details_for_channel(
            &fx.db_path,
            fx.movie_id,
            1_000 + FRESH_FOR_SECONDS,
            fetch("Second"),
        )
        .expect("lookup")
        .expect("details");
        assert_eq!(refreshed.plot.as_deref(), Some("Second"));
        assert_eq!(calls.get(), 2);
    }

    #[test]
    fn a_failed_refresh_serves_stale_details_and_a_first_failure_errors() {
        let fx = fixture();
        let err = details_for_channel(&fx.db_path, fx.movie_id, 1_000, |_, _| {
            Err("provider down".to_string())
        })
        .expect_err("no cache and no provider should fail");
        assert_eq!(err, "provider down");

        details_for_channel(&fx.db_path, fx.movie_id, 1_000, |_, _| Ok(payload("Kept")))
            .expect("lookup");
        let stale = details_for_channel(
            &fx.db_path,
            fx.movie_id,
            1_000 + FRESH_FOR_SECONDS * 2,
            |_, _| Err("provider down".to_string()),
        )
        .expect("stale details beat an error")
        .expect("details");
        assert_eq!(stale.plot.as_deref(), Some("Kept"));
    }

    #[test]
    fn empty_answers_are_retried_after_a_day() {
        let fx = fixture();
        details_for_channel(&fx.db_path, fx.movie_id, 0, |_, _| {
            Ok(json!({ "info": [] }))
        })
        .expect("lookup");
        let calls = Cell::new(0);
        let fetch = |_: &XtreamConfig, _: &DetailsTarget| {
            calls.set(calls.get() + 1);
            Ok(payload("Filled in"))
        };
        let soon = details_for_channel(&fx.db_path, fx.movie_id, 3600, fetch).expect("lookup");
        assert_eq!(soon, Some(MediaDetails::default()));
        assert_eq!(calls.get(), 0);
        let later =
            details_for_channel(&fx.db_path, fx.movie_id, EMPTY_FRESH_FOR_SECONDS, |_, _| {
                Ok(payload("Filled in"))
            })
            .expect("lookup")
            .expect("details");
        assert_eq!(later.plot.as_deref(), Some("Filled in"));
    }

    #[test]
    fn series_details_from_the_episode_list_are_reused() {
        let fx = fixture();
        let series = get_channel_by_id(&fx.db_path, fx.series_id)
            .expect("read")
            .expect("series");
        remember_series_details(&fx.db_path, &series, &payload("From episodes"), 500)
            .expect("store");

        let details = details_for_channel(&fx.db_path, fx.series_id, 600, |_, _| {
            panic!("cached series details shouldn't be fetched again")
        })
        .expect("lookup")
        .expect("details");
        assert_eq!(details.plot.as_deref(), Some("From episodes"));
    }

    #[test]
    fn a_catalog_refresh_or_edit_forgets_the_cached_details() {
        let fx = fixture();
        details_for_channel(&fx.db_path, fx.movie_id, 0, |_, _| Ok(payload("Old title")))
            .expect("lookup");
        let movie = get_channel_by_id(&fx.db_path, fx.movie_id)
            .expect("read")
            .expect("movie");
        let same_items = FetchedCatalog {
            channels: vec![ChannelInsertRecord {
                name: movie.name.clone(),
                group_name: Some(movie.group_name.clone()),
                logo: None,
                tvg_id: movie.tvg_id.clone(),
                tvg_name: None,
                stream_url: movie.stream_url.clone(),
                media_kind: "movie".to_string(),
            }],
            detected_guide_url: None,
        };
        store_source_catalog(&fx.db_path, movie.source_id, None, &same_items).expect("refresh");

        let refetched = details_for_channel(&fx.db_path, fx.movie_id, 10, |_, _| {
            Ok(payload("Renumbered"))
        })
        .expect("lookup")
        .expect("details");
        assert_eq!(refetched.plot.as_deref(), Some("Renumbered"));
    }

    #[test]
    fn playlist_items_have_no_provider_details() {
        let fx = fixture();
        let details = details_for_channel(&fx.db_path, fx.playlist_movie_id, 0, |_, _| {
            panic!("playlist sources have no details API")
        })
        .expect("lookup");
        assert_eq!(details, None);
    }
}
