//! Корневой модуль вычислительного ядра OptiCull RAW & Lytro Illum 4D.
//! Объединяет:
//! - `ai`: нейросетевой инференс ONNX Runtime (`ort`) с динамическим выбором провайдера и CPU fallback.
//! - `cv`: алгоритмы компьютерного зрения (дисперсия оператора Лапласа, гистограмма и экспокоррекция 18% серого).
//! - `lytro`: нативный парсер контейнеров Lytro RAW (`.LFR` / `.LFP`) и вычислительная оптика Lytro Illum 4D.
//! - `xmp`: генератор неразрушающих sidecar-файлов Adobe XMP/CRS с расширением пространства имен `lytro:`.

pub mod ai;
pub mod cv;
pub mod lytro;
pub mod xmp;

use thiserror::Error;

/// Единый тип ошибок вычислительного конвейера OptiCull RAW.
/// Гарантирует отсутствие паник (`unwrap`) при работе с поврежденными RAW/LFR или сбоями драйверов GPU.
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
pub type EngineResult<T> = Result<T, EngineError>;
