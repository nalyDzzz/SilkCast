//! HLS playlist detection and URI rewriting for the local stream proxy.
//!
//! Every URI inside a proxied playlist is resolved against the playlist's final
//! (post-redirect) URL and replaced with a proxy URL, so segment, key, rendition
//! and variant requests made by the web player also go through the proxy.

use std::borrow::Cow;
use url::{form_urlencoded, Url};

const UTF8_BOM: char = '\u{feff}';
const PLAYLIST_SIGNATURE: &[u8] = b"#EXTM3U";

/// Builds `{proxy_base}/stream?url={percent-encoded target}`.
///
/// The encoding decodes with `form_urlencoded::parse`, the same decoder used
/// for URLs the frontend builds with `encodeURIComponent`.
pub fn proxied_stream_url(proxy_base: &str, target: &str) -> String {
    let encoded: String = form_urlencoded::byte_serialize(target.as_bytes()).collect();
    format!("{proxy_base}/stream?url={encoded}")
}

/// True for the HLS playlist MIME types (application/vnd.apple.mpegurl,
/// application/x-mpegurl, audio/mpegurl, audio/x-mpegurl, ...).
pub fn is_playlist_content_type(content_type: &str) -> bool {
    content_type.to_ascii_lowercase().contains("mpegurl")
}

/// True when the URL path ends in `.m3u8` or `.m3u`.
pub fn has_playlist_extension(url: &Url) -> bool {
    let path = url.path().to_ascii_lowercase();
    path.ends_with(".m3u8") || path.ends_with(".m3u")
}

/// True when the body starts with `#EXTM3U`, ignoring a UTF-8 BOM and leading whitespace.
pub fn looks_like_playlist(prefix: &[u8]) -> bool {
    let without_bom = prefix.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(prefix);
    let start = without_bom
        .iter()
        .position(|byte| !byte.is_ascii_whitespace())
        .unwrap_or(without_bom.len());
    without_bom[start..].starts_with(PLAYLIST_SIGNATURE)
}

/// Rewrites every URI line and every `URI="..."` attribute in an HLS playlist to
/// point at the proxy. Line endings and all other content are preserved.
pub fn rewrite_hls_playlist(body: &str, playlist_url: &Url, proxy_base: &str) -> String {
    let (bom, body) = match body.strip_prefix(UTF8_BOM) {
        Some(rest) => (Some(UTF8_BOM), rest),
        None => (None, body),
    };

    let mut output = String::with_capacity(body.len() * 2);
    if let Some(bom) = bom {
        output.push(bom);
    }

    for raw_line in body.split_inclusive('\n') {
        let (content, ending) = split_line_ending(raw_line);
        output.push_str(&rewrite_line(content, playlist_url, proxy_base));
        output.push_str(ending);
    }

    output
}

fn split_line_ending(line: &str) -> (&str, &str) {
    if let Some(content) = line.strip_suffix("\r\n") {
        (content, "\r\n")
    } else if let Some(content) = line.strip_suffix('\n') {
        (content, "\n")
    } else {
        (line, "")
    }
}

fn rewrite_line<'a>(line: &'a str, playlist_url: &Url, proxy_base: &str) -> Cow<'a, str> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return Cow::Borrowed(line);
    }

    if trimmed.starts_with('#') {
        return rewrite_tag_uri_attributes(line, playlist_url, proxy_base);
    }

    match proxy_uri(trimmed, playlist_url, proxy_base) {
        Some(proxied) => {
            let leading = line.len() - line.trim_start().len();
            let trailing_start = leading + trimmed.len();
            Cow::Owned(format!(
                "{}{}{}",
                &line[..leading],
                proxied,
                &line[trailing_start..]
            ))
        }
        None => Cow::Borrowed(line),
    }
}

/// Resolves `uri` against the playlist URL and wraps it in a proxy URL.
/// Non-http(s) URIs (e.g. `skd://`, `data:`) are left alone.
fn proxy_uri(uri: &str, playlist_url: &Url, proxy_base: &str) -> Option<String> {
    let resolved = playlist_url.join(uri).ok()?;
    if !matches!(resolved.scheme(), "http" | "https") {
        return None;
    }
    Some(proxied_stream_url(proxy_base, resolved.as_str()))
}

fn is_uri_attribute(name: &str) -> bool {
    // `URI` covers EXT-X-KEY/SESSION-KEY/MAP/MEDIA/I-FRAME-STREAM-INF/PART/...;
    // the suffix form covers SERVER-URI (content steering) and X-ASSET-URI (interstitials).
    name == "URI" || name.ends_with("-URI")
}

/// Rewrites quoted URI attributes in an `#EXT-X-...:<attribute-list>` tag line.
fn rewrite_tag_uri_attributes<'a>(
    line: &'a str,
    playlist_url: &Url,
    proxy_base: &str,
) -> Cow<'a, str> {
    if !line.trim_start().starts_with("#EXT-X-") || !line.contains("URI=\"") {
        return Cow::Borrowed(line);
    }
    let Some(colon) = line.find(':') else {
        return Cow::Borrowed(line);
    };

    let mut output = String::with_capacity(line.len() * 2);
    output.push_str(&line[..=colon]);
    let mut rest = &line[colon + 1..];
    let mut changed = false;

    while !rest.is_empty() {
        let Some(eq) = rest.find('=') else {
            output.push_str(rest);
            break;
        };
        let name = &rest[..eq];
        if name.contains([',', '"']) {
            // Not a well-formed attribute list; keep the remainder untouched.
            output.push_str(rest);
            break;
        }
        output.push_str(&rest[..=eq]);
        rest = &rest[eq + 1..];

        let value_len = if let Some(quoted) = rest.strip_prefix('"') {
            let Some(close) = quoted.find('"') else {
                output.push_str(rest);
                break;
            };
            let value = &quoted[..close];
            match is_uri_attribute(name.trim())
                .then(|| proxy_uri(value, playlist_url, proxy_base))
                .flatten()
            {
                Some(proxied) => {
                    output.push('"');
                    output.push_str(&proxied);
                    output.push('"');
                    changed = true;
                }
                None => output.push_str(&rest[..close + 2]),
            }
            close + 2
        } else {
            let end = rest.find(',').unwrap_or(rest.len());
            output.push_str(&rest[..end]);
            end
        };
        rest = &rest[value_len..];

        // Copy anything between the value and the next separator verbatim.
        let separator = rest.find(',').map_or(rest.len(), |index| index + 1);
        output.push_str(&rest[..separator]);
        rest = &rest[separator..];
    }

    if changed {
        Cow::Owned(output)
    } else {
        Cow::Borrowed(line)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const PROXY_BASE: &str = "http://127.0.0.1:4000/secret";

    fn playlist_url() -> Url {
        Url::parse("http://lb.example.com:8080/hls/abc/index.m3u8?token=t1").unwrap()
    }

    fn proxied(target: &str) -> String {
        proxied_stream_url(PROXY_BASE, target)
    }

    fn decode_proxied(line: &str) -> String {
        let query = line
            .strip_prefix(&format!("{PROXY_BASE}/stream?"))
            .unwrap_or_else(|| panic!("line is not a proxy URL: {line}"));
        form_urlencoded::parse(query.as_bytes())
            .find(|(key, _)| key == "url")
            .map(|(_, value)| value.into_owned())
            .expect("proxy URL should carry a url parameter")
    }

    #[test]
    fn rewrites_relative_segment_paths_against_playlist_url() {
        let body = "#EXTM3U\n#EXTINF:4.0,\nseg1.ts\n#EXTINF:4.0,\n../other/seg2.ts\n#EXTINF:4.0,\n/root/seg3.ts\n";
        let output = rewrite_hls_playlist(body, &playlist_url(), PROXY_BASE);
        let uris: Vec<&str> = output.lines().filter(|l| !l.starts_with('#')).collect();

        assert_eq!(uris.len(), 3);
        assert_eq!(
            decode_proxied(uris[0]),
            "http://lb.example.com:8080/hls/abc/seg1.ts"
        );
        assert_eq!(
            decode_proxied(uris[1]),
            "http://lb.example.com:8080/hls/other/seg2.ts"
        );
        assert_eq!(
            decode_proxied(uris[2]),
            "http://lb.example.com:8080/root/seg3.ts"
        );
    }

    #[test]
    fn rewrites_absolute_and_protocol_relative_urls() {
        let body = "#EXTM3U\nhttps://cdn.example.net/a/seg.ts\n//cdn2.example.net/b.ts\n";
        let output = rewrite_hls_playlist(body, &playlist_url(), PROXY_BASE);
        let lines: Vec<&str> = output.lines().collect();

        assert_eq!(lines[1], proxied("https://cdn.example.net/a/seg.ts"));
        assert_eq!(decode_proxied(lines[2]), "http://cdn2.example.net/b.ts");
    }

    #[test]
    fn rewrites_uri_attributes_in_key_media_and_map_tags() {
        let body = concat!(
            "#EXTM3U\n",
            "#EXT-X-KEY:METHOD=AES-128,URI=\"keys/k1.bin\",IV=0x1234\n",
            "#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID=\"aud\",NAME=\"English, US\",DEFAULT=YES,URI=\"audio/en.m3u8\"\n",
            "#EXT-X-MAP:URI=\"init.mp4\",BYTERANGE=\"720@0\"\n",
            "#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=86000,URI=\"iframe.m3u8\"\n",
        );
        let output = rewrite_hls_playlist(body, &playlist_url(), PROXY_BASE);
        let lines: Vec<&str> = output.lines().collect();

        assert_eq!(
            lines[1],
            format!(
                "#EXT-X-KEY:METHOD=AES-128,URI=\"{}\",IV=0x1234",
                proxied("http://lb.example.com:8080/hls/abc/keys/k1.bin")
            )
        );
        assert_eq!(
            lines[2],
            format!(
                "#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID=\"aud\",NAME=\"English, US\",DEFAULT=YES,URI=\"{}\"",
                proxied("http://lb.example.com:8080/hls/abc/audio/en.m3u8")
            )
        );
        assert_eq!(
            lines[3],
            format!(
                "#EXT-X-MAP:URI=\"{}\",BYTERANGE=\"720@0\"",
                proxied("http://lb.example.com:8080/hls/abc/init.mp4")
            )
        );
        assert_eq!(
            lines[4],
            format!(
                "#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=86000,URI=\"{}\"",
                proxied("http://lb.example.com:8080/hls/abc/iframe.m3u8")
            )
        );
    }

    #[test]
    fn leaves_non_http_key_uris_untouched() {
        let body = concat!(
            "#EXTM3U\n",
            "#EXT-X-KEY:METHOD=SAMPLE-AES,URI=\"skd://key-id\",KEYFORMAT=\"com.apple.streamingkeydelivery\"\n",
            "#EXT-X-KEY:METHOD=SAMPLE-AES,URI=\"data:text/plain;base64,AAAA\"\n",
        );
        let output = rewrite_hls_playlist(body, &playlist_url(), PROXY_BASE);
        assert_eq!(output, body);
    }

    #[test]
    fn rewrites_master_playlist_variant_lines() {
        let body = concat!(
            "#EXTM3U\n",
            "#EXT-X-STREAM-INF:BANDWIDTH=1280000,RESOLUTION=1280x720,CODECS=\"avc1.4d401f,mp4a.40.2\"\n",
            "720p/index.m3u8\n",
            "#EXT-X-STREAM-INF:BANDWIDTH=640000,RESOLUTION=640x360\n",
            "http://other.example.com/360p.m3u8\n",
        );
        let output = rewrite_hls_playlist(body, &playlist_url(), PROXY_BASE);
        let lines: Vec<&str> = output.lines().collect();

        assert_eq!(
            lines[1],
            "#EXT-X-STREAM-INF:BANDWIDTH=1280000,RESOLUTION=1280x720,CODECS=\"avc1.4d401f,mp4a.40.2\""
        );
        assert_eq!(
            decode_proxied(lines[2]),
            "http://lb.example.com:8080/hls/abc/720p/index.m3u8"
        );
        assert_eq!(lines[4], proxied("http://other.example.com/360p.m3u8"));
    }

    #[test]
    fn preserves_crlf_line_endings_and_missing_trailing_newline() {
        let body = "#EXTM3U\r\n#EXTINF:4.0,\r\nseg1.ts\r\n\r\n#EXTINF:4.0,\r\nseg2.ts";
        let output = rewrite_hls_playlist(body, &playlist_url(), PROXY_BASE);

        let expected = format!(
            "#EXTM3U\r\n#EXTINF:4.0,\r\n{}\r\n\r\n#EXTINF:4.0,\r\n{}",
            proxied("http://lb.example.com:8080/hls/abc/seg1.ts"),
            proxied("http://lb.example.com:8080/hls/abc/seg2.ts")
        );
        assert_eq!(output, expected);
    }

    #[test]
    fn leaves_comments_and_tags_without_uris_untouched() {
        let body = concat!(
            "#EXTM3U\n",
            "#EXT-X-VERSION:3\n",
            "#EXT-X-TARGETDURATION:10\n",
            "#EXT-X-MEDIA-SEQUENCE:42\n",
            "# a plain comment mentioning URI=\"nope.ts\"\n",
            "#EXTINF:9.97,Title, with commas\n",
            "#EXT-X-DISCONTINUITY\n",
            "#EXT-X-ENDLIST\n",
        );
        let output = rewrite_hls_playlist(body, &playlist_url(), PROXY_BASE);
        assert_eq!(output, body);
    }

    #[test]
    fn preserves_and_encodes_query_strings() {
        let body = "#EXTM3U\nseg1.ts?token=a+b&expires=1700000000&sig=x%2Fy\n";
        let output = rewrite_hls_playlist(body, &playlist_url(), PROXY_BASE);
        let line = output.lines().nth(1).unwrap();

        let encoded = line
            .strip_prefix(&format!("{PROXY_BASE}/stream?url="))
            .expect("line should be a proxy URL");
        assert!(
            !encoded.contains(['&', '?', '/', ':', '=']),
            "target URL must be fully percent-encoded: {encoded}"
        );
        assert_eq!(
            decode_proxied(line),
            "http://lb.example.com:8080/hls/abc/seg1.ts?token=a+b&expires=1700000000&sig=x%2Fy"
        );
    }

    #[test]
    fn preserves_utf8_bom_and_whitespace_around_uri_lines() {
        let body = "\u{feff}#EXTM3U\n  seg1.ts \n";
        let output = rewrite_hls_playlist(body, &playlist_url(), PROXY_BASE);
        assert_eq!(
            output,
            format!(
                "\u{feff}#EXTM3U\n  {} \n",
                proxied("http://lb.example.com:8080/hls/abc/seg1.ts")
            )
        );
    }

    #[test]
    fn detects_playlists_by_content_type_extension_and_signature() {
        assert!(is_playlist_content_type("application/vnd.apple.mpegurl"));
        assert!(is_playlist_content_type(
            "application/x-mpegURL; charset=utf-8"
        ));
        assert!(is_playlist_content_type("audio/mpegurl"));
        assert!(is_playlist_content_type("audio/x-mpegurl"));
        assert!(!is_playlist_content_type("video/mp2t"));

        assert!(has_playlist_extension(
            &Url::parse("http://a.example/live/1.m3u8?x=1").unwrap()
        ));
        assert!(has_playlist_extension(
            &Url::parse("http://a.example/list.M3U").unwrap()
        ));
        assert!(!has_playlist_extension(
            &Url::parse("http://a.example/live/1.ts").unwrap()
        ));

        assert!(looks_like_playlist(b"#EXTM3U\n"));
        assert!(looks_like_playlist(b"\xEF\xBB\xBF\r\n  #EXTM3U\n"));
        assert!(!looks_like_playlist(b"\x47\x40\x00\x10"));
        assert!(!looks_like_playlist(b""));
    }
}
