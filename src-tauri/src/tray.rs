//! The system-tray icon and its menu — the app's always-visible surface.
//! Entries either mirror what the line/hotkeys already do (capture,
//! show/hide) or flip a setting that lives in `settings.json`.

use crate::autostart;
use crate::settings::Settings;
use crate::state::AppState;
use std::sync::Mutex;
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager,
};

/// Keeps the menu alive and lets handlers refresh check marks in place.
pub struct TrayState {
    pub menu: Mutex<Menu<tauri::Wry>>,
}

struct I18n {
    is_zh: bool,
}

impl I18n {
    fn new(lang: &str) -> Self {
        Self {
            is_zh: lang == "zh-CN",
        }
    }

    fn toggle_line(&self) -> &'static str {
        if self.is_zh {
            "始终固定显示晾衣绳"
        } else {
            "Always show line"
        }
    }
    fn take_everything_down(&self) -> &'static str {
        if self.is_zh {
            "全部取下"
        } else {
            "Take everything down"
        }
    }
    fn capture_region(&self) -> &'static str {
        if self.is_zh {
            "区域截图"
        } else {
            "Capture region"
        }
    }
    fn capture_whole(&self) -> &'static str {
        if self.is_zh {
            "全屏截图"
        } else {
            "Capture full screen"
        }
    }
    fn hang_clipboard(&self) -> &'static str {
        if self.is_zh {
            "自动挂载剪贴板图片"
        } else {
            "Hang copied images"
        }
    }
    fn keep_menu(&self) -> &'static str {
        if self.is_zh {
            "绳上保留数量"
        } else {
            "Keep on line"
        }
    }
    fn keep_fit(&self) -> &'static str {
        if self.is_zh {
            "自动适应容量"
        } else {
            "As many as fit"
        }
    }
    fn size_menu(&self) -> &'static str {
        if self.is_zh {
            "尺寸大小"
        } else {
            "Size"
        }
    }
    fn size_small(&self) -> &'static str {
        if self.is_zh {
            "小"
        } else {
            "Small"
        }
    }
    fn size_medium(&self) -> &'static str {
        if self.is_zh {
            "中"
        } else {
            "Medium"
        }
    }
    fn size_large(&self) -> &'static str {
        if self.is_zh {
            "大"
        } else {
            "Large"
        }
    }
    fn reveal_on_hover(&self) -> &'static str {
        if self.is_zh {
            "鼠标悬停触发展开"
        } else {
            "Reveal on hover"
        }
    }
    fn reveal_on_new(&self) -> &'static str {
        if self.is_zh {
            "新图自动展开"
        } else {
            "Reveal on new photo"
        }
    }
    fn sounds(&self) -> &'static str {
        if self.is_zh {
            "提示音效"
        } else {
            "Sound effects"
        }
    }
    fn open_folder(&self) -> &'static str {
        if self.is_zh {
            "打开截图文件夹"
        } else {
            "Open screenshots folder"
        }
    }
    fn open_at_login(&self) -> &'static str {
        if self.is_zh {
            "开机自启动"
        } else {
            "Open at login"
        }
    }
    fn open_settings(&self) -> &'static str {
        if self.is_zh {
            "偏好设置…"
        } else {
            "Preferences…"
        }
    }
    fn language_menu(&self) -> &'static str {
        if self.is_zh {
            "语言 (Language)"
        } else {
            "Language"
        }
    }
    fn reload_settings(&self) -> &'static str {
        if self.is_zh {
            "重新加载配置"
        } else {
            "Reload settings"
        }
    }
    fn quit(&self) -> &'static str {
        if self.is_zh {
            "退出"
        } else {
            "Quit"
        }
    }
}

pub fn create_menu(
    app: &AppHandle,
    settings: &Settings,
    pinned: bool,
) -> tauri::Result<Menu<tauri::Wry>> {
    let tr = I18n::new(&settings.language);

    let show_hide = CheckMenuItem::with_id(
        app,
        "toggle_line",
        tr.toggle_line(),
        true,
        pinned,
        None::<&str>,
    )?;
    let take_down = MenuItem::with_id(
        app,
        "take_everything_down",
        tr.take_everything_down(),
        true,
        None::<&str>,
    )?;
    let region = MenuItem::with_id(app, "capture_region", tr.capture_region(), true, None::<&str>)?;
    let whole = MenuItem::with_id(app, "capture_whole", tr.capture_whole(), true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;

    let keep_fit = CheckMenuItem::with_id(
        app,
        "keep_fit",
        tr.keep_fit(),
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
        tr.keep_menu(),
        true,
        &[&keep_fit, &keep_25, &keep_50, &keep_100],
    )?;

    let size_small = CheckMenuItem::with_id(
        app,
        "size_small",
        tr.size_small(),
        true,
        eq(settings.scale, 0.8),
        None::<&str>,
    )?;
    let size_medium = CheckMenuItem::with_id(
        app,
        "size_medium",
        tr.size_medium(),
        true,
        eq(settings.scale, 1.0),
        None::<&str>,
    )?;
    let size_large = CheckMenuItem::with_id(
        app,
        "size_large",
        tr.size_large(),
        true,
        eq(settings.scale, 1.35),
        None::<&str>,
    )?;
    let size_menu = Submenu::with_items(
        app,
        tr.size_menu(),
        true,
        &[&size_small, &size_medium, &size_large],
    )?;

    let open_folder = MenuItem::with_id(
        app,
        "open_screenshots_folder",
        tr.open_folder(),
        true,
        None::<&str>,
    )?;
    let hang_clipboard = CheckMenuItem::with_id(
        app,
        "hang_clipboard",
        tr.hang_clipboard(),
        true,
        settings.hang_clipboard,
        None::<&str>,
    )?;
    let open_at_login = CheckMenuItem::with_id(
        app,
        "open_at_login",
        tr.open_at_login(),
        true,
        settings.open_at_login,
        None::<&str>,
    )?;
    let open_settings = MenuItem::with_id(
        app,
        "open_settings",
        tr.open_settings(),
        true,
        None::<&str>,
    )?;
    let reveal_on_hover = CheckMenuItem::with_id(
        app,
        "reveal_on_hover",
        tr.reveal_on_hover(),
        true,
        settings.reveal_on_hover,
        None::<&str>,
    )?;
    let reveal_on_new = CheckMenuItem::with_id(
        app,
        "reveal_on_new",
        tr.reveal_on_new(),
        true,
        settings.reveal_on_new,
        None::<&str>,
    )?;
    let sounds = CheckMenuItem::with_id(
        app,
        "sounds",
        tr.sounds(),
        true,
        settings.sounds,
        None::<&str>,
    )?;

    let lang_zh = CheckMenuItem::with_id(
        app,
        "lang_zh",
        "简体中文",
        true,
        settings.language == "zh-CN",
        None::<&str>,
    )?;
    let lang_en = CheckMenuItem::with_id(
        app,
        "lang_en",
        "English",
        true,
        settings.language == "en",
        None::<&str>,
    )?;
    let lang_menu = Submenu::with_items(
        app,
        tr.language_menu(),
        true,
        &[&lang_zh, &lang_en],
    )?;

    let reload = MenuItem::with_id(
        app,
        "reload_settings",
        tr.reload_settings(),
        true,
        None::<&str>,
    )?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let sep3 = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", tr.quit(), true, None::<&str>)?;

    Menu::with_items(
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
            &lang_menu,
            &reload,
            &sep3,
            &quit,
        ],
    )
}

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let root = crate::data_root(app).map_err(std::io::Error::other)?;
    let settings = Settings::load(&root);
    let pinned = app
        .state::<AppState>()
        .inner
        .lock()
        .map(|g| g.pinned)
        .unwrap_or(false);

    let menu = create_menu(app, &settings, pinned)?;

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

    app.manage(TrayState {
        menu: Mutex::new(menu),
    });
    Ok(())
}

pub fn rebuild_menu(app: &AppHandle) -> tauri::Result<()> {
    let Ok(root) = crate::data_root(app) else {
        return Ok(());
    };
    let settings = Settings::load(&root);
    let pinned = app
        .state::<AppState>()
        .inner
        .lock()
        .map(|g| g.pinned)
        .unwrap_or(false);
    let new_menu = create_menu(app, &settings, pinned)?;
    if let Some(tray) = app.tray_by_id("main-tray") {
        let _ = tray.set_menu(Some(new_menu.clone()));
    }
    if let Some(state) = app.try_state::<TrayState>() {
        if let Ok(mut m) = state.menu.lock() {
            *m = new_menu;
        }
    }
    let _ = app.emit("app:language", &settings.language);
    Ok(())
}

/// Refresh the check marks after a setting changes so the menu never lies
/// about the current Size or autostart state.
pub(crate) fn refresh_checks(app: &AppHandle, settings: &Settings) {
    let Some(state) = app.try_state::<TrayState>() else {
        return;
    };
    let Ok(menu) = state.menu.lock() else {
        return;
    };
    let pinned = app
        .state::<AppState>()
        .inner
        .lock()
        .map(|g| g.pinned)
        .unwrap_or(false);
    set_checked(&menu, "toggle_line", pinned);
    set_checked(&menu, "size_small", eq(settings.scale, 0.8));
    set_checked(&menu, "size_medium", eq(settings.scale, 1.0));
    set_checked(&menu, "size_large", eq(settings.scale, 1.35));
    set_checked(&menu, "hang_clipboard", settings.hang_clipboard);
    set_checked(&menu, "open_at_login", settings.open_at_login);
    set_checked(&menu, "reveal_on_hover", settings.reveal_on_hover);
    set_checked(&menu, "reveal_on_new", settings.reveal_on_new);
    set_checked(&menu, "sounds", settings.sounds);
    set_checked(&menu, "keep_fit", settings.keep_on_line.is_none());
    set_checked(&menu, "keep_25", settings.keep_on_line == Some(25));
    set_checked(&menu, "keep_50", settings.keep_on_line == Some(50));
    set_checked(&menu, "keep_100", settings.keep_on_line == Some(100));
    set_checked(&menu, "lang_zh", settings.language == "zh-CN");
    set_checked(&menu, "lang_en", settings.language == "en");
}

pub fn refresh_checks_current(app: &AppHandle) {
    if let Ok(root) = crate::data_root(app) {
        let settings = Settings::load(&root);
        refresh_checks(app, &settings);
    }
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
            let state = app.state::<AppState>();
            let mut is_pinned = false;
            if let Ok(mut inner) = state.inner.lock() {
                inner.pinned = !inner.pinned;
                is_pinned = inner.pinned;
            }
            crate::reveal(app, is_pinned);
            let Ok(root) = crate::data_root(app) else {
                return Ok(());
            };
            let settings = Settings::load(&root);
            refresh_checks(app, &settings);
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
        "open_settings" => crate::commands::open_settings_window(app.clone())?,
        "reveal_on_hover" => toggle_reveal_on_hover(app)?,
        "reveal_on_new" => toggle_reveal_on_new(app)?,
        "sounds" => toggle_sounds(app)?,
        "lang_zh" => apply_language(app, "zh-CN")?,
        "lang_en" => apply_language(app, "en")?,
        "reload_settings" => {
            crate::apply_settings(app)?;
            rebuild_menu(app).map_err(|e| e.to_string())?;
        }
        "quit" => app.exit(0),
        _ => {}
    }
    Ok(())
}

fn apply_language(app: &AppHandle, lang: &str) -> Result<(), String> {
    let root = crate::data_root(app)?;
    let mut settings = Settings::load(&root);
    if settings.language == lang {
        return Ok(());
    }
    settings.language = lang.to_string();
    settings.save(&root)?;
    rebuild_menu(app).map_err(|e| e.to_string())?;
    Ok(())
}

fn apply_keep_on_line(app: &AppHandle, cap: Option<u32>) -> Result<(), String> {
    let root = crate::data_root(app)?;
    let mut settings = Settings::load(&root);
    settings.keep_on_line = cap;
    settings.save(&root)?;
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

fn open_shots_folder(app: &AppHandle) -> Result<(), String> {
    let shots = crate::shots_dir(app)?;
    #[cfg(windows)]
    let _ = std::process::Command::new("explorer").arg(&shots).spawn();
    Ok(())
}
