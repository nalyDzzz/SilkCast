//! What the frontend needs to know to pick and configure a player.

use serde::Serialize;
use std::ffi::OsStr;
use std::path::{Path, PathBuf};

use crate::stream_proxy::StreamProxy;

#[cfg(windows)]
const MPV_EXECUTABLE_NAMES: &[&str] = &["mpv.exe", "mpv.com", "mpv"];
#[cfg(not(windows))]
const MPV_EXECUTABLE_NAMES: &[&str] = &["mpv"];

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct PlayerEnvironment {
    /// `http://127.0.0.1:{port}/{token}`, or `None` if the proxy failed to start.
    pub stream_proxy_base_url: Option<String>,
    pub mpv_available: bool,
}

/// Managed Tauri state that owns the running stream proxy.
pub struct PlayerEnvironmentState {
    stream_proxy: Option<StreamProxy>,
}

impl PlayerEnvironmentState {
    pub fn new(stream_proxy: Option<StreamProxy>) -> Self {
        Self { stream_proxy }
    }

    pub fn snapshot(&self) -> PlayerEnvironment {
        PlayerEnvironment {
            stream_proxy_base_url: self
                .stream_proxy
                .as_ref()
                .map(|proxy| proxy.base_url().to_string()),
            mpv_available: is_mpv_on_path(),
        }
    }
}

/// Scans the process `PATH` for an mpv executable without spawning anything.
pub fn is_mpv_on_path() -> bool {
    std::env::var_os("PATH")
        .is_some_and(|path| find_executable_in_path(&path, MPV_EXECUTABLE_NAMES).is_some())
}

/// Returns the first `dir/name` that is an executable file, scanning `path_var`
/// entries in order and `names` in order within each entry.
pub fn find_executable_in_path(path_var: &OsStr, names: &[&str]) -> Option<PathBuf> {
    std::env::split_paths(path_var)
        .filter(|dir| !dir.as_os_str().is_empty())
        .find_map(|dir| {
            names
                .iter()
                .map(|name| dir.join(name))
                .find(|candidate| is_executable_file(candidate))
        })
}

#[cfg(unix)]
fn is_executable_file(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    path.metadata()
        .is_ok_and(|meta| meta.is_file() && meta.permissions().mode() & 0o111 != 0)
}

#[cfg(not(unix))]
fn is_executable_file(path: &Path) -> bool {
    path.is_file()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn make_temp_dir(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("silkcast-path-test-{label}-{nanos}"));
        fs::create_dir_all(&dir).expect("failed to create temp dir");
        dir
    }

    fn write_fake_executable(dir: &Path, name: &str) -> PathBuf {
        let path = dir.join(name);
        fs::write(&path, b"fake").expect("failed to write fake executable");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&path, fs::Permissions::from_mode(0o755))
                .expect("failed to mark fake executable");
        }
        path
    }

    #[test]
    fn find_executable_in_path_finds_mpv_in_later_entry() {
        let empty_dir = make_temp_dir("empty");
        let mpv_dir = make_temp_dir("mpv");
        let mpv_path = write_fake_executable(&mpv_dir, MPV_EXECUTABLE_NAMES[0]);
        let path_var =
            std::env::join_paths([empty_dir.clone(), mpv_dir.clone()]).expect("valid PATH");

        assert_eq!(
            find_executable_in_path(&path_var, MPV_EXECUTABLE_NAMES),
            Some(mpv_path)
        );

        let _ = fs::remove_dir_all(empty_dir);
        let _ = fs::remove_dir_all(mpv_dir);
    }

    #[test]
    fn find_executable_in_path_ignores_missing_files_and_directories() {
        let dir = make_temp_dir("dir-named-mpv");
        fs::create_dir_all(dir.join(MPV_EXECUTABLE_NAMES[0])).expect("failed to create dir");
        let path_var =
            std::env::join_paths([dir.clone(), dir.join("does-not-exist")]).expect("valid PATH");

        assert_eq!(
            find_executable_in_path(&path_var, MPV_EXECUTABLE_NAMES),
            None
        );
        assert_eq!(
            find_executable_in_path(OsStr::new(""), MPV_EXECUTABLE_NAMES),
            None
        );

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn snapshot_reports_missing_proxy_as_none() {
        let state = PlayerEnvironmentState::new(None);
        assert_eq!(state.snapshot().stream_proxy_base_url, None);

        let proxy = StreamProxy::start(None).expect("proxy should start");
        let base_url = proxy.base_url().to_string();
        let state = PlayerEnvironmentState::new(Some(proxy));
        assert_eq!(state.snapshot().stream_proxy_base_url, Some(base_url));
    }

    #[test]
    fn player_environment_serializes_with_snake_case_fields() {
        let value = serde_json::to_value(PlayerEnvironment {
            stream_proxy_base_url: None,
            mpv_available: true,
        })
        .unwrap();
        assert_eq!(
            value,
            serde_json::json!({ "stream_proxy_base_url": null, "mpv_available": true })
        );
    }
}
