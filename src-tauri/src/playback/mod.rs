use serde::{Deserialize, Serialize};
#[cfg(any(windows, target_os = "linux"))]
use std::ffi::{c_char, CString};
#[cfg(any(windows, target_os = "linux"))]
use std::path::PathBuf;
#[cfg(windows)]
mod windows_surface;
#[cfg(windows)]
use windows_surface::EmbeddedSurfaceHost;

#[derive(Clone, Debug, Serialize)]
pub enum PlaybackState {
    Idle,
    Loading,
    Playing,
    Paused,
    Stopped,
    Error,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PlaybackRenderMode {
    ExternalWindow,
    EmbeddedSurface,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub struct EmbeddedSurfaceBounds {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

#[derive(Clone, Debug, Serialize)]
pub struct PlaybackStatus {
    pub state: PlaybackState,
    pub attached_hwnd: Option<u64>,
    pub embedded_surface_hwnd: Option<u64>,
    pub current_url: Option<String>,
    pub backend: String,
    pub last_error: Option<String>,
    pub volume: f64,
    pub fullscreen: bool,
    pub render_mode: PlaybackRenderMode,
}

pub struct PlaybackEngine {
    status: PlaybackStatus,
    backend: BackendKind,
}

impl PlaybackEngine {
    pub fn new() -> Self {
        let backend = BackendKind::new();
        let backend_name = backend.name().to_string();
        Self {
            status: PlaybackStatus {
                state: PlaybackState::Idle,
                attached_hwnd: None,
                embedded_surface_hwnd: None,
                current_url: None,
                backend: backend_name,
                last_error: None,
                volume: 100.0,
                fullscreen: false,
                render_mode: PlaybackRenderMode::ExternalWindow,
            },
            backend,
        }
    }

    #[cfg(test)]
    fn with_backend_for_tests(backend: Box<dyn PlaybackBackend + Send>) -> Self {
        let backend = BackendKind::Active(backend);
        let backend_name = backend.name().to_string();
        Self {
            status: PlaybackStatus {
                state: PlaybackState::Idle,
                attached_hwnd: None,
                embedded_surface_hwnd: None,
                current_url: None,
                backend: backend_name,
                last_error: None,
                volume: 100.0,
                fullscreen: false,
                render_mode: PlaybackRenderMode::ExternalWindow,
            },
            backend,
        }
    }

    pub fn status(&self) -> PlaybackStatus {
        self.status.clone()
    }

    pub fn attach_window(&mut self, hwnd: u64) -> Result<(), String> {
        self.backend.attach_window(hwnd)?;
        self.status.attached_hwnd = Some(hwnd);
        self.status.embedded_surface_hwnd = None;
        self.status.render_mode = PlaybackRenderMode::ExternalWindow;
        Ok(())
    }

    pub fn load_url(&mut self, url: &str) -> Result<(), String> {
        self.status.state = PlaybackState::Loading;
        self.status.last_error = None;
        if let Err(err) = self.backend.load_url(url) {
            self.status.state = PlaybackState::Error;
            self.status.last_error = Some(err.clone());
            return Err(err);
        }
        self.status.current_url = Some(url.to_string());
        self.status.state = PlaybackState::Playing;
        Ok(())
    }

    pub fn pause(&mut self, paused: bool) -> Result<(), String> {
        self.backend.pause(paused)?;
        self.status.state = if paused {
            PlaybackState::Paused
        } else {
            PlaybackState::Playing
        };
        Ok(())
    }

    pub fn stop(&mut self) -> Result<(), String> {
        if let Err(err) = self.backend.stop() {
            // Treat stop failures as non-fatal so UI state does not get stuck
            // if the external mpv window/surface was closed unexpectedly.
            self.status.last_error = Some(format!("playback stop warning: {err}"));
        }
        self.status.current_url = None;
        self.status.state = PlaybackState::Stopped;
        Ok(())
    }

    pub fn set_volume(&mut self, volume: f64) -> Result<(), String> {
        let clamped = volume.clamp(0.0, 100.0);
        self.backend.set_volume(clamped)?;
        self.status.volume = clamped;
        Ok(())
    }

    pub fn set_fullscreen(&mut self, fullscreen: bool) -> Result<(), String> {
        if self.status.render_mode != PlaybackRenderMode::EmbeddedSurface {
            self.backend.set_fullscreen(fullscreen)?;
        }
        self.status.fullscreen = fullscreen;
        Ok(())
    }

    pub fn seek(&mut self, seconds: i64) -> Result<(), String> {
        self.backend.seek(seconds)
    }

    pub fn apply_preferences(
        &mut self,
        hardware_decode: bool,
        cache_seconds: i64,
    ) -> Result<(), String> {
        self.backend
            .apply_preferences(hardware_decode, cache_seconds)
    }

    pub fn start_embedded_surface_mode(
        &mut self,
        parent_hwnd: u64,
        bounds: EmbeddedSurfaceBounds,
    ) -> Result<u64, String> {
        let surface_hwnd = self
            .backend
            .start_embedded_surface_mode(parent_hwnd, bounds)?;
        self.status.render_mode = PlaybackRenderMode::EmbeddedSurface;
        self.status.attached_hwnd = Some(parent_hwnd);
        self.status.embedded_surface_hwnd = Some(surface_hwnd);
        Ok(surface_hwnd)
    }

    pub fn update_embedded_surface_bounds(
        &mut self,
        bounds: EmbeddedSurfaceBounds,
    ) -> Result<(), String> {
        self.backend.update_embedded_surface_bounds(bounds)
    }

    pub fn stop_embedded_surface_mode(&mut self) -> Result<(), String> {
        self.backend.stop_embedded_surface_mode()?;
        self.status.render_mode = PlaybackRenderMode::ExternalWindow;
        self.status.embedded_surface_hwnd = None;
        Ok(())
    }
}

trait PlaybackBackend {
    fn name(&self) -> &'static str;
    fn attach_window(&mut self, hwnd: u64) -> Result<(), String>;
    fn load_url(&mut self, url: &str) -> Result<(), String>;
    fn pause(&mut self, paused: bool) -> Result<(), String>;
    fn stop(&mut self) -> Result<(), String>;
    fn set_volume(&mut self, volume: f64) -> Result<(), String>;
    fn set_fullscreen(&mut self, fullscreen: bool) -> Result<(), String>;
    fn seek(&mut self, seconds: i64) -> Result<(), String>;
    fn apply_preferences(
        &mut self,
        hardware_decode: bool,
        cache_seconds: i64,
    ) -> Result<(), String>;
    fn start_embedded_surface_mode(
        &mut self,
        parent_hwnd: u64,
        bounds: EmbeddedSurfaceBounds,
    ) -> Result<u64, String>;
    fn update_embedded_surface_bounds(
        &mut self,
        bounds: EmbeddedSurfaceBounds,
    ) -> Result<(), String>;
    fn stop_embedded_surface_mode(&mut self) -> Result<(), String>;
}

enum BackendKind {
    Active(Box<dyn PlaybackBackend + Send>),
    Unavailable(String),
}

impl BackendKind {
    fn new() -> Self {
        #[cfg(any(windows, target_os = "linux"))]
        {
            match MpvPlaybackBackend::new() {
                Ok(backend) => BackendKind::Active(Box::new(backend)),
                Err(err) => BackendKind::Unavailable(format!("mpv backend unavailable: {err}")),
            }
        }

        #[cfg(not(any(windows, target_os = "linux")))]
        {
            BackendKind::Unavailable(
                "mpv backend is enabled only on Windows and Linux builds".to_string(),
            )
        }
    }

    fn name(&self) -> &str {
        match self {
            BackendKind::Active(backend) => backend.name(),
            BackendKind::Unavailable(_) => "unavailable",
        }
    }

    fn attach_window(&mut self, hwnd: u64) -> Result<(), String> {
        match self {
            BackendKind::Active(backend) => backend.attach_window(hwnd),
            BackendKind::Unavailable(reason) => Err(reason.clone()),
        }
    }

    fn load_url(&mut self, url: &str) -> Result<(), String> {
        match self {
            BackendKind::Active(backend) => backend.load_url(url),
            BackendKind::Unavailable(reason) => Err(reason.clone()),
        }
    }

    fn pause(&mut self, paused: bool) -> Result<(), String> {
        match self {
            BackendKind::Active(backend) => backend.pause(paused),
            BackendKind::Unavailable(reason) => Err(reason.clone()),
        }
    }

    fn stop(&mut self) -> Result<(), String> {
        match self {
            BackendKind::Active(backend) => backend.stop(),
            BackendKind::Unavailable(reason) => Err(reason.clone()),
        }
    }

    fn set_volume(&mut self, volume: f64) -> Result<(), String> {
        match self {
            BackendKind::Active(backend) => backend.set_volume(volume),
            BackendKind::Unavailable(reason) => Err(reason.clone()),
        }
    }

    fn set_fullscreen(&mut self, fullscreen: bool) -> Result<(), String> {
        match self {
            BackendKind::Active(backend) => backend.set_fullscreen(fullscreen),
            BackendKind::Unavailable(reason) => Err(reason.clone()),
        }
    }

    fn seek(&mut self, seconds: i64) -> Result<(), String> {
        match self {
            BackendKind::Active(backend) => backend.seek(seconds),
            BackendKind::Unavailable(reason) => Err(reason.clone()),
        }
    }

    fn apply_preferences(
        &mut self,
        hardware_decode: bool,
        cache_seconds: i64,
    ) -> Result<(), String> {
        match self {
            BackendKind::Active(backend) => {
                backend.apply_preferences(hardware_decode, cache_seconds)
            }
            BackendKind::Unavailable(reason) => Err(reason.clone()),
        }
    }

    fn start_embedded_surface_mode(
        &mut self,
        parent_hwnd: u64,
        bounds: EmbeddedSurfaceBounds,
    ) -> Result<u64, String> {
        match self {
            BackendKind::Active(backend) => {
                backend.start_embedded_surface_mode(parent_hwnd, bounds)
            }
            BackendKind::Unavailable(reason) => Err(reason.clone()),
        }
    }

    fn update_embedded_surface_bounds(
        &mut self,
        bounds: EmbeddedSurfaceBounds,
    ) -> Result<(), String> {
        match self {
            BackendKind::Active(backend) => backend.update_embedded_surface_bounds(bounds),
            BackendKind::Unavailable(reason) => Err(reason.clone()),
        }
    }

    fn stop_embedded_surface_mode(&mut self) -> Result<(), String> {
        match self {
            BackendKind::Active(backend) => backend.stop_embedded_surface_mode(),
            BackendKind::Unavailable(reason) => Err(reason.clone()),
        }
    }
}

#[cfg(any(windows, target_os = "linux"))]
struct MpvPlaybackBackend {
    handle: *mut mpv_handle,
    api: MpvApi,
    #[cfg(windows)]
    embedded_surface: Option<EmbeddedSurfaceHost>,
    #[cfg(target_os = "linux")]
    embedded_surface_parent: Option<u64>,
}

#[cfg(any(windows, target_os = "linux"))]
unsafe impl Send for MpvPlaybackBackend {}

#[cfg(any(windows, target_os = "linux"))]
impl MpvPlaybackBackend {
    fn new() -> Result<Self, String> {
        let api = MpvApi::load()?;
        let handle = unsafe { (api.mpv_create)() };
        if handle.is_null() {
            return Err("mpv_create returned null".to_string());
        }

        let cleanup_and_err = |message: String| -> Result<Self, String> {
            unsafe {
                (api.mpv_terminate_destroy)(handle);
            }
            Err(message)
        };

        let set_option_string = |name: &str, value: &str| -> Result<(), String> {
            let option_name = CString::new(name)
                .map_err(|err| format!("cstring error for option name: {err}"))?;
            let option_value = CString::new(value)
                .map_err(|err| format!("cstring error for option value: {err}"))?;
            let rc = unsafe {
                (api.mpv_set_option_string)(handle, option_name.as_ptr(), option_value.as_ptr())
            };
            if rc < 0 {
                return Err(format!("failed to set mpv option `{name}`"));
            }
            Ok(())
        };

        // Ignore user/system mpv.conf so app behavior is deterministic.
        if let Err(err) = set_option_string("config", "no") {
            return cleanup_and_err(err);
        }
        // Prevent standalone mpv windows when embedded playback is expected.
        if let Err(err) = set_option_string("force-window", "no") {
            return cleanup_and_err(err);
        }
        if let Err(err) = set_option_string("keep-open", "no") {
            return cleanup_and_err(err);
        }
        if let Err(err) = set_option_string("hwdec", "auto-safe") {
            return cleanup_and_err(err);
        }

        if unsafe { (api.mpv_initialize)(handle) } < 0 {
            return cleanup_and_err("mpv_initialize failed".to_string());
        }

        Ok(Self {
            handle,
            api,
            #[cfg(windows)]
            embedded_surface: None,
            #[cfg(target_os = "linux")]
            embedded_surface_parent: None,
        })
    }

    fn command(&self, args: &[&str], label: &str) -> Result<(), String> {
        let mut argv = Vec::with_capacity(args.len());
        for arg in args {
            argv.push(CString::new(*arg).map_err(|err| format!("invalid command arg: {err}"))?);
        }
        let mut ptrs: Vec<*const c_char> = argv.iter().map(|arg| arg.as_ptr()).collect();
        ptrs.push(std::ptr::null());

        let rc = unsafe { (self.api.mpv_command)(self.handle, ptrs.as_mut_ptr()) };
        if rc < 0 {
            return Err(format!("mpv command `{label}` failed"));
        }

        Ok(())
    }

    fn set_wid(&self, hwnd: u64) -> Result<(), String> {
        let wid = format!("{hwnd}");
        self.command(&["set", "wid", &wid], "set wid")
    }

    fn clear_wid(&self) -> Result<(), String> {
        // mpv expects -1 for "no embedding target"; using 0 can map to an
        // invalid/null native handle and cause window lifecycle issues.
        self.command(&["set", "wid", "-1"], "set wid -1")
    }
}

#[cfg(any(windows, target_os = "linux"))]
impl PlaybackBackend for MpvPlaybackBackend {
    fn name(&self) -> &'static str {
        "libmpv"
    }

    fn attach_window(&mut self, hwnd: u64) -> Result<(), String> {
        #[cfg(windows)]
        {
            self.embedded_surface = None;
        }
        #[cfg(target_os = "linux")]
        {
            self.embedded_surface_parent = None;
        }
        self.set_wid(hwnd)
    }

    fn load_url(&mut self, url: &str) -> Result<(), String> {
        // Re-enable video in case stop() disabled it to clear stale frames.
        self.command(&["set", "vid", "auto"], "set vid auto")?;
        self.command(&["loadfile", url], "loadfile")
    }

    fn pause(&mut self, paused: bool) -> Result<(), String> {
        self.command(
            &["set", "pause", if paused { "yes" } else { "no" }],
            "set pause",
        )
    }

    fn stop(&mut self) -> Result<(), String> {
        let _ = self.command(&["set", "pause", "yes"], "set pause");
        let stop_result = self.command(&["stop"], "stop");
        let clear_result = self.command(&["playlist-clear"], "playlist-clear");
        let _ = self.command(&["set", "vid", "no"], "set vid no");

        if stop_result.is_ok() || clear_result.is_ok() {
            return Ok(());
        }

        Err(format!(
            "failed to stop playback: {} | {}",
            stop_result
                .err()
                .unwrap_or_else(|| "unknown stop error".to_string()),
            clear_result
                .err()
                .unwrap_or_else(|| "unknown playlist-clear error".to_string())
        ))
    }

    fn set_volume(&mut self, volume: f64) -> Result<(), String> {
        let normalized = format!("{}", volume.round() as i64);
        self.command(&["set", "volume", &normalized], "set volume")
    }

    fn set_fullscreen(&mut self, fullscreen: bool) -> Result<(), String> {
        self.command(
            &["set", "fullscreen", if fullscreen { "yes" } else { "no" }],
            "set fullscreen",
        )
    }

    fn seek(&mut self, seconds: i64) -> Result<(), String> {
        let amount = format!("{seconds}");
        self.command(&["seek", &amount, "relative+exact"], "seek")
    }

    fn apply_preferences(
        &mut self,
        hardware_decode: bool,
        cache_seconds: i64,
    ) -> Result<(), String> {
        self.command(
            &[
                "set",
                "hwdec",
                if hardware_decode { "auto-safe" } else { "no" },
            ],
            "set hwdec",
        )?;

        let cache = format!("{cache_seconds}");
        self.command(&["set", "cache-secs", &cache], "set cache-secs")?;

        #[cfg(any(windows, target_os = "linux"))]
        {
            #[cfg(windows)]
            let embedded_target = self
                .embedded_surface
                .as_ref()
                .map(|surface| surface.hwnd_u64());
            #[cfg(target_os = "linux")]
            let embedded_target = self.embedded_surface_parent;

            // mpv may recreate video output after runtime option changes
            // (e.g., buffering/hwdec), so immediately reassert embedded target.
            if let Some(target_wid) = embedded_target {
                self.command(&["set", "force-window", "no"], "set force-window")?;
                self.set_wid(target_wid)?;
            }
        }

        Ok(())
    }

    fn start_embedded_surface_mode(
        &mut self,
        parent_hwnd: u64,
        bounds: EmbeddedSurfaceBounds,
    ) -> Result<u64, String> {
        #[cfg(windows)]
        {
            use windows_surface::EmbeddedSurfaceBounds as HostBounds;

            self.embedded_surface = None;
            let host = EmbeddedSurfaceHost::create(
                parent_hwnd,
                HostBounds {
                    x: bounds.x,
                    y: bounds.y,
                    width: bounds.width,
                    height: bounds.height,
                },
            )?;
            let surface_hwnd = host.hwnd_u64();
            self.command(&["set", "force-window", "no"], "set force-window")?;
            self.set_wid(surface_hwnd)?;
            self.embedded_surface = Some(host);
            return Ok(surface_hwnd);
        }

        #[cfg(target_os = "linux")]
        {
            let _ = bounds;
            if parent_hwnd == 0 {
                return Err("cannot attach embedded surface to window id 0".to_string());
            }
            self.command(&["set", "force-window", "no"], "set force-window")?;
            self.set_wid(parent_hwnd)?;
            self.embedded_surface_parent = Some(parent_hwnd);
            Ok(parent_hwnd)
        }

        #[cfg(not(any(windows, target_os = "linux")))]
        {
            let _ = parent_hwnd;
            let _ = bounds;
            Err("embedded surface mode is currently implemented only on Windows".to_string())
        }
    }

    fn update_embedded_surface_bounds(
        &mut self,
        bounds: EmbeddedSurfaceBounds,
    ) -> Result<(), String> {
        #[cfg(windows)]
        {
            use windows_surface::EmbeddedSurfaceBounds as HostBounds;

            if let Some(surface) = self.embedded_surface.as_ref() {
                return surface.set_bounds(HostBounds {
                    x: bounds.x,
                    y: bounds.y,
                    width: bounds.width,
                    height: bounds.height,
                });
            }
            return Err("embedded surface mode is not active".to_string());
        }

        #[cfg(target_os = "linux")]
        {
            let _ = bounds;
            if self.embedded_surface_parent.is_none() {
                return Err("embedded surface mode is not active".to_string());
            }
            Ok(())
        }

        #[cfg(not(any(windows, target_os = "linux")))]
        {
            let _ = bounds;
            Err("embedded surface mode is currently implemented only on Windows".to_string())
        }
    }

    fn stop_embedded_surface_mode(&mut self) -> Result<(), String> {
        let _ = self.clear_wid();
        #[cfg(windows)]
        {
            self.embedded_surface = None;
        }
        #[cfg(target_os = "linux")]
        {
            self.embedded_surface_parent = None;
        }
        self.command(&["set", "force-window", "no"], "set force-window")
    }
}

#[cfg(any(windows, target_os = "linux"))]
impl Drop for MpvPlaybackBackend {
    fn drop(&mut self) {
        if !self.handle.is_null() {
            unsafe {
                (self.api.mpv_terminate_destroy)(self.handle);
            }
            self.handle = std::ptr::null_mut();
        }
    }
}

#[cfg(any(windows, target_os = "linux"))]
#[repr(C)]
struct mpv_handle {
    _unused: [u8; 0],
}

#[cfg(any(windows, target_os = "linux"))]
struct MpvApi {
    _library: libloading::Library,
    mpv_create: unsafe extern "C" fn() -> *mut mpv_handle,
    mpv_initialize: unsafe extern "C" fn(ctx: *mut mpv_handle) -> i32,
    mpv_terminate_destroy: unsafe extern "C" fn(ctx: *mut mpv_handle),
    mpv_set_option_string:
        unsafe extern "C" fn(ctx: *mut mpv_handle, name: *const c_char, data: *const c_char) -> i32,
    mpv_command: unsafe extern "C" fn(ctx: *mut mpv_handle, args: *mut *const c_char) -> i32,
}

#[cfg(any(windows, target_os = "linux"))]
impl MpvApi {
    fn load() -> Result<Self, String> {
        let library = load_mpv_library()?;
        let mpv_create = load_symbol(&library, b"mpv_create\0")?;
        let mpv_initialize = load_symbol(&library, b"mpv_initialize\0")?;
        let mpv_terminate_destroy = load_symbol(&library, b"mpv_terminate_destroy\0")?;
        let mpv_set_option_string = load_symbol(&library, b"mpv_set_option_string\0")?;
        let mpv_command = load_symbol(&library, b"mpv_command\0")?;

        Ok(Self {
            _library: library,
            mpv_create,
            mpv_initialize,
            mpv_terminate_destroy,
            mpv_set_option_string,
            mpv_command,
        })
    }
}

#[cfg(any(windows, target_os = "linux"))]
fn load_symbol<T: Copy>(library: &libloading::Library, symbol: &[u8]) -> Result<T, String> {
    unsafe {
        library
            .get::<T>(symbol)
            .map(|loaded| *loaded)
            .map_err(|err| format!("failed to load symbol `{}`: {err}", display_symbol(symbol)))
    }
}

#[cfg(any(windows, target_os = "linux"))]
fn display_symbol(symbol: &[u8]) -> String {
    let raw = symbol.strip_suffix(b"\0").unwrap_or(symbol);
    String::from_utf8_lossy(raw).to_string()
}

#[cfg(any(windows, target_os = "linux"))]
fn load_mpv_library() -> Result<libloading::Library, String> {
    let candidates = mpv_library_candidates();
    let mut errors: Vec<String> = Vec::new();
    for candidate in &candidates {
        let loaded = unsafe { libloading::Library::new(candidate) };
        match loaded {
            Ok(library) => return Ok(library),
            Err(err) => errors.push(format!("{}: {err}", candidate.to_string_lossy())),
        }
    }

    let tried = candidates
        .iter()
        .map(|candidate| candidate.to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join(", ");

    Err(format!(
        "could not load libmpv (tried: {tried}): {}",
        errors.join(" | ")
    ))
}

#[cfg(any(windows, target_os = "linux"))]
fn mpv_library_candidates() -> Vec<PathBuf> {
    #[cfg(target_os = "linux")]
    const MPV_LIBRARY_NAMES: &[&str] = &["libmpv.so.2", "libmpv.so"];
    #[cfg(windows)]
    const MPV_LIBRARY_NAMES: &[&str] = &["mpv-2.dll", "libmpv-2.dll", "mpv.dll"];

    let mut candidates: Vec<PathBuf> = MPV_LIBRARY_NAMES.iter().map(PathBuf::from).collect();

    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            #[cfg(windows)]
            let bundled_runtime_dir = exe_dir.join("resources").join("mpv").join("windows");
            #[cfg(target_os = "linux")]
            let bundled_runtime_dir = exe_dir.join("resources").join("mpv").join("linux");

            for name in MPV_LIBRARY_NAMES {
                candidates.push(exe_dir.join(name));
                candidates.push(exe_dir.join("resources").join(name));
                candidates.push(bundled_runtime_dir.join(name));
            }
        }
    }

    candidates
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    #[derive(Default)]
    struct FakeBackendState {
        fail_load_url: bool,
        fail_stop: bool,
        fail_pause: bool,
        fail_set_volume: bool,
        fail_set_fullscreen: bool,
        fail_seek: bool,
        fail_apply_preferences: bool,
        fail_start_embedded_surface_mode: bool,
        fail_update_embedded_surface_bounds: bool,
        fail_stop_embedded_surface_mode: bool,
        attached_hwnd: Option<u64>,
        loaded_url: Option<String>,
        paused: bool,
        volume: Option<f64>,
        fullscreen: Option<bool>,
        seek_seconds: Option<i64>,
        hwdec: Option<bool>,
        cache_seconds: Option<i64>,
        embedded_parent: Option<u64>,
        embedded_surface_hwnd: u64,
        embedded_bounds: Option<EmbeddedSurfaceBounds>,
    }

    struct FakeBackend {
        state: Arc<Mutex<FakeBackendState>>,
    }

    impl FakeBackend {
        fn new(state: Arc<Mutex<FakeBackendState>>) -> Self {
            Self { state }
        }
    }

    impl PlaybackBackend for FakeBackend {
        fn name(&self) -> &'static str {
            "fake-backend"
        }

        fn attach_window(&mut self, hwnd: u64) -> Result<(), String> {
            let mut state = self.state.lock().expect("state lock poisoned");
            state.attached_hwnd = Some(hwnd);
            Ok(())
        }

        fn load_url(&mut self, url: &str) -> Result<(), String> {
            let mut state = self.state.lock().expect("state lock poisoned");
            if state.fail_load_url {
                return Err("fake load_url failure".to_string());
            }
            state.loaded_url = Some(url.to_string());
            Ok(())
        }

        fn pause(&mut self, paused: bool) -> Result<(), String> {
            let mut state = self.state.lock().expect("state lock poisoned");
            if state.fail_pause {
                return Err("fake pause failure".to_string());
            }
            state.paused = paused;
            Ok(())
        }

        fn stop(&mut self) -> Result<(), String> {
            let state = self.state.lock().expect("state lock poisoned");
            if state.fail_stop {
                return Err("fake stop failure".to_string());
            }
            Ok(())
        }

        fn set_volume(&mut self, volume: f64) -> Result<(), String> {
            let mut state = self.state.lock().expect("state lock poisoned");
            if state.fail_set_volume {
                return Err("fake set_volume failure".to_string());
            }
            state.volume = Some(volume);
            Ok(())
        }

        fn set_fullscreen(&mut self, fullscreen: bool) -> Result<(), String> {
            let mut state = self.state.lock().expect("state lock poisoned");
            if state.fail_set_fullscreen {
                return Err("fake set_fullscreen failure".to_string());
            }
            state.fullscreen = Some(fullscreen);
            Ok(())
        }

        fn seek(&mut self, seconds: i64) -> Result<(), String> {
            let mut state = self.state.lock().expect("state lock poisoned");
            if state.fail_seek {
                return Err("fake seek failure".to_string());
            }
            state.seek_seconds = Some(seconds);
            Ok(())
        }

        fn apply_preferences(
            &mut self,
            hardware_decode: bool,
            cache_seconds: i64,
        ) -> Result<(), String> {
            let mut state = self.state.lock().expect("state lock poisoned");
            if state.fail_apply_preferences {
                return Err("fake apply_preferences failure".to_string());
            }
            state.hwdec = Some(hardware_decode);
            state.cache_seconds = Some(cache_seconds);
            Ok(())
        }

        fn start_embedded_surface_mode(
            &mut self,
            parent_hwnd: u64,
            bounds: EmbeddedSurfaceBounds,
        ) -> Result<u64, String> {
            let mut state = self.state.lock().expect("state lock poisoned");
            if state.fail_start_embedded_surface_mode {
                return Err("fake start_embedded_surface_mode failure".to_string());
            }
            state.embedded_parent = Some(parent_hwnd);
            state.embedded_bounds = Some(bounds);
            Ok(state.embedded_surface_hwnd)
        }

        fn update_embedded_surface_bounds(
            &mut self,
            bounds: EmbeddedSurfaceBounds,
        ) -> Result<(), String> {
            let mut state = self.state.lock().expect("state lock poisoned");
            if state.fail_update_embedded_surface_bounds {
                return Err("fake update_embedded_surface_bounds failure".to_string());
            }
            state.embedded_bounds = Some(bounds);
            Ok(())
        }

        fn stop_embedded_surface_mode(&mut self) -> Result<(), String> {
            let mut state = self.state.lock().expect("state lock poisoned");
            if state.fail_stop_embedded_surface_mode {
                return Err("fake stop_embedded_surface_mode failure".to_string());
            }
            state.embedded_parent = None;
            Ok(())
        }
    }

    fn create_engine_with_fake_backend() -> (PlaybackEngine, Arc<Mutex<FakeBackendState>>) {
        let state = Arc::new(Mutex::new(FakeBackendState {
            embedded_surface_hwnd: 4242,
            ..FakeBackendState::default()
        }));
        let backend = Box::new(FakeBackend::new(state.clone()));
        (PlaybackEngine::with_backend_for_tests(backend), state)
    }

    #[test]
    fn load_url_transitions_to_playing_and_sets_current_url() {
        let (mut engine, _) = create_engine_with_fake_backend();
        engine
            .load_url("https://stream.example/channel.m3u8")
            .expect("load should succeed");
        let status = engine.status();
        assert!(matches!(status.state, PlaybackState::Playing));
        assert_eq!(
            status.current_url.as_deref(),
            Some("https://stream.example/channel.m3u8")
        );
        assert_eq!(status.last_error, None);
    }

    #[test]
    fn load_url_failure_sets_error_state_and_message() {
        let (mut engine, backend_state) = create_engine_with_fake_backend();
        {
            let mut state = backend_state.lock().expect("state lock poisoned");
            state.fail_load_url = true;
        }

        let err = engine
            .load_url("https://stream.example/fail.m3u8")
            .expect_err("load should fail");
        assert!(err.contains("fake load_url failure"));

        let status = engine.status();
        assert!(matches!(status.state, PlaybackState::Error));
        assert!(status
            .last_error
            .as_deref()
            .expect("last_error expected")
            .contains("fake load_url failure"));
    }

    #[test]
    fn pause_updates_playback_state() {
        let (mut engine, _) = create_engine_with_fake_backend();
        engine.pause(true).expect("pause should succeed");
        assert!(matches!(engine.status().state, PlaybackState::Paused));
        engine.pause(false).expect("resume should succeed");
        assert!(matches!(engine.status().state, PlaybackState::Playing));
    }

    #[test]
    fn stop_is_non_fatal_even_when_backend_fails() {
        let (mut engine, backend_state) = create_engine_with_fake_backend();
        engine
            .load_url("https://stream.example/live.m3u8")
            .expect("load should succeed");
        {
            let mut state = backend_state.lock().expect("state lock poisoned");
            state.fail_stop = true;
        }
        engine.stop().expect("stop should not fail");
        let status = engine.status();
        assert!(matches!(status.state, PlaybackState::Stopped));
        assert_eq!(status.current_url, None);
        assert!(status
            .last_error
            .as_deref()
            .expect("last_error expected")
            .contains("playback stop warning"));
    }

    #[test]
    fn set_volume_clamps_to_valid_range() {
        let (mut engine, backend_state) = create_engine_with_fake_backend();
        engine.set_volume(150.0).expect("set_volume should succeed");
        assert_eq!(engine.status().volume, 100.0);

        let state = backend_state.lock().expect("state lock poisoned");
        assert_eq!(state.volume, Some(100.0));
    }

    #[test]
    fn embedded_surface_mode_updates_status_and_then_resets() {
        let (mut engine, backend_state) = create_engine_with_fake_backend();
        let surface_hwnd = engine
            .start_embedded_surface_mode(
                1001,
                EmbeddedSurfaceBounds {
                    x: 10,
                    y: 20,
                    width: 800,
                    height: 450,
                },
            )
            .expect("start_embedded_surface_mode should succeed");
        assert_eq!(surface_hwnd, 4242);

        let status = engine.status();
        assert_eq!(status.render_mode, PlaybackRenderMode::EmbeddedSurface);
        assert_eq!(status.attached_hwnd, Some(1001));
        assert_eq!(status.embedded_surface_hwnd, Some(4242));

        engine
            .update_embedded_surface_bounds(EmbeddedSurfaceBounds {
                x: 0,
                y: 0,
                width: 640,
                height: 360,
            })
            .expect("update_embedded_surface_bounds should succeed");

        engine
            .stop_embedded_surface_mode()
            .expect("stop_embedded_surface_mode should succeed");
        let status = engine.status();
        assert_eq!(status.render_mode, PlaybackRenderMode::ExternalWindow);
        assert_eq!(status.embedded_surface_hwnd, None);

        let state = backend_state.lock().expect("state lock poisoned");
        assert_eq!(state.embedded_parent, None);
    }

    #[test]
    fn set_fullscreen_skips_backend_call_in_embedded_mode() {
        let (mut engine, backend_state) = create_engine_with_fake_backend();
        engine
            .start_embedded_surface_mode(
                42,
                EmbeddedSurfaceBounds {
                    x: 0,
                    y: 0,
                    width: 100,
                    height: 100,
                },
            )
            .expect("start_embedded_surface_mode should succeed");

        engine
            .set_fullscreen(true)
            .expect("set_fullscreen should succeed");
        assert!(engine.status().fullscreen);

        let state = backend_state.lock().expect("state lock poisoned");
        assert_eq!(state.fullscreen, None);
    }
}
