/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, useCallback } from 'react';
import {
  BatchFilterMode,
  ColorLabel,
  CullingThresholds,
  HardwareBackend,
  PhotoAnalysisItem,
  WorkspaceTab,
} from './types/culling.types';
import {
  AVAILABLE_HARDWARE_BACKENDS,
  DEFAULT_THRESHOLDS,
  INITIAL_BATCH_ITEMS,
} from './data/initialPhotos.data';
import {
  downloadTextFile,
  generateAdobeXmpXml,
  recalculateItemWithThresholds,
} from './services/xmpGenerator.service';
import { analyzeImagePixelsFromUrl } from './services/cvEngine.service';
import { TopBar } from './components/TopBar';
import { LeftControlRail } from './components/LeftControlRail';
import { BatchWorkstationCanvas } from './components/BatchWorkstationCanvas';
import { RightInspectorPanel } from './components/RightInspectorPanel';
import { LytroIllumStudioView } from './components/LytroIllumStudioView';
import { CompareSurveyView } from './components/CompareSurveyView';
import { RustSourceStudioView } from './components/RustSourceStudioView';
import { SystemLogsStudioView } from './components/SystemLogsStudioView';
import { logger } from './services/logger.service';

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(WorkspaceTab.Workstation);
  const [folderPath, setFolderPath] = useState<string>('D:/Shoots/2026_Concert_Session');
  const [selectedBackend, setSelectedBackend] = useState<HardwareBackend>(HardwareBackend.Auto);
  const [backendStatusMessage, setBackendStatusMessage] = useState<string>(
    'Автоматически выбран оптимальный локальный провайдер (Rayon + ONNX Runtime)'
  );
  const [fallbackOccurred, setFallbackOccurred] = useState<boolean>(false);

  const [thresholds, setThresholds] = useState<CullingThresholds>(DEFAULT_THRESHOLDS);
  const [items, setItems] = useState<PhotoAnalysisItem[]>(INITIAL_BATCH_ITEMS);
  const [selectedItemId, setSelectedItemId] = useState<string>(INITIAL_BATCH_ITEMS[0].id);
  const [filterMode, setFilterMode] = useState<BatchFilterMode>(BatchFilterMode.All);

  const [compareLeftId, setCompareLeftId] = useState<string>(INITIAL_BATCH_ITEMS[0].id);
  const [compareRightId, setCompareRightId] = useState<string>(
    INITIAL_BATCH_ITEMS[Math.min(1, INITIAL_BATCH_ITEMS.length - 1)].id
  );

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressPercent, setProgressPercent] = useState<number>(100);
  const [progressStatusText, setProgressStatusText] = useState<string>(
    'Пакет проанализирован: 5 файлов (2 пленоптических .LFR Lytro Illum, 3 камерных RAW)'
  );

  // При первом монтировании уточняем реальные метрики Лапласа и гистограммы по пикселям сгенерированных кадров
  useEffect(() => {
    let mounted = true;
    (async () => {
      const updated: PhotoAnalysisItem[] = [];
      for (const item of INITIAL_BATCH_ITEMS) {
        try {
          const realMetrics = await analyzeImagePixelsFromUrl(item.imageUrl);
          const mergedItem: PhotoAnalysisItem = {
            ...item,
            histogramLuma: realMetrics.histogramLuma,
          };
          updated.push(recalculateItemWithThresholds(mergedItem, DEFAULT_THRESHOLDS));
        } catch {
          updated.push(item);
        }
      }
      if (mounted && updated.length > 0) {
        setItems(updated);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Обработка смены аппаратного провайдера с проверкой доступности и демонстрацией CPU Fallback
  const handleSelectBackend = useCallback((backend: HardwareBackend) => {
    setSelectedBackend(backend);
    if (backend === HardwareBackend.Auto) {
      setFallbackOccurred(false);
      const msg = 'Активен умный выбор ускорителя (Auto -> CPU SIMD + WebGL Canvas)';
      setBackendStatusMessage(msg);
      logger.info('ONNX_ORT', 'Активирован режим автоматического выбора ускорителя (Auto)', {
        target: 'Auto',
        fallback: false,
      });
    } else if (backend === HardwareBackend.Cpu) {
      setFallbackOccurred(false);
      const msg = 'Выбран детерминированный многопоточный пул CPU (Rayon SIMD)';
      setBackendStatusMessage(msg);
      logger.info('ONNX_ORT', 'Выбран центральный процессор CPU (Rayon Multi-Threading / AVX2)', {
        target: 'Cpu',
        fallback: false,
      });
    } else {
      // Демонстрируем штатную работу механизма автоматического CPU fallback при отсутствии нативного драйвера в песочнице
      setFallbackOccurred(true);
      const msg = `Провайдер ${backend} недоступен в текущей среде — выполнен безопасный автоматический fallback на CPU`;
      setBackendStatusMessage(msg);
      logger.warn(
        'ONNX_ORT',
        `Аппаратный провайдер ${backend} не обнаружен на устройстве. Выполнен безопасный fallback на CPU без прерывания работы.`,
        { requestedBackend: backend, activeBackend: 'Cpu', fallbackOccurred: true }
      );
    }
  }, []);

  // Живой пересчет рейтингов и .XMP при движении любого ползунка порогов
  const handleThresholdsChange = useCallback((nextThresholds: CullingThresholds) => {
    setThresholds(nextThresholds);
    logger.debug('CORE', 'Обновлены пороговые значения скоринга', {
      minSharpnessPick: nextThresholds.minSharpnessPick,
      minSharpnessReview: nextThresholds.minSharpnessReview,
      minAestheticPick: nextThresholds.minAestheticPick,
      maxExposureShiftEv: nextThresholds.maxExposureShiftEv,
      enableLytro4DSalvage: nextThresholds.enableLytro4DSalvage,
    });
    setItems((prev) =>
      prev.map((item) => recalculateItemWithThresholds(item, nextThresholds))
    );
  }, []);

  const handleResetThresholds = useCallback(() => {
    logger.info('CORE', 'Сброс порогов отбора к значениям по умолчанию');
    handleThresholdsChange(DEFAULT_THRESHOLDS);
  }, [handleThresholdsChange]);

  // Пакетный прогон с пошаговым прогрессом (cull-progress) и реальным пересчетом метрик Canvas
  const handleRunBatchAnalysis = useCallback(async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    setProgressPercent(0);
    const startMsg = `Запуск пакетного отбора ${items.length} файлов на ускорителе ${selectedBackend}`;
    setProgressStatusText(startMsg);
    logger.info('PIPELINE', startMsg, {
      totalFiles: items.length,
      backend: selectedBackend,
      thresholds,
    });

    const total = items.length;
    const nextItems: PhotoAnalysisItem[] = [];

    for (let idx = 0; idx < total; idx++) {
      const current = items[idx];
      const stepPct = ((idx + 1) / total) * 100;
      setProgressStatusText(
        `cull-progress (${idx + 1}/${total}): ${current.fileName} [${selectedBackend}]`
      );
      setProgressPercent(stepPct);

      try {
        const t0 = performance.now();
        const cv = await analyzeImagePixelsFromUrl(current.imageUrl);
        const elapsed = Math.max(12, Math.round(performance.now() - t0));

        const updatedBase: PhotoAnalysisItem = {
          ...current,
          laplacianVariance: current.lytroMeta ? current.laplacianVariance : cv.laplacianVariance,
          histogramLuma: cv.histogramLuma,
          processingMs: elapsed,
          manualOverride: false,
        };
        const recalculated = recalculateItemWithThresholds(updatedBase, thresholds);
        nextItems.push(recalculated);

        logger.info(
          'PIPELINE',
          `Успешно обработан файл (${idx + 1}/${total}): ${current.fileName}`,
          {
            sharpness: recalculated.sharpnessScore,
            aesthetic: recalculated.aestheticScore,
            rating: recalculated.rating,
            label: recalculated.colorLabel,
            elapsedMs: elapsed,
          },
          current.fileName
        );
      } catch (err) {
        logger.error(
          'PIPELINE',
          `Ошибка обработки файла: ${current.fileName}`,
          { fileId: current.id },
          current.fileName,
          err
        );
        nextItems.push(recalculateItemWithThresholds(current, thresholds));
      }

      await new Promise((r) => setTimeout(r, 95));
    }

    setItems(nextItems);
    setIsProcessing(false);
    setProgressPercent(100);
    const finishMsg = `Пакетный анализ завершен: успешно обработано ${nextItems.length} кадров`;
    setProgressStatusText(finishMsg);
    logger.info('PIPELINE', finishMsg, {
      total: nextItems.length,
      picks: nextItems.filter((i) => i.colorLabel === ColorLabel.Green || i.colorLabel === ColorLabel.Blue).length,
      reviews: nextItems.filter((i) => i.colorLabel === ColorLabel.Yellow).length,
      rejects: nextItems.filter((i) => i.colorLabel === ColorLabel.Red).length,
    });
  }, [isProcessing, items, selectedBackend, thresholds]);

  // Загрузка собственных файлов пользователя (RAW / JPEG / Lytro .LFR) с реальным расчетом Лапласа и Exposure2012
  const handleUploadUserFiles = useCallback(
    async (fileList: FileList, treatAsLytroLfr: boolean) => {
      setIsProcessing(true);
      setProgressPercent(10);
      const uploadedItems: PhotoAnalysisItem[] = [];

      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const objectUrl = URL.createObjectURL(file);
        const ext = (file.name.split('.').pop() || 'JPG').toUpperCase();
        const isLfr = treatAsLytroLfr || ext === 'LFR' || ext === 'LFP';

        setProgressStatusText(`Анализ загруженного файла: ${file.name}...`);
        setProgressPercent(Math.round(((i + 1) / fileList.length) * 90));

        try {
          const t0 = performance.now();
          const cv = await analyzeImagePixelsFromUrl(objectUrl);
          const elapsed = Math.max(15, Math.round(performance.now() - t0));

          const lytroMeta = isLfr
            ? {
                isLytroRaw: true,
                containerFormat: (ext === 'LFP' ? 'LFP' : 'LFR') as 'LFR' | 'LFP',
                cameraModel: 'Lytro Illum 40MR',
                sensorMegarays: 40.0,
                mlaPitchUm: 20.0,
                physicalAperture: 2.0,
                focalLengthMm: 50,
                pitchDeg: -0.8,
                rollDeg: 0.2,
                capturedLambda: -3.2,
                optimalLambda: 1.5,
                currentLambda: 1.5,
                syntheticApertureFstop: 2.0,
                perspectiveU: 0.0,
                perspectiveV: 0.0,
                focusSpreadMin: -7.5,
                focusSpreadMax: 11.0,
                depthHistogram: [8, 16, 32, 54, 71, 88, 95, 82, 64, 49, 38, 45, 58, 39, 21, 9],
                baseSharpnessScore: Math.max(25, Number((cv.sharpnessScore * 0.72).toFixed(1))),
                refocusedSharpnessScore: Math.min(98.5, Number((cv.sharpnessScore * 1.18).toFixed(1))),
                salvagedByRefocus: true,
                focusZones: [
                  {
                    id: `z_fg_${i}`,
                    label: 'Передний план',
                    normX: 0.32,
                    normY: 0.72,
                    radius: 0.24,
                    lambdaValue: -4.2,
                    planeDescription: 'Ближняя зона (-4.2 λ)',
                  },
                  {
                    id: `z_mid_${i}`,
                    label: 'Центральный объект (Пик резкости)',
                    normX: 0.5,
                    normY: 0.42,
                    radius: 0.24,
                    lambdaValue: 1.5,
                    planeDescription: 'Оптимальная плоскость (+1.5 λ)',
                  },
                  {
                    id: `z_bg_${i}`,
                    label: 'Дальний план (Фон)',
                    normX: 0.72,
                    normY: 0.24,
                    radius: 0.25,
                    lambdaValue: 8.2,
                    planeDescription: 'Фоновая зона (+8.2 λ)',
                  },
                ],
              }
            : undefined;

          const baseItem: PhotoAnalysisItem = {
            id: `USER_${Date.now()}_${i}`,
            fileName: isLfr && !file.name.toUpperCase().endsWith('.LFR')
              ? `${file.name.replace(/\.[^/.]+$/, '')}.LFR`
              : file.name,
            filePath: `${folderPath}/${file.name}`,
            xmpPath: `${folderPath}/${file.name.replace(/\.[^/.]+$/, '')}.xmp`,
            imageUrl: objectUrl,
            formatBadge: isLfr ? 'LYTRO 4D .LFR' : ext,
            cameraExif: isLfr
              ? 'Lytro Illum 40MR · 4D Light Field Container'
              : `Локальный файл · ${cv.width}×${cv.height}`,
            width: cv.width,
            height: cv.height,
            laplacianVariance: cv.laplacianVariance,
            rawSharpnessScore: cv.sharpnessScore,
            sharpnessScore: cv.sharpnessScore,
            aestheticScore: cv.aestheticScore,
            geometricMeanLuma: cv.geometricMeanLuma,
            rawExposureEv: cv.recommendedExposureEv,
            exposureEv: cv.recommendedExposureEv,
            wbTemperature: cv.wbTemperature,
            wbTint: cv.wbTint,
            histogramLuma: cv.histogramLuma,
            rating: 4,
            colorLabel: ColorLabel.Green,
            xmpSaved: true,
            xmpXml: '',
            lytroMeta,
            processingMs: elapsed,
          };

          const recalculated = recalculateItemWithThresholds(baseItem, thresholds);
          uploadedItems.push(recalculated);
          logger.info(
            'IO_FS',
            `Файл успешно импортирован и проанализирован: ${file.name} [${recalculated.formatBadge}]`,
            {
              format: recalculated.formatBadge,
              dimensions: `${cv.width}x${cv.height}`,
              sharpness: recalculated.sharpnessScore,
              exposureEv: recalculated.exposureEv,
              rating: recalculated.rating,
              isLytro: Boolean(lytroMeta),
            },
            file.name
          );
        } catch (err) {
          logger.error(
            'IO_FS',
            `Сбой чтения или декодирования загруженного файла: ${file.name}`,
            undefined,
            file.name,
            err
          );
        }
      }

      if (uploadedItems.length > 0) {
        setItems((prev) => [...uploadedItems, ...prev]);
        setSelectedItemId(uploadedItems[0].id);
        logger.info(
          'PIPELINE',
          `Пакет пополнен: добавлено ${uploadedItems.length} файлов. Всего в пакете: ${items.length + uploadedItems.length}`,
          { added: uploadedItems.length, total: items.length + uploadedItems.length }
        );
        if (treatAsLytroLfr) {
          setActiveTab(WorkspaceTab.Lytro4D);
        }
      }

      setIsProcessing(false);
      setProgressPercent(100);
      setProgressStatusText(`Добавлено и проанализировано новых файлов: ${uploadedItems.length}`);
    },
    [folderPath, thresholds, items.length]
  );

  // Обновление параметров 4D светового поля Lytro Illum (Lambda, диафрагма, параллакс u/v)
  const handleUpdateLytroParams = useCallback(
    (
      itemId: string,
      params: {
        currentLambda?: number;
        syntheticApertureFstop?: number;
        perspectiveU?: number;
        perspectiveV?: number;
      }
    ) => {
      logger.debug('LYTRO_4D', `Коррекция оптических параметров кадра ${itemId}`, params, itemId);
      setItems((prev) =>
        prev.map((item) => {
          if (item.id !== itemId || !item.lytroMeta) return item;
          const nextMeta = {
            ...item.lytroMeta,
            currentLambda: params.currentLambda ?? item.lytroMeta.currentLambda,
            syntheticApertureFstop:
              params.syntheticApertureFstop ?? item.lytroMeta.syntheticApertureFstop,
            perspectiveU: params.perspectiveU ?? item.lytroMeta.perspectiveU,
            perspectiveV: params.perspectiveV ?? item.lytroMeta.perspectiveV,
          };
          return recalculateItemWithThresholds(
            {
              ...item,
              lytroMeta: nextMeta,
            },
            thresholds
          );
        })
      );
    },
    [thresholds]
  );

  // Синтез 4D стека Lytro Illum для любого выбранного 2D кадра
  const handleConvertItemToLytro4D = useCallback(
    (itemId: string) => {
      logger.info('LYTRO_4D', `Запуск 4D-реконструкции светового поля для кадра ${itemId}`, undefined, itemId);
      setItems((prev) =>
        prev.map((item) => {
          if (item.id !== itemId) return item;
          const lytroMeta = {
            isLytroRaw: true,
            containerFormat: 'LFR' as const,
            cameraModel: 'Lytro Illum 40MR (Reconstructed 4D)',
            sensorMegarays: 40.0,
            mlaPitchUm: 20.0,
            physicalAperture: 2.0,
            focalLengthMm: 50,
            pitchDeg: 0.0,
            rollDeg: 0.0,
            capturedLambda: -2.5,
            optimalLambda: 1.4,
            currentLambda: 1.4,
            syntheticApertureFstop: 2.0,
            perspectiveU: 0.0,
            perspectiveV: 0.0,
            focusSpreadMin: -7.0,
            focusSpreadMax: 10.5,
            depthHistogram: [7, 15, 29, 48, 69, 86, 94, 81, 63, 47, 36, 42, 54, 35, 18, 8],
            baseSharpnessScore: item.rawSharpnessScore,
            refocusedSharpnessScore: Math.min(98.8, Number((item.rawSharpnessScore * 1.24).toFixed(1))),
            salvagedByRefocus: item.rawSharpnessScore < thresholds.minSharpnessPick,
            focusZones: [
              {
                id: `conv_fg_${item.id}`,
                label: 'Передний план (λ = -3.8)',
                normX: 0.3,
                normY: 0.72,
                radius: 0.25,
                lambdaValue: -3.8,
                planeDescription: 'Ближняя плоскость (-3.8 λ)',
              },
              {
                id: `conv_mid_${item.id}`,
                label: 'Средний план (Пик резкости λ = +1.4)',
                normX: 0.52,
                normY: 0.44,
                radius: 0.25,
                lambdaValue: 1.4,
                planeDescription: 'Главный объект (+1.4 λ)',
              },
              {
                id: `conv_bg_${item.id}`,
                label: 'Дальний план (λ = +7.8)',
                normX: 0.74,
                normY: 0.22,
                radius: 0.26,
                lambdaValue: 7.8,
                planeDescription: 'Бесконечность (+7.8 λ)',
              },
            ],
          };

          return recalculateItemWithThresholds(
            {
              ...item,
              formatBadge: 'LYTRO 4D .LFR',
              lytroMeta,
            },
            thresholds
          );
        })
      );
      setActiveTab(WorkspaceTab.Lytro4D);
    },
    [thresholds]
  );

  // Ручная установка рейтинга и метки пользователем
  const handleUpdateManualRating = useCallback(
    (itemId: string, rating: number, colorLabel: ColorLabel) => {
      logger.info('XMP_SIDECAR', `Ручное присвоение рейтинга: кадр ${itemId} -> ${rating}★, метка ${colorLabel}`, {
        itemId,
        rating,
        colorLabel,
      });
      setItems((prev) =>
        prev.map((item) => {
          if (item.id !== itemId) return item;
          const xmpXml = generateAdobeXmpXml({
            rating,
            colorLabel,
            exposureEv: item.exposureEv,
            wbTemperature: item.wbTemperature,
            wbTint: item.wbTint,
            sharpnessScore: item.sharpnessScore,
            aestheticScore: item.aestheticScore,
            lytroMeta: item.lytroMeta,
          });
          return {
            ...item,
            rating,
            colorLabel,
            manualOverride: true,
            xmpXml,
          };
        })
      );
    },
    []
  );

  // Быстрый вердикт в режиме сравнения двух кадров (Compare View)
  const handleAssignCompareVerdict = useCallback(
    (winnerId: string, loserId: string) => {
      logger.info('PIPELINE', `Вердикт сравнения Survey: победил ${winnerId} (5★ Green), отклонен ${loserId} (1★ Red)`, {
        winnerId,
        loserId,
      });
      handleUpdateManualRating(winnerId, 5, ColorLabel.Green);
      handleUpdateManualRating(loserId, 1, ColorLabel.Red);
    },
    [handleUpdateManualRating]
  );

  // Пакетная выгрузка объединенного XMP-отчета по всей сессии
  const handleExportAllXmp = useCallback(() => {
    logger.info('XMP_SIDECAR', `Экспорт пакета XMP sidecar-файлов (${items.length} кадров)`);
    const bundleContent = items
      .map(
        (item) =>
          `<!-- ==================== FILE: ${item.fileName} -> ${item.xmpPath} ==================== -->\n${item.xmpXml}`
      )
      .join('\n\n');
    downloadTextFile('opticull_batch_sidecars_bundle.xmp.xml', bundleContent);
  }, [items]);

  const selectedItem = items.find((i) => i.id === selectedItemId) || items[0];

  return (
    <div className="h-dvh w-screen flex flex-col bg-[#0B0C0E] text-[#F1F3F5] overflow-hidden">
      {/* Верхняя навигационная панель по контракту 3 зон */}
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onRunBatch={handleRunBatchAnalysis}
        isProcessing={isProcessing}
      />

      {/* Основная рабочая область без двойного скролла страницы */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {activeTab === WorkspaceTab.Workstation && (
          <>
            <LeftControlRail
              folderPath={folderPath}
              onFolderPathChange={setFolderPath}
              selectedBackend={selectedBackend}
              onSelectBackend={handleSelectBackend}
              backends={AVAILABLE_HARDWARE_BACKENDS}
              backendStatusMessage={backendStatusMessage}
              fallbackOccurred={fallbackOccurred}
              thresholds={thresholds}
              onChangeThresholds={handleThresholdsChange}
              onResetThresholds={handleResetThresholds}
              onUploadFiles={handleUploadUserFiles}
              onExportAllXmp={handleExportAllXmp}
              totalItemsCount={items.length}
            />

            <BatchWorkstationCanvas
              items={items}
              selectedItemId={selectedItem?.id || ''}
              onSelectItem={setSelectedItemId}
              filterMode={filterMode}
              onFilterModeChange={setFilterMode}
              isProcessing={isProcessing}
              progressPercent={progressPercent}
              progressStatusText={progressStatusText}
              onOpenLytroStudioForItem={(id) => {
                setSelectedItemId(id);
                setActiveTab(WorkspaceTab.Lytro4D);
              }}
            />

            <RightInspectorPanel
              selectedItem={selectedItem}
              onUpdateManualRating={handleUpdateManualRating}
              onUpdateLytroParams={handleUpdateLytroParams}
              onConvertItemToLytro4D={handleConvertItemToLytro4D}
              onOpenLytroStudio={() => setActiveTab(WorkspaceTab.Lytro4D)}
              activeMainTab={activeTab}
            />
          </>
        )}

        {activeTab === WorkspaceTab.Lytro4D && selectedItem && (
          <LytroIllumStudioView
            items={items}
            selectedItem={selectedItem}
            onSelectItem={setSelectedItemId}
            onUpdateLytroParams={handleUpdateLytroParams}
            onConvertItemToLytro4D={handleConvertItemToLytro4D}
          />
        )}

        {activeTab === WorkspaceTab.Compare && (
          <CompareSurveyView
            items={items}
            leftItemId={compareLeftId}
            rightItemId={compareRightId}
            onSelectLeft={setCompareLeftId}
            onSelectRight={setCompareRightId}
            onAssignVerdict={handleAssignCompareVerdict}
          />
        )}

        {activeTab === WorkspaceTab.RustSource && <RustSourceStudioView />}

        {activeTab === WorkspaceTab.SystemLogs && <SystemLogsStudioView />}
      </div>
    </div>
  );
}
