//! Модуль многопоточного конвейера `pipeline.rs`.
//! Выполняет параллельную пакетную обработку фотографий (RAW / JPEG / Lytro `.LFR`)
//! через `rayon::prelude::*`, отслеживает прогресс с помощью `AtomicUsize` и отправляет
//! потоковые события прогресса (`CullProgressEvent`) в графическую оболочку Tauri v2.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Instant;

use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use tracing::{error, info};

use crate::engine::{
    ai::{AiModelManager, BackendRuntimeStatus},
    cv::{analyze_image_cv, decode_photo_file, is_standard_raw_extension},
    lytro::{decode_and_analyze_lytro_container, is_lytro_extension, LytroIllumMetadata},
    xmp::{write_xmp_sidecar, ColorLabel, XmpSidecarData},
    EngineError, EngineResult,
};

/// Настраиваемые пороги отбора и генерации XMP
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CullingThresholds {
    /// Минимальный балл резкости для статуса Pick (Green, 4-5★)
    pub min_sharpness_pick: f32,
    /// Минимальный балл резкости для статуса Review (Yellow, 3★); ниже — Reject (Red, 1-2★)
    pub min_sharpness_review: f32,
    /// Минимальный эстетический балл нейросети для повышения до 5★
    pub min_aesthetic_pick: f32,
    /// Максимально допустимый модуль автоматического сдвига экспозиции EV (`crs:Exposure2012`)
    pub max_exposure_shift_ev: f32,
    /// Автоматическое спасение кадров Lytro Illum `.LFR` за счет перефокусировки 4D-поля
    pub enable_lytro_4d_salvage: bool,
}

impl Default for CullingThresholds {
    fn default() -> Self {
        Self {
            min_sharpness_pick: 62.0,
            min_sharpness_review: 38.0,
            min_aesthetic_pick: 7.2,
            max_exposure_shift_ev: 2.0,
            enable_lytro_4d_salvage: true,
        }
    }
}

/// Событие прогресса пакетной обработки, отправляемое в UI (`cull-progress`)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CullProgressEvent {
    pub completed: usize,
    pub total: usize,
    pub percentage: f32,
    pub current_file: String,
    pub active_backend: String,
}

/// Полный отчет по одному обработанному файлу фотосессии
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhotoBatchItemResult {
    pub file_name: String,
    pub file_path: String,
    pub xmp_path: String,
    pub format_badge: String,
    pub width: u32,
    pub height: u32,
    pub laplacian_variance: f64,
    pub sharpness_score: f32,
    pub aesthetic_score: f32,
    pub geometric_mean_luma: f32,
    pub exposure_ev: f32,
    pub wb_temperature: i32,
    pub wb_tint: i32,
    pub histogram_luma: Vec<u32>,
    pub rating: u8,
    pub color_label: ColorLabel,
    pub xmp_saved: bool,
    pub xmp_xml: String,
    pub lytro_meta: Option<LytroIllumMetadata>,
    pub processing_ms: u128,
    pub error_message: Option<String>,
}

/// Итоговая сводка пакетного прогона
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchSummaryReport {
    pub total_files: usize,
    pub succeeded_count: usize,
    pub failed_count: usize,
    pub salvaged_lytro_count: usize,
    pub backend_status: BackendRuntimeStatus,
    pub elapsed_total_ms: u128,
    pub items: Vec<PhotoBatchItemResult>,
}

/// Сканирует целевую директорию и собирает список поддерживаемых изображений (JPEG, PNG, RAW, Lytro `.LFR`/`.LFP`)
pub fn collect_supported_photos(folder_path: &Path) -> EngineResult<Vec<PathBuf>> {
    if !folder_path.exists() || !folder_path.is_dir() {
        return Err(EngineError::FileNotFound(folder_path.display().to_string()));
    }

    let mut files = Vec::new();
    for entry in fs::read_dir(folder_path)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_file() {
            if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                let lower = ext.to_ascii_lowercase();
                if matches!(lower.as_str(), "jpg" | "jpeg" | "png" | "tiff" | "tif" | "webp")
                    || is_standard_raw_extension(&lower)
                    || is_lytro_extension(&lower)
                {
                    files.push(path);
                }
            }
        }
    }

    files.sort();
    if files.is_empty() {
        return Err(EngineError::EmptyInput);
    }

    Ok(files)
}

/// Выполняет параллельную пакетную обработку списка файлов с использованием `rayon::par_iter`,
/// атомарного счетчика `AtomicUsize` и потокового callback-уведомления UI.
pub fn process_batch<F>(
    files: &[PathBuf],
    ai_manager: Arc<AiModelManager>,
    thresholds: &CullingThresholds,
    progress_callback: F,
) -> EngineResult<BatchSummaryReport>
where
    F: Fn(CullProgressEvent) + Send + Sync,
{
    if files.is_empty() {
        return Err(EngineError::EmptyInput);
    }

    let batch_start = Instant::now();
    let total = files.len();
    let completed_counter = AtomicUsize::new(0);
    let backend_name = ai_manager.runtime_status().active.display_name().to_string();

    info!(
        "Запуск многопоточного пайплайна process_batch для {} файлов на провайдере {}",
        total, backend_name
    );

    let items: Vec<PhotoBatchItemResult> = files
        .par_iter()
        .map(|file_path| {
            let item_start = Instant::now();
            let file_name = file_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown")
                .to_string();

            let result = process_single_photo(file_path, &ai_manager, thresholds, item_start);

            let done = completed_counter.fetch_add(1, Ordering::SeqCst) + 1;
            let percentage = ((done as f32 / total as f32) * 100.0).clamp(0.0, 100.0);

            progress_callback(CullProgressEvent {
                completed: done,
                total,
                percentage,
                current_file: file_name,
                active_backend: backend_name.clone(),
            });

            result
        })
        .collect();

    let succeeded_count = items.iter().filter(|i| i.error_message.is_none()).count();
    let failed_count = total.saturating_sub(succeeded_count);
    let salvaged_lytro_count = items
        .iter()
        .filter(|i| {
            i.lytro_meta
                .as_ref()
                .map(|m| m.salvaged_by_refocus)
                .unwrap_or(false)
        })
        .count();

    Ok(BatchSummaryReport {
        total_files: total,
        succeeded_count,
        failed_count,
        salvaged_lytro_count,
        backend_status: ai_manager.runtime_status().clone(),
        elapsed_total_ms: batch_start.elapsed().as_millis(),
        items,
    })
}

/// Обрабатывает отдельный файл (классический RAW/JPEG или пленоптический Lytro `.LFR`)
fn process_single_photo(
    path: &Path,
    ai_manager: &AiModelManager,
    thresholds: &CullingThresholds,
    item_start: Instant,
) -> PhotoBatchItemResult {
    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_uppercase();

    let step_res: EngineResult<PhotoBatchItemResult> = (|| {
        let (decoded_img, lytro_meta) = if is_lytro_extension(&ext) {
            let (img, meta) = decode_and_analyze_lytro_container(path)?;
            (img, Some(meta))
        } else {
            let img = decode_photo_file(path)?;
            (img, None)
        };

        let mut cv = analyze_image_cv(&decoded_img)?;
        let aesthetic_score = ai_manager.score_aesthetics(&decoded_img)?;

        // Если это кадр Lytro Illum и включено спасение через 4D-рефокус, используем резкость на оптимальной плоскости lambda_opt
        if let Some(ref meta) = lytro_meta {
            if thresholds.enable_lytro_4d_salvage && meta.refocused_sharpness_score > cv.sharpness_score {
                cv.sharpness_score = meta.refocused_sharpness_score;
            }
        }

        let clamped_ev = cv
            .recommended_exposure_ev
            .clamp(-thresholds.max_exposure_shift_ev, thresholds.max_exposure_shift_ev);

        let (rating, color_label) = classify_rating_and_label(
            cv.sharpness_score,
            aesthetic_score,
            lytro_meta.as_ref(),
            thresholds,
        );

        let xmp_payload = XmpSidecarData {
            rating,
            label: color_label,
            exposure_2012: clamped_ev,
            temperature_kelvin: cv.wb_temperature_kelvin,
            tint: cv.wb_tint,
            sharpness_score: cv.sharpness_score,
            aesthetic_score,
            lytro_meta: lytro_meta.clone(),
        };

        let (sidecar_path, xmp_xml) = write_xmp_sidecar(path, &xmp_payload)?;

        Ok(PhotoBatchItemResult {
            file_name: file_name.clone(),
            file_path: path.display().to_string(),
            xmp_path: sidecar_path.display().to_string(),
            format_badge: if lytro_meta.is_some() {
                "LYTRO 4D .LFR".to_string()
            } else {
                ext.clone()
            },
            width: cv.width,
            height: cv.height,
            laplacian_variance: cv.laplacian_variance,
            sharpness_score: cv.sharpness_score,
            aesthetic_score,
            geometric_mean_luma: cv.geometric_mean_luminance,
            exposure_ev: clamped_ev,
            wb_temperature: cv.wb_temperature_kelvin,
            wb_tint: cv.wb_tint,
            histogram_luma: cv.histogram_luma,
            rating,
            color_label,
            xmp_saved: true,
            xmp_xml,
            lytro_meta,
            processing_ms: item_start.elapsed().as_millis(),
            error_message: None,
        })
    })();

    match step_res {
        Ok(item) => item,
        Err(err) => {
            error!("Ошибка обработки кадра {}: {}", path.display(), err);
            PhotoBatchItemResult {
                file_name,
                file_path: path.display().to_string(),
                xmp_path: String::new(),
                format_badge: ext,
                width: 0,
                height: 0,
                laplacian_variance: 0.0,
                sharpness_score: 0.0,
                aesthetic_score: 0.0,
                geometric_mean_luma: 0.0,
                exposure_ev: 0.0,
                wb_temperature: 5500,
                wb_tint: 0,
                histogram_luma: Vec::new(),
                rating: 1,
                color_label: ColorLabel::Red,
                xmp_saved: false,
                xmp_xml: String::new(),
                lytro_meta: None,
                processing_ms: item_start.elapsed().as_millis(),
                error_message: Some(err.to_string()),
            }
        }
    }
}

/// Детерминированное правило присвоения звездного рейтинга `1..5` и цветовой метки Adobe XMP
fn classify_rating_and_label(
    sharpness: f32,
    aesthetic: f32,
    lytro_meta: Option<&LytroIllumMetadata>,
    thresholds: &CullingThresholds,
) -> (u8, ColorLabel) {
    if let Some(meta) = lytro_meta {
        if thresholds.enable_lytro_4d_salvage && meta.salvaged_by_refocus && sharpness >= thresholds.min_sharpness_pick {
            let stars = if aesthetic >= thresholds.min_aesthetic_pick { 5 } else { 4 };
            return (stars, ColorLabel::Blue);
        }
    }

    if sharpness >= thresholds.min_sharpness_pick {
        if aesthetic >= thresholds.min_aesthetic_pick {
            (5, ColorLabel::Green)
        } else {
            (4, ColorLabel::Green)
        }
    } else if sharpness >= thresholds.min_sharpness_review {
        (3, ColorLabel::Yellow)
    } else if sharpness >= thresholds.min_sharpness_review * 0.6 {
        (2, ColorLabel::Red)
    } else {
        (1, ColorLabel::Red)
    }
}
