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
    let connection = Connection::open(db_path).map_err(|e| format!("db open failed: {e}"))?;
    connection
        .execute_batch(
            r#"
            PRAGMA journal_mode = WAL;
            PRAGMA foreign_keys = ON;

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
            "#,
        )
        .map_err(|e| format!("db migration failed: {e}"))?;

    Ok(())
}

pub fn set_setting(db_path: &Path, key: &str, value: &str) -> Result<(), String> {
    let ts = unix_ts();
    let connection = Connection::open(db_path).map_err(|e| format!("db open failed: {e}"))?;
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
    let connection = Connection::open(db_path).map_err(|e| format!("db open failed: {e}"))?;
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

pub fn create_source(
    db_path: &Path,
    source_type: &str,
    name: &str,
    config: &Value,
) -> Result<i64, String> {
    let connection = Connection::open(db_path).map_err(|e| format!("db open failed: {e}"))?;
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

pub fn list_sources(db_path: &Path) -> Result<Vec<SourceRecord>, String> {
    let connection = Connection::open(db_path).map_err(|e| format!("db open failed: {e}"))?;
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
        let config_json: String = row
            .get(3)
            .map_err(|e| format!("decode config failed: {e}"))?;
        let config: Value = serde_json::from_str(&config_json)
            .map_err(|e| format!("parse stored config failed: {e}"))?;
        records.push(SourceRecord {
            id: row.get(0).map_err(|e| format!("decode id failed: {e}"))?,
            source_type: row
                .get(1)
                .map_err(|e| format!("decode source_type failed: {e}"))?,
            name: row.get(2).map_err(|e| format!("decode name failed: {e}"))?,
            config,
            created_at: row
                .get(4)
                .map_err(|e| format!("decode created_at failed: {e}"))?,
        });
    }

    Ok(records)
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
        let server_url = config
            .get("server_url")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let username = config
            .get("username")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if server_url.trim().is_empty() {
            return Err("xtream config requires `server_url`".to_string());
        }
        if username.trim().is_empty() {
            return Err("xtream config requires `username`".to_string());
        }
        Ok(())
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

        let xtream_bad = registry.validate("xtream", &json!({ "server_url": "https://x.test" }));
        assert!(xtream_bad.is_err());

        let xtream_ok = registry.validate(
            "xtream",
            &json!({ "server_url": "https://x.test", "username": "user" }),
        );
        assert!(xtream_ok.is_ok());
    }
}
