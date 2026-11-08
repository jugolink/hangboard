//! Hangboard -- a place to hang screenshots while you work.
//!
//! The shape of the program:
//!
//! - `window`  builds the two windows and owns their geometry.
//! - `hover`   polls the pointer and decides when the line drops or retracts.
//! - `capture` freezes the screen and cuts rectangles out of the frozen frame.
//! - `line`    turns pixels into items and persists the line across restarts.
//! - `settings` holds user-editable options (hotkeys, size, autostart, dir).
//! - `tray`    the system-tray icon and its menu.
//! - `commands` is the thin invoke surface the webview calls.
//!
//! State lives in `AppState`, shared through Tauri's managed state.

pub mod autostart;
pub mod capture;
pub mod clipboard;
pub mod commands;
pub mod hover;
pub mod line;
pub mod settings;
pub mod state;
pub mod tray;
pub mod window;

use state::{AppState, Item};
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

pub use window::{emit_items, persist, resize, reveal};

/// Where the app's own data lives: `settings.json`, `line.json` (the index),
/// and the WebView2 profile.
///
/// `%APPDATA%\Hangboard` by default: an installed app lives under Program
/// Files, which is not writable, and loose files beside a binary look like
/// clutter.
///
/// `HANGBOARD_DATA_DIR` overrides it. That is how the app is run from a
/// checkout during development, and how a portable copy is pointed at a USB
/// stick.
pub fn data_root(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = match std::env::var_os("HANGBOARD_DATA_DIR") {
        Some(dir) => std::path::PathBuf::from(dir),
        None => app.path().app_data_dir().map_err(|e| e.to_string())?,
    };
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Where screenshot pixels are written.
///
/// `data_root\shots` by default; the `data_dir` setting overrides it, which is
/// how a user points the line's cache at an arbitrary folder. The index always
/// stays in `data_root`, so a custom cache only moves the PNGs, never the book.
pub fn shots_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let root = data_root(app)?;
    let settings = settings::Settings::load(&root);
    let dir = match settings.data_dir {
        Some(d) => std::path::PathBuf::from(d),
        None => root.join(line::SHOTS_DIR),
    };
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub fn now_millis() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

/// Re-apply the window size after the Size menu changes the scale.
pub fn resize_line(app: &AppHandle) {
    window::resize(app);
}

/// Hang an already-finished image (used by the overlay and by future
/// screenshot folders).
pub fn hang(app: &AppHandle, img: image::RgbaImage) -> Result<Item, String> {
    let dir = shots_dir(app)?;
    let thumb_h = state::geometry(1.0).photo_max_height as u32;
    let item = line::ingest(img, &dir, now_millis(), thumb_h)?;
    if let Ok(mut inner) = app.state::<AppState>().inner.lock() {
        inner.items.push(item.clone());
        inner.items.sort_by_key(|a| std::cmp::Reverse(a.added_at));
    }
    persist(app);
    emit_items(app);
    Ok(item)
}

/// Register the region/full-screen hotkeys from `settings`.
///
/// A hand-edited accelerator that fails to parse (or is already taken by
/// another app) is skipped rather than fatal: the line must still start.
fn register_shortcuts(app: &AppHandle, settings: &settings::Settings) -> Result<(), String> {
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();

    if let Ok(region) = settings.region.parse::<Shortcut>() {
        let h = app.clone();
        gs.on_shortcut(region, move |_app, _sc, event| {
            if event.state == ShortcutState::Pressed {
                let _ = commands::begin_capture(h.clone(), h.state());
            }
        })
        .map_err(|e| e.to_string())?;
    }

    if let Ok(whole) = settings.whole.parse::<Shortcut>() {
        let h = app.clone();
        gs.on_shortcut(whole, move |_app, _sc, event| {
            if event.state == ShortcutState::Pressed {
                let h = h.clone();
                std::thread::spawn(move || {
                    if let Ok(buf) = capture::freeze_primary() {
                        if let Some(img) = capture::whole(&buf) {
                            let _ = hang(&h, img);
                            reveal(&h, true);
                        }
                    }
                });
            }
        })
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Re-read settings and apply every live piece: line size, hotkeys, and the
/// autostart entry. Called from the tray's "Reload settings".
pub fn apply_settings(app: &AppHandle) -> Result<(), String> {
    let root = data_root(app)?;
    let settings = settings::Settings::load(&root);

    if let Ok(mut inner) = app.state::<AppState>().inner.lock() {
        inner.scale = settings.scale.clamp(0.5, 2.0);
    }
    resize_line(app);

    register_shortcuts(app, &settings)?;
    let _ = autostart::set_enabled(settings.open_at_login);
    tray::refresh_checks(app, &settings);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(AppState::new())
        .manage(hover::HoverState::new())
        .manage(window::Overlay::new())
        .setup(|app| {
            let handle = app.handle().clone();

            window::build(&handle)?;

            // Settings decide the line size, hotkeys and shots directory, so
            // read them before anything that depends on those.
            let root = data_root(&handle)?;
            let settings = settings::Settings::load(&root);

            // Load the line before the window is ever shown, so the first
            // reveal already has its photos in place.
            {
                let thumb_h = state::geometry(1.0).photo_max_height as u32;
                let items = line::load_items(&root, thumb_h);
                if let Ok(mut inner) = handle.state::<AppState>().inner.lock() {
                    inner.items = items;
                    inner.scale = settings.scale.clamp(0.5, 2.0);
                }
            }

            window::place(&handle).ok();
            hover::spawn(handle.clone());
            clipboard::spawn(handle.clone());

            // The hotkeys are configured, not hard-coded: they work while
            // another app has focus, which is the only time they are useful.
            register_shortcuts(&handle, &settings).map_err(std::io::Error::other)?;

            // The tray is the app's always-visible surface.
            tray::build(&handle)?;

            // Make the autostart entry match the saved preference, refreshing
            // the executable path if the binary has moved since it was set.
            let _ = autostart::set_enabled(settings.open_at_login);

            // Not a screenshot tool the user has to remember to launch: start
            // hidden in the tray, and let the hot zone find it.
            if let Some(win) = app.get_webview_window("line") {
                let _ = win.set_ignore_cursor_events(true);
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing either window must not end the session: the line is
            // meant to live in the background. Hide instead.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_geometry,
            commands::list_items,
            commands::set_scale,
            commands::set_hit_rects,
            commands::set_dragging,
            commands::copy_item,
            commands::discard_item,
            commands::pin_item,
            commands::begin_capture,
            commands::finish_capture,
            commands::cancel_capture,
            commands::hide_line,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Hangboard");
}
