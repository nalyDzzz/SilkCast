//! XMLTV guide download and streaming parse.
//!
//! A whole provider guide is one (often 50-200 MB) document, so it is parsed
//! as it downloads and programmes for channels the catalog doesn't have are
//! skipped without allocating.

use flate2::read::GzDecoder;
use quick_xml::events::{BytesStart, Event};
use quick_xml::Reader;
use std::fs::File;
use std::io::{BufRead, BufReader, Read};
use std::time::{Duration, Instant};

const XMLTV_USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) SilkCast/0.3";
const XMLTV_CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
/// Applies to each read, not the whole download: a large guide can take
/// minutes, but a stalled connection should still fail.
const XMLTV_READ_TIMEOUT: Duration = Duration::from_secs(60);
const READ_BUFFER_BYTES: usize = 256 * 1024;
/// Limits that keep a broken or hostile guide from exhausting memory, disk
/// or time. Real guides for large providers are a few hundred MB unpacked.
const MAX_GUIDE_BYTES: u64 = 2 * 1024 * 1024 * 1024;
const MAX_GUIDE_DURATION: Duration = Duration::from_secs(30 * 60);
/// Longest stretch without `<` or `>`, which bounds one text or tag in memory.
const MAX_MARKUP_GAP_BYTES: u64 = 16 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct XmltvProgramme {
    /// The XMLTV channel id, as written in the document.
    pub channel: String,
    pub start: i64,
    pub stop: i64,
    pub title: String,
    pub description: Option<String>,
}

/// What a parse got through. A document that breaks halfway still yields the
/// programmes before the break, with the reason in `error`.
#[derive(Debug, Default)]
pub struct XmltvParseOutcome {
    pub programmes: usize,
    pub error: Option<String>,
}

pub fn is_remote_guide_url(location: &str) -> bool {
    let trimmed = location.trim();
    trimmed.starts_with("http://") || trimmed.starts_with("https://")
}

/// Opens a guide from an http(s) URL or, when `allow_local` (the user typed
/// the location), a `file://` URL or local path, and transparently un-gzips
/// `.xml.gz` documents. `on_progress` receives the bytes read so far and the
/// total size when the server reports it.
pub fn open_xmltv<F>(
    location: &str,
    allow_local: bool,
    on_progress: F,
) -> Result<Box<dyn BufRead + Send>, String>
where
    F: FnMut(u64, Option<u64>) + Send + 'static,
{
    let trimmed = location.trim();
    if !allow_local && !is_remote_guide_url(trimmed) {
        // A playlist must not make us open local or network (UNC) paths.
        return Err("guide URLs from a playlist must start with http:// or https://".to_string());
    }
    let (raw, total): (Box<dyn Read + Send>, Option<u64>) = if is_remote_guide_url(trimmed) {
        let client = reqwest::blocking::Client::builder()
            .redirect(reqwest::redirect::Policy::limited(10))
            .user_agent(XMLTV_USER_AGENT)
            .connect_timeout(XMLTV_CONNECT_TIMEOUT)
            .timeout(XMLTV_READ_TIMEOUT)
            .build()
            .map_err(|err| format!("failed to build HTTP client for the guide: {err}"))?;
        let response = client
            .get(trimmed)
            .send()
            .map_err(|err| format!("guide download failed: {}", err.without_url()))?
            .error_for_status()
            .map_err(|err| format!("guide server returned an error: {}", err.without_url()))?;
        let total = response.content_length();
        (Box::new(response), total)
    } else {
        let path = match trimmed.strip_prefix("file://") {
            Some(_) => url::Url::parse(trimmed)
                .ok()
                .and_then(|parsed| parsed.to_file_path().ok())
                .ok_or_else(|| "invalid file URL for the guide".to_string())?,
            None => std::path::PathBuf::from(trimmed),
        };
        let file = File::open(&path).map_err(|err| format!("failed to open guide file: {err}"))?;
        let total = file.metadata().ok().map(|meta| meta.len());
        (Box::new(file), total)
    };

    let counted = ProgressReader {
        inner: raw,
        read: 0,
        total,
        on_progress,
    };
    let mut buffered = BufReader::with_capacity(READ_BUFFER_BYTES, counted);
    let head = buffered
        .fill_buf()
        .map_err(|err| format!("failed to read the guide: {err}"))?;
    let document: Box<dyn Read + Send> = if head.starts_with(&[0x1f, 0x8b]) {
        Box::new(GzDecoder::new(buffered))
    } else {
        Box::new(buffered)
    };
    // Guarded after decompression, so a small gzip bomb is caught too.
    Ok(Box::new(BufReader::with_capacity(
        READ_BUFFER_BYTES,
        GuardedReader::new(document),
    )))
}

/// Fails the read once the document is too big, too slow, or has an
/// enormous stretch without markup (one text or tag held in memory).
struct GuardedReader<R> {
    inner: R,
    read: u64,
    since_markup: u64,
    deadline: Instant,
}

impl<R> GuardedReader<R> {
    fn new(inner: R) -> Self {
        Self {
            inner,
            read: 0,
            since_markup: 0,
            deadline: Instant::now() + MAX_GUIDE_DURATION,
        }
    }
}

impl<R: Read> Read for GuardedReader<R> {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        let count = self.inner.read(buf)?;
        let chunk = &buf[..count];
        self.read += count as u64;
        self.since_markup = match chunk.iter().rposition(|b| *b == b'<' || *b == b'>') {
            Some(last) => (count - last - 1) as u64,
            None => self.since_markup + count as u64,
        };
        let problem = if self.read > MAX_GUIDE_BYTES {
            Some("the guide is larger than 2 GB")
        } else if self.since_markup > MAX_MARKUP_GAP_BYTES {
            Some("the guide has an oversized element")
        } else if Instant::now() > self.deadline {
            Some("the guide took longer than 30 minutes to load")
        } else {
            None
        };
        match problem {
            Some(message) => Err(std::io::Error::other(message)),
            None => Ok(count),
        }
    }
}

struct ProgressReader<R, F> {
    inner: R,
    read: u64,
    total: Option<u64>,
    on_progress: F,
}

impl<R: Read, F: FnMut(u64, Option<u64>)> Read for ProgressReader<R, F> {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        let count = self.inner.read(buf)?;
        self.read += count as u64;
        (self.on_progress)(self.read, self.total);
        Ok(count)
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Capture {
    None,
    Title,
    Description,
}

struct PendingProgramme {
    channel: String,
    start: i64,
    stop: i64,
    title: Option<String>,
    description: Option<String>,
}

/// Streams `<programme>` elements out of an XMLTV document.
///
/// `wants(channel, start, stop)` is asked at each programme's opening tag;
/// declined programmes are skipped without reading their text. Accepted ones
/// with a title go to `on_programme`; returning an error stops the parse.
pub fn parse_xmltv<R, W, P>(reader: R, mut wants: W, mut on_programme: P) -> XmltvParseOutcome
where
    R: BufRead,
    W: FnMut(&str, i64, i64) -> bool,
    P: FnMut(XmltvProgramme) -> Result<(), String>,
{
    let mut xml = Reader::from_reader(reader);
    let mut buf = Vec::new();
    let mut outcome = XmltvParseOutcome::default();
    let mut pending: Option<PendingProgramme> = None;
    let mut capture = Capture::None;
    let mut text = String::new();

    loop {
        buf.clear();
        let event = match xml.read_event_into(&mut buf) {
            Ok(event) => event,
            Err(err) => {
                outcome.error = Some(format!(
                    "guide XML is malformed near byte {}: {err}",
                    xml.buffer_position()
                ));
                break;
            }
        };

        match event {
            Event::Start(element) => match element.local_name().as_ref() {
                b"programme" => {
                    pending = programme_header(&element)
                        .filter(|(channel, start, stop)| wants(channel, *start, *stop))
                        .map(|(channel, start, stop)| PendingProgramme {
                            channel,
                            start,
                            stop,
                            title: None,
                            description: None,
                        });
                }
                b"title" if pending.as_ref().is_some_and(|p| p.title.is_none()) => {
                    capture = Capture::Title;
                    text.clear();
                }
                b"desc" if pending.as_ref().is_some_and(|p| p.description.is_none()) => {
                    capture = Capture::Description;
                    text.clear();
                }
                _ => {}
            },
            Event::Text(content) if capture != Capture::None => {
                if let Ok(decoded) = content.xml_content() {
                    text.push_str(&decoded);
                }
            }
            Event::CData(content) if capture != Capture::None => {
                if let Ok(decoded) = content.decode() {
                    text.push_str(&decoded);
                }
            }
            Event::GeneralRef(reference) if capture != Capture::None => {
                push_reference(&mut text, &reference);
            }
            Event::End(element) => match element.local_name().as_ref() {
                b"title" | b"desc" if capture != Capture::None => {
                    let value = text.trim();
                    if let Some(programme) = pending.as_mut() {
                        if !value.is_empty() {
                            match capture {
                                Capture::Title => programme.title = Some(value.to_string()),
                                Capture::Description => {
                                    programme.description = Some(value.to_string())
                                }
                                Capture::None => {}
                            }
                        }
                    }
                    capture = Capture::None;
                }
                b"programme" => {
                    capture = Capture::None;
                    if let Some(PendingProgramme {
                        channel,
                        start,
                        stop,
                        title: Some(title),
                        description,
                    }) = pending.take()
                    {
                        let programme = XmltvProgramme {
                            channel,
                            start,
                            stop,
                            title,
                            description,
                        };
                        if let Err(err) = on_programme(programme) {
                            outcome.error = Some(err);
                            break;
                        }
                        outcome.programmes += 1;
                    }
                }
                _ => {}
            },
            Event::Eof => break,
            _ => {}
        }
    }

    outcome
}

/// `(channel, start, stop)` of a `<programme>` tag with usable times.
fn programme_header(element: &BytesStart<'_>) -> Option<(String, i64, i64)> {
    let mut channel = None;
    let mut start = None;
    let mut stop = None;
    for attribute in element.attributes().flatten() {
        let Ok(value) = attribute.unescape_value() else {
            continue;
        };
        match attribute.key.local_name().as_ref() {
            b"channel" => channel = Some(value.trim().to_string()),
            b"start" => start = parse_xmltv_time(&value),
            b"stop" => stop = parse_xmltv_time(&value),
            _ => {}
        }
    }
    let (channel, start, stop) = (channel?, start?, stop?);
    (!channel.is_empty() && stop > start).then_some((channel, start, stop))
}

fn push_reference(text: &mut String, reference: &quick_xml::events::BytesRef<'_>) {
    if let Ok(Some(ch)) = reference.resolve_char_ref() {
        text.push(ch);
        return;
    }
    let Ok(name) = reference.decode() else {
        return;
    };
    match name.as_ref() {
        "amp" => text.push('&'),
        "lt" => text.push('<'),
        "gt" => text.push('>'),
        "quot" => text.push('"'),
        "apos" => text.push('\''),
        // Not valid XMLTV, but some guides use HTML entities; keep them readable.
        "nbsp" => text.push(' '),
        other => {
            text.push('&');
            text.push_str(other);
            text.push(';');
        }
    }
}

/// Parses an XMLTV timestamp (`YYYYMMDDhhmmss +hhmm`, seconds and offset
/// optional) to unix seconds. A missing offset means UTC.
pub fn parse_xmltv_time(raw: &str) -> Option<i64> {
    let raw = raw.trim();
    let digits = raw.bytes().take_while(u8::is_ascii_digit).count();
    if digits < 12 {
        return None;
    }
    let field = |from: usize, to: usize| raw.get(from..to)?.parse::<i64>().ok();
    let (year, month, day) = (field(0, 4)?, field(4, 6)?, field(6, 8)?);
    let (hour, minute) = (field(8, 10)?, field(10, 12)?);
    let second = if digits >= 14 { field(12, 14)? } else { 0 };
    if !(1..=12).contains(&month)
        || !(1..=31).contains(&day)
        || hour > 23
        || minute > 59
        || second > 60
    {
        return None;
    }

    let mut timestamp =
        days_from_civil(year, month, day) * 86_400 + hour * 3600 + minute * 60 + second;

    let offset = raw[digits..].trim_start();
    let sign = match offset.as_bytes().first() {
        Some(b'+') => 1,
        Some(b'-') => -1,
        _ => return Some(timestamp),
    };
    let offset_digits: String = offset[1..]
        .chars()
        .filter(char::is_ascii_digit)
        .take(4)
        .collect();
    if offset_digits.len() == 4 {
        let hours: i64 = offset_digits[..2].parse().ok()?;
        let minutes: i64 = offset_digits[2..].parse().ok()?;
        timestamp -= sign * (hours * 3600 + minutes * 60);
    }
    Some(timestamp)
}

/// Days since 1970-01-01 for a proleptic Gregorian date (Howard Hinnant).
fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let year = if month <= 2 { year - 1 } else { year };
    let era = if year >= 0 { year } else { year - 399 } / 400;
    let year_of_era = year - era * 400;
    let month_index = (month + 9) % 12;
    let day_of_year = (153 * month_index + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    era * 146_097 + day_of_era - 719_468
}

#[cfg(test)]
mod tests {
    use super::*;
    use flate2::write::GzEncoder;
    use flate2::Compression;
    use std::io::{Cursor, Write};

    const SAMPLE: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE tv SYSTEM "xmltv.dtd">
<tv generator-info-name="test">
  <channel id="news.uk"><display-name>News</display-name></channel>
  <programme start="20261027180000 +0000" stop="20261027190000 +0000" channel="news.uk">
    <title lang="en">Evening &amp; Night</title>
    <title lang="fr">Soir</title>
    <desc lang="en"><![CDATA[Headlines <live>]]></desc>
  </programme>
  <programme start="20261027190000 +0100" stop="20261027200000 +0100" channel="news.uk">
    <title>Weather &#8212; Coast</title>
  </programme>
  <programme start="20261027180000 +0000" stop="20261027190000 +0000" channel="other.us">
    <title>Skipped</title>
  </programme>
  <programme start="bad" stop="20261027190000 +0000" channel="news.uk">
    <title>No start</title>
  </programme>
  <programme start="20261027200000 +0000" stop="20261027210000 +0000" channel="news.uk">
    <desc>No title</desc>
  </programme>
</tv>"#;

    fn collect(input: impl BufRead) -> (Vec<XmltvProgramme>, XmltvParseOutcome) {
        let mut programmes = Vec::new();
        let outcome = parse_xmltv(
            input,
            |channel, _, _| channel == "news.uk",
            |programme| {
                programmes.push(programme);
                Ok(())
            },
        );
        (programmes, outcome)
    }

    #[test]
    fn parses_wanted_programmes_with_text_and_offsets() {
        let (programmes, outcome) = collect(Cursor::new(SAMPLE));
        assert!(outcome.error.is_none(), "{:?}", outcome.error);
        assert_eq!(outcome.programmes, 2);

        let evening = 1_793_124_000; // 2026-10-27 18:00 UTC
        assert_eq!(
            programmes[0],
            XmltvProgramme {
                channel: "news.uk".to_string(),
                start: evening,
                stop: evening + 3600,
                title: "Evening & Night".to_string(),
                description: Some("Headlines <live>".to_string()),
            }
        );
        // 19:00 at +01:00 is 18:00 UTC.
        assert_eq!(programmes[1].start, evening);
        assert_eq!(programmes[1].title, "Weather \u{2014} Coast");
        assert_eq!(programmes[1].description, None);
    }

    #[test]
    fn reads_gzipped_guides() {
        let mut encoder = GzEncoder::new(Vec::new(), Compression::fast());
        encoder.write_all(SAMPLE.as_bytes()).expect("gzip write");
        let gz = encoder.finish().expect("gzip finish");

        let dir = std::env::temp_dir().join(format!("silkcast-xmltv-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("temp dir");
        let path = dir.join("guide.xml.gz");
        std::fs::write(&path, gz).expect("write guide");

        let reader = open_xmltv(path.to_str().expect("utf8 path"), true, |_, _| {}).expect("open");
        let (programmes, outcome) = collect(reader);
        assert_eq!(outcome.programmes, 2);
        assert_eq!(programmes[0].title, "Evening & Night");

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn keeps_programmes_before_a_broken_tail() {
        let truncated = &SAMPLE[..SAMPLE.find("other.us").expect("marker")];
        let broken = format!("{truncated}\"><title>Cut</wrong></programme></tv>");
        let (programmes, outcome) = collect(Cursor::new(broken));
        assert_eq!(programmes.len(), 2);
        assert!(outcome.error.is_some());
    }

    #[test]
    fn playlist_guide_urls_must_be_remote() {
        for location in [
            r"\\attacker\share\guide.xml",
            "C:/guide.xml",
            "file:///etc/passwd",
        ] {
            let err = open_xmltv(location, false, |_, _| {})
                .err()
                .expect("local guide from a playlist is refused");
            assert!(err.contains("http://"), "{err}");
        }
    }

    #[test]
    fn guarded_reader_stops_runaway_text() {
        let endless = std::io::repeat(b'a').take(MAX_MARKUP_GAP_BYTES + 1024);
        let mut sink = Vec::new();
        let err = GuardedReader::new(endless)
            .read_to_end(&mut sink)
            .expect_err("oversized element is refused");
        assert!(err.to_string().contains("oversized"), "{err}");

        let mut fine = Vec::new();
        GuardedReader::new(std::io::Cursor::new(SAMPLE))
            .read_to_end(&mut fine)
            .expect("normal guide reads");
        assert_eq!(fine.len(), SAMPLE.len());
    }

    #[test]
    fn parses_xmltv_times() {
        assert_eq!(parse_xmltv_time("19700101000000 +0000"), Some(0));
        assert_eq!(parse_xmltv_time("19700101010000 +0100"), Some(0));
        assert_eq!(parse_xmltv_time("19700101000000 -0130"), Some(5400));
        assert_eq!(parse_xmltv_time("197001010000"), Some(0));
        assert_eq!(parse_xmltv_time("20240229123000"), Some(1_709_209_800));
        assert_eq!(parse_xmltv_time("20261027180000+0000"), Some(1_793_124_000));
        assert_eq!(parse_xmltv_time("2026"), None);
        assert_eq!(parse_xmltv_time("20261327180000"), None);
    }
}
