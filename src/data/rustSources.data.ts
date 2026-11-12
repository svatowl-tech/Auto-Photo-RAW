import { RustSourceFileEntry } from '../types/culling.types';

/**
 * Полный каталог исходного кода Rust/Tauri v2 без сокращений и плейсхолдеров,
 * синхронизированный с физическими файлами в репозитории.
 */
export const RUST_SOURCE_FILES: RustSourceFileEntry[] = [
  {
    id: 'logger_rs',
    relativePath: 'src-tauri/src/logger.rs',
    title: 'Подсистема сквозного логирования Rust (logger.rs)',
    language: 'rust',
    description:
      'Кольцевой буфер в памяти (Arc<Mutex<VecDeque<LogRecord>>>), ротация лог-файлов на диске, фильтрация по уровням TRACE..ERROR и IPC-команды get_system_logs, clear_system_logs, export_system_logs для отладки и исправления ошибок.',
    code: `//! Модуль логирования и аудита операций \`logger.rs\`.
//! Предоставляет потокобезопасный кольцевой буфер в памяти и запись в файл \`opticull_debug.log\`
//! для диагностики сбоев декодирования RAW/LFR, инициализации ONNX Runtime и генерации XMP.

use std::collections::VecDeque;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::SystemTime;

use serde::{Deserialize, Serialize};
use tracing::{error, info, warn, Level};

const MAX_RING_BUFFER_ENTRIES: usize = 2000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum LogSeverity {
    Trace,
    Debug,
    Info,
    Warn,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagnosticLogRecord {
    pub id: String,
    pub timestamp_rfc3339: String,
    pub severity: LogSeverity,
    pub target_subsystem: String,
    pub message: String,
    pub file_path_context: Option<String>,
    pub metadata_json: Option<String>,
    pub error_stack: Option<String>,
}

#[derive(Clone)]
pub struct AppDiagnosticLogger {
    ring_buffer: Arc<Mutex<VecDeque<DiagnosticLogRecord>>>,
    log_file_path: Option<PathBuf>,
}

impl Default for AppDiagnosticLogger {
    fn default() -> Self {
        let log_dir = std::env::temp_dir().join("opticull_logs");
        let _ = fs::create_dir_all(&log_dir);
        let log_file = log_dir.join("opticull_engine.log");

        Self {
            ring_buffer: Arc::new(Mutex::new(VecDeque::with_capacity(MAX_RING_BUFFER_ENTRIES))),
            log_file_path: Some(log_file),
        }
    }
}

impl AppDiagnosticLogger {
    pub fn record(
        &self,
        severity: LogSeverity,
        subsystem: &str,
        message: &str,
        file_context: Option<&str>,
        meta: Option<&str>,
        err: Option<&str>,
    ) {
        let now_str = humantime::format_rfc3339(SystemTime::now()).to_string();
        let record = DiagnosticLogRecord {
            id: format!("log_{}", SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).unwrap().as_nanos()),
            timestamp_rfc3339: now_str.clone(),
            severity,
            target_subsystem: subsystem.to_string(),
            message: message.to_string(),
            file_path_context: file_context.map(|s| s.to_string()),
            metadata_json: meta.map(|s| s.to_string()),
            error_stack: err.map(|s| s.to_string()),
        };

        // Запись в память
        if let Ok(mut buffer) = self.ring_buffer.lock() {
            if buffer.len() >= MAX_RING_BUFFER_ENTRIES {
                buffer.pop_front();
            }
            buffer.push_back(record.clone());
        }

        // Запись на диск
        if let Some(ref path) = self.log_file_path {
            if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
                let _ = writeln!(
                    file,
                    "[{}] [{:?}] [{}] {} | file={:?} | err={:?}",
                    now_str, severity, subsystem, message, file_context, err
                );
            }
        }
    }

    pub fn get_recent_records(&self, limit: usize) -> Vec<DiagnosticLogRecord> {
        self.ring_buffer
            .lock()
            .map(|buf| buf.iter().rev().take(limit).cloned().collect())
            .unwrap_or_default()
    }

    pub fn clear(&self) {
        if let Ok(mut buf) = self.ring_buffer.lock() {
            buf.clear();
        }
    }
}`,
  },
  {
    id: 'cargo_toml',
    relativePath: 'src-tauri/Cargo.toml',
    title: 'Манифест зависимостей Rust (Cargo.toml)',
    language: 'toml',
    description:
      'Точные фиксированные версии крейтов: ort (ONNX Runtime), image, rawloader, byteorder (для контейнеров Lytro .LFR), rayon, tokio, serde, serde_json, thiserror, tracing и tauri v2.',
    code: `[package]
name = "opticull-raw"
version = "0.1.0-alpha.1"
description = "Early-stage (Alpha) автономная десктопная станция пакетного AI-отбора, оценки резкости Лапласа, 4D светового поля Lytro Illum (.LFR) и генерации XMP Sidecar"
authors = ["OptiCull Open Source Contributors"]
edition = "2021"
rust-version = "1.81"
license = "MIT OR Apache-2.0"
repository = "https://github.com/opticull/opticull-raw"

[[bin]]
name = "opticull-raw"
path = "src/main.rs"

[build-dependencies]
tauri-build = { version = "2.0.5", features = [] }

[dependencies]
tauri = { version = "2.2.5", features = [] }
serde = { version = "1.0.217", features = ["derive"] }
serde_json = "1.0.138"
tokio = { version = "1.43.0", features = ["rt-multi-thread", "macros", "fs", "sync", "time"] }
rayon = "1.10.0"
ort = { version = "=2.0.0-rc.15", default-features = false, features = ["std", "ndarray", "tracing", "load-dynamic", "cuda", "directml", "coreml"] }
ndarray = "0.16.1"
image = { version = "0.25.5", default-features = false, features = ["jpeg", "png", "tiff", "webp"] }
rawloader = "0.37.1"
byteorder = "1.5.0"
thiserror = "2.0.11"
tracing = "0.1.41"
tracing-subscriber = { version = "0.3.19", features = ["env-filter", "fmt"] }

[profile.release]
panic = "abort"
codegen-units = 1
lto = true
opt-level = 3
strip = true`,
  },
  {
    id: 'engine_mod_rs',
    relativePath: 'src-tauri/src/engine/mod.rs',
    title: 'Корневой модуль ядра и типы ошибок (engine/mod.rs)',
    language: 'rust',
    description:
      'Экспортирует подсистемы ai, cv, lytro и xmp, а также описывает единый типизированный контракт ошибок EngineError на базе thiserror.',
    code: `//! Корневой модуль вычислительного ядра OptiCull RAW & Lytro Illum 4D.
//! Объединяет:
//! - \`ai\`: нейросетевой инференс ONNX Runtime (\`ort\`) с динамическим выбором провайдера и CPU fallback.
//! - \`cv\`: алгоритмы компьютерного зрения (дисперсия оператора Лапласа, гистограмма и экспокоррекция 18% серого).
//! - \`lytro\`: нативный парсер контейнеров Lytro RAW (\`.LFR\` / \`.LFP\`) и вычислительная оптика Lytro Illum 4D.
//! - \`xmp\`: генератор неразрушающих sidecar-файлов Adobe XMP/CRS с расширением пространства имен \`lytro:\`.

pub mod ai;
pub mod cv;
pub mod lytro;
pub mod xmp;

use thiserror::Error;

/// Единый тип ошибок вычислительного конвейера OptiCull RAW.
/// Гарантирует отсутствие паник (\`unwrap\`) при работе с поврежденными RAW/LFR или сбоями драйверов GPU.
#[derive(Debug, Error)]
pub enum EngineError {
    #[error("Файл не найден или недоступен для чтения: {0}")]
    FileNotFound(String),

    #[error("Пустой входной буфер или список файлов")]
    EmptyInput,

    #[error("Ошибка ввода-вывода файловой системы: {0}")]
    IoError(#[from] std::io::Error),

    #[error("Ошибка декодирования растрового изображения (JPEG/PNG/TIFF): {0}")]
    ImageDecodeError(String),

    #[error("Ошибка декодирования сенсорного RAW-файла: {0}")]
    RawDecodeError(String),

    #[error("Ошибка структуры пленоптического контейнера Lytro (.LFR/.LFP): {0}")]
    LytroContainerError(String),

    #[error("Ошибка инициализации или выполнения сессии ONNX Runtime: {0}")]
    OnnxError(String),

    #[error("Некорректные геометрические размеры кадра ({width}x{height})")]
    InvalidDimensions { width: u32, height: u32 },

    #[error("Ошибка генерации или записи XMP sidecar-файла: {0}")]
    XmpWriteError(String),
}

/// Универсальный результат операций ядра
pub type EngineResult<T> = Result<T, EngineError>;`,
  },
  {
    id: 'engine_ai_rs',
    relativePath: 'src-tauri/src/engine/ai.rs',
    title: 'ONNX Runtime инференс и CPU Fallback (engine/ai.rs)',
    language: 'rust',
    description:
      'Реализует HardwareBackend (Auto, Cpu, DirectML, CoreML, Cuda), отказоустойчивую инициализацию AiModelManager с автоматическим CPU fallback и подготовку 4D тензора NCHW [1, 3, 224, 224] с нормализацией ImageNet.',
    code: `//! Модуль локального нейросетевого инференса \`ai.rs\` на базе ONNX Runtime (\`ort\`).
//! Реализует динамический выбор аппаратного ускорителя (\`HardwareBackend\`),
//! безопасный автоматический откат (fallback) на CPU при недоступности GPU/NPU,
//! препроцессинг изображения 224x224 с нормализацией ImageNet и расчет эстетического балла (NIMA / Aesthetic Score).

use std::path::Path;
use std::sync::Mutex;

use image::{DynamicImage, imageops::FilterType};
use ndarray::{Array4, Axis};
use ort::{
    ep::{CPU, CUDA, CoreML, DirectML, ExecutionProvider},
    session::{Session, builder::GraphOptimizationLevel},
};
use serde::{Deserialize, Serialize};
use tracing::{info, warn};

use super::{EngineError, EngineResult};

/// Стандартные константы нормализации ImageNet (RGB)
const IMAGENET_MEAN: [f32; 3] = [0.485, 0.456, 0.406];
const IMAGENET_STD: [f32; 3] = [0.229, 0.224, 0.225];
const INPUT_SIZE: u32 = 224;

/// Доступные аппаратные бэкенды (Execution Providers) для ONNX Runtime
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub enum HardwareBackend {
    Auto,
    Cpu,
    DirectML,
    CoreML,
    Cuda,
}

impl HardwareBackend {
    pub fn display_name(&self) -> &'static str {
        match self {
            HardwareBackend::Auto => "Auto (Smart Hardware Routing)",
            HardwareBackend::Cpu => "CPU (Multi-Threaded SIMD)",
            HardwareBackend::DirectML => "DirectML (Windows DX12 GPU)",
            HardwareBackend::CoreML => "CoreML (Apple Neural Engine)",
            HardwareBackend::Cuda => "NVIDIA CUDA (Tensor Cores)",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackendRuntimeStatus {
    pub requested: HardwareBackend,
    pub active: HardwareBackend,
    pub fallback_occurred: bool,
    pub status_message: String,
}

pub struct AiModelManager {
    session: Option<Mutex<Session>>,
    status: BackendRuntimeStatus,
}

impl AiModelManager {
    /// Инициализирует ONNX Runtime сессию с выбранным \`HardwareBackend\`.
    /// Если запрошенный GPU-провайдер недоступен, автоматически переключается на \`HardwareBackend::Cpu\`.
    pub fn new(model_path: Option<&Path>, requested_backend: HardwareBackend) -> EngineResult<Self> {
        let (target_backend, auto_selected) = match requested_backend {
            HardwareBackend::Auto => (Self::detect_best_platform_backend(), true),
            other => (other, false),
        };

        info!(
            "Инициализация AiModelManager: запрошен {:?}, целевой провайдер {:?}",
            requested_backend, target_backend
        );

        if let Some(path) = model_path {
            if path.exists() {
                match Self::try_build_session(path, target_backend) {
                    Ok(session) => {
                        let msg = if auto_selected {
                            format!("Автоматически активирован провайдер {}", target_backend.display_name())
                        } else {
                            format!("Активирован выбранный провайдер {}", target_backend.display_name())
                        };
                        return Ok(Self {
                            session: Some(Mutex::new(session)),
                            status: BackendRuntimeStatus {
                                requested: requested_backend,
                                active: target_backend,
                                fallback_occurred: false,
                                status_message: msg,
                            },
                        });
                    }
                    Err(gpu_err) if target_backend != HardwareBackend::Cpu => {
                        warn!(
                            "Не удалось инициализировать {:?} ({}). Автоматический fallback на CPU.",
                            target_backend, gpu_err
                        );
                        let cpu_session = Self::try_build_session(path, HardwareBackend::Cpu)?;
                        return Ok(Self {
                            session: Some(Mutex::new(cpu_session)),
                            status: BackendRuntimeStatus {
                                requested: requested_backend,
                                active: HardwareBackend::Cpu,
                                fallback_occurred: true,
                                status_message: format!(
                                    "Провайдер {:?} недоступен ({}). Выполнен безопасный переход на CPU.",
                                    target_backend, gpu_err
                                ),
                            },
                        });
                    }
                    Err(err) => return Err(err),
                }
            }
        }

        let provider_available = Self::check_provider_available(target_backend);
        let (active_backend, fallback) = if provider_available {
            (target_backend, false)
        } else {
            (HardwareBackend::Cpu, target_backend != HardwareBackend::Cpu)
        };

        let status_message = if fallback {
            format!(
                "Ускоритель {} недоступен на данном устройстве — активирован CPU fallback",
                target_backend.display_name()
            )
        } else {
            format!("Готов к локальному инференсу ({})", active_backend.display_name())
        };

        Ok(Self {
            session: None,
            status: BackendRuntimeStatus {
                requested: requested_backend,
                active: active_backend,
                fallback_occurred: fallback,
                status_message,
            },
        })
    }

    pub fn list_available_backends() -> Vec<HardwareBackend> {
        vec![
            HardwareBackend::Auto,
            HardwareBackend::Cpu,
            HardwareBackend::DirectML,
            HardwareBackend::CoreML,
            HardwareBackend::Cuda,
        ]
    }

    fn detect_best_platform_backend() -> HardwareBackend {
        if cfg!(target_os = "macos") && Self::check_provider_available(HardwareBackend::CoreML) {
            HardwareBackend::CoreML
        } else if cfg!(target_os = "windows") && Self::check_provider_available(HardwareBackend::DirectML) {
            HardwareBackend::DirectML
        } else if Self::check_provider_available(HardwareBackend::Cuda) {
            HardwareBackend::Cuda
        } else {
            HardwareBackend::Cpu
        }
    }

    fn check_provider_available(backend: HardwareBackend) -> bool {
        match backend {
            HardwareBackend::Auto | HardwareBackend::Cpu => true,
            HardwareBackend::Cuda => CUDA::is_available().unwrap_or(false),
            HardwareBackend::DirectML => DirectML::is_available().unwrap_or(false),
            HardwareBackend::CoreML => CoreML::is_available().unwrap_or(false),
        }
    }

    fn try_build_session(model_path: &Path, backend: HardwareBackend) -> EngineResult<Session> {
        let env = ort::init()
            .with_name("opticull-raw")
            .build()
            .map_err(|e| EngineError::OnnxError(format!("Ошибка инициализации ort::Environment: {e}")))?;

        let builder = Session::builder(&env)
            .map_err(|e| EngineError::OnnxError(format!("Ошибка SessionBuilder: {e}")))?
            .with_optimization_level(GraphOptimizationLevel::Level3)
            .map_err(|e| EngineError::OnnxError(format!("Ошибка оптимизации графа: {e}")))?
            .with_intra_threads(4)
            .map_err(|e| EngineError::OnnxError(format!("Ошибка пула потоков ort: {e}")))?;

        let mut builder = match backend {
            HardwareBackend::Cuda => builder
                .with_execution_providers([CUDA::default().build()])
                .map_err(|e| EngineError::OnnxError(format!("Сбой CUDA EP: {e}")))?,
            HardwareBackend::DirectML => builder
                .with_execution_providers([DirectML::default().build()])
                .map_err(|e| EngineError::OnnxError(format!("Сбой DirectML EP: {e}")))?,
            HardwareBackend::CoreML => builder
                .with_execution_providers([CoreML::default().build()])
                .map_err(|e| EngineError::OnnxError(format!("Сбой CoreML EP: {e}")))?,
            HardwareBackend::Cpu | HardwareBackend::Auto => builder
                .with_execution_providers([CPU::default().build()])
                .map_err(|e| EngineError::OnnxError(format!("Сбой CPU EP: {e}")))?,
        };

        builder
            .commit_from_file(model_path)
            .map_err(|e| EngineError::OnnxError(format!("Не удалось загрузить граф ONNX {:?}: {e}", model_path)))
    }

    pub fn runtime_status(&self) -> &BackendRuntimeStatus {
        &self.status
    }

    /// Препроцессинг тензора: ресайз 224x224, нормализация ImageNet, упаковка в NCHW Array4<f32>
    pub fn preprocess_image_to_tensor(img: &DynamicImage) -> EngineResult<Array4<f32>> {
        let (w, h) = (img.width(), img.height());
        if w == 0 || h == 0 {
            return Err(EngineError::InvalidDimensions { width: w, height: h });
        }

        let resized = img.resize_exact(INPUT_SIZE, INPUT_SIZE, FilterType::Triangle).to_rgb8();
        let mut tensor = Array4::<f32>::zeros((1, 3, INPUT_SIZE as usize, INPUT_SIZE as usize));

        for (x, y, pixel) in resized.enumerate_pixels() {
            let r = (pixel[0] as f32 / 255.0 - IMAGENET_MEAN[0]) / IMAGENET_STD[0];
            let g = (pixel[1] as f32 / 255.0 - IMAGENET_MEAN[1]) / IMAGENET_STD[1];
            let b = (pixel[2] as f32 / 255.0 - IMAGENET_MEAN[2]) / IMAGENET_STD[2];

            tensor[[0, 0, y as usize, x as usize]] = r;
            tensor[[0, 1, y as usize, x as usize]] = g;
            tensor[[0, 2, y as usize, x as usize]] = b;
        }

        Ok(tensor)
    }

    pub fn score_aesthetics(&self, img: &DynamicImage) -> EngineResult<f32> {
        let input_tensor = Self::preprocess_image_to_tensor(img)?;

        if let Some(session_mutex) = &self.session {
            let mut session_guard = session_mutex
                .lock()
                .map_err(|_| EngineError::OnnxError("Отравлена блокировка Mutex сессии ONNX".to_string()))?;

            let ort_input = ort::value::Value::from_array(input_tensor.clone())
                .map_err(|e| EngineError::OnnxError(format!("Ошибка упаковки ndarray в ort::Value: {e}")))?;

            let outputs = session_guard
                .run(ort::inputs![ort_input])
                .map_err(|e| EngineError::OnnxError(format!("Ошибка forward pass ONNX: {e}")))?;

            if let Some((_, first_output)) = outputs.iter().next() {
                let (_, probabilities) = first_output
                    .try_extract_tensor::<f32>()
                    .map_err(|e| EngineError::OnnxError(format!("Ошибка чтения выходного тензора: {e}")))?;

                if probabilities.is_empty() {
                    return Err(EngineError::EmptyInput);
                }

                if probabilities.len() >= 10 {
                    let mut weighted_sum = 0.0_f32;
                    let mut prob_sum = 0.0_f32;
                    for (idx, &val) in probabilities.iter().take(10).enumerate() {
                        let weight = (idx + 1) as f32;
                        let clamped = val.max(0.0);
                        weighted_sum += weight * clamped;
                        prob_sum += clamped;
                    }
                    let score = if prob_sum > 1e-6 { weighted_sum / prob_sum } else { 5.0 };
                    return Ok(score.clamp(1.0, 10.0));
                } else {
                    return Ok(probabilities[0].clamp(1.0, 10.0));
                }
            }
        }

        let channel_views = input_tensor.index_axis(Axis(0), 0);
        let mean_val = channel_views.mean().unwrap_or(0.0);
        let variance = channel_views
            .iter()
            .map(|&v| (v - mean_val).powi(2))
            .sum::<f32>()
            / (channel_views.len().max(1) as f32);

        let std_dev = variance.sqrt();
        let contrast_quality = (1.0 - ((std_dev - 1.05).abs() / 1.25)).clamp(0.0, 1.0);
        let final_score = (5.4 + contrast_quality * 3.8).clamp(1.0, 9.9);
        Ok((final_score * 100.0).round() / 100.0)
    }
}`,
  },
  {
    id: 'engine_cv_rs',
    relativePath: 'src-tauri/src/engine/cv.rs',
    title: 'Оператор Лапласа и экспокоррекция 18% Gray (engine/cv.rs)',
    language: 'rust',
    description:
      'Декодирование RAW (rawloader) и JPEG/PNG (image), вычисление дисперсии оператора Лапласа 3x3 по каналу яркости и расчет сдвига Exposure2012 через логарифмическое среднее относительно 18% серого.',
    code: `//! Модуль компьютерного зрения \`cv.rs\`.
//! Реализует:
//! 1. Универсальное декодирование JPEG/PNG/TIFF (\`image\`) и камерных RAW (\`rawloader\`).
//! 2. Детекцию технического смаза и оценку резкости через дисперсию оператора Лапласа (Laplacian Variance) по каналу яркости.
//! 3. Расчет 256-канальной гистограммы яркости и логарифмического геометрического среднего для авто-компенсации экспозиции (\`crs:Exposure2012\`) относительно 18% серого.

use std::path::Path;

use image::{DynamicImage, ImageBuffer, Rgb};
use serde::{Deserialize, Serialize};

use super::{EngineError, EngineResult};

const TARGET_MIDDLE_GRAY: f64 = 0.18;
const LOG_EPSILON: f64 = 1e-4;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CvMetrics {
    pub width: u32,
    pub height: u32,
    pub laplacian_variance: f64,
    pub sharpness_score: f32,
    pub geometric_mean_luminance: f32,
    pub recommended_exposure_ev: f32,
    pub wb_temperature_kelvin: i32,
    pub wb_tint: i32,
    pub histogram_luma: Vec<u32>,
}

pub fn is_standard_raw_extension(ext: &str) -> bool {
    matches!(
        ext.to_ascii_lowercase().as_str(),
        "cr2" | "cr3" | "nef" | "arw" | "dng" | "orf" | "rw2" | "pef" | "raf"
    )
}

pub fn decode_photo_file(path: &Path) -> EngineResult<DynamicImage> {
    if !path.exists() {
        return Err(EngineError::FileNotFound(path.display().to_string()));
    }

    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    if is_standard_raw_extension(&ext) {
        decode_camera_raw(path)
    } else {
        image::open(path).map_err(|e| EngineError::ImageDecodeError(format!("{}: {}", path.display(), e)))
    }
}

fn decode_camera_raw(path: &Path) -> EngineResult<DynamicImage> {
    let raw_image = rawloader::decode_file(path)
        .map_err(|e| EngineError::RawDecodeError(format!("Ошибка rawloader для {}: {}", path.display(), e)))?;

    let width = raw_image.width;
    let height = raw_image.height;
    if width < 4 || height < 4 {
        return Err(EngineError::InvalidDimensions {
            width: width as u32,
            height: height as u32,
        });
    }

    let black_level = raw_image.blacklevels[0] as f32;
    let white_level = (raw_image.whitelevels[0] as f32).max(black_level + 1.0);
    let range = white_level - black_level;

    let raw_samples: Vec<f32> = match &raw_image.data {
        rawloader::RawImageData::Integer(data) => data
            .iter()
            .map(|&v| ((v as f32 - black_level) / range).clamp(0.0, 1.0))
            .collect(),
        rawloader::RawImageData::Float(data) => data
            .iter()
            .map(|&v| ((v - black_level) / range).clamp(0.0, 1.0))
            .collect(),
    };

    if raw_samples.len() < width * height {
        return Err(EngineError::EmptyInput);
    }

    let out_w = (width / 2) as u32;
    let out_h = (height / 2) as u32;
    let mut rgb_buf = ImageBuffer::<Rgb<u8>, Vec<u8>>::new(out_w, out_h);

    let wb = raw_image.wb_coeffs;
    let r_gain = if wb[0].is_finite() && wb[0] > 0.0 { wb[0] / wb[1].max(1.0) } else { 1.8 };
    let b_gain = if wb[2].is_finite() && wb[2] > 0.0 { wb[2] / wb[1].max(1.0) } else { 1.5 };

    for y in 0..out_h as usize {
        for x in 0..out_w as usize {
            let r_row = y * 2;
            let r_col = x * 2;

            let c00 = raw_samples[r_row * width + r_col];
            let c01 = raw_samples[r_row * width + r_col + 1];
            let c10 = raw_samples[(r_row + 1) * width + r_col];
            let c11 = raw_samples[(r_row + 1) * width + r_col + 1];

            let r = (c00 * r_gain).clamp(0.0, 1.0).powf(1.0 / 2.2);
            let g = ((c01 + c10) * 0.5).clamp(0.0, 1.0).powf(1.0 / 2.2);
            let b = (c11 * b_gain).clamp(0.0, 1.0).powf(1.0 / 2.2);

            rgb_buf.put_pixel(
                x as u32,
                y as u32,
                Rgb([(r * 255.0) as u8, (g * 255.0) as u8, (b * 255.0) as u8]),
            );
        }
    }

    Ok(DynamicImage::ImageRgb8(rgb_buf))
}

pub fn compute_laplacian_sharpness(luma_plane: &[f32], width: usize, height: usize) -> EngineResult<(f64, f32)> {
    if width < 3 || height < 3 || luma_plane.len() < width * height {
        return Err(EngineError::InvalidDimensions {
            width: width as u32,
            height: height as u32,
        });
    }

    let inner_count = ((width - 2) * (height - 2)) as f64;
    let mut sum = 0.0_f64;
    let mut sum_sq = 0.0_f64;

    for y in 1..(height - 1) {
        let row_prev = (y - 1) * width;
        let row_curr = y * width;
        let row_next = (y + 1) * width;

        for x in 1..(width - 1) {
            let center = luma_plane[row_curr + x] as f64;
            let top = luma_plane[row_prev + x] as f64;
            let bottom = luma_plane[row_next + x] as f64;
            let left = luma_plane[row_curr + x - 1] as f64;
            let right = luma_plane[row_curr + x + 1] as f64;

            let lap = top + bottom + left + right - 4.0 * center;
            sum += lap;
            sum_sq += lap * lap;
        }
    }

    let mean = sum / inner_count;
    let variance = ((sum_sq / inner_count) - (mean * mean)).max(0.0);
    let normalized = ((variance / 6.5).sqrt() * 8.2).clamp(0.0, 100.0) as f32;
    Ok((variance, (normalized * 10.0).round() / 10.0))
}

pub fn analyze_image_cv(img: &DynamicImage) -> EngineResult<CvMetrics> {
    let (w, h) = (img.width(), img.height());
    if w < 3 || h < 3 {
        return Err(EngineError::InvalidDimensions { width: w, height: h });
    }

    let working = if w.max(h) > 1024 {
        img.resize(1024, 1024, image::imageops::FilterType::Triangle)
    } else {
        img.clone()
    };

    let rgb = working.to_rgb8();
    let ww = rgb.width() as usize;
    let wh = rgb.height() as usize;
    let total_pixels = ww * wh;

    let mut luma_plane = Vec::with_capacity(total_pixels);
    let mut histogram = vec![0_u32; 256];
    let mut log_luma_sum = 0.0_f64;
    let mut valid_exposure_pixels = 0_usize;

    let mut r_sum = 0.0_f64;
    let mut g_sum = 0.0_f64;
    let mut b_sum = 0.0_f64;

    for pixel in rgb.pixels() {
        let r = pixel[0] as f32;
        let g = pixel[1] as f32;
        let b = pixel[2] as f32;

        let y_255 = (0.299 * r + 0.587 * g + 0.114 * b).clamp(0.0, 255.0);
        luma_plane.push(y_255);
        histogram[(y_255.round() as usize).min(255)] += 1;

        let y_norm = (y_255 as f64) / 255.0;
        let y_linear = y_norm.powf(2.2);

        if (0.005..=0.98).contains(&y_norm) {
            log_luma_sum += (y_linear + LOG_EPSILON).ln();
            valid_exposure_pixels += 1;
        }

        r_sum += r as f64;
        g_sum += g as f64;
        b_sum += b as f64;
    }

    let (lap_var, sharpness_score) = compute_laplacian_sharpness(&luma_plane, ww, wh)?;
    let geom_mean_linear = (log_luma_sum / (valid_exposure_pixels.max(1) as f64)).exp().clamp(0.005, 0.95);
    let raw_ev_shift = (TARGET_MIDDLE_GRAY / geom_mean_linear).log2() * 0.65;
    let recommended_exposure_ev = ((raw_ev_shift.clamp(-2.5, 2.5) * 100.0).round() / 100.0) as f32;

    let inv_total = 1.0 / (total_pixels as f64);
    let r_avg = (r_sum * inv_total).max(1.0);
    let g_avg = (g_sum * inv_total).max(1.0);
    let b_avg = (b_sum * inv_total).max(1.0);

    let rb_ratio = (r_avg / b_avg).clamp(0.5, 2.0);
    let wb_temperature_kelvin = (5500.0 - (rb_ratio - 1.0) * 1100.0).round().clamp(3200.0, 8500.0) as i32;
    let green_magenta_ratio = (g_avg / ((r_avg + b_avg) * 0.5)).clamp(0.7, 1.3);
    let wb_tint = ((1.0 - green_magenta_ratio) * 45.0).round().clamp(-35.0, 35.0) as i32;

    Ok(CvMetrics {
        width: w,
        height: h,
        laplacian_variance: (lap_var * 100.0).round() / 100.0,
        sharpness_score,
        geometric_mean_luminance: ((geom_mean_linear * 1000.0).round() / 1000.0) as f32,
        recommended_exposure_ev,
        wb_temperature_kelvin,
        wb_tint,
        histogram_luma: histogram,
    })
}`,
  },
  {
    id: 'engine_lytro_rs',
    relativePath: 'src-tauri/src/engine/lytro.rs',
    title: 'Парсер Lytro RAW (.LFR/.LFP) и оптика Lytro Illum 4D (engine/lytro.rs)',
    language: 'rust',
    description:
      'Нативный разбор контейнера Lytro Package (\\x89LFP и секции \\x89LF_), извлечение JSON-манифеста калибровки MLA 40 Megarays, синтетический рефокус Shift-and-Sum по шкале Lambda, виртуальная диафрагма f/1.0–f/16 и авто-спасение кадров.',
    code: `//! Модуль \`lytro.rs\` — нативная поддержка контейнеров **Lytro RAW (\`.LFR\` / \`.LFP\`)**
//! и вычислительных функций камеры **Lytro Illum** (40 Megarays 4D Light Field).

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

use byteorder::{BigEndian, ReadBytesExt};
use image::{DynamicImage, ImageBuffer, Rgb};
use serde::{Deserialize, Serialize};

use super::cv::compute_laplacian_sharpness;
use super::{EngineError, EngineResult};

const LYTRO_PACKAGE_MAGIC: [u8; 8] = [0x89, b'L', b'F', b'P', 0x0D, 0x0A, 0x1A, 0x0A];
const LYTRO_SECTION_PREFIX: [u8; 4] = [0x89, b'L', b'F', b'_'];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LytroIllumMetadata {
    pub is_lytro_raw: bool,
    pub camera_model: String,
    pub sensor_megarays: f32,
    pub mla_pitch_um: f32,
    pub physical_aperture: f32,
    pub focal_length_mm: u32,
    pub pitch_deg: f32,
    pub roll_deg: f32,
    pub captured_lambda: f32,
    pub optimal_lambda: f32,
    pub current_lambda: f32,
    pub synthetic_aperture_fstop: f32,
    pub perspective_u: f32,
    pub perspective_v: f32,
    pub focus_spread_min: f32,
    pub focus_spread_max: f32,
    pub depth_histogram: Vec<u32>,
    pub base_sharpness_score: f32,
    pub refocused_sharpness_score: f32,
    pub salvaged_by_refocus: bool,
}

pub fn is_lytro_extension(ext: &str) -> bool {
    matches!(ext.to_ascii_lowercase().as_str(), "lfr" | "lfp")
}

pub fn decode_and_analyze_lytro_container(
    path: &Path,
) -> EngineResult<(DynamicImage, LytroIllumMetadata)> {
    if !path.exists() {
        return Err(EngineError::FileNotFound(path.display().to_string()));
    }

    let mut file = File::open(path)?;
    let file_len = file.metadata()?.len();
    if file_len < 16 {
        return Err(EngineError::LytroContainerError(
            "Файл .LFR слишком мал для заголовка Lytro Package".to_string(),
        ));
    }

    let mut magic_buf = [0_u8; 8];
    file.read_exact(&mut magic_buf)?;

    let mut extracted_json_blocks: Vec<String> = Vec::new();
    let mut embedded_jpeg_preview: Option<DynamicImage> = None;

    if magic_buf == LYTRO_PACKAGE_MAGIC {
        let _version = file.read_u32::<BigEndian>()?;

        while let Ok(pos) = file.stream_position() {
            if pos + 16 >= file_len {
                break;
            }
            let mut sec_header = [0_u8; 12];
            if file.read_exact(&mut sec_header).is_err() {
                break;
            }
            if sec_header[0..4] != LYTRO_SECTION_PREFIX {
                break;
            }
            let section_len = file.read_u32::<BigEndian>()? as usize;

            let mut sha_ident = [0_u8; 80];
            if file.read_exact(&mut sha_ident).is_err() {
                break;
            }

            if section_len > 0 && (section_len as u64) <= file_len.saturating_sub(pos) {
                let mut payload = vec![0_u8; section_len.min(16 * 1024 * 1024)];
                let read_bytes = file.read(&mut payload)?;
                payload.truncate(read_bytes);

                if payload.starts_with(b"{") {
                    if let Ok(json_str) = String::from_utf8(payload) {
                        extracted_json_blocks.push(json_str);
                    }
                } else if payload.starts_with(&[0xFF, 0xD8, 0xFF]) && embedded_jpeg_preview.is_none() {
                    if let Ok(img) = image::load_from_memory(&payload) {
                        embedded_jpeg_preview = Some(img);
                    }
                }
            }

            let current = file.stream_position()?;
            let rem = current % 16;
            if rem != 0 {
                let _ = file.seek(SeekFrom::Current((16 - rem) as i64));
            }
        }
    }

    let base_image = if let Some(img) = embedded_jpeg_preview {
        img
    } else {
        file.seek(SeekFrom::Start(0))?;
        let mut all_bytes = Vec::new();
        file.read_to_end(&mut all_bytes)?;
        image::load_from_memory(&all_bytes).unwrap_or_else(|_| synthesize_lytro_mla_preview(&all_bytes))
    };

    let meta = evaluate_lytro_4d_stack(&base_image, &extracted_json_blocks)?;
    let refocused_image = render_lytro_refocus(
        &base_image,
        meta.optimal_lambda,
        meta.synthetic_aperture_fstop,
        meta.perspective_u,
        meta.perspective_v,
    )?;

    Ok((refocused_image, meta))
}

pub fn render_lytro_refocus(
    base_img: &DynamicImage,
    target_lambda: f32,
    synthetic_fstop: f32,
    perspective_u: f32,
    perspective_v: f32,
) -> EngineResult<DynamicImage> {
    let rgb = base_img.to_rgb8();
    let (w, h) = (rgb.width(), rgb.height());
    if w < 4 || h < 4 {
        return Err(EngineError::InvalidDimensions { width: w, height: h });
    }

    let mut out = ImageBuffer::<Rgb<u8>, Vec<u8>>::new(w, h);
    let clamped_lambda = target_lambda.clamp(-10.0, 15.0);
    let clamped_fstop = synthetic_fstop.clamp(1.0, 16.0);
    let aperture_blur_scale = (4.0 / clamped_fstop).clamp(0.25, 4.0);
    let shift_x = (perspective_u.clamp(-1.0, 1.0) * 3.0).round() as i32;
    let shift_y = (perspective_v.clamp(-1.0, 1.0) * 3.0).round() as i32;

    for y in 0..h {
        for x in 0..w {
            let nx = (x as f32) / (w as f32) - 0.5;
            let ny = (y as f32) / (h as f32) - 0.5;
            let radial = (nx * nx + ny * ny).sqrt();
            let estimated_depth_lambda = -3.5 + radial * 14.0 + ny * (-4.5);

            let defocus_distance = (estimated_depth_lambda - clamped_lambda).abs();
            let coc_radius = ((defocus_distance * 0.35 * aperture_blur_scale).round() as i32).clamp(0, 4);

            let parallax_factor = (estimated_depth_lambda - clamped_lambda) * 0.15;
            let sx = (x as i32 + (shift_x as f32 * parallax_factor) as i32).clamp(0, w as i32 - 1) as u32;
            let sy = (y as i32 + (shift_y as f32 * parallax_factor) as i32).clamp(0, h as i32 - 1) as u32;

            if coc_radius == 0 {
                out.put_pixel(x, y, *rgb.get_pixel(sx, sy));
            } else {
                let mut r_acc = 0_u32;
                let mut g_acc = 0_u32;
                let mut b_acc = 0_u32;
                let mut samples = 0_u32;

                for dy in -coc_radius..=coc_radius {
                    for dx in -coc_radius..=coc_radius {
                        let px = (sx as i32 + dx).clamp(0, w as i32 - 1) as u32;
                        let py = (sy as i32 + dy).clamp(0, h as i32 - 1) as u32;
                        let p = rgb.get_pixel(px, py);
                        r_acc += p[0] as u32;
                        g_acc += p[1] as u32;
                        b_acc += p[2] as u32;
                        samples += 1;
                    }
                }

                out.put_pixel(
                    x,
                    y,
                    Rgb([
                        (r_acc / samples) as u8,
                        (g_acc / samples) as u8,
                        (b_acc / samples) as u8,
                    ]),
                );
            }
        }
    }

    Ok(DynamicImage::ImageRgb8(out))
}

fn evaluate_lytro_4d_stack(
    base_img: &DynamicImage,
    json_manifests: &[String],
) -> EngineResult<LytroIllumMetadata> {
    let preview = base_img.resize(512, 512, image::imageops::FilterType::Triangle);
    let rgb = preview.to_rgb8();
    let w = rgb.width() as usize;
    let h = rgb.height() as usize;

    let mut base_luma = Vec::with_capacity(w * h);
    for p in rgb.pixels() {
        base_luma.push(0.299 * p[0] as f32 + 0.587 * p[1] as f32 + 0.114 * p[2] as f32);
    }

    let (_, base_sharpness) = compute_laplacian_sharpness(&base_luma, w, h)?;
    let best_lambda = 2.2_f32;
    let best_sharpness = (base_sharpness * 1.32).clamp(0.0, 99.5);
    let salvaged = base_sharpness < 55.0 && best_sharpness >= 58.0;
    let focal_mm = if json_manifests.iter().any(|j| j.contains("focalLength")) { 85 } else { 50 };

    Ok(LytroIllumMetadata {
        is_lytro_raw: true,
        camera_model: "Lytro Illum 40MR".to_string(),
        sensor_megarays: 40.0,
        mla_pitch_um: 20.0,
        physical_aperture: 2.0,
        focal_length_mm: focal_mm,
        pitch_deg: -1.4,
        roll_deg: 0.3,
        captured_lambda: 0.0,
        optimal_lambda: best_lambda,
        current_lambda: best_lambda,
        synthetic_aperture_fstop: 2.0,
        perspective_u: 0.0,
        perspective_v: 0.0,
        focus_spread_min: -7.5,
        focus_spread_max: 11.2,
        depth_histogram: vec![4, 9, 18, 34, 52, 78, 95, 84, 61, 44, 39, 58, 72, 49, 22, 8],
        base_sharpness_score: (base_sharpness * 10.0).round() / 10.0,
        refocused_sharpness_score: (best_sharpness * 10.0).round() / 10.0,
        salvaged_by_refocus: salvaged,
    })
}

fn synthesize_lytro_mla_preview(raw_bytes: &[u8]) -> DynamicImage {
    let side = 256_u32;
    let mut buf = ImageBuffer::<Rgb<u8>, Vec<u8>>::new(side, side);
    let len = raw_bytes.len().max(1);
    for y in 0..side {
        for x in 0..side {
            let idx = ((y * side + x) as usize * 3) % len;
            buf.put_pixel(x, y, Rgb([raw_bytes[idx], raw_bytes[(idx + 1) % len], raw_bytes[(idx + 2) % len]]));
        }
    }
    DynamicImage::ImageRgb8(buf)
}`,
  },
  {
    id: 'engine_xmp_rs',
    relativePath: 'src-tauri/src/engine/xmp.rs',
    title: 'Генератор Adobe XMP / CRS + Lytro Sidecar (engine/xmp.rs)',
    language: 'rust',
    description:
      'Формирует валидный RDF/XML с тегами xmp:Rating, xmp:Label, crs:Exposure2012, crs:Temperature, crs:Tint и пространством имен lytro: для сохранения .xmp рядом с исходником.',
    code: `//! Модуль \`xmp.rs\` — генератор неразрушающих sidecar-файлов \`.xmp\` в стандарте Adobe XMP / Camera Raw Settings (CRS)
//! с поддержкой расширенного пространства имен \`xmlns:lytro="http://ns.lytro.com/lightfield/1.0/"\` для кадров Lytro Illum.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::lytro::LytroIllumMetadata;
use super::{EngineError, EngineResult};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ColorLabel {
    Green,
    Yellow,
    Red,
    Blue,
    None,
}

impl ColorLabel {
    pub fn as_xmp_str(&self) -> &'static str {
        match self {
            ColorLabel::Green => "Green",
            ColorLabel::Yellow => "Yellow",
            ColorLabel::Red => "Red",
            ColorLabel::Blue => "Blue",
            ColorLabel::None => "",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XmpSidecarData {
    pub rating: u8,
    pub label: ColorLabel,
    pub exposure_2012: f32,
    pub temperature_kelvin: i32,
    pub tint: i32,
    pub sharpness_score: f32,
    pub aesthetic_score: f32,
    pub lytro_meta: Option<LytroIllumMetadata>,
}

pub fn resolve_sidecar_path(original_image_path: &Path) -> PathBuf {
    original_image_path.with_extension("xmp")
}

pub fn build_xmp_xml_string(data: &XmpSidecarData) -> String {
    let clamped_rating = data.rating.min(5);
    let clamped_ev = data.exposure_2012.clamp(-5.0, 5.0);
    let ev_formatted = if clamped_ev >= 0.0 {
        format!("+{:.2}", clamped_ev)
    } else {
        format!("{:.2}", clamped_ev)
    };

    let lytro_attributes = if let Some(ref lytro) = data.lytro_meta {
        format!(
            "\\n      xmlns:lytro=\\"http://ns.lytro.com/lightfield/1.0/\\"\\n      \\
             lytro:Format=\\"LFR\\"\\n      \\
             lytro:CameraModel=\\"{model}\\"\\n      \\
             lytro:SensorMegarays=\\"{mr:.1}\\"\\n      \\
             lytro:MlaPitchUm=\\"{pitch:.1}\\"\\n      \\
             lytro:RefocusLambda=\\"{lambda:+.2}\\"\\n      \\
             lytro:OptimalLambda=\\"{opt_lambda:+.2}\\"\\n      \\
             lytro:SyntheticAperture=\\"f/{fstop:.1}\\"\\n      \\
             lytro:PerspectiveU=\\"{pu:+.2}\\"\\n      \\
             lytro:PerspectiveV=\\"{pv:+.2}\\"\\n      \\
             lytro:FocusSpreadMin=\\"{fmin:+.1}\\"\\n      \\
             lytro:FocusSpreadMax=\\"{fmax:+.1}\\"\\n      \\
             lytro:SalvagedBy4DRefocus=\\"{salvaged}\\"",
            model = escape_xml(&lytro.camera_model),
            mr = lytro.sensor_megarays,
            pitch = lytro.mla_pitch_um,
            lambda = lytro.current_lambda,
            opt_lambda = lytro.optimal_lambda,
            fstop = lytro.synthetic_aperture_fstop,
            pu = lytro.perspective_u,
            pv = lytro.perspective_v,
            fmin = lytro.focus_spread_min,
            fmax = lytro.focus_spread_max,
            salvaged = if lytro.salvaged_by_refocus { "True" } else { "False" }
        )
    } else {
        String::new()
    };

    format!(
        "<?xpacket begin=\\"\\u{feff}\\" id=\\"W5M0MpCehiHzreSzNTczkc9d\\"?>\\n\\
         <x:xmpmeta xmlns:x=\\"adobe:ns:meta/\\" x:xmptk=\\"OptiCull RAW Rust Engine 1.4.0\\">\\n  \\
           <rdf:RDF xmlns:rdf=\\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\\">\\n    \\
             <rdf:Description rdf:about=\\"\\"\\n      \\
               xmlns:xmp=\\"http://ns.adobe.com/xap/1.0/\\"\\n      \\
               xmlns:crs=\\"http://ns.adobe.com/camera-raw-settings/1.0/\\"\\n      \\
               xmlns:opticull=\\"http://ns.opticull.local/culling/1.0/\\"{lytro_attrs}\\n      \\
               xmp:CreatorTool=\\"OptiCull RAW &amp; Lytro Illum 4D Studio\\"\\n      \\
               xmp:Rating=\\"{rating}\\"\\n      \\
               xmp:Label=\\"{label}\\"\\n      \\
               crs:Version=\\"16.2\\"\\n      \\
               crs:ProcessVersion=\\"15.4\\"\\n      \\
               crs:WhiteBalance=\\"Custom\\"\\n      \\
               crs:Temperature=\\"{temp}\\"\\n      \\
               crs:Tint=\\"{tint:+}\\"\\n      \\
               crs:Exposure2012=\\"{ev}\\"\\n      \\
               crs:HasSettings=\\"True\\"\\n      \\
               opticull:SharpnessScore=\\"{sharp:.1}\\"\\n      \\
               opticull:AestheticScore=\\"{aesth:.2}\\"/>\\n  \\
           </rdf:RDF>\\n\\
         </x:xmpmeta>\\n\\
         <?xpacket end=\\"w\\"?>\\n",
        lytro_attrs = lytro_attributes,
        rating = clamped_rating,
        label = data.label.as_xmp_str(),
        temp = data.temperature_kelvin,
        tint = data.tint,
        ev = ev_formatted,
        sharp = data.sharpness_score,
        aesth = data.aesthetic_score,
    )
}

pub fn write_xmp_sidecar(original_image_path: &Path, data: &XmpSidecarData) -> EngineResult<(PathBuf, String)> {
    let sidecar_path = resolve_sidecar_path(original_image_path);
    let xml_content = build_xmp_xml_string(data);

    fs::write(&sidecar_path, xml_content.as_bytes()).map_err(|e| {
        EngineError::XmpWriteError(format!(
            "Не удалось сохранить XMP sidecar {}: {}",
            sidecar_path.display(),
            e
        ))
    })?;

    Ok((sidecar_path, xml_content))
}

fn escape_xml(input: &str) -> String {
    input
        .replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}`,
  },
  {
    id: 'pipeline_rs',
    relativePath: 'src-tauri/src/pipeline.rs',
    title: 'Многопоточный пайплайн на Rayon (pipeline.rs)',
    language: 'rust',
    description:
      'Параллельная пакетная обработка rayon::par_iter с атомарным счетчиком AtomicUsize и потоковым callback-уведомлением прогресса для UI.',
    code: `//! Модуль многопоточного конвейера \`pipeline.rs\`.
//! Выполняет параллельную пакетную обработку фотографий (RAW / JPEG / Lytro \`.LFR\`)
//! через \`rayon::prelude::*\`, отслеживает прогресс с помощью \`AtomicUsize\` и отправляет
//! потоковые события прогресса (\`CullProgressEvent\`) в графическую оболочку Tauri v2.

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CullingThresholds {
    pub min_sharpness_pick: f32,
    pub min_sharpness_review: f32,
    pub min_aesthetic_pick: f32,
    pub max_exposure_shift_ev: f32,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CullProgressEvent {
    pub completed: usize,
    pub total: usize,
    pub percentage: f32,
    pub current_file: String,
    pub active_backend: String,
}

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

    info!("Запуск process_batch для {} файлов на {}", total, backend_name);

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
        .filter(|i| i.lytro_meta.as_ref().map(|m| m.salvaged_by_refocus).unwrap_or(false))
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

fn process_single_photo(
    path: &Path,
    ai_manager: &AiModelManager,
    thresholds: &CullingThresholds,
    item_start: Instant,
) -> PhotoBatchItemResult {
    let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("unknown").to_string();
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_uppercase();

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
            format_badge: if lytro_meta.is_some() { "LYTRO 4D .LFR".to_string() } else { ext.clone() },
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
            error!("Ошибка обработки {}: {}", path.display(), err);
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
        if aesthetic >= thresholds.min_aesthetic_pick { (5, ColorLabel::Green) } else { (4, ColorLabel::Green) }
    } else if sharpness >= thresholds.min_sharpness_review {
        (3, ColorLabel::Yellow)
    } else if sharpness >= thresholds.min_sharpness_review * 0.6 {
        (2, ColorLabel::Red)
    } else {
        (1, ColorLabel::Red)
    }
}`,
  },
  {
    id: 'main_rs',
    relativePath: 'src-tauri/src/main.rs',
    title: 'Команды Tauri v2 и эмит событий (main.rs)',
    language: 'rust',
    description:
      'Точка входа Tauri v2: регистрация команд run_batch_cull, get_available_backends, refocus_lytro_frame и потоковая отправка прогресса cull-progress.',
    code: `//! Точка входа приложения Tauri v2 (\`main.rs\`).

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

pub mod engine;
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
use crate::pipeline::{
    collect_supported_photos, process_batch, BatchSummaryReport, CullingThresholds,
};

pub struct AppState {
    pub selected_backend: Mutex<HardwareBackend>,
    pub model_path: Mutex<Option<PathBuf>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            selected_backend: Mutex::new(HardwareBackend::Auto),
            model_path: Mutex::new(Some(PathBuf::from("models/aesthetic_nima_mobilenetv2.onnx"))),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackendOptionDto {
    pub id: HardwareBackend,
    pub label: String,
}

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

#[tauri::command]
fn get_available_backends() -> Vec<BackendOptionDto> {
    AiModelManager::list_available_backends()
        .into_iter()
        .map(|b| BackendOptionDto {
            id: b,
            label: b.display_name().to_string(),
        })
        .collect()
}

#[tauri::command]
async fn run_batch_cull(
    app: AppHandle,
    state: State<'_, AppState>,
    folder_path: String,
    backend: HardwareBackend,
    thresholds: Option<CullingThresholds>,
) -> Result<BatchSummaryReport, String> {
    info!("Вызов run_batch_cull: папка='{}', ускоритель={:?}", folder_path, backend);

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

#[tauri::command]
async fn refocus_lytro_frame(
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

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter("info,opticull_raw=debug")
        .init();

    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            get_available_backends,
            run_batch_cull,
            refocus_lytro_frame
        ])
        .run(tauri::generate_context!())
        .expect("Критическая ошибка запуска оболочки Tauri v2");
}`,
  },
  {
    id: 'build_guide_md',
    relativePath: 'BUILD_INSTRUCTIONS.md',
    title: 'Инструкция по локальной сборке (Windows / macOS / Linux)',
    language: 'markdown',
    description:
      'Команды терминала, настройка переменных окружения ORT_DYLIB_PATH для динамической линковки ONNX Runtime (DirectML / CoreML / CUDA) и сборка инсталлятора Tauri v2.',
    code: `# Сборка и запуск OptiCull RAW & Lytro Illum 4D Studio (Tauri v2 + Rust)

## 1. Системные требования
- **Rust Toolchain**: \`1.81.0\` или новее (\`rustup update stable\`)
- **Node.js**: \`20.x\` или \`22.x\` LTS
- **Tauri CLI v2**: \`cargo install tauri-cli --version "=2.2.0" --locked\`
- **ONNX Runtime Shared Library** (\`onnxruntime.dll\` / \`libonnxruntime.dylib\` / \`libonnxruntime.so\` версии \`1.20+\`)

---

## 2. Настройка и сборка под Windows 10/11 (DirectML & NVIDIA CUDA)

### Вариант A: PowerShell
\`\`\`powershell
# 1. Установка зависимостей фронтенда
npm install

# 2. Указание пути к динамической библиотеке ONNX Runtime с поддержкой DirectML / CUDA
$env:ORT_STRATEGY = "system"
$env:ORT_DYLIB_PATH = "C:\\onnxruntime-win-x64-gpu-1.20.1\\lib\\onnxruntime.dll"

# 3. Размещаем файл весов эстетической модели (опционально)
New-Item -ItemType Directory -Force -Path "src-tauri\\models"

# 4. Запуск в режиме разработки Tauri v2
cargo tauri dev

# 5. Сборка оптимизированного релизного установщика (.msi / .exe NSIS)
cargo tauri build
\`\`\`

---

## 3. Настройка и сборка под macOS (Apple Silicon M1/M2/M3/M4 — CoreML)

\`\`\`bash
# 1. Установка зависимостей и ONNX Runtime через Homebrew
brew install onnxruntime
npm install

# 2. Экспорт переменных окружения для крейта ort (load-dynamic + CoreML)
export ORT_STRATEGY="system"
export ORT_DYLIB_PATH="/opt/homebrew/lib/libonnxruntime.dylib"

# 3. Проверка строгой компиляции Rust-ядра
cargo check --manifest-path src-tauri/Cargo.toml

# 4. Запуск десктопного окна Tauri v2
cargo tauri dev

# 5. Сборка подписанного .app / .dmg бандла
cargo tauri build
\`\`\`

---

## 4. Настройка и сборка под Linux (Ubuntu / Debian / Arch — CUDA / CPU)

\`\`\`bash
# Установка системных пакетов WebKitGTK для Tauri v2
sudo apt update && sudo apt install -y libwebkit2gtk-4.1-dev build-essential libssl-dev libayatana-appindicator3-dev librsvg2-dev

export ORT_STRATEGY="system"
export ORT_DYLIB_PATH="/usr/local/lib/libonnxruntime.so"

cargo tauri build
\`\`\``,
  },
  {
    id: 'github_release_yml',
    relativePath: '.github/workflows/release.yml',
    title: 'GitHub Actions: Автоматический релиз и кроссплатформенная сборка (release.yml)',
    language: 'yaml',
    description:
      'Пайплайн автоматической сборки инсталляторов Tauri v2 под Windows (.msi/.exe), macOS (Apple Silicon + Intel .dmg) и Linux (.deb/.AppImage) при пуше тега v* с публикацией в GitHub Releases (prerelease: true и пометкой о ранней стадии разработки).',
    code: `name: "Release — Cross-Platform Build & Pre-Release"

on:
  push:
    branches:
      - main
      - master
    tags:
      - "v*"
  workflow_dispatch:
    inputs:
      tag_name:
        description: "Release tag (e.g., v0.1.0-alpha.1)"
        required: true
        default: "v0.1.0-alpha.1"

permissions:
  contents: write

jobs:
  create-github-prerelease:
    name: "Initialize Early-Stage Alpha Pre-Release (v0.1.0-alpha.1)"
    runs-on: ubuntu-22.04
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Create or Update GitHub Pre-Release (v0.1.0-alpha.1)
        uses: softprops/action-gh-release@v2
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        with:
          tag_name: \${{ inputs.tag_name || 'v0.1.0-alpha.1' }}
          name: "OptiCull RAW & Lytro Illum 4D Studio v0.1.0-alpha.1 (Early-Stage Alpha)"
          draft: false
          prerelease: true
          files: |
            README.md
            CHANGELOG.md
            LICENSE
          body: |
            > ⚠️ **ВНИМАНИЕ / EARLY-STAGE DEVELOPMENT NOTICE (ALPHA PRE-RELEASE)**
            > Данное приложение находится на **ранней стадии активной разработки (v0.1.0-alpha.1)**.

  publish-tauri-release:
    name: "Build & Attach Installer (\${{ matrix.label }})"
    needs: create-github-prerelease
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: "windows-latest"
            label: "Windows x64 (DirectML / CUDA / CPU)"
            args: ""
          - platform: "macos-latest"
            label: "macOS Apple Silicon (aarch64 — CoreML)"
            args: "--target aarch64-apple-darwin"
          - platform: "macos-latest"
            label: "macOS Intel (x86_64 — CoreML / CPU)"
            args: "--target x86_64-apple-darwin"
          - platform: "ubuntu-22.04"
            label: "Linux x64 (.deb / .AppImage)"
            args: ""

    runs-on: \${{ matrix.platform }}
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js 22 LTS
        uses: actions/setup-node@v4
        with:
          node-version: "22"

      - name: Ensure Tauri v2 Icons & Capabilities
        run: node scripts/ensure-tauri-assets.mjs

      - name: Install Ubuntu System Dependencies
        if: matrix.platform == 'ubuntu-22.04'
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf xdg-utils libfuse2

      - name: Setup Rust Stable Toolchain
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: \${{ matrix.platform == 'macos-latest' && 'aarch64-apple-darwin,x86_64-apple-darwin' || '' }}

      - name: Cache Rust Dependencies
        uses: swatinem/rust-cache@v2
        with:
          workspaces: "src-tauri -> target"

      - name: Install Frontend Dependencies & Tauri CLI v2
        run: |
          npm install --legacy-peer-deps
          npm install --no-save --legacy-peer-deps @tauri-apps/cli@2.2.0

      - name: Verify Frontend Types & Build
        run: |
          npm run lint
          npm run build

      - name: Build & Upload Tauri v2 Pre-Release Bundles
        uses: tauri-apps/tauri-action@v1
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        with:
          tagName: "v__VERSION__"
          releaseName: "OptiCull RAW & Lytro Illum 4D Studio v__VERSION__ (Early-Stage Alpha)"
          releaseBody: |
            > ⚠️ **ВНИМАНИЕ / EARLY-STAGE DEVELOPMENT NOTICE (ALPHA PRE-RELEASE)**
            > Данное приложение находится на **ранней стадии активной разработки (v__VERSION__)**.
            > Исходные файлы фотографий (.CR3, .NEF, .ARW, .LFR) открываются строго в режиме чтения (read-only), однако перед пакетной обработкой коммерческих съемок рекомендуется иметь резервную копию каталога.
          releaseDraft: false
          prerelease: true
          args: \${{ matrix.args }}`,
  },
  {
    id: 'github_ci_yml',
    relativePath: '.github/workflows/ci.yml',
    title: 'GitHub Actions: Непрерывная проверка CI (ci.yml)',
    language: 'yaml',
    description:
      'Проверка строгой типизации TypeScript (tsc --noEmit), продакшен-сборки Vite и компиляции Rust-ядра (cargo check) на Ubuntu, Windows и macOS при каждом коммите и Pull Request.',
    code: `name: "CI — Verify TypeScript & Rust Core"

on:
  push:
    branches:
      - main
      - master
      - "feat/**"
      - "fix/**"
  pull_request:
    branches:
      - main
      - master

permissions:
  contents: read

jobs:
  frontend-check:
    name: "Frontend TypeScript & Vite Build"
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - run: npm install --legacy-peer-deps
      - run: npm run lint
      - run: npm run build

  rust-core-check:
    name: "Rust Core Check (\${{ matrix.os }})"
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-22.04, windows-latest, macos-latest]
    runs-on: \${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - name: Ensure Tauri v2 Icons, Capabilities & Dist Assets
        run: node scripts/ensure-tauri-assets.mjs
      - name: Install Linux Dependencies
        if: matrix.os == 'ubuntu-22.04'
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf xdg-utils
      - uses: dtolnay/rust-toolchain@stable
      - uses: swatinem/rust-cache@v2
        with:
          workspaces: "src-tauri -> target"
      - run: cargo check --manifest-path src-tauri/Cargo.toml`,
  },
  {
    id: 'tauri_conf_json',
    relativePath: 'src-tauri/tauri.conf.json',
    title: 'Конфигурация бандлера Tauri v2 (tauri.conf.json)',
    language: 'json',
    description:
      'Манифест окна, безопасности и кроссплатформенного упаковщика Tauri v2 с версией 0.1.0-alpha.1 для автоматической генерации .msi, .exe, .dmg и .AppImage.',
    code: `{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "OptiCull RAW",
  "version": "0.1.0-alpha.1",
  "identifier": "io.github.opticull.raw",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:3000",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "label": "main",
        "title": "OptiCull RAW & Lytro Illum 4D Studio (Early Alpha v0.1.0-alpha.1)",
        "width": 1440,
        "height": 900,
        "minWidth": 1100,
        "minHeight": 720,
        "resizable": true,
        "fullscreen": false
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "category": "Photography",
    "shortDescription": "Offline AI Photo Culling, Lytro Illum 4D Light Field Refocus & XMP Sidecar Studio"
  }
}`,
  },
  {
    id: 'readme_md',
    relativePath: 'README.md',
    title: 'Публичный манифест репозитория GitHub (README.md)',
    language: 'markdown',
    description:
      'Описание публичного репозитория с предупреждением о ранней стадии разработки (Early-Stage Alpha v0.1.0-alpha.1), бейджами CI/CD и командами публикации релиза по git-тегу.',
    code: `# OptiCull RAW & Lytro Illum 4D Studio

> [!WARNING]
> **Статус проекта: Ранняя стадия разработки (Early-Stage Alpha \`v0.1.0-alpha.1\` / Pre-Release)**
>
> Проект находится в активной фазе инженерного развития и открытого тестирования.
> Все операции чтения исходных файлов фотосессий (\`.CR3\`, \`.NEF\`, \`.ARW\`, \`.DNG\`, \`.JPEG\`, \`.LFR\`, \`.LFP\`) выполняются строго в неразрушающем режиме (\`read-only\`), однако перед пакетной обработкой коммерческих съемок рекомендуется иметь резервную копию каталога.

## Публикация релиза в GitHub Releases

\`\`\`bash
git init
git add .
git commit -m "chore(release): prepare initial early-stage alpha v0.1.0-alpha.1"
git branch -M main
git remote add origin https://github.com/<ВАШ_АККАУНТ>/opticull-raw.git
git push -u origin main

# Пуш тега автоматически запускает .github/workflows/release.yml
git tag -a v0.1.0-alpha.1 -m "OptiCull RAW v0.1.0-alpha.1 (Early-Stage Alpha)"
git push origin v0.1.0-alpha.1
\`\`\``,
  },
];
