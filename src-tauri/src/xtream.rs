use crate::foundation::ChannelInsertRecord;
use base64::engine::general_purpose::{
    STANDARD as BASE64_STANDARD, STANDARD_NO_PAD as BASE64_STANDARD_NO_PAD,
};
use base64::Engine as _;
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use url::Url;

const XTREAM_USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) SilkCast/0.2";
const XTREAM_HTTP_CONNECT_TIMEOUT: Duration = Duration::from_secs(8);
const XTREAM_HTTP_REQUEST_TIMEOUT: Duration = Duration::from_secs(25);

#[derive(Debug, Clone)]
pub struct XtreamConfig {
    pub server_url: String,
    pub username: String,
    pub password: String,
}

impl XtreamConfig {
    pub fn from_value(config: &Value) -> Result<Self, String> {
        let server_url = read_required_string(config, "server_url")?;
        let username = read_required_string(config, "username")?;
        let password = read_required_string(config, "password")?;

        let normalized_server_url = normalize_server_url(&server_url)?;
        Ok(Self {
            server_url: normalized_server_url,
            username,
            password,
        })
    }
}

#[derive(Debug, Clone)]
struct XtreamAccountProfile {
    allowed_output_formats: Vec<String>,
}

pub fn normalize_server_url(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("xtream config requires a non-empty `server_url`".to_string());
    }

    let mut parsed =
        Url::parse(trimmed).map_err(|err| format!("invalid xtream `server_url`: {err}"))?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("xtream `server_url` must start with http:// or https://".to_string());
    }

    parsed.set_query(None);
    parsed.set_fragment(None);

    let mut path = parsed.path().trim_end_matches('/').to_string();
    for suffix in ["/player_api.php", "/get.php"] {
        if path.ends_with(suffix) {
            let new_len = path.len().saturating_sub(suffix.len());
            path.truncate(new_len);
            break;
        }
    }

    if path.is_empty() {
        parsed.set_path("/");
    } else {
        parsed.set_path(&path);
    }

    Ok(parsed.to_string().trim_end_matches('/').to_string())
}

pub fn import_xtream_channels(config: &XtreamConfig) -> Result<Vec<ChannelInsertRecord>, String> {
    let client = XtreamClient::new(config.clone())?;
    client.import_catalog()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SeriesEpisodeRecord {
    pub episode_id: String,
    pub season_number: i64,
    pub episode_number: i64,
    pub title: String,
    pub stream_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LiveEpgEntryRecord {
    pub title: String,
    pub description: Option<String>,
    pub start: Option<String>,
    pub end: Option<String>,
    pub start_timestamp: Option<i64>,
    pub end_timestamp: Option<i64>,
}

pub fn list_xtream_live_epg(
    config: &XtreamConfig,
    stream_id: &str,
    limit: usize,
) -> Result<Vec<LiveEpgEntryRecord>, String> {
    let session = XtreamEpgSession::new(config.clone())?;
    session.fetch_live_epg(stream_id, limit)
}

pub struct XtreamEpgSession {
    client: XtreamClient,
}

impl XtreamEpgSession {
    pub fn new(config: XtreamConfig) -> Result<Self, String> {
        Ok(Self {
            client: XtreamClient::new(config)?,
        })
    }

    pub fn fetch_live_epg(
        &self,
        stream_id: &str,
        limit: usize,
    ) -> Result<Vec<LiveEpgEntryRecord>, String> {
        self.client.fetch_live_epg(stream_id, limit)
    }
}
pub fn list_xtream_series_episodes(
    config: &XtreamConfig,
    series_id: &str,
) -> Result<Vec<SeriesEpisodeRecord>, String> {
    let client = XtreamClient::new(config.clone())?;
    client.fetch_series_episodes(series_id)
}

struct XtreamClient {
    base_url: String,
    player_api_url: String,
    username: String,
    password: String,
    http: Client,
}

impl XtreamClient {
    fn new(config: XtreamConfig) -> Result<Self, String> {
        let http = Client::builder()
            .redirect(reqwest::redirect::Policy::limited(10))
            .user_agent(XTREAM_USER_AGENT)
            .connect_timeout(XTREAM_HTTP_CONNECT_TIMEOUT)
            .timeout(XTREAM_HTTP_REQUEST_TIMEOUT)
            .build()
            .map_err(|err| format!("failed to build HTTP client for xtream source: {err}"))?;

        Ok(Self {
            player_api_url: format!("{}/player_api.php", config.server_url),
            base_url: config.server_url,
            username: config.username,
            password: config.password,
            http,
        })
    }

    fn import_catalog(&self) -> Result<Vec<ChannelInsertRecord>, String> {
        let profile = self.fetch_account_profile()?;
        let live_categories = self
            .fetch_category_map("get_live_categories")
            .unwrap_or_default();
        let vod_categories = self
            .fetch_category_map("get_vod_categories")
            .unwrap_or_default();
        let series_categories = self
            .fetch_category_map("get_series_categories")
            .unwrap_or_default();

        let mut channels = Vec::new();
        channels.extend(self.fetch_live_channels(&profile, &live_categories)?);
        channels.extend(self.fetch_vod_channels(&vod_categories)?);
        channels.extend(self.fetch_series_channels(&series_categories)?);

        if channels.is_empty() {
            return Err(
                "Xtream source authenticated successfully but no catalog items were found."
                    .to_string(),
            );
        }

        Ok(channels)
    }

    fn fetch_account_profile(&self) -> Result<XtreamAccountProfile, String> {
        let payload = self.request_json(None, &[])?;
        let Some(user_info) = payload.get("user_info") else {
            return Err(
                "Xtream server returned an unexpected response. Check the server URL.".to_string(),
            );
        };

        if !value_is_truthy(user_info.get("auth")) {
            return Err(
                "Xtream login failed. Check the server URL, username, and password.".to_string(),
            );
        }

        let allowed_output_formats = user_info
            .get("allowed_output_formats")
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .filter_map(|item| value_to_string(Some(item)))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        Ok(XtreamAccountProfile {
            allowed_output_formats,
        })
    }

    fn fetch_category_map(&self, action: &str) -> Result<HashMap<String, String>, String> {
        let payload = self.request_json(Some(action), &[])?;
        let Some(items) = payload.as_array() else {
            return Ok(HashMap::new());
        };

        let mut categories = HashMap::new();
        for item in items {
            let Some(category_id) = first_string(item, &["category_id", "parent_id"]) else {
                continue;
            };
            let category_name = first_string(item, &["category_name", "name"])
                .unwrap_or_else(|| "Ungrouped".to_string());
            categories.insert(category_id, category_name);
        }

        Ok(categories)
    }

    fn fetch_live_channels(
        &self,
        profile: &XtreamAccountProfile,
        categories: &HashMap<String, String>,
    ) -> Result<Vec<ChannelInsertRecord>, String> {
        let payload = self.request_json(Some("get_live_streams"), &[])?;
        let Some(items) = payload.as_array() else {
            return Ok(Vec::new());
        };

        let live_extension = preferred_live_extension(&profile.allowed_output_formats);
        let mut channels = Vec::new();

        for item in items {
            let Some(stream_id) = first_string(item, &["stream_id", "id"]) else {
                continue;
            };
            let Some(name) = first_string(item, &["name", "stream_display_name", "title"]) else {
                continue;
            };

            channels.push(ChannelInsertRecord {
                name,
                group_name: resolve_group_name(item, categories),
                logo: first_string(item, &["stream_icon", "logo", "cover"]),
                tvg_id: first_string(item, &["epg_channel_id", "custom_sid", "stream_id"]),
                tvg_name: first_string(item, &["epg_channel_id", "name"]),
                stream_url: self.build_stream_url("live", &stream_id, &live_extension),
                media_kind: "live".to_string(),
            });
        }

        Ok(channels)
    }

    fn fetch_vod_channels(
        &self,
        categories: &HashMap<String, String>,
    ) -> Result<Vec<ChannelInsertRecord>, String> {
        let payload = self.request_json(Some("get_vod_streams"), &[])?;
        let Some(items) = payload.as_array() else {
            return Ok(Vec::new());
        };

        let mut channels = Vec::new();
        for item in items {
            let Some(stream_id) = first_string(item, &["stream_id", "id"]) else {
                continue;
            };
            let Some(name) = first_string(item, &["name", "stream_display_name", "title"]) else {
                continue;
            };
            let extension =
                first_string(item, &["container_extension"]).unwrap_or_else(|| "mp4".to_string());

            channels.push(ChannelInsertRecord {
                name,
                group_name: resolve_group_name(item, categories),
                logo: first_string(item, &["stream_icon", "cover", "movie_image"]),
                tvg_id: first_string(item, &["stream_id", "id"]),
                tvg_name: first_string(item, &["name", "stream_display_name"]),
                stream_url: self.build_stream_url("movie", &stream_id, &extension),
                media_kind: "movie".to_string(),
            });
        }

        Ok(channels)
    }

    fn fetch_series_channels(
        &self,
        categories: &HashMap<String, String>,
    ) -> Result<Vec<ChannelInsertRecord>, String> {
        let payload = self.request_json(Some("get_series"), &[])?;
        let Some(items) = payload.as_array() else {
            return Ok(Vec::new());
        };

        let mut channels = Vec::new();
        for item in items {
            let Some(series_id) = first_string(item, &["series_id", "id"]) else {
                continue;
            };
            let Some(name) = first_string(item, &["name", "title"]) else {
                continue;
            };
            let extension = first_string(item, &["container_extension", "format"])
                .unwrap_or_else(|| "mp4".to_string());

            channels.push(ChannelInsertRecord {
                name: name.clone(),
                group_name: resolve_group_name(item, categories),
                logo: first_string(item, &["cover", "cover_big", "stream_icon"]),
                tvg_id: Some(series_id.clone()),
                tvg_name: Some(name),
                stream_url: self.build_stream_url("series", &series_id, &extension),
                media_kind: "series".to_string(),
            });
        }

        Ok(channels)
    }

    fn fetch_live_epg(
        &self,
        stream_id: &str,
        limit: usize,
    ) -> Result<Vec<LiveEpgEntryRecord>, String> {
        let normalized_stream_id = stream_id.trim();
        if normalized_stream_id.is_empty() {
            return Err("live epg lookup requires a valid stream ID".to_string());
        }

        let normalized_limit = limit.clamp(1, 50);

        let short_epg_result =
            self.fetch_live_epg_for_action("get_short_epg", normalized_stream_id, normalized_limit);
        match short_epg_result {
            Ok(records) if !records.is_empty() => return Ok(records),
            Ok(_) => {}
            Err(_) => {}
        }

        self.fetch_live_epg_for_action(
            "get_simple_data_table",
            normalized_stream_id,
            normalized_limit,
        )
    }

    fn fetch_live_epg_for_action(
        &self,
        action: &str,
        stream_id: &str,
        limit: usize,
    ) -> Result<Vec<LiveEpgEntryRecord>, String> {
        let mut extra_pairs = vec![("stream_id", stream_id.to_string())];
        if action == "get_short_epg" {
            extra_pairs.push(("limit", limit.to_string()));
        }

        let payload = self.request_json(Some(action), &extra_pairs)?;
        let mut records = parse_live_epg_entries(&payload);
        if action == "get_simple_data_table" {
            // Unlike `get_short_epg`, this returns the whole listing, past days
            // included, so its first entries are usually long over.
            records = upcoming_live_epg_entries(records, unix_now());
        }

        Ok(records.into_iter().take(limit).collect())
    }

    fn fetch_series_episodes(&self, series_id: &str) -> Result<Vec<SeriesEpisodeRecord>, String> {
        let normalized_series_id = series_id.trim();
        if normalized_series_id.is_empty() {
            return Err("series episode lookup requires a valid series ID".to_string());
        }

        let payload = self.request_json(
            Some("get_series_info"),
            &[("series_id", normalized_series_id.to_string())],
        )?;
        let episodes_payload = payload
            .get("episodes")
            .ok_or_else(|| "Xtream response missing `episodes` payload".to_string())?;

        let mut episodes = Vec::new();
        match episodes_payload {
            Value::Object(seasons) => {
                for (season_key, season_items) in seasons {
                    let season_hint = season_key.parse::<i64>().ok();
                    self.collect_series_episodes(season_items, season_hint, &mut episodes);
                }
            }
            Value::Array(_) => {
                self.collect_series_episodes(episodes_payload, None, &mut episodes);
            }
            _ => {
                return Err("Xtream `episodes` payload was not an array or object".to_string());
            }
        }

        if episodes.is_empty() {
            return Err("Xtream returned no playable episodes for this series.".to_string());
        }

        episodes.sort_by(|left, right| {
            left.season_number
                .cmp(&right.season_number)
                .then_with(|| left.episode_number.cmp(&right.episode_number))
                .then_with(|| left.title.cmp(&right.title))
        });

        Ok(episodes)
    }

    fn collect_series_episodes(
        &self,
        value: &Value,
        season_hint: Option<i64>,
        output: &mut Vec<SeriesEpisodeRecord>,
    ) {
        let Some(items) = value.as_array() else {
            return;
        };

        for (index, item) in items.iter().enumerate() {
            let fallback_episode_number = index as i64 + 1;
            if let Some(episode) =
                self.parse_series_episode(item, season_hint, fallback_episode_number)
            {
                output.push(episode);
            }
        }
    }

    fn parse_series_episode(
        &self,
        item: &Value,
        season_hint: Option<i64>,
        fallback_episode_number: i64,
    ) -> Option<SeriesEpisodeRecord> {
        let episode_id = first_string(item, &["id", "episode_id", "stream_id"])?;
        let nested_info = item.get("info");
        let extension = first_string(item, &["container_extension"])
            .or_else(|| first_string_from(nested_info, &["container_extension"]))
            .unwrap_or_else(|| "mp4".to_string());
        let season_number = first_i64(item, &["season", "season_num", "season_number"])
            .or(season_hint)
            .filter(|value| *value > 0)
            .unwrap_or(1);
        let episode_number = first_i64(item, &["episode_num", "episode_number", "number", "sort"])
            .filter(|value| *value > 0)
            .unwrap_or(fallback_episode_number);

        let title = first_string(item, &["title", "name"])
            .or_else(|| first_string_from(nested_info, &["title", "movie_title", "name"]))
            .unwrap_or_else(|| format!("Episode {episode_number}"));

        Some(SeriesEpisodeRecord {
            episode_id: episode_id.clone(),
            season_number,
            episode_number,
            title,
            stream_url: self.build_stream_url("series", &episode_id, &extension),
        })
    }

    fn build_stream_url(&self, media_path: &str, item_id: &str, extension: &str) -> String {
        format!(
            "{}/{}/{}/{}/{}.{}",
            self.base_url,
            media_path,
            self.username,
            self.password,
            item_id.trim(),
            sanitize_extension(extension)
        )
    }

    fn request_json(
        &self,
        action: Option<&str>,
        extra_pairs: &[(&str, String)],
    ) -> Result<Value, String> {
        let mut url = Url::parse(&self.player_api_url)
            .map_err(|err| format!("invalid xtream API URL: {err}"))?;
        {
            let mut query = url.query_pairs_mut();
            query.append_pair("username", &self.username);
            query.append_pair("password", &self.password);
            if let Some(action_value) = action {
                query.append_pair("action", action_value);
            }
            for (key, value) in extra_pairs {
                query.append_pair(key, value);
            }
        }

        let response = self
            .http
            .get(url)
            .send()
            .map_err(|err| format!("xtream request failed: {err}"))?;
        let response = response
            .error_for_status()
            .map_err(|err| format!("xtream server returned an error: {err}"))?;
        let body = response
            .text()
            .map_err(|err| format!("failed to read xtream response body: {err}"))?;

        serde_json::from_str::<Value>(&body).map_err(|err| {
            let preview = body.chars().take(160).collect::<String>();
            format!("xtream server did not return JSON ({err}). Response preview: {preview}")
        })
    }
}

fn read_required_string(config: &Value, key: &str) -> Result<String, String> {
    let value = config
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| format!("xtream config requires a non-empty `{key}`"))?;
    Ok(value.to_string())
}

fn first_string(object: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| value_to_string(object.get(*key)))
        .and_then(|value| {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        })
}

fn first_string_from(value: Option<&Value>, keys: &[&str]) -> Option<String> {
    let object = value?.as_object()?;
    keys.iter()
        .find_map(|key| value_to_string(object.get(*key)))
        .and_then(|value| {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        })
}

fn first_i64(object: &Value, keys: &[&str]) -> Option<i64> {
    keys.iter().find_map(|key| value_to_i64(object.get(*key)))
}

fn value_to_string(value: Option<&Value>) -> Option<String> {
    match value? {
        Value::String(text) => Some(text.to_string()),
        Value::Number(number) => Some(number.to_string()),
        Value::Bool(flag) => Some(if *flag { "true" } else { "false" }.to_string()),
        _ => None,
    }
}

fn value_to_i64(value: Option<&Value>) -> Option<i64> {
    match value? {
        Value::Number(number) => number.as_i64(),
        Value::String(text) => text.trim().parse::<i64>().ok(),
        Value::Bool(flag) => Some(if *flag { 1 } else { 0 }),
        _ => None,
    }
}

fn value_is_truthy(value: Option<&Value>) -> bool {
    match value {
        Some(Value::Bool(flag)) => *flag,
        Some(Value::Number(number)) => number.as_i64().unwrap_or_default() != 0,
        Some(Value::String(text)) => matches!(
            text.trim().to_ascii_lowercase().as_str(),
            "1" | "true" | "yes" | "enabled"
        ),
        _ => false,
    }
}

fn parse_live_epg_entries(payload: &Value) -> Vec<LiveEpgEntryRecord> {
    let entries_payload = payload
        .get("epg_listings")
        .or_else(|| payload.get("epg_list"))
        .or_else(|| payload.get("listings"))
        .unwrap_or(payload);

    let Some(entries) = entries_payload.as_array() else {
        return Vec::new();
    };

    entries
        .iter()
        .filter_map(parse_single_live_epg_entry)
        .collect()
}

/// Programmes that haven't finished by `now`, oldest first.
fn upcoming_live_epg_entries(
    mut records: Vec<LiveEpgEntryRecord>,
    now: i64,
) -> Vec<LiveEpgEntryRecord> {
    records.retain(|entry| entry.end_timestamp.is_some_and(|end| end > now));
    records.sort_by_key(|entry| entry.start_timestamp);
    records
}

fn unix_now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

fn parse_single_live_epg_entry(item: &Value) -> Option<LiveEpgEntryRecord> {
    let title = first_string(item, &["title", "name", "program_title"])
        .map(|value| decode_possible_base64_text(&value))
        .filter(|value| !value.trim().is_empty())?;

    let description = first_string(item, &["description", "descr", "program_description"])
        .map(|value| decode_possible_base64_text(&value))
        .filter(|value| !value.trim().is_empty());

    let start = first_string(
        item,
        &[
            "start",
            "start_time",
            "start_datetime",
            "start_utc",
            "start_timestamp",
        ],
    );
    let end = first_string(
        item,
        &["end", "stop", "end_time", "end_datetime", "stop_timestamp"],
    );

    let start_timestamp = first_i64(item, &["start_timestamp", "start_ts", "start"]);
    let end_timestamp = first_i64(
        item,
        &["stop_timestamp", "end_timestamp", "end_ts", "stop", "end"],
    );

    Some(LiveEpgEntryRecord {
        title,
        description,
        start,
        end,
        start_timestamp,
        end_timestamp,
    })
}

fn decode_possible_base64_text(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() || !looks_like_base64_text(trimmed) {
        return trimmed.to_string();
    }

    let decoded_bytes = BASE64_STANDARD
        .decode(trimmed)
        .or_else(|_| BASE64_STANDARD_NO_PAD.decode(trimmed));

    match decoded_bytes {
        Ok(bytes) => match String::from_utf8(bytes) {
            Ok(decoded) => {
                let normalized = decoded.trim();
                if decoded_text_is_reasonable(normalized) {
                    normalized.to_string()
                } else {
                    trimmed.to_string()
                }
            }
            Err(_) => trimmed.to_string(),
        },
        Err(_) => trimmed.to_string(),
    }
}

fn looks_like_base64_text(raw: &str) -> bool {
    if raw.len() < 8 {
        return false;
    }

    raw.chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '+' | '/' | '=' | '-' | '_'))
}

fn decoded_text_is_reasonable(raw: &str) -> bool {
    if raw.is_empty() {
        return false;
    }

    let total_chars = raw.chars().count();
    if total_chars == 0 {
        return false;
    }

    let readable_chars = raw.chars().filter(|ch| !ch.is_control()).count();
    readable_chars * 10 >= total_chars * 9
}

fn resolve_group_name(item: &Value, categories: &HashMap<String, String>) -> Option<String> {
    let category_id = first_string(item, &["category_id"]).or_else(|| {
        item.get("category_ids")
            .and_then(Value::as_array)
            .and_then(|ids| ids.first())
            .and_then(|id| value_to_string(Some(id)))
    });

    if let Some(category_id) = category_id {
        if let Some(name) = categories.get(&category_id) {
            return Some(name.clone());
        }
    }

    first_string(item, &["category_name", "genre", "group_name"])
}

fn preferred_live_extension(allowed_output_formats: &[String]) -> String {
    let normalized = allowed_output_formats
        .iter()
        .map(|value| value.trim().to_ascii_lowercase())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();

    if normalized
        .iter()
        .any(|value| value == "m3u8" || value == "hls")
    {
        return "m3u8".to_string();
    }
    if normalized
        .iter()
        .any(|value| value == "ts" || value == "mpegts")
    {
        return "ts".to_string();
    }

    normalized
        .first()
        .cloned()
        .unwrap_or_else(|| "m3u8".to_string())
}

fn sanitize_extension(extension: &str) -> String {
    let cleaned = extension
        .trim()
        .trim_start_matches('.')
        .split(['?', '#'])
        .next()
        .unwrap_or("m3u8")
        .trim()
        .to_ascii_lowercase();

    if cleaned.is_empty() {
        "m3u8".to_string()
    } else {
        cleaned
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::thread;

    #[test]
    fn normalize_server_url_accepts_root_and_api_paths() {
        assert_eq!(
            normalize_server_url("https://provider.example:8080").expect("root URL should work"),
            "https://provider.example:8080"
        );
        assert_eq!(
            normalize_server_url("https://provider.example:8080/player_api.php?username=a")
                .expect("player_api URL should normalize"),
            "https://provider.example:8080"
        );
        assert_eq!(
            normalize_server_url("https://provider.example/panel/get.php")
                .expect("get.php URL should normalize"),
            "https://provider.example/panel"
        );
    }

    #[test]
    fn import_xtream_channels_fetches_live_vod_and_series_items() {
        let server_url = spawn_xtream_test_server();
        let config = XtreamConfig {
            server_url,
            username: "alice".to_string(),
            password: "secret".to_string(),
        };

        let channels = import_xtream_channels(&config).expect("xtream import should succeed");
        assert_eq!(channels.len(), 3);

        let live = channels
            .iter()
            .find(|channel| channel.media_kind == "live")
            .expect("live channel should exist");
        assert_eq!(live.group_name.as_deref(), Some("News"));
        assert_eq!(
            live.stream_url,
            format!("{}/live/alice/secret/101.m3u8", config.server_url)
        );

        let movie = channels
            .iter()
            .find(|channel| channel.media_kind == "movie")
            .expect("movie should exist");
        assert_eq!(movie.group_name.as_deref(), Some("Movies"));
        assert_eq!(
            movie.stream_url,
            format!("{}/movie/alice/secret/202.mp4", config.server_url)
        );

        let episode = channels
            .iter()
            .find(|channel| channel.media_kind == "series")
            .expect("series show should exist");
        assert_eq!(episode.group_name.as_deref(), Some("Series"));
        assert_eq!(episode.name, "SilkCast Show");
        assert_eq!(
            episode.stream_url,
            format!("{}/series/alice/secret/999.mp4", config.server_url)
        );
    }

    #[test]
    fn list_xtream_series_episodes_fetches_episode_records() {
        let server_url = spawn_xtream_test_server_with_limit(1);
        let config = XtreamConfig {
            server_url,
            username: "alice".to_string(),
            password: "secret".to_string(),
        };

        let episodes =
            list_xtream_series_episodes(&config, "999").expect("episode lookup should succeed");
        assert_eq!(episodes.len(), 2);
        assert_eq!(episodes[0].season_number, 1);
        assert_eq!(episodes[0].episode_number, 1);
        assert_eq!(episodes[0].title, "Pilot");
        assert_eq!(
            episodes[0].stream_url,
            format!("{}/series/alice/secret/5551.mp4", config.server_url)
        );
        assert_eq!(episodes[1].season_number, 1);
        assert_eq!(episodes[1].episode_number, 2);
        assert_eq!(
            episodes[1].stream_url,
            format!("{}/series/alice/secret/5552.mkv", config.server_url)
        );
    }

    #[test]
    fn list_xtream_live_epg_fetches_now_and_next_entries() {
        let server_url = spawn_xtream_test_server_with_limit(1);
        let config = XtreamConfig {
            server_url,
            username: "alice".to_string(),
            password: "secret".to_string(),
        };

        let entries =
            list_xtream_live_epg(&config, "101", 2).expect("live epg lookup should succeed");
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].title, "Morning News");
        assert_eq!(
            entries[0].description.as_deref(),
            Some("Headlines from around the world")
        );
        assert_eq!(entries[0].start_timestamp, Some(1700000000));
        assert_eq!(entries[1].title, "Noon Update");
    }

    #[test]
    fn full_listing_fallback_keeps_only_programmes_still_on() {
        let payload: Value = serde_json::from_str(
            r#"{ "epg_listings": [
                { "title": "Yesterday", "start_timestamp": 100, "stop_timestamp": 200 },
                { "title": "Later", "start_timestamp": 1300, "stop_timestamp": 1400 },
                { "title": "On now", "start_timestamp": 900, "stop_timestamp": 1100 },
                { "title": "No times" },
                { "title": "Next", "start_timestamp": 1100, "stop_timestamp": 1300 }
            ] }"#,
        )
        .expect("valid json");

        let upcoming = upcoming_live_epg_entries(parse_live_epg_entries(&payload), 1000);
        let titles: Vec<&str> = upcoming.iter().map(|entry| entry.title.as_str()).collect();
        assert_eq!(titles, vec!["On now", "Next", "Later"]);
    }

    fn spawn_xtream_test_server() -> String {
        spawn_xtream_test_server_with_limit(7)
    }

    fn spawn_xtream_test_server_with_limit(request_limit: usize) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").expect("listener should bind");
        let addr = listener
            .local_addr()
            .expect("listener should have local addr");

        thread::spawn(move || {
            for _ in 0..request_limit {
                let (mut stream, _) = listener.accept().expect("request should arrive");
                let mut buffer = [0u8; 4096];
                let bytes_read = stream
                    .read(&mut buffer)
                    .expect("request should be readable");
                let request = String::from_utf8_lossy(&buffer[..bytes_read]);
                let request_line = request.lines().next().unwrap_or_default();
                let path_and_query = request_line
                    .split_whitespace()
                    .nth(1)
                    .unwrap_or_default()
                    .to_string();
                let url = Url::parse(&format!("http://localhost{path_and_query}"))
                    .expect("request URL should parse");
                let action = url
                    .query_pairs()
                    .find_map(|(key, value)| {
                        if key == "action" {
                            Some(value.to_string())
                        } else {
                            None
                        }
                    })
                    .unwrap_or_default();
                let body = match action.as_str() {
                    "" => {
                        r#"{
  "user_info": {
    "auth": 1,
    "allowed_output_formats": ["m3u8", "ts"]
  }
}"#
                    }
                    "get_live_categories" => {
                        r#"[{ "category_id": "10", "category_name": "News" }]"#
                    }
                    "get_vod_categories" => {
                        r#"[{ "category_id": "20", "category_name": "Movies" }]"#
                    }
                    "get_series_categories" => {
                        r#"[{ "category_id": "30", "category_name": "Series" }]"#
                    }
                    "get_live_streams" => {
                        r#"[
  {
    "stream_id": 101,
    "name": "Global News",
    "category_id": "10",
    "stream_icon": "https://img.example/news.png",
    "epg_channel_id": "global.news"
  }
]"#
                    }
                    "get_vod_streams" => {
                        r#"[
  {
    "stream_id": 202,
    "name": "Sky Movie",
    "category_id": "20",
    "container_extension": "mp4",
    "stream_icon": "https://img.example/movie.png"
  }
]"#
                    }
                    "get_series" => {
                        r#"[
  {
    "series_id": 999,
    "name": "SilkCast Show",
    "category_id": "30",
    "cover": "https://img.example/show.png"
  }
]"#
                    }
                    "get_series_info" => {
                        r#"{
  "episodes": {
    "1": [
      {
        "id": "5551",
        "episode_num": "1",
        "title": "Pilot",
        "container_extension": "mp4"
      },
      {
        "id": "5552",
        "episode_num": "2",
        "title": "Second",
        "container_extension": "mkv"
      }
    ]
  }
}"#
                    }
                    "get_short_epg" => {
                        r#"{
  "epg_listings": [
    {
      "title": "TW9ybmluZyBOZXdz",
      "description": "SGVhZGxpbmVzIGZyb20gYXJvdW5kIHRoZSB3b3JsZA==",
      "start": "2026-03-07 06:00:00",
      "end": "2026-03-07 07:00:00",
      "start_timestamp": 1700000000,
      "stop_timestamp": 1700003600
    },
    {
      "title": "Tm9vbiBVcGRhdGU=",
      "description": "TGF0ZSBicmVha2luZyB1cGRhdGVz",
      "start": "2026-03-07 07:00:00",
      "end": "2026-03-07 08:00:00",
      "start_timestamp": 1700003600,
      "stop_timestamp": 1700007200
    }
  ]
}"#
                    }
                    "get_simple_data_table" => {
                        r#"{
  "epg_listings": []
}"#
                    }
                    _ => "[]",
                };

                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    body.len(),
                    body
                );
                stream
                    .write_all(response.as_bytes())
                    .expect("response should be writable");
            }
        });

        format!("http://{}", addr)
    }
}
