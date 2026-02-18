mod foundation;
mod m3u;
mod playback;

use foundation::{
    append_log, create_source, delete_source, emit_backend_event, ensure_foundation_dirs,
    get_channel_by_id, get_setting, get_source_by_id, init_log_file, init_storage,
    install_crash_hook, list_channels_for_source, list_groups_for_source, list_recent_channels,
    list_sources, load_phase1_settings, record_recent_play, replace_channels_for_source,
    save_phase1_settings, set_channel_favorite, set_setting, ChannelRecord, GroupRecord,
    Phase1Settings, RecentChannelRecord, RuntimeInfo, SharedState, SourceRecord,
};
use m3u::{load_m3u_location, parse_m3u_channels};
use playback::{EmbeddedSurfaceBounds, PlaybackStatus};
use raw_window_handle::{HasWindowHandle, RawWindowHandle};
use serde::Serialize;
use serde_json::{json, Value};
use tauri::{Manager, State};

#[derive(Debug, Serialize)]
struct M3uImportResult {
    source_id: i64,
    imported_channels: usize,
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
fn set_debug_mode(enabled: bool, state: State<SharedState>) -> Result<(), String> {
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
}

#[tauri::command]
fn list_registered_sources(state: State<SharedState>) -> Result<Vec<SourceRecord>, String> {
    list_sources(&state.context.db_path)
}

#[tauri::command]
fn add_m3u_source(
    name: String,
    location: String,
    app: tauri::AppHandle,
    state: State<SharedState>,
) -> Result<M3uImportResult, String> {
    let config = json!({ "location": location });
    state.source_kind_supported("m3u", &config)?;

    let source_id = create_source(&state.context.db_path, "m3u", &name, &config)?;
    let imported_channels = match import_m3u_source(&state, source_id, &config) {
        Ok(count) => count,
        Err(err) => {
            let _ = delete_source(&state.context.db_path, source_id);
            return Err(err);
        }
    };

    emit_backend_event(&app, "sources_updated", json!({ "source_id": source_id }))?;
    emit_backend_event(&app, "groups_updated", json!({ "source_id": source_id }))?;
    emit_backend_event(&app, "channels_updated", json!({ "source_id": source_id }))?;

    append_log(
        &state.context.log_path,
        "INFO",
        &format!("registered m3u source {source_id}:{name} with {imported_channels} channels"),
    )?;

    Ok(M3uImportResult {
        source_id,
        imported_channels,
    })
}

#[tauri::command]
fn refresh_m3u_source(
    source_id: i64,
    app: tauri::AppHandle,
    state: State<SharedState>,
) -> Result<M3uImportResult, String> {
    let source = get_source_by_id(&state.context.db_path, source_id)?
        .ok_or_else(|| format!("source {source_id} not found"))?;

    if source.source_type != "m3u" {
        return Err("refresh is currently supported only for m3u sources".to_string());
    }

    let imported_channels = import_m3u_source(&state, source_id, &source.config)?;

    emit_backend_event(&app, "groups_updated", json!({ "source_id": source_id }))?;
    emit_backend_event(&app, "channels_updated", json!({ "source_id": source_id }))?;

    append_log(
        &state.context.log_path,
        "INFO",
        &format!("refreshed source {source_id} with {imported_channels} channels"),
    )?;

    Ok(M3uImportResult {
        source_id,
        imported_channels,
    })
}

#[tauri::command]
fn list_source_groups(
    source_id: i64,
    state: State<SharedState>,
) -> Result<Vec<GroupRecord>, String> {
    list_groups_for_source(&state.context.db_path, source_id)
}

#[tauri::command]
fn list_source_channels(
    source_id: i64,
    group_name: Option<String>,
    query: Option<String>,
    favorites_only: bool,
    state: State<SharedState>,
) -> Result<Vec<ChannelRecord>, String> {
    list_channels_for_source(
        &state.context.db_path,
        source_id,
        group_name.as_deref(),
        query.as_deref(),
        favorites_only,
    )
}

#[tauri::command]
fn set_channel_favorite_state(
    channel_id: i64,
    favorite: bool,
    app: tauri::AppHandle,
    state: State<SharedState>,
) -> Result<(), String> {
    let channel = get_channel_by_id(&state.context.db_path, channel_id)?
        .ok_or_else(|| format!("channel {channel_id} not found"))?;
    set_channel_favorite(&state.context.db_path, channel_id, favorite)?;
    emit_backend_event(
        &app,
        "channels_updated",
        json!({ "source_id": channel.source_id }),
    )?;
    append_log(
        &state.context.log_path,
        "INFO",
        &format!("favorite={} for channel {}", favorite, channel_id),
    )
}

#[tauri::command]
fn list_recently_played(
    limit: Option<u32>,
    state: State<SharedState>,
) -> Result<Vec<RecentChannelRecord>, String> {
    let normalized_limit = limit.unwrap_or(20).clamp(1, 100) as usize;
    list_recent_channels(&state.context.db_path, normalized_limit)
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
fn get_phase1_settings(state: State<SharedState>) -> Result<Phase1Settings, String> {
    load_phase1_settings(&state.context.db_path)
}

#[tauri::command]
fn set_phase1_settings(
    settings: Phase1Settings,
    app: tauri::AppHandle,
    state: State<SharedState>,
) -> Result<(), String> {
    save_phase1_settings(&state.context.db_path, &settings)?;

    if let Ok(mut playback) = state.playback.lock() {
        if let Err(err) =
            playback.apply_preferences(settings.hardware_decode, settings.cache_seconds())
        {
            let _ = append_log(
                &state.context.log_path,
                "WARN",
                &format!("unable to apply playback preferences immediately: {err}"),
            );
        }
    }

    emit_backend_event(&app, "settings_updated", json!({ "phase": 1 }))?;
    append_log(&state.context.log_path, "INFO", "phase1 settings saved")
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
fn playback_use_external_window_mode(
    app: tauri::AppHandle,
    state: State<SharedState>,
) -> Result<(), String> {
    let mut playback = state
        .playback
        .lock()
        .map_err(|_| "playback state lock poisoned".to_string())?;
    playback.use_external_window_mode()?;
    emit_backend_event(
        &app,
        "playback_state_changed",
        json!({ "state": playback.status() }),
    )?;
    append_log(
        &state.context.log_path,
        "INFO",
        "playback render mode switched to external window",
    )
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
            "wayland window handles are not supported for mpv embedding; run with X11/XWayland (e.g. set `GDK_BACKEND=x11`)".to_string(),
        ),
        _ => Err("unsupported window handle type for mpv embedding".to_string()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("failed to resolve app data dir: {e}"))?;

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

            if settings.startup_behavior == "resume_last" {
                match list_recent_channels(&state.context.db_path, 1) {
                    Ok(recent) => {
                        if let Some(last_channel) = recent.into_iter().next() {
                            let app_handle = app.handle().clone();
                            let resolved_window_id = resolve_main_window_id(&app_handle);

                            if let Ok(mut playback) = state.playback.lock() {
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

                                if let Err(err) = playback.load_url(&last_channel.channel.stream_url)
                                {
                                    let _ = append_log(
                                        &state.context.log_path,
                                        "WARN",
                                        &format!(
                                            "startup autoplay failed for channel {}: {err}",
                                            last_channel.channel.name
                                        ),
                                    );
                                } else {
                                    if let Err(err) =
                                        record_recent_play(&state.context.db_path, last_channel.channel.id)
                                    {
                                        let _ = append_log(
                                            &state.context.log_path,
                                            "WARN",
                                            &format!(
                                                "startup autoplay recent record failed for channel {}: {err}",
                                                last_channel.channel.id
                                            ),
                                        );
                                    }
                                    let _ = append_log(
                                        &state.context.log_path,
                                        "INFO",
                                        &format!(
                                            "startup autoplay resumed channel {} ({})",
                                            last_channel.channel.name, last_channel.channel.id
                                        ),
                                    );
                                }
                            } else {
                                let _ = append_log(
                                    &state.context.log_path,
                                    "WARN",
                                    "startup autoplay skipped because playback state lock is poisoned",
                                );
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
            }

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
            refresh_m3u_source,
            list_source_groups,
            list_source_channels,
            set_channel_favorite_state,
            list_recently_played,
            play_channel,
            get_phase1_settings,
            set_phase1_settings,
            emit_phase0_ping,
            playback_state,
            playback_attach_window,
            playback_attach_current_window,
            playback_load_url,
            playback_pause,
            playback_stop,
            playback_set_volume,
            playback_set_fullscreen,
            playback_use_external_window_mode,
            playback_start_embedded_surface_mode,
            playback_update_embedded_surface_bounds,
            playback_stop_embedded_surface_mode
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

