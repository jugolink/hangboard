//! Watch the system clipboard and hang any new image on the line.
//!
//! Windows has no "the clipboard changed" event, so this polls the same way
//! Tendedero polls `NSPasteboard.changeCount`: read the clipboard's sequence
//! number, and only look for an image when it has moved.
//!
//! The sequence number comes straight from `GetClipboardSequenceNumber`:
//! every successful clipboard write bumps a system-wide counter by one. That
//! is exactly `changeCount` on macOS, and it is what lets us distinguish
//! "some app copied a picture" from "we just put a picture back out".

use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::time::Duration;

use tauri::{AppHandle, Manager};

/// Cap what we are willing to copy out: 80 megapixels and 64 MiB of decoded
/// RGBA bytes, matching Tendedero's guards against a pathological clipboard.
const MAX_PIXELS: usize = 80_000_000;
const MAX_BYTES: usize = 64 * 1024 * 1024;

/// Poll interval. Tendedero polls at 0.5 s; that is plenty for a clipboard
/// that the user fills by hand.
const TICK: Duration = Duration::from_millis(500);

/// Sequence number of the most recent write *we* made. The watcher skips
/// this one so copying a photo back out does not immediately re-hang it.
static OWN_SEQ: AtomicU32 = AtomicU32::new(0);

/// Signature of the most recent image processed by the clipboard watcher.
static LAST_CLIPBOARD_HASH: AtomicU64 = AtomicU64::new(0);

pub fn reset_last_hash() {
    LAST_CLIPBOARD_HASH.store(0, Ordering::SeqCst);
}

/// Whether the watcher thread is already running.
static RUNNING: AtomicBool = AtomicBool::new(false);

#[cfg(windows)]
#[link(name = "user32")]
extern "system" {
    #[link_name = "GetClipboardSequenceNumber"]
    fn get_clipboard_sequence_number() -> u32;
}

#[cfg(windows)]
fn seq() -> u32 {
    unsafe { get_clipboard_sequence_number() }
}

#[cfg(not(windows))]
fn seq() -> u32 {
    0
}

/// Record that we just wrote the clipboard, so the watcher does not hang our
/// own copy back onto the line. Call this *after* a successful `set_image`.
pub fn mark_own_write() {
    OWN_SEQ.store(seq(), Ordering::SeqCst);
}

/// Reject anything over the pixel and byte caps. Split out so the guard is
/// unit-testable without a live clipboard.
fn too_big(width: usize, height: usize, byte_len: usize) -> bool {
    width.saturating_mul(height) > MAX_PIXELS || byte_len > MAX_BYTES
}

#[cfg(windows)]
fn read_windows_clipboard() -> Option<image::RgbaImage> {
    use std::ffi::c_void;
    use std::ptr;

    type HWND = *mut c_void;
    type HANDLE = *mut c_void;
    type HGLOBAL = *mut c_void;
    type UINT = u32;
    type BOOL = i32;

    const CF_HDROP: UINT = 15;

    #[link(name = "user32")]
    extern "system" {
        fn OpenClipboard(hWndNewOwner: HWND) -> BOOL;
        fn CloseClipboard() -> BOOL;
        fn IsClipboardFormatAvailable(format: UINT) -> BOOL;
        fn GetClipboardData(uFormat: UINT) -> HANDLE;
        fn RegisterClipboardFormatW(lpszFormat: *const u16) -> UINT;
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn GlobalLock(hMem: HGLOBAL) -> *mut c_void;
        fn GlobalUnlock(hMem: HGLOBAL) -> BOOL;
        fn GlobalSize(hMem: HGLOBAL) -> usize;
    }

    #[link(name = "shell32")]
    extern "system" {
        fn DragQueryFileW(hDrop: HANDLE, iFile: UINT, lpszFile: *mut u16, cch: UINT) -> UINT;
    }

    fn to_wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    let png_wide = to_wide("PNG");
    let image_png_wide = to_wide("image/png");

    unsafe {
        let fmt_png = RegisterClipboardFormatW(png_wide.as_ptr());
        let fmt_image_png = RegisterClipboardFormatW(image_png_wide.as_ptr());

        if OpenClipboard(ptr::null_mut()) == 0 {
            return None;
        }

        struct ClipGuard;
        impl Drop for ClipGuard {
            fn drop(&mut self) {
                unsafe {
                    CloseClipboard();
                }
            }
        }
        let _guard = ClipGuard;

        // 1. Try registered PNG format (used by PixPin, Snipaste, browsers, Electron apps)
        let target_fmt = if fmt_png != 0 && IsClipboardFormatAvailable(fmt_png) != 0 {
            Some(fmt_png)
        } else if fmt_image_png != 0 && IsClipboardFormatAvailable(fmt_image_png) != 0 {
            Some(fmt_image_png)
        } else {
            None
        };

        if let Some(fmt) = target_fmt {
            let handle = GetClipboardData(fmt);
            if !handle.is_null() {
                let size = GlobalSize(handle);
                if size > 0 && size <= MAX_BYTES {
                    let ptr = GlobalLock(handle);
                    if !ptr.is_null() {
                        let slice = std::slice::from_raw_parts(ptr as *const u8, size);
                        let bytes = slice.to_vec();
                        GlobalUnlock(handle);
                        if let Ok(dyn_img) = image::load_from_memory(&bytes) {
                            let rgba = dyn_img.to_rgba8();
                            let w = rgba.width() as usize;
                            let h = rgba.height() as usize;
                            if !too_big(w, h, w.saturating_mul(h).saturating_mul(4)) {
                                return Some(rgba);
                            }
                        }
                    }
                }
            }
        }

        // 2. Try CF_HDROP (copied image file / PixPin "Copy as file" / explorer copy)
        if IsClipboardFormatAvailable(CF_HDROP) != 0 {
            let handle = GetClipboardData(CF_HDROP);
            if !handle.is_null() {
                let count = DragQueryFileW(handle, 0xFFFF_FFFF, ptr::null_mut(), 0);
                if count > 0 {
                    let mut buf = [0u16; 1024];
                    let len = DragQueryFileW(handle, 0, buf.as_mut_ptr(), buf.len() as u32);
                    if len > 0 {
                        let path_str = String::from_utf16_lossy(&buf[..len as usize]);
                        let path = std::path::Path::new(&path_str);
                        if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                            let ext_lower = ext.to_ascii_lowercase();
                            if matches!(
                                ext_lower.as_str(),
                                "png" | "jpg" | "jpeg" | "webp" | "bmp" | "gif"
                            ) {
                                if let Ok(data) = std::fs::read(path) {
                                    if data.len() <= MAX_BYTES {
                                        if let Ok(dyn_img) = image::load_from_memory(&data) {
                                            let rgba = dyn_img.to_rgba8();
                                            let w = rgba.width() as usize;
                                            let h = rgba.height() as usize;
                                            if !too_big(w, h, w.saturating_mul(h).saturating_mul(4))
                                            {
                                                return Some(rgba);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    None
}

/// Read the clipboard as an image, rejecting anything absurdly large.
fn read_image() -> Option<image::RgbaImage> {
    #[cfg(windows)]
    {
        if let Some(img) = read_windows_clipboard() {
            return Some(img);
        }
    }

    let mut clipboard = arboard::Clipboard::new().ok()?;
    let data = clipboard.get_image().ok()?;

    if too_big(data.width, data.height, data.bytes.len()) {
        return None;
    }

    let bytes = data.bytes.into_owned();
    image::RgbaImage::from_raw(data.width as u32, data.height as u32, bytes)
}

/// Start the clipboard watcher. Safe to call twice; the second call is a no-op.
pub fn spawn(app: AppHandle) {
    if RUNNING.swap(true, Ordering::SeqCst) {
        return;
    }

    std::thread::spawn(move || {
        let mut last = seq();
        loop {
            std::thread::sleep(TICK);

            let cur = seq();
            if cur == last {
                continue;
            }
            last = cur;

            // Our own copy-out bumps the sequence number too; never re-hang it.
            if cur == OWN_SEQ.load(Ordering::SeqCst) {
                continue;
            }

            // Only when the user has opted in via the tray.
            let Ok(root) = crate::data_root(&app) else {
                continue;
            };
            if !crate::settings::Settings::load(&root).hang_clipboard {
                continue;
            }

            // Try up to 6 times with 40ms sleep in case the writing app
            // (e.g. PixPin, Snipaste) still holds the clipboard lock.
            let mut img = None;
            for _ in 0..6 {
                if let Some(i) = read_image() {
                    img = Some(i);
                    break;
                }
                std::thread::sleep(Duration::from_millis(40));
            }

            let Some(img) = img else {
                continue;
            };

            let hash = crate::line::image_hash(&img);
            let last_hash = LAST_CLIPBOARD_HASH.load(Ordering::SeqCst);
            if last_hash == hash && hash != 0 {
                let still_on_line = app
                    .state::<crate::state::AppState>()
                    .inner
                    .lock()
                    .map(|inner| inner.items.iter().any(|i| i.hash == hash))
                    .unwrap_or(false);
                if still_on_line {
                    crate::reveal_on_new(&app);
                    continue;
                }
            }
            LAST_CLIPBOARD_HASH.store(hash, Ordering::SeqCst);

            if crate::hang(&app, img).is_ok() {
                crate::reveal_on_new(&app);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::too_big;

    #[test]
    fn rejects_oversized_pixel_counts_and_bytes() {
        assert!(too_big(80_000_001, 1, 4));
        assert!(!too_big(4000, 4000, 16));
        assert!(too_big(100, 100, 64 * 1024 * 1024 + 1));
        assert!(!too_big(100, 100, 64 * 1024 * 1024));
    }
}
