/**
 * Строгие контракты типов для станции пакетного отбора OptiCull RAW и студии светового поля Lytro Illum 4D.
 */

export enum HardwareBackend {
  Auto = 'Auto',
  Cpu = 'Cpu',
  DirectML = 'DirectML',
  CoreML = 'CoreML',
  Cuda = 'Cuda',
}

export enum ColorLabel {
  Green = 'Green',
  Yellow = 'Yellow',
  Red = 'Red',
  Blue = 'Blue',
  None = 'None',
}

export enum WorkspaceTab {
  Workstation = 'workstation',
  Lytro4D = 'lytro4d',
  Compare = 'compare',
  RustSource = 'rust_source',
  SystemLogs = 'system_logs',
}

export enum BatchFilterMode {
  All = 'all',
  Pick = 'pick',
  Review = 'review',
  Reject = 'reject',
  LytroOnly = 'lytro_only',
}

export interface DepthFocusZone {
  id: string;
  label: string;
  /** Нормализованные координаты центра зоны [0..1] */
  normX: number;
  normY: number;
  radius: number;
  /** Оптическая глубина плоскости в единицах Lambda [-10..+15] */
  lambdaValue: number;
  /** Описание объекта в этой плоскости фокусировки */
  planeDescription: string;
}

export interface LytroIllumMeta {
  isLytroRaw: boolean;
  containerFormat: 'LFR' | 'LFP';
  cameraModel: string;
  sensorMegarays: number;
  mlaPitchUm: number;
  physicalAperture: number;
  focalLengthMm: number;
  pitchDeg: number;
  rollDeg: number;
  capturedLambda: number;
  optimalLambda: number;
  currentLambda: number;
  syntheticApertureFstop: number;
  perspectiveU: number;
  perspectiveV: number;
  focusSpreadMin: number;
  focusSpreadMax: number;
  depthHistogram: number[];
  baseSharpnessScore: number;
  refocusedSharpnessScore: number;
  salvagedByRefocus: boolean;
  focusZones: DepthFocusZone[];
}

export interface PhotoAnalysisItem {
  id: string;
  fileName: string;
  filePath: string;
  xmpPath: string;
  imageUrl: string;
  formatBadge: string;
  cameraExif: string;
  width: number;
  height: number;
  laplacianVariance: number;
  /** Базовый технический скор резкости (до 4D-рефокуса для Lytro) */
  rawSharpnessScore: number;
  /** Итоговый скор резкости с учетом текущей/оптимальной плоскости фокуса */
  sharpnessScore: number;
  aestheticScore: number;
  geometricMeanLuma: number;
  /** Рассчитанный по 18% серому сдвиг EV до применения лимита ползунка */
  rawExposureEv: number;
  /** Сдвиг EV для записи в crs:Exposure2012 */
  exposureEv: number;
  wbTemperature: number;
  wbTint: number;
  histogramLuma: number[];
  rating: number;
  colorLabel: ColorLabel;
  xmpSaved: boolean;
  xmpXml: string;
  lytroMeta?: LytroIllumMeta;
  processingMs: number;
  manualOverride?: boolean;
}

export interface CullingThresholds {
  minSharpnessPick: number;
  minSharpnessReview: number;
  minAestheticPick: number;
  maxExposureShiftEv: number;
  enableLytro4DSalvage: boolean;
}

export interface BackendOption {
  id: HardwareBackend;
  label: string;
  platformHint: string;
  availableNatively: boolean;
}

export interface RustSourceFileEntry {
  id: string;
  relativePath: string;
  title: string;
  language: 'toml' | 'rust' | 'html' | 'javascript' | 'markdown' | 'yaml' | 'json';
  description: string;
  code: string;
}
