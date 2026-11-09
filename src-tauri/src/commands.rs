//! The invoke surface the webview talks to.
//!
//! Every command is thin: the real work lives in `capture`, `line`, and
//! `hover`. That keeps the window plumbing separate from the logic, and keeps
//! the logic testable without a window.

use crate::state::{geometry, AppState, Geometry, Item};
use crate::window::{reveal, Context, Overlay, Preview};
use crate::{capture, line, resize as resize_line};
use tauri::{AppHandle, Emitter, Manager, State};

pub type CmdResult<T> = Result<T, String>;

#[tauri::command]
pub fn get_geometry(scale: f64) -> Geometry {
    geometry(scale)
}

#[tauri::command]
pub fn list_items(state: State<'_, AppState>) -> Vec<Item> {
    state
        .inner
        .lock()
        .map(|g| g.items.clone())
        .unwrap_or_default()
}

#[tauri::command]
pub fn set_scale(app: AppHandle, state: State<'_, AppState>, scale: f64) -> CmdResult<()> {
    if let Ok(mut inner) = state.inner.lock() {
        inner.scale = scale.clamp(0.5, 2.0);
    }
    resize_line(&app);
    Ok(())
}

/// The webview reports where the photos ended up, in window coordinates.
///
/// Rust cannot know this: the layout lives in CSS. Passing it back is what
/// lets `set_ignore_cursor_events` be exact instead of guesswork.
#[tauri::command]
pub fn set_hit_rects(state: State<'_, AppState>, rects: Vec<(f64, f64, f64, f64)>) {
    if let Ok(mut inner) = state.inner.lock() {
        inner.hit_rects = rects;
    }
}

#[tauri::command]
pub fn set_dragging(state: State<'_, AppState>, dragging: bool) {
    if let Ok(mut inner) = state.inner.lock() {
        inner.dragging = dragging;
    }
}

#[tauri::command]
pub fn copy_item(state: State<'_, AppState>, id: String) -> CmdResult<()> {
    let item = {
        let inner = state.inner.lock().map_err(|e| e.to_string())?;
        inner
            .items
            .iter()
            .find(|i| i.id == id)
            .cloned()
            .ok_or("no such item")?
    };
    line::copy_to_clipboard(&item)
}

#[tauri::command]
pub fn discard_item(app: AppHandle, state: State<'_, AppState>, id: String) -> CmdResult<()> {
    let dir = crate::shots_dir(&app)?;
    {
        let mut inner = state.inner.lock().map_err(|e| e.to_string())?;
        if let Some(pos) = inner.items.iter().position(|i| i.id == id) {
            let item = inner.items.remove(pos);
            line::delete_file(&dir, &item);
        }
    }
    crate::persist(&app);
    crate::emit_items(&app);
    Ok(())
}

#[tauri::command]
pub fn pin_item(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    kept: bool,
) -> CmdResult<()> {
    {
        let mut inner = state.inner.lock().map_err(|e| e.to_string())?;
        if let Some(item) = inner.items.iter_mut().find(|i| i.id == id) {
            item.kept = kept;
        }
    }
    crate::persist(&app);
    crate::emit_items(&app);
    Ok(())
}

/// Freeze the screen, then put the selection overlay up.
///
/// The order matters: grab first, then show. Showing first would capture the
/// overlay itself.
#[tauri::command]
pub fn begin_capture(app: AppHandle, state: State<'_, AppState>) -> CmdResult<()> {
    let buf = capture::freeze_primary()?;

    // The backdrop is a JPEG: a few hundred KB instead of several MB of PNG,
    // and the slight loss costs nothing because the crop is taken from the
    // lossless buffer, not from what the overlay displays.
    //
    // JPEG has no alpha channel, so the RGBA buffer has to be flattened to RGB
    // first. Handing the encoder RGBA makes it fail with "does not support the
    // color type", which surfaces as "the overlay never opens".
    let rgb = image::RgbImage::from_fn(buf.width, buf.height, |x, y| {
        let i = ((y * buf.width + x) * 4) as usize;
        image::Rgb([buf.rgba[i], buf.rgba[i + 1], buf.rgba[i + 2]])
    });
    let mut jpeg = Vec::new();
    {
        use image::ImageEncoder;
        let enc = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg, 85);
        enc.write_image(
            rgb.as_raw(),
            rgb.width(),
            rgb.height(),
            image::ExtendedColorType::Rgb8,
        )
        .map_err(|e| e.to_string())?;
    }
    use base64::Engine;
    let url = format!(
        "data:image/jpeg;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(jpeg)
    );

    // Logical size of the frozen frame: the overlay is sized in CSS pixels.
    let factor = factor_of(&app).unwrap_or(1.0);
    let css_width = buf.width as f64 / factor;
    let css_height = buf.height as f64 / factor;

    if let Ok(mut inner) = state.inner.lock() {
        inner.capture = Some(buf);
    }

    let window = app.state::<Overlay>().window(&app)?;
    window
        .emit(
            "capture:begin",
            serde_json::json!({
                "backdrop": url,
                "factor": factor,
                "width": css_width,
                "height": css_height,
            }),
        )
        .map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

/// Take the selected rectangle out of the frozen frame and hang it.
#[tauri::command]
pub fn finish_capture(
    app: AppHandle,
    state: State<'_, AppState>,
    rect: (f64, f64, f64, f64),
) -> CmdResult<()> {
    let buf = {
        let inner = state.inner.lock().map_err(|e| e.to_string())?;
        inner.capture.clone().ok_or("no capture in flight")?
    };
    let factor = factor_of(&app).unwrap_or(1.0);

    let img = capture::crop(&buf, rect, factor).ok_or("empty selection")?;
    let thumb_h = geometry(1.0).photo_max_height as u32;
    let dir = crate::shots_dir(&app)?;
    let item = line::ingest(img, &dir, crate::now_millis(), thumb_h)?;

    {
        let mut inner = state.inner.lock().map_err(|e| e.to_string())?;
        inner.capture = None;
        inner.items.push(item.clone());
        // Newest first, matching how the line reads left to right.
        inner.items.sort_by_key(|a| std::cmp::Reverse(a.added_at));
    }

    // A screenshot people expect to paste right away.
    let _ = line::copy_to_clipboard(&item);

    if let Ok(overlay) = app.state::<Overlay>().window(&app) {
        let _ = overlay.hide();
    }

    crate::persist(&app);
    crate::emit_items(&app);
    crate::reveal_on_new(&app);
    Ok(())
}

#[tauri::command]
pub fn cancel_capture(app: AppHandle, state: State<'_, AppState>) -> CmdResult<()> {
    if let Ok(mut inner) = state.inner.lock() {
        inner.capture = None;
    }
    if let Ok(overlay) = app.state::<Overlay>().window(&app) {
        let _ = overlay.hide();
    }
    Ok(())
}

#[tauri::command]
pub fn hide_line(app: AppHandle, state: State<'_, AppState>) {
    if let Ok(mut inner) = state.inner.lock() {
        inner.pinned = false;
    }
    crate::tray::refresh_checks_current(&app);
    reveal(&app, false);
}

#[tauri::command]
pub fn get_language(app: AppHandle) -> String {
    let Ok(root) = crate::data_root(&app) else {
        return "zh-CN".into();
    };
    crate::settings::Settings::load(&root).language
}

// ---- preview lightbox ------------------------------------------------------
//
// The line renders oldest-first (left to right), but `inner.items` is stored
// newest-first. The helpers below convert between the two orders so a preview
// opened for a specific photo stays on that photo even after the line re-sorts.

/// Newest-first position → display position (0 = leftmost / oldest).
fn display_index(items: &[Item], newest_first_pos: usize) -> usize {
    items
        .len()
        .saturating_sub(1)
        .saturating_sub(newest_first_pos)
}

/// Display position (0 = leftmost / oldest) → newest-first position.
fn newest_first_index(items: &[Item], display: usize) -> usize {
    items.len().saturating_sub(1).saturating_sub(display)
}

/// Which photo the preview is on, in display order. `None` while closed.
#[tauri::command]
pub fn preview_index(state: State<'_, AppState>) -> Option<usize> {
    state.inner.lock().ok().and_then(|g| g.preview_index)
}

/// The full-size image for the current preview, as a data URL.
#[tauri::command]
pub fn preview_image(state: State<'_, AppState>) -> Option<String> {
    let inner = state.inner.lock().ok()?;
    let display = inner.preview_index?;
    let items = &inner.items;
    let item = items.get(newest_first_index(items, display))?;
    line::full_image_data_url(item).ok()
}

/// Open the preview for the photo with this id.
#[tauri::command]
pub fn open_preview(app: AppHandle, state: State<'_, AppState>, id: String) -> CmdResult<()> {
    let display = {
        let inner = state.inner.lock().map_err(|e| e.to_string())?;
        let pos = inner
            .items
            .iter()
            .position(|i| i.id == id)
            .ok_or("no such item")?;
        display_index(&inner.items, pos)
    };

    {
        let mut inner = state.inner.lock().map_err(|e| e.to_string())?;
        inner.preview_index = Some(display);
    }

    let window = app.state::<Preview>().window(&app)?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    window
        .emit("preview:show", display)
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Step the preview by `delta` (wraps around) and return the new display index.
#[tauri::command]
pub fn step_preview(state: State<'_, AppState>, delta: i32) -> CmdResult<usize> {
    let mut inner = state.inner.lock().map_err(|e| e.to_string())?;
    let len = inner.items.len();
    if len == 0 {
        return Err("no items".to_string());
    }
    let cur = inner.preview_index.unwrap_or(0) as i32;
    let next = (cur + delta).rem_euclid(len as i32) as usize;
    inner.preview_index = Some(next);
    Ok(next)
}

/// Close the preview.
#[tauri::command]
pub fn close_preview(app: AppHandle, state: State<'_, AppState>) -> CmdResult<()> {
    if let Ok(mut inner) = state.inner.lock() {
        inner.preview_index = None;
    }
    let window = app.state::<Preview>().window(&app)?;
    window.hide().map_err(|e| e.to_string())?;
    Ok(())
}

// ---- per-photo context menu ------------------------------------------------
//
// Right-clicking a photo opens a small popup (an HTML window) with actions on
// that photo. The item id is parked in `state.context_id` so every command can
// find its subject without threading it through the webview.

/// Open the context menu for the photo with this id, positioned near the
/// pointer.
#[tauri::command]
pub fn open_context(app: AppHandle, state: State<'_, AppState>, id: String) -> CmdResult<()> {
    {
        let inner = state.inner.lock().map_err(|e| e.to_string())?;
        if !inner.items.iter().any(|i| i.id == id) {
            return Err("no such item".to_string());
        }
    }
    {
        let mut inner = state.inner.lock().map_err(|e| e.to_string())?;
        inner.context_id = Some(id);
    }
    let window = app.state::<Context>().window(&app)?;
    // Position near the pointer (a little below/right so it does not sit under
    // the cursor), then show.
    if let Ok(cursor) = app.cursor_position() {
        let _ = window.set_position(tauri::LogicalPosition::new(cursor.x, cursor.y));
    }
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn close_context(app: AppHandle, state: State<'_, AppState>) -> CmdResult<()> {
    if let Ok(mut inner) = state.inner.lock() {
        inner.context_id = None;
    }
    let window = app.state::<Context>().window(&app)?;
    window.hide().map_err(|e| e.to_string())?;
    Ok(())
}

fn context_item(state: &State<'_, AppState>) -> CmdResult<Item> {
    let inner = state.inner.lock().map_err(|e| e.to_string())?;
    let id = inner.context_id.as_ref().ok_or("no context item")?;
    inner
        .items
        .iter()
        .find(|i| &i.id == id)
        .cloned()
        .ok_or("no such item".to_string())
}

/// Copy the context item to the clipboard (same as clicking the photo).
#[tauri::command]
pub fn context_copy(state: State<'_, AppState>) -> CmdResult<()> {
    let item = context_item(&state)?;
    line::copy_to_clipboard(&item)
}

/// Open the context item in the default handler (default image viewer).
#[tauri::command]
pub fn context_open(app: AppHandle, state: State<'_, AppState>) -> CmdResult<()> {
    let item = context_item(&state)?;
    open_path(&item.path)?;
    close_context(app, state)
}

/// Open the preview lightbox for the context item, then close this menu.
#[tauri::command]
pub fn context_preview(app: AppHandle, state: State<'_, AppState>) -> CmdResult<()> {
    let id = {
        let inner = state.inner.lock().map_err(|e| e.to_string())?;
        inner.context_id.clone().ok_or("no context item")?
    };
    let window = app.state::<Context>().window(&app)?;
    let _ = window.hide();
    open_preview(app, state, id)
}

/// Reveal the item in Explorer (selects it).
#[tauri::command]
pub fn context_reveal(app: AppHandle, state: State<'_, AppState>) -> CmdResult<()> {
    let item = context_item(&state)?;
    reveal_in_explorer(&item.path)?;
    close_context(app, state)
}

/// Copy the item to the export folder (default: desktop\Hangboard).
#[tauri::command]
pub fn context_export(app: AppHandle, state: State<'_, AppState>) -> CmdResult<()> {
    let item = context_item(&state)?;
    let dir = crate::export_dir(&app)?;
    let name = std::path::Path::new(&item.path)
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .ok_or("no file name")?;
    let dest = dir.join(name);
    std::fs::copy(&item.path, &dest).map_err(|e| e.to_string())?;
    close_context(app, state)
}

/// Take down every photo to the left of the context item (in display order).
#[tauri::command]
pub fn context_discard_left(app: AppHandle, state: State<'_, AppState>) -> CmdResult<()> {
    discard_side(&app, &state, Side::Left)
}

/// Take down every photo to the right of the context item (in display order).
#[tauri::command]
pub fn context_discard_right(app: AppHandle, state: State<'_, AppState>) -> CmdResult<()> {
    discard_side(&app, &state, Side::Right)
}

/// Discard the context item itself.
#[tauri::command]
pub fn context_discard(app: AppHandle, state: State<'_, AppState>) -> CmdResult<()> {
    let id = {
        let inner = state.inner.lock().map_err(|e| e.to_string())?;
        inner.context_id.clone().ok_or("no context item")?
    };
    discard_item(app.clone(), state.clone(), id)?;
    close_context(app, state)
}

enum Side {
    Left,
    Right,
}

fn discard_side(app: &AppHandle, state: &State<'_, AppState>, side: Side) -> CmdResult<()> {
    // `items` is newest-first; the line renders oldest-first (left to right).
    // Find the subject's display index (0 = leftmost), then drop everything on
    // the chosen side.
    let (subject_id, display_pos) = {
        let inner = state.inner.lock().map_err(|e| e.to_string())?;
        let id = inner.context_id.clone().ok_or("no context item")?;
        let pos = inner
            .items
            .iter()
            .position(|i| i.id == id)
            .ok_or("no such item")?;
        let display = display_index(&inner.items, pos);
        (id, display)
    };

    let ids: Vec<String> = {
        let inner = state.inner.lock().map_err(|e| e.to_string())?;
        // newest-first → display order is the reverse.
        let mut display_order: Vec<(usize, String)> = inner
            .items
            .iter()
            .enumerate()
            .map(|(pos, i)| (display_index(&inner.items, pos), i.id.clone()))
            .collect();
        display_order.sort_by_key(|(d, _)| *d);
        display_order
            .into_iter()
            .filter_map(|(d, id)| match side {
                Side::Left => (d < display_pos).then_some(id),
                Side::Right => (d > display_pos).then_some(id),
            })
            .collect()
    };

    let dir = crate::shots_dir(app)?;
    {
        let mut inner = state.inner.lock().map_err(|e| e.to_string())?;
        for id in &ids {
            if let Some(pos) = inner.items.iter().position(|i| &i.id == id) {
                let item = inner.items.remove(pos);
                line::delete_file(&dir, &item);
            }
        }
    }
    crate::persist(app);
    crate::emit_items(app);
    // The subject still exists; re-target it so a second click keeps working.
    {
        let mut inner = state.inner.lock().map_err(|e| e.to_string())?;
        inner.context_id = Some(subject_id);
    }
    if let Ok(window) = app.state::<Context>().window(app) {
        let _ = window.hide();
    }
    Ok(())
}

/// Physical pixels per logical pixel on the primary monitor.
fn factor_of(app: &AppHandle) -> Option<f64> {
    let mon = app.primary_monitor().ok()??;
    Some(mon.scale_factor())
}

#[cfg(windows)]
fn open_path(path: &str) -> CmdResult<()> {
    std::process::Command::new("cmd")
        .args(["/C", "start", "", path])
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(not(windows))]
fn open_path(path: &str) -> CmdResult<()> {
    let _ = path;
    Err("open is Windows-only".to_string())
}

#[cfg(windows)]
fn reveal_in_explorer(path: &str) -> CmdResult<()> {
    std::process::Command::new("explorer")
        .args(["/select,", path])
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(not(windows))]
fn reveal_in_explorer(path: &str) -> CmdResult<()> {
    let _ = path;
    Err("reveal is Windows-only".to_string())
}

use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

#[derive(serde::Serialize, serde::Deserialize)]
pub struct ShortcutCheckResult {
    pub valid: bool,
    pub conflict: bool,
    pub error: Option<String>,
}

#[tauri::command]
pub fn check_shortcut(app: AppHandle, accelerator: String) -> ShortcutCheckResult {
    let Ok(sc) = accelerator.parse::<Shortcut>() else {
        return ShortcutCheckResult {
            valid: false,
            conflict: false,
            error: Some("Invalid accelerator syntax / 快捷键格式无效".into()),
        };
    };

    let gs = app.global_shortcut();
    match gs.on_shortcut(sc, |_app, _sc, _ev| {}) {
        Ok(_) => {
            let _ = gs.unregister(sc);
            if let Ok(root) = crate::data_root(&app) {
                let s = crate::settings::Settings::load(&root);
                let _ = crate::register_shortcuts(&app, &s);
            }
            ShortcutCheckResult {
                valid: true,
                conflict: false,
                error: None,
            }
        }
        Err(e) => {
            if let Ok(root) = crate::data_root(&app) {
                let s = crate::settings::Settings::load(&root);
                let _ = crate::register_shortcuts(&app, &s);
            }
            ShortcutCheckResult {
                valid: false,
                conflict: true,
                error: Some(format!("Shortcut conflict / 快捷键冲突或已被占用: {e}")),
            }
        }
    }
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> Result<crate::settings::Settings, String> {
    let root = crate::data_root(&app)?;
    Ok(crate::settings::Settings::load(&root))
}

#[tauri::command]
pub fn save_settings(app: AppHandle, new_settings: crate::settings::Settings) -> Result<(), String> {
    let root = crate::data_root(&app)?;
    new_settings.save(&root)?;
    crate::apply_settings(&app)?;
    let _ = crate::tray::rebuild_menu(&app);
    let _ = app.emit("app:language", &new_settings.language);
    Ok(())
}

#[tauri::command]
pub fn open_settings_window(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("settings") {
        let _ = win.show();
        let _ = win.set_focus();
        let _ = win.emit("settings:refresh", ());
    }
    Ok(())
}

#[tauri::command]
pub fn close_settings_window(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("settings") {
        let _ = win.hide();
    }
    Ok(())
}

#[tauri::command]
pub fn open_settings_file(app: AppHandle) -> Result<(), String> {
    let root = crate::data_root(&app)?;
    let settings = crate::settings::Settings::load(&root);
    settings.save(&root)?;
    let path = root.join(crate::settings::SETTINGS_FILE);
    #[cfg(windows)]
    let _ = std::process::Command::new("notepad").arg(&path).spawn();
    Ok(())
}
