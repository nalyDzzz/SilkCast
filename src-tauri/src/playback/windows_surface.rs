use windows_sys::Win32::Foundation::GetLastError;
use windows_sys::Win32::Foundation::HWND;
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DestroyWindow, MoveWindow, SetWindowPos, HWND_TOP, SWP_NOACTIVATE,
    SWP_SHOWWINDOW, WS_CHILD, WS_CLIPSIBLINGS, WS_EX_NOPARENTNOTIFY, WS_VISIBLE,
};

#[cfg(debug_assertions)]
fn surface_debug_log(message: &str) {
    eprintln!("[embedded-surface] {message}");
}

#[cfg(not(debug_assertions))]
fn surface_debug_log(_message: &str) {}

#[derive(Clone, Copy, Debug)]
pub struct EmbeddedSurfaceBounds {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

pub struct EmbeddedSurfaceHost {
    hwnd: HWND,
}

impl EmbeddedSurfaceHost {
    pub fn create(parent_hwnd: u64, bounds: EmbeddedSurfaceBounds) -> Result<Self, String> {
        surface_debug_log(&format!(
            "create requested parent={parent_hwnd} x={} y={} w={} h={}",
            bounds.x, bounds.y, bounds.width, bounds.height
        ));
        if parent_hwnd == 0 {
            return Err("cannot create embedded surface with parent hwnd=0".to_string());
        }
        if bounds.width <= 0 || bounds.height <= 0 {
            return Err("embedded surface size must be positive".to_string());
        }

        let class_name: Vec<u16> = "STATIC\0".encode_utf16().collect();
        let hwnd = unsafe {
            CreateWindowExW(
                WS_EX_NOPARENTNOTIFY,
                class_name.as_ptr(),
                std::ptr::null(),
                WS_CHILD | WS_VISIBLE | WS_CLIPSIBLINGS,
                bounds.x,
                bounds.y,
                bounds.width,
                bounds.height,
                parent_hwnd as HWND,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null(),
            )
        };

        if hwnd.is_null() {
            let error = format!(
                "failed to create embedded playback surface (Win32 error {})",
                unsafe { GetLastError() }
            );
            surface_debug_log(&error);
            return Err(error);
        }

        unsafe {
            SetWindowPos(
                hwnd,
                HWND_TOP,
                bounds.x,
                bounds.y,
                bounds.width,
                bounds.height,
                SWP_NOACTIVATE | SWP_SHOWWINDOW,
            );
        }

        surface_debug_log(&format!("create ok hwnd={}", hwnd as usize));
        Ok(Self { hwnd })
    }

    pub fn hwnd_u64(&self) -> u64 {
        self.hwnd as u64
    }

    pub fn set_bounds(&self, bounds: EmbeddedSurfaceBounds) -> Result<(), String> {
        surface_debug_log(&format!(
            "move requested hwnd={} x={} y={} w={} h={}",
            self.hwnd as usize, bounds.x, bounds.y, bounds.width, bounds.height
        ));
        if bounds.width <= 0 || bounds.height <= 0 {
            return Err("embedded surface size must be positive".to_string());
        }

        let moved = unsafe {
            MoveWindow(
                self.hwnd,
                bounds.x,
                bounds.y,
                bounds.width,
                bounds.height,
                1,
            )
        };

        if moved == 0 {
            let error = format!(
                "failed to move embedded playback surface (Win32 error {})",
                unsafe { GetLastError() }
            );
            surface_debug_log(&error);
            return Err(error);
        }

        unsafe {
            SetWindowPos(
                self.hwnd,
                HWND_TOP,
                bounds.x,
                bounds.y,
                bounds.width,
                bounds.height,
                SWP_NOACTIVATE | SWP_SHOWWINDOW,
            );
        }

        surface_debug_log(&format!("move ok hwnd={}", self.hwnd as usize));
        Ok(())
    }
}

impl Drop for EmbeddedSurfaceHost {
    fn drop(&mut self) {
        if !self.hwnd.is_null() {
            surface_debug_log(&format!("destroy hwnd={}", self.hwnd as usize));
            unsafe {
                DestroyWindow(self.hwnd);
            }
            self.hwnd = std::ptr::null_mut();
        }
    }
}
