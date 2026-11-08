//! The line's contents: turning pixels into an item, keeping items across
//! restarts, copying one back out, and taking one down.
//!
//! Everything here is deliberately synchronous and free of Tauri types so it
//! can be unit tested without a running app.

use crate::state::Item;
use image::RgbaImage;
use std::path::{Path, PathBuf};

pub const SHOTS_DIR: &str = "shots";
pub const INDEX_FILE: &str = "line.json";

/// Where a single item's full-size PNG lives.
///
/// `dir` is the screenshots directory itself (see `crate::shots_dir`): the
/// index lives beside the app data, the pixels live here.
pub fn shot_path(dir: &Path, id: &str) -> PathBuf {
    dir.join(format!("{id}.png"))
}

fn ensure_dirs(dir: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dir)
}

/// A tilt derived from the id: stable across restarts, different per photo.
///
/// A real random number would make photos jump every time the app starts.
/// Hashing the id keeps the angle a photo was hung at.
pub fn tilt_for(id: &str) -> f64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in id.as_bytes() {
        h ^= *b as u64;
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    // Map the hash onto -2.5..2.5 degrees.
    let unit = (h % 10_000) as f64 / 10_000.0;
    (unit * 5.0 - 2.5).clamp(-2.5, 2.5)
}

/// Monotonic-ish id that also sorts by time, so "oldest" is a plain string
/// comparison.
pub fn new_id(now_millis: u128) -> String {
    static COUNTER: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
    let n = COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    format!("{now_millis:013}-{n:03}")
}

/// Encode a thumbnail as a data URL.
///
/// Data URLs keep the webview free of filesystem permissions: no asset
/// protocol, no scope config, just bytes in a `src`. Thumbnails are a couple
/// of hundred KB at most, so the size is fine.
fn data_url(img: &RgbaImage) -> Result<String, String> {
    let mut png = Vec::new();
    let encoder = image::codecs::png::PngEncoder::new(&mut png);
    image::ImageEncoder::write_image(
        encoder,
        img.as_raw(),
        img.width(),
        img.height(),
        image::ExtendedColorType::Rgba8,
    )
    .map_err(|e| e.to_string())?;

    use base64::Engine;
    Ok(format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(png)
    ))
}

/// Shrink for display. Aspect ratio is preserved, so a tall screenshot and a
/// wide one both fit the same card height.
pub fn thumbnail(img: &RgbaImage, max_height: u32) -> RgbaImage {
    if img.height() <= max_height {
        return img.clone();
    }
    let ratio = max_height as f64 / img.height() as f64;
    let w = ((img.width() as f64 * ratio).round() as u32).max(1);
    image::imageops::resize(img, w, max_height, image::imageops::FilterType::Lanczos3)
}

/// Save the pixels and return the item to hang.
pub fn ingest(img: RgbaImage, dir: &Path, now_millis: u128, thumb_h: u32) -> Result<Item, String> {
    ensure_dirs(dir).map_err(|e| e.to_string())?;

    let id = new_id(now_millis);
    let path = shot_path(dir, &id);

    img.save_with_format(&path, image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;

    let aspect = if img.height() == 0 {
        1.0
    } else {
        img.width() as f64 / img.height() as f64
    };
    let thumb = data_url(&thumbnail(&img, thumb_h))?;
    let tilt = tilt_for(&id);

    Ok(Item {
        path: path.to_string_lossy().to_string(),
        thumb,
        tilt,
        aspect,
        kept: false,
        added_at: now_millis as i64,
        id,
    })
}

/// Rebuild the thumbnail list from disk after a restart.
///
/// Items whose file disappeared are dropped rather than shown as broken
/// cards; the user may well have deleted them in Explorer, and a screenshot
/// tool that fights the filesystem is worse than one that gives way.
pub fn load_items(root: &Path, thumb_h: u32) -> Vec<Item> {
    let raw = match std::fs::read_to_string(root.join(INDEX_FILE)) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    let saved: Vec<Item> = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };

    saved
        .into_iter()
        .filter_map(|mut item| {
            let path = PathBuf::from(&item.path);
            let img = image::open(&path).ok()?.to_rgba8();
            item.aspect = if img.height() == 0 {
                1.0
            } else {
                img.width() as f64 / img.height() as f64
            };
            item.thumb = data_url(&thumbnail(&img, thumb_h)).ok()?;
            Some(item)
        })
        .collect()
}

pub fn save_items(root: &Path, items: &[Item]) -> Result<(), String> {
    let json = serde_json::to_string(items).map_err(|e| e.to_string())?;
    std::fs::write(root.join(INDEX_FILE), json).map_err(|e| e.to_string())
}

/// Put an item back on the clipboard as a real image.
pub fn copy_to_clipboard(item: &Item) -> Result<(), String> {
    let img = image::open(&item.path)
        .map_err(|e| e.to_string())?
        .to_rgba8();
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    clipboard
        .set_image(arboard::ImageData {
            width: img.width() as usize,
            height: img.height() as usize,
            bytes: std::borrow::Cow::Owned(img.into_raw()),
        })
        .map_err(|e| e.to_string())?;
    // Tell the clipboard watcher this bump is ours, so it does not hang the
    // image right back onto the line.
    crate::clipboard::mark_own_write();
    Ok(())
}

/// Delete the pixels behind an item.
///
/// Only files under our own screenshots directory are removed. Anything else
/// was never ours to delete.
pub fn delete_file(dir: &Path, item: &Item) {
    let path = Path::new(&item.path);
    if path.starts_with(dir) {
        let _ = std::fs::remove_file(path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A scratch directory inside the build tree.
    ///
    /// Not `std::env::temp_dir()`: on a sandboxed CI runner, and on this
    /// development machine, a test binary may be denied writes outside the
    /// checkout. `target/` is always ours and always ignored by git.
    fn scratch(label: &str) -> PathBuf {
        let dir = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("target")
            .join("test-scratch")
            .join(format!("{label}-{}", new_id(0)));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn img(w: u32, h: u32) -> RgbaImage {
        RgbaImage::from_pixel(w, h, image::Rgba([1, 2, 3, 255]))
    }

    #[test]
    fn tilt_is_stable_and_bounded() {
        let a = tilt_for("abc");
        assert_eq!(a, tilt_for("abc"));
        assert!((-2.5..=2.5).contains(&a));
        assert_ne!(tilt_for("abc"), tilt_for("abd"));
    }

    #[test]
    fn ids_sort_by_time() {
        assert!(new_id(1000) < new_id(2000));
    }

    #[test]
    fn thumbnail_keeps_aspect() {
        let t = thumbnail(&img(400, 100), 50);
        assert_eq!((t.width(), t.height()), (200, 50));
    }

    #[test]
    fn thumbnail_leaves_small_images_alone() {
        let t = thumbnail(&img(40, 10), 50);
        assert_eq!((t.width(), t.height()), (40, 10));
    }

    #[test]
    fn ingest_writes_a_png_and_reports_aspect() {
        let dir = scratch("ingest");
        let item = ingest(img(200, 100), &dir, 42, 50).unwrap();
        assert!(Path::new(&item.path).exists());
        assert!((item.aspect - 2.0).abs() < 0.001);
        assert!(item.thumb.starts_with("data:image/png;base64,"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn round_trip_through_the_index() {
        let dir = scratch("roundtrip");
        let item = ingest(img(200, 100), &dir, 42, 50).unwrap();
        save_items(&dir, std::slice::from_ref(&item)).unwrap();

        let loaded = load_items(&dir, 50);
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].id, item.id);
        assert!(loaded[0].thumb.starts_with("data:image/png;base64,"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn load_skips_items_whose_file_is_gone() {
        let dir = scratch("missing");
        let item = ingest(img(200, 100), &dir, 42, 50).unwrap();
        save_items(&dir, std::slice::from_ref(&item)).unwrap();
        std::fs::remove_file(&item.path).unwrap();

        assert!(load_items(&dir, 50).is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn delete_ignores_files_outside_the_shots_dir() {
        let dir = scratch("outside");
        let shots = dir.join(SHOTS_DIR);
        std::fs::create_dir_all(&shots).unwrap();
        let outside = dir.join("not-ours.png");
        std::fs::write(&outside, b"x").unwrap();

        let item = Item {
            id: "x".into(),
            path: outside.to_string_lossy().to_string(),
            thumb: String::new(),
            tilt: 0.0,
            aspect: 1.0,
            kept: false,
            added_at: 0,
        };
        delete_file(&shots, &item);
        assert!(outside.exists());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
