import {
  ColorLabel,
  CullingThresholds,
  LytroIllumMeta,
  PhotoAnalysisItem,
} from '../types/culling.types';
import { logger } from './logger.service';

/**
 * Вычисляет рейтинг (1..5★) и цветовую метку Adobe XMP (`Green`, `Yellow`, `Red`, `Blue`)
 * на основе текущих порогов пользователя и статуса 4D-рефокуса Lytro Illum.
 */
export function evaluateRatingAndLabel(
  sharpness: number,
  aesthetic: number,
  lytroMeta: LytroIllumMeta | undefined,
  thresholds: CullingThresholds
): { rating: number; colorLabel: ColorLabel } {
  if (
    lytroMeta &&
    thresholds.enableLytro4DSalvage &&
    lytroMeta.salvagedByRefocus &&
    sharpness >= thresholds.minSharpnessPick
  ) {
    const rating = aesthetic >= thresholds.minAestheticPick ? 5 : 4;
    return { rating, colorLabel: ColorLabel.Blue };
  }

  if (sharpness >= thresholds.minSharpnessPick) {
    const rating = aesthetic >= thresholds.minAestheticPick ? 5 : 4;
    return { rating, colorLabel: ColorLabel.Green };
  }

  if (sharpness >= thresholds.minSharpnessReview) {
    return { rating: 3, colorLabel: ColorLabel.Yellow };
  }

  if (sharpness >= thresholds.minSharpnessReview * 0.6) {
    return { rating: 2, colorLabel: ColorLabel.Red };
  }

  return { rating: 1, colorLabel: ColorLabel.Red };
}

/**
 * Генерирует валидный XML-документ для `.xmp` sidecar-файла в стандарте Adobe Camera Raw (CRS)
 * с поддержкой расширенного пространства имен `xmlns:lytro="http://ns.lytro.com/lightfield/1.0/"`.
 */
export function generateAdobeXmpXml(item: {
  rating: number;
  colorLabel: ColorLabel;
  exposureEv: number;
  wbTemperature: number;
  wbTint: number;
  sharpnessScore: number;
  aestheticScore: number;
  lytroMeta?: LytroIllumMeta;
}): string {
  const clampedRating = Math.min(5, Math.max(0, Math.round(item.rating)));
  const clampedEv = Math.min(5.0, Math.max(-5.0, item.exposureEv));
  const evFormatted = clampedEv >= 0 ? `+${clampedEv.toFixed(2)}` : clampedEv.toFixed(2);
  const tintFormatted = item.wbTint >= 0 ? `+${item.wbTint}` : `${item.wbTint}`;
  const labelStr = item.colorLabel === ColorLabel.None ? '' : item.colorLabel;

  let lytroBlock = '';
  if (item.lytroMeta) {
    const m = item.lytroMeta;
    const lambdaStr = m.currentLambda >= 0 ? `+${m.currentLambda.toFixed(2)}` : m.currentLambda.toFixed(2);
    const optLambdaStr = m.optimalLambda >= 0 ? `+${m.optimalLambda.toFixed(2)}` : m.optimalLambda.toFixed(2);
    const puStr = m.perspectiveU >= 0 ? `+${m.perspectiveU.toFixed(2)}` : m.perspectiveU.toFixed(2);
    const pvStr = m.perspectiveV >= 0 ? `+${m.perspectiveV.toFixed(2)}` : m.perspectiveV.toFixed(2);
    const fminStr = m.focusSpreadMin >= 0 ? `+${m.focusSpreadMin.toFixed(1)}` : m.focusSpreadMin.toFixed(1);
    const fmaxStr = m.focusSpreadMax >= 0 ? `+${m.focusSpreadMax.toFixed(1)}` : m.focusSpreadMax.toFixed(1);

    lytroBlock = `\n      xmlns:lytro="http://ns.lytro.com/lightfield/1.0/"
      lytro:Format="${m.containerFormat}"
      lytro:CameraModel="${escapeXml(m.cameraModel)}"
      lytro:SensorMegarays="${m.sensorMegarays.toFixed(1)}"
      lytro:MlaPitchUm="${m.mlaPitchUm.toFixed(1)}"
      lytro:RefocusLambda="${lambdaStr}"
      lytro:OptimalLambda="${optLambdaStr}"
      lytro:SyntheticAperture="f/${m.syntheticApertureFstop.toFixed(1)}"
      lytro:PerspectiveU="${puStr}"
      lytro:PerspectiveV="${pvStr}"
      lytro:FocusSpreadMin="${fminStr}"
      lytro:FocusSpreadMax="${fmaxStr}"
      lytro:SalvagedBy4DRefocus="${m.salvagedByRefocus ? 'True' : 'False'}"`;
  }

  return `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="OptiCull RAW Rust Engine 1.4.0">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
      xmlns:xmp="http://ns.adobe.com/xap/1.0/"
      xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"
      xmlns:opticull="http://ns.opticull.local/culling/1.0/"${lytroBlock}
      xmp:CreatorTool="OptiCull RAW &amp; Lytro Illum 4D Studio"
      xmp:Rating="${clampedRating}"
      xmp:Label="${labelStr}"
      crs:Version="16.2"
      crs:ProcessVersion="15.4"
      crs:WhiteBalance="Custom"
      crs:Temperature="${Math.round(item.wbTemperature)}"
      crs:Tint="${tintFormatted}"
      crs:Exposure2012="${evFormatted}"
      crs:HasSettings="True"
      opticull:SharpnessScore="${item.sharpnessScore.toFixed(1)}"
      opticull:AestheticScore="${item.aestheticScore.toFixed(2)}"/>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

/**
 * Пересчитывает параметры кадра и его `.xmp` sidecar при изменении ползунков порогов.
 */
export function recalculateItemWithThresholds(
  item: PhotoAnalysisItem,
  thresholds: CullingThresholds
): PhotoAnalysisItem {
  let effectiveSharpness = item.rawSharpnessScore;
  let updatedLytro = item.lytroMeta ? { ...item.lytroMeta } : undefined;

  if (updatedLytro) {
    const distanceToOptimal = Math.abs(updatedLytro.currentLambda - updatedLytro.optimalLambda);
    // При наведении на оптимальную плоскость lambda резкость максимальна, при уходе — плавно снижается
    const focusFactor = Math.exp(-(distanceToOptimal * distanceToOptimal) / 18.0);
    // Более закрытая виртуальная диафрагма (например f/8 - f/16) расширяет ГРИП
    const dofBonus = Math.min(1.0, (updatedLytro.syntheticApertureFstop - 1.0) / 14.0) * 14.0;

    const computedLytroSharpness = Number(
      Math.min(
        99.4,
        updatedLytro.baseSharpnessScore * 0.55 +
          updatedLytro.refocusedSharpnessScore * 0.45 * (0.45 + 0.55 * focusFactor) +
          dofBonus
      ).toFixed(1)
    );

    effectiveSharpness = thresholds.enableLytro4DSalvage
      ? computedLytroSharpness
      : updatedLytro.baseSharpnessScore;

    updatedLytro.salvagedByRefocus =
      updatedLytro.baseSharpnessScore < thresholds.minSharpnessPick &&
      computedLytroSharpness >= thresholds.minSharpnessPick;
  }

  const clampedEv = Number(
    Math.min(
      thresholds.maxExposureShiftEv,
      Math.max(-thresholds.maxExposureShiftEv, item.rawExposureEv)
    ).toFixed(2)
  );

  const { rating, colorLabel } = item.manualOverride
    ? { rating: item.rating, colorLabel: item.colorLabel }
    : evaluateRatingAndLabel(effectiveSharpness, item.aestheticScore, updatedLytro, thresholds);

  const xmpXml = generateAdobeXmpXml({
    rating,
    colorLabel,
    exposureEv: clampedEv,
    wbTemperature: item.wbTemperature,
    wbTint: item.wbTint,
    sharpnessScore: effectiveSharpness,
    aestheticScore: item.aestheticScore,
    lytroMeta: updatedLytro,
  });

  return {
    ...item,
    sharpnessScore: effectiveSharpness,
    exposureEv: clampedEv,
    rating,
    colorLabel,
    lytroMeta: updatedLytro,
    xmpXml,
  };
}

/**
 * Скачивает текстовый файл (например `.xmp` или исходник `.rs`) на компьютер пользователя.
 */
export function downloadTextFile(filename: string, content: string, mimeType = 'application/xml'): void {
  logger.info('IO_FS', `Экспорт и скачивание файла: ${filename} (размер: ${content.length} байт)`, {
    filename,
    bytes: content.length,
    mimeType,
  });
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
