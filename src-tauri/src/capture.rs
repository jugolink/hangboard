//! Freezing the screen and cutting a rectangle out of the frozen frame.
//!
//! The selection overlay shows a *still image* of the desktop rather than the
//! live screen. That is what makes region picking feel solid: windows cannot
//! repaint, notifications cannot slide in, and the user can take their time.
//! The crop is then taken from the same bitmap, so what was selected is
//! exactly what gets saved.

use crate::state::CaptureBuf;
use image::RgbaImage;

/// Grab the primary monitor into memory. Returns the pixels plus where the
/// monitor sits in the physical desktop, which the overlay needs in order to
/// map a selection back to pixels.
pub fn freeze_primary() -> Result<CaptureBuf, String> {
    let monitors = xcap::Monitor::all().map_err(|e| e.to_string())?;
    let monitor = monitors
        .iter()
        .find(|m| m.is_primary().unwrap_or(false))
        .or_else(|| monitors.first())
        .ok_or_else(|| "no monitor found".to_string())?;

    freeze_monitor(monitor)
}

/// Grab the monitor currently under the cursor into memory, falling back to primary.
pub fn freeze_current(cursor_x: i32, cursor_y: i32) -> Result<CaptureBuf, String> {
    let monitors = xcap::Monitor::all().map_err(|e| e.to_string())?;
    let monitor = monitors
        .iter()
        .find(|m| {
            let x = m.x().unwrap_or(0);
            let y = m.y().unwrap_or(0);
            let w = m.width().unwrap_or(0) as i32;
            let h = m.height().unwrap_or(0) as i32;
            cursor_x >= x && cursor_x < x + w && cursor_y >= y && cursor_y < y + h
        })
        .or_else(|| monitors.iter().find(|m| m.is_primary().unwrap_or(false)))
        .or_else(|| monitors.first())
        .ok_or_else(|| "no monitor found".to_string())?;

    freeze_monitor(monitor)
}

fn freeze_monitor(monitor: &xcap::Monitor) -> Result<CaptureBuf, String> {
    let image = monitor.capture_image().map_err(|e| e.to_string())?;

    Ok(CaptureBuf {
        width: image.width(),
        height: image.height(),
        rgba: image.into_raw(),
        origin_x: monitor.x().unwrap_or(0),
        origin_y: monitor.y().unwrap_or(0),
    })
}

/// Cut a rectangle out of a frozen frame.
///
/// `rect` is in logical (CSS) pixels relative to the overlay window; `factor`
/// converts those to the frame's physical pixels. The rectangle is clamped to
/// the frame so a sloppy drag near the edge cannot panic on a slice out of
/// bounds.
pub fn crop(buf: &CaptureBuf, rect: (f64, f64, f64, f64), factor: f64) -> Option<RgbaImage> {
    let (x, y, w, h) = rect;
    let x = (x * factor).round().max(0.0) as u32;
    let y = (y * factor).round().max(0.0) as u32;
    let w = (w * factor).round().max(1.0) as u32;
    let h = (h * factor).round().max(1.0) as u32;

    if x >= buf.width || y >= buf.height {
        return None;
    }
    let w = w.min(buf.width - x);
    let h = h.min(buf.height - y);
    if w == 0 || h == 0 {
        return None;
    }

    let mut out = Vec::with_capacity((w as usize) * (h as usize) * 4);
    for row in y..(y + h) {
        let start = ((row as usize) * (buf.width as usize) + x as usize) * 4;
        out.extend_from_slice(&buf.rgba[start..start + (w as usize) * 4]);
    }

    RgbaImage::from_raw(w, h, out)
}

/// The portion of the frozen frame currently under the pointer, used by
/// "capture the whole monitor" so a full-screen grab still runs through the
/// same ingest path as a selection.
pub fn whole(buf: &CaptureBuf) -> Option<RgbaImage> {
    RgbaImage::from_raw(buf.width, buf.height, buf.rgba.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn buf(w: u32, h: u32) -> CaptureBuf {
        CaptureBuf {
            width: w,
            height: h,
            rgba: vec![7u8; (w * h * 4) as usize],
            origin_x: 0,
            origin_y: 0,
        }
    }

    #[test]
    fn crop_takes_the_requested_window() {
        let cut = crop(&buf(100, 50), (10.0, 5.0, 20.0, 10.0), 1.0).unwrap();
        assert_eq!((cut.width(), cut.height()), (20, 10));
    }

    #[test]
    fn crop_clamps_oversized_selection() {
        let cut = crop(&buf(100, 50), (90.0, 40.0, 400.0, 400.0), 1.0).unwrap();
        assert_eq!((cut.width(), cut.height()), (10, 10));
    }

    #[test]
    fn crop_scales_logical_to_physical() {
        let cut = crop(&buf(200, 100), (10.0, 10.0, 20.0, 10.0), 2.0).unwrap();
        assert_eq!((cut.width(), cut.height()), (40, 20));
    }

    #[test]
    fn crop_rejects_offscreen_start() {
        assert!(crop(&buf(100, 50), (200.0, 0.0, 10.0, 10.0), 1.0).is_none());
    }
}
