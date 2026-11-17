//! "Open at login" on Windows: a value under the per-user Run key pointing at
//! the running executable, so it survives wherever the binary is installed.
//! No admin rights are needed for HKCU.

const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const VALUE_NAME: &str = "Hangboard";

/// Write or remove the Run entry.
pub fn set_enabled(enable: bool) -> Result<(), String> {
    #[cfg(windows)]
    {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let exe = exe.to_string_lossy().to_string();

        let (key, _disp) = winreg::HKCU
            .create_subkey(RUN_KEY)
            .map_err(|e| e.to_string())?;
        if enable {
            key.set_value(VALUE_NAME, &exe).map_err(|e| e.to_string())?;
        } else {
            let _ = key.delete_value(VALUE_NAME);
        }
    }
    Ok(())
}

/// Whether the Run entry currently exists.
pub fn is_enabled() -> bool {
    #[cfg(windows)]
    {
        let Ok(key) = winreg::HKCU.open_subkey(RUN_KEY) else {
            return false;
        };
        key.get_value::<String, _>(VALUE_NAME).is_ok()
    }
    #[cfg(not(windows))]
    {
        false
    }
}
