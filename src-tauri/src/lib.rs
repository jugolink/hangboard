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

/// Where "Save to desktop" drops a copy. `settings.export_dir` wins; otherwise
/// a `Hangboard` folder on the real desktop.
pub fn export_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let root = data_root(app)?;
    let settings = settings::Settings::load(&root);
    let dir = match settings.export_dir {
        Some(d) => std::path::PathBuf::from(d),
        None => desktop_dir()
            .unwrap_or_else(|| root.join("exports"))
            .join("Hangboard"),
    };
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// The real desktop folder. Reads the shell's redirected path first (so a
/// OneDrive-redirected desktop still lands on the user's desktop), then falls
/// back to `%USERPROFILE%\Desktop`.
fn desktop_dir() -> Option<std::path::PathBuf> {
    #[cfg(windows)]
    {
        use winreg::enums::HKEY_CURRENT_USER;
        use winreg::RegKey;
        let key = RegKey::predef(HKEY_CURRENT_USER)
            .open_subkey(r"Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders")
            .ok()?;
        let raw: String = key.get_value("Desktop").ok()?;
        let expanded = expand_env(&raw);
        let path = std::path::PathBuf::from(expanded);
        if path.is_absolute() {
            return Some(path);
        }
    }
    #[cfg(not(windows))]
    {
        let _ = ();
    }
    std::env::var_os("USERPROFILE").map(|p| std::path::PathBuf::from(p).join("Desktop"))
}

/// Expand `%VAR%` in a path read from the registry (the shell stores redirected
/// folders with variables in them).
#[cfg(windows)]
fn expand_env(raw: &str) -> String {
    // Simple %NAME% expansion for the common `%USERPROFILE%` and `%OneDrive%`.
    let mut out = raw.to_string();
    for name in ["USERPROFILE", "OneDrive", "OneDriveConsumer", "PUBLIC"] {
        if let Ok(v) = std::env::var(name) {
            let needle = format!("%{name}%");
            if out.contains(&needle) {
                out = out.replace(&needle, &v);
            }
        }
    }
    out
}

#[cfg(not(windows))]
fn expand_env(raw: &str) -> String {
    raw.to_string()
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

/// Reveal the line when a new photo lands, unless the user turned that off.
///
/// The "reveal on new photo" preference and the "reveal on hover" one are
/// separate: this one is only consulted at the moment something new hangs, so
/// a captured screenshot or pasted image pops the line only when wanted.
pub fn reveal_on_new(app: &AppHandle) {
    let Ok(root) = data_root(app) else {
        return;
    };
    if settings::Settings::load(&root).reveal_on_new {
        if let Some(window) = app.get_webview_window("line") {
            if let Ok(cursor) = app.cursor_position() {
                if let Ok(Some(mon)) = app.monitor_from_point(cursor.x, cursor.y) {
                    let s = app.state::<AppState>().inner.lock().map(|g| g.scale).unwrap_or(1.0);
                    let _ = window::place_on_monitor(&window, &mon, s);
                }
            }
        }
        if let Ok(mut inner) = app.state::<AppState>().inner.lock() {
            inner.auto_dismiss_at =
                Some(std::time::Instant::now() + std::time::Duration::from_millis(3000));
        }
        reveal(app, true);
    }
}

/// Hang an already-finished image (used by the overlay and by future
/// screenshot folders).
pub fn hang(app: &AppHandle, img: image::RgbaImage) -> Result<Item, String> {
    let hash = line::image_hash(&img);

    // If an identical image is already hanging on the line, avoid duplicating files
    // and cards. If it's already the head item, do nothing; if older, bring it to front.
    if let Ok(mut inner) = app.state::<AppState>().inner.lock() {
        if let Some(pos) = inner.items.iter().position(|i| i.hash == hash && hash != 0) {
            if pos == 0 {
                return Ok(inner.items[0].clone());
            }
            let mut item = inner.items.remove(pos);
            item.added_at = now_millis() as i64;
            inner.items.insert(0, item.clone());
            drop(inner);
            persist(app);
            emit_items(app);
            return Ok(item);
        }
    }

    let dir = shots_dir(app)?;
    let thumb_h = state::geometry(1.0).photo_max_height as u32;
    let item = line::ingest(img, &dir, now_millis(), thumb_h)?;
    if let Ok(mut inner) = app.state::<AppState>().inner.lock() {
        inner.items.push(item.clone());
        inner.items.sort_by_key(|a| std::cmp::Reverse(a.added_at));
    }
    enforce_keep_on_line(app);
    if let Ok(root) = data_root(app) {
        if settings::Settings::load(&root).sounds {
            beep();
        }
    }
    persist(app);
    emit_items(app);
    Ok(item)
}

/// Drop the oldest un-pinned photos once the line exceeds "Keep on line".
pub fn enforce_keep_on_line(app: &AppHandle) {
    let Ok(root) = data_root(app) else {
        return;
    };
    let Some(cap) = settings::Settings::load(&root).keep_on_line else {
        return;
    };
    let drop_ids = {
        let state = app.state::<AppState>();
        let Ok(inner) = state.inner.lock() else {
            return;
        };
        line::drop_overflow(&inner.items, cap)
    };
    if drop_ids.is_empty() {
        return;
    }
    let Ok(dir) = shots_dir(app) else {
        return;
    };
    if let Ok(mut inner) = app.state::<AppState>().inner.lock() {
        for id in &drop_ids {
            if let Some(pos) = inner.items.iter().position(|i| &i.id == id) {
                let item = inner.items.remove(pos);
                line::delete_file(&dir, &item);
            }
        }
    }
    persist(app);
    emit_items(app);
}

/// Take every photo down (delete the files) in one gesture.
pub fn take_everything_down(app: &AppHandle) -> Result<(), String> {
    let dir = shots_dir(app)?;
    if let Ok(mut inner) = app.state::<AppState>().inner.lock() {
        for item in inner.items.drain(..) {
            line::delete_file(&dir, &item);
        }
    }
    crate::clipboard::reset_last_hash();
    persist(app);
    emit_items(app);
    Ok(())
}

/// A short, system-chosen chime. Only when `settings.sounds` is on.
#[cfg(windows)]
fn beep() {
    #[link(name = "user32")]
    extern "system" {
        #[link_name = "MessageBeep"]
        fn message_beep(u_type: u32) -> i32;
    }
    // MB_ICONASTERISK: a light, non-alarming chime.
    unsafe {
        message_beep(0x0000_0040);
    }
}

#[cfg(not(windows))]
fn beep() {}

/// Register the region/full-screen hotkeys from `settings`.
///
/// A hand-edited accelerator that fails to parse (or is already taken by
/// another app) is skipped rather than fatal: the line must still start.
pub fn register_shortcuts(app: &AppHandle, settings: &settings::Settings) -> Result<(), String> {
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
                            reveal_on_new(&h);
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
    app.state::<hover::HoverState>().reveal_on_hover.store(
        settings.reveal_on_hover,
        std::sync::atomic::Ordering::SeqCst,
    );
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
        .manage(window::Preview::new())
        .manage(window::Context::new())
        .setup(|app| {
            let handle = app.handle().clone();

            // Settings decide the line size, hotkeys and shots directory, so
            // read them before anything that depends on those.
            let root = data_root(&handle)?;
            let settings = settings::Settings::load(&root);

            // Load the line *before* building the windows: `window::build`
            // starts the line webview, whose first `list_items` call must see
            // the photos already in place. Loading afterwards loses the race
            // and the first reveal shows an empty line that never re-fills
            // (no `line:items` event follows the initial render).
            {
                let thumb_h = state::geometry(1.0).photo_max_height as u32;
                let items = line::load_items(&root, thumb_h);
                if let Ok(mut inner) = handle.state::<AppState>().inner.lock() {
                    inner.items = items;
                    inner.scale = settings.scale.clamp(0.5, 2.0);
                }
            }

            window::build(&handle)?;

            window::place(&handle).ok();
            hover::spawn(handle.clone());
            clipboard::spawn(handle.clone());

            // Push the reveal-on-hover preference into the hover loop's cache
            // so it takes effect immediately rather than on the next reload.
            handle.state::<hover::HoverState>().reveal_on_hover.store(
                settings.reveal_on_hover,
                std::sync::atomic::Ordering::SeqCst,
            );

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
            // Background windows hide instead of closing; pinned floating windows destroy.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let label = window.label();
                if label == "line"
                    || label == "settings"
                    || label == "preview"
                    || label == "context"
                    || label == "overlay"
                {
                    api.prevent_close();
                    let _ = window.hide();
                }
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
            commands::get_language,
            commands::preview_index,
            commands::preview_image,
            commands::open_preview,
            commands::step_preview,
            commands::close_preview,
            commands::open_context,
            commands::close_context,
            commands::context_copy,
            commands::context_open,
            commands::context_preview,
            commands::context_pin,
            commands::context_reveal,
            commands::context_export,
            commands::context_discard,
            commands::context_discard_left,
            commands::context_discard_right,
            commands::check_shortcut,
            commands::get_settings,
            commands::save_settings,
            commands::open_settings_window,
            commands::close_settings_window,
            commands::open_settings_file,
            commands::drag_window,
            commands::pin_to_desktop,
            commands::get_pin_image,
            commands::close_pin,
            commands::get_my_pin_info,
            commands::set_pin_always_on_top,
            commands::resize_pinned_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Hangboard");
}
