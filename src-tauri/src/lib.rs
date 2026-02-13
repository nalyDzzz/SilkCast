mod foundation;
mod playback;

use foundation::{
    append_log, create_source, emit_backend_event, ensure_foundation_dirs, get_setting,
    init_log_file, init_storage, install_crash_hook, list_sources, set_setting, RuntimeInfo,
    SharedState, SourceRecord,
};
use playback::PlaybackStatus;
use raw_window_handle::{HasWindowHandle, RawWindowHandle};
use serde_json::json;
use tauri::{Manager, State};

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
    state: State<SharedState>,
) -> Result<i64, String> {
    let config = json!({ "location": location });
    state.source_kind_supported("m3u", &config)?;
    let id = create_source(&state.context.db_path, "m3u", &name, &config)?;
    append_log(
        &state.context.log_path,
        "INFO",
        &format!("registered m3u source {id}:{name}"),
    )?;
    Ok(id)
}

#[tauri::command]
fn add_xtream_source(
    name: String,
    server_url: String,
    username: String,
    state: State<SharedState>,
) -> Result<i64, String> {
    let config = json!({ "server_url": server_url, "username": username });
    state.source_kind_supported("xtream", &config)?;
    let id = create_source(&state.context.db_path, "xtream", &name, &config)?;
    append_log(
        &state.context.log_path,
        "INFO",
        &format!("registered xtream source {id}:{name}"),
    )?;
    Ok(id)
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
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    let handle = window
        .window_handle()
        .map_err(|err| format!("failed to get native window handle: {err}"))?;

    let window_id = match handle.as_raw() {
        RawWindowHandle::Win32(h) => h.hwnd.get() as u64,
        RawWindowHandle::Xlib(h) => h.window,
        RawWindowHandle::Xcb(h) => u64::from(h.window.get()),
        RawWindowHandle::Wayland(_) => {
            return Err(
                "wayland window handles are not supported for mpv embedding; run with X11/XWayland (e.g. set `GDK_BACKEND=x11`)".to_string(),
            )
        }
        _ => return Err("unsupported window handle type for mpv embedding".to_string()),
    };

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
            append_log(
                &state.context.log_path,
                "INFO",
                "phase0 foundation initialized",
            )?;
            app.manage(state);
            emit_backend_event(
                &app.handle().clone(),
                "backend_ready",
                json!({ "phase": 0, "status": "ready" }),
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
            emit_phase0_ping,
            playback_state,
            playback_attach_window,
            playback_attach_current_window,
            playback_load_url,
            playback_pause,
            playback_stop
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
