use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet, VecDeque};
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::Emitter;

use crate::playback::PlaybackEngine;
use crate::xtream::XtreamConfig;

#[derive(Clone)]
pub struct AppContext {
    pub db_path: PathBuf,
    pub log_path: PathBuf,
    pub crash_dir: PathBuf,
}

pub struct SharedState {
    pub context: AppContext,
    pub debug_mode: AtomicBool,
    pub playback: Mutex<PlaybackEngine>,
    source_registry: SourceRegistry,
    /// Sources whose guide is refreshing, so a second request doesn't start
    /// another download.
    guide_refreshes: Mutex<HashSet<i64>>,
}

impl SharedState {
    pub fn new(context: AppContext, debug_mode: bool) -> Self {
        Self {
            context,
            debug_mode: AtomicBool::new(debug_mode),
            playback: Mutex::new(PlaybackEngine::new()),
            source_registry: SourceRegistry::with_defaults(),
            guide_refreshes: Mutex::new(HashSet::new()),
        }
    }

    /// Claims the guide refresh of a source; false if one is already running.
    pub fn begin_guide_refresh(&self, source_id: i64) -> bool {
        self.guide_refreshes
            .lock()
            .map(|mut running| running.insert(source_id))
            .unwrap_or(false)
    }

    pub fn end_guide_refresh(&self, source_id: i64) {
        if let Ok(mut running) = self.guide_refreshes.lock() {
            running.remove(&source_id);
        }
    }

    pub fn debug_mode(&self) -> bool {
        self.debug_mode.load(Ordering::Relaxed)
    }

    pub fn set_debug_mode(&self, value: bool) {
        self.debug_mode.store(value, Ordering::Relaxed);
    }

    pub fn source_kind_supported(&self, source_type: &str, config: &Value) -> Result<(), String> {
        self.source_registry.validate(source_type, config)
    }
}

#[derive(Debug, Serialize)]
pub struct RuntimeInfo {
    pub debug_mode: bool,
    pub db_path: String,
    pub log_path: String,
    pub crash_dir: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SourceRecord {
    pub id: i64,
    pub source_type: String,
    pub name: String,
    pub config: Value,
    pub created_at: i64,
    /// Xtream sources, and playlists with a configured or advertised guide URL.
    pub supports_guide: bool,
    /// Last successful guide refresh (unix seconds).
    pub guide_refreshed_at: Option<i64>,
    /// End of the last stored programme (unix seconds).
    pub guide_covered_until: Option<i64>,
    /// Why the last guide refresh failed, if it did.
    pub guide_error: Option<String>,
    pub guide_attempted_at: Option<i64>,
}

#[derive(Debug, Clone)]
pub struct ChannelInsertRecord {
    pub name: String,
    pub group_name: Option<String>,
    pub logo: Option<String>,
    pub tvg_id: Option<String>,
    pub tvg_name: Option<String>,
    pub stream_url: String,
    pub media_kind: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GroupRecord {
    pub name: String,
    pub channel_count: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChannelRecord {
    pub id: i64,
    pub source_id: i64,
    pub name: String,
    pub group_name: String,
    pub logo: Option<String>,
    /// Guide id: used by the backend (guide matching, series lookup) but not
    /// sent to the UI. With the provider name (searched in SQL, never read
    /// here) it was a fifth of every catalog list's bytes.
    #[serde(skip_serializing, default)]
    pub tvg_id: Option<String>,
    pub stream_url: String,
    pub media_kind: String,
    pub is_favorite: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RecentChannelRecord {
    pub channel: ChannelRecord,
    pub played_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Phase1Settings {
    pub hardware_decode: bool,
    pub buffering_preset: String,
    pub startup_behavior: String,
    pub preferred_player: String,
}

impl Default for Phase1Settings {
    fn default() -> Self {
        Self {
            hardware_decode: true,
            buffering_preset: "normal".to_string(),
            startup_behavior: "home".to_string(),
            preferred_player: "web".to_string(),
        }
    }
}

impl Phase1Settings {
    pub fn validate(&self) -> Result<(), String> {
        if !matches!(self.buffering_preset.as_str(), "low" | "normal" | "high") {
            return Err("buffering_preset must be one of: low, normal, high".to_string());
        }

        if !matches!(self.startup_behavior.as_str(), "home" | "resume_last") {
            return Err("startup_behavior must be one of: home, resume_last".to_string());
        }

        if !matches!(self.preferred_player.as_str(), "web" | "mpv") {
            return Err("preferred_player must be one of: web, mpv".to_string());
        }

        Ok(())
    }

    pub fn cache_seconds(&self) -> i64 {
        match self.buffering_preset.as_str() {
            "low" => 2,
            "high" => 10,
            _ => 5,
        }
    }
}

pub fn ensure_foundation_dirs(base_dir: &Path) -> Result<AppContext, String> {
    let db_dir = base_dir.join("storage");
    let logs_dir = base_dir.join("logs");
    let crash_dir = base_dir.join("crash");
    fs::create_dir_all(&db_dir).map_err(|e| format!("failed to create storage dir: {e}"))?;
    fs::create_dir_all(&logs_dir).map_err(|e| format!("failed to create logs dir: {e}"))?;
    fs::create_dir_all(&crash_dir).map_err(|e| format!("failed to create crash dir: {e}"))?;

    Ok(AppContext {
        db_path: db_dir.join("silkcast.db"),
        log_path: logs_dir.join("silkcast.log"),
        crash_dir,
    })
}

pub fn init_storage(db_path: &Path) -> Result<(), String> {
    let connection = open_connection(db_path)?;
    connection
        .execute_batch(
            r#"
            PRAGMA journal_mode = WAL;

            CREATE TABLE IF NOT EXISTS settings (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL,
              updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sources (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              source_type TEXT NOT NULL,
              name TEXT NOT NULL,
              config_json TEXT NOT NULL,
              created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS channels (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              source_id INTEGER NOT NULL,
              name TEXT NOT NULL,
              group_name TEXT NOT NULL DEFAULT 'Ungrouped',
              logo TEXT,
              tvg_id TEXT,
              tvg_name TEXT,
              stream_url TEXT NOT NULL,
              media_kind TEXT NOT NULL DEFAULT 'live',
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL,
              FOREIGN KEY(source_id) REFERENCES sources(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_channels_source_group
              ON channels(source_id, group_name);
            CREATE INDEX IF NOT EXISTS idx_channels_source_name
              ON channels(source_id, name);

            CREATE TABLE IF NOT EXISTS favorites (
              channel_id INTEGER PRIMARY KEY,
              created_at INTEGER NOT NULL,
              FOREIGN KEY(channel_id) REFERENCES channels(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS recents (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              channel_id INTEGER NOT NULL,
              played_at INTEGER NOT NULL,
              FOREIGN KEY(channel_id) REFERENCES channels(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_recents_played_at
              ON recents(played_at DESC);

            "#,
        )
        .map_err(|e| format!("db migration failed: {e}"))?;

    // Backfill support for databases created before `media_kind` existed.
    let _ = connection.execute(
        "ALTER TABLE channels ADD COLUMN media_kind TEXT NOT NULL DEFAULT 'live'",
        [],
    );

    crate::guide_store::init_guide_storage(&connection)
}

pub fn set_setting(db_path: &Path, key: &str, value: &str) -> Result<(), String> {
    let ts = unix_ts();
    let connection = open_connection(db_path)?;
    connection
        .execute(
            r#"
            INSERT INTO settings(key, value, updated_at)
            VALUES (?1, ?2, ?3)
            ON CONFLICT(key) DO UPDATE SET
              value = excluded.value,
              updated_at = excluded.updated_at
            "#,
            params![key, value, ts],
        )
        .map_err(|e| format!("set setting failed: {e}"))?;
    Ok(())
}

pub fn get_setting(db_path: &Path, key: &str) -> Result<Option<String>, String> {
    let connection = open_connection(db_path)?;
    let mut statement = connection
        .prepare("SELECT value FROM settings WHERE key = ?1")
        .map_err(|e| format!("prepare failed: {e}"))?;

    let mut rows = statement
        .query(params![key])
        .map_err(|e| format!("query failed: {e}"))?;
    match rows.next().map_err(|e| format!("read row failed: {e}"))? {
        Some(row) => row
            .get::<usize, String>(0)
            .map(Some)
            .map_err(|e| format!("decode value failed: {e}")),
        None => Ok(None),
    }
}

pub fn load_phase1_settings(db_path: &Path) -> Result<Phase1Settings, String> {
    let hwdec_raw = get_setting(db_path, "playback.hwdec")?;
    let _buffering_preset = get_setting(db_path, "playback.buffering_preset")?;
    let startup_behavior =
        get_setting(db_path, "startup.behavior")?.unwrap_or_else(|| "home".to_string());
    let preferred_player =
        get_setting(db_path, "playback.preferred_player")?.unwrap_or_else(|| "web".to_string());

    let hardware_decode = hwdec_raw
        .as_deref()
        .map(|value| value == "true")
        .unwrap_or(true);

    let settings = Phase1Settings {
        hardware_decode,
        buffering_preset: "normal".to_string(),
        startup_behavior,
        preferred_player,
    };
    settings.validate()?;
    Ok(settings)
}

pub fn save_phase1_settings(db_path: &Path, settings: &Phase1Settings) -> Result<(), String> {
    let mut normalized = settings.clone();
    normalized.buffering_preset = "normal".to_string();
    normalized.validate()?;
    set_setting(
        db_path,
        "playback.hwdec",
        if normalized.hardware_decode {
            "true"
        } else {
            "false"
        },
    )?;
    set_setting(db_path, "playback.buffering_preset", "normal")?;
    set_setting(db_path, "startup.behavior", &normalized.startup_behavior)?;
    set_setting(
        db_path,
        "playback.preferred_player",
        &normalized.preferred_player,
    )?;
    Ok(())
}

#[cfg(test)]
pub fn create_source(
    db_path: &Path,
    source_type: &str,
    name: &str,
    config: &Value,
) -> Result<i64, String> {
    let connection = open_connection(db_path)?;
    let config_json =
        serde_json::to_string(config).map_err(|e| format!("encode config failed: {e}"))?;
    connection
        .execute(
            "INSERT INTO sources(source_type, name, config_json, created_at) VALUES (?1, ?2, ?3, ?4)",
            params![source_type, name, config_json, unix_ts()],
        )
        .map_err(|e| format!("insert source failed: {e}"))?;
    Ok(connection.last_insert_rowid())
}

#[cfg(test)]
pub fn update_source(
    db_path: &Path,
    source_id: i64,
    name: &str,
    config: &Value,
) -> Result<(), String> {
    let connection = open_connection(db_path)?;
    let config_json =
        serde_json::to_string(config).map_err(|e| format!("encode config failed: {e}"))?;
    let updated_rows = connection
        .execute(
            "UPDATE sources SET name = ?1, config_json = ?2 WHERE id = ?3",
            params![name, config_json, source_id],
        )
        .map_err(|e| format!("update source failed: {e}"))?;

    if updated_rows == 0 {
        return Err(format!("source {source_id} not found"));
    }

    Ok(())
}

pub fn delete_source(db_path: &Path, source_id: i64) -> Result<(), String> {
    let connection = open_connection(db_path)?;
    connection
        .execute("DELETE FROM sources WHERE id = ?1", params![source_id])
        .map_err(|e| format!("delete source failed: {e}"))?;
    Ok(())
}

const SOURCE_SELECT: &str = r#"
    SELECT s.id, s.source_type, s.name, s.config_json, s.created_at,
           g.refreshed_at, g.covered_until, g.last_error, g.last_attempt_at, g.detected_url
    FROM sources s
    LEFT JOIN source_guides g ON g.source_id = s.id
"#;

pub fn list_sources(db_path: &Path) -> Result<Vec<SourceRecord>, String> {
    let connection = open_connection(db_path)?;
    let mut statement = connection
        .prepare(&format!(
            "{SOURCE_SELECT} ORDER BY s.created_at DESC, s.id DESC"
        ))
        .map_err(|e| format!("prepare failed: {e}"))?;

    let mut rows = statement
        .query([])
        .map_err(|e| format!("query failed: {e}"))?;
    let mut records = Vec::new();
    while let Some(row) = rows.next().map_err(|e| format!("read row failed: {e}"))? {
        records.push(decode_source_record(&row)?);
    }

    Ok(records)
}

pub fn get_source_by_id(db_path: &Path, source_id: i64) -> Result<Option<SourceRecord>, String> {
    let connection = open_connection(db_path)?;
    let mut statement = connection
        .prepare(&format!("{SOURCE_SELECT} WHERE s.id = ?1 LIMIT 1"))
        .map_err(|e| format!("prepare failed: {e}"))?;

    let mut rows = statement
        .query(params![source_id])
        .map_err(|e| format!("query failed: {e}"))?;

    match rows.next().map_err(|e| format!("read row failed: {e}"))? {
        Some(row) => decode_source_record(&row).map(Some),
        None => Ok(None),
    }
}

/// A catalog downloaded from a provider, ready to store.
pub struct FetchedCatalog {
    pub channels: Vec<ChannelInsertRecord>,
    /// The guide URL(s) a playlist's header names; `None` for Xtream sources
    /// and playlists without one.
    pub detected_guide_url: Option<String>,
}

/// Adds a source together with its catalog in one transaction, so nothing
/// (the source list, an automatic guide refresh) ever sees a source whose
/// channels aren't there yet.
pub fn create_source_with_catalog(
    db_path: &Path,
    source_type: &str,
    name: &str,
    config: &Value,
    catalog: &FetchedCatalog,
) -> Result<i64, String> {
    let config_json =
        serde_json::to_string(config).map_err(|e| format!("encode config failed: {e}"))?;
    let mut connection = open_connection(db_path)?;
    let tx = connection
        .transaction()
        .map_err(|e| format!("transaction start failed: {e}"))?;
    tx.execute(
        "INSERT INTO sources(source_type, name, config_json, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![source_type, name, config_json, unix_ts()],
    )
    .map_err(|e| format!("insert source failed: {e}"))?;
    let source_id = tx.last_insert_rowid();
    sync_channels(&tx, source_id, &catalog.channels)?;
    crate::guide_store::write_detected_guide_url(
        &tx,
        source_id,
        catalog.detected_guide_url.as_deref(),
    )?;
    tx.commit()
        .map_err(|e| format!("transaction commit failed: {e}"))?;
    Ok(source_id)
}

/// Stores a freshly fetched catalog for an existing source, and its new name
/// and config when given (an edit), in one transaction.
pub fn store_source_catalog(
    db_path: &Path,
    source_id: i64,
    details: Option<(&str, &Value)>,
    catalog: &FetchedCatalog,
) -> Result<usize, String> {
    let mut connection = open_connection(db_path)?;
    let tx = connection
        .transaction()
        .map_err(|e| format!("transaction start failed: {e}"))?;
    let exists = match details {
        Some((name, config)) => {
            let config_json =
                serde_json::to_string(config).map_err(|e| format!("encode config failed: {e}"))?;
            tx.execute(
                "UPDATE sources SET name = ?1, config_json = ?2 WHERE id = ?3",
                params![name, config_json, source_id],
            )
            .map_err(|e| format!("update source failed: {e}"))?
                > 0
        }
        None => tx
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM sources WHERE id = ?1)",
                params![source_id],
                |row| row.get::<_, bool>(0),
            )
            .map_err(|e| format!("source lookup failed: {e}"))?,
    };
    if !exists {
        // Deleted while its catalog downloaded.
        return Err(format!("source {source_id} not found"));
    }
    let count = sync_channels(&tx, source_id, &catalog.channels)?;
    crate::guide_store::write_detected_guide_url(
        &tx,
        source_id,
        catalog.detected_guide_url.as_deref(),
    )?;
    tx.commit()
        .map_err(|e| format!("transaction commit failed: {e}"))?;
    Ok(count)
}

/// Makes the stored catalog of a source match `channels`, keeping the id of
/// every channel that is still there. Favorites, watch history and the stored
/// guide all hang off channel ids, so a refresh must not churn them.
///
/// Channels are matched by stream URL, then by stream id plus name (the URL
/// changes when Xtream credentials or output formats change), then by name.
/// Unmatched old channels are deleted; new ones are inserted.
#[cfg(test)]
pub fn replace_channels_for_source(
    db_path: &Path,
    source_id: i64,
    channels: &[ChannelInsertRecord],
) -> Result<usize, String> {
    let mut connection = open_connection(db_path)?;
    let tx = connection
        .transaction()
        .map_err(|e| format!("transaction start failed: {e}"))?;
    let count = sync_channels(&tx, source_id, channels)?;
    tx.commit()
        .map_err(|e| format!("transaction commit failed: {e}"))?;
    Ok(count)
}

fn sync_channels(
    tx: &rusqlite::Transaction<'_>,
    source_id: i64,
    channels: &[ChannelInsertRecord],
) -> Result<usize, String> {
    let mut existing = ExistingChannels::load(tx, source_id)?;
    let ts = unix_ts();
    let mut insert = tx
        .prepare(
            r#"
            INSERT INTO channels(
              source_id, name, group_name, logo, tvg_id, tvg_name,
              stream_url, media_kind, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)
            "#,
        )
        .map_err(|e| format!("prepare insert failed: {e}"))?;
    let mut update = tx
        .prepare(
            r#"
            UPDATE channels
               SET name = ?2, group_name = ?3, logo = ?4, tvg_id = ?5, tvg_name = ?6,
                   stream_url = ?7, media_kind = ?8, updated_at = ?9
             WHERE id = ?1
            "#,
        )
        .map_err(|e| format!("prepare update failed: {e}"))?;

    for channel in channels {
        let incoming = StoredChannelFields::normalized(channel);
        match existing.claim(&incoming) {
            Some(Claimed::Unchanged) => {}
            Some(Claimed::Changed(id)) => {
                update
                    .execute(params![
                        id,
                        incoming.name,
                        incoming.group_name,
                        incoming.logo,
                        incoming.tvg_id,
                        incoming.tvg_name,
                        incoming.stream_url,
                        incoming.media_kind,
                        ts,
                    ])
                    .map_err(|e| format!("update channel failed: {e}"))?;
            }
            None => {
                insert
                    .execute(params![
                        source_id,
                        incoming.name,
                        incoming.group_name,
                        incoming.logo,
                        incoming.tvg_id,
                        incoming.tvg_name,
                        incoming.stream_url,
                        incoming.media_kind,
                        ts,
                    ])
                    .map_err(|e| format!("insert channel failed: {e}"))?;
            }
        }
    }
    drop(insert);
    drop(update);

    // Gone from the provider: favorites, recents and guide rows cascade away.
    let removed = existing.unclaimed_ids();
    if !removed.is_empty() {
        let removed_json =
            serde_json::to_string(&removed).map_err(|e| format!("encode ids failed: {e}"))?;
        tx.execute(
            "DELETE FROM channels WHERE id IN (SELECT value FROM json_each(?1))",
            params![removed_json],
        )
        .map_err(|e| format!("delete removed channels failed: {e}"))?;
    }

    Ok(channels.len())
}

/// The columns a catalog import writes, normalized the way they are stored.
#[derive(Debug, Clone, PartialEq, Eq)]
struct StoredChannelFields {
    name: String,
    group_name: String,
    logo: Option<String>,
    tvg_id: Option<String>,
    tvg_name: Option<String>,
    stream_url: String,
    media_kind: String,
}

impl StoredChannelFields {
    fn normalized(channel: &ChannelInsertRecord) -> Self {
        Self {
            name: channel.name.clone(),
            group_name: channel
                .group_name
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .unwrap_or("Ungrouped")
                .to_string(),
            logo: channel.logo.clone(),
            tvg_id: channel.tvg_id.clone(),
            tvg_name: channel.tvg_name.clone(),
            stream_url: channel.stream_url.clone(),
            media_kind: normalize_media_kind(&channel.media_kind),
        }
    }
}

/// The last path segment of a stream URL without its extension: the stream
/// id for Xtream (`.../live/user/pass/1234.m3u8` -> `1234`).
fn stream_key(stream_url: &str) -> &str {
    let path = stream_url.split(['?', '#']).next().unwrap_or(stream_url);
    let segment = path.rsplit('/').next().unwrap_or(path);
    segment.split('.').next().unwrap_or(segment)
}

enum Claimed {
    Unchanged,
    Changed(i64),
}

/// A source's stored channels, indexed so each re-imported channel can claim
/// its previous row (each row at most once, earliest id first).
struct ExistingChannels {
    rows: HashMap<i64, StoredChannelFields>,
    claimed: HashSet<i64>,
    by_url: HashMap<(String, String), VecDeque<i64>>,
    by_key_and_name: HashMap<(String, String, String), VecDeque<i64>>,
    by_name: HashMap<(String, String), VecDeque<i64>>,
}

impl ExistingChannels {
    fn load(tx: &rusqlite::Transaction<'_>, source_id: i64) -> Result<Self, String> {
        let mut statement = tx
            .prepare(
                r#"
                SELECT id, name, group_name, logo, tvg_id, tvg_name, stream_url, media_kind
                FROM channels
                WHERE source_id = ?1
                ORDER BY id
                "#,
            )
            .map_err(|e| format!("prepare existing channels failed: {e}"))?;
        let rows = statement
            .query_map(params![source_id], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    StoredChannelFields {
                        name: row.get(1)?,
                        group_name: row.get(2)?,
                        logo: row.get(3)?,
                        tvg_id: row.get(4)?,
                        tvg_name: row.get(5)?,
                        stream_url: row.get(6)?,
                        media_kind: row.get(7)?,
                    },
                ))
            })
            .map_err(|e| format!("query existing channels failed: {e}"))?;

        let mut index = Self {
            rows: HashMap::new(),
            claimed: HashSet::new(),
            by_url: HashMap::new(),
            by_key_and_name: HashMap::new(),
            by_name: HashMap::new(),
        };
        for row in rows {
            let (id, fields) = row.map_err(|e| format!("read existing channel failed: {e}"))?;
            let kind = fields.media_kind.clone();
            index
                .by_url
                .entry((kind.clone(), fields.stream_url.clone()))
                .or_default()
                .push_back(id);
            index
                .by_key_and_name
                .entry((
                    kind.clone(),
                    stream_key(&fields.stream_url).to_string(),
                    fields.name.clone(),
                ))
                .or_default()
                .push_back(id);
            index
                .by_name
                .entry((kind, fields.name.clone()))
                .or_default()
                .push_back(id);
            index.rows.insert(id, fields);
        }
        Ok(index)
    }

    /// The previous row for `incoming`, if one is left to claim.
    fn claim(&mut self, incoming: &StoredChannelFields) -> Option<Claimed> {
        let kind = &incoming.media_kind;
        let claimed = &mut self.claimed;
        let mut take = |queue: Option<&mut VecDeque<i64>>| -> Option<i64> {
            let queue = queue?;
            while let Some(id) = queue.pop_front() {
                if claimed.insert(id) {
                    return Some(id);
                }
            }
            None
        };

        let id = take(
            self.by_url
                .get_mut(&(kind.clone(), incoming.stream_url.clone())),
        )
        .or_else(|| {
            take(self.by_key_and_name.get_mut(&(
                kind.clone(),
                stream_key(&incoming.stream_url).to_string(),
                incoming.name.clone(),
            )))
        })
        .or_else(|| take(self.by_name.get_mut(&(kind.clone(), incoming.name.clone()))))?;
        Some(if self.rows.get(&id) == Some(incoming) {
            Claimed::Unchanged
        } else {
            Claimed::Changed(id)
        })
    }

    fn unclaimed_ids(&self) -> Vec<i64> {
        let mut ids: Vec<i64> = self
            .rows
            .keys()
            .copied()
            .filter(|id| !self.claimed.contains(id))
            .collect();
        ids.sort_unstable();
        ids
    }
}

pub fn list_groups_for_source(
    db_path: &Path,
    source_id: i64,
    media_kind: Option<&str>,
) -> Result<Vec<GroupRecord>, String> {
    let connection = open_connection(db_path)?;
    let mut statement = connection
        .prepare(
            r#"
            SELECT group_name, COUNT(*)
            FROM channels
            WHERE source_id = ?1
              AND (?2 = '' OR media_kind = ?2)
            GROUP BY group_name
            ORDER BY group_name COLLATE NOCASE ASC
            "#,
        )
        .map_err(|e| format!("prepare failed: {e}"))?;

    let normalized_media_kind = media_kind.map(normalize_media_kind).unwrap_or_default();

    let mut rows = statement
        .query(params![source_id, normalized_media_kind])
        .map_err(|e| format!("query failed: {e}"))?;

    let mut groups = Vec::new();
    while let Some(row) = rows.next().map_err(|e| format!("read row failed: {e}"))? {
        groups.push(GroupRecord {
            name: row
                .get(0)
                .map_err(|e| format!("decode group name failed: {e}"))?,
            channel_count: row
                .get(1)
                .map_err(|e| format!("decode channel_count failed: {e}"))?,
        });
    }

    Ok(groups)
}

pub fn list_channels_for_source(
    db_path: &Path,
    source_id: i64,
    media_kind: Option<&str>,
    group_name: Option<&str>,
    query: Option<&str>,
    favorites_only: bool,
) -> Result<Vec<ChannelRecord>, String> {
    let connection = open_connection(db_path)?;
    let mut statement = connection
        .prepare(
            r#"
            SELECT
              c.id,
              c.source_id,
              c.name,
              c.group_name,
              c.logo,
              c.tvg_id,
              c.tvg_name,
              c.stream_url,
              c.media_kind,
              CASE WHEN f.channel_id IS NULL THEN 0 ELSE 1 END AS is_favorite
            FROM channels c
            LEFT JOIN favorites f ON f.channel_id = c.id
            WHERE c.source_id = ?1
              AND (?2 = '' OR c.media_kind = ?2)
              AND (?3 = '' OR c.group_name = ?3)
              AND (?4 = '' OR lower(c.name) LIKE ?4 OR lower(COALESCE(c.tvg_name, '')) LIKE ?4)
              AND (?5 = 0 OR f.channel_id IS NOT NULL)
            ORDER BY c.name COLLATE NOCASE ASC
            "#,
        )
        .map_err(|e| format!("prepare failed: {e}"))?;

    let normalized_media_kind = media_kind.map(normalize_media_kind).unwrap_or_default();
    let normalized_group = group_name
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("")
        .to_string();
    let normalized_query = query
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| format!("%{}%", value.to_lowercase()))
        .unwrap_or_default();
    let favorites_flag = if favorites_only { 1 } else { 0 };

    let mut rows = statement
        .query(params![
            source_id,
            normalized_media_kind,
            normalized_group,
            normalized_query,
            favorites_flag,
        ])
        .map_err(|e| format!("query failed: {e}"))?;

    let mut channels = Vec::new();
    while let Some(row) = rows.next().map_err(|e| format!("read row failed: {e}"))? {
        channels.push(decode_channel_record(&row)?);
    }

    Ok(channels)
}

/// Name matches across a source's catalog, at most `limit_per_kind` of each
/// media kind (in name order), for a quick search that shows a few of each.
pub fn search_channels_for_source(
    db_path: &Path,
    source_id: i64,
    query: &str,
    limit_per_kind: usize,
) -> Result<Vec<ChannelRecord>, String> {
    let pattern = format!("%{}%", query.trim().to_lowercase());
    let connection = open_connection(db_path)?;
    let mut statement = connection
        .prepare(
            r#"
            SELECT id, source_id, name, group_name, logo, tvg_id, tvg_name, stream_url,
                   media_kind, is_favorite
            FROM (
              SELECT
                c.id, c.source_id, c.name, c.group_name, c.logo, c.tvg_id, c.tvg_name,
                c.stream_url, c.media_kind,
                CASE WHEN f.channel_id IS NULL THEN 0 ELSE 1 END AS is_favorite,
                ROW_NUMBER() OVER (
                  PARTITION BY c.media_kind ORDER BY c.name COLLATE NOCASE ASC
                ) AS rank_in_kind
              FROM channels c
              LEFT JOIN favorites f ON f.channel_id = c.id
              WHERE c.source_id = ?1
                AND (lower(c.name) LIKE ?2 OR lower(COALESCE(c.tvg_name, '')) LIKE ?2)
            )
            WHERE rank_in_kind <= ?3
            ORDER BY media_kind, name COLLATE NOCASE ASC
            "#,
        )
        .map_err(|e| format!("prepare search failed: {e}"))?;
    let mut rows = statement
        .query(params![source_id, pattern, limit_per_kind as i64])
        .map_err(|e| format!("search failed: {e}"))?;
    let mut channels = Vec::new();
    while let Some(row) = rows.next().map_err(|e| format!("read row failed: {e}"))? {
        channels.push(decode_channel_record(row)?);
    }
    Ok(channels)
}

pub fn get_channel_by_id(db_path: &Path, channel_id: i64) -> Result<Option<ChannelRecord>, String> {
    let connection = open_connection(db_path)?;
    let mut statement = connection
        .prepare(
            r#"
            SELECT
              c.id,
              c.source_id,
              c.name,
              c.group_name,
              c.logo,
              c.tvg_id,
              c.tvg_name,
              c.stream_url,
              c.media_kind,
              CASE WHEN f.channel_id IS NULL THEN 0 ELSE 1 END AS is_favorite
            FROM channels c
            LEFT JOIN favorites f ON f.channel_id = c.id
            WHERE c.id = ?1
            LIMIT 1
            "#,
        )
        .map_err(|e| format!("prepare failed: {e}"))?;

    let mut rows = statement
        .query(params![channel_id])
        .map_err(|e| format!("query failed: {e}"))?;

    match rows.next().map_err(|e| format!("read row failed: {e}"))? {
        Some(row) => decode_channel_record(&row).map(Some),
        None => Ok(None),
    }
}

pub fn set_channel_favorite(db_path: &Path, channel_id: i64, favorite: bool) -> Result<(), String> {
    let connection = open_connection(db_path)?;
    if favorite {
        connection
            .execute(
                "INSERT INTO favorites(channel_id, created_at) VALUES (?1, ?2) ON CONFLICT(channel_id) DO NOTHING",
                params![channel_id, unix_ts()],
            )
            .map_err(|e| format!("insert favorite failed: {e}"))?;
    } else {
        connection
            .execute(
                "DELETE FROM favorites WHERE channel_id = ?1",
                params![channel_id],
            )
            .map_err(|e| format!("delete favorite failed: {e}"))?;
    }
    Ok(())
}

pub fn record_recent_play(db_path: &Path, channel_id: i64) -> Result<(), String> {
    let connection = open_connection(db_path)?;
    const RECENTS_PER_MEDIA_KIND: i64 = 20;

    connection
        .execute(
            "INSERT INTO recents(channel_id, played_at) VALUES (?1, ?2)",
            params![channel_id, unix_ts()],
        )
        .map_err(|e| format!("insert recent failed: {e}"))?;

    connection
        .execute(
            "\
            DELETE FROM recents
            WHERE id IN (
                SELECT r.id
                FROM recents r
                INNER JOIN channels c ON c.id = r.channel_id
                WHERE (
                    SELECT COUNT(*)
                    FROM recents r2
                    INNER JOIN channels c2 ON c2.id = r2.channel_id
                    WHERE c2.media_kind = c.media_kind
                      AND (
                        r2.played_at > r.played_at
                        OR (r2.played_at = r.played_at AND r2.id > r.id)
                      )
                ) >= ?1
            )",
            params![RECENTS_PER_MEDIA_KIND],
        )
        .map_err(|e| format!("prune recents failed: {e}"))?;

    Ok(())
}

pub fn list_recent_channels(
    db_path: &Path,
    limit: usize,
) -> Result<Vec<RecentChannelRecord>, String> {
    let connection = open_connection(db_path)?;
    let mut statement = connection
        .prepare(
            r#"
            SELECT
              c.id,
              c.source_id,
              c.name,
              c.group_name,
              c.logo,
              c.tvg_id,
              c.tvg_name,
              c.stream_url,
              c.media_kind,
              CASE WHEN f.channel_id IS NULL THEN 0 ELSE 1 END AS is_favorite,
              recents.played_at
            FROM channels c
            JOIN (
              SELECT channel_id, MAX(played_at) AS played_at
              FROM recents
              GROUP BY channel_id
              ORDER BY played_at DESC
              LIMIT ?1
            ) recents ON recents.channel_id = c.id
            LEFT JOIN favorites f ON f.channel_id = c.id
            ORDER BY recents.played_at DESC
            "#,
        )
        .map_err(|e| format!("prepare failed: {e}"))?;

    let mut rows = statement
        .query(params![limit as i64])
        .map_err(|e| format!("query failed: {e}"))?;

    let mut recent_channels = Vec::new();
    while let Some(row) = rows.next().map_err(|e| format!("read row failed: {e}"))? {
        let channel = decode_channel_record(&row)?;
        let played_at = row
            .get(10)
            .map_err(|e| format!("decode played_at failed: {e}"))?;
        recent_channels.push(RecentChannelRecord { channel, played_at });
    }

    Ok(recent_channels)
}

/// Masks credentials in a message: `username=`/`password=` query values and
/// `user:pass@` in URLs. Use before logging, storing or showing errors that
/// may quote a provider URL.
pub fn redact_credentials(message: &str) -> String {
    let mut out = String::with_capacity(message.len());
    let mut rest = message;
    loop {
        let lower = rest.to_ascii_lowercase();
        let query = ["username=", "password="]
            .iter()
            .filter_map(|marker| lower.find(marker).map(|at| (at, at + marker.len())))
            .min();
        let userinfo = lower.find("://").and_then(|scheme_end| {
            let authority_start = scheme_end + 3;
            let authority_len = rest[authority_start..]
                .find(['/', ' ', '?', '#', ')', '"', '\''])
                .unwrap_or(rest.len() - authority_start);
            let at = rest[authority_start..authority_start + authority_len].rfind('@')?;
            Some((authority_start, authority_start + at))
        });
        let next = match (query, userinfo) {
            (Some(q), Some(u)) => Some(if u.0 < q.0 { (u, true) } else { (q, false) }),
            (Some(q), None) => Some((q, false)),
            (None, Some(u)) => Some((u, true)),
            (None, None) => None,
        };
        let Some(((start, value_start), is_userinfo)) = next else {
            out.push_str(rest);
            return out;
        };
        if is_userinfo {
            out.push_str(&rest[..start]);
            out.push_str("***");
            rest = &rest[value_start..];
        } else {
            out.push_str(&rest[..value_start]);
            let value_len = rest[value_start..]
                .find(|ch: char| ch == '&' || ch.is_whitespace() || ")\"'".contains(ch))
                .unwrap_or(rest.len() - value_start);
            if value_len > 0 {
                out.push_str("***");
            }
            rest = &rest[value_start + value_len..];
        }
    }
}

pub fn append_log(log_path: &Path, level: &str, message: &str) -> Result<(), String> {
    let line = format!("[{}] [{}] {}\n", unix_ts(), level, message);
    append_line(log_path, &line)
}

pub fn init_log_file(log_path: &Path) -> Result<(), String> {
    if !log_path.exists() {
        File::create(log_path).map_err(|e| format!("log file create failed: {e}"))?;
    }
    append_log(log_path, "INFO", "SilkCast foundation logger initialized")?;
    Ok(())
}

pub fn install_crash_hook(crash_dir: PathBuf, log_path: PathBuf) {
    std::panic::set_hook(Box::new(move |panic_info| {
        let ts = unix_ts();
        let payload = format!("panic captured at {ts}: {panic_info}\n");
        let crash_path = crash_dir.join(format!("crash-{ts}.log"));
        let _ = append_line(&crash_path, &payload);
        let _ = append_log(
            &log_path,
            "ERROR",
            &format!("panic captured, report: {}", crash_path.display()),
        );
    }));
}

pub fn emit_backend_event<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    event: &str,
    payload: Value,
) -> Result<(), String> {
    app.emit(
        "backend:event",
        EventEnvelope {
            event: event.to_string(),
            payload,
            ts: unix_ts(),
        },
    )
    .map_err(|e| format!("emit failed: {e}"))
}

#[derive(Clone, Debug, Serialize)]
struct EventEnvelope {
    event: String,
    payload: Value,
    ts: i64,
}

fn append_line(path: &Path, line: &str) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| format!("open failed for {}: {e}", path.display()))?;
    file.write_all(line.as_bytes())
        .map_err(|e| format!("write failed for {}: {e}", path.display()))?;
    Ok(())
}

fn unix_ts() -> i64 {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    now.as_secs() as i64
}

/// How long a write waits for another connection's transaction (a catalog
/// import or guide save on a background thread) instead of failing with
/// "database is locked".
const DB_BUSY_TIMEOUT: Duration = Duration::from_secs(10);

/// Idle connections kept for reuse. Opening one costs about a millisecond on
/// Windows (file open, pragmas, schema load) against microseconds per query.
const MAX_IDLE_CONNECTIONS: usize = 4;

static IDLE_CONNECTIONS: Mutex<Vec<(PathBuf, Connection)>> = Mutex::new(Vec::new());

/// A database connection that goes back to the idle pool when dropped.
pub(crate) struct PooledConnection {
    connection: Option<Connection>,
    db_path: PathBuf,
}

impl std::ops::Deref for PooledConnection {
    type Target = Connection;

    fn deref(&self) -> &Connection {
        self.connection
            .as_ref()
            .expect("pooled connection is present until drop")
    }
}

impl std::ops::DerefMut for PooledConnection {
    fn deref_mut(&mut self) -> &mut Connection {
        self.connection
            .as_mut()
            .expect("pooled connection is present until drop")
    }
}

impl Drop for PooledConnection {
    fn drop(&mut self) {
        let Some(connection) = self.connection.take() else {
            return;
        };
        // Never hand out a connection that is still inside a transaction.
        if !connection.is_autocommit() {
            return;
        }
        if let Ok(mut idle) = IDLE_CONNECTIONS.lock() {
            // Keep the most recently used connections; close the oldest.
            if idle.len() >= MAX_IDLE_CONNECTIONS {
                idle.remove(0);
            }
            idle.push((std::mem::take(&mut self.db_path), connection));
        }
    }
}

/// A connection to the app database, reused from the idle pool when possible.
pub(crate) fn open_connection(db_path: &Path) -> Result<PooledConnection, String> {
    let reused = IDLE_CONNECTIONS.lock().ok().and_then(|mut idle| {
        let index = idle.iter().rposition(|(path, _)| path == db_path)?;
        Some(idle.swap_remove(index).1)
    });
    let connection = match reused {
        Some(connection) => connection,
        None => open_new_connection(db_path)?,
    };
    Ok(PooledConnection {
        connection: Some(connection),
        db_path: db_path.to_path_buf(),
    })
}

fn open_new_connection(db_path: &Path) -> Result<Connection, String> {
    let connection = Connection::open(db_path).map_err(|e| format!("db open failed: {e}"))?;
    connection
        .busy_timeout(DB_BUSY_TIMEOUT)
        .map_err(|e| format!("db busy timeout setup failed: {e}"))?;
    // WAL is persistent and set once in `init_storage`; NORMAL sync is safe under WAL.
    connection
        .execute_batch(
            r#"
            PRAGMA foreign_keys = ON;
            PRAGMA synchronous = NORMAL;
            "#,
        )
        .map_err(|e| format!("db pragma setup failed: {e}"))?;
    Ok(connection)
}

fn decode_source_record(row: &rusqlite::Row<'_>) -> Result<SourceRecord, String> {
    let config_json: String = row
        .get(3)
        .map_err(|e| format!("decode config failed: {e}"))?;
    let config: Value =
        serde_json::from_str(&config_json).map_err(|e| format!("parse config failed: {e}"))?;
    let source_type: String = row
        .get(1)
        .map_err(|e| format!("decode source_type failed: {e}"))?;
    let detected_guide_url: Option<String> = row
        .get(9)
        .map_err(|e| format!("decode guide url failed: {e}"))?;
    let supports_guide = source_type == "xtream"
        || configured_guide_url(&config).is_some()
        || detected_guide_url.is_some_and(|url| !url.trim().is_empty());
    let guide_column = |index: usize| -> Result<Option<i64>, String> {
        row.get(index)
            .map_err(|e| format!("decode guide status failed: {e}"))
    };
    Ok(SourceRecord {
        id: row.get(0).map_err(|e| format!("decode id failed: {e}"))?,
        source_type,
        name: row.get(2).map_err(|e| format!("decode name failed: {e}"))?,
        config,
        created_at: row
            .get(4)
            .map_err(|e| format!("decode created_at failed: {e}"))?,
        supports_guide,
        guide_refreshed_at: guide_column(5)?,
        guide_covered_until: guide_column(6)?,
        guide_error: row
            .get(7)
            .map_err(|e| format!("decode guide error failed: {e}"))?,
        guide_attempted_at: guide_column(8)?,
    })
}

/// The guide URL a user set on a source (`epg_url`), overriding the default.
pub fn configured_guide_url(config: &Value) -> Option<&str> {
    config
        .get("epg_url")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|url| !url.is_empty())
}

fn decode_channel_record(row: &rusqlite::Row<'_>) -> Result<ChannelRecord, String> {
    let is_favorite: i64 = row
        .get(9)
        .map_err(|e| format!("decode is_favorite failed: {e}"))?;

    Ok(ChannelRecord {
        id: row.get(0).map_err(|e| format!("decode id failed: {e}"))?,
        source_id: row
            .get(1)
            .map_err(|e| format!("decode source_id failed: {e}"))?,
        name: row.get(2).map_err(|e| format!("decode name failed: {e}"))?,
        group_name: row
            .get(3)
            .map_err(|e| format!("decode group_name failed: {e}"))?,
        logo: row.get(4).map_err(|e| format!("decode logo failed: {e}"))?,
        tvg_id: row
            .get(5)
            .map_err(|e| format!("decode tvg_id failed: {e}"))?,
        stream_url: row
            .get(7)
            .map_err(|e| format!("decode stream_url failed: {e}"))?,
        media_kind: row
            .get(8)
            .map_err(|e| format!("decode media_kind failed: {e}"))?,
        is_favorite: is_favorite == 1,
    })
}

fn normalize_media_kind(input: &str) -> String {
    match input.trim().to_ascii_lowercase().as_str() {
        "movie" => "movie".to_string(),
        "series" => "series".to_string(),
        "live" => "live".to_string(),
        _ => "live".to_string(),
    }
}

trait SourceProvider: Send + Sync {
    fn validate_config(&self, config: &Value) -> Result<(), String>;
}

struct SourceRegistry {
    providers: HashMap<String, Arc<dyn SourceProvider>>,
}

impl SourceRegistry {
    fn validate(&self, source_type: &str, config: &Value) -> Result<(), String> {
        let Some(provider) = self.providers.get(source_type) else {
            return Err(format!("unsupported source type: {source_type}"));
        };
        provider.validate_config(config)
    }
}

impl SourceRegistry {
    fn with_defaults() -> Self {
        let mut providers: HashMap<String, Arc<dyn SourceProvider>> = HashMap::new();
        providers.insert("m3u".to_string(), Arc::new(M3uSourceProvider));
        providers.insert("xtream".to_string(), Arc::new(XtreamSourceProvider));
        Self { providers }
    }
}

struct M3uSourceProvider;

impl SourceProvider for M3uSourceProvider {
    fn validate_config(&self, config: &Value) -> Result<(), String> {
        let location = config
            .get("location")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if location.trim().is_empty() {
            return Err("m3u config requires a non-empty `location`".to_string());
        }
        Ok(())
    }
}

struct XtreamSourceProvider;

impl SourceProvider for XtreamSourceProvider {
    fn validate_config(&self, config: &Value) -> Result<(), String> {
        XtreamConfig::from_value(config).map(|_| ())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn make_temp_root() -> PathBuf {
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        // Parallel tests can read the same clock tick on Windows (100 ns), so
        // a counter keeps every test on its own database.
        static NEXT: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
        let seq = NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!(
            "silkcast-foundation-test-{}-{ts}-{seq}",
            std::process::id()
        ));
        fs::create_dir_all(&dir).expect("failed to create temp test dir");
        dir
    }

    fn make_source_with_channels(db_path: &Path) -> i64 {
        let source_id = create_source(
            db_path,
            "m3u",
            "Playlist",
            &json!({ "location": "https://example.com/list.m3u" }),
        )
        .expect("failed to create source");

        replace_channels_for_source(
            db_path,
            source_id,
            &[
                ChannelInsertRecord {
                    name: "Alpha Live".to_string(),
                    group_name: Some("News".to_string()),
                    logo: None,
                    tvg_id: Some("alpha-live".to_string()),
                    tvg_name: Some("Alpha Live HD".to_string()),
                    stream_url: "https://stream.example/live.m3u8".to_string(),
                    media_kind: "live".to_string(),
                },
                ChannelInsertRecord {
                    name: "Bravo Movie".to_string(),
                    group_name: Some("Cinema".to_string()),
                    logo: None,
                    tvg_id: Some("bravo-movie".to_string()),
                    tvg_name: Some("Bravo Movie 2026".to_string()),
                    stream_url: "https://stream.example/movie.mp4".to_string(),
                    media_kind: "movie".to_string(),
                },
                ChannelInsertRecord {
                    name: "Charlie Series".to_string(),
                    group_name: Some("Shows".to_string()),
                    logo: None,
                    tvg_id: Some("charlie-series".to_string()),
                    tvg_name: Some("Charlie S01E02".to_string()),
                    stream_url: "https://stream.example/series.mkv".to_string(),
                    media_kind: "series".to_string(),
                },
            ],
        )
        .expect("failed to insert channels");

        source_id
    }

    #[test]
    fn storage_settings_roundtrip() {
        let root = make_temp_root();
        let context = ensure_foundation_dirs(&root).expect("failed to create foundation dirs");
        init_storage(&context.db_path).expect("failed to initialize storage");

        set_setting(&context.db_path, "debug_mode", "true").expect("failed to set setting");
        let value = get_setting(&context.db_path, "debug_mode").expect("failed to read setting");
        assert_eq!(value.as_deref(), Some("true"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn source_insert_and_list() {
        let root = make_temp_root();
        let context = ensure_foundation_dirs(&root).expect("failed to create foundation dirs");
        init_storage(&context.db_path).expect("failed to initialize storage");

        let id = create_source(
            &context.db_path,
            "m3u",
            "Test Playlist",
            &json!({ "location": "https://example.com/list.m3u" }),
        )
        .expect("failed to insert source");

        let sources = list_sources(&context.db_path).expect("failed to list sources");
        assert_eq!(sources.len(), 1);
        assert_eq!(sources[0].id, id);
        assert_eq!(sources[0].source_type, "m3u");
        assert_eq!(sources[0].name, "Test Playlist");

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn source_update_roundtrip() {
        let root = make_temp_root();
        let context = ensure_foundation_dirs(&root).expect("failed to create foundation dirs");
        init_storage(&context.db_path).expect("failed to initialize storage");

        let id = create_source(
            &context.db_path,
            "m3u",
            "Original Playlist",
            &json!({ "location": "https://example.com/original.m3u" }),
        )
        .expect("failed to insert source");

        update_source(
            &context.db_path,
            id,
            "Updated Playlist",
            &json!({ "location": "https://example.com/updated.m3u" }),
        )
        .expect("failed to update source");

        let source = get_source_by_id(&context.db_path, id)
            .expect("failed to load source")
            .expect("source should exist");
        assert_eq!(source.name, "Updated Playlist");
        assert_eq!(
            source
                .config
                .get("location")
                .and_then(Value::as_str)
                .unwrap_or_default(),
            "https://example.com/updated.m3u"
        );

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn source_provider_validation_rules() {
        let registry = SourceRegistry::with_defaults();

        let m3u_ok = registry.validate("m3u", &json!({ "location": "file:///tmp/test.m3u" }));
        assert!(m3u_ok.is_ok());

        let m3u_bad = registry.validate("m3u", &json!({ "location": "" }));
        assert!(m3u_bad.is_err());

        let xtream_ok = registry.validate(
            "xtream",
            &json!({
                "server_url": "https://provider.example:8080/player_api.php",
                "username": "alice",
                "password": "secret"
            }),
        );
        assert!(xtream_ok.is_ok());

        let xtream_bad = registry.validate(
            "xtream",
            &json!({
                "server_url": "provider.example",
                "username": "alice",
                "password": ""
            }),
        );
        assert!(xtream_bad.is_err());
    }

    #[test]
    fn replace_channels_and_favorites_roundtrip() {
        let root = make_temp_root();
        let context = ensure_foundation_dirs(&root).expect("failed to create foundation dirs");
        init_storage(&context.db_path).expect("failed to initialize storage");

        let source_id = create_source(
            &context.db_path,
            "m3u",
            "Playlist",
            &json!({ "location": "https://example.com/list.m3u" }),
        )
        .expect("failed to create source");

        let count = replace_channels_for_source(
            &context.db_path,
            source_id,
            &[
                ChannelInsertRecord {
                    name: "News Channel".to_string(),
                    group_name: Some("News".to_string()),
                    logo: Some("https://img.example/news.png".to_string()),
                    tvg_id: Some("news-1".to_string()),
                    tvg_name: Some("News HD".to_string()),
                    stream_url: "https://stream.example/news.m3u8".to_string(),
                    media_kind: "live".to_string(),
                },
                ChannelInsertRecord {
                    name: "Sports Channel".to_string(),
                    group_name: Some("Sports".to_string()),
                    logo: None,
                    tvg_id: None,
                    tvg_name: None,
                    stream_url: "https://stream.example/sports.m3u8".to_string(),
                    media_kind: "live".to_string(),
                },
            ],
        )
        .expect("failed to replace channels");

        assert_eq!(count, 2);

        let all_channels =
            list_channels_for_source(&context.db_path, source_id, None, None, None, false)
                .expect("failed to list channels");
        assert_eq!(all_channels.len(), 2);

        set_channel_favorite(&context.db_path, all_channels[0].id, true)
            .expect("failed to set favorite");

        let favorites =
            list_channels_for_source(&context.db_path, source_id, None, None, None, true)
                .expect("failed to list favorites");
        assert_eq!(favorites.len(), 1);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn replace_channels_keeps_favorites_and_recents_across_refresh() {
        let root = make_temp_root();
        let context = ensure_foundation_dirs(&root).expect("failed to create foundation dirs");
        init_storage(&context.db_path).expect("failed to initialize storage");
        let source_id = create_source(
            &context.db_path,
            "xtream",
            "Provider",
            &json!({ "server_url": "http://x", "username": "u", "password": "p" }),
        )
        .expect("failed to create source");

        let channel = |name: &str, url: &str, kind: &str| ChannelInsertRecord {
            name: name.to_string(),
            group_name: Some("Group".to_string()),
            logo: None,
            tvg_id: None,
            tvg_name: None,
            stream_url: url.to_string(),
            media_kind: kind.to_string(),
        };

        replace_channels_for_source(
            &context.db_path,
            source_id,
            &[
                channel("News", "http://x/live/u/p/1.ts", "live"),
                channel("Sports", "http://x/live/u/p/2.ts", "live"),
                channel("Film", "http://x/movie/u/p/3.mp4", "movie"),
            ],
        )
        .expect("initial import failed");
        let before = list_channels_for_source(&context.db_path, source_id, None, None, None, false)
            .expect("list failed");
        let id_of = |channels: &[ChannelRecord], name: &str| {
            channels
                .iter()
                .find(|item| item.name == name)
                .map(|item| item.id)
                .expect("channel missing")
        };
        set_channel_favorite(&context.db_path, id_of(&before, "News"), true)
            .expect("favorite failed");
        set_channel_favorite(&context.db_path, id_of(&before, "Film"), true)
            .expect("favorite failed");
        record_recent_play(&context.db_path, id_of(&before, "Sports")).expect("recent failed");

        // Refresh: new order, a new channel, and the movie's URL changed (new
        // password) so it can only be matched by name.
        replace_channels_for_source(
            &context.db_path,
            source_id,
            &[
                channel("Brand New", "http://x/live/u/p/9.ts", "live"),
                channel("Sports", "http://x/live/u/p/2.ts", "live"),
                channel("Film", "http://x/movie/u/p2/3.mp4", "movie"),
                channel("News", "http://x/live/u/p/1.ts", "live"),
            ],
        )
        .expect("refresh failed");

        let after = list_channels_for_source(&context.db_path, source_id, None, None, None, false)
            .expect("list failed");
        for name in ["News", "Sports", "Film"] {
            assert_eq!(
                id_of(&before, name),
                id_of(&after, name),
                "{name} keeps its id"
            );
        }
        let film = after.iter().find(|item| item.name == "Film").expect("film");
        assert_eq!(
            film.stream_url, "http://x/movie/u/p2/3.mp4",
            "row is updated in place"
        );

        let mut favorites: Vec<String> =
            list_channels_for_source(&context.db_path, source_id, None, None, None, true)
                .expect("favorites failed")
                .into_iter()
                .map(|item| item.name)
                .collect();
        favorites.sort();
        assert_eq!(favorites, vec!["Film".to_string(), "News".to_string()]);

        let recents = list_recent_channels(&context.db_path, 10).expect("recents failed");
        assert_eq!(recents.len(), 1);
        assert_eq!(recents[0].channel.name, "Sports");
        assert_eq!(recents[0].channel.id, id_of(&after, "Sports"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn refresh_updates_in_place_and_drops_only_removed_channels() {
        let root = make_temp_root();
        let context = ensure_foundation_dirs(&root).expect("failed to create foundation dirs");
        init_storage(&context.db_path).expect("failed to initialize storage");
        let source_id = create_source(
            &context.db_path,
            "xtream",
            "Provider",
            &json!({ "server_url": "http://x", "username": "u", "password": "p" }),
        )
        .expect("failed to create source");
        let channel = |name: &str, url: &str, group: &str| ChannelInsertRecord {
            name: name.to_string(),
            group_name: Some(group.to_string()),
            logo: None,
            tvg_id: None,
            tvg_name: None,
            stream_url: url.to_string(),
            media_kind: "live".to_string(),
        };

        replace_channels_for_source(
            &context.db_path,
            source_id,
            &[
                channel("News", "http://x/live/u/p/1.ts", "News"),
                channel("Gone", "http://x/live/u/p/2.ts", "News"),
                // Providers list the same stream twice under different groups.
                channel("Twin", "http://x/live/u/p/3.ts", "UK"),
                channel("Twin", "http://x/live/u/p/3.ts", "US"),
            ],
        )
        .expect("initial import failed");
        let before = list_channels_for_source(&context.db_path, source_id, None, None, None, false)
            .expect("list failed");
        let id_of = |name: &str| before.iter().find(|c| c.name == name).expect(name).id;
        set_channel_favorite(&context.db_path, id_of("Gone"), true).expect("favorite failed");

        replace_channels_for_source(
            &context.db_path,
            source_id,
            &[
                channel("News", "http://x/live/u/p/1.ts", "World News"),
                channel("Twin", "http://x/live/u/p/3.ts", "UK"),
                channel("Twin", "http://x/live/u/p/3.ts", "US"),
            ],
        )
        .expect("refresh failed");

        let after = list_channels_for_source(&context.db_path, source_id, None, None, None, false)
            .expect("list failed");
        assert_eq!(after.len(), 3);
        let news = after.iter().find(|c| c.name == "News").expect("news");
        assert_eq!(news.id, id_of("News"));
        assert_eq!(news.group_name, "World News");

        let mut twin_ids: Vec<i64> = after
            .iter()
            .filter(|c| c.name == "Twin")
            .map(|c| c.id)
            .collect();
        let mut old_twin_ids: Vec<i64> = before
            .iter()
            .filter(|c| c.name == "Twin")
            .map(|c| c.id)
            .collect();
        twin_ids.sort();
        old_twin_ids.sort();
        assert_eq!(twin_ids, old_twin_ids, "duplicates map one-to-one");

        // The removed channel takes its favorite with it.
        assert!(
            list_channels_for_source(&context.db_path, source_id, None, None, None, true)
                .expect("favorites failed")
                .is_empty()
        );

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn phase1_settings_roundtrip_and_normalize_buffering() {
        let root = make_temp_root();
        let context = ensure_foundation_dirs(&root).expect("failed to create foundation dirs");
        init_storage(&context.db_path).expect("failed to initialize storage");

        let input = Phase1Settings {
            hardware_decode: false,
            buffering_preset: "high".to_string(),
            startup_behavior: "resume_last".to_string(),
            preferred_player: "mpv".to_string(),
        };
        save_phase1_settings(&context.db_path, &input).expect("failed to save settings");

        let loaded =
            load_phase1_settings(&context.db_path).expect("failed to load settings from storage");
        assert!(!loaded.hardware_decode);
        assert_eq!(loaded.startup_behavior, "resume_last");
        assert_eq!(loaded.preferred_player, "mpv");
        assert_eq!(loaded.buffering_preset, "normal");

        let stored_buffering =
            get_setting(&context.db_path, "playback.buffering_preset").expect("read failed");
        assert_eq!(stored_buffering.as_deref(), Some("normal"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn search_caps_matches_per_media_kind() {
        let root = make_temp_root();
        let context = ensure_foundation_dirs(&root).expect("failed to create foundation dirs");
        init_storage(&context.db_path).expect("failed to initialize storage");
        let source_id = create_source(&context.db_path, "m3u", "List", &json!({ "location": "x" }))
            .expect("failed to create source");
        let item = |name: String, kind: &str| ChannelInsertRecord {
            name,
            group_name: None,
            logo: None,
            tvg_id: None,
            tvg_name: None,
            stream_url: format!("http://x/{kind}/{}", rand_suffix()),
            media_kind: kind.to_string(),
        };
        let mut items: Vec<ChannelInsertRecord> = (0..40)
            .map(|index| item(format!("Sports {index:02}"), "live"))
            .collect();
        items.extend((0..3).map(|index| item(format!("Sports Movie {index}"), "movie")));
        items.push(item("Unrelated".to_string(), "series"));
        replace_channels_for_source(&context.db_path, source_id, &items).expect("import failed");

        let found = search_channels_for_source(&context.db_path, source_id, " SPORTS ", 5)
            .expect("search failed");
        let names: Vec<&str> = found.iter().map(|c| c.name.as_str()).collect();
        assert_eq!(
            names,
            vec![
                "Sports 00",
                "Sports 01",
                "Sports 02",
                "Sports 03",
                "Sports 04",
                "Sports Movie 0",
                "Sports Movie 1",
                "Sports Movie 2",
            ]
        );

        let _ = fs::remove_dir_all(root);
    }

    fn rand_suffix() -> usize {
        static NEXT: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
        NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
    }

    #[test]
    fn list_channels_applies_filters() {
        let root = make_temp_root();
        let context = ensure_foundation_dirs(&root).expect("failed to create foundation dirs");
        init_storage(&context.db_path).expect("failed to initialize storage");
        let source_id = make_source_with_channels(&context.db_path);

        let all = list_channels_for_source(&context.db_path, source_id, None, None, None, false)
            .expect("failed to list all channels");
        assert_eq!(all.len(), 3);

        let movies = list_channels_for_source(
            &context.db_path,
            source_id,
            Some("movie"),
            None,
            None,
            false,
        )
        .expect("failed to filter by media_kind");
        assert_eq!(movies.len(), 1);
        assert_eq!(movies[0].name, "Bravo Movie");

        let by_group =
            list_channels_for_source(&context.db_path, source_id, None, Some("News"), None, false)
                .expect("failed to filter by group");
        assert_eq!(by_group.len(), 1);
        assert_eq!(by_group[0].name, "Alpha Live");

        let by_query = list_channels_for_source(
            &context.db_path,
            source_id,
            None,
            None,
            Some("s01e02"),
            false,
        )
        .expect("failed to filter by query");
        assert_eq!(by_query.len(), 1);
        assert_eq!(by_query[0].name, "Charlie Series");

        set_channel_favorite(&context.db_path, all[0].id, true).expect("favorite set failed");
        let favorites =
            list_channels_for_source(&context.db_path, source_id, None, None, None, true)
                .expect("failed to filter favorites");
        assert_eq!(favorites.len(), 1);
        assert_eq!(favorites[0].id, all[0].id);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn recent_channels_limit_and_ordering() {
        let root = make_temp_root();
        let context = ensure_foundation_dirs(&root).expect("failed to create foundation dirs");
        init_storage(&context.db_path).expect("failed to initialize storage");
        let source_id = make_source_with_channels(&context.db_path);
        let channels =
            list_channels_for_source(&context.db_path, source_id, None, None, None, false)
                .expect("failed to list channels");

        let channel_a = channels
            .iter()
            .find(|c| c.name == "Alpha Live")
            .expect("missing A");
        let channel_b = channels
            .iter()
            .find(|c| c.name == "Bravo Movie")
            .expect("missing B");
        let channel_c = channels
            .iter()
            .find(|c| c.name == "Charlie Series")
            .expect("missing C");

        let connection = open_connection(&context.db_path).expect("failed to open db connection");
        connection
            .execute(
                "INSERT INTO recents(channel_id, played_at) VALUES (?1, ?2)",
                params![channel_a.id, 100],
            )
            .expect("insert recent A");
        connection
            .execute(
                "INSERT INTO recents(channel_id, played_at) VALUES (?1, ?2)",
                params![channel_b.id, 200],
            )
            .expect("insert recent B");
        connection
            .execute(
                "INSERT INTO recents(channel_id, played_at) VALUES (?1, ?2)",
                params![channel_a.id, 300],
            )
            .expect("insert recent A second");
        connection
            .execute(
                "INSERT INTO recents(channel_id, played_at) VALUES (?1, ?2)",
                params![channel_c.id, 250],
            )
            .expect("insert recent C");

        let recents = list_recent_channels(&context.db_path, 2).expect("failed to read recents");
        assert_eq!(recents.len(), 2);
        assert_eq!(recents[0].channel.name, "Alpha Live");
        assert_eq!(recents[0].played_at, 300);
        assert_eq!(recents[1].channel.name, "Charlie Series");
        assert_eq!(recents[1].played_at, 250);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn record_recent_play_keeps_last_20_per_media_kind() {
        let root = make_temp_root();
        let context = ensure_foundation_dirs(&root).expect("failed to create foundation dirs");
        init_storage(&context.db_path).expect("failed to initialize storage");
        let source_id = make_source_with_channels(&context.db_path);
        let channels =
            list_channels_for_source(&context.db_path, source_id, None, None, None, false)
                .expect("failed to list channels");

        let live_channel = channels
            .iter()
            .find(|channel| channel.media_kind == "live")
            .expect("missing live channel");
        let movie_channel = channels
            .iter()
            .find(|channel| channel.media_kind == "movie")
            .expect("missing movie channel");
        let series_channel = channels
            .iter()
            .find(|channel| channel.media_kind == "series")
            .expect("missing series channel");

        for _ in 0..25 {
            record_recent_play(&context.db_path, live_channel.id)
                .expect("record recent live failed");
            record_recent_play(&context.db_path, movie_channel.id)
                .expect("record recent movie failed");
            record_recent_play(&context.db_path, series_channel.id)
                .expect("record recent series failed");
        }

        let connection = open_connection(&context.db_path).expect("failed to open db connection");
        let live_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM recents r INNER JOIN channels c ON c.id = r.channel_id WHERE c.media_kind = 'live'",
                [],
                |row| row.get(0),
            )
            .expect("failed to count live recents");
        let movie_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM recents r INNER JOIN channels c ON c.id = r.channel_id WHERE c.media_kind = 'movie'",
                [],
                |row| row.get(0),
            )
            .expect("failed to count movie recents");
        let series_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM recents r INNER JOIN channels c ON c.id = r.channel_id WHERE c.media_kind = 'series'",
                [],
                |row| row.get(0),
            )
            .expect("failed to count series recents");
        assert_eq!(live_count, 20);
        assert_eq!(movie_count, 20);
        assert_eq!(series_count, 20);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn delete_source_cascades_channels_favorites_and_recents() {
        let root = make_temp_root();
        let context = ensure_foundation_dirs(&root).expect("failed to create foundation dirs");
        init_storage(&context.db_path).expect("failed to initialize storage");
        let source_id = make_source_with_channels(&context.db_path);

        let channels =
            list_channels_for_source(&context.db_path, source_id, None, None, None, false)
                .expect("failed to list channels");
        assert_eq!(channels.len(), 3);

        set_channel_favorite(&context.db_path, channels[0].id, true).expect("favorite set failed");
        record_recent_play(&context.db_path, channels[0].id).expect("record recent failed");

        delete_source(&context.db_path, source_id).expect("delete source failed");

        let remaining_sources = list_sources(&context.db_path).expect("failed to list sources");
        assert!(remaining_sources.is_empty());

        let remaining_channels =
            list_channels_for_source(&context.db_path, source_id, None, None, None, false)
                .expect("failed to list channels after delete");
        assert!(remaining_channels.is_empty());

        let recent = list_recent_channels(&context.db_path, 10).expect("failed to list recents");
        assert!(recent.is_empty());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn list_groups_respects_media_kind_filter() {
        let root = make_temp_root();
        let context = ensure_foundation_dirs(&root).expect("failed to create foundation dirs");
        init_storage(&context.db_path).expect("failed to initialize storage");
        let source_id = make_source_with_channels(&context.db_path);

        let all = list_groups_for_source(&context.db_path, source_id, None)
            .expect("failed to list groups");
        assert_eq!(all.len(), 3);

        let movies = list_groups_for_source(&context.db_path, source_id, Some("movie"))
            .expect("failed to list movie groups");
        assert_eq!(movies.len(), 1);
        assert_eq!(movies[0].name, "Cinema");
        assert_eq!(movies[0].channel_count, 1);

        let unknown_kind =
            list_groups_for_source(&context.db_path, source_id, Some("unknown-kind"))
                .expect("failed to list unknown-kind groups");
        assert_eq!(unknown_kind.len(), 1);
        assert_eq!(unknown_kind[0].name, "News");
        assert_eq!(unknown_kind[0].channel_count, 1);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn load_phase1_settings_rejects_invalid_persisted_values() {
        let root = make_temp_root();
        let context = ensure_foundation_dirs(&root).expect("failed to create foundation dirs");
        init_storage(&context.db_path).expect("failed to initialize storage");

        set_setting(&context.db_path, "startup.behavior", "invalid-mode")
            .expect("failed to store invalid startup behavior");
        let err =
            load_phase1_settings(&context.db_path).expect_err("should reject invalid setting");
        assert!(err.contains("startup_behavior"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn writes_wait_for_another_connections_transaction() {
        let root = make_temp_root();
        let context = ensure_foundation_dirs(&root).expect("failed to create foundation dirs");
        init_storage(&context.db_path).expect("failed to initialize storage");

        // A background import or guide save holding the write lock...
        let mut holder = open_connection(&context.db_path).expect("open failed");
        let tx = holder.transaction().expect("transaction failed");
        tx.execute(
            "INSERT INTO settings(key, value, updated_at) VALUES ('busy', '1', 0)",
            [],
        )
        .expect("insert failed");

        let db_path = context.db_path.clone();
        let writer = std::thread::spawn(move || set_setting(&db_path, "debug_mode", "true"));
        std::thread::sleep(std::time::Duration::from_millis(300));
        tx.commit().expect("commit failed");

        // ...makes a concurrent write wait, not fail with "database is locked".
        writer
            .join()
            .expect("writer panicked")
            .expect("write should wait for the lock");
        assert_eq!(
            get_setting(&context.db_path, "debug_mode")
                .expect("read failed")
                .as_deref(),
            Some("true")
        );

        drop(holder);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn redact_credentials_masks_query_and_userinfo_secrets() {
        assert_eq!(
            redact_credentials(
                "error sending request for url (http://h/xmltv.php?username=al+ice&Password=p%26ss): timed out"
            ),
            "error sending request for url (http://h/xmltv.php?username=***&Password=***): timed out"
        );
        assert_eq!(
            redact_credentials("failed: https://bob:hunter2@host:8080/get.php then http://ok/x"),
            "failed: https://***@host:8080/get.php then http://ok/x"
        );
        assert_eq!(redact_credentials("nothing secret"), "nothing secret");
    }

    #[test]
    fn connections_are_reused_and_never_mid_transaction() {
        let root = make_temp_root();
        let context = ensure_foundation_dirs(&root).expect("failed to create foundation dirs");
        init_storage(&context.db_path).expect("failed to initialize storage");

        // TEMP tables live only in the connection that made them.
        let has_marker = |connection: &Connection, name: &str| -> bool {
            connection
                .query_row(
                    "SELECT COUNT(*) FROM temp.sqlite_master WHERE name = ?1",
                    params![name],
                    |row| row.get::<_, i64>(0),
                )
                .expect("marker lookup")
                == 1
        };

        let first = open_connection(&context.db_path).expect("open");
        first
            .execute_batch("CREATE TEMP TABLE reused_marker(x)")
            .expect("marker");
        drop(first);
        let again = open_connection(&context.db_path).expect("open");
        assert!(
            has_marker(&again, "reused_marker"),
            "an idle connection is reused"
        );

        // Pooled connections keep their per-connection settings.
        let foreign_keys: i64 = again
            .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
            .expect("pragma");
        assert_eq!(foreign_keys, 1);

        again
            .execute_batch("CREATE TEMP TABLE busy_marker(x); BEGIN;")
            .expect("begin");
        drop(again);
        let next = open_connection(&context.db_path).expect("open");
        assert!(
            !has_marker(&next, "busy_marker"),
            "a connection left in a transaction is not reused"
        );
        assert!(next.is_autocommit());

        drop(next);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn channel_records_sent_to_the_ui_leave_out_backend_only_fields() {
        let record = ChannelRecord {
            id: 1,
            source_id: 2,
            name: "News".to_string(),
            group_name: "TV".to_string(),
            logo: None,
            tvg_id: Some("news.uk".to_string()),
            stream_url: "http://x/1.ts".to_string(),
            media_kind: "live".to_string(),
            is_favorite: false,
        };
        let json = serde_json::to_value(&record).expect("serialize");
        assert!(json.get("tvg_id").is_none());
        assert_eq!(json["stream_url"], "http://x/1.ts");
    }

    #[test]
    fn source_registry_rejects_unsupported_source_type() {
        let registry = SourceRegistry::with_defaults();
        let err = registry
            .validate("plex", &json!({}))
            .expect_err("unsupported source type should fail");
        assert!(err.contains("unsupported source type"));
    }
}
