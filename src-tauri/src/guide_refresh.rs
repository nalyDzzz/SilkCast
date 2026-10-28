//! Refreshing a source's programme guide.
//!
//! The whole guide comes from one XMLTV document when the source has one
//! (Xtream's `xmltv.php`, a playlist's `url-tvg`, or a URL set by the user).
//! Xtream providers without a usable XMLTV feed fall back to one short-EPG
//! request per guide id.

use crate::foundation::{
    append_log, configured_guide_url, get_source_by_id, list_channels_for_source,
    redact_credentials, SourceRecord,
};
use crate::guide_store::{
    finish_guide_refresh, get_detected_guide_url, guide_key, list_guide_keys, list_settled_keys,
    store_key_programmes, GuideStaging, GuideSummary, StoredProgramme,
};
use crate::xmltv::{is_remote_guide_url, open_xmltv, parse_xmltv, XmltvProgramme};
use crate::xtream::{
    extract_live_stream_id, xtream_xmltv_url, LiveEpgEntryRecord, XtreamConfig, XtreamEpgSession,
};
use serde::Serialize;
use std::cell::Cell;
use std::collections::HashSet;
use std::path::Path;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{mpsc, Arc};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

/// Programmes kept from before now, so the guide's first slot isn't empty.
const KEEP_PAST_SECONDS: i64 = 2 * 3600;
/// Programmes kept ahead of now. Guides refresh every 12 hours or so.
const KEEP_AHEAD_SECONDS: i64 = 24 * 3600;
/// Programmes requested per channel from the short-EPG API: one request
/// whatever the count, and enough for the guide's few-hour timeline.
pub const EPG_FETCH_LIMIT: usize = 12;
const PER_CHANNEL_CONCURRENCY: usize = 8;
/// A guide id fetched this recently is skipped while its programmes still
/// run `NEEDED_AHEAD_SECONDS` ahead (or the provider had none).
const SETTLED_FOR_SECONDS: i64 = 6 * 3600;
const NEEDED_AHEAD_SECONDS: i64 = 3 * 3600;
/// Per-channel results saved per transaction, so the guide fills in as it goes.
const PER_CHANNEL_SAVE_BATCH: usize = 200;
const PROGRESS_INTERVAL: Duration = Duration::from_millis(250);
/// More than any real guide holds for a day of one source's channels.
const MAX_STAGED_PROGRAMMES: usize = 2_000_000;
const MAX_LOGGED_CHANNEL_FAILURES: usize = 20;

#[derive(Debug, Clone, Default, Serialize)]
pub struct GuideProgress {
    /// `downloading`, `saving` or `fetching` (per channel).
    pub phase: &'static str,
    pub bytes: u64,
    pub total_bytes: Option<u64>,
    pub programmes: usize,
    pub channels_done: usize,
    pub channels_total: usize,
}

#[derive(Debug)]
pub struct GuideRefreshOutcome {
    /// `xmltv` or `short_epg`.
    pub method: &'static str,
    pub summary: GuideSummary,
    /// Why XMLTV wasn't used, when the per-channel fallback ran.
    pub warning: Option<String>,
}

pub fn unix_now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

/// Where to read a guide from. Only locations the user typed may be local
/// files; a playlist header or provider can only point at http(s).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GuideLocation {
    pub url: String,
    pub user_set: bool,
}

/// The XMLTV documents to read for a source, in order.
pub fn guide_urls(
    source: &SourceRecord,
    detected: Option<&str>,
) -> Result<Vec<GuideLocation>, String> {
    if let Some(list) = configured_guide_url(&source.config) {
        return Ok(split_guide_urls(list)
            .into_iter()
            .map(|url| GuideLocation {
                url,
                user_set: true,
            })
            .collect());
    }
    let advertised: Vec<GuideLocation> = split_guide_urls(detected.unwrap_or_default())
        .into_iter()
        .filter(|url| is_remote_guide_url(url))
        .map(|url| GuideLocation {
            url,
            user_set: false,
        })
        .collect();
    if !advertised.is_empty() {
        return Ok(advertised);
    }
    if source.source_type == "xtream" {
        return Ok(vec![GuideLocation {
            url: xtream_xmltv_url(&XtreamConfig::from_value(&source.config)?),
            user_set: false,
        }]);
    }
    Ok(Vec::new())
}

/// Splits a comma-separated list of guide URLs, dropping blanks and repeats.
pub fn split_guide_urls(raw: &str) -> Vec<String> {
    let mut seen = HashSet::new();
    raw.split(',')
        .map(str::trim)
        .filter(|url| !url.is_empty())
        .filter(|url| seen.insert(url.to_string()))
        .map(str::to_string)
        .collect()
}

pub fn refresh_source_guide(
    db_path: &Path,
    log_path: &Path,
    source_id: i64,
    progress: &dyn Fn(GuideProgress),
) -> Result<GuideRefreshOutcome, String> {
    let source = get_source_by_id(db_path, source_id)?
        .ok_or_else(|| format!("source {source_id} not found"))?;
    let keys = list_guide_keys(db_path, source_id)?;
    if keys.is_empty() {
        return Err(
            "None of this source's live channels has a guide id (tvg-id) to match a guide against."
                .to_string(),
        );
    }

    let urls = guide_urls(
        &source,
        get_detected_guide_url(db_path, source_id)?.as_deref(),
    )?;
    let now = unix_now();
    let mut xmltv_problem = None;
    if !urls.is_empty() {
        match import_xmltv(db_path, log_path, source_id, &urls, &keys, now, progress) {
            Ok(Some(summary)) => {
                return Ok(GuideRefreshOutcome {
                    method: "xmltv",
                    summary,
                    warning: None,
                })
            }
            Ok(None) => {
                xmltv_problem =
                    Some("the guide listed no programmes for this source's channels".to_string())
            }
            Err(err) => xmltv_problem = Some(err),
        }
    }

    if source.source_type == "xtream" {
        if let Some(problem) = &xmltv_problem {
            let _ = append_log(
                log_path,
                "WARN",
                &redact_credentials(&format!(
                    "xmltv guide unusable for source {source_id} ({problem}); fetching per channel"
                )),
            );
        }
        let summary = refresh_per_channel(db_path, log_path, &source, now, progress)?;
        return Ok(GuideRefreshOutcome {
            method: "short_epg",
            summary,
            warning: xmltv_problem,
        });
    }

    Err(match xmltv_problem {
        Some(problem) => format!("Couldn't load the guide: {problem}"),
        None => "This playlist doesn't name a guide (XMLTV) URL.".to_string(),
    })
}

struct Throttle(Option<Instant>);

impl Throttle {
    fn ready(&mut self) -> bool {
        let due = self
            .0
            .is_none_or(|last| last.elapsed() >= PROGRESS_INTERVAL);
        if due {
            self.0 = Some(Instant::now());
        }
        due
    }
}

/// Stages every wanted programme from `urls` and swaps them in. `Ok(None)`
/// means the documents loaded but had nothing for this source's channels.
fn import_xmltv(
    db_path: &Path,
    log_path: &Path,
    source_id: i64,
    urls: &[GuideLocation],
    keys: &HashSet<String>,
    now: i64,
    progress: &dyn Fn(GuideProgress),
) -> Result<Option<GuideSummary>, String> {
    let (window_start, window_end) = (now - KEEP_PAST_SECONDS, now + KEEP_AHEAD_SECONDS);
    let mut staging = GuideStaging::begin(db_path, source_id)?;
    let mut failures = Vec::new();
    let mut throttle = Throttle(None);

    for location in urls {
        let bytes = Arc::new(AtomicU64::new(0));
        let total = Arc::new(AtomicU64::new(0));
        let reader = {
            let (bytes, total) = (Arc::clone(&bytes), Arc::clone(&total));
            open_xmltv(&location.url, location.user_set, move |read, size| {
                bytes.store(read, Ordering::Relaxed);
                total.store(size.unwrap_or(0), Ordering::Relaxed);
            })
        };
        let reader = match reader {
            Ok(reader) => reader,
            Err(err) => {
                failures.push(err);
                continue;
            }
        };

        let staged_before = staging.staged();
        let accepted = Cell::new(staged_before);
        let mut key = String::new();
        let outcome = parse_xmltv(
            reader,
            |channel, start, stop| {
                if throttle.ready() {
                    progress(GuideProgress {
                        phase: "downloading",
                        bytes: bytes.load(Ordering::Relaxed),
                        total_bytes: Some(total.load(Ordering::Relaxed)).filter(|size| *size > 0),
                        programmes: accepted.get(),
                        ..GuideProgress::default()
                    });
                }
                if stop <= window_start || start >= window_end {
                    return false;
                }
                key.clear();
                key.push_str(channel.trim_matches(' '));
                key.make_ascii_lowercase();
                keys.contains(key.as_str())
            },
            |XmltvProgramme {
                 channel,
                 start,
                 stop,
                 title,
                 description,
             }| {
                if accepted.get() >= MAX_STAGED_PROGRAMMES {
                    return Err(format!(
                        "the guide lists more than {MAX_STAGED_PROGRAMMES} programmes for this source"
                    ));
                }
                accepted.set(accepted.get() + 1);
                staging.push(
                    guide_key(&channel),
                    StoredProgramme {
                        title,
                        description,
                        start,
                        end: stop,
                    },
                )
            },
        );

        if let Some(err) = outcome.error {
            if staging.staged() == staged_before {
                failures.push(err);
            } else {
                let _ = append_log(
                    log_path,
                    "WARN",
                    &redact_credentials(&format!(
                        "guide for source {source_id} ended early; kept {} programmes: {err}",
                        outcome.programmes
                    )),
                );
            }
        }
    }

    if staging.staged() == 0 {
        return if failures.len() == urls.len() {
            Err(failures.join("; "))
        } else {
            Ok(None)
        };
    }

    progress(GuideProgress {
        phase: "saving",
        programmes: staging.staged(),
        ..GuideProgress::default()
    });
    staging.commit("xmltv", now).map(Some)
}

struct KeyJob {
    key: String,
    stream_id: String,
    channel_name: String,
}

fn to_stored_programmes(entries: Vec<LiveEpgEntryRecord>) -> Vec<StoredProgramme> {
    entries
        .into_iter()
        .filter_map(|entry| match (entry.start_timestamp, entry.end_timestamp) {
            (Some(start), Some(end)) if end > start => Some(StoredProgramme {
                title: entry.title,
                description: entry.description,
                start,
                end,
            }),
            _ => None,
        })
        .collect()
}

/// Asks the provider for each guide id's next few programmes, through the
/// first channel that has the id, and saves results in batches as they arrive.
fn refresh_per_channel(
    db_path: &Path,
    log_path: &Path,
    source: &SourceRecord,
    now: i64,
    progress: &dyn Fn(GuideProgress),
) -> Result<GuideSummary, String> {
    let config = XtreamConfig::from_value(&source.config)?;
    let settled = list_settled_keys(
        db_path,
        source.id,
        now - SETTLED_FOR_SECONDS,
        now + NEEDED_AHEAD_SECONDS,
    )?;
    let mut seen = HashSet::new();
    let jobs: Vec<KeyJob> =
        list_channels_for_source(db_path, source.id, Some("live"), None, None, false)?
            .into_iter()
            .filter_map(|channel| {
                let key = guide_key(channel.tvg_id.as_deref()?);
                if key.is_empty() || settled.contains(&key) || !seen.insert(key.clone()) {
                    return None;
                }
                Some(KeyJob {
                    key,
                    stream_id: extract_live_stream_id(&channel)?,
                    channel_name: channel.name,
                })
            })
            .collect();

    let total = jobs.len();
    if total > 0 {
        // Fails fast on a bad configuration instead of in every worker.
        XtreamEpgSession::new(config.clone())?;
    }

    let jobs = Arc::new(jobs);
    let next = Arc::new(AtomicUsize::new(0));
    let (tx, rx) = mpsc::channel::<(usize, Result<Vec<LiveEpgEntryRecord>, String>)>();
    let workers: Vec<_> = (0..PER_CHANNEL_CONCURRENCY.min(total))
        .map(|_| {
            let (tx, jobs, next, config) = (
                tx.clone(),
                Arc::clone(&jobs),
                Arc::clone(&next),
                config.clone(),
            );
            thread::spawn(move || {
                let Ok(session) = XtreamEpgSession::new(config) else {
                    return;
                };
                loop {
                    let index = next.fetch_add(1, Ordering::Relaxed);
                    let Some(job) = jobs.get(index) else {
                        break;
                    };
                    let result = session.fetch_live_epg(&job.stream_id, EPG_FETCH_LIMIT);
                    if tx.send((index, result)).is_err() {
                        break;
                    }
                }
            })
        })
        .collect();
    drop(tx);

    let mut batch = Vec::with_capacity(PER_CHANNEL_SAVE_BATCH);
    let (mut done, mut failed, mut saved_programmes) = (0usize, 0usize, 0usize);
    let mut throttle = Throttle(None);
    let mut store_error = None;
    for (index, result) in rx {
        done += 1;
        let job = &jobs[index];
        match result {
            Ok(entries) => {
                let programmes = to_stored_programmes(entries);
                saved_programmes += programmes.len();
                batch.push((job.key.clone(), programmes));
            }
            Err(err) => {
                failed += 1;
                if failed <= MAX_LOGGED_CHANNEL_FAILURES {
                    let _ = append_log(
                        log_path,
                        "WARN",
                        &redact_credentials(&format!(
                            "guide fetch failed for channel {}: {err}",
                            job.channel_name
                        )),
                    );
                }
            }
        }
        if batch.len() >= PER_CHANNEL_SAVE_BATCH || done == total {
            if let Err(err) = store_key_programmes(db_path, source.id, &batch, now) {
                store_error = Some(err);
                break;
            }
            batch.clear();
        }
        if throttle.ready() || done == total {
            progress(GuideProgress {
                phase: "fetching",
                programmes: saved_programmes,
                channels_done: done,
                channels_total: total,
                ..GuideProgress::default()
            });
        }
    }
    for worker in workers {
        let _ = worker.join();
    }

    if let Some(err) = store_error {
        return Err(err);
    }
    if failed > MAX_LOGGED_CHANNEL_FAILURES {
        let _ = append_log(
            log_path,
            "WARN",
            &format!(
                "guide fetch failed for {failed} of {total} channels of source {}",
                source.id
            ),
        );
    }
    if total > 0 && failed == total {
        return Err("The provider didn't answer guide requests for any channel.".to_string());
    }
    finish_guide_refresh(db_path, source.id, "short_epg", now)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::foundation::{
        create_source, ensure_foundation_dirs, init_storage, list_channels_for_source,
        list_sources, replace_channels_for_source, ChannelInsertRecord,
    };
    use crate::guide_store::{list_programmes_for_channels, set_detected_guide_url};
    use serde_json::json;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::Mutex;

    fn temp_root() -> std::path::PathBuf {
        static NEXT: AtomicUsize = AtomicUsize::new(0);
        let seq = NEXT.fetch_add(1, Ordering::Relaxed);
        let root = std::env::temp_dir().join(format!(
            "silkcast-guide-refresh-test-{}-{seq}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&root);
        root
    }

    fn xmltv_time(ts: i64) -> String {
        // Seconds since epoch to `YYYYMMDDhhmmss +0000` (civil-from-days, Hinnant).
        let days = ts.div_euclid(86_400);
        let secs = ts.rem_euclid(86_400);
        let z = days + 719_468;
        let era = z.div_euclid(146_097);
        let doe = z - era * 146_097;
        let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
        let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        let mp = (5 * doy + 2) / 153;
        let day = doy - (153 * mp + 2) / 5 + 1;
        let month = if mp < 10 { mp + 3 } else { mp - 9 };
        let year = yoe + era * 400 + i64::from(month <= 2);
        format!(
            "{year:04}{month:02}{day:02}{:02}{:02}{:02} +0000",
            secs / 3600,
            secs % 3600 / 60,
            secs % 60
        )
    }

    /// Serves `body` for every request and records the request paths.
    fn serve(body: String, requests: usize) -> (String, Arc<Mutex<Vec<String>>>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
        let address = listener.local_addr().expect("addr");
        let seen = Arc::new(Mutex::new(Vec::new()));
        let log = Arc::clone(&seen);
        thread::spawn(move || {
            for _ in 0..requests {
                let Ok((mut stream, _)) = listener.accept() else {
                    return;
                };
                let mut buffer = [0u8; 4096];
                let read = stream.read(&mut buffer).unwrap_or(0);
                let request = String::from_utf8_lossy(&buffer[..read]).to_string();
                let path = request.split_whitespace().nth(1).unwrap_or("").to_string();
                log.lock().expect("lock").push(path);
                let _ = write!(
                    stream,
                    "HTTP/1.1 200 OK\r\nContent-Type: application/xml\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    body.len(),
                    body
                );
            }
        });
        (format!("http://{address}"), seen)
    }

    fn channel(name: &str, tvg_id: &str, stream: u32) -> ChannelInsertRecord {
        ChannelInsertRecord {
            name: name.to_string(),
            group_name: None,
            logo: None,
            tvg_id: Some(tvg_id.to_string()),
            tvg_name: None,
            stream_url: format!("http://x/live/u/p/{stream}.ts"),
            media_kind: "live".to_string(),
        }
    }

    #[test]
    fn xtream_guide_comes_from_one_xmltv_download() {
        let root = temp_root();
        let context = ensure_foundation_dirs(&root).expect("dirs");
        init_storage(&context.db_path).expect("init");

        let now = unix_now();
        let programme = |channel: &str, title: &str, start: i64, stop: i64| {
            format!(
                r#"<programme start="{}" stop="{}" channel="{channel}"><title>{title}</title></programme>"#,
                xmltv_time(start),
                xmltv_time(stop)
            )
        };
        let guide = format!(
            "<?xml version=\"1.0\"?><tv>{}{}{}{}</tv>",
            programme("News.UK", "On now", now - 600, now + 1200),
            programme("News.UK", "Next", now + 1200, now + 4800),
            programme(
                "News.UK",
                "Last week",
                now - 7 * 86_400,
                now - 7 * 86_400 + 3600
            ),
            programme("unknown.id", "Not ours", now, now + 600),
        );
        let (server, requests) = serve(guide, 1);

        let source_id = create_source(
            &context.db_path,
            "xtream",
            "Provider",
            &json!({ "server_url": server, "username": "al ice", "password": "p&ss" }),
        )
        .expect("source");
        replace_channels_for_source(
            &context.db_path,
            source_id,
            &[
                channel("News HD", "news.uk", 1),
                channel("News 4K", "news.uk", 2),
            ],
        )
        .expect("channels");

        let progress_events = Mutex::new(Vec::new());
        let outcome = refresh_source_guide(&context.db_path, &context.log_path, source_id, &|p| {
            progress_events.lock().expect("lock").push(p.phase)
        })
        .expect("refresh");

        assert_eq!(outcome.method, "xmltv");
        assert_eq!(outcome.summary.programme_count, 2);
        assert_eq!(outcome.summary.channel_count, 2);
        assert_eq!(
            requests.lock().expect("lock").as_slice(),
            ["/xmltv.php?username=al+ice&password=p%26ss"]
        );
        assert!(progress_events.lock().expect("lock").contains(&"saving"));

        let ids: Vec<i64> =
            list_channels_for_source(&context.db_path, source_id, None, None, None, false)
                .expect("list")
                .into_iter()
                .map(|c| c.id)
                .collect();
        let window = list_programmes_for_channels(&context.db_path, &ids, now - 3600, now + 7200)
            .expect("window");
        assert_eq!(window.len(), 2, "both variants share the guide");
        assert_eq!(window[0].1.len(), 2);

        let source = list_sources(&context.db_path).expect("sources").remove(0);
        assert!(source.supports_guide);
        assert!(source.guide_refreshed_at.is_some());
        assert_eq!(source.guide_covered_until, Some(now + 4800));

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn playlists_use_their_advertised_guide_and_report_missing_ones() {
        let root = temp_root();
        let context = ensure_foundation_dirs(&root).expect("dirs");
        init_storage(&context.db_path).expect("init");
        let source_id = create_source(&context.db_path, "m3u", "List", &json!({ "location": "x" }))
            .expect("source");
        replace_channels_for_source(&context.db_path, source_id, &[channel("A", "a.id", 1)])
            .expect("channels");

        let err = refresh_source_guide(&context.db_path, &context.log_path, source_id, &|_| {})
            .expect_err("no guide URL");
        assert!(err.contains("doesn't name a guide"), "{err}");
        assert!(!list_sources(&context.db_path).expect("sources")[0].supports_guide);

        let now = unix_now();
        let guide = format!(
            r#"<tv><programme start="{}" stop="{}" channel="A.ID"><title>Show</title></programme></tv>"#,
            xmltv_time(now),
            xmltv_time(now + 600)
        );
        let (server, _) = serve(guide, 1);
        set_detected_guide_url(
            &context.db_path,
            source_id,
            Some(&format!("{server}/guide.xml, {server}/guide.xml")),
        )
        .expect("detected url");
        assert!(list_sources(&context.db_path).expect("sources")[0].supports_guide);

        let outcome = refresh_source_guide(&context.db_path, &context.log_path, source_id, &|_| {})
            .expect("refresh");
        assert_eq!(outcome.summary.programme_count, 1);

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn xtream_without_xmltv_falls_back_to_one_request_per_guide_id() {
        let root = temp_root();
        let context = ensure_foundation_dirs(&root).expect("dirs");
        init_storage(&context.db_path).expect("init");

        let now = unix_now();
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
        let address = listener.local_addr().expect("addr");
        let requests = Arc::new(Mutex::new(Vec::<String>::new()));
        let log = Arc::clone(&requests);
        thread::spawn(move || {
            for stream in listener.incoming().take(3) {
                let Ok(mut stream) = stream else { return };
                let mut buffer = [0u8; 4096];
                let read = stream.read(&mut buffer).unwrap_or(0);
                let request = String::from_utf8_lossy(&buffer[..read]).to_string();
                let path = request.split_whitespace().nth(1).unwrap_or("").to_string();
                log.lock().expect("lock").push(path.clone());
                let (status, body) = if path.starts_with("/xmltv.php") {
                    ("404 Not Found", String::new())
                } else {
                    let title = if path.contains("stream_id=1&") || path.ends_with("stream_id=1") {
                        "News"
                    } else {
                        "Sport"
                    };
                    (
                        "200 OK",
                        format!(
                            r#"{{"epg_listings":[{{"title":"{title}","start_timestamp":{},"stop_timestamp":{}}}]}}"#,
                            now - 60,
                            now + 3600
                        ),
                    )
                };
                let _ = write!(
                    stream,
                    "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
            }
        });

        let source_id = create_source(
            &context.db_path,
            "xtream",
            "Provider",
            &json!({ "server_url": format!("http://{address}"), "username": "u", "password": "p" }),
        )
        .expect("source");
        replace_channels_for_source(
            &context.db_path,
            source_id,
            &[
                channel("News HD", "news.uk", 1),
                channel("News 4K", "news.uk", 2),
                channel("Sport", "sport.uk", 3),
            ],
        )
        .expect("channels");

        let outcome = refresh_source_guide(&context.db_path, &context.log_path, source_id, &|_| {})
            .expect("refresh");
        assert_eq!(outcome.method, "short_epg");
        assert!(outcome.warning.is_some(), "explains why XMLTV wasn't used");
        assert_eq!(outcome.summary.channel_count, 3);

        let paths = requests.lock().expect("lock").clone();
        let short_epg = paths
            .iter()
            .filter(|p| p.contains("action=get_short_epg"))
            .count();
        assert_eq!(
            short_epg, 2,
            "one request per guide id, not per channel: {paths:?}"
        );

        let ids: Vec<i64> =
            list_channels_for_source(&context.db_path, source_id, None, None, None, false)
                .expect("list")
                .into_iter()
                .map(|c| c.id)
                .collect();
        let window = list_programmes_for_channels(&context.db_path, &ids, now - 600, now + 600)
            .expect("window");
        assert_eq!(
            window.len(),
            3,
            "both news variants share the fetched guide"
        );

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn only_user_set_guide_urls_may_be_local() {
        let mut source = list_sources_fixture();
        let detected = r"http://a/g.xml, \\host\share\g.xml, C:/g.xml";
        assert_eq!(
            guide_urls(&source, Some(detected)).expect("urls"),
            vec![GuideLocation {
                url: "http://a/g.xml".to_string(),
                user_set: false
            }]
        );

        source.config = json!({ "location": "x", "epg_url": "C:/guides/mine.xml" });
        assert_eq!(
            guide_urls(&source, Some(detected)).expect("urls"),
            vec![GuideLocation {
                url: "C:/guides/mine.xml".to_string(),
                user_set: true
            }]
        );
    }

    fn list_sources_fixture() -> SourceRecord {
        SourceRecord {
            id: 1,
            source_type: "m3u".to_string(),
            name: "List".to_string(),
            config: json!({ "location": "x" }),
            created_at: 0,
            supports_guide: true,
            guide_refreshed_at: None,
            guide_covered_until: None,
            guide_error: None,
            guide_attempted_at: None,
        }
    }

    #[test]
    fn guide_url_lists_are_split_and_deduplicated() {
        assert_eq!(
            split_guide_urls(" http://a/x.xml ,http://b/y.xml.gz,, http://a/x.xml"),
            vec!["http://a/x.xml", "http://b/y.xml.gz"]
        );
    }
}
