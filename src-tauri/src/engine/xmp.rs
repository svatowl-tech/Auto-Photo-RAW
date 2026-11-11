//! Модуль `xmp.rs` — генератор неразрушающих sidecar-файлов `.xmp` в стандарте Adobe XMP / Camera Raw Settings (CRS)
//! с поддержкой расширенного пространства имен `xmlns:lytro="http://ns.lytro.com/lightfield/1.0/"` для кадров Lytro Illum.
//!
//! Гарантирует 100% сохранность исходных RAW/JPEG/LFR файлов и совместимость с Adobe Lightroom Classic,
//! Adobe Camera Raw, Capture One Pro и Darktable.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::lytro::LytroIllumMetadata;
use super::{EngineError, EngineResult};

/// Цветовая метка кадра в стандарте Adobe XMP (`xmp:Label`)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ColorLabel {
    /// Отобранный кадр (Pick / Selected)
    Green,
    /// Требует внимания или проверки (Review / Salvaged)
    Yellow,
    /// Брак по резкости или экспозиции (Reject)
    Red,
    /// Спасенный 4D-кадр Lytro Illum после авто-рефокуса (Refocused Pick)
    Blue,
    /// Без цветовой метки
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

/// Полная спецификация параметров для записи в `.xmp` sidecar
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XmpSidecarData {
    /// Рейтинг от 0 до 5 звезд (`xmp:Rating`)
    pub rating: u8,
    /// Цветовая метка (`xmp:Label`)
    pub label: ColorLabel,
    /// Сдвиг экспозиции в стопах (`crs:Exposure2012`), например `+0.65` или `-0.40`
    pub exposure_2012: f32,
    /// Цветовая температура в Кельвинах (`crs:Temperature`)
    pub temperature_kelvin: i32,
    /// Оттенок Green/Magenta (`crs:Tint`)
    pub tint: i32,
    /// Технический скор резкости Лапласа [0..100] для сохранения в метаданных отбора
    pub sharpness_score: f32,
    /// Эстетический балл нейросети [1..10]
    pub aesthetic_score: f32,
    /// Опциональные параметры 4D светового поля Lytro Illum (`.LFR` / `.LFP`)
    pub lytro_meta: Option<LytroIllumMetadata>,
}

/// Вычисляет путь к `.xmp` sidecar-файлу рядом с исходным изображением (например, `IMG_1024.CR3` -> `IMG_1024.xmp`)
pub fn resolve_sidecar_path(original_image_path: &Path) -> PathBuf {
    original_image_path.with_extension("xmp")
}

/// Генерирует валидный XML-документ стандарта Adobe XMP / CRS
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
            "\n      xmlns:lytro=\"http://ns.lytro.com/lightfield/1.0/\"\n      \
             lytro:Format=\"LFR\"\n      \
             lytro:CameraModel=\"{model}\"\n      \
             lytro:SensorMegarays=\"{mr:.1}\"\n      \
             lytro:MlaPitchUm=\"{pitch:.1}\"\n      \
             lytro:RefocusLambda=\"{lambda:+.2}\"\n      \
             lytro:OptimalLambda=\"{opt_lambda:+.2}\"\n      \
             lytro:SyntheticAperture=\"f/{fstop:.1}\"\n      \
             lytro:PerspectiveU=\"{pu:+.2}\"\n      \
             lytro:PerspectiveV=\"{pv:+.2}\"\n      \
             lytro:FocusSpreadMin=\"{fmin:+.1}\"\n      \
             lytro:FocusSpreadMax=\"{fmax:+.1}\"\n      \
             lytro:SalvagedBy4DRefocus=\"{salvaged}\"",
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
        "<?xpacket begin=\"\u{feff}\" id=\"W5M0MpCehiHzreSzNTczkc9d\"?>\n\
         <x:xmpmeta xmlns:x=\"adobe:ns:meta/\" x:xmptk=\"OptiCull RAW Rust Engine 1.4.0\">\n  \
           <rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">\n    \
             <rdf:Description rdf:about=\"\"\n      \
               xmlns:xmp=\"http://ns.adobe.com/xap/1.0/\"\n      \
               xmlns:crs=\"http://ns.adobe.com/camera-raw-settings/1.0/\"\n      \
               xmlns:opticull=\"http://ns.opticull.local/culling/1.0/\"{lytro_attrs}\n      \
               xmp:CreatorTool=\"OptiCull RAW &amp; Lytro Illum 4D Studio\"\n      \
               xmp:Rating=\"{rating}\"\n      \
               xmp:Label=\"{label}\"\n      \
               crs:Version=\"16.2\"\n      \
               crs:ProcessVersion=\"15.4\"\n      \
               crs:WhiteBalance=\"Custom\"\n      \
               crs:Temperature=\"{temp}\"\n      \
               crs:Tint=\"{tint:+}\"\n      \
               crs:Exposure2012=\"{ev}\"\n      \
               crs:HasSettings=\"True\"\n      \
               opticull:SharpnessScore=\"{sharp:.1}\"\n      \
               opticull:AestheticScore=\"{aesth:.2}\"/>\n  \
           </rdf:RDF>\n\
         </x:xmpmeta>\n\
         <?xpacket end=\"w\"?>\n",
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

/// Записывает сгенерированный `.xmp` sidecar на диск рядом с оригинальным изображением,
/// никогда не модифицируя исходный файл фотосессии.
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
}
