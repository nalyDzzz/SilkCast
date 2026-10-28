//! The stored programme guide.
//!
//! Programmes are kept per source and XMLTV channel id (`channel_key`), the
//! id a channel's `tvg_id` points at. Channels that share a guide (HD, FHD
//! and 4K variants of one network) share one copy, and catalog refreshes
//! never touch it.

use crate::foundation::{open_connection, PooledConnection};
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::Serialize;
use std::collections::HashSet;
use std::path::Path;

pub const GUIDE_SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS epg_programmes (
  source_id INTEGER NOT NULL,
  channel_key TEXT NOT NULL,
  start_ts INTEGER NOT NULL,
  end_ts INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  FOREIGN KEY(source_id) REFERENCES sources(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_epg_programmes_key_start
  ON epg_programmes(source_id, channel_key, start_ts);

CREATE TABLE IF NOT EXISTS epg_programmes_staging (
  source_id INTEGER NOT NULL,
  channel_key TEXT NOT NULL,
  start_ts INTEGER NOT NULL,
  end_ts INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  FOREIGN KEY(source_id) REFERENCES sources(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_epg_programmes_staging_source
  ON epg_programmes_staging(source_id);

CREATE TABLE IF NOT EXISTS epg_key_refreshes (
  source_id INTEGER NOT NULL,
  channel_key TEXT NOT NULL,
  fetched_at INTEGER NOT NULL,
  PRIMARY KEY (source_id, channel_key),
  FOREIGN KEY(source_id) REFERENCES sources(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS source_guides (
  source_id INTEGER PRIMARY KEY,
  refreshed_at INTEGER,
  covered_until INTEGER,
  programme_count INTEGER NOT NULL DEFAULT 0,
  channel_count INTEGER NOT NULL DEFAULT 0,
  method TEXT,
  last_error TEXT,
  last_attempt_at INTEGER,
  detected_url TEXT,
  FOREIGN KEY(source_id) REFERENCES sources(id) ON DELETE CASCADE
);
"#;

/// SQL for a channel's guide key; must match [`guide_key`].
const CHANNEL_KEY_SQL: &str = "lower(trim(c.tvg_id))";
/// Rows staged per write transaction while a guide downloads.
const STAGING_BATCH: usize = 5000;

/// Normalizes an XMLTV channel id the way stored keys are compared
/// (SQLite's `lower(trim(x))`: spaces and ASCII case only).
pub fn guide_key(raw: &str) -> String {
    raw.trim_matches(' ').to_ascii_lowercase()
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoredProgramme {
    pub title: String,
    pub description: Option<String>,
    pub start: i64,
    pub end: i64,
}

#[derive(Debug, Clone, Default, Serialize, PartialEq, Eq)]
pub struct GuideSummary {
    pub programme_count: i64,
    pub channel_count: i64,
    pub covered_until: Option<i64>,
}

/// Creates the guide tables and moves a pre-0.4 per-channel guide over.
pub fn init_guide_storage(connection: &Connection) -> Result<(), String> {
    connection
        .execute_batch(GUIDE_SCHEMA)
        .map_err(|e| format!("guide schema migration failed: {e}"))?;

    let has_legacy: bool = connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'live_epg_entries')",
            [],
            |row| row.get(0),
        )
        .map_err(|e| format!("legacy guide lookup failed: {e}"))?;
    if has_legacy {
        connection
            .execute_batch(&format!(
                r#"
                BEGIN;
                INSERT OR IGNORE INTO epg_programmes(
                  source_id, channel_key, start_ts, end_ts, title, description
                )
                SELECT c.source_id, {CHANNEL_KEY_SQL}, e.start_timestamp, e.end_timestamp,
                       e.title, e.description
                FROM live_epg_entries e
                JOIN channels c ON c.id = e.channel_id
                WHERE c.tvg_id IS NOT NULL AND trim(c.tvg_id) <> ''
                  AND e.start_timestamp IS NOT NULL
                  AND e.end_timestamp > e.start_timestamp;
                DROP TABLE live_epg_entries;
                DROP TABLE IF EXISTS live_epg_channel_refreshes;
                COMMIT;
                "#
            ))
            .map_err(|e| format!("legacy guide migration failed: {e}"))?;
    }

    // A refresh interrupted by quitting leaves staged rows behind.
    connection
        .execute("DELETE FROM epg_programmes_staging", [])
        .map_err(|e| format!("guide staging cleanup failed: {e}"))?;
    Ok(())
}

/// Up to `limit` programmes still on after `since` for one channel, oldest first.
pub fn list_programmes_for_channel(
    db_path: &Path,
    channel_id: i64,
    limit: usize,
    since: i64,
) -> Result<Vec<StoredProgramme>, String> {
    let connection = open_connection(db_path)?;
    let mut statement = connection
        .prepare(&format!(
            r#"
            SELECT p.title, p.description, p.start_ts, p.end_ts
            FROM channels c
            JOIN epg_programmes p
              ON p.source_id = c.source_id AND p.channel_key = {CHANNEL_KEY_SQL}
            WHERE c.id = ?1 AND p.end_ts > ?3
            ORDER BY p.start_ts
            LIMIT ?2
            "#
        ))
        .map_err(|e| format!("prepare guide lookup failed: {e}"))?;
    let rows = statement
        .query_map(params![channel_id, limit as i64, since], |row| {
            decode_programme(row, 0)
        })
        .map_err(|e| format!("guide lookup failed: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("read guide row failed: {e}"))
}

/// Programmes overlapping `[from, to)` for several channels in one query,
/// grouped per channel in start order. Channels without any are omitted.
pub fn list_programmes_for_channels(
    db_path: &Path,
    channel_ids: &[i64],
    from: i64,
    to: i64,
) -> Result<Vec<(i64, Vec<StoredProgramme>)>, String> {
    if channel_ids.is_empty() {
        return Ok(Vec::new());
    }
    let connection = open_connection(db_path)?;
    let ids_json = serde_json::to_string(channel_ids)
        .map_err(|e| format!("encode channel ids failed: {e}"))?;
    let mut statement = connection
        .prepare(&format!(
            r#"
            SELECT c.id, p.title, p.description, p.start_ts, p.end_ts
            FROM channels c
            JOIN epg_programmes p
              ON p.source_id = c.source_id AND p.channel_key = {CHANNEL_KEY_SQL}
            WHERE c.id IN (SELECT value FROM json_each(?1))
              AND p.end_ts > ?2
              AND p.start_ts < ?3
            ORDER BY c.id, p.start_ts
            "#
        ))
        .map_err(|e| format!("prepare batch guide lookup failed: {e}"))?;
    let rows = statement
        .query_map(params![ids_json, from, to], |row| {
            Ok((row.get::<_, i64>(0)?, decode_programme(row, 1)?))
        })
        .map_err(|e| format!("batch guide lookup failed: {e}"))?;

    let mut grouped: Vec<(i64, Vec<StoredProgramme>)> = Vec::new();
    for row in rows {
        let (channel_id, programme) = row.map_err(|e| format!("read guide row failed: {e}"))?;
        match grouped.last_mut() {
            Some((last_id, programmes)) if *last_id == channel_id => programmes.push(programme),
            _ => grouped.push((channel_id, vec![programme])),
        }
    }
    Ok(grouped)
}

fn decode_programme(row: &rusqlite::Row<'_>, offset: usize) -> rusqlite::Result<StoredProgramme> {
    Ok(StoredProgramme {
        title: row.get(offset)?,
        description: row.get(offset + 1)?,
        start: row.get(offset + 2)?,
        end: row.get(offset + 3)?,
    })
}

/// Distinct guide keys of a source's live channels: the XMLTV ids worth keeping.
pub fn list_guide_keys(db_path: &Path, source_id: i64) -> Result<HashSet<String>, String> {
    let connection = open_connection(db_path)?;
    let mut statement = connection
        .prepare(&format!(
            r#"
            SELECT DISTINCT {CHANNEL_KEY_SQL}
            FROM channels c
            WHERE c.source_id = ?1 AND c.media_kind = 'live'
              AND c.tvg_id IS NOT NULL AND trim(c.tvg_id) <> ''
            "#
        ))
        .map_err(|e| format!("prepare guide key lookup failed: {e}"))?;
    let rows = statement
        .query_map(params![source_id], |row| row.get::<_, String>(0))
        .map_err(|e| format!("guide key lookup failed: {e}"))?;
    rows.collect::<Result<HashSet<_>, _>>()
        .map_err(|e| format!("read guide key failed: {e}"))
}

/// Collects a full guide download in a staging table, then swaps it in with
/// one short transaction. Readers keep the previous guide until then, and a
/// failed or abandoned download leaves it untouched.
pub struct GuideStaging {
    connection: PooledConnection,
    source_id: i64,
    buffer: Vec<(String, StoredProgramme)>,
    staged: usize,
    finished: bool,
}

impl GuideStaging {
    pub fn begin(db_path: &Path, source_id: i64) -> Result<Self, String> {
        let connection = open_connection(db_path)?;
        connection
            .execute(
                "DELETE FROM epg_programmes_staging WHERE source_id = ?1",
                params![source_id],
            )
            .map_err(|e| format!("guide staging reset failed: {e}"))?;
        Ok(Self {
            connection,
            source_id,
            buffer: Vec::with_capacity(STAGING_BATCH),
            staged: 0,
            finished: false,
        })
    }

    pub fn push(&mut self, channel_key: String, programme: StoredProgramme) -> Result<(), String> {
        self.buffer.push((channel_key, programme));
        self.staged += 1;
        if self.buffer.len() >= STAGING_BATCH {
            self.flush()?;
        }
        Ok(())
    }

    pub fn staged(&self) -> usize {
        self.staged
    }

    fn flush(&mut self) -> Result<(), String> {
        if self.buffer.is_empty() {
            return Ok(());
        }
        let tx = self
            .connection
            .transaction()
            .map_err(|e| format!("guide staging transaction failed: {e}"))?;
        {
            let mut insert = tx
                .prepare_cached(
                    r#"
                    INSERT INTO epg_programmes_staging(
                      source_id, channel_key, start_ts, end_ts, title, description
                    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                    "#,
                )
                .map_err(|e| format!("prepare guide staging insert failed: {e}"))?;
            for (key, programme) in self.buffer.drain(..) {
                insert
                    .execute(params![
                        self.source_id,
                        key,
                        programme.start,
                        programme.end,
                        programme.title,
                        programme.description,
                    ])
                    .map_err(|e| format!("guide staging insert failed: {e}"))?;
            }
        }
        tx.commit()
            .map_err(|e| format!("guide staging commit failed: {e}"))
    }

    /// Replaces the source's guide with the staged programmes.
    pub fn commit(mut self, method: &str, now: i64) -> Result<GuideSummary, String> {
        self.flush()?;
        let source_id = self.source_id;
        let tx = self
            .connection
            .transaction()
            .map_err(|e| format!("guide swap transaction failed: {e}"))?;
        tx.execute(
            "DELETE FROM epg_programmes WHERE source_id = ?1",
            params![source_id],
        )
        .map_err(|e| format!("guide swap delete failed: {e}"))?;
        tx.execute(
            r#"
            INSERT OR IGNORE INTO epg_programmes(
              source_id, channel_key, start_ts, end_ts, title, description
            )
            SELECT source_id, channel_key, start_ts, end_ts, title, description
            FROM epg_programmes_staging
            WHERE source_id = ?1
            ORDER BY channel_key, start_ts
            "#,
            params![source_id],
        )
        .map_err(|e| format!("guide swap insert failed: {e}"))?;
        tx.execute(
            "DELETE FROM epg_programmes_staging WHERE source_id = ?1",
            params![source_id],
        )
        .map_err(|e| format!("guide staging cleanup failed: {e}"))?;
        // A full guide supersedes per-channel fetches.
        tx.execute(
            "DELETE FROM epg_key_refreshes WHERE source_id = ?1",
            params![source_id],
        )
        .map_err(|e| format!("guide refresh marks cleanup failed: {e}"))?;
        let summary = write_guide_summary(&tx, source_id, method, now)?;
        tx.commit()
            .map_err(|e| format!("guide swap commit failed: {e}"))?;
        self.finished = true;
        Ok(summary)
    }
}

impl Drop for GuideStaging {
    fn drop(&mut self) {
        if !self.finished {
            let _ = self.connection.execute(
                "DELETE FROM epg_programmes_staging WHERE source_id = ?1",
                params![self.source_id],
            );
        }
    }
}

/// Stores programmes fetched for individual guide keys (one provider call per
/// channel), replacing what each key had from the earliest new programme on.
/// Keys with no programmes are still marked as fetched.
pub fn store_key_programmes(
    db_path: &Path,
    source_id: i64,
    batch: &[(String, Vec<StoredProgramme>)],
    fetched_at: i64,
) -> Result<(), String> {
    if batch.is_empty() {
        return Ok(());
    }
    let mut connection = open_connection(db_path)?;
    let tx = connection
        .transaction()
        .map_err(|e| format!("guide store transaction failed: {e}"))?;
    {
        let mut replace_from = tx
            .prepare(
                "DELETE FROM epg_programmes WHERE source_id = ?1 AND channel_key = ?2 AND end_ts > ?3",
            )
            .map_err(|e| format!("prepare guide replace failed: {e}"))?;
        let mut prune = tx
            .prepare(
                "DELETE FROM epg_programmes WHERE source_id = ?1 AND channel_key = ?2 AND end_ts < ?3",
            )
            .map_err(|e| format!("prepare guide prune failed: {e}"))?;
        let mut insert = tx
            .prepare(
                r#"
                INSERT OR IGNORE INTO epg_programmes(
                  source_id, channel_key, start_ts, end_ts, title, description
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                "#,
            )
            .map_err(|e| format!("prepare guide insert failed: {e}"))?;
        let mut mark = tx
            .prepare(
                r#"
                INSERT INTO epg_key_refreshes(source_id, channel_key, fetched_at)
                VALUES (?1, ?2, ?3)
                ON CONFLICT(source_id, channel_key) DO UPDATE SET fetched_at = excluded.fetched_at
                "#,
            )
            .map_err(|e| format!("prepare guide fetch mark failed: {e}"))?;

        for (key, programmes) in batch {
            if let Some(first_start) = programmes.iter().map(|p| p.start).min() {
                replace_from
                    .execute(params![source_id, key, first_start])
                    .map_err(|e| format!("guide replace failed: {e}"))?;
                for programme in programmes {
                    insert
                        .execute(params![
                            source_id,
                            key,
                            programme.start,
                            programme.end,
                            programme.title,
                            programme.description,
                        ])
                        .map_err(|e| format!("guide insert failed: {e}"))?;
                }
            }
            prune
                .execute(params![source_id, key, fetched_at - KEEP_ENDED_SECONDS])
                .map_err(|e| format!("guide prune failed: {e}"))?;
            mark.execute(params![source_id, key, fetched_at])
                .map_err(|e| format!("guide fetch mark failed: {e}"))?;
        }
    }
    tx.commit()
        .map_err(|e| format!("guide store commit failed: {e}"))
}

/// Programmes that ended longer ago than this are dropped when a channel's
/// guide is rewritten.
pub const KEEP_ENDED_SECONDS: i64 = 6 * 3600;

/// Guide keys fetched since `fetched_since` that need no new request: the
/// provider had nothing for them, or what it gave still runs to `needed_until`.
pub fn list_settled_keys(
    db_path: &Path,
    source_id: i64,
    fetched_since: i64,
    needed_until: i64,
) -> Result<HashSet<String>, String> {
    let connection = open_connection(db_path)?;
    let mut statement = connection
        .prepare(
            r#"
            SELECT r.channel_key
            FROM epg_key_refreshes r
            WHERE r.source_id = ?1
              AND r.fetched_at >= ?2
              AND COALESCE(
                    (SELECT MAX(p.end_ts) FROM epg_programmes p
                      WHERE p.source_id = r.source_id AND p.channel_key = r.channel_key),
                    ?3
                  ) >= ?3
            "#,
        )
        .map_err(|e| format!("prepare settled guide key lookup failed: {e}"))?;
    let rows = statement
        .query_map(params![source_id, fetched_since, needed_until], |row| {
            row.get::<_, String>(0)
        })
        .map_err(|e| format!("settled guide key lookup failed: {e}"))?;
    rows.collect::<Result<HashSet<_>, _>>()
        .map_err(|e| format!("read settled guide key failed: {e}"))
}

/// Records a finished refresh and returns what the source's guide now holds.
pub fn finish_guide_refresh(
    db_path: &Path,
    source_id: i64,
    method: &str,
    now: i64,
) -> Result<GuideSummary, String> {
    let mut connection = open_connection(db_path)?;
    let tx = connection
        .transaction()
        .map_err(|e| format!("guide summary transaction failed: {e}"))?;
    let summary = write_guide_summary(&tx, source_id, method, now)?;
    tx.commit()
        .map_err(|e| format!("guide summary commit failed: {e}"))?;
    Ok(summary)
}

fn write_guide_summary(
    tx: &Transaction<'_>,
    source_id: i64,
    method: &str,
    now: i64,
) -> Result<GuideSummary, String> {
    let (programme_count, covered_until): (i64, Option<i64>) = tx
        .query_row(
            "SELECT COUNT(*), MAX(end_ts) FROM epg_programmes WHERE source_id = ?1",
            params![source_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("guide count failed: {e}"))?;
    let channel_count: i64 = tx
        .query_row(
            &format!(
                r#"
                SELECT COUNT(*) FROM channels c
                WHERE c.source_id = ?1 AND c.media_kind = 'live'
                  AND EXISTS (
                    SELECT 1 FROM epg_programmes p
                    WHERE p.source_id = c.source_id AND p.channel_key = {CHANNEL_KEY_SQL}
                  )
                "#
            ),
            params![source_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("guide channel count failed: {e}"))?;

    tx.execute(
        r#"
        INSERT INTO source_guides(
          source_id, refreshed_at, covered_until, programme_count, channel_count,
          method, last_error, last_attempt_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?2)
        ON CONFLICT(source_id) DO UPDATE SET
          refreshed_at = excluded.refreshed_at,
          covered_until = excluded.covered_until,
          programme_count = excluded.programme_count,
          channel_count = excluded.channel_count,
          method = excluded.method,
          last_error = NULL,
          last_attempt_at = excluded.last_attempt_at
        "#,
        params![
            source_id,
            now,
            covered_until,
            programme_count,
            channel_count,
            method
        ],
    )
    .map_err(|e| format!("guide status update failed: {e}"))?;

    Ok(GuideSummary {
        programme_count,
        channel_count,
        covered_until,
    })
}

/// Records a failed refresh; the stored guide and its last success stay.
pub fn record_guide_failure(
    db_path: &Path,
    source_id: i64,
    error: &str,
    now: i64,
) -> Result<(), String> {
    let connection = open_connection(db_path)?;
    connection
        .execute(
            r#"
            INSERT INTO source_guides(source_id, last_error, last_attempt_at)
            VALUES (?1, ?2, ?3)
            ON CONFLICT(source_id) DO UPDATE SET
              last_error = excluded.last_error,
              last_attempt_at = excluded.last_attempt_at
            "#,
            params![source_id, error, now],
        )
        .map_err(|e| format!("guide failure update failed: {e}"))?;
    Ok(())
}

/// Remembers the guide URL a playlist advertises in its `#EXTM3U` header.
pub fn set_detected_guide_url(
    db_path: &Path,
    source_id: i64,
    url: Option<&str>,
) -> Result<(), String> {
    let connection = open_connection(db_path)?;
    connection
        .execute(
            r#"
            INSERT INTO source_guides(source_id, detected_url) VALUES (?1, ?2)
            ON CONFLICT(source_id) DO UPDATE SET detected_url = excluded.detected_url
            "#,
            params![source_id, url],
        )
        .map_err(|e| format!("guide URL update failed: {e}"))?;
    Ok(())
}

pub fn get_detected_guide_url(db_path: &Path, source_id: i64) -> Result<Option<String>, String> {
    let connection = open_connection(db_path)?;
    connection
        .query_row(
            "SELECT detected_url FROM source_guides WHERE source_id = ?1",
            params![source_id],
            |row| row.get::<_, Option<String>>(0),
        )
        .optional()
        .map(Option::flatten)
        .map_err(|e| format!("guide URL lookup failed: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::foundation::{
        create_source, ensure_foundation_dirs, init_storage, list_channels_for_source,
        replace_channels_for_source, ChannelInsertRecord,
    };
    use serde_json::json;

    fn temp_db() -> (std::path::PathBuf, std::path::PathBuf) {
        static NEXT: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
        let seq = NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let root =
            std::env::temp_dir().join(format!("silkcast-guide-test-{}-{seq}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let context = ensure_foundation_dirs(&root).expect("dirs");
        init_storage(&context.db_path).expect("init");
        (root, context.db_path)
    }

    fn live(name: &str, tvg_id: Option<&str>, stream: u32) -> ChannelInsertRecord {
        ChannelInsertRecord {
            name: name.to_string(),
            group_name: Some("TV".to_string()),
            logo: None,
            tvg_id: tvg_id.map(str::to_string),
            tvg_name: None,
            stream_url: format!("http://x/live/u/p/{stream}.ts"),
            media_kind: "live".to_string(),
        }
    }

    fn programme(title: &str, start: i64, end: i64) -> StoredProgramme {
        StoredProgramme {
            title: title.to_string(),
            description: None,
            start,
            end,
        }
    }

    /// A source with two channels sharing the `News.UK` guide and one without an id.
    fn source_with_channels(db: &Path) -> (i64, i64, i64, i64) {
        let source_id = create_source(db, "m3u", "List", &json!({ "location": "x" })).expect("src");
        replace_channels_for_source(
            db,
            source_id,
            &[
                live("News HD", Some("News.UK"), 1),
                live("News 4K", Some(" news.uk "), 2),
                live("Local", None, 3),
            ],
        )
        .expect("channels");
        let channels =
            list_channels_for_source(db, source_id, None, None, None, false).expect("list");
        let id = |name: &str| channels.iter().find(|c| c.name == name).expect(name).id;
        (source_id, id("News HD"), id("News 4K"), id("Local"))
    }

    #[test]
    fn staged_guide_replaces_the_old_one_and_is_shared_by_key() {
        let (root, db) = temp_db();
        let (source_id, hd, uhd, local) = source_with_channels(&db);
        assert_eq!(
            list_guide_keys(&db, source_id).expect("keys"),
            HashSet::from(["news.uk".to_string()])
        );

        let mut staging = GuideStaging::begin(&db, source_id).expect("begin");
        staging
            .push(guide_key("NEWS.UK"), programme("Old", 0, 100))
            .expect("push");
        staging.commit("xmltv", 50).expect("commit");

        let mut staging = GuideStaging::begin(&db, source_id).expect("begin");
        for (title, start) in [("Early", 1000), ("Late", 2000)] {
            staging
                .push(guide_key("news.uk"), programme(title, start, start + 1000))
                .expect("push");
        }
        // Not committed yet: readers still see the previous guide.
        assert_eq!(
            list_programmes_for_channel(&db, hd, 10, 0).expect("read")[0].title,
            "Old"
        );
        let summary = staging.commit("xmltv", 900).expect("commit");
        assert_eq!(
            summary,
            GuideSummary {
                programme_count: 2,
                channel_count: 2,
                covered_until: Some(3000)
            }
        );

        let window =
            list_programmes_for_channels(&db, &[hd, uhd, local], 1500, 2500).expect("window");
        let titles: Vec<(i64, Vec<&str>)> = window
            .iter()
            .map(|(id, items)| (*id, items.iter().map(|p| p.title.as_str()).collect()))
            .collect();
        let mut expected = vec![(hd, vec!["Early", "Late"]), (uhd, vec!["Early", "Late"])];
        expected.sort();
        assert_eq!(titles, expected);
        assert_eq!(
            list_programmes_for_channel(&db, uhd, 1, 2000).expect("upcoming")[0].title,
            "Late"
        );

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn abandoned_staging_leaves_the_guide_alone() {
        let (root, db) = temp_db();
        let (source_id, hd, _, _) = source_with_channels(&db);
        let mut staging = GuideStaging::begin(&db, source_id).expect("begin");
        staging
            .push("news.uk".to_string(), programme("Kept", 0, 100))
            .expect("push");
        staging.commit("xmltv", 1).expect("commit");

        let mut staging = GuideStaging::begin(&db, source_id).expect("begin");
        for index in 0..(STAGING_BATCH as i64 + 10) {
            staging
                .push(
                    "news.uk".to_string(),
                    programme("Partial", index * 10, index * 10 + 5),
                )
                .expect("push");
        }
        drop(staging);

        let connection = open_connection(&db).expect("open");
        let staged: i64 = connection
            .query_row("SELECT COUNT(*) FROM epg_programmes_staging", [], |row| {
                row.get(0)
            })
            .expect("count");
        assert_eq!(staged, 0);
        let titles: Vec<String> = list_programmes_for_channel(&db, hd, 10, 0)
            .expect("read")
            .into_iter()
            .map(|p| p.title)
            .collect();
        assert_eq!(titles, vec!["Kept"]);

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn per_key_fetches_replace_from_the_first_new_programme_and_settle() {
        let (root, db) = temp_db();
        let (source_id, hd, _, _) = source_with_channels(&db);
        let now = 100_000;
        store_key_programmes(
            &db,
            source_id,
            &[
                (
                    "news.uk".to_string(),
                    vec![
                        programme("Ancient", now - 30_000, now - 29_000),
                        programme("Earlier", now - 2000, now - 1000),
                        programme("Stale next", now, now + 1000),
                    ],
                ),
                ("empty.key".to_string(), Vec::new()),
            ],
            now,
        )
        .expect("store");
        store_key_programmes(
            &db,
            source_id,
            &[(
                "news.uk".to_string(),
                vec![
                    programme("Fresh now", now - 500, now + 500),
                    programme("Fresh next", now + 500, now + 20_000),
                ],
            )],
            now,
        )
        .expect("store");

        let titles: Vec<String> = list_programmes_for_channel(&db, hd, 10, 0)
            .expect("read")
            .into_iter()
            .map(|p| p.title)
            .collect();
        assert_eq!(titles, vec!["Earlier", "Fresh now", "Fresh next"]);

        // Both keys were just fetched: one has nothing, the other covers 5 h.
        let settled = list_settled_keys(&db, source_id, now - 60, now + 3 * 3600).expect("settled");
        assert_eq!(
            settled,
            HashSet::from(["news.uk".to_string(), "empty.key".to_string()])
        );
        let needs_more = list_settled_keys(&db, source_id, now - 60, now + 6 * 3600).expect("s");
        assert_eq!(needs_more, HashSet::from(["empty.key".to_string()]));

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn legacy_per_channel_guide_is_migrated() {
        let (root, db) = temp_db();
        let (source_id, hd, uhd, local) = source_with_channels(&db);
        let connection = open_connection(&db).expect("open");
        connection
            .execute_batch(&format!(
                r#"
                CREATE TABLE live_epg_entries (
                  id INTEGER PRIMARY KEY AUTOINCREMENT, channel_id INTEGER NOT NULL,
                  title TEXT NOT NULL, description TEXT, start_at TEXT, end_at TEXT,
                  start_timestamp INTEGER, end_timestamp INTEGER, fetched_at INTEGER NOT NULL
                );
                CREATE TABLE live_epg_channel_refreshes (
                  channel_id INTEGER PRIMARY KEY, fetched_at INTEGER NOT NULL
                );
                INSERT INTO live_epg_entries(channel_id, title, start_timestamp, end_timestamp, fetched_at)
                VALUES ({hd}, 'Show', 10, 20, 1), ({uhd}, 'Show', 10, 20, 1),
                       ({local}, 'No key', 10, 20, 1), ({hd}, 'No times', NULL, NULL, 1);
                "#
            ))
            .expect("legacy tables");
        drop(connection);

        init_storage(&db).expect("migrate");

        let connection = open_connection(&db).expect("open");
        let legacy_left: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE name LIKE 'live_epg_%'",
                [],
                |row| row.get(0),
            )
            .expect("count");
        assert_eq!(legacy_left, 0);
        let rows: Vec<(i64, String, String)> = connection
            .prepare("SELECT source_id, channel_key, title FROM epg_programmes")
            .expect("prepare")
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
            .expect("query")
            .collect::<Result<_, _>>()
            .expect("rows");
        assert_eq!(
            rows,
            vec![(source_id, "news.uk".to_string(), "Show".to_string())]
        );

        let _ = std::fs::remove_dir_all(root);
    }
}
