//! Offline OCR Text Recognition for Hangboard.
//!
//! Uses Windows 10/11 native `Windows.Media.Ocr` engine (zero extra runtime bloat).

use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct RecognizeResult {
    /// Full recognized OCR text, if any.
    pub text: String,
}

#[cfg(windows)]
pub mod win_ocr {
    use std::path::Path;
    use windows::Graphics::Imaging::BitmapDecoder;
    use windows::Media::Ocr::OcrEngine;
    use windows::Storage::Streams::{DataWriter, InMemoryRandomAccessStream};

    /// Recognizes text from an image file using Windows 10/11 native `Windows.Media.Ocr`.
    pub async fn recognize_text_from_path(path: &Path) -> Result<String, String> {
        let bytes = std::fs::read(path).map_err(|e| format!("Read file failed: {e}"))?;
        recognize_text_from_bytes(&bytes).await
    }

    /// Recognizes text from image bytes (e.g. PNG/JPEG).
    pub async fn recognize_text_from_bytes(bytes: &[u8]) -> Result<String, String> {
        if bytes.is_empty() {
            return Ok(String::new());
        }

        let stream = InMemoryRandomAccessStream::new()
            .map_err(|e| format!("InMemoryRandomAccessStream failed: {e}"))?;
        let writer = DataWriter::CreateDataWriter(&stream)
            .map_err(|e| format!("CreateDataWriter failed: {e}"))?;
        writer
            .WriteBytes(bytes)
            .map_err(|e| format!("WriteBytes failed: {e}"))?;
        writer
            .StoreAsync()
            .map_err(|e| format!("StoreAsync failed: {e}"))?
            .await
            .map_err(|e| format!("StoreAsync await failed: {e}"))?;
        writer
            .DetachStream()
            .map_err(|e| format!("DetachStream failed: {e}"))?;
        stream.Seek(0).map_err(|e| format!("Seek failed: {e}"))?;

        let decoder_op = BitmapDecoder::CreateAsync(&stream)
            .map_err(|e| format!("BitmapDecoder::CreateAsync failed: {e}"))?;
        let decoder = decoder_op
            .await
            .map_err(|e| format!("BitmapDecoder await failed: {e}"))?;

        let bitmap_op = decoder
            .GetSoftwareBitmapAsync()
            .map_err(|e| format!("GetSoftwareBitmapAsync failed: {e}"))?;
        let bitmap = bitmap_op
            .await
            .map_err(|e| format!("GetSoftwareBitmap await failed: {e}"))?;

        let engine = OcrEngine::TryCreateFromUserProfileLanguages()
            .map_err(|e| format!("TryCreateFromUserProfileLanguages failed: {e}"))?;

        let ocr_op = engine
            .RecognizeAsync(&bitmap)
            .map_err(|e| format!("RecognizeAsync failed: {e}"))?;
        let ocr_result = ocr_op
            .await
            .map_err(|e| format!("RecognizeAsync await failed: {e}"))?;

        let text = ocr_result
            .Text()
            .map_err(|e| format!("OcrResult::Text failed: {e}"))?;

        Ok(text.to_string())
    }
}

#[cfg(not(windows))]
pub mod win_ocr {
    use std::path::Path;

    pub async fn recognize_text_from_path(_path: &Path) -> Result<String, String> {
        Err("Native Windows OCR is only supported on Windows".to_string())
    }

    pub async fn recognize_text_from_bytes(_bytes: &[u8]) -> Result<String, String> {
        Err("Native Windows OCR is only supported on Windows".to_string())
    }
}

/// Offline OCR text recognition on an image file.
pub async fn recognize_file(path: &Path) -> Result<RecognizeResult, String> {
    let text = win_ocr::recognize_text_from_path(path)
        .await
        .unwrap_or_default();

    Ok(RecognizeResult { text })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[cfg(windows)]
    fn test_native_ocr_with_synthetic_image() {
        // Create an empty white 100x100 PNG
        let img = image::RgbImage::from_pixel(100, 100, image::Rgb([255, 255, 255]));
        let temp = std::env::temp_dir().join("hangboard_ocr_test.png");
        img.save(&temp).expect("save test png");

        let res = tauri::async_runtime::block_on(win_ocr::recognize_text_from_path(&temp));
        // Verify execution completes without panics (result may be Ok or Err depending on system language pack)
        println!("OCR result on synthetic image: {:?}", res);

        let _ = std::fs::remove_file(temp);
    }
}
