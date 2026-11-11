import { LytroIllumMeta } from '../types/culling.types';
import { logger } from './logger.service';

const TARGET_MIDDLE_GRAY = 0.18;
const LOG_EPSILON = 1e-4;

export interface PixelCvAnalysisResult {
  width: number;
  height: number;
  laplacianVariance: number;
  sharpnessScore: number;
  aestheticScore: number;
  geometricMeanLuma: number;
  recommendedExposureEv: number;
  wbTemperature: number;
  wbTint: number;
  histogramLuma: number[];
}

/**
 * Выполняет реальный попиксельный математический анализ изображения через HTML5 Canvas:
 * 1. Перевод RGB в канал яркости Y = 0.299R + 0.587G + 0.114B.
 * 2. Свертка оператором Лапласа 3x3 и вычисление дисперсии (Laplacian Variance).
 * 3. Построение 256-канальной гистограммы яркости.
 * 4. Вычисление логарифмического геометрического среднего яркости и сдвига экспозиции EV относительно 18% серого.
 * 5. Оценка баланса белого (Температура K и Оттенок Tint) и эстетического балла (контраст + композиционный центр).
 */
export async function analyzeImagePixelsFromUrl(imageUrl: string): Promise<PixelCvAnalysisResult> {
  const tStart = performance.now();
  logger.debug('CV_ENGINE', `Запуск попиксельного анализа изображения: ${imageUrl.slice(0, 60)}...`);

  let img: HTMLImageElement;
  try {
    img = await loadImageElement(imageUrl);
  } catch (err) {
    logger.error(
      'CV_ENGINE',
      `Сбой загрузки растра изображения: ${imageUrl.slice(0, 80)}`,
      undefined,
      imageUrl,
      err
    );
    throw err;
  }

  const naturalW = img.naturalWidth || img.width || 1024;
  const naturalH = img.naturalHeight || img.height || 768;

  // Масштабируем до 512px по длинной стороне для детерминированного и быстрого расчета Лапласа
  const maxDim = 512;
  const scale = Math.min(1, maxDim / Math.max(naturalW, naturalH, 1));
  const w = Math.max(8, Math.round(naturalW * scale));
  const h = Math.max(8, Math.round(naturalH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    const errorMsg = 'Не удалось получить 2D контекст Canvas для анализа изображения';
    logger.error('CV_ENGINE', errorMsg, { width: w, height: h });
    throw new Error(errorMsg);
  }

  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const totalPixels = w * h;

  const luma = new Float32Array(totalPixels);
  const histogram = new Array<number>(256).fill(0);

  let logLumaSum = 0;
  let validExposurePixels = 0;
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;

  for (let i = 0; i < totalPixels; i++) {
    const offset = i * 4;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];

    const y255 = 0.299 * r + 0.587 * g + 0.114 * b;
    luma[i] = y255;

    const bin = Math.min(255, Math.max(0, Math.round(y255)));
    histogram[bin] += 1;

    const yNorm = y255 / 255.0;
    const yLinear = Math.pow(yNorm, 2.2);

    if (yNorm >= 0.005 && yNorm <= 0.98) {
      logLumaSum += Math.log(yLinear + LOG_EPSILON);
      validExposurePixels += 1;
    }

    rSum += r;
    gSum += g;
    bSum += b;
  }

  // Свертка ядром Лапласа 3x3: [0, 1, 0; 1, -4, 1; 0, 1, 0]
  let lapSum = 0;
  let lapSqSum = 0;
  const innerCount = Math.max(1, (w - 2) * (h - 2));

  let centerEnergy = 0;
  let borderEnergy = 0;
  let centerCount = 0;
  let borderCount = 0;

  const xMinCenter = Math.floor(w * 0.25);
  const xMaxCenter = Math.floor(w * 0.75);
  const yMinCenter = Math.floor(h * 0.25);
  const yMaxCenter = Math.floor(h * 0.75);

  for (let y = 1; y < h - 1; y++) {
    const rowPrev = (y - 1) * w;
    const rowCurr = y * w;
    const rowNext = (y + 1) * w;

    for (let x = 1; x < w - 1; x++) {
      const center = luma[rowCurr + x];
      const lap =
        luma[rowPrev + x] +
        luma[rowNext + x] +
        luma[rowCurr + x - 1] +
        luma[rowCurr + x + 1] -
        4.0 * center;

      lapSum += lap;
      lapSqSum += lap * lap;

      const absLap = Math.abs(lap);
      if (x >= xMinCenter && x <= xMaxCenter && y >= yMinCenter && y <= yMaxCenter) {
        centerEnergy += absLap;
        centerCount += 1;
      } else {
        borderEnergy += absLap;
        borderCount += 1;
      }
    }
  }

  const lapMean = lapSum / innerCount;
  const lapVariance = Math.max(0, lapSqSum / innerCount - lapMean * lapMean);
  const sharpnessScore = Number(
    Math.min(99.5, Math.max(8.0, Math.sqrt(lapVariance / 6.2) * 8.4)).toFixed(1)
  );

  const geomMeanLinear = Math.min(
    0.95,
    Math.max(0.005, Math.exp(logLumaSum / Math.max(1, validExposurePixels)))
  );

  const rawEvShift = Math.log2(TARGET_MIDDLE_GRAY / geomMeanLinear) * 0.65;
  const recommendedExposureEv = Number(
    Math.min(2.5, Math.max(-2.5, rawEvShift)).toFixed(2)
  );

  // Оценка ББ по гипотезе серого мира
  const rAvg = Math.max(1, rSum / totalPixels);
  const gAvg = Math.max(1, gSum / totalPixels);
  const bAvg = Math.max(1, bSum / totalPixels);

  const rbRatio = Math.min(2.0, Math.max(0.5, rAvg / bAvg));
  const wbTemperature = Math.round(
    Math.min(8500, Math.max(3200, 5500 - (rbRatio - 1.0) * 1100))
  );
  const gmRatio = Math.min(1.3, Math.max(0.7, gAvg / ((rAvg + bAvg) * 0.5)));
  const wbTint = Math.round(Math.min(35, Math.max(-35, (1.0 - gmRatio) * 45)));

  // Расчет эстетического балла на основе распределения тонов и выделения объекта в центре
  const subjectSeparation = Math.min(
    1.6,
    Math.max(0.6, (centerEnergy / Math.max(1, centerCount)) / (borderEnergy / Math.max(1, borderCount) + 1.5))
  );
  const exposureHarmony = 1.0 - Math.min(1.0, Math.abs(recommendedExposureEv) / 2.5);
  const aestheticScore = Number(
    Math.min(9.8, Math.max(3.5, 5.1 + exposureHarmony * 2.2 + (subjectSeparation - 0.6) * 2.4)).toFixed(2)
  );

  // Нормализуем гистограмму до максимума 100 для удобства отрисовки
  const maxBin = Math.max(1, ...histogram);
  const normalizedHistogram = histogram.map((v) => Math.round((v / maxBin) * 100));

  const totalTimeMs = Math.round(performance.now() - tStart);
  logger.info(
    'CV_ENGINE',
    `Анализ кадра завершен за ${totalTimeMs} мс: резкость=${sharpnessScore} (σ²=${lapVariance.toFixed(1)}), EV=${recommendedExposureEv >= 0 ? '+' : ''}${recommendedExposureEv}, ББ=${wbTemperature}K`,
    {
      dimensions: `${naturalW}x${naturalH}`,
      scaledDimensions: `${w}x${h}`,
      totalPixels,
      laplacianVariance: lapVariance,
      sharpnessScore,
      aestheticScore,
      exposureEv: recommendedExposureEv,
      wbTemperature,
      wbTint,
      totalTimeMs,
    }
  );

  return {
    width: naturalW,
    height: naturalH,
    laplacianVariance: Number(lapVariance.toFixed(1)),
    sharpnessScore,
    aestheticScore,
    geometricMeanLuma: Number(geomMeanLinear.toFixed(3)),
    recommendedExposureEv,
    wbTemperature,
    wbTint,
    histogramLuma: normalizedHistogram,
  };
}

/**
 * Рендерит 100% кроп-лупу или карту контуров оператора Лапласа (Laplacian Edge Map)
 * с возможностью предпросмотра сдвига экспозиции `crs:Exposure2012`.
 */
export function renderLoupeOrLaplacianCanvas(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  options: {
    normCenterX: number;
    normCenterY: number;
    zoomFactor: number;
    showLaplacianMap: boolean;
    previewExposureEv: number;
  }
): void {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  const cw = canvas.width;
  const ch = canvas.height;
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (iw === 0 || ih === 0) return;

  const cropW = Math.max(32, iw / options.zoomFactor);
  const cropH = Math.max(32, ih / options.zoomFactor);
  const sx = Math.min(iw - cropW, Math.max(0, options.normCenterX * iw - cropW / 2));
  const sy = Math.min(ih - cropH, Math.max(0, options.normCenterY * ih - cropH / 2));

  ctx.clearRect(0, 0, cw, ch);
  ctx.drawImage(img, sx, sy, cropW, cropH, 0, 0, cw, ch);

  const evMultiplier = Math.pow(2, options.previewExposureEv);

  if (!options.showLaplacianMap && Math.abs(options.previewExposureEv) < 0.02) {
    return;
  }

  const imageData = ctx.getImageData(0, 0, cw, ch);
  const src = imageData.data;

  if (!options.showLaplacianMap) {
    // Только коррекция экспозиции в линейном пространстве
    for (let i = 0; i < src.length; i += 4) {
      src[i] = applyEvToChannel(src[i], evMultiplier);
      src[i + 1] = applyEvToChannel(src[i + 1], evMultiplier);
      src[i + 2] = applyEvToChannel(src[i + 2], evMultiplier);
    }
    ctx.putImageData(imageData, 0, 0);
    return;
  }

  // Вычисление карты контуров Лапласа 3x3
  const luma = new Float32Array(cw * ch);
  for (let i = 0; i < cw * ch; i++) {
    const idx = i * 4;
    luma[i] = 0.299 * src[idx] + 0.587 * src[idx + 1] + 0.114 * src[idx + 2];
  }

  const outData = ctx.createImageData(cw, ch);
  const dst = outData.data;

  for (let y = 1; y < ch - 1; y++) {
    const rPrev = (y - 1) * cw;
    const rCurr = y * cw;
    const rNext = (y + 1) * cw;

    for (let x = 1; x < cw - 1; x++) {
      const lap = Math.abs(
        luma[rPrev + x] +
          luma[rNext + x] +
          luma[rCurr + x - 1] +
          luma[rCurr + x + 1] -
          4 * luma[rCurr + x]
      );

      const mag = Math.min(255, lap * 4.2);
      const pIdx = (rCurr + x) * 4;

      // Оптическая тепловая подсветка граней: черная подложка -> бирюзовый -> янтарный пик резкости
      dst[pIdx] = Math.min(255, Math.max(0, (mag - 80) * 1.8));
      dst[pIdx + 1] = Math.min(255, mag * 1.15);
      dst[pIdx + 2] = Math.min(255, mag * 0.85 + 18);
      dst[pIdx + 3] = 255;
    }
  }

  ctx.putImageData(outData, 0, 0);
}

/**
 * Рендерит интерактивное 4D световое поле камеры Lytro Illum (`.LFR`):
 * - Синтетическая перефокусировка по выбранной плоскости глубины `currentLambda`
 * - Регулятор виртуальной диафрагмы `syntheticApertureFstop` (`f/1.0` .. `f/16`)
 * - Сдвиг перспективы субапертуры `(perspectiveU, perspectiveV)`
 * - Режим отображения плотной карты глубины (`depthMapMode`) и контуров зоны ГРИП (`focusPeakingMode`)
 */
export function renderLytro4DStageCanvas(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  lytro: LytroIllumMeta,
  options: {
    viewMode: 'refocus' | 'depth_map' | 'focus_peaking';
    exposureEv: number;
  }
): void {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  const cw = canvas.width;
  const ch = canvas.height;
  ctx.clearRect(0, 0, cw, ch);

  // Отрисовываем базовый кадр с параллакс-смещением субапертуры
  const shiftPxX = lytro.perspectiveU * 7.5;
  const shiftPxY = lytro.perspectiveV * 7.5;

  ctx.save();
  ctx.translate(shiftPxX, shiftPxY);
  ctx.scale(1.025, 1.025);
  ctx.drawImage(img, -cw * 0.012, -ch * 0.012, cw, ch);
  ctx.restore();

  const frameData = ctx.getImageData(0, 0, cw, ch);
  const src = frameData.data;

  // Создаем размытую копию для имитации кружка нерезкости синтетической диафрагмы f/1.0..f/16
  const blurCanvas = document.createElement('canvas');
  blurCanvas.width = cw;
  blurCanvas.height = ch;
  const blurCtx = blurCanvas.getContext('2d', { willReadFrequently: true });
  if (!blurCtx) return;

  const apertureBlurPx = Math.max(0.4, (10.5 / Math.max(1.0, lytro.syntheticApertureFstop)) * 1.45);
  blurCtx.filter = `blur(${apertureBlurPx.toFixed(1)}px)`;
  blurCtx.drawImage(canvas, 0, 0);
  const blurredData = blurCtx.getImageData(0, 0, cw, ch).data;

  const outImage = ctx.createImageData(cw, ch);
  const dst = outImage.data;
  const evGain = Math.pow(2, options.exposureEv);

  for (let y = 0; y < ch; y++) {
    const ny = y / ch;
    for (let x = 0; x < cw; x++) {
      const nx = x / cw;
      const idx = (y * cw + x) * 4;

      // Вычисляем оптическую глубину пикселя D(nx, ny) в единицах Lambda [-8..+12] на основе зон кадра
      const pixelLambda = sampleSceneDepthLambda(nx, ny, lytro);
      const lambdaDelta = Math.abs(pixelLambda - lytro.currentLambda);

      // Глубина резкости растет пропорционально диафрагменному числу f-stop
      const dofTolerance = 1.15 + lytro.syntheticApertureFstop * 0.55;
      const defocusBlend = Math.min(1.0, Math.max(0.0, (lambdaDelta - dofTolerance * 0.35) / (dofTolerance * 1.4)));

      if (options.viewMode === 'depth_map') {
        // Нормализованная карта глубины Lytro Illum [-8..+12] -> [0..1]
        const normDepth = Math.min(1, Math.max(0, (pixelLambda + 8.0) / 20.0));
        // Ближний план — теплый янтарный/бирюзовый, дальний — глубокий индиго
        const inFocusBand = lambdaDelta < dofTolerance * 0.45;
        if (inFocusBand) {
          dst[idx] = 6;
          dst[idx + 1] = 182;
          dst[idx + 2] = 212;
        } else {
          const v = Math.round((1.0 - normDepth) * 235);
          dst[idx] = v;
          dst[idx + 1] = v;
          dst[idx + 2] = Math.min(255, v + 20);
        }
        dst[idx + 3] = 255;
      } else {
        // Интерполяция между резким субапертурным слоем и синтетическим боке
        const r = src[idx] * (1 - defocusBlend) + blurredData[idx] * defocusBlend;
        const g = src[idx + 1] * (1 - defocusBlend) + blurredData[idx + 1] * defocusBlend;
        const b = src[idx + 2] * (1 - defocusBlend) + blurredData[idx + 2] * defocusBlend;

        let rf = applyEvToChannel(r, evGain);
        let gf = applyEvToChannel(g, evGain);
        let bf = applyEvToChannel(b, evGain);

        if (options.viewMode === 'focus_peaking' && defocusBlend < 0.22) {
          // Подсветка активной плоскости фокусировки бирюзовым маркером Lytro
          const lumaDiff = Math.abs(src[idx] - blurredData[idx]) + Math.abs(src[idx + 1] - blurredData[idx + 1]);
          if (lumaDiff > 14) {
            rf = 16;
            gf = 225;
            bf = 245;
          }
        }

        dst[idx] = rf;
        dst[idx + 1] = gf;
        dst[idx + 2] = bf;
        dst[idx + 3] = 255;
      }
    }
  }

  ctx.putImageData(outImage, 0, 0);
}

/**
 * Определяет оптическую глубину $\lambda$ в точке $(nx, ny) \in [0, 1]^2$ по калиброванным зонам сцены Lytro Illum.
 */
export function sampleSceneDepthLambda(nx: number, ny: number, lytro: LytroIllumMeta): number {
  let weightedLambda = 0;
  let weightSum = 0;

  for (const zone of lytro.focusZones) {
    const dx = nx - zone.normX;
    const dy = ny - zone.normY;
    const distSq = dx * dx + dy * dy;
    const sigmaSq = zone.radius * zone.radius;
    const w = Math.exp(-distSq / Math.max(0.005, sigmaSq));
    weightedLambda += zone.lambdaValue * w;
    weightSum += w;
  }

  // Фоновый градиент глубины (верх кадра дальше, низ ближе)
  const backgroundLambda = -3.0 + (1.0 - ny) * 11.5;
  const bgWeight = 0.18;

  return (weightedLambda + backgroundLambda * bgWeight) / (weightSum + bgWeight);
}

export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

function applyEvToChannel(val255: number, evLinearMultiplier: number): number {
  const norm = Math.max(0, Math.min(1, val255 / 255));
  const linear = Math.pow(norm, 2.2) * evLinearMultiplier;
  const srgb = Math.pow(Math.max(0, Math.min(1, linear)), 1 / 2.2);
  return Math.round(srgb * 255);
}
