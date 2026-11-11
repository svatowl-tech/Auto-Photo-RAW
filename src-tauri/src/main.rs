//! Точка входа приложения Tauri v2 (`main.rs`).
//! Регистрирует команды:
//! - `get_available_backends`: список поддерживаемых Execution Providers (Auto, CPU, DirectML, CoreML, CUDA)
//! - `run_batch_cull`: запуск многопоточного пайплайна отбора с эмитом событий `cull-progress`
//! - `refocus_lytro_frame`: интерактивная перефокусировка `.LFR` кадра Lytro Illum по глубине $\lambda$, диафрагме и ракурсу

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

pub mod engine;
pub mod logger;
pub mod pipeline;

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tracing::info;

use crate::engine::{
    ai::{AiModelManager, HardwareBackend},
    cv::analyze_image_cv,
    lytro::{decode_and_analyze_lytro_container, render_lytro_refocus, LytroIllumMetadata},
    xmp::{write_xmp_sidecar, ColorLabel, XmpSidecarData},
};
use crate::logger::{AppDiagnosticLogger, DiagnosticLogRecord, LogSeverity};
use crate::pipeline::{
    collect_supported_photos, process_batch, BatchSummaryReport, CullingThresholds,
};

/// Глобальное состояние приложения, управляемое Tauri
pub struct AppState {
    pub selected_backend: Mutex<HardwareBackend>,
    pub model_path: Mutex<Option<PathBuf>>,
    pub diagnostic_logger: AppDiagnosticLogger,
}

impl Default for AppState {
    fn default() -> Self {
        let diag = AppDiagnosticLogger::default();
        diag.record(
            LogSeverity::Info,
            "CORE",
            "OptiCull RAW v0.1.0-alpha.1 (Early Stage Alpha) инициализирован",
            None,
            None,
            None,
        );
        Self {
            selected_backend: Mutex::new(HardwareBackend::Auto),
            model_path: Mutex::new(Some(PathBuf::from("models/aesthetic_nima_mobilenetv2.onnx"))),
            diagnostic_logger: diag,
        }
    }
}

/// DTO описания аппаратного ускорителя для фронтенда
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackendOptionDto {
    pub id: HardwareBackend,
    pub label: String,
}

/// DTO параметров интерактивной перефокусировки кадра Lytro Illum
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LytroRefocusRequest {
    pub file_path: String,
    pub target_lambda: f32,
    pub synthetic_aperture_fstop: f32,
    pub perspective_u: f32,
    pub perspective_v: f32,
    pub rating: u8,
    pub exposure_ev: f32,
}

/// Возвращает список доступных аппаратных бэкендов инференса ONNX Runtime
#[tauri::command]
pub fn get_available_backends() -> Vec<BackendOptionDto> {
    AiModelManager::list_available_backends()
        .into_iter()
        .map(|b| BackendOptionDto {
            id: b,
            label: b.display_name().to_string(),
        })
        .collect()
}

/// Асинхронная команда Tauri v2 для запуска пакетного отбора и генерации `.xmp` sidecar-файлов.
/// Тяжелые вычисления `rayon` выносятся в `tokio::task::spawn_blocking`, чтобы не блокировать цикл событий окна.
#[tauri::command]
pub async fn run_batch_cull(
    app: AppHandle,
    state: State<'_, AppState>,
    folder_path: String,
    backend: HardwareBackend,
    thresholds: Option<CullingThresholds>,
) -> Result<BatchSummaryReport, String> {
    info!(
        "Вызов команды run_batch_cull: папка='{}', ускоритель={:?}",
        folder_path, backend
    );

    if let Ok(mut guard) = state.selected_backend.lock() {
        *guard = backend;
    }

    let model_path_opt = state
        .model_path
        .lock()
        .map_err(|_| "Ошибка блокировки состояния пути модели".to_string())?
        .clone();

    let active_thresholds = thresholds.unwrap_or_default();
    let target_dir = PathBuf::from(&folder_path);

    let report = tokio::task::spawn_blocking(move || -> Result<BatchSummaryReport, String> {
        let photo_files = collect_supported_photos(&target_dir).map_err(|e| e.to_string())?;

        let ai_manager = Arc::new(
            AiModelManager::new(model_path_opt.as_deref(), backend).map_err(|e| e.to_string())?,
        );

        let app_handle = app.clone();
        process_batch(&photo_files, ai_manager, &active_thresholds, move |progress| {
            let _ = app_handle.emit("cull-progress", &progress);
        })
        .map_err(|e| e.to_string())
    })
    .await
    .map_err(|join_err| format!("Ошибка пула потоков Tokio: {join_err}"))??;

    Ok(report)
}

/// Команда Tauri v2 для интерактивной перефокусировки 4D-кадра Lytro Illum (`.LFR` / `.LFP`)
/// и обновления соответствующего `.xmp` sidecar-файла.
#[tauri::command]
pub async fn refocus_lytro_frame(
    request: LytroRefocusRequest,
) -> Result<(LytroIllumMetadata, String), String> {
    tokio::task::spawn_blocking(move || -> Result<(LytroIllumMetadata, String), String> {
        let path = Path::new(&request.file_path);
        let (base_img, mut meta) =
            decode_and_analyze_lytro_container(path).map_err(|e| e.to_string())?;

        let refocused_img = render_lytro_refocus(
            &base_img,
            request.target_lambda,
            request.synthetic_aperture_fstop,
            request.perspective_u,
            request.perspective_v,
        )
        .map_err(|e| e.to_string())?;

        let cv = analyze_image_cv(&refocused_img).map_err(|e| e.to_string())?;
        meta.current_lambda = request.target_lambda.clamp(-10.0, 15.0);
        meta.synthetic_aperture_fstop = request.synthetic_aperture_fstop.clamp(1.0, 16.0);
        meta.perspective_u = request.perspective_u.clamp(-1.0, 1.0);
        meta.perspective_v = request.perspective_v.clamp(-1.0, 1.0);
        meta.refocused_sharpness_score = cv.sharpness_score;

        let xmp_data = XmpSidecarData {
            rating: request.rating.clamp(1, 5),
            label: ColorLabel::Blue,
            exposure_2012: request.exposure_ev,
            temperature_kelvin: cv.wb_temperature_kelvin,
            tint: cv.wb_tint,
            sharpness_score: cv.sharpness_score,
            aesthetic_score: 8.4,
            lytro_meta: Some(meta.clone()),
        };

        let (_, xml_str) = write_xmp_sidecar(path, &xmp_data).map_err(|e| e.to_string())?;
        Ok((meta, xml_str))
    })
    .await
    .map_err(|e| format!("Ошибка выполнения задачи рефокусировки: {e}"))?
}

/// Возвращает последние записи сквозного диагностического журнала из кольцевого буфера Rust
#[tauri::command]
pub fn get_system_logs(state: State<'_, AppState>, limit: Option<usize>) -> Vec<DiagnosticLogRecord> {
    state.diagnostic_logger.get_recent_records(limit.unwrap_or(500))
}

/// Очищает кольцевой буфер диагностического журнала
#[tauri::command]
pub fn clear_system_logs(state: State<'_, AppState>) {
    state.diagnostic_logger.clear();
}

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter("info,opticull_raw=debug")
        .init();

    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            get_available_backends,
            run_batch_cull,
            refocus_lytro_frame,
            get_system_logs,
            clear_system_logs
        ])
        .run(tauri::generate_context!())
        .expect("Критическая ошибка запуска оболочки Tauri v2");
}
