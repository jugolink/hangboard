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

use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::time::Duration;

use tauri::AppHandle;

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

/// Read the clipboard as an image, rejecting anything absurdly large.
///
/// `get_image` only succeeds when the clipboard holds a bitmap, so a text or
/// file copy is naturally ignored — no format sniffing needed.
fn read_image() -> Option<image::RgbaImage> {
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

            let Some(img) = read_image() else {
                continue;
            };

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
