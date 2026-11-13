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
pub mod drag;
pub mod hover;
pub mod line;
pub mod ocr;
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
    let s = settings::Settings::load(&root);
    if s.reveal_on_new {
        if let Some(window) = app.get_webview_window("line") {
            if let Ok(cursor) = app.cursor_position() {
                if let Ok(Some(mon)) = app.monitor_from_point(cursor.x, cursor.y) {
                    let scale = app
                        .state::<AppState>()
                        .inner
                        .lock()
                        .map(|g| g.scale)
                        .unwrap_or(1.0);
                    let _ = window::place_on_monitor(&window, &mon, scale);
                }
            }
        }
        let duration_secs = s.reveal_duration.clamp(1, 300);
        if let Ok(mut inner) = app.state::<AppState>().inner.lock() {
            inner.auto_dismiss_at = Some(
                std::time::Instant::now() + std::time::Duration::from_secs(duration_secs as u64),
            );
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
        let s = settings::Settings::load(&root);
        if s.sounds {
            play_hang_sound(s.custom_sound_path.as_deref());
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

static DEFAULT_HANG_SOUND: &[u8] = include_bytes!("../assets/default_hang.wav");

/// A short chime played when a photo hangs on the line. Only when `settings.sounds` is on.
/// Supports an optional user-selected custom `.wav` audio file.
#[cfg(windows)]
pub fn play_hang_sound(custom_path: Option<&str>) {
    #[link(name = "winmm")]
    extern "system" {
        fn PlaySoundW(psz_sound: *const u16, hmod: *mut core::ffi::c_void, fdw_sound: u32) -> i32;
    }
    #[link(name = "user32")]
    extern "system" {
        #[link_name = "MessageBeep"]
        fn message_beep(u_type: u32) -> i32;
    }

    if let Some(path_str) = custom_path {
        let p = std::path::Path::new(path_str);
        if p.exists() {
            let wide: Vec<u16> = path_str.encode_utf16().chain(std::iter::once(0)).collect();
            unsafe {
                if PlaySoundW(
                    wide.as_ptr(),
                    std::ptr::null_mut(),
                    0x0002_0000 | 0x0001 | 0x0002, // SND_FILENAME | SND_ASYNC | SND_NODEFAULT
                ) != 0
                {
                    return;
                }
            }
        }
    }

    // Play default embedded hang sound
    unsafe {
        // SND_MEMORY = 0x0004, SND_ASYNC = 0x0001, SND_NODEFAULT = 0x0002
        if PlaySoundW(
            DEFAULT_HANG_SOUND.as_ptr() as *const u16,
            std::ptr::null_mut(),
            0x0004 | 0x0001 | 0x0002,
        ) != 0
        {
            return;
        }
    }

    let candidates = [
        r"C:\Windows\Media\Windows Notify System Generic.wav",
        r"C:\Windows\Media\Windows Ding.wav",
        r"C:\Windows\Media\notify.wav",
    ];

    let mut played = false;
    for path in candidates {
        if std::path::Path::new(path).exists() {
            let wide: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();
            unsafe {
                // SND_FILENAME = 0x00020000, SND_ASYNC = 0x0001, SND_NODEFAULT = 0x0002
                if PlaySoundW(
                    wide.as_ptr(),
                    std::ptr::null_mut(),
                    0x0002_0000 | 0x0001 | 0x0002,
                ) != 0
                {
                    played = true;
                    break;
                }
            }
        }
    }

    if !played {
        // SND_ALIAS = 0x00010000, SND_ASYNC = 0x0001
        let alias: Vec<u16> = "SystemAsterisk"
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();
        unsafe {
            if PlaySoundW(alias.as_ptr(), std::ptr::null_mut(), 0x0001_0000 | 0x0001) == 0 {
                message_beep(0x0000_0040);
            }
        }
    }
}

#[cfg(not(windows))]
pub fn play_hang_sound(_custom_path: Option<&str>) {}

pub fn beep() {
    play_hang_sound(None);
}

/// Register the region/full-screen hotkeys from `settings`.
///
/// A hand-edited accelerator that fails to parse (or is already taken by
/// another app) is skipped rather than fatal: the line must still start.
pub fn register_shortcuts(app: &AppHandle, settings: &settings::Settings) -> Result<(), String> {
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();

    // Each registration is attempted independently and a failure is logged and
    // skipped: a shortcut another app already owns must never stop the line
    // from starting, and it must not take the other shortcuts down with it.
    if let Ok(region) = settings.region.parse::<Shortcut>() {
        let h = app.clone();
        if let Err(e) = gs.on_shortcut(region, move |_app, _sc, event| {
            if event.state == ShortcutState::Pressed {
                let _ = commands::begin_capture(h.clone(), h.state());
            }
        }) {
            eprintln!(
                "[shortcuts] region ({}) not registered: {e}",
                settings.region
            );
        }
    }

    if let Ok(whole) = settings.whole.parse::<Shortcut>() {
        let h = app.clone();
        if let Err(e) = gs.on_shortcut(whole, move |_app, _sc, event| {
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
        }) {
            eprintln!("[shortcuts] whole ({}) not registered: {e}", settings.whole);
        }
    }

    if let Ok(toggle) = settings.toggle.parse::<Shortcut>() {
        let h = app.clone();
        if let Err(e) = gs.on_shortcut(toggle, move |_app, _sc, event| {
            if event.state == ShortcutState::Pressed {
                toggle_line(&h);
            }
        }) {
            eprintln!(
                "[shortcuts] toggle ({}) not registered: {e}",
                settings.toggle
            );
        }
    }

    Ok(())
}

/// Toggle line visibility via hotkey, tray, or command.
pub fn toggle_line(app: &AppHandle) {
    let state = app.state::<AppState>();
    let is_revealed = state.inner.lock().map(|g| g.revealed).unwrap_or(false);

    let new_pinned = !is_revealed;
    if let Ok(mut inner) = state.inner.lock() {
        inner.pinned = new_pinned;
        if !new_pinned {
            inner.auto_dismiss_at = None;
        }
    }
    reveal(app, new_pinned);
    tray::refresh_checks_current(app);
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
            commands::start_card_drag,
            commands::copy_item,
            commands::discard_item,
            commands::discard_items,
            commands::pin_item,
            commands::begin_capture,
            commands::finish_capture,
            commands::save_annotated_item,
            commands::cancel_capture,
            commands::hide_line,
            commands::toggle_line,
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
            commands::context_ocr,
            commands::context_reveal,
            commands::context_export,
            commands::context_discard,
            commands::context_discard_left,
            commands::context_discard_right,
            commands::recognize_image,
            commands::open_ocr_window,
            commands::close_ocr_window,
            commands::check_shortcut,
            commands::get_settings,
            commands::save_settings,
            commands::select_data_dir,
            commands::get_default_data_dir,
            commands::select_sound_file,
            commands::play_test_sound,
            commands::open_settings_window,
            commands::close_settings_window,
            commands::open_settings_file,
            commands::drag_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Hangboard");
}
