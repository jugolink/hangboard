//! Shared state: the line's items, the transient capture buffer, and the
//! hit rectangles the webview reports so we can tell when the cursor is
//! really over a photo.

use serde::{Deserialize, Serialize};
use std::sync::Mutex;

/// One screenshot hanging on the line.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Item {
    pub id: String,
    /// Absolute path of the full-size PNG.
    pub path: String,
    /// Absolute path of the thumbnail the line actually renders.
    pub thumb: String,
    /// Degrees of tilt, randomised once at capture time so a photo keeps
    /// the angle it was hung at.
    pub tilt: f64,
    /// Width over height of the source image, used to size the card.
    pub aspect: f64,
    pub kept: bool,
    pub added_at: i64,
    #[serde(default)]
    pub hash: u64,
}

/// A screenshot held in memory between "freeze the screen" and "cut this
/// rectangle out of it". Keeping it here means the selection is cut from
/// the frame the user saw, not from whatever the screen looks like now.
#[derive(Clone)]
pub struct CaptureBuf {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
    /// Where this monitor sits in the physical desktop, so a crop taken in
    /// a window-relative selection maps back to the right pixels.
    pub origin_x: i32,
    pub origin_y: i32,
}

#[derive(Default)]
pub struct Inner {
    pub items: Vec<Item>,
    /// Window-relative rectangles of the photos, in logical pixels.
    pub hit_rects: Vec<(f64, f64, f64, f64)>,
    pub revealed: bool,
    /// When pinned is true, the line stays visible and does not retract on mouse leave.
    pub pinned: bool,
    /// Set while a photo is being dragged, so the hover loop stops fighting
    /// the pointer for the window's mouse state.
    pub dragging: bool,
    pub capture: Option<CaptureBuf>,
    /// Size multiplier from the Size menu (0.8 / 1.0 / 1.35).
    pub scale: f64,
    /// When set, the line was auto-revealed for a new capture and should stay
    /// visible until this timestamp, even if cursor is outside hot zone.
    pub auto_dismiss_at: Option<std::time::Instant>,
    /// Which photo the preview lightbox is showing, in display order
    /// (0 = leftmost / oldest on the line). `None` while the preview is
    /// closed.
    pub preview_index: Option<usize>,
    /// Which photo the context menu was opened for. `None` while closed.
    pub context_id: Option<String>,
}

impl Inner {
    pub fn new() -> Self {
        Self {
            scale: 1.0,
            ..Default::default()
        }
    }
}

pub struct AppState {
    pub inner: Mutex<Inner>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(Inner::new()),
        }
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

/// Geometry shared by the Rust side (which sizes the window) and the
/// webview (which lays the photos out). One source of truth so the hit
/// rectangles line up with what is actually drawn.
#[derive(Serialize, Clone, Copy)]
pub struct Geometry {
    pub photo_max_height: f64,
    pub card_width: f64,
    pub spacing: f64,
    pub panel_height: f64,
    pub rope_top: f64,
    pub pin_above: f64,
}

pub fn geometry(scale: f64) -> Geometry {
    let photo_max_height = (104.0 * scale).round();
    let card_width = (150.0 * scale).round();
    Geometry {
        photo_max_height,
        card_width,
        spacing: card_width + 24.0,
        panel_height: photo_max_height + 106.0,
        rope_top: 10.0,
        pin_above: 9.5,
    }
}
