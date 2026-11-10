//! Window plumbing: where the line sits, how big it is, and how the two
//! windows are created.
//!
//! The line window is parked at the top edge of the primary monitor for the
//! whole run and never moves. Retracting slides the *content* up inside it
//! with a CSS transform. Moving the window itself would mean either a
//! stuttering series of `SetWindowPos` calls or a visible jump-cut, and it
//! would also fight Windows' own window animations.

use crate::state::{geometry, AppState, Item};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

pub struct Overlay;
pub struct Preview;
pub struct Context;

impl Overlay {
    pub fn new() -> Self {
        Self
    }

    pub fn window(&self, app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
        app.get_webview_window("overlay")
            .ok_or_else(|| "overlay window missing".to_string())
    }
}

impl Default for Overlay {
    fn default() -> Self {
        Self::new()
    }
}

impl Preview {
    pub fn new() -> Self {
        Self
    }

    pub fn window(&self, app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
        app.get_webview_window("preview")
            .ok_or_else(|| "preview window missing".to_string())
    }
}

impl Default for Preview {
    fn default() -> Self {
        Self::new()
    }
}

impl Context {
    pub fn new() -> Self {
        Self
    }

    pub fn window(&self, app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
        app.get_webview_window("context")
            .ok_or_else(|| "context window missing".to_string())
    }
}

impl Default for Context {
    fn default() -> Self {
        Self::new()
    }
}

/// Top-left corner of `mon` in logical pixels.
fn logical_origin(mon: &tauri::Monitor) -> (f64, f64) {
    let s = mon.scale_factor();
    (mon.position().x as f64 / s, mon.position().y as f64 / s)
}

fn logical_size(mon: &tauri::Monitor) -> (f64, f64) {
    let s = mon.scale_factor();
    (mon.size().width as f64 / s, mon.size().height as f64 / s)
}

/// Height of the line window: the panel plus slack so the spring overshoot
/// at the bottom is not clipped.
pub fn window_height(scale: f64) -> f64 {
    geometry(scale).panel_height + 24.0
}

/// Position and size the line window for a specific monitor using physical pixels.
pub fn place_on_monitor(
    window: &tauri::WebviewWindow,
    mon: &tauri::Monitor,
    scale: f64,
) -> Result<(), String> {
    let pos = mon.position();
    let size = mon.size();
    let s = mon.scale_factor();
    let phys_h = (window_height(scale) * s).round() as u32;

    let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize::new(
        size.width, phys_h,
    )));
    let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(
        pos.x, pos.y,
    )));
    Ok(())
}

/// Size and park the line window at the top edge.
pub fn place(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("line")
        .ok_or("line window missing")?;
    let mon = app
        .primary_monitor()
        .map_err(|e| e.to_string())?
        .ok_or("no primary monitor")?;
    let scale = app
        .state::<AppState>()
        .inner
        .lock()
        .map(|g| g.scale)
        .unwrap_or(1.0);
    place_on_monitor(&window, &mon, scale)
}

/// Show or retract the line.
///
/// Click-through is *not* decided here: the hover loop in `hover.rs` flips it
/// on every tick so that only photos are reachable (and the empty rope is
/// not). Retracting does force pass-through on, because the parked strip at
/// the top edge must never eat clicks while it looks empty.
pub fn reveal(app: &AppHandle, on: bool) {
    let Some(window) = app.get_webview_window("line") else {
        return;
    };
    {
        let state = app.state::<AppState>();
        let Ok(mut inner) = state.inner.lock() else {
            return;
        };
        if inner.revealed == on {
            return;
        }
        inner.revealed = on;
    }

    let _ = window.emit("line:revealed", on);
    if !on {
        let _ = window.set_ignore_cursor_events(true);
    }

    if on {
        if let Ok(cursor) = app.cursor_position() {
            if let Ok(Some(mon)) = app.monitor_from_point(cursor.x, cursor.y) {
                let s = app
                    .state::<AppState>()
                    .inner
                    .lock()
                    .map(|g| g.scale)
                    .unwrap_or(1.0);
                let _ = place_on_monitor(&window, &mon, s);
            }
        }
        let _ = window.show();
    }
    // When retracting the window stays visible: its content is translated
    // off the top, so there is nothing to see, and keeping it alive means
    // the next reveal is instant rather than a webview cold start.
}

/// Re-apply geometry after a scale change.
pub fn resize(app: &AppHandle) {
    let _ = place(app);
    let _ = app.emit("line:geometry", ());
}

/// Build both windows.
pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let mon = app.primary_monitor()?.ok_or(tauri::Error::WindowNotFound)?;
    let (ox, oy) = logical_origin(&mon);
    let (mw, _mh) = logical_size(&mon);
    let height = window_height(1.0);

    // WebView2 otherwise keeps its profile under `%LOCALAPPDATA%`. Keeping it
    // beside the app's own data means the whole app is portable: delete one
    // directory and nothing is left behind. It also makes the app write only
    // where it is allowed to, which matters when the binary runs from a
    // restricted account or a read-only-ish location.
    // Each window needs its own WebView2 user-data directory. Three webviews
    // sharing one directory is exactly what made the preview window render as
    // fully transparent: the third environment never got a working compositor
    // on the shared browser process.
    let profile_base = crate::data_root(app)
        .map(|root| root.join("webview2"))
        .unwrap_or_else(|_| std::path::PathBuf::from("webview2"));
    let line_profile = profile_base.join("line");
    let overlay_profile = profile_base.join("overlay");
    let preview_profile = profile_base.join("preview");
    let context_profile = profile_base.join("context");
    let settings_profile = profile_base.join("settings");
    let _ = std::fs::create_dir_all(&line_profile);
    let _ = std::fs::create_dir_all(&overlay_profile);
    let _ = std::fs::create_dir_all(&preview_profile);
    let _ = std::fs::create_dir_all(&context_profile);
    let _ = std::fs::create_dir_all(&settings_profile);

    WebviewWindowBuilder::new(app, "line", WebviewUrl::App("index.html".into()))
        .data_directory(line_profile)
        .title("Hangboard")
        .inner_size(mw, height)
        .position(ox, oy)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(true)
        .skip_taskbar(true)
        .always_on_top(true)
        .focused(false)
        .visible(false)
        .build()?;

    let overlay = app.primary_monitor()?.ok_or(tauri::Error::WindowNotFound)?;
    let (sx, sy) = logical_origin(&overlay);
    let (sw, sh) = logical_size(&overlay);

    WebviewWindowBuilder::new(app, "overlay", WebviewUrl::App("overlay.html".into()))
        .data_directory(overlay_profile)
        .title("Hangboard capture")
        .inner_size(sw, sh)
        .position(sx, sy)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .focused(false)
        .visible(false)
        .build()?;

    // The preview lightbox is a centred window, not a full-screen one: the
    // photo shows against a black page inside it, and the desktop stays
    // visible around the edges, so there is no "is the screen frozen?" moment.
    //
    // It reuses the overlay's recipe (transparent, always-on-top, shown on
    // demand), which is the one window configuration this codebase has proven
    // paints correctly the first time it is shown.
    let pw = (sw * 0.8).min(1200.0);
    let ph = (sh * 0.8).min(800.0);
    let px = sx + (sw - pw) / 2.0;
    let py = sy + (sh - ph) / 2.0;

    WebviewWindowBuilder::new(app, "preview", WebviewUrl::App("preview.html".into()))
        .data_directory(preview_profile)
        .title("Hangboard preview")
        .inner_size(pw, ph)
        .position(px, py)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .focused(false)
        .visible(false)
        .build()?;

    // The per-photo context menu is a small popup, not a full-screen window.
    // It is created hidden and shown on demand exactly like the preview, with
    // its own WebView2 profile so it composes independently.
    WebviewWindowBuilder::new(app, "context", WebviewUrl::App("context.html".into()))
        .data_directory(context_profile)
        .title("Hangboard menu")
        .inner_size(224.0, 320.0)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .focused(false)
        .visible(false)
        .build()?;

    WebviewWindowBuilder::new(app, "settings", WebviewUrl::App("settings.html".into()))
        .data_directory(settings_profile)
        .title("Hangboard Settings")
        .inner_size(520.0, 620.0)
        .center()
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(false)
        .skip_taskbar(false)
        .always_on_top(true)
        .focused(false)
        .visible(false)
        .build()?;

    Ok(())
}

/// Persist the line's contents next to the app's data.
pub fn persist(app: &AppHandle) {
    let Ok(root) = crate::data_root(app) else {
        return;
    };
    let items: Vec<Item> = app
        .state::<AppState>()
        .inner
        .lock()
        .map(|g| g.items.clone())
        .unwrap_or_default();
    let _ = crate::line::save_items(&root, &items);
}

/// Tell the webview the line changed, so it can re-render.
pub fn emit_items(app: &AppHandle) {
    let items: Vec<Item> = app
        .state::<AppState>()
        .inner
        .lock()
        .map(|g| g.items.clone())
        .unwrap_or_default();
    let _ = app.emit("line:items", items);
}

/// Open a lightweight floating pinned window on the desktop for the given item.
pub fn open_pin_window(
    app: &AppHandle,
    id: &str,
    target_x: Option<f64>,
    target_y: Option<f64>,
) -> Result<(), String> {
    let label = format!("pin-{}", id);
    if let Some(win) = app.get_webview_window(&label) {
        if let (Some(x), Some(y)) = (target_x, target_y) {
            if let Ok(size) = win.inner_size() {
                let s = win.scale_factor().unwrap_or(1.0);
                let w = size.width as f64 / s;
                let h = size.height as f64 / s;
                let pos_x = x - w / 2.0;
                let pos_y = y - h / 2.0;
                let _ = win.set_position(tauri::Position::Logical(tauri::LogicalPosition::new(
                    pos_x, pos_y,
                )));
            }
        }
        let _ = win.show();
        let _ = win.set_focus();
        return Ok(());
    }

    let item = {
        let state = app.state::<AppState>();
        let inner = state.inner.lock().map_err(|e| e.to_string())?;
        inner
            .items
            .iter()
            .find(|i| i.id == id)
            .cloned()
            .ok_or("no such item")?
    };

    let (img_w, img_h) = image::image_dimensions(&item.path).unwrap_or((400, 300));
    let aspect = if img_h > 0 {
        img_w as f64 / img_h as f64
    } else {
        1.0
    };

    let max_w = 720.0;
    let max_h = 540.0;
    let mut win_w = img_w as f64;
    let mut win_h = img_h as f64;

    if win_w > max_w {
        win_w = max_w;
        win_h = win_w / aspect;
    }
    if win_h > max_h {
        win_h = max_h;
        win_w = win_h * aspect;
    }
    win_w = win_w.max(160.0);
    win_h = win_h.max(120.0);

    let profile_base = crate::data_root(app)
        .map(|r| r.join("webview2"))
        .unwrap_or_else(|_| std::path::PathBuf::from("webview2"));
    let pin_profile = profile_base.join("pin");
    let _ = std::fs::create_dir_all(&pin_profile);

    let mut builder =
        tauri::WebviewWindowBuilder::new(app, &label, tauri::WebviewUrl::App("pin.html".into()))
            .data_directory(pin_profile)
            .title("Hangboard Pin")
            .inner_size(win_w, win_h)
            .decorations(false)
            .transparent(true)
            .shadow(false)
            .resizable(true)
            .always_on_top(true)
            .focused(true)
            .visible(false);

    if let (Some(x), Some(y)) = (target_x, target_y) {
        let pos_x = x - win_w / 2.0;
        let pos_y = y - win_h / 2.0;
        builder = builder.position(pos_x, pos_y);
    } else {
        builder = builder.center();
    }

    let win = match builder.build() {
        Ok(w) => w,
        Err(e) => {
            eprintln!("Failed to create pin window '{label}': {e}");
            return Err(e.to_string());
        }
    };
    let _ = win.show();
    let _ = win.set_focus();
    Ok(())
}
