//! The hot zone at the top edge of the screen, and the mouse pass-through
//! that keeps the line out of the way when the cursor is not on a photo.
//!
//! Windows has no notification for "the pointer arrived at the top of the
//! screen", so this polls. 30 Hz is what Tendedero uses: fast enough that the
//! line feels instantaneous, cheap enough not to show in the CPU graph.

use crate::state::AppState;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

/// How long the pointer must rest in the hot zone before the line drops.
const REVEAL_DELAY: Duration = Duration::from_millis(250);
/// How long it may stay away before the line retracts. Long enough to step
/// across the gap between two photos without the line snapping shut.
const RETRACT_DELAY: Duration = Duration::from_millis(500);
/// Height of the strip at the very top of the screen that counts as hot.
const ZONE_HEIGHT: f64 = 3.0;
const TICK: Duration = Duration::from_millis(33);

pub struct HoverState {
    inside_since: Mutex<Option<Instant>>,
    outside_since: Mutex<Option<Instant>>,
    running: AtomicBool,
    /// What the loop last asked the window for. `true` means click-through
    /// (the strip eats nothing). Cached so we only call the window manager
    /// when the answer actually flips, not on every 30 Hz tick.
    pass_through: AtomicBool,
    /// Whether resting the pointer at the top edge should drop the line. A
    /// cached copy of `settings.reveal_on_hover`, so the 30 Hz loop never
    /// touches disk.
    pub reveal_on_hover: AtomicBool,
    current_monitor_pos: Mutex<Option<(i32, i32)>>,
}

impl HoverState {
    pub fn new() -> Self {
        Self {
            inside_since: Mutex::new(None),
            outside_since: Mutex::new(None),
            running: AtomicBool::new(false),
            pass_through: AtomicBool::new(false),
            reveal_on_hover: AtomicBool::new(true),
            current_monitor_pos: Mutex::new(None),
        }
    }
}

impl Default for HoverState {
    fn default() -> Self {
        Self::new()
    }
}

/// Is the pointer in the reveal band of the monitor it is on?
///
/// Only the middle third of the width counts: the left third belongs to the
/// Start button and the right third to the tray, and hovering those should
/// open their menus, not the line.
pub fn in_zone(px: f64, py: f64, mon: &tauri::Monitor) -> bool {
    let pos = mon.position();
    let size = mon.size();
    let scale = mon.scale_factor();
    band(
        px,
        py,
        pos.y as f64,
        pos.x as f64,
        size.width as f64,
        size.height as f64,
        scale,
    )
}

#[allow(clippy::too_many_arguments)]
fn band(px: f64, py: f64, top: f64, left: f64, width: f64, height: f64, scale: f64) -> bool {
    if width <= 0.0 || height <= 0.0 {
        return false;
    }
    let in_band = py >= top && py < top + ZONE_HEIGHT * scale;
    let third = width / 3.0;
    let in_middle = px >= left + third && px < left + 2.0 * third;
    in_band && in_middle
}

/// Is the pointer over one of the photos?
///
/// The window is click-through except here. Without this the strip would
/// swallow clicks along the top edge of the screen, which is where title bars
/// and browser tabs live.
///
/// `hit_rects` are in window-relative CSS pixels while the pointer and the
/// window origin are physical, so the origin is converted before comparing.
pub fn over_photo(px: f64, py: f64, win_x: f64, win_y: f64, scale: f64, state: &AppState) -> bool {
    let Ok(inner) = state.inner.lock() else {
        return false;
    };
    // While retracted the window is lifted off-screen, so the hit rects the
    // front end last reported describe where the photos *were*, not where they
    // are. Matching those ghost rects would drop the line when the pointer
    // crosses empty screen — which is why the hot zone felt much taller than
    // the intended 3px edge strip.
    if !inner.revealed {
        return false;
    }
    let lx = px / scale - win_x / scale;
    let ly = py / scale - win_y / scale;
    const SLACK: f64 = 4.0;
    inner.hit_rects.iter().any(|&(x, y, w, h)| {
        lx >= x - SLACK && lx <= x + w + SLACK && ly >= y - SLACK && ly <= y + h + SLACK
    })
}

/// Start the polling loop. Safe to call twice; the second call is a no-op.
pub fn spawn(app: AppHandle) {
    if app
        .state::<HoverState>()
        .running
        .swap(true, Ordering::SeqCst)
    {
        return;
    }

    std::thread::spawn(move || loop {
        std::thread::sleep(TICK);

        let Some(window) = app.get_webview_window("line") else {
            continue;
        };
        let Ok(cursor) = app.cursor_position() else {
            continue;
        };
        let Ok(Some(mon)) = app.monitor_from_point(cursor.x, cursor.y) else {
            continue;
        };

        let scale = mon.scale_factor();
        let hover = app.state::<HoverState>();
        let state = app.state::<AppState>();
        let (revealed, dragging, pinned, auto_dismiss_at) = state
            .inner
            .lock()
            .map(|g| (g.revealed, g.dragging, g.pinned, g.auto_dismiss_at))
            .unwrap_or((false, false, false, None));

        // Multi-monitor roaming: when line is not revealed and user moves between monitors,
        // roam the line window to the active monitor.
        let mon_pos = (mon.position().x, mon.position().y);
        let mon_changed = {
            let mut cur_mon = hover.current_monitor_pos.lock().unwrap();
            if *cur_mon != Some(mon_pos) {
                *cur_mon = Some(mon_pos);
                true
            } else {
                false
            }
        };
        if mon_changed && !revealed {
            let s = state.inner.lock().map(|g| g.scale).unwrap_or(1.0);
            let _ = crate::window::place_on_monitor(&window, &mon, s);
        }

        let hover_on = hover
            .reveal_on_hover
            .load(Ordering::SeqCst);
        let hot = hover_on && in_zone(cursor.x, cursor.y, &mon);

        let Ok(origin) = window.outer_position() else {
            continue;
        };
        let on_photo = over_photo(
            cursor.x,
            cursor.y,
            origin.x as f64,
            origin.y as f64,
            scale,
            &state,
        );

        let hover = app.state::<HoverState>();

        // The window must only accept clicks where a photo is (or while a
        // drag is in flight). Everywhere else it stays click-through so the
        // parked strip never swallows clicks meant for title bars or tabs.
        // This runs on every tick — including once the line is already
        // revealed — because moving the pointer *off* a photo must re-enable
        // pass-through so the empty rope does not eat the click underneath.
        let wants_pass_through = !(on_photo || dragging);
        if hover
            .pass_through
            .swap(wants_pass_through, Ordering::SeqCst)
            != wants_pass_through
        {
            let _ = window.set_ignore_cursor_events(wants_pass_through);
        }

        if hot || on_photo || dragging {
            // Inside the zone, on a photo, or mid-drag: cancel any pending
            // retract and start counting toward a reveal.
            *hover.outside_since.lock().unwrap() = None;
            if auto_dismiss_at.is_some() {
                if let Ok(mut inner) = state.inner.lock() {
                    inner.auto_dismiss_at = None;
                }
            }

            if !revealed {
                let mut inside = hover.inside_since.lock().unwrap();
                if inside.is_none() {
                    *inside = Some(Instant::now());
                }
                let dwell = inside.map(|t| t.elapsed()).unwrap_or_default();
                drop(inside);

                // Over a photo counts as intent immediately; the strip is only
                // a hint, so it drops without the dwell delay.
                if on_photo || dwell >= REVEAL_DELAY {
                    crate::reveal(&app, true);
                }
            }
            continue;
        }

        *hover.inside_since.lock().unwrap() = None;

        if !revealed || pinned {
            continue;
        }

        // If an auto-dismiss session is active (e.g. from recent capture),
        // keep the line visible until the session finishes!
        if let Some(until) = auto_dismiss_at {
            if std::time::Instant::now() < until {
                continue;
            } else if let Ok(mut inner) = state.inner.lock() {
                inner.auto_dismiss_at = None;
            }
        }

        let mut outside = hover.outside_since.lock().unwrap();
        if outside.is_none() {
            *outside = Some(Instant::now());
        }
        let gone = outside.map(|t| t.elapsed()).unwrap_or_default();
        drop(outside);

        if gone >= RETRACT_DELAY {
            crate::reveal(&app, false);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::band;

    #[test]
    fn middle_third_of_the_top_edge_is_hot() {
        assert!(band(960.0, 1.0, 0.0, 0.0, 1920.0, 1080.0, 1.0));
        assert!(!band(100.0, 1.0, 0.0, 0.0, 1920.0, 1080.0, 1.0));
        assert!(!band(1800.0, 1.0, 0.0, 0.0, 1920.0, 1080.0, 1.0));
    }

    #[test]
    fn below_the_strip_is_cold() {
        assert!(!band(960.0, 40.0, 0.0, 0.0, 1920.0, 1080.0, 1.0));
    }

    #[test]
    fn respects_a_secondary_monitor_offset() {
        assert!(band(960.0 + 1920.0, 1.0, 0.0, 1920.0, 1920.0, 1080.0, 1.0));
        assert!(!band(960.0, 1.0, 0.0, 1920.0, 1920.0, 1080.0, 1.0));
    }

    #[test]
    fn zone_height_scales_with_dpi() {
        // 3 logical pixels at 200% is 6 physical pixels.
        assert!(band(960.0, 5.0, 0.0, 0.0, 1920.0, 1080.0, 2.0));
        assert!(!band(960.0, 7.0, 0.0, 0.0, 1920.0, 1080.0, 2.0));
    }
}
