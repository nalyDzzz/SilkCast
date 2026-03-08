use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
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
}

impl SharedState {
    pub fn new(context: AppContext, debug_mode: bool) -> Self {
        Self {
            context,
            debug_mode: AtomicBool::new(debug_mode),
            playback: Mutex::new(PlaybackEngine::new()),
            source_registry: SourceRegistry::with_defaults(),
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
    pub tvg_id: Option<String>,
    pub tvg_name: Option<String>,
    pub stream_url: String,
    pub media_kind: String,
    pub is_favorite: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RecentChannelRecord {
    pub channel: ChannelRecord,
    pub played_at: i64,
}

#[derive(Debug, Clone)]
pub struct StoredLiveEpgEntryRecord {
    pub title: String,
    pub description: Option<String>,
    pub start: Option<String>,
    pub end: Option<String>,
    pub start_timestamp: Option<i64>,
    pub end_timestamp: Option<i64>,
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
        db_path: db_dir.join("opentv.db"),
        log_path: logs_dir.join("opentv.log"),
        crash_dir,
    })
}

pub fn init_storage(db_path: &Path) -> Result<(), String> {
    let connection = open_connection(db_path)?;
    connection
        .execute_batch(
            r#"
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

            CREATE TABLE IF NOT EXISTS live_epg_entries (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              channel_id INTEGER NOT NULL,
              title TEXT NOT NULL,
              description TEXT,
              start_at TEXT,
              end_at TEXT,
              start_timestamp INTEGER,
              end_timestamp INTEGER,
              fetched_at INTEGER NOT NULL,
              FOREIGN KEY(channel_id) REFERENCES channels(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_live_epg_entries_channel
              ON live_epg_entries(channel_id);
            CREATE INDEX IF NOT EXISTS idx_live_epg_entries_channel_start
              ON live_epg_entries(channel_id, start_timestamp);
            "#,
        )
        .map_err(|e| format!("db migration failed: {e}"))?;

    // Backfill support for databases created before `media_kind` existed.
    let _ = connection.execute(
        "ALTER TABLE channels ADD COLUMN media_kind TEXT NOT NULL DEFAULT 'live'",
        [],
    );

    Ok(())
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

pub fn delete_source(db_path: &Path, source_id: i64) -> Result<(), String> {
    let connection = open_connection(db_path)?;
    connection
        .execute("DELETE FROM sources WHERE id = ?1", params![source_id])
        .map_err(|e| format!("delete source failed: {e}"))?;
    Ok(())
}

pub fn list_sources(db_path: &Path) -> Result<Vec<SourceRecord>, String> {
    let connection = open_connection(db_path)?;
    let mut statement = connection
        .prepare(
            "SELECT id, source_type, name, config_json, created_at FROM sources ORDER BY created_at DESC, id DESC",
        )
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
        .prepare(
            "SELECT id, source_type, name, config_json, created_at FROM sources WHERE id = ?1 LIMIT 1",
        )
        .map_err(|e| format!("prepare failed: {e}"))?;

    let mut rows = statement
        .query(params![source_id])
        .map_err(|e| format!("query failed: {e}"))?;

    match rows.next().map_err(|e| format!("read row failed: {e}"))? {
        Some(row) => decode_source_record(&row).map(Some),
        None => Ok(None),
    }
}

pub fn replace_channels_for_source(
    db_path: &Path,
    source_id: i64,
    channels: &[ChannelInsertRecord],
) -> Result<usize, String> {
    let mut connection = open_connection(db_path)?;
    let tx = connection
        .transaction()
        .map_err(|e| format!("transaction start failed: {e}"))?;

    tx.execute(
        "DELETE FROM channels WHERE source_id = ?1",
        params![source_id],
    )
    .map_err(|e| format!("delete existing channels failed: {e}"))?;

    let mut inserted = 0usize;
    let mut statement = tx
        .prepare(
            r#"
            INSERT INTO channels(
              source_id,
              name,
              group_name,
              logo,
              tvg_id,
              tvg_name,
              stream_url,
              media_kind,
              created_at,
              updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
            "#,
        )
        .map_err(|e| format!("prepare insert failed: {e}"))?;

    let ts = unix_ts();
    for channel in channels {
        let group_name = channel
            .group_name
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("Ungrouped");

        statement
            .execute(params![
                source_id,
                channel.name,
                group_name,
                channel.logo,
                channel.tvg_id,
                channel.tvg_name,
                channel.stream_url,
                normalize_media_kind(&channel.media_kind),
                ts,
                ts,
            ])
            .map_err(|e| format!("insert channel failed: {e}"))?;
        inserted += 1;
    }

    drop(statement);

    tx.execute(
        "DELETE FROM recents WHERE channel_id NOT IN (SELECT id FROM channels)",
        [],
    )
    .map_err(|e| format!("cleanup recents failed: {e}"))?;
    tx.execute(
        "DELETE FROM favorites WHERE channel_id NOT IN (SELECT id FROM channels)",
        [],
    )
    .map_err(|e| format!("cleanup favorites failed: {e}"))?;

    tx.commit()
        .map_err(|e| format!("transaction commit failed: {e}"))?;

    Ok(inserted)
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
    connection
        .execute(
            "INSERT INTO recents(channel_id, played_at) VALUES (?1, ?2)",
            params![channel_id, unix_ts()],
        )
        .map_err(|e| format!("insert recent failed: {e}"))?;

    connection
        .execute(
            "DELETE FROM recents WHERE id NOT IN (SELECT id FROM recents ORDER BY played_at DESC LIMIT 1000)",
            [],
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

pub fn replace_live_epg_for_channel(
    db_path: &Path,
    channel_id: i64,
    entries: &[StoredLiveEpgEntryRecord],
) -> Result<(), String> {
    let mut connection = open_connection(db_path)?;
    let tx = connection
        .transaction()
        .map_err(|e| format!("transaction start failed: {e}"))?;

    tx.execute(
        "DELETE FROM live_epg_entries WHERE channel_id = ?1",
        params![channel_id],
    )
    .map_err(|e| format!("delete live epg entries failed: {e}"))?;

    if !entries.is_empty() {
        let fetched_at = unix_ts();
        let mut statement = tx
            .prepare(
                r#"
                INSERT INTO live_epg_entries(
                  channel_id,
                  title,
                  description,
                  start_at,
                  end_at,
                  start_timestamp,
                  end_timestamp,
                  fetched_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                "#,
            )
            .map_err(|e| format!("prepare insert live epg failed: {e}"))?;

        for entry in entries {
            statement
                .execute(params![
                    channel_id,
                    entry.title,
                    entry.description,
                    entry.start,
                    entry.end,
                    entry.start_timestamp,
                    entry.end_timestamp,
                    fetched_at,
                ])
                .map_err(|e| format!("insert live epg entry failed: {e}"))?;
        }

        drop(statement);
    }

    tx.commit()
        .map_err(|e| format!("transaction commit failed: {e}"))?;

    Ok(())
}

pub fn list_live_epg_for_channel(
    db_path: &Path,
    channel_id: i64,
    limit: usize,
) -> Result<Vec<StoredLiveEpgEntryRecord>, String> {
    let connection = open_connection(db_path)?;
    let mut statement = connection
        .prepare(
            r#"
            SELECT
              title,
              description,
              start_at,
              end_at,
              start_timestamp,
              end_timestamp
            FROM live_epg_entries
            WHERE channel_id = ?1
            ORDER BY
              CASE WHEN start_timestamp IS NULL THEN 1 ELSE 0 END,
              start_timestamp ASC,
              id ASC
            LIMIT ?2
            "#,
        )
        .map_err(|e| format!("prepare failed: {e}"))?;

    let mut rows = statement
        .query(params![channel_id, limit as i64])
        .map_err(|e| format!("query failed: {e}"))?;

    let mut entries = Vec::new();
    while let Some(row) = rows.next().map_err(|e| format!("read row failed: {e}"))? {
        entries.push(StoredLiveEpgEntryRecord {
            title: row
                .get(0)
                .map_err(|e| format!("decode title failed: {e}"))?,
            description: row
                .get(1)
                .map_err(|e| format!("decode description failed: {e}"))?,
            start: row
                .get(2)
                .map_err(|e| format!("decode start_at failed: {e}"))?,
            end: row
                .get(3)
                .map_err(|e| format!("decode end_at failed: {e}"))?,
            start_timestamp: row
                .get(4)
                .map_err(|e| format!("decode start_timestamp failed: {e}"))?,
            end_timestamp: row
                .get(5)
                .map_err(|e| format!("decode end_timestamp failed: {e}"))?,
        });
    }

    Ok(entries)
}

pub fn append_log(log_path: &Path, level: &str, message: &str) -> Result<(), String> {
    let line = format!("[{}] [{}] {}\n", unix_ts(), level, message);
    append_line(log_path, &line)
}

pub fn init_log_file(log_path: &Path) -> Result<(), String> {
    if !log_path.exists() {
        File::create(log_path).map_err(|e| format!("log file create failed: {e}"))?;
    }
    append_log(log_path, "INFO", "OpenTV foundation logger initialized")?;
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

fn open_connection(db_path: &Path) -> Result<Connection, String> {
    let connection = Connection::open(db_path).map_err(|e| format!("db open failed: {e}"))?;
    connection
        .execute_batch(
            r#"
            PRAGMA journal_mode = WAL;
            PRAGMA foreign_keys = ON;
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
    Ok(SourceRecord {
        id: row.get(0).map_err(|e| format!("decode id failed: {e}"))?,
        source_type: row
            .get(1)
            .map_err(|e| format!("decode source_type failed: {e}"))?,
        name: row.get(2).map_err(|e| format!("decode name failed: {e}"))?,
        config,
        created_at: row
            .get(4)
            .map_err(|e| format!("decode created_at failed: {e}"))?,
    })
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
        tvg_name: row
            .get(6)
            .map_err(|e| format!("decode tvg_name failed: {e}"))?,
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
        let dir = std::env::temp_dir().join(format!("opentv-foundation-test-{ts}"));
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
    fn live_epg_roundtrip_replaces_per_channel_entries() {
        let root = make_temp_root();
        let context = ensure_foundation_dirs(&root).expect("failed to create foundation dirs");
        init_storage(&context.db_path).expect("failed to initialize storage");
        let source_id = make_source_with_channels(&context.db_path);
        let channels =
            list_channels_for_source(&context.db_path, source_id, Some("live"), None, None, false)
                .expect("failed to list channels");
        let live_channel = channels
            .into_iter()
            .next()
            .expect("expected at least one live channel");

        replace_live_epg_for_channel(
            &context.db_path,
            live_channel.id,
            &[
                StoredLiveEpgEntryRecord {
                    title: "Morning News".to_string(),
                    description: Some("Headlines".to_string()),
                    start: Some("2026-03-07 06:00:00".to_string()),
                    end: Some("2026-03-07 07:00:00".to_string()),
                    start_timestamp: Some(1700000000),
                    end_timestamp: Some(1700003600),
                },
                StoredLiveEpgEntryRecord {
                    title: "Noon Update".to_string(),
                    description: None,
                    start: Some("2026-03-07 07:00:00".to_string()),
                    end: Some("2026-03-07 08:00:00".to_string()),
                    start_timestamp: Some(1700003600),
                    end_timestamp: Some(1700007200),
                },
            ],
        )
        .expect("failed to store initial live epg entries");

        let first_read = list_live_epg_for_channel(&context.db_path, live_channel.id, 10)
            .expect("failed to read live epg entries");
        assert_eq!(first_read.len(), 2);
        assert_eq!(first_read[0].title, "Morning News");

        replace_live_epg_for_channel(
            &context.db_path,
            live_channel.id,
            &[StoredLiveEpgEntryRecord {
                title: "Evening Show".to_string(),
                description: Some("Prime time".to_string()),
                start: Some("2026-03-07 20:00:00".to_string()),
                end: Some("2026-03-07 21:00:00".to_string()),
                start_timestamp: Some(1700050000),
                end_timestamp: Some(1700053600),
            }],
        )
        .expect("failed to replace live epg entries");

        let second_read = list_live_epg_for_channel(&context.db_path, live_channel.id, 10)
            .expect("failed to read replaced live epg entries");
        assert_eq!(second_read.len(), 1);
        assert_eq!(second_read[0].title, "Evening Show");

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
    fn source_registry_rejects_unsupported_source_type() {
        let registry = SourceRegistry::with_defaults();
        let err = registry
            .validate("plex", &json!({}))
            .expect_err("unsupported source type should fail");
        assert!(err.contains("unsupported source type"));
    }
}
