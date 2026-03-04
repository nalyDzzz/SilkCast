use crate::foundation::ChannelInsertRecord;
use std::collections::HashMap;
use std::fs;

pub fn load_m3u_location(location: &str) -> Result<String, String> {
    let trimmed = location.trim();
    if trimmed.is_empty() {
        return Err("m3u location cannot be empty".to_string());
    }

    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        let client = reqwest::blocking::Client::builder()
            .redirect(reqwest::redirect::Policy::limited(10))
            .user_agent(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) OpenTV/0.1",
            )
            .build()
            .map_err(|err| format!("failed to build HTTP client for m3u URL: {err}"))?;
        let response = client
            .get(trimmed)
            .send()
            .map_err(|err| format!("failed to fetch m3u URL: {err}"))?;
        let response = response
            .error_for_status()
            .map_err(|err| format!("m3u URL returned non-success status: {err}"))?;
        return response
            .text()
            .map_err(|err| format!("failed to read m3u body: {err}"));
    }

    if trimmed.starts_with("file://") {
        let parsed = url::Url::parse(trimmed)
            .map_err(|err| format!("invalid file URL for m3u location: {err}"))?;
        let path = parsed
            .to_file_path()
            .map_err(|_| "file URL cannot be converted to a local path".to_string())?;
        return fs::read_to_string(path)
            .map_err(|err| format!("failed to read m3u file URL: {err}"));
    }

    fs::read_to_string(trimmed).map_err(|err| format!("failed to read m3u file: {err}"))
}

pub fn parse_m3u_channels(content: &str) -> Vec<ChannelInsertRecord> {
    let mut channels = Vec::new();
    let mut pending_meta: Option<M3uMeta> = None;

    for raw_line in content.lines() {
        let line = raw_line.trim();
        if line.is_empty() {
            continue;
        }

        if let Some(rest) = line.strip_prefix("#EXTINF:") {
            let meta = parse_extinf(rest);
            if let Some(inline_stream_url) = meta.inline_stream_url.clone() {
                channels.push(build_channel_record(meta, &inline_stream_url));
                pending_meta = None;
            } else {
                pending_meta = Some(meta);
            }
            continue;
        }

        if line.starts_with('#') {
            continue;
        }

        let meta = pending_meta.take().unwrap_or_default();
        channels.push(build_channel_record(meta, line));
    }

    channels
}

#[derive(Default)]
struct M3uMeta {
    attributes: HashMap<String, String>,
    display_name: Option<String>,
    inline_stream_url: Option<String>,
}

fn parse_extinf(input: &str) -> M3uMeta {
    let (attribute_section, display_section) = split_extinf_sections(input);
    let raw_display = display_section
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string);

    let (display_name, inline_stream_url) = extract_inline_stream(raw_display);

    M3uMeta {
        attributes: parse_attributes(attribute_section),
        display_name,
        inline_stream_url,
    }
}

fn split_extinf_sections(input: &str) -> (&str, Option<&str>) {
    let bytes = input.as_bytes();
    let mut in_quotes = false;
    let mut idx = 0usize;

    while idx < bytes.len() {
        if bytes[idx] == b'"' {
            in_quotes = !in_quotes;
            idx += 1;
            continue;
        }

        if bytes[idx] == b',' && !in_quotes {
            return (&input[..idx], Some(&input[idx + 1..]));
        }

        idx += 1;
    }

    (input, None)
}

fn parse_attributes(section: &str) -> HashMap<String, String> {
    let mut attributes = HashMap::new();
    let mut cursor = 0usize;
    let bytes = section.as_bytes();

    while cursor < bytes.len() {
        while cursor < bytes.len() && !is_key_start(bytes[cursor] as char) {
            cursor += 1;
        }
        if cursor >= bytes.len() {
            break;
        }

        let key_start = cursor;
        while cursor < bytes.len() && is_key_char(bytes[cursor] as char) {
            cursor += 1;
        }
        let key = &section[key_start..cursor];

        while cursor < bytes.len() && (bytes[cursor] as char).is_ascii_whitespace() {
            cursor += 1;
        }

        if cursor >= bytes.len() || bytes[cursor] != b'=' {
            continue;
        }
        cursor += 1;

        while cursor < bytes.len() && (bytes[cursor] as char).is_ascii_whitespace() {
            cursor += 1;
        }

        if cursor >= bytes.len() || bytes[cursor] != b'"' {
            continue;
        }
        cursor += 1;

        let value_start = cursor;
        while cursor < bytes.len() && bytes[cursor] != b'"' {
            cursor += 1;
        }
        if cursor >= bytes.len() {
            break;
        }

        let value = section[value_start..cursor].trim();
        cursor += 1;

        if !key.is_empty() && !value.is_empty() {
            attributes.insert(key.to_string(), value.to_string());
        }
    }

    attributes
}

fn is_key_start(ch: char) -> bool {
    ch.is_ascii_alphabetic()
}

fn is_key_char(ch: char) -> bool {
    ch.is_ascii_alphanumeric() || ch == '-' || ch == '_'
}

fn first_non_empty<'a>(values: &[Option<&'a str>]) -> Option<&'a str> {
    values
        .iter()
        .flatten()
        .map(|value| value.trim())
        .find(|value| !value.is_empty())
}

fn clean_opt(value: Option<&String>) -> Option<String> {
    value
        .map(String::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn extract_inline_stream(raw_display: Option<String>) -> (Option<String>, Option<String>) {
    let Some(display) = raw_display else {
        return (None, None);
    };

    let parts: Vec<&str> = display.split(',').map(str::trim).collect();
    if parts.len() < 2 {
        return (Some(display), None);
    }

    let last = parts.last().copied().unwrap_or_default();
    if !looks_like_stream_url(last) {
        return (Some(display), None);
    }

    let name = parts[..parts.len() - 1].join(",").trim().to_string();
    let final_name = if name.is_empty() { None } else { Some(name) };
    (final_name, Some(last.to_string()))
}

fn looks_like_stream_url(value: &str) -> bool {
    let trimmed = value.trim();
    trimmed.contains("://")
        || trimmed.starts_with('/')
        || trimmed.starts_with("udp@")
        || trimmed.starts_with("rtp@")
}

fn build_channel_record(meta: M3uMeta, stream_url: &str) -> ChannelInsertRecord {
    let media_kind = classify_media_kind(&meta, stream_url);
    let channel_name = first_non_empty(&[
        meta.display_name.as_deref(),
        meta.attributes.get("tvg-name").map(String::as_str),
        Some(stream_url),
    ])
    .unwrap_or("Unknown Channel")
    .to_string();

    ChannelInsertRecord {
        name: channel_name,
        group_name: clean_opt(meta.attributes.get("group-title")),
        logo: clean_opt(meta.attributes.get("tvg-logo")),
        tvg_id: clean_opt(meta.attributes.get("tvg-id")),
        tvg_name: clean_opt(meta.attributes.get("tvg-name")),
        stream_url: stream_url.to_string(),
        media_kind: media_kind.to_string(),
    }
}

fn classify_media_kind(meta: &M3uMeta, stream_url: &str) -> &'static str {
    if media_type_attr_matches(meta, &["series", "tvshow", "tv_show"]) {
        return "series";
    }
    if media_type_attr_matches(meta, &["movie", "vod", "film"]) {
        return "movie";
    }

    let group = meta
        .attributes
        .get("group-title")
        .map(String::as_str)
        .unwrap_or_default()
        .to_ascii_lowercase();
    let display_name = meta
        .display_name
        .as_deref()
        .unwrap_or_default()
        .to_ascii_lowercase();
    let tvg_name = meta
        .attributes
        .get("tvg-name")
        .map(String::as_str)
        .unwrap_or_default()
        .to_ascii_lowercase();
    let url = stream_url.trim().to_ascii_lowercase();

    if looks_like_series(&group, &display_name, &tvg_name, &url) {
        return "series";
    }

    if looks_like_movie(&group, &display_name, &tvg_name, &url) {
        return "movie";
    }

    "live"
}

fn media_type_attr_matches(meta: &M3uMeta, expected_values: &[&str]) -> bool {
    let candidate_keys = ["media-type", "tvg-type", "type", "content-type"];
    for key in candidate_keys {
        let value = meta
            .attributes
            .get(key)
            .map(String::as_str)
            .unwrap_or_default()
            .trim()
            .to_ascii_lowercase();
        if value.is_empty() {
            continue;
        }

        if expected_values
            .iter()
            .any(|expected| value.contains(expected))
        {
            return true;
        }
    }

    false
}

fn looks_like_series(group: &str, display_name: &str, tvg_name: &str, url: &str) -> bool {
    if url.contains("/series/") || url.contains("\\series\\") {
        return true;
    }

    let series_terms = [
        "series",
        "tv series",
        "tv shows",
        "tv show",
        "shows",
        "episodes",
        "season",
        "anime",
    ];
    if contains_any_term(group, &series_terms) {
        return true;
    }

    looks_like_episode_marker(display_name) || looks_like_episode_marker(tvg_name)
}

fn looks_like_movie(group: &str, display_name: &str, tvg_name: &str, url: &str) -> bool {
    if url.contains("/movie/") || url.contains("\\movie\\") || url.contains("/vod/") {
        return true;
    }

    if has_movie_file_extension(url) {
        return true;
    }

    let movie_terms = [
        "movie",
        "movies",
        "vod",
        "films",
        "film",
        "cinema",
        "box office",
    ];

    contains_any_term(group, &movie_terms)
        || contains_any_term(display_name, &movie_terms)
        || contains_any_term(tvg_name, &movie_terms)
}

fn contains_any_term(input: &str, terms: &[&str]) -> bool {
    terms.iter().any(|term| input.contains(term))
}

fn looks_like_episode_marker(input: &str) -> bool {
    let bytes = input.as_bytes();
    let mut idx = 0usize;
    while idx + 5 < bytes.len() {
        let c = bytes[idx] as char;
        if c != 's' {
            idx += 1;
            continue;
        }

        if !is_ascii_digit(bytes[idx + 1]) || !is_ascii_digit(bytes[idx + 2]) {
            idx += 1;
            continue;
        }

        let e = bytes[idx + 3] as char;
        if e != 'e' {
            idx += 1;
            continue;
        }

        if !is_ascii_digit(bytes[idx + 4]) || !is_ascii_digit(bytes[idx + 5]) {
            idx += 1;
            continue;
        }

        return true;
    }

    false
}

fn is_ascii_digit(byte: u8) -> bool {
    byte.is_ascii_digit()
}

fn has_movie_file_extension(url: &str) -> bool {
    let movie_exts = [".mp4", ".mkv", ".avi", ".mov", ".wmv", ".m4v", ".webm"];
    movie_exts.iter().any(|ext| url.ends_with(ext))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn make_temp_root() -> PathBuf {
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("opentv-m3u-test-{ts}"));
        fs::create_dir_all(&dir).expect("failed to create temp test dir");
        dir
    }

    #[test]
    fn parse_m3u_extracts_extinf_metadata() {
        let input = r#"
#EXTM3U
#EXTINF:-1 tvg-id="news.id" tvg-name="News HD" tvg-logo="https://img/news.png" group-title="News",The News
https://stream.example/news.m3u8
#EXTINF:-1 group-title="Sports",Sports One
https://stream.example/sports.m3u8
"#;

        let channels = parse_m3u_channels(input);
        assert_eq!(channels.len(), 2);

        assert_eq!(channels[0].name, "The News");
        assert_eq!(channels[0].group_name.as_deref(), Some("News"));
        assert_eq!(channels[0].tvg_id.as_deref(), Some("news.id"));
        assert_eq!(channels[0].tvg_name.as_deref(), Some("News HD"));
        assert_eq!(channels[0].logo.as_deref(), Some("https://img/news.png"));
        assert_eq!(channels[0].media_kind, "live");

        assert_eq!(channels[1].name, "Sports One");
        assert_eq!(channels[1].group_name.as_deref(), Some("Sports"));
        assert_eq!(channels[1].media_kind, "live");
    }

    #[test]
    fn parse_m3u_uses_url_when_extinf_missing() {
        let input = "https://stream.example/raw.ts\n";
        let channels = parse_m3u_channels(input);

        assert_eq!(channels.len(), 1);
        assert_eq!(channels[0].name, "https://stream.example/raw.ts");
        assert_eq!(channels[0].stream_url, "https://stream.example/raw.ts");
        assert_eq!(channels[0].media_kind, "live");
    }

    #[test]
    fn parse_m3u_supports_inline_url_after_name() {
        let input = r#"
#EXTM3U
#EXTINF:-1 tvg-id="inline.id" group-title="Inline",Inline Channel,https://stream.example/inline.m3u8
"#;
        let channels = parse_m3u_channels(input);

        assert_eq!(channels.len(), 1);
        assert_eq!(channels[0].name, "Inline Channel");
        assert_eq!(channels[0].stream_url, "https://stream.example/inline.m3u8");
        assert_eq!(channels[0].group_name.as_deref(), Some("Inline"));
        assert_eq!(channels[0].tvg_id.as_deref(), Some("inline.id"));
        assert_eq!(channels[0].media_kind, "live");
    }

    #[test]
    fn parse_m3u_classifies_movies_and_series() {
        let input = r#"
#EXTM3U
#EXTINF:-1 group-title="Movies",Top Gun
http://provider.example/movie/user/pass/1001.mp4
#EXTINF:-1 group-title="Series",Some Show S01E02
http://provider.example/series/user/pass/2001.mkv
"#;

        let channels = parse_m3u_channels(input);
        assert_eq!(channels.len(), 2);
        assert_eq!(channels[0].media_kind, "movie");
        assert_eq!(channels[1].media_kind, "series");
    }

    #[test]
    fn parse_m3u_extinf_with_comma_inside_quoted_tvg_name() {
        let input = r#"
#EXTM3U
#EXTINF:-1 tvg-name="Pamela, A Love Story (2023)" tvg-logo="https://example.com/pamela.jpg" group-title="NETFLIX MOVIES",NF - Pamela, A Love Story (2023)
https://stream.example/pamela.m3u8
"#;

        let channels = parse_m3u_channels(input);
        assert_eq!(channels.len(), 1);
        assert_eq!(channels[0].name, "NF - Pamela, A Love Story (2023)");
        assert_eq!(
            channels[0].tvg_name.as_deref(),
            Some("Pamela, A Love Story (2023)")
        );
        assert_eq!(
            channels[0].logo.as_deref(),
            Some("https://example.com/pamela.jpg")
        );
        assert_eq!(channels[0].group_name.as_deref(), Some("NETFLIX MOVIES"));
        assert_eq!(channels[0].media_kind, "movie");
    }

    #[test]
    fn load_m3u_location_reads_plain_file_path() {
        let root = make_temp_root();
        let path = root.join("sample.m3u");
        fs::write(&path, "#EXTM3U\n#EXTINF:-1,Sample\nhttps://stream.example/a.m3u8\n")
            .expect("failed to write sample m3u");

        let content =
            load_m3u_location(path.to_str().expect("non-utf8 path")).expect("read should succeed");
        assert!(content.contains("#EXTM3U"));
        assert!(content.contains("Sample"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn load_m3u_location_reads_file_url() {
        let root = make_temp_root();
        let path = root.join("sample-url.m3u");
        fs::write(&path, "#EXTM3U\n#EXTINF:-1,Url Sample\nhttps://stream.example/b.m3u8\n")
            .expect("failed to write sample m3u");

        let file_url = url::Url::from_file_path(&path)
            .expect("file path should convert to file URL")
            .to_string();
        let content = load_m3u_location(&file_url).expect("file url read should succeed");
        assert!(content.contains("Url Sample"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn load_m3u_location_rejects_empty_location() {
        let err = load_m3u_location("   ").expect_err("empty location should fail");
        assert!(err.contains("cannot be empty"));
    }
}
