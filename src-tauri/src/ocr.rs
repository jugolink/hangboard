//! Offline OCR and QR Code Recognition for Hangboard.
//!
//! Uses Windows 10/11 native `Windows.Media.Ocr` engine (zero extra runtime bloat)
//! and pure-Rust `rqrr` for lightning-fast QR code detection.

use serde::Serialize;
use std::path::Path;

#[derive(Serialize, Clone, Debug, Default)]
pub struct RecognizeResult {
    /// Full recognized OCR text, if any.
    pub text: String,
    /// Detected QR code contents (URLs or text).
    pub qr_codes: Vec<String>,
    /// Whether any QR code was found.
    pub has_qr: bool,
    /// Primary text to copy to clipboard (prefers QR content if present, else OCR text).
    pub primary_text: String,
    /// Whether primary text is a web URL.
    pub is_url: bool,
}

/// Detects QR code(s) from an image file using `rqrr`.
pub fn detect_qr_from_path(path: &Path) -> Vec<String> {
    let Ok(img) = image::open(path) else {
        return Vec::new();
    };
    detect_qr_from_image(&img)
}

/// Detects QR code(s) from a loaded dynamic image.
pub fn detect_qr_from_image(img: &image::DynamicImage) -> Vec<String> {
    let luma = img.to_luma8();
    let mut prepared = rqrr::PreparedImage::prepare(luma);
    let grids = prepared.detect_grids();
    let mut results = Vec::new();

    for grid in grids {
        if let Ok((_meta, content)) = grid.decode() {
            if !content.trim().is_empty() {
                results.push(content);
            }
        }
    }

    results
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

/// Combined OCR and QR recognition on an image file.
pub async fn recognize_file(path: &Path) -> Result<RecognizeResult, String> {
    let qr_codes = detect_qr_from_path(path);
    let ocr_text = win_ocr::recognize_text_from_path(path)
        .await
        .unwrap_or_default();

    let has_qr = !qr_codes.is_empty();
    let primary_text = if has_qr {
        qr_codes[0].clone()
    } else {
        ocr_text.clone()
    };

    let trimmed = primary_text.trim();
    let is_url = trimmed.starts_with("http://") || trimmed.starts_with("https://");

    Ok(RecognizeResult {
        text: ocr_text,
        qr_codes,
        has_qr,
        primary_text,
        is_url,
    })
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

    #[test]
    fn test_qr_empty_on_blank_image() {
        let img = image::DynamicImage::ImageRgb8(image::RgbImage::new(100, 100));
        let qrs = detect_qr_from_image(&img);
        assert!(qrs.is_empty());
    }
}
