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
    let take_down = MenuItem::with_id(
        app,
        "take_everything_down",
        "Take everything down",
        true,
        None::<&str>,
    )?;
    let region = MenuItem::with_id(app, "capture_region", "Capture region", true, None::<&str>)?;
    let whole = MenuItem::with_id(
        app,
        "capture_whole",
        "Capture full screen",
        true,
        None::<&str>,
    )?;
    let sep1 = PredefinedMenuItem::separator(app)?;

    // "Keep on line": how many un-pinned photos survive before the oldest drops.
    let keep_fit = CheckMenuItem::with_id(
        app,
        "keep_fit",
        "As many as fit",
        true,
        settings.keep_on_line.is_none(),
        None::<&str>,
    )?;
    let keep_25 = CheckMenuItem::with_id(
        app,
        "keep_25",
        "25",
        true,
        settings.keep_on_line == Some(25),
        None::<&str>,
    )?;
    let keep_50 = CheckMenuItem::with_id(
        app,
        "keep_50",
        "50",
        true,
        settings.keep_on_line == Some(50),
        None::<&str>,
    )?;
    let keep_100 = CheckMenuItem::with_id(
        app,
        "keep_100",
        "100",
        true,
        settings.keep_on_line == Some(100),
        None::<&str>,
    )?;
    let keep_menu = Submenu::with_items(
        app,
        "Keep on line",
        true,
        &[&keep_fit, &keep_25, &keep_50, &keep_100],
    )?;

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
    let reveal_on_hover = CheckMenuItem::with_id(
        app,
        "reveal_on_hover",
        "Reveal on hover",
        true,
        settings.reveal_on_hover,
        None::<&str>,
    )?;
    let reveal_on_new = CheckMenuItem::with_id(
        app,
        "reveal_on_new",
        "Reveal on new photo",
        true,
        settings.reveal_on_new,
        None::<&str>,
    )?;
    let sounds =
        CheckMenuItem::with_id(app, "sounds", "Sounds", true, settings.sounds, None::<&str>)?;
    let reload = MenuItem::with_id(
        app,
        "reload_settings",
        "Reload settings",
        true,
        None::<&str>,
    )?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let sep3 = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[
            &show_hide,
            &take_down,
            &sep1,
            &region,
            &whole,
            &hang_clipboard,
            &sep2,
            &keep_menu,
            &size_menu,
            &reveal_on_hover,
            &reveal_on_new,
            &sounds,
            &open_folder,
            &open_at_login,
            &open_settings,
            &reload,
            &sep3,
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
    set_checked(&state.menu, "reveal_on_hover", settings.reveal_on_hover);
    set_checked(&state.menu, "reveal_on_new", settings.reveal_on_new);
    set_checked(&state.menu, "sounds", settings.sounds);
    set_checked(&state.menu, "keep_fit", settings.keep_on_line.is_none());
    set_checked(&state.menu, "keep_25", settings.keep_on_line == Some(25));
    set_checked(&state.menu, "keep_50", settings.keep_on_line == Some(50));
    set_checked(&state.menu, "keep_100", settings.keep_on_line == Some(100));
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
        "take_everything_down" => crate::take_everything_down(app)?,
        "capture_region" => {
            let _ = crate::commands::begin_capture(app.clone(), app.state());
        }
        "capture_whole" => {
            let h = app.clone();
            std::thread::spawn(move || {
                if let Ok(buf) = crate::capture::freeze_primary() {
                    if let Some(img) = crate::capture::whole(&buf) {
                        let _ = crate::hang(&h, img);
                        crate::reveal_on_new(&h);
                    }
                }
            });
        }
        "keep_fit" => apply_keep_on_line(app, None)?,
        "keep_25" => apply_keep_on_line(app, Some(25))?,
        "keep_50" => apply_keep_on_line(app, Some(50))?,
        "keep_100" => apply_keep_on_line(app, Some(100))?,
        "size_small" => apply_scale(app, 0.8)?,
        "size_medium" => apply_scale(app, 1.0)?,
        "size_large" => apply_scale(app, 1.35)?,
        "open_screenshots_folder" => open_shots_folder(app)?,
        "hang_clipboard" => toggle_hang_clipboard(app)?,
        "open_at_login" => toggle_autostart(app)?,
        "open_settings" => open_settings_file(app)?,
        "reveal_on_hover" => toggle_reveal_on_hover(app)?,
        "reveal_on_new" => toggle_reveal_on_new(app)?,
        "sounds" => toggle_sounds(app)?,
        "reload_settings" => crate::apply_settings(app)?,
        "quit" => app.exit(0),
        _ => {}
    }
    Ok(())
}

fn apply_keep_on_line(app: &AppHandle, cap: Option<u32>) -> Result<(), String> {
    let root = crate::data_root(app)?;
    let mut settings = Settings::load(&root);
    settings.keep_on_line = cap;
    settings.save(&root)?;
    // Enforce immediately: the user chose a smaller cap, so drop the overflow
    // now rather than only on the next capture.
    crate::enforce_keep_on_line(app);
    refresh_checks(app, &settings);
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

fn toggle_reveal_on_hover(app: &AppHandle) -> Result<(), String> {
    let root = crate::data_root(app)?;
    let mut settings = Settings::load(&root);
    settings.reveal_on_hover = !settings.reveal_on_hover;
    app.state::<crate::hover::HoverState>()
        .reveal_on_hover
        .store(
            settings.reveal_on_hover,
            std::sync::atomic::Ordering::SeqCst,
        );
    settings.save(&root)?;
    refresh_checks(app, &settings);
    Ok(())
}

fn toggle_reveal_on_new(app: &AppHandle) -> Result<(), String> {
    let root = crate::data_root(app)?;
    let mut settings = Settings::load(&root);
    settings.reveal_on_new = !settings.reveal_on_new;
    settings.save(&root)?;
    refresh_checks(app, &settings);
    Ok(())
}

fn toggle_sounds(app: &AppHandle) -> Result<(), String> {
    let root = crate::data_root(app)?;
    let mut settings = Settings::load(&root);
    settings.sounds = !settings.sounds;
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
