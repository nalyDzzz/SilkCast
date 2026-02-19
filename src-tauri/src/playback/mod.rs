use serde::{Deserialize, Serialize};
#[cfg(any(windows, target_os = "linux"))]
use std::ffi::{c_char, CString};
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
    fn update_embedded_surface_bounds(&mut self, bounds: EmbeddedSurfaceBounds)
        -> Result<(), String>;
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
            BackendKind::Active(backend) => backend.start_embedded_surface_mode(parent_hwnd, bounds),
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
            let option_name =
                CString::new(name).map_err(|err| format!("cstring error for option name: {err}"))?;
            let option_value =
                CString::new(value).map_err(|err| format!("cstring error for option value: {err}"))?;
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
}

#[cfg(any(windows, target_os = "linux"))]
impl PlaybackBackend for MpvPlaybackBackend {
    fn name(&self) -> &'static str {
        "libmpv"
    }

    fn attach_window(&mut self, hwnd: u64) -> Result<(), String> {
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
            stop_result.err().unwrap_or_else(|| "unknown stop error".to_string()),
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

        #[cfg(windows)]
        {
            // mpv may recreate video output after runtime option changes
            // (e.g., buffering/hwdec), so immediately reassert embedded target.
            if let Some(surface) = self.embedded_surface.as_ref() {
                self.command(&["set", "force-window", "no"], "set force-window")?;
                self.set_wid(surface.hwnd_u64())?;
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

        #[cfg(not(windows))]
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

        #[cfg(not(windows))]
        {
            let _ = bounds;
            Err("embedded surface mode is currently implemented only on Windows".to_string())
        }
    }

    fn stop_embedded_surface_mode(&mut self) -> Result<(), String> {
        let _ = self.set_wid(0);
        #[cfg(windows)]
        {
            self.embedded_surface = None;
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
    #[cfg(target_os = "linux")]
    const MPV_LIBRARY_CANDIDATES: &[&str] = &["libmpv.so.2", "libmpv.so"];
    #[cfg(windows)]
    const MPV_LIBRARY_CANDIDATES: &[&str] = &["mpv-2.dll", "libmpv-2.dll", "mpv.dll"];

    let mut errors: Vec<String> = Vec::new();
    for candidate in MPV_LIBRARY_CANDIDATES {
        let loaded = unsafe { libloading::Library::new(candidate) };
        match loaded {
            Ok(library) => return Ok(library),
            Err(err) => errors.push(format!("{candidate}: {err}")),
        }
    }

    Err(format!(
        "could not load libmpv (tried: {}): {}",
        MPV_LIBRARY_CANDIDATES.join(", "),
        errors.join(" | ")
    ))
}

