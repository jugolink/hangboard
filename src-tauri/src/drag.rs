//! Native Windows OLE drag-and-drop for dragging screenshots out of Hangboard
//! into external applications (Explorer, WeChat, QQ, VS Code, Word, etc.).

#[cfg(windows)]
pub mod imp {
    use std::path::Path;
    use windows::core::{GUID, HSTRING};
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::Com::IDataObject;
    use windows::Win32::System::Ole::{
        OleInitialize, OleUninitialize, DROPEFFECT_COPY, DROPEFFECT_LINK,
    };
    use windows::Win32::UI::Shell::{
        IShellItem, IShellItemArray, SHCreateItemFromParsingName,
        SHCreateShellItemArrayFromShellItem, SHDoDragDrop,
    };

    // BHID_DataObject = {B8C0BD9F-ED24-455C-83E6-D5390C4FE8C4}
    pub const BHID_DATA_OBJECT: GUID = GUID::from_u128(0xb8c0bd9f_ed24_455c_83e6_d5390c4fe8c4);

    /// Starts a native Windows OLE drag-and-drop operation for a file.
    ///
    /// Must be invoked on the main UI thread with an active window message loop.
    pub fn start_drag_file(path: &Path, hwnd: Option<isize>) -> Result<(), String> {
        if !path.exists() {
            return Err(format!("File does not exist: {}", path.display()));
        }

        let abs_path = if path.is_absolute() {
            path.to_path_buf()
        } else {
            std::env::current_dir()
                .map_err(|e| e.to_string())?
                .join(path)
        };

        let path_str = abs_path
            .to_str()
            .ok_or_else(|| "Path contains invalid UTF-8".to_string())?
            .to_string();

        let clean_path = if let Some(stripped) = path_str.strip_prefix(r"\\?\") {
            stripped.to_string()
        } else {
            path_str
        };

        unsafe {
            let _ = OleInitialize(None);

            let res = (|| -> windows::core::Result<()> {
                let shell_item: IShellItem =
                    SHCreateItemFromParsingName(&HSTRING::from(clean_path.as_str()), None)?;

                let shell_items: IShellItemArray =
                    SHCreateShellItemArrayFromShellItem(&shell_item)?;

                let data_object: IDataObject =
                    shell_items.BindToHandler(None, &BHID_DATA_OBJECT)?;

                let hwnd_win = hwnd.map(|h| HWND(h as *mut _));
                let _effect = SHDoDragDrop(
                    hwnd_win,
                    &data_object,
                    None,
                    DROPEFFECT_COPY | DROPEFFECT_LINK,
                )?;

                Ok(())
            })();

            if let Err(e) = &res {
                eprintln!("[drag] SHDoDragDrop error: {:?}", e);
            }

            OleUninitialize();

            res.map_err(|e| e.to_string())
        }
    }
}

#[cfg(not(windows))]
pub mod imp {
    use std::path::Path;

    pub fn start_drag_file(_path: &Path, _hwnd: Option<isize>) -> Result<(), String> {
        Err("Native drag-and-drop is only supported on Windows".to_string())
    }
}

#[cfg(test)]
mod tests {
    use std::fs::File;
    use std::io::Write;

    #[test]
    #[cfg(windows)]
    fn test_shell_item_data_object_creation() {
        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join("hangboard_drag_test.png");
        {
            let mut f = File::create(&test_file).expect("create temp test file");
            f.write_all(b"dummy image bytes").expect("write bytes");
        }

        unsafe {
            let _ = windows::Win32::System::Ole::OleInitialize(None);

            let path_str = test_file.to_str().unwrap();
            let shell_item: Result<windows::Win32::UI::Shell::IShellItem, _> =
                windows::Win32::UI::Shell::SHCreateItemFromParsingName(
                    &windows::core::HSTRING::from(path_str),
                    None,
                );
            assert!(shell_item.is_ok(), "SHCreateItemFromParsingName failed");

            let item = shell_item.unwrap();
            let items: Result<windows::Win32::UI::Shell::IShellItemArray, _> =
                windows::Win32::UI::Shell::SHCreateShellItemArrayFromShellItem(&item);
            assert!(items.is_ok(), "SHCreateShellItemArrayFromShellItem failed");

            let item_array = items.unwrap();
            let data_obj: Result<windows::Win32::System::Com::IDataObject, _> =
                item_array.BindToHandler(None, &super::imp::BHID_DATA_OBJECT);
            assert!(
                data_obj.is_ok(),
                "BindToHandler BHID_DataObject failed: {:?}",
                data_obj.err()
            );

            let obj = data_obj.unwrap();
            let fmt = windows::Win32::System::Com::FORMATETC {
                cfFormat: 15, // CF_HDROP
                ptd: std::ptr::null_mut(),
                dwAspect: windows::Win32::System::Com::DVASPECT_CONTENT.0,
                lindex: -1,
                tymed: windows::Win32::System::Com::TYMED_HGLOBAL.0 as u32,
            };
            let query = obj.QueryGetData(&fmt);
            assert_eq!(
                query,
                windows::Win32::Foundation::S_OK,
                "CF_HDROP must be supported by shell IDataObject"
            );

            windows::Win32::System::Ole::OleUninitialize();
        }

        let _ = std::fs::remove_file(test_file);
    }
}
