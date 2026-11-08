//! The system-tray icon and its menu — the app's always-visible surface.
//! Entries either mirror what the line/hotkeys already do (capture,
//! show/hide) or flip a setting that lives in `settings.json`.

use crate::autostart;
use crate::settings::Settings;
use crate::state::AppState;
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::TrayIconBuilder,
    AppHandle, Manager,
};

/// Keeps the menu alive and lets handlers refresh check marks in place.
pub struct TrayState {
    pub menu: Menu<tauri::Wry>,
}

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let root = crate::data_root(app).map_err(std::io::Error::other)?;
    let settings = Settings::load(&root);

    let show_hide = MenuItem::with_id(app, "toggle_line", "Show / hide line", true, None::<&str>)?;
    let region = MenuItem::with_id(app, "capture_region", "Capture region", true, None::<&str>)?;
    let whole = MenuItem::with_id(
        app,
        "capture_whole",
        "Capture full screen",
        true,
        None::<&str>,
    )?;
    let sep1 = PredefinedMenuItem::separator(app)?;

    let size_small = CheckMenuItem::with_id(
        app,
        "size_small",
        "Small",
        true,
        eq(settings.scale, 0.8),
        None::<&str>,
    )?;
    let size_medium = CheckMenuItem::with_id(
        app,
        "size_medium",
        "Medium",
        true,
        eq(settings.scale, 1.0),
        None::<&str>,
    )?;
    let size_large = CheckMenuItem::with_id(
        app,
        "size_large",
        "Large",
        true,
        eq(settings.scale, 1.35),
        None::<&str>,
    )?;
    let size_menu =
        Submenu::with_items(app, "Size", true, &[&size_small, &size_medium, &size_large])?;

    let open_folder = MenuItem::with_id(
        app,
        "open_screenshots_folder",
        "Open screenshots folder",
        true,
        None::<&str>,
    )?;
    let hang_clipboard = CheckMenuItem::with_id(
        app,
        "hang_clipboard",
        "Hang copied images",
        true,
        settings.hang_clipboard,
        None::<&str>,
    )?;
    let open_at_login = CheckMenuItem::with_id(
        app,
        "open_at_login",
        "Open at login",
        true,
        settings.open_at_login,
        None::<&str>,
    )?;
    let open_settings = MenuItem::with_id(
        app,
        "open_settings",
        "Open settings file",
        true,
        None::<&str>,
    )?;
    let reload = MenuItem::with_id(
        app,
        "reload_settings",
        "Reload settings",
        true,
        None::<&str>,
    )?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[
            &show_hide,
            &region,
            &whole,
            &sep1,
            &size_menu,
            &open_folder,
            &hang_clipboard,
            &open_at_login,
            &open_settings,
            &reload,
            &sep2,
            &quit,
        ],
    )?;

    TrayIconBuilder::with_id("main-tray")
        .icon(tauri::image::Image::from_bytes(include_bytes!(
            "../icons/32x32.png"
        ))?)
        .tooltip("Hangboard")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| {
            let _ = handle_menu(app, event.id().as_ref());
        })
        .build(app)?;

    app.manage(TrayState { menu });
    Ok(())
}

/// Refresh the check marks after a setting changes so the menu never lies
/// about the current Size or autostart state.
pub(crate) fn refresh_checks(app: &AppHandle, settings: &Settings) {
    let Some(state) = app.try_state::<TrayState>() else {
        return;
    };
    set_checked(&state.menu, "size_small", eq(settings.scale, 0.8));
    set_checked(&state.menu, "size_medium", eq(settings.scale, 1.0));
    set_checked(&state.menu, "size_large", eq(settings.scale, 1.35));
    set_checked(&state.menu, "hang_clipboard", settings.hang_clipboard);
    set_checked(&state.menu, "open_at_login", settings.open_at_login);
}

fn set_checked(menu: &Menu<tauri::Wry>, id: &str, checked: bool) {
    if let Some(item) = menu.get(id) {
        if let Some(check) = item.as_check_menuitem() {
            let _ = check.set_checked(checked);
        }
    }
}

fn eq(a: f64, b: f64) -> bool {
    (a - b).abs() < 0.01
}

fn handle_menu(app: &AppHandle, id: &str) -> Result<(), String> {
    match id {
        "toggle_line" => {
            let revealed = app
                .state::<AppState>()
                .inner
                .lock()
                .map(|g| g.revealed)
                .unwrap_or(false);
            crate::reveal(app, !revealed);
        }
        "capture_region" => {
            let _ = crate::commands::begin_capture(app.clone(), app.state());
        }
        "capture_whole" => {
            let h = app.clone();
            std::thread::spawn(move || {
                if let Ok(buf) = crate::capture::freeze_primary() {
                    if let Some(img) = crate::capture::whole(&buf) {
                        let _ = crate::hang(&h, img);
                        crate::reveal(&h, true);
                    }
                }
            });
        }
        "size_small" => apply_scale(app, 0.8)?,
        "size_medium" => apply_scale(app, 1.0)?,
        "size_large" => apply_scale(app, 1.35)?,
        "open_screenshots_folder" => open_shots_folder(app)?,
        "hang_clipboard" => toggle_hang_clipboard(app)?,
        "open_at_login" => toggle_autostart(app)?,
        "open_settings" => open_settings_file(app)?,
        "reload_settings" => crate::apply_settings(app)?,
        "quit" => app.exit(0),
        _ => {}
    }
    Ok(())
}

fn apply_scale(app: &AppHandle, scale: f64) -> Result<(), String> {
    crate::commands::set_scale(app.clone(), app.state(), scale)?;
    let root = crate::data_root(app)?;
    let mut settings = Settings::load(&root);
    settings.scale = scale;
    settings.save(&root)?;
    refresh_checks(app, &settings);
    Ok(())
}

fn toggle_hang_clipboard(app: &AppHandle) -> Result<(), String> {
    let root = crate::data_root(app)?;
    let mut settings = Settings::load(&root);
    settings.hang_clipboard = !settings.hang_clipboard;
    settings.save(&root)?;
    refresh_checks(app, &settings);
    Ok(())
}

fn toggle_autostart(app: &AppHandle) -> Result<(), String> {
    let root = crate::data_root(app)?;
    let mut settings = Settings::load(&root);
    settings.open_at_login = !settings.open_at_login;
    autostart::set_enabled(settings.open_at_login)?;
    settings.save(&root)?;
    refresh_checks(app, &settings);
    Ok(())
}

fn open_settings_file(app: &AppHandle) -> Result<(), String> {
    let root = crate::data_root(app)?;
    // Ensure the file exists so the editor opens a real file, not an error.
    let settings = Settings::load(&root);
    settings.save(&root)?;
    let path = root.join(crate::settings::SETTINGS_FILE);
    #[cfg(windows)]
    let _ = std::process::Command::new("notepad").arg(&path).spawn();
    Ok(())
}

fn open_shots_folder(app: &AppHandle) -> Result<(), String> {
    let shots = crate::shots_dir(app)?;
    #[cfg(windows)]
    let _ = std::process::Command::new("explorer").arg(&shots).spawn();
    Ok(())
}
