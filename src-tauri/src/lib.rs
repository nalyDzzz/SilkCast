mod foundation;
mod m3u;
mod playback;
mod player_environment;
mod stream_proxy;
mod xtream;

use crate::foundation::update_source;
use foundation::{
    append_log, create_source, delete_source, emit_backend_event, ensure_foundation_dirs,
    get_channel_by_id, get_setting, get_source_by_id, init_log_file, init_storage,
    install_crash_hook, list_channels_for_source, list_fresh_live_epg_channel_ids,
    list_groups_for_source, list_live_epg_for_channel, list_live_epg_for_channels,
    list_recent_channels, list_sources, load_phase1_settings, record_recent_play,
    replace_channels_for_source, replace_live_epg_for_channel, replace_live_epg_for_channels,
    save_phase1_settings, set_channel_favorite, set_setting, ChannelRecord, GroupRecord,
    Phase1Settings, RecentChannelRecord, RuntimeInfo, SharedState, SourceRecord,
    StoredLiveEpgChannelEntries, StoredLiveEpgEntryRecord,
};
use m3u::{load_m3u_location, parse_m3u_channels};
use playback::{EmbeddedSurfaceBounds, PlaybackStatus};
use player_environment::{PlayerEnvironment, PlayerEnvironmentState};
use raw_window_handle::{HasWindowHandle, RawWindowHandle};
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{mpsc, Arc};
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};
use stream_proxy::StreamProxy;
use tauri::{Manager, State};
use xtream::{
    import_xtream_channels, list_xtream_live_epg, list_xtream_series_episodes, LiveEpgEntryRecord,
    SeriesEpisodeRecord, XtreamConfig, XtreamEpgSession,
};

#[derive(Debug, Serialize)]
struct SourceImportResult {
    source_id: i64,
    imported_channels: usize,
}

#[derive(Debug, Serialize)]
struct SourceEpgRefreshResult {
    source_id: i64,
    refreshed_channels: usize,
    channels_with_listings: usize,
    failed_channels: usize,
    skipped_channels: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum StartupResumeMode {
    None,
    ResumeWithMpv,
    ResumeWithWebDeferred,
}

const SOURCE_EPG_REFRESH_CONCURRENCY: usize = 8;
/// Programmes requested per channel from the provider. It costs one request
/// whatever the count, and covers the guide's few-hour timeline.
const EPG_FETCH_LIMIT: usize = 12;
const SOURCE_EPG_REFRESH_FRESH_SECONDS: i64 = 6 * 60 * 60;

fn current_unix_ts() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

/// Runs SQLite and network work on Tauri's blocking pool. Plain sync commands
/// run on the main thread, so a slow provider would freeze the window.
async fn run_blocking<T, F>(app: tauri::AppHandle, work: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(&tauri::AppHandle) -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(move || work(&app))
        .await
        .map_err(|err| format!("background task failed: {err}"))?
}

#[derive(Clone)]
struct SourceEpgRefreshJob {
    channel_id: i64,
    channel_name: String,
    stream_id: String,
}

struct SourceEpgRefreshFetchOutcome {
    channel_id: i64,
    channel_name: String,
    entries: Result<Vec<LiveEpgEntryRecord>, String>,
}
#[tauri::command]
fn get_runtime_info(state: State<SharedState>) -> RuntimeInfo {
    RuntimeInfo {
        debug_mode: state.debug_mode(),
        db_path: state.context.db_path.to_string_lossy().to_string(),
        log_path: state.context.log_path.to_string_lossy().to_string(),
        crash_dir: state.context.crash_dir.to_string_lossy().to_string(),
    }
}

#[tauri::command]
async fn set_debug_mode(enabled: bool, app: tauri::AppHandle) -> Result<(), String> {
    run_blocking(app, move |app| {
        let state = app.state::<SharedState>();
        set_setting(
            &state.context.db_path,
            "debug_mode",
            if enabled { "true" } else { "false" },
        )?;
        state.set_debug_mode(enabled);
        append_log(
            &state.context.log_path,
            "INFO",
            &format!("debug mode updated to {enabled}"),
        )
    })
    .await
}

#[tauri::command]
async fn list_registered_sources(app: tauri::AppHandle) -> Result<Vec<SourceRecord>, String> {
    run_blocking(app, |app| {
        list_sources(&app.state::<SharedState>().context.db_path)
    })
    .await
}

/// Announces that a source's catalog (and possibly its row in the source list) changed.
fn emit_catalog_changed(
    app: &tauri::AppHandle,
    source_id: i64,
    sources_changed: bool,
) -> Result<(), String> {
    if sources_changed {
        emit_backend_event(app, "sources_updated", json!({ "source_id": source_id }))?;
    }
    emit_backend_event(app, "groups_updated", json!({ "source_id": source_id }))?;
    emit_backend_event(app, "channels_updated", json!({ "source_id": source_id }))
}

#[tauri::command]
async fn add_m3u_source(
    name: String,
    location: String,
    app: tauri::AppHandle,
) -> Result<SourceImportResult, String> {
    run_blocking(app, move |app| {
        let state = app.state::<SharedState>();
        let result = create_and_import_m3u_source(&state, &name, &location)?;
        let source_id = result.source_id;
        emit_catalog_changed(app, source_id, true)?;
        append_log(
            &state.context.log_path,
            "INFO",
            &format!(
                "registered m3u source {source_id}:{name} with {} channels",
                result.imported_channels
            ),
        )?;
        Ok(result)
    })
    .await
}

#[tauri::command]
async fn add_xtream_source(
    name: String,
    server_url: String,
    username: String,
    password: String,
    app: tauri::AppHandle,
) -> Result<SourceImportResult, String> {
    run_blocking(app, move |app| {
        let state = app.state::<SharedState>();
        let result =
            create_and_import_xtream_source(&state, &name, &server_url, &username, &password)?;
        let source_id = result.source_id;
        emit_catalog_changed(app, source_id, true)?;
        append_log(
            &state.context.log_path,
            "INFO",
            &format!(
                "registered xtream source {source_id}:{name} with {} catalog items",
                result.imported_channels
            ),
        )?;
        Ok(result)
    })
    .await
}

#[tauri::command]
async fn update_registered_source(
    source_id: i64,
    name: String,
    config: Value,
    app: tauri::AppHandle,
) -> Result<SourceImportResult, String> {
    run_blocking(app, move |app| {
        let state = app.state::<SharedState>();
        let result = update_registered_source_core(&state, source_id, &name, &config)?;
        emit_catalog_changed(app, source_id, true)?;
        append_log(
            &state.context.log_path,
            "INFO",
            &format!(
                "updated source {source_id}:{name} with {} catalog items",
                result.imported_channels
            ),
        )?;
        Ok(result)
    })
    .await
}

#[tauri::command]
async fn refresh_m3u_source(
    source_id: i64,
    app: tauri::AppHandle,
) -> Result<SourceImportResult, String> {
    run_blocking(app, move |app| {
        let state = app.state::<SharedState>();
        let result = refresh_m3u_source_core(&state, source_id)?;
        emit_catalog_changed(app, source_id, false)?;
        append_log(
            &state.context.log_path,
            "INFO",
            &format!(
                "refreshed source {source_id} with {} channels",
                result.imported_channels
            ),
        )?;
        Ok(result)
    })
    .await
}

#[tauri::command]
async fn refresh_registered_source(
    source_id: i64,
    app: tauri::AppHandle,
) -> Result<SourceImportResult, String> {
    run_blocking(app, move |app| {
        let state = app.state::<SharedState>();
        let result = refresh_registered_source_core(&state, source_id)?;
        emit_catalog_changed(app, source_id, false)?;
        append_log(
            &state.context.log_path,
            "INFO",
            &format!(
                "refreshed source {source_id} with {} catalog items",
                result.imported_channels
            ),
        )?;
        Ok(result)
    })
    .await
}

#[tauri::command]
async fn refresh_source_epg(
    source_id: i64,
    app: tauri::AppHandle,
) -> Result<SourceEpgRefreshResult, String> {
    run_blocking(app, move |app| {
        let state = app.state::<SharedState>();
        validate_source_epg_refresh_request(&state.context.db_path, source_id)?;

        let db_path = state.context.db_path.clone();
        let log_path = state.context.log_path.clone();
        let app_handle = app.clone();

        append_log(
            &log_path,
            "INFO",
            &format!("queued source epg refresh for source {source_id}"),
        )?;

        thread::spawn(move || {
            run_source_epg_refresh_job(app_handle, db_path, log_path, source_id);
        });

        Ok(SourceEpgRefreshResult {
            source_id,
            refreshed_channels: 0,
            channels_with_listings: 0,
            failed_channels: 0,
            skipped_channels: 0,
        })
    })
    .await
}

#[tauri::command]
async fn delete_registered_source(source_id: i64, app: tauri::AppHandle) -> Result<(), String> {
    run_blocking(app, move |app| {
        let state = app.state::<SharedState>();
        let source = get_source_by_id(&state.context.db_path, source_id)?
            .ok_or_else(|| format!("source {source_id} not found"))?;
        delete_source(&state.context.db_path, source_id)?;
        emit_catalog_changed(app, source_id, true)?;
        append_log(
            &state.context.log_path,
            "INFO",
            &format!("deleted source {source_id}:{}", source.name),
        )
    })
    .await
}

#[tauri::command]
async fn list_source_groups(
    source_id: i64,
    media_kind: Option<String>,
    app: tauri::AppHandle,
) -> Result<Vec<GroupRecord>, String> {
    run_blocking(app, move |app| {
        list_groups_for_source(
            &app.state::<SharedState>().context.db_path,
            source_id,
            media_kind.as_deref(),
        )
    })
    .await
}

#[tauri::command]
async fn list_source_channels(
    source_id: i64,
    media_kind: Option<String>,
    group_name: Option<String>,
    query: Option<String>,
    favorites_only: bool,
    app: tauri::AppHandle,
) -> Result<Vec<ChannelRecord>, String> {
    run_blocking(app, move |app| {
        list_channels_for_source(
            &app.state::<SharedState>().context.db_path,
            source_id,
            media_kind.as_deref(),
            group_name.as_deref(),
            query.as_deref(),
            favorites_only,
        )
    })
    .await
}

#[tauri::command]
async fn list_series_episodes(
    channel_id: i64,
    app: tauri::AppHandle,
) -> Result<Vec<SeriesEpisodeRecord>, String> {
    run_blocking(app, move |app| {
        list_series_episodes_core(&app.state::<SharedState>(), channel_id)
    })
    .await
}

fn list_series_episodes_core(
    state: &SharedState,
    channel_id: i64,
) -> Result<Vec<SeriesEpisodeRecord>, String> {
    let channel = get_channel_by_id(&state.context.db_path, channel_id)?
        .ok_or_else(|| format!("channel {channel_id} not found"))?;

    if channel.media_kind != "series" {
        return Err(format!("channel {channel_id} is not a series catalog item"));
    }

    let source = get_source_by_id(&state.context.db_path, channel.source_id)?
        .ok_or_else(|| format!("source {} not found", channel.source_id))?;

    if source.source_type != "xtream" {
        return Err("Episode lookup is currently supported only for Xtream sources.".to_string());
    }

    let series_id = channel
        .tvg_id
        .clone()
        .or_else(|| extract_series_id_from_stream_url(&channel.stream_url))
        .ok_or_else(|| {
            format!(
                "series catalog item {} does not include a resolvable series ID",
                channel.id
            )
        })?;

    let xtream_config = XtreamConfig::from_value(&source.config)?;
    list_xtream_series_episodes(&xtream_config, &series_id)
}

#[tauri::command]
async fn list_channel_epg(
    channel_id: i64,
    limit: Option<u32>,
    app: tauri::AppHandle,
) -> Result<Vec<LiveEpgEntryRecord>, String> {
    run_blocking(app, move |app| {
        list_channel_epg_core(&app.state::<SharedState>(), channel_id, limit)
    })
    .await
}

#[derive(Debug, Serialize)]
struct ChannelEpgRecord {
    channel_id: i64,
    entries: Vec<LiveEpgEntryRecord>,
}

/// Stored programmes overlapping `[from, to)` (unix seconds) for the given
/// channels, in one call. Used for every on-screen guide row at once.
#[tauri::command]
async fn list_channels_epg(
    channel_ids: Vec<i64>,
    from: i64,
    to: i64,
    app: tauri::AppHandle,
) -> Result<Vec<ChannelEpgRecord>, String> {
    run_blocking(app, move |app| {
        let stored = list_live_epg_for_channels(
            &app.state::<SharedState>().context.db_path,
            &channel_ids,
            from,
            to,
        )?;
        Ok(stored
            .into_iter()
            .map(|channel| ChannelEpgRecord {
                channel_id: channel.channel_id,
                entries: channel
                    .entries
                    .into_iter()
                    .map(stored_live_epg_to_api_record)
                    .collect(),
            })
            .collect())
    })
    .await
}

fn list_channel_epg_core(
    state: &SharedState,
    channel_id: i64,
    limit: Option<u32>,
) -> Result<Vec<LiveEpgEntryRecord>, String> {
    let channel = get_channel_by_id(&state.context.db_path, channel_id)?
        .ok_or_else(|| format!("channel {channel_id} not found"))?;

    if channel.media_kind != "live" {
        return Ok(Vec::new());
    }

    let source = get_source_by_id(&state.context.db_path, channel.source_id)?
        .ok_or_else(|| format!("source {} not found", channel.source_id))?;

    if source.source_type != "xtream" {
        return Ok(Vec::new());
    }

    let normalized_limit = normalize_epg_limit(limit);
    let stored_entries = list_live_epg_for_channel(
        &state.context.db_path,
        channel.id,
        normalized_limit,
        current_unix_ts(),
    )?;

    Ok(stored_entries
        .into_iter()
        .map(stored_live_epg_to_api_record)
        .collect())
}

#[tauri::command]
async fn refresh_channel_epg(
    channel_id: i64,
    limit: Option<u32>,
    app: tauri::AppHandle,
) -> Result<Vec<LiveEpgEntryRecord>, String> {
    run_blocking(app, move |app| {
        refresh_channel_epg_core(&app.state::<SharedState>(), channel_id, limit)
    })
    .await
}

fn refresh_channel_epg_core(
    state: &SharedState,
    channel_id: i64,
    limit: Option<u32>,
) -> Result<Vec<LiveEpgEntryRecord>, String> {
    let channel = get_channel_by_id(&state.context.db_path, channel_id)?
        .ok_or_else(|| format!("channel {channel_id} not found"))?;

    if channel.media_kind != "live" {
        return Ok(Vec::new());
    }

    let source = get_source_by_id(&state.context.db_path, channel.source_id)?
        .ok_or_else(|| format!("source {} not found", channel.source_id))?;

    if source.source_type != "xtream" {
        return Ok(Vec::new());
    }

    let Some(stream_id) = extract_live_stream_id(&channel) else {
        replace_live_epg_for_channel(&state.context.db_path, channel.id, &[])?;
        return Ok(Vec::new());
    };

    // Store as much of the schedule as the provider gives in one request, so a
    // caller that shows only now/next doesn't shrink the guide's timeline.
    let xtream_config = XtreamConfig::from_value(&source.config)?;
    let entries = list_xtream_live_epg(&xtream_config, &stream_id, EPG_FETCH_LIMIT)?;

    let stored_entries = entries
        .iter()
        .map(api_live_epg_to_stored_record)
        .collect::<Vec<_>>();
    replace_live_epg_for_channel(&state.context.db_path, channel.id, &stored_entries)?;

    let now = current_unix_ts();
    Ok(entries
        .into_iter()
        .filter(|entry| entry.end_timestamp.is_some_and(|end| end > now))
        .take(normalize_epg_limit(limit))
        .collect())
}

fn api_live_epg_to_stored_record(entry: &LiveEpgEntryRecord) -> StoredLiveEpgEntryRecord {
    StoredLiveEpgEntryRecord {
        title: entry.title.clone(),
        description: entry.description.clone(),
        start: entry.start.clone(),
        end: entry.end.clone(),
        start_timestamp: entry.start_timestamp,
        end_timestamp: entry.end_timestamp,
    }
}

fn stored_live_epg_to_api_record(entry: StoredLiveEpgEntryRecord) -> LiveEpgEntryRecord {
    LiveEpgEntryRecord {
        title: entry.title,
        description: entry.description,
        start: entry.start,
        end: entry.end,
        start_timestamp: entry.start_timestamp,
        end_timestamp: entry.end_timestamp,
    }
}

#[tauri::command]
async fn set_channel_favorite_state(
    channel_id: i64,
    favorite: bool,
    app: tauri::AppHandle,
) -> Result<(), String> {
    run_blocking(app, move |app| {
        let state = app.state::<SharedState>();
        let channel = get_channel_by_id(&state.context.db_path, channel_id)?
            .ok_or_else(|| format!("channel {channel_id} not found"))?;
        set_channel_favorite(&state.context.db_path, channel_id, favorite)?;
        emit_backend_event(
            app,
            "channels_updated",
            json!({ "source_id": channel.source_id }),
        )?;
        append_log(
            &state.context.log_path,
            "INFO",
            &format!("favorite={} for channel {}", favorite, channel_id),
        )
    })
    .await
}

#[tauri::command]
async fn list_recently_played(
    limit: Option<u32>,
    app: tauri::AppHandle,
) -> Result<Vec<RecentChannelRecord>, String> {
    run_blocking(app, move |app| {
        let normalized_limit = normalize_recent_limit(limit);
        list_recent_channels(
            &app.state::<SharedState>().context.db_path,
            normalized_limit,
        )
    })
    .await
}

#[tauri::command]
fn play_channel(
    channel_id: i64,
    app: tauri::AppHandle,
    state: State<SharedState>,
) -> Result<(), String> {
    let channel = get_channel_by_id(&state.context.db_path, channel_id)?
        .ok_or_else(|| format!("channel {channel_id} not found"))?;

    let mut playback = state
        .playback
        .lock()
        .map_err(|_| "playback state lock poisoned".to_string())?;
    playback.load_url(&channel.stream_url)?;

    record_recent_play(&state.context.db_path, channel_id)?;

    emit_backend_event(
        &app,
        "playback_state_changed",
        json!({ "state": playback.status() }),
    )?;
    emit_backend_event(&app, "recents_updated", json!({}))?;

    append_log(
        &state.context.log_path,
        "INFO",
        &format!("playing channel {} ({})", channel.name, channel_id),
    )
}

#[tauri::command]
async fn record_recent_channel_play(channel_id: i64, app: tauri::AppHandle) -> Result<(), String> {
    run_blocking(app, move |app| {
        let state = app.state::<SharedState>();
        let channel = get_channel_by_id(&state.context.db_path, channel_id)?
            .ok_or_else(|| format!("channel {channel_id} not found"))?;
        record_recent_play(&state.context.db_path, channel_id)?;
        emit_backend_event(app, "recents_updated", json!({}))?;
        append_log(
            &state.context.log_path,
            "INFO",
            &format!(
                "recorded recent channel play {} ({})",
                channel.name, channel_id
            ),
        )
    })
    .await
}

#[tauri::command]
async fn get_phase1_settings(app: tauri::AppHandle) -> Result<Phase1Settings, String> {
    run_blocking(app, |app| {
        load_phase1_settings(&app.state::<SharedState>().context.db_path)
    })
    .await
}

#[tauri::command]
async fn set_phase1_settings(
    settings: Phase1Settings,
    app: tauri::AppHandle,
) -> Result<(), String> {
    run_blocking(app, move |app| {
        let state = app.state::<SharedState>();
        save_phase1_settings(&state.context.db_path, &settings)?;

        let _ = append_log(
            &state.context.log_path,
            "INFO",
            "playback preferences updated (effective on next app launch)",
        );

        emit_backend_event(app, "settings_updated", json!({ "phase": 1 }))?;
        append_log(&state.context.log_path, "INFO", "phase1 settings saved")
    })
    .await
}

#[tauri::command]
fn emit_phase0_ping(app: tauri::AppHandle, state: State<SharedState>) -> Result<(), String> {
    emit_backend_event(
        &app,
        "phase0_ping",
        json!({
            "message": "Phase 0 event bus is online",
            "debug_mode": state.debug_mode()
        }),
    )?;
    append_log(
        &state.context.log_path,
        "DEBUG",
        "emitted phase0_ping event",
    )
}

#[tauri::command]
fn playback_state(state: State<SharedState>) -> Result<PlaybackStatus, String> {
    let playback = state
        .playback
        .lock()
        .map_err(|_| "playback state lock poisoned".to_string())?;
    Ok(playback.status())
}

#[tauri::command]
fn playback_attach_window(
    hwnd: u64,
    app: tauri::AppHandle,
    state: State<SharedState>,
) -> Result<(), String> {
    let mut playback = state
        .playback
        .lock()
        .map_err(|_| "playback state lock poisoned".to_string())?;
    playback.attach_window(hwnd)?;
    emit_backend_event(
        &app,
        "playback_state_changed",
        json!({ "state": playback.status() }),
    )?;
    append_log(
        &state.context.log_path,
        "INFO",
        &format!("playback hwnd attached: {hwnd}"),
    )
}

#[tauri::command]
fn playback_attach_current_window(
    app: tauri::AppHandle,
    state: State<SharedState>,
) -> Result<u64, String> {
    let window_id = resolve_main_window_id(&app)?;

    let mut playback = state
        .playback
        .lock()
        .map_err(|_| "playback state lock poisoned".to_string())?;
    playback.attach_window(window_id)?;
    emit_backend_event(
        &app,
        "playback_state_changed",
        json!({ "state": playback.status() }),
    )?;
    append_log(
        &state.context.log_path,
        "INFO",
        &format!("playback window auto-attached: {window_id}"),
    )?;
    Ok(window_id)
}

#[tauri::command]
fn playback_load_url(
    url: String,
    app: tauri::AppHandle,
    state: State<SharedState>,
) -> Result<(), String> {
    let mut playback = state
        .playback
        .lock()
        .map_err(|_| "playback state lock poisoned".to_string())?;
    playback.load_url(&url)?;
    emit_backend_event(
        &app,
        "playback_state_changed",
        json!({ "state": playback.status() }),
    )?;
    append_log(
        &state.context.log_path,
        "INFO",
        &format!("playback loading URL: {url}"),
    )
}

#[tauri::command]
fn get_player_environment(environment: State<PlayerEnvironmentState>) -> PlayerEnvironment {
    environment.snapshot()
}

#[tauri::command]
fn playback_open_external_window(
    url: String,
    title: Option<String>,
    start_seconds: Option<f64>,
    app: tauri::AppHandle,
    state: State<SharedState>,
) -> Result<(), String> {
    {
        let mut playback = state
            .playback
            .lock()
            .map_err(|_| "playback state lock poisoned".to_string())?;
        let _ = playback.stop();
        emit_backend_event(
            &app,
            "playback_state_changed",
            json!({ "state": playback.status() }),
        )?;
    }

    let hardware_decode = load_phase1_settings(&state.context.db_path)
        .map(|settings| settings.hardware_decode)
        .ok();
    let child = spawn_mpv_popout_process(
        &url,
        &MpvPopoutOptions {
            title: title.as_deref(),
            start_seconds,
            hardware_decode,
        },
    )?;
    monitor_external_mpv_process(
        child,
        app.clone(),
        url.clone(),
        state.context.log_path.clone(),
    );
    // Stream URLs embed provider credentials, so only the host is logged.
    let host = url::Url::parse(&url)
        .ok()
        .and_then(|parsed| parsed.host_str().map(str::to_string))
        .unwrap_or_else(|| "unknown host".to_string());
    append_log(
        &state.context.log_path,
        "INFO",
        &format!("spawned external mpv pop-out for {host}"),
    )
}

/// Optional extras for the MPV pop-out window.
#[derive(Debug, Default, Clone, Copy)]
struct MpvPopoutOptions<'a> {
    title: Option<&'a str>,
    start_seconds: Option<f64>,
    /// `None` leaves MPV's own hwdec configuration untouched.
    hardware_decode: Option<bool>,
}

fn spawn_mpv_popout_process(url: &str, options: &MpvPopoutOptions) -> Result<Child, String> {
    #[cfg(windows)]
    const MPV_CANDIDATES: &[&str] = &["mpv.exe", "mpv"];
    #[cfg(not(windows))]
    const MPV_CANDIDATES: &[&str] = &["mpv", "mpv.exe"];

    spawn_mpv_popout_process_with_candidates(url, options, MPV_CANDIDATES)
}

fn monitor_external_mpv_process(
    mut child: Child,
    app: tauri::AppHandle,
    url: String,
    log_path: PathBuf,
) {
    thread::spawn(move || {
        let wait_result = child.wait();

        let (exit_code, ok, wait_error) = match wait_result {
            Ok(status) => (status.code(), status.success(), None),
            Err(err) => (None, false, Some(err.to_string())),
        };

        let payload = json!({
            "url": url,
            "exit_code": exit_code,
            "ok": ok,
            "wait_error": wait_error,
        });

        let _ = emit_backend_event(&app, "external_playback_closed", payload.clone());
        let _ = append_log(
            &log_path,
            "INFO",
            &format!("external mpv pop-out closed: {}", payload),
        );
    });
}

#[tauri::command]
fn playback_pause(
    paused: bool,
    app: tauri::AppHandle,
    state: State<SharedState>,
) -> Result<(), String> {
    let mut playback = state
        .playback
        .lock()
        .map_err(|_| "playback state lock poisoned".to_string())?;
    playback.pause(paused)?;
    emit_backend_event(
        &app,
        "playback_state_changed",
        json!({ "state": playback.status() }),
    )?;
    append_log(
        &state.context.log_path,
        "INFO",
        &format!("playback pause toggled: {paused}"),
    )
}

#[tauri::command]
fn playback_stop(app: tauri::AppHandle, state: State<SharedState>) -> Result<(), String> {
    let mut playback = state
        .playback
        .lock()
        .map_err(|_| "playback state lock poisoned".to_string())?;
    playback.stop()?;
    emit_backend_event(
        &app,
        "playback_state_changed",
        json!({ "state": playback.status() }),
    )?;
    append_log(&state.context.log_path, "INFO", "playback stopped")
}

#[tauri::command]
fn playback_set_volume(
    volume: f64,
    app: tauri::AppHandle,
    state: State<SharedState>,
) -> Result<(), String> {
    let mut playback = state
        .playback
        .lock()
        .map_err(|_| "playback state lock poisoned".to_string())?;
    playback.set_volume(volume)?;
    emit_backend_event(
        &app,
        "playback_state_changed",
        json!({ "state": playback.status() }),
    )?;
    Ok(())
}

#[tauri::command]
fn playback_set_fullscreen(
    fullscreen: bool,
    app: tauri::AppHandle,
    state: State<SharedState>,
) -> Result<(), String> {
    let mut playback = state
        .playback
        .lock()
        .map_err(|_| "playback state lock poisoned".to_string())?;
    playback.set_fullscreen(fullscreen)?;
    emit_backend_event(
        &app,
        "playback_state_changed",
        json!({ "state": playback.status() }),
    )?;
    Ok(())
}

#[tauri::command]
fn playback_seek(
    seconds: i64,
    app: tauri::AppHandle,
    state: State<SharedState>,
) -> Result<(), String> {
    let mut playback = state
        .playback
        .lock()
        .map_err(|_| "playback state lock poisoned".to_string())?;
    playback.seek(seconds)?;
    emit_backend_event(
        &app,
        "playback_state_changed",
        json!({ "state": playback.status() }),
    )?;
    Ok(())
}

#[tauri::command]
fn playback_start_embedded_surface_mode(
    bounds: EmbeddedSurfaceBounds,
    app: tauri::AppHandle,
    state: State<SharedState>,
) -> Result<u64, String> {
    let main_window_id = resolve_main_window_id(&app)?;
    let mut playback = state
        .playback
        .lock()
        .map_err(|_| "playback state lock poisoned".to_string())?;
    let surface_hwnd = playback.start_embedded_surface_mode(main_window_id, bounds)?;
    emit_backend_event(
        &app,
        "playback_state_changed",
        json!({ "state": playback.status() }),
    )?;
    append_log(
        &state.context.log_path,
        "INFO",
        "playback render mode switched to embedded surface",
    )?;
    Ok(surface_hwnd)
}

#[tauri::command]
fn playback_update_embedded_surface_bounds(
    bounds: EmbeddedSurfaceBounds,
    app: tauri::AppHandle,
    state: State<SharedState>,
) -> Result<(), String> {
    let mut playback = state
        .playback
        .lock()
        .map_err(|_| "playback state lock poisoned".to_string())?;
    playback.update_embedded_surface_bounds(bounds)?;
    emit_backend_event(
        &app,
        "playback_state_changed",
        json!({ "state": playback.status() }),
    )
}

#[tauri::command]
fn playback_stop_embedded_surface_mode(
    app: tauri::AppHandle,
    state: State<SharedState>,
) -> Result<(), String> {
    let mut playback = state
        .playback
        .lock()
        .map_err(|_| "playback state lock poisoned".to_string())?;
    playback.stop_embedded_surface_mode()?;
    emit_backend_event(
        &app,
        "playback_state_changed",
        json!({ "state": playback.status() }),
    )?;
    append_log(
        &state.context.log_path,
        "INFO",
        "playback embedded surface mode stopped",
    )
}

fn import_m3u_source(state: &SharedState, source_id: i64, config: &Value) -> Result<usize, String> {
    let location = config
        .get("location")
        .and_then(Value::as_str)
        .ok_or_else(|| "m3u source config missing `location`".to_string())?;

    let content = load_m3u_location(location)?;
    let channels = parse_m3u_channels(&content);
    if channels.is_empty() {
        return Err(
            "Playlist parsed successfully but 0 channels were found. This usually means the provider returned an empty/unauthorized playlist or a non-standard format."
                .to_string(),
        );
    }
    let inserted = replace_channels_for_source(&state.context.db_path, source_id, &channels)?;

    Ok(inserted)
}

fn import_xtream_source(
    state: &SharedState,
    source_id: i64,
    config: &Value,
) -> Result<usize, String> {
    let xtream_config = XtreamConfig::from_value(config)?;
    let channels = import_xtream_channels(&xtream_config)?;
    replace_channels_for_source(&state.context.db_path, source_id, &channels)
}

fn import_source_catalog(
    state: &SharedState,
    source_type: &str,
    source_id: i64,
    config: &Value,
) -> Result<usize, String> {
    match source_type {
        "m3u" => import_m3u_source(state, source_id, config),
        "xtream" => import_xtream_source(state, source_id, config),
        _ => Err(format!("unsupported source type: {source_type}")),
    }
}

fn create_and_import_m3u_source(
    state: &SharedState,
    name: &str,
    location: &str,
) -> Result<SourceImportResult, String> {
    let config = json!({ "location": location });
    state.source_kind_supported("m3u", &config)?;

    let source_id = create_source(&state.context.db_path, "m3u", name, &config)?;
    let imported_channels = match import_source_catalog(state, "m3u", source_id, &config) {
        Ok(count) => count,
        Err(err) => {
            let _ = delete_source(&state.context.db_path, source_id);
            return Err(err);
        }
    };

    Ok(SourceImportResult {
        source_id,
        imported_channels,
    })
}

fn create_and_import_xtream_source(
    state: &SharedState,
    name: &str,
    server_url: &str,
    username: &str,
    password: &str,
) -> Result<SourceImportResult, String> {
    let xtream_config = XtreamConfig::from_value(&json!({
        "server_url": server_url,
        "username": username,
        "password": password
    }))?;
    let config = json!({
        "server_url": xtream_config.server_url,
        "username": xtream_config.username,
        "password": xtream_config.password
    });
    state.source_kind_supported("xtream", &config)?;

    let source_id = create_source(&state.context.db_path, "xtream", name, &config)?;
    let imported_channels = match import_source_catalog(state, "xtream", source_id, &config) {
        Ok(count) => count,
        Err(err) => {
            let _ = delete_source(&state.context.db_path, source_id);
            return Err(err);
        }
    };

    Ok(SourceImportResult {
        source_id,
        imported_channels,
    })
}

fn normalize_source_update_config(source_type: &str, config: &Value) -> Result<Value, String> {
    match source_type {
        "m3u" => {
            let location = config
                .get("location")
                .and_then(Value::as_str)
                .ok_or_else(|| "m3u source config missing `location`".to_string())?
                .trim()
                .to_string();
            if location.is_empty() {
                return Err("m3u source config missing `location`".to_string());
            }
            Ok(json!({ "location": location }))
        }
        "xtream" => {
            let xtream_config = XtreamConfig::from_value(config)?;
            Ok(json!({
                "server_url": xtream_config.server_url,
                "username": xtream_config.username,
                "password": xtream_config.password
            }))
        }
        _ => Err(format!("unsupported source type: {source_type}")),
    }
}

fn update_registered_source_core(
    state: &SharedState,
    source_id: i64,
    name: &str,
    config: &Value,
) -> Result<SourceImportResult, String> {
    let source = get_source_by_id(&state.context.db_path, source_id)?
        .ok_or_else(|| format!("source {source_id} not found"))?;
    let normalized_name = name.trim();
    if normalized_name.is_empty() {
        return Err("source name is required".to_string());
    }

    let normalized_config = normalize_source_update_config(&source.source_type, config)?;
    state.source_kind_supported(&source.source_type, &normalized_config)?;

    update_source(
        &state.context.db_path,
        source_id,
        normalized_name,
        &normalized_config,
    )?;

    let imported_channels =
        match import_source_catalog(state, &source.source_type, source_id, &normalized_config) {
            Ok(count) => count,
            Err(err) => {
                let _ = update_source(
                    &state.context.db_path,
                    source_id,
                    &source.name,
                    &source.config,
                );
                return Err(err);
            }
        };

    Ok(SourceImportResult {
        source_id,
        imported_channels,
    })
}

fn refresh_m3u_source_core(
    state: &SharedState,
    source_id: i64,
) -> Result<SourceImportResult, String> {
    let source = get_source_by_id(&state.context.db_path, source_id)?
        .ok_or_else(|| format!("source {source_id} not found"))?;

    if source.source_type != "m3u" {
        return Err("refresh is currently supported only for m3u sources".to_string());
    }

    let imported_channels = import_source_catalog(state, "m3u", source_id, &source.config)?;
    Ok(SourceImportResult {
        source_id,
        imported_channels,
    })
}

fn refresh_registered_source_core(
    state: &SharedState,
    source_id: i64,
) -> Result<SourceImportResult, String> {
    let source = get_source_by_id(&state.context.db_path, source_id)?
        .ok_or_else(|| format!("source {source_id} not found"))?;

    let imported_channels =
        import_source_catalog(state, &source.source_type, source_id, &source.config)?;
    Ok(SourceImportResult {
        source_id,
        imported_channels,
    })
}

fn validate_source_epg_refresh_request(db_path: &Path, source_id: i64) -> Result<(), String> {
    let source = get_source_by_id(db_path, source_id)?
        .ok_or_else(|| format!("source {source_id} not found"))?;

    if source.source_type != "xtream" {
        return Err("EPG refresh is currently supported only for Xtream sources.".to_string());
    }

    XtreamConfig::from_value(&source.config)?;
    Ok(())
}

fn run_source_epg_refresh_job<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    db_path: PathBuf,
    log_path: PathBuf,
    source_id: i64,
) {
    match refresh_source_epg_core_with_paths(&db_path, &log_path, source_id) {
        Ok(result) => {
            let _ = emit_backend_event(
                &app,
                "epg_updated",
                json!({
                    "source_id": result.source_id,
                    "refreshed_channels": result.refreshed_channels,
                    "channels_with_listings": result.channels_with_listings,
                    "failed_channels": result.failed_channels,
                    "skipped_channels": result.skipped_channels,
                }),
            );

            let _ = append_log(
                &log_path,
                "INFO",
                &format!(
                    "refreshed source epg {} (channels={}, with_listings={}, skipped={}, failed={})",
                    result.source_id,
                    result.refreshed_channels,
                    result.channels_with_listings,
                    result.skipped_channels,
                    result.failed_channels
                ),
            );
        }
        Err(err) => {
            let _ = append_log(
                &log_path,
                "WARN",
                &format!("source epg refresh failed for source {source_id}: {err}"),
            );
            let _ = emit_backend_event(
                &app,
                "epg_updated",
                json!({
                    "source_id": source_id,
                    "refreshed_channels": 0,
                    "channels_with_listings": 0,
                    "failed_channels": 0,
                    "skipped_channels": 0,
                    "error": err,
                }),
            );
        }
    }
}

fn refresh_source_epg_core_with_paths(
    db_path: &Path,
    log_path: &Path,
    source_id: i64,
) -> Result<SourceEpgRefreshResult, String> {
    let source = get_source_by_id(db_path, source_id)?
        .ok_or_else(|| format!("source {source_id} not found"))?;

    if source.source_type != "xtream" {
        return Err("EPG refresh is currently supported only for Xtream sources.".to_string());
    }

    let xtream_config = XtreamConfig::from_value(&source.config)?;
    let live_channels =
        list_channels_for_source(db_path, source_id, Some("live"), None, None, false)?;
    let fresh_cutoff = current_unix_ts().saturating_sub(SOURCE_EPG_REFRESH_FRESH_SECONDS);
    let fresh_channel_ids = list_fresh_live_epg_channel_ids(db_path, source_id, fresh_cutoff)?;

    let mut refreshed_channels = 0usize;
    let mut channels_with_listings = 0usize;
    let mut failed_channels = 0usize;
    let mut skipped_channels = 0usize;
    let mut jobs: Vec<SourceEpgRefreshJob> = Vec::new();
    let mut pending_replacements: Vec<StoredLiveEpgChannelEntries> = Vec::new();

    for channel in live_channels {
        if fresh_channel_ids.contains(&channel.id) {
            skipped_channels += 1;
            continue;
        }

        let Some(stream_id) = extract_live_stream_id(&channel) else {
            pending_replacements.push(StoredLiveEpgChannelEntries {
                channel_id: channel.id,
                entries: Vec::new(),
            });
            continue;
        };

        jobs.push(SourceEpgRefreshJob {
            channel_id: channel.id,
            channel_name: channel.name,
            stream_id,
        });
    }

    if jobs.is_empty() {
        return Ok(SourceEpgRefreshResult {
            source_id,
            refreshed_channels,
            channels_with_listings,
            failed_channels,
            skipped_channels,
        });
    }

    XtreamEpgSession::new(xtream_config.clone())?;

    let worker_count = SOURCE_EPG_REFRESH_CONCURRENCY.min(jobs.len());
    let jobs = Arc::new(jobs);
    let next_index = Arc::new(AtomicUsize::new(0));
    let (tx, rx) = mpsc::channel::<SourceEpgRefreshFetchOutcome>();
    let mut workers = Vec::with_capacity(worker_count);

    for _ in 0..worker_count {
        let tx = tx.clone();
        let jobs = Arc::clone(&jobs);
        let next_index = Arc::clone(&next_index);
        let config = xtream_config.clone();

        workers.push(thread::spawn(move || {
            let Ok(session) = XtreamEpgSession::new(config) else {
                return;
            };

            loop {
                let job_index = next_index.fetch_add(1, Ordering::Relaxed);
                if job_index >= jobs.len() {
                    break;
                }

                let job = &jobs[job_index];
                let entries = session.fetch_live_epg(&job.stream_id, EPG_FETCH_LIMIT);
                let _ = tx.send(SourceEpgRefreshFetchOutcome {
                    channel_id: job.channel_id,
                    channel_name: job.channel_name.clone(),
                    entries,
                });
            }
        }));
    }
    drop(tx);

    let mut processed_channel_ids: HashSet<i64> = HashSet::new();
    let mut fetched_channels_with_listings = 0usize;
    for outcome in rx {
        processed_channel_ids.insert(outcome.channel_id);

        match outcome.entries {
            Ok(entries) => {
                let stored_entries = entries
                    .iter()
                    .map(api_live_epg_to_stored_record)
                    .collect::<Vec<_>>();

                if !entries.is_empty() {
                    fetched_channels_with_listings += 1;
                }
                pending_replacements.push(StoredLiveEpgChannelEntries {
                    channel_id: outcome.channel_id,
                    entries: stored_entries,
                });
            }
            Err(err) => {
                failed_channels += 1;
                let _ = append_log(
                    log_path,
                    "WARN",
                    &format!(
                        "epg refresh failed for channel {} ({}): {err}",
                        outcome.channel_id, outcome.channel_name
                    ),
                );
            }
        }
    }

    for worker in workers {
        if worker.join().is_err() {
            let _ = append_log(
                log_path,
                "WARN",
                &format!("epg refresh worker panicked for source {source_id}"),
            );
        }
    }

    if !pending_replacements.is_empty() {
        match replace_live_epg_for_channels(db_path, &pending_replacements) {
            Ok(()) => {
                refreshed_channels += pending_replacements.len();
                channels_with_listings += fetched_channels_with_listings;
            }
            Err(err) => {
                failed_channels += pending_replacements.len();
                let _ = append_log(
                    log_path,
                    "WARN",
                    &format!("epg batch store failed for source {source_id}: {err}"),
                );
            }
        }
    }

    if processed_channel_ids.len() < jobs.len() {
        for job in jobs.iter() {
            if processed_channel_ids.contains(&job.channel_id) {
                continue;
            }

            failed_channels += 1;
            let _ = append_log(
                log_path,
                "WARN",
                &format!(
                    "epg refresh produced no result for channel {} ({})",
                    job.channel_id, job.channel_name
                ),
            );
        }
    }

    Ok(SourceEpgRefreshResult {
        source_id,
        refreshed_channels,
        channels_with_listings,
        failed_channels,
        skipped_channels,
    })
}

fn extract_series_id_from_stream_url(stream_url: &str) -> Option<String> {
    extract_stream_key_from_url(stream_url)
}

fn extract_live_stream_id(channel: &ChannelRecord) -> Option<String> {
    extract_stream_key_from_url(&channel.stream_url)
        .and_then(|value| normalize_xtream_stream_id(&value))
        .or_else(|| {
            channel
                .tvg_id
                .as_deref()
                .and_then(normalize_xtream_stream_id)
        })
}

fn extract_stream_key_from_url(stream_url: &str) -> Option<String> {
    let without_query = stream_url.split(['?', '#']).next().unwrap_or(stream_url);
    let last_segment = without_query.rsplit('/').next()?;
    let candidate = last_segment.split('.').next().unwrap_or("").trim();

    if candidate.is_empty() {
        None
    } else {
        Some(candidate.to_string())
    }
}

fn normalize_xtream_stream_id(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || !trimmed.chars().all(|ch| ch.is_ascii_digit()) {
        return None;
    }

    Some(trimmed.to_string())
}

fn normalize_epg_limit(limit: Option<u32>) -> usize {
    limit.unwrap_or(2).clamp(1, 20) as usize
}

fn normalize_recent_limit(limit: Option<u32>) -> usize {
    limit.unwrap_or(20).clamp(1, 100) as usize
}

fn mpv_popout_args(url: &str, options: &MpvPopoutOptions) -> Vec<String> {
    let mut args: Vec<String> = [
        "--force-window=yes",
        "--idle=no",
        "--keep-open=no",
        "--osc=yes",
        "--input-default-bindings=yes",
        "--input-vo-keyboard=yes",
        "--title=SilkCast Pop-out",
    ]
    .into_iter()
    .map(String::from)
    .collect();

    if let Some(title) = options
        .title
        .map(str::trim)
        .filter(|title| !title.is_empty())
    {
        args.push(format!("--force-media-title={title}"));
    }
    if let Some(seconds) = options
        .start_seconds
        .filter(|seconds| seconds.is_finite() && *seconds > 0.0)
    {
        args.push(format!("--start={seconds}"));
    }
    match options.hardware_decode {
        Some(true) => args.push("--hwdec=auto-safe".to_string()),
        Some(false) => args.push("--hwdec=no".to_string()),
        None => {}
    }

    args.push("--".to_string());
    args.push(url.to_string());
    args
}

fn spawn_mpv_popout_process_with_candidates(
    url: &str,
    options: &MpvPopoutOptions,
    candidates: &[&str],
) -> Result<Child, String> {
    let args = mpv_popout_args(url, options);
    let mut errors: Vec<String> = Vec::new();

    for binary in candidates {
        match Command::new(binary).args(&args).spawn() {
            Ok(child) => return Ok(child),
            Err(err) => errors.push(format!("{binary}: {err}")),
        }
    }

    Err(format!(
        "unable to launch mpv pop-out process (tried: {}): {}",
        candidates.join(", "),
        errors.join(" | ")
    ))
}

fn determine_startup_resume_mode(settings: &Phase1Settings) -> StartupResumeMode {
    if settings.startup_behavior == "resume_last" && settings.preferred_player == "mpv" {
        StartupResumeMode::ResumeWithMpv
    } else if settings.startup_behavior == "resume_last" && settings.preferred_player == "web" {
        StartupResumeMode::ResumeWithWebDeferred
    } else {
        StartupResumeMode::None
    }
}

fn resolve_main_window_id(app: &tauri::AppHandle) -> Result<u64, String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    let handle = window
        .window_handle()
        .map_err(|err| format!("failed to get native window handle: {err}"))?;

    match handle.as_raw() {
        RawWindowHandle::Win32(h) => Ok(h.hwnd.get() as u64),
        RawWindowHandle::Xlib(h) => Ok(u64::from(h.window)),
        RawWindowHandle::Xcb(h) => Ok(u64::from(h.window.get())),
        RawWindowHandle::Wayland(_) => Err(
            "wayland window handles are not supported for mpv embedding; SilkCast can fall back to MPV pop-out mode on Wayland/Hyprland".to_string(),
        ),
        _ => Err("unsupported window handle type for mpv embedding".to_string()),
    }
}

/// Debug builds can run against a throwaway data directory
/// (`SILKCAST_DATA_DIR`), so testing never touches the real library.
fn dev_data_dir_override() -> Option<PathBuf> {
    if !cfg!(debug_assertions) {
        return None;
    }
    std::env::var_os("SILKCAST_DATA_DIR")
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let app_data_dir = match dev_data_dir_override() {
                Some(dir) => dir,
                None => app
                    .path()
                    .app_data_dir()
                    .map_err(|e| format!("failed to resolve app data dir: {e}"))?,
            };

            let context = ensure_foundation_dirs(&app_data_dir)?;
            init_storage(&context.db_path)?;
            init_log_file(&context.log_path)?;
            install_crash_hook(context.crash_dir.clone(), context.log_path.clone());

            let debug_mode = get_setting(&context.db_path, "debug_mode")?
                .as_deref()
                .map(|v| v == "true")
                .unwrap_or(false);

            let state = SharedState::new(context, debug_mode);
            let settings = load_phase1_settings(&state.context.db_path)
                .unwrap_or_else(|_| Phase1Settings::default());
            let _ = save_phase1_settings(&state.context.db_path, &settings);

            if let Ok(mut playback) = state.playback.lock() {
                if let Err(err) =
                    playback.apply_preferences(settings.hardware_decode, settings.cache_seconds())
                {
                    let _ = append_log(
                        &state.context.log_path,
                        "WARN",
                        &format!("unable to apply startup playback preferences: {err}"),
                    );
                }
            }

            if determine_startup_resume_mode(&settings) == StartupResumeMode::ResumeWithMpv {
                match list_recent_channels(&state.context.db_path, 1) {
                    Ok(recent) => {
                        if let Some(last_channel) = recent.into_iter().next() {
                            let app_handle = app.handle().clone();
                            let resolved_window_id = resolve_main_window_id(&app_handle);

                            let channel_name = last_channel.channel.name.clone();
                            let channel_id = last_channel.channel.id;
                            let stream_url = last_channel.channel.stream_url.clone();
                            let mut resumed = false;

                            if let Ok(mut playback) = state.playback.lock() {
                                let mut attached = false;
                                match resolved_window_id {
                                    Ok(window_id) => {
                                        if let Err(err) = playback.attach_window(window_id) {
                                            let _ = append_log(
                                                &state.context.log_path,
                                                "WARN",
                                                &format!(
                                                    "startup autoplay could not attach window {window_id}: {err}"
                                                ),
                                            );
                                        } else {
                                            attached = true;
                                        }
                                    }
                                    Err(err) => {
                                        let _ = append_log(
                                            &state.context.log_path,
                                            "WARN",
                                            &format!(
                                                "startup autoplay window attach unavailable: {err}"
                                            ),
                                        );
                                    }
                                }

                                if attached {
                                    if let Err(err) = playback.load_url(&stream_url) {
                                        let _ = append_log(
                                            &state.context.log_path,
                                            "WARN",
                                            &format!(
                                                "startup autoplay failed for channel {}: {err}",
                                                channel_name
                                            ),
                                        );
                                    } else {
                                        if let Err(err) =
                                            record_recent_play(&state.context.db_path, channel_id)
                                        {
                                            let _ = append_log(
                                                &state.context.log_path,
                                                "WARN",
                                                &format!(
                                                    "startup autoplay recent record failed for channel {}: {err}",
                                                    channel_id
                                                ),
                                            );
                                        }
                                        let _ = append_log(
                                            &state.context.log_path,
                                            "INFO",
                                            &format!(
                                                "startup autoplay resumed channel {} ({})",
                                                channel_name, channel_id
                                            ),
                                        );
                                        resumed = true;
                                    }
                                } else {
                                    let _ = playback.stop();
                                }
                            } else {
                                let _ = append_log(
                                    &state.context.log_path,
                                    "WARN",
                                    "startup autoplay skipped because playback state lock is poisoned",
                                );
                            }

                            if !resumed {
                                let options = MpvPopoutOptions {
                                    hardware_decode: Some(settings.hardware_decode),
                                    ..MpvPopoutOptions::default()
                                };
                                match spawn_mpv_popout_process(&stream_url, &options) {
                                    Ok(child) => {
                                        monitor_external_mpv_process(
                                            child,
                                            app_handle.clone(),
                                            stream_url.clone(),
                                            state.context.log_path.clone(),
                                        );
                                        if let Err(err) =
                                            record_recent_play(&state.context.db_path, channel_id)
                                        {
                                            let _ = append_log(
                                                &state.context.log_path,
                                                "WARN",
                                                &format!(
                                                    "startup autoplay recent record failed for channel {}: {err}",
                                                    channel_id
                                                ),
                                            );
                                        }
                                        let _ = append_log(
                                            &state.context.log_path,
                                            "INFO",
                                            &format!(
                                                "startup autoplay resumed channel {} ({}) in MPV pop-out mode",
                                                channel_name, channel_id
                                            ),
                                        );
                                    }
                                    Err(err) => {
                                        let _ = append_log(
                                            &state.context.log_path,
                                            "WARN",
                                            &format!(
                                                "startup autoplay fallback pop-out failed for channel {}: {err}",
                                                channel_name
                                            ),
                                        );
                                    }
                                }
                            }
                        }
                    }
                    Err(err) => {
                        let _ = append_log(
                            &state.context.log_path,
                            "WARN",
                            &format!("startup autoplay recents lookup failed: {err}"),
                        );
                    }
                }
            } else if determine_startup_resume_mode(&settings)
                == StartupResumeMode::ResumeWithWebDeferred
            {
                let _ = append_log(
                    &state.context.log_path,
                    "INFO",
                    "startup resume_last deferred to web player flow",
                );
            }

            // The proxy is optional: the web player degrades to direct URLs without it.
            let stream_proxy = match StreamProxy::start(Some(state.context.log_path.clone())) {
                Ok(proxy) => Some(proxy),
                Err(err) => {
                    let _ = append_log(
                        &state.context.log_path,
                        "WARN",
                        &format!("stream proxy failed to start: {err}"),
                    );
                    None
                }
            };
            app.manage(PlayerEnvironmentState::new(stream_proxy));

            append_log(
                &state.context.log_path,
                "INFO",
                "phase1 foundation initialized",
            )?;
            app.manage(state);
            emit_backend_event(
                &app.handle().clone(),
                "backend_ready",
                json!({ "phase": 1, "status": "ready" }),
            )?;
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_runtime_info,
            set_debug_mode,
            list_registered_sources,
            add_m3u_source,
            add_xtream_source,
            update_registered_source,
            refresh_m3u_source,
            refresh_registered_source,
            refresh_source_epg,
            delete_registered_source,
            list_source_groups,
            list_source_channels,
            list_series_episodes,
            list_channel_epg,
            list_channels_epg,
            refresh_channel_epg,
            set_channel_favorite_state,
            list_recently_played,
            play_channel,
            record_recent_channel_play,
            get_phase1_settings,
            set_phase1_settings,
            emit_phase0_ping,
            get_player_environment,
            playback_state,
            playback_attach_window,
            playback_attach_current_window,
            playback_load_url,
            playback_open_external_window,
            playback_pause,
            playback_stop,
            playback_set_volume,
            playback_set_fullscreen,
            playback_seek,
            playback_start_embedded_surface_mode,
            playback_update_embedded_surface_bounds,
            playback_stop_embedded_surface_mode
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
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
            "silkcast-lib-test-{}-{ts}-{seq}",
            std::process::id()
        ));
        fs::create_dir_all(&dir).expect("failed to create temp test dir");
        dir
    }

    #[test]
    fn import_m3u_source_inserts_channels_from_local_file() {
        let root = make_temp_root();
        let context = ensure_foundation_dirs(&root).expect("failed to create foundation dirs");
        init_storage(&context.db_path).expect("failed to initialize storage");
        init_log_file(&context.log_path).expect("failed to initialize log");

        let playlist_path = root.join("playlist.m3u");
        fs::write(
            &playlist_path,
            r#"#EXTM3U
#EXTINF:-1 group-title="News",News One
https://stream.example/news.m3u8
#EXTINF:-1 group-title="Sports",Sports One
https://stream.example/sports.m3u8
"#,
        )
        .expect("failed to write test playlist");

        let source_id = create_source(
            &context.db_path,
            "m3u",
            "Local Playlist",
            &json!({ "location": playlist_path.to_string_lossy().to_string() }),
        )
        .expect("failed to create source");

        let state = SharedState::new(context.clone(), false);
        let inserted = import_m3u_source(
            &state,
            source_id,
            &json!({ "location": playlist_path.to_string_lossy().to_string() }),
        )
        .expect("import should succeed");
        assert_eq!(inserted, 2);

        let channels =
            list_channels_for_source(&context.db_path, source_id, None, None, None, false)
                .expect("failed to list imported channels");
        assert_eq!(channels.len(), 2);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn import_m3u_source_errors_when_playlist_has_no_channels() {
        let root = make_temp_root();
        let context = ensure_foundation_dirs(&root).expect("failed to create foundation dirs");
        init_storage(&context.db_path).expect("failed to initialize storage");
        init_log_file(&context.log_path).expect("failed to initialize log");

        let playlist_path = root.join("empty.m3u");
        fs::write(&playlist_path, "#EXTM3U\n# no channels here\n")
            .expect("failed to write empty playlist");

        let source_id = create_source(
            &context.db_path,
            "m3u",
            "Empty Playlist",
            &json!({ "location": playlist_path.to_string_lossy().to_string() }),
        )
        .expect("failed to create source");

        let state = SharedState::new(context.clone(), false);
        let err = import_m3u_source(
            &state,
            source_id,
            &json!({ "location": playlist_path.to_string_lossy().to_string() }),
        )
        .expect_err("import should fail");
        assert!(err.contains("0 channels were found"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn import_m3u_source_rejects_missing_location_config() {
        let root = make_temp_root();
        let context = ensure_foundation_dirs(&root).expect("failed to create foundation dirs");
        init_storage(&context.db_path).expect("failed to initialize storage");
        init_log_file(&context.log_path).expect("failed to initialize log");

        let source_id = create_source(
            &context.db_path,
            "m3u",
            "Broken Config",
            &json!({ "location": "placeholder" }),
        )
        .expect("failed to create source");

        let state = SharedState::new(context.clone(), false);
        let err = import_m3u_source(&state, source_id, &json!({}))
            .expect_err("missing location should fail");
        assert!(err.contains("config missing `location`"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn import_m3u_source_surfaces_file_read_failures() {
        let root = make_temp_root();
        let context = ensure_foundation_dirs(&root).expect("failed to create foundation dirs");
        init_storage(&context.db_path).expect("failed to initialize storage");
        init_log_file(&context.log_path).expect("failed to initialize log");

        let missing_path = root.join("does-not-exist.m3u");
        let source_id = create_source(
            &context.db_path,
            "m3u",
            "Missing File",
            &json!({ "location": missing_path.to_string_lossy().to_string() }),
        )
        .expect("failed to create source");

        let state = SharedState::new(context.clone(), false);
        let err = import_m3u_source(
            &state,
            source_id,
            &json!({ "location": missing_path.to_string_lossy().to_string() }),
        )
        .expect_err("missing file should fail");
        assert!(err.contains("failed to read m3u file"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn create_and_import_m3u_source_rolls_back_source_when_import_fails() {
        let root = make_temp_root();
        let context = ensure_foundation_dirs(&root).expect("failed to create foundation dirs");
        init_storage(&context.db_path).expect("failed to initialize storage");
        init_log_file(&context.log_path).expect("failed to initialize log");

        let state = SharedState::new(context.clone(), false);
        let err = create_and_import_m3u_source(
            &state,
            "Will Rollback",
            &root.join("missing-file.m3u").to_string_lossy(),
        )
        .expect_err("import should fail");
        assert!(err.contains("failed to read m3u file"));

        let sources = list_sources(&context.db_path).expect("failed to list sources");
        assert!(sources.is_empty());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn refresh_m3u_source_core_rejects_not_found_and_wrong_type() {
        let root = make_temp_root();
        let context = ensure_foundation_dirs(&root).expect("failed to create foundation dirs");
        init_storage(&context.db_path).expect("failed to initialize storage");
        init_log_file(&context.log_path).expect("failed to initialize log");
        let state = SharedState::new(context.clone(), false);

        let not_found_err =
            refresh_m3u_source_core(&state, 9999).expect_err("missing source should fail");
        assert!(not_found_err.contains("not found"));

        let non_m3u_source_id = create_source(
            &context.db_path,
            "xtream",
            "Non M3U",
            &json!({ "endpoint": "https://example.com/api" }),
        )
        .expect("failed to create non-m3u source");
        let wrong_type_err = refresh_m3u_source_core(&state, non_m3u_source_id)
            .expect_err("non-m3u refresh should fail");
        assert!(wrong_type_err.contains("only for m3u"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn extract_series_id_from_stream_url_reads_last_path_segment_without_extension() {
        assert_eq!(
            extract_series_id_from_stream_url("https://iptv.example/series/u/p/12345.mp4"),
            Some("12345".to_string())
        );
        assert_eq!(
            extract_series_id_from_stream_url(
                "https://iptv.example/series/u/p/67890.mkv?token=abc#fragment"
            ),
            Some("67890".to_string())
        );
        assert_eq!(
            extract_series_id_from_stream_url("https://iptv.example/series/u/p/"),
            None
        );
    }

    #[test]
    fn list_series_episodes_core_rejects_non_series_channel() {
        let root = make_temp_root();
        let context = ensure_foundation_dirs(&root).expect("failed to create foundation dirs");
        init_storage(&context.db_path).expect("failed to initialize storage");
        init_log_file(&context.log_path).expect("failed to initialize log");

        let source_id = create_source(
            &context.db_path,
            "xtream",
            "Xtream Source",
            &json!({
                "server_url": "https://provider.example",
                "username": "alice",
                "password": "secret"
            }),
        )
        .expect("failed to create source");

        let inserted = replace_channels_for_source(
            &context.db_path,
            source_id,
            &[crate::foundation::ChannelInsertRecord {
                name: "Sample Movie".to_string(),
                group_name: Some("Movies".to_string()),
                logo: None,
                tvg_id: Some("202".to_string()),
                tvg_name: Some("Sample Movie".to_string()),
                stream_url: "https://provider.example/movie/alice/secret/202.mp4".to_string(),
                media_kind: "movie".to_string(),
            }],
        )
        .expect("failed to insert channel");
        assert_eq!(inserted, 1);

        let channel =
            list_channels_for_source(&context.db_path, source_id, None, None, None, false)
                .expect("failed to fetch channel")
                .into_iter()
                .next()
                .expect("expected inserted channel");

        let state = SharedState::new(context.clone(), false);
        let err = list_series_episodes_core(&state, channel.id)
            .expect_err("non-series channel should be rejected");
        assert!(err.contains("is not a series catalog item"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn list_series_episodes_core_rejects_non_xtream_source() {
        let root = make_temp_root();
        let context = ensure_foundation_dirs(&root).expect("failed to create foundation dirs");
        init_storage(&context.db_path).expect("failed to initialize storage");
        init_log_file(&context.log_path).expect("failed to initialize log");

        let source_id = create_source(
            &context.db_path,
            "m3u",
            "M3U Source",
            &json!({
                "location": "https://provider.example/playlist.m3u"
            }),
        )
        .expect("failed to create source");

        let inserted = replace_channels_for_source(
            &context.db_path,
            source_id,
            &[crate::foundation::ChannelInsertRecord {
                name: "Sample Series".to_string(),
                group_name: Some("Series".to_string()),
                logo: None,
                tvg_id: Some("999".to_string()),
                tvg_name: Some("Sample Series".to_string()),
                stream_url: "https://provider.example/series/alice/secret/999.mp4".to_string(),
                media_kind: "series".to_string(),
            }],
        )
        .expect("failed to insert channel");
        assert_eq!(inserted, 1);

        let channel =
            list_channels_for_source(&context.db_path, source_id, None, None, None, false)
                .expect("failed to fetch channel")
                .into_iter()
                .next()
                .expect("expected inserted channel");

        let state = SharedState::new(context.clone(), false);
        let err = list_series_episodes_core(&state, channel.id)
            .expect_err("non-xtream source should be rejected");
        assert!(err.contains("only for Xtream sources"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn list_channel_epg_core_reads_persisted_epg_for_xtream_source() {
        let root = make_temp_root();
        let context = ensure_foundation_dirs(&root).expect("failed to create foundation dirs");
        init_storage(&context.db_path).expect("failed to initialize storage");
        init_log_file(&context.log_path).expect("failed to initialize log");

        let source_id = create_source(
            &context.db_path,
            "xtream",
            "Xtream Source",
            &json!({
                "server_url": "https://provider.example",
                "username": "alice",
                "password": "secret"
            }),
        )
        .expect("failed to create source");

        let inserted = replace_channels_for_source(
            &context.db_path,
            source_id,
            &[crate::foundation::ChannelInsertRecord {
                name: "Live Sample".to_string(),
                group_name: Some("News".to_string()),
                logo: None,
                tvg_id: Some("101".to_string()),
                tvg_name: Some("Live Sample".to_string()),
                stream_url: "https://provider.example/live/101.m3u8".to_string(),
                media_kind: "live".to_string(),
            }],
        )
        .expect("failed to insert channel");
        assert_eq!(inserted, 1);

        let channel =
            list_channels_for_source(&context.db_path, source_id, None, None, None, false)
                .expect("failed to fetch channel")
                .into_iter()
                .next()
                .expect("expected inserted channel");

        let now = current_unix_ts();
        let programme = |title: &str, start: i64, end: i64| StoredLiveEpgEntryRecord {
            title: title.to_string(),
            description: Some("Headlines".to_string()),
            start: None,
            end: None,
            start_timestamp: Some(start),
            end_timestamp: Some(end),
        };
        replace_live_epg_for_channel(
            &context.db_path,
            channel.id,
            &[
                programme("Early News", now - 7200, now - 3600),
                programme("Morning News", now - 600, now + 3000),
                programme("Noon Update", now + 3000, now + 6600),
            ],
        )
        .expect("failed to persist channel epg");

        let state = SharedState::new(context.clone(), false);
        let epg_entries =
            list_channel_epg_core(&state, channel.id, Some(2)).expect("epg lookup should work");
        let titles: Vec<&str> = epg_entries
            .iter()
            .map(|entry| entry.title.as_str())
            .collect();
        assert_eq!(titles, vec!["Morning News", "Noon Update"]);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn list_channel_epg_core_returns_empty_for_non_xtream_source() {
        let root = make_temp_root();
        let context = ensure_foundation_dirs(&root).expect("failed to create foundation dirs");
        init_storage(&context.db_path).expect("failed to initialize storage");
        init_log_file(&context.log_path).expect("failed to initialize log");

        let source_id = create_source(
            &context.db_path,
            "m3u",
            "M3U Source",
            &json!({
                "location": "https://provider.example/playlist.m3u"
            }),
        )
        .expect("failed to create source");

        let inserted = replace_channels_for_source(
            &context.db_path,
            source_id,
            &[crate::foundation::ChannelInsertRecord {
                name: "Live Sample".to_string(),
                group_name: Some("News".to_string()),
                logo: None,
                tvg_id: Some("101".to_string()),
                tvg_name: Some("Live Sample".to_string()),
                stream_url: "https://provider.example/live/101.m3u8".to_string(),
                media_kind: "live".to_string(),
            }],
        )
        .expect("failed to insert channel");
        assert_eq!(inserted, 1);

        let channel =
            list_channels_for_source(&context.db_path, source_id, None, None, None, false)
                .expect("failed to fetch channel")
                .into_iter()
                .next()
                .expect("expected inserted channel");

        let state = SharedState::new(context.clone(), false);
        let epg_entries = list_channel_epg_core(&state, channel.id, None)
            .expect("non-xtream source should return empty epg");
        assert!(epg_entries.is_empty());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn normalize_epg_limit_clamps_values() {
        assert_eq!(normalize_epg_limit(None), 2);
        assert_eq!(normalize_epg_limit(Some(0)), 1);
        assert_eq!(normalize_epg_limit(Some(1)), 1);
        assert_eq!(normalize_epg_limit(Some(99)), 20);
    }

    #[test]
    fn normalize_recent_limit_clamps_values() {
        assert_eq!(normalize_recent_limit(None), 20);
        assert_eq!(normalize_recent_limit(Some(0)), 1);
        assert_eq!(normalize_recent_limit(Some(1)), 1);
        assert_eq!(normalize_recent_limit(Some(200)), 100);
    }

    #[test]
    fn determine_startup_resume_mode_covers_supported_modes() {
        assert_eq!(
            determine_startup_resume_mode(&Phase1Settings {
                hardware_decode: true,
                buffering_preset: "normal".to_string(),
                startup_behavior: "home".to_string(),
                preferred_player: "web".to_string(),
            }),
            StartupResumeMode::None
        );
        assert_eq!(
            determine_startup_resume_mode(&Phase1Settings {
                hardware_decode: true,
                buffering_preset: "normal".to_string(),
                startup_behavior: "resume_last".to_string(),
                preferred_player: "mpv".to_string(),
            }),
            StartupResumeMode::ResumeWithMpv
        );
        assert_eq!(
            determine_startup_resume_mode(&Phase1Settings {
                hardware_decode: true,
                buffering_preset: "normal".to_string(),
                startup_behavior: "resume_last".to_string(),
                preferred_player: "web".to_string(),
            }),
            StartupResumeMode::ResumeWithWebDeferred
        );
    }

    #[test]
    fn mpv_popout_args_include_title_and_start_when_provided() {
        let args = mpv_popout_args(
            "https://stream.example/vod.mp4",
            &MpvPopoutOptions {
                title: Some("  Movie: Part 2  "),
                start_seconds: Some(754.5),
                hardware_decode: Some(true),
            },
        );
        assert!(args.contains(&"--force-media-title=Movie: Part 2".to_string()));
        assert!(args.contains(&"--start=754.5".to_string()));
        assert!(args.contains(&"--hwdec=auto-safe".to_string()));
        assert_eq!(
            &args[args.len() - 2..],
            &[
                "--".to_string(),
                "https://stream.example/vod.mp4".to_string()
            ]
        );

        let whole_seconds = mpv_popout_args(
            "https://stream.example/vod.mp4",
            &MpvPopoutOptions {
                start_seconds: Some(90.0),
                hardware_decode: Some(false),
                ..MpvPopoutOptions::default()
            },
        );
        assert!(whole_seconds.contains(&"--start=90".to_string()));
        assert!(whole_seconds.contains(&"--hwdec=no".to_string()));
    }

    #[test]
    fn mpv_popout_args_omit_empty_title_and_non_positive_start() {
        for (title, start) in [
            (None, None),
            (Some("   "), Some(0.0)),
            (Some(""), Some(-5.0)),
            (None, Some(f64::NAN)),
        ] {
            let args = mpv_popout_args(
                "https://stream.example/live.m3u8",
                &MpvPopoutOptions {
                    title,
                    start_seconds: start,
                    hardware_decode: None,
                },
            );
            assert!(
                !args.iter().any(|arg| arg.starts_with("--force-media-title")
                    || arg.starts_with("--start")
                    || arg.starts_with("--hwdec")),
                "unexpected args for {title:?}/{start:?}: {args:?}"
            );
            assert_eq!(
                args.last().map(String::as_str),
                Some("https://stream.example/live.m3u8")
            );
        }
    }

    #[test]
    fn spawn_mpv_popout_process_with_candidates_returns_error_when_all_missing() {
        let err = spawn_mpv_popout_process_with_candidates(
            "https://stream.example/live.m3u8",
            &MpvPopoutOptions::default(),
            &["definitely-missing-binary-1", "definitely-missing-binary-2"],
        )
        .expect_err("all candidates missing should fail");
        assert!(err.contains("unable to launch mpv pop-out process"));
        assert!(err.contains("definitely-missing-binary-1"));
        assert!(err.contains("definitely-missing-binary-2"));
    }

    #[test]
    fn spawn_mpv_popout_process_with_candidates_uses_fallback_binary() {
        let mut child = spawn_mpv_popout_process_with_candidates(
            "https://stream.example/live.m3u8",
            &MpvPopoutOptions {
                title: Some("Live Channel"),
                start_seconds: Some(12.0),
                hardware_decode: Some(true),
            },
            &["definitely-missing-binary-1", "rustc"],
        )
        .expect("fallback candidate should spawn");

        let _ = child.wait();
    }
}
