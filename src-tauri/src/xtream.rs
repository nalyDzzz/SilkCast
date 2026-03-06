use crate::foundation::ChannelInsertRecord;
use reqwest::blocking::Client;
use serde_json::Value;
use std::collections::HashMap;
use std::time::Duration;
use url::Url;

const XTREAM_USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) OpenTV/0.2";
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

fn value_to_string(value: Option<&Value>) -> Option<String> {
    match value? {
        Value::String(text) => Some(text.to_string()),
        Value::Number(number) => Some(number.to_string()),
        Value::Bool(flag) => Some(if *flag { "true" } else { "false" }.to_string()),
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
        assert_eq!(episode.name, "OpenTV Show");
        assert_eq!(
            episode.stream_url,
            format!("{}/series/alice/secret/999.mp4", config.server_url)
        );
    }

    fn spawn_xtream_test_server() -> String {
        let listener = TcpListener::bind("127.0.0.1:0").expect("listener should bind");
        let addr = listener
            .local_addr()
            .expect("listener should have local addr");

        thread::spawn(move || {
            for _ in 0..7 {
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
    "name": "OpenTV Show",
    "category_id": "30",
    "cover": "https://img.example/show.png"
  }
]"#
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
