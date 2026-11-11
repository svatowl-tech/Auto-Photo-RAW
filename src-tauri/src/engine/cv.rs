//! Модуль компьютерного зрения `cv.rs`.
//! Реализует:
//! 1. Универсальное декодирование JPEG/PNG/TIFF (`image`) и камерных RAW (`rawloader`).
//! 2. Детекцию технического смаза и оценку резкости через дисперсию оператора Лапласа (Laplacian Variance) по каналу яркости.
//! 3. Расчет 256-канальной гистограммы яркости и логарифмического геометрического среднего для авто-компенсации экспозиции (`crs:Exposure2012`) относительно 18% серого.

use std::path::Path;

use image::{DynamicImage, ImageBuffer, Rgb};
use serde::{Deserialize, Serialize};

use super::{EngineError, EngineResult};

/// Целевая референсная яркость фотографического среднего серого (18% Middle Gray)
const TARGET_MIDDLE_GRAY: f64 = 0.18;
/// Малая константа для предотвращения логарифма нуля на абсолютно черных пикселях
const LOG_EPSILON: f64 = 1e-4;

/// Сводные технические метрики кадра, полученные алгоритмами компьютерного зрения
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CvMetrics {
    pub width: u32,
    pub height: u32,
    /// Сырое значение дисперсии оператора Лапласа ($\sigma^2$)
    pub laplacian_variance: f64,
    /// Нормализованный скор резкости по шкале [0.0, 100.0]
    pub sharpness_score: f32,
    /// Логарифмическое геометрическое среднее яркости сцены [0.0, 1.0]
    pub geometric_mean_luminance: f32,
    /// Рекомендуемый сдвиг экспозиции в стопах EV для тега `crs:Exposure2012` [-3.0, +3.0]
    pub recommended_exposure_ev: f32,
    /// Оценка цветовой температуры (сдвиг ББ в Кельвинах)
    pub wb_temperature_kelvin: i32,
    /// Оценка оттенка (Tint: Green/Magenta)
    pub wb_tint: i32,
    /// 256 бинов гистограммы яркости (нормализованные доли)
    pub histogram_luma: Vec<u32>,
}

/// Проверяет, относится ли расширение файла к поддерживаемым форматам классических RAW
pub fn is_standard_raw_extension(ext: &str) -> bool {
    matches!(
        ext.to_ascii_lowercase().as_str(),
        "cr2" | "cr3" | "nef" | "arw" | "dng" | "orf" | "rw2" | "pef" | "raf"
    )
}

/// Декодирует изображение с диска (поддерживает стандартные растровые форматы и камерные RAW через `rawloader`)
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

/// Чтение RAW-буфера сенсора через `rawloader` с быстрым билинейным демозаикингом (half-size RGB) для анализа резкости и экспозиции
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

    // Быстрое извлечение полуразмерного RGB из суперпикселей 2x2 Bayer с гамма-коррекцией sRGB (1/2.2)
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
                Rgb([
                    (r * 255.0) as u8,
                    (g * 255.0) as u8,
                    (b * 255.0) as u8,
                ]),
            );
        }
    }

    Ok(DynamicImage::ImageRgb8(rgb_buf))
}

/// Вычисляет дисперсию оператора Лапласа ($\text{Var}(\nabla^2 Y)$) по каналу яркости.
/// Использует ядро свертки $3\times 3$:
/// $$K = \begin{bmatrix} 0 & 1 & 0 \\ 1 & -4 & 1 \\ 0 & 1 & 0 \end{bmatrix}$$
pub fn compute_laplacian_sharpness(luma_plane: &[f32], width: usize, height: usize) -> EngineResult<(f64, f32)> {
    if width < 3 || height < 3 || luma_plane.len() < width * height {
        return Err(EngineError::InvalidDimensions {
            width: width as u32,
            height: height as u32,
        });
    }

    let inner_count = ((width - 2) * (height - 2)) as f64;
    if inner_count <= 0.0 {
        return Err(EngineError::EmptyInput);
    }

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
    let variance = (sum_sq / inner_count) - (mean * mean);
    let safe_variance = variance.max(0.0);

    // Нелинейная нормализация сырой дисперсии Лапласа [0..1200+] в удобную шкалу фотографа [0.0..100.0]
    let normalized = ((safe_variance / 6.5).sqrt() * 8.2).clamp(0.0, 100.0) as f32;
    Ok((safe_variance, (normalized * 10.0).round() / 10.0))
}

/// Выполняет полный технический анализ кадра:
/// - перевод в канал яркости Rec.601 ($Y = 0.299R + 0.587G + 0.114B$),
/// - расчет дисперсии оператора Лапласа,
/// - построение 256-канальной гистограммы,
/// - расчет геометрического среднего яркости и сдвига экспозиции `crs:Exposure2012` относительно 18% серого.
pub fn analyze_image_cv(img: &DynamicImage) -> EngineResult<CvMetrics> {
    let (w, h) = (img.width(), img.height());
    if w < 3 || h < 3 {
        return Err(EngineError::InvalidDimensions { width: w, height: h });
    }

    // Для стабильности оценки резкости независимой от мегапиксельности сенсора приводим рабочую копию к длинной стороне <= 1024px
    let working = if w.max(h) > 1024 {
        img.resize(1024, 1024, image::imageops::FilterType::Triangle)
    } else {
        img.clone()
    };

    let rgb = working.to_rgb8();
    let ww = rgb.width() as usize;
    let wh = rgb.height() as usize;
    let total_pixels = ww * wh;
    if total_pixels == 0 {
        return Err(EngineError::EmptyInput);
    }

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

        let bin = (y_255.round() as usize).min(255);
        histogram[bin] += 1;

        // Линейная аппроксимация яркости (снятие гаммы sRGB ~ 2.2) для точного расчета стопов экспозиции EV
        let y_norm = (y_255 as f64) / 255.0;
        let y_linear = y_norm.powf(2.2);

        // Исключаем выбитые блики (> 0.98) и глубокую отсечку черного (< 0.005), чтобы не искажать замер
        if (0.005..=0.98).contains(&y_norm) {
            log_luma_sum += (y_linear + LOG_EPSILON).ln();
            valid_exposure_pixels += 1;
        }

        r_sum += r as f64;
        g_sum += g as f64;
        b_sum += b as f64;
    }

    let (lap_var, sharpness_score) = compute_laplacian_sharpness(&luma_plane, ww, wh)?;

    let denom = valid_exposure_pixels.max(1) as f64;
    let geom_mean_linear = (log_luma_sum / denom).exp().clamp(0.005, 0.95);

    // Сдвиг экспозиции в стопах EV: log2(0.18 / L_avg) с мягким коэффициентом демпфирования 0.65 (сохранение художественного ключа)
    let raw_ev_shift = (TARGET_MIDDLE_GRAY / geom_mean_linear).log2() * 0.65;
    let recommended_exposure_ev = ((raw_ev_shift.clamp(-2.5, 2.5) * 100.0).round() / 100.0) as f32;

    // Оценка баланса белого (Серая мировая гипотеза / Gray World)
    let inv_total = 1.0 / (total_pixels as f64);
    let r_avg = (r_sum * inv_total).max(1.0);
    let g_avg = (g_sum * inv_total).max(1.0);
    let b_avg = (b_sum * inv_total).max(1.0);

    let rb_ratio = (r_avg / b_avg).clamp(0.5, 2.0);
    // Если преобладает теплый канал R, рекомендуем чуть более холодную компенсацию вокруг базовых 5500K
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
}
