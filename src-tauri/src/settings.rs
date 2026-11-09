//! User-editable settings, persisted next to the app's data as
//! `settings.json`. A plain serde struct (no Tauri types) so it is trivially
//! testable and easy for a user to hand-edit.

use serde::{Deserialize, Serialize};
use std::path::Path;

pub const SETTINGS_FILE: &str = "settings.json";

/// Default accelerator strings, in the `global-hotkey` format: lowercase
/// modifiers (any order) followed by the key, e.g. `control+alt+KeyH`.
pub const DEFAULT_REGION: &str = "control+alt+KeyH";
pub const DEFAULT_WHOLE: &str = "control+alt+shift+KeyH";

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(default)]
pub struct Settings {
    /// Accelerator for the region-capture shortcut.
    pub region: String,
    /// Accelerator for the full-screen capture shortcut.
    pub whole: String,
    /// Line size multiplier: 0.8 small, 1.0 medium, 1.35 large.
    pub scale: f64,
    /// Whether the app should start with Windows.
    pub open_at_login: bool,
    /// Whether copied images are automatically hung on the line.
    pub hang_clipboard: bool,
    /// Custom screenshot directory. `None` means "beside the app data".
    pub data_dir: Option<String>,
    /// Where "Save to desktop" writes a copy. `None` means the `Hangboard`
    /// folder on the real desktop.
    pub export_dir: Option<String>,
    /// "Keep on line" cap. `None` means "as many as fit"; `Some(n)` keeps the
    /// newest `n` and drops the oldest (never a pinned one) beyond that.
    pub keep_on_line: Option<u32>,
    /// Reveal the line the moment a new photo lands on it.
    pub reveal_on_new: bool,
    /// Reveal the line when the pointer sits at the top edge.
    pub reveal_on_hover: bool,
    /// Reveal the line even when a full-screen app is in front.
    pub reveal_over_fullscreen: bool,
    /// Play a sound when a photo hangs or is taken down.
    pub sounds: bool,
    /// UI language ("zh-CN" or "en").
    pub language: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            region: DEFAULT_REGION.into(),
            whole: DEFAULT_WHOLE.into(),
            scale: 1.0,
            open_at_login: false,
            hang_clipboard: true,
            data_dir: None,
            export_dir: None,
            keep_on_line: None,
            reveal_on_new: true,
            reveal_on_hover: true,
            reveal_over_fullscreen: false,
            sounds: false,
            language: "zh-CN".into(),
        }
    }
}

impl Settings {
    /// Read settings, falling back to defaults when the file is missing or
    /// malformed. A hand-edited typo must never stop the app from starting.
    pub fn load(root: &Path) -> Self {
        let path = root.join(SETTINGS_FILE);
        match std::fs::read_to_string(path) {
            Ok(s) => serde_json::from_str(&s).unwrap_or_default(),
            Err(_) => Self::default(),
        }
    }

    pub fn save(&self, root: &Path) -> Result<(), String> {
        let json = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        std::fs::write(root.join(SETTINGS_FILE), json).map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A scratch directory inside the build tree (see `line.rs` for why this
    /// is not `std::env::temp_dir()`).
    fn scratch(label: &str) -> std::path::PathBuf {
        let dir = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("target")
            .join("test-scratch")
            .join(format!("settings-{label}"));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn defaults_match_the_ship_hotkeys() {
        let s = Settings::default();
        assert_eq!(s.region, "control+alt+KeyH");
        assert_eq!(s.whole, "control+alt+shift+KeyH");
        assert!((s.scale - 1.0).abs() < f64::EPSILON);
        assert!(!s.open_at_login);
        assert!(s.hang_clipboard);
        assert!(s.data_dir.is_none());
        assert!(s.export_dir.is_none());
        assert!(s.keep_on_line.is_none());
        assert!(s.reveal_on_new);
        assert!(s.reveal_on_hover);
        assert!(!s.reveal_over_fullscreen);
        assert!(!s.sounds);
        assert_eq!(s.language, "zh-CN");
        assert_eq!(s.language, "zh-CN");
    }

    #[test]
    fn round_trips_through_json() {
        let dir = scratch("roundtrip");
        let s = Settings {
            data_dir: Some("C:\\Shots".into()),
            scale: 1.35,
            ..Default::default()
        };
        s.save(&dir).unwrap();
        let loaded = Settings::load(&dir);
        assert_eq!(loaded.data_dir.as_deref(), Some("C:\\Shots"));
        assert!((loaded.scale - 1.35).abs() < f64::EPSILON);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn missing_file_yields_defaults() {
        let dir = scratch("missing");
        let s = Settings::load(&dir);
        assert_eq!(s.region, DEFAULT_REGION);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn partial_json_fills_the_rest_with_defaults() {
        let dir = scratch("partial");
        std::fs::write(dir.join(SETTINGS_FILE), r#"{"scale":0.8}"#).unwrap();
        let s = Settings::load(&dir);
        assert!((s.scale - 0.8).abs() < f64::EPSILON);
        assert_eq!(s.region, DEFAULT_REGION);
        assert!(!s.open_at_login);
        assert!(s.hang_clipboard);
        assert!(s.export_dir.is_none());
        assert!(s.keep_on_line.is_none());
        assert!(s.reveal_on_new);
        assert!(s.reveal_on_hover);
        assert!(!s.reveal_over_fullscreen);
        assert!(!s.sounds);
        assert_eq!(s.language, "zh-CN");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
