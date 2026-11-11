import React, { useEffect, useRef, useState } from 'react';
import { Copy, Check, Download, Sparkles, Sliders, FileCode2, Eye } from 'lucide-react';
import {
  ColorLabel,
  PhotoAnalysisItem,
  WorkspaceTab,
} from '../types/culling.types';
import {
  loadImageElement,
  renderLoupeOrLaplacianCanvas,
} from '../services/cvEngine.service';
import { downloadTextFile } from '../services/xmpGenerator.service';

interface RightInspectorPanelProps {
  selectedItem: PhotoAnalysisItem | undefined;
  onUpdateManualRating: (itemId: string, rating: number, label: ColorLabel) => void;
  onUpdateLytroParams: (
    itemId: string,
    params: {
      currentLambda?: number;
      syntheticApertureFstop?: number;
      perspectiveU?: number;
      perspectiveV?: number;
    }
  ) => void;
  onConvertItemToLytro4D: (itemId: string) => void;
  onOpenLytroStudio: () => void;
  activeMainTab?: WorkspaceTab;
}

export const RightInspectorPanel: React.FC<RightInspectorPanelProps> = ({
  selectedItem,
  onUpdateManualRating,
  onUpdateLytroParams,
  onConvertItemToLytro4D,
  onOpenLytroStudio,
}) => {
  const [inspectorSection, setInspectorSection] = useState<'loupe' | 'lytro' | 'xmp'>('loupe');
  const [showLaplacianMap, setShowLaplacianMap] = useState<boolean>(false);
  const [applyEvPreview, setApplyEvPreview] = useState<boolean>(true);
  const [zoomFactor, setZoomFactor] = useState<number>(2.2);
  const [normCenter, setNormCenter] = useState<{ x: number; y: number }>({ x: 0.52, y: 0.36 });
  const [copiedXmp, setCopiedXmp] = useState<boolean>(false);

  const loupeCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!selectedItem || !loupeCanvasRef.current) return;
    let cancelled = false;

    loadImageElement(selectedItem.imageUrl)
      .then((img) => {
        if (cancelled || !loupeCanvasRef.current) return;
        renderLoupeOrLaplacianCanvas(loupeCanvasRef.current, img, {
          normCenterX: normCenter.x,
          normCenterY: normCenter.y,
          zoomFactor,
          showLaplacianMap,
          previewExposureEv: applyEvPreview ? selectedItem.exposureEv : 0,
        });
      })
      .catch((err) => {
        console.debug('Ошибка отрисовки лупы:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedItem, normCenter, zoomFactor, showLaplacianMap, applyEvPreview]);

  if (!selectedItem) {
    return (
      <aside className="w-96 bg-[#131519] border-l border-[#22262E] p-6 flex items-center justify-center text-xs text-[#8A919E]">
        Выберите кадр в таблице или сетке для детальной инспекции
      </aside>
    );
  }

  const handleLoupeClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = Math.min(0.95, Math.max(0.05, (e.clientX - rect.left) / rect.width));
    const ny = Math.min(0.95, Math.max(0.05, (e.clientY - rect.top) / rect.height));
    setNormCenter({ x: nx, y: ny });
  };

  const handleCopyXmp = () => {
    navigator.clipboard.writeText(selectedItem.xmpXml);
    setCopiedXmp(true);
    setTimeout(() => setCopiedXmp(false), 1800);
  };

  const handleDownloadSingleXmp = () => {
    const baseName = selectedItem.fileName.replace(/\.[^/.]+$/, '');
    downloadTextFile(`${baseName}.xmp`, selectedItem.xmpXml);
  };

  const evFormatted =
    selectedItem.exposureEv >= 0
      ? `+${selectedItem.exposureEv.toFixed(2)} EV`
      : `${selectedItem.exposureEv.toFixed(2)} EV`;

  return (
    <aside className="w-96 bg-[#131519] border-l border-[#22262E] flex flex-col min-h-0 shrink-0">
      {/* Заголовок выбранного файла */}
      <div className="p-3.5 border-b border-[#22262E] space-y-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-[#F1F3F5] truncate">
            {selectedItem.fileName}
          </h3>
          <span className="text-xs font-mono text-[#8A919E] shrink-0">
            {selectedItem.width}×{selectedItem.height}
          </span>
        </div>
        <div className="text-xs text-[#8A919E] truncate">{selectedItem.cameraExif}</div>
      </div>

      {/* Переключатель режимов инспектора */}
      <div className="grid grid-cols-3 gap-1 p-2 bg-[#0B0C0E] border-b border-[#22262E]">
        <button
          type="button"
          onClick={() => setInspectorSection('loupe')}
          className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            inspectorSection === 'loupe'
              ? 'bg-[#1D212A] text-[#F1F3F5]'
              : 'text-[#8A919E] hover:text-[#F1F3F5]'
          }`}
        >
          <Eye className="w-3.5 h-3.5" />
          <span>Лупа &amp; EV</span>
        </button>

        <button
          type="button"
          onClick={() => setInspectorSection('lytro')}
          className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            inspectorSection === 'lytro'
              ? 'bg-[#122B34] text-cyan-200'
              : 'text-[#8A919E] hover:text-[#F1F3F5]'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Lytro 4D</span>
        </button>

        <button
          type="button"
          onClick={() => setInspectorSection('xmp')}
          className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            inspectorSection === 'xmp'
              ? 'bg-[#1D212A] text-[#F1F3F5]'
              : 'text-[#8A919E] hover:text-[#F1F3F5]'
          }`}
        >
          <FileCode2 className="w-3.5 h-3.5" />
          <span>.XMP Код</span>
        </button>
      </div>

      {/* Содержимое активной вкладки инспектора */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {inspectorSection === 'loupe' && (
          <>
            {/* Лупа 100% кропа и карта оператора Лапласа */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#F1F3F5]">
                  Кроп-лупа резкости ({Math.round(zoomFactor * 100)}%)
                </span>
                <div className="flex items-center gap-1">
                  {[1.5, 2.2, 3.5].map((z) => (
                    <button
                      key={z}
                      type="button"
                      onClick={() => setZoomFactor(z)}
                      className={`px-2 py-0.5 text-xs font-mono rounded transition-colors cursor-pointer ${
                        Math.abs(zoomFactor - z) < 0.1
                          ? 'bg-amber-500 text-[#0B0C0E] font-semibold'
                          : 'bg-[#1A1D24] text-[#8A919E] hover:text-[#F1F3F5]'
                      }`}
                    >
                      {Math.round(z * 100)}%
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative rounded-md overflow-hidden border border-[#22262E] bg-[#0B0C0E]">
                <canvas
                  ref={loupeCanvasRef}
                  width={340}
                  height={210}
                  onClick={handleLoupeClick}
                  title="Кликните для смещения зоны 100% кропа"
                  className="w-full h-48 object-cover cursor-crosshair block"
                />
                <div className="flex items-center justify-between px-2.5 py-1.5 bg-[#0B0C0E]/90 border-t border-[#22262E] text-xs font-mono text-[#8A919E]">
                  <span>
                    Laplacian σ²: <strong className="text-[#F1F3F5]">{selectedItem.laplacianVariance.toFixed(1)}</strong>
                  </span>
                  <span>·</span>
                  <span>
                    Скор: <strong className="text-amber-400">{selectedItem.sharpnessScore.toFixed(1)}</strong>
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowLaplacianMap((prev) => !prev)}
                  className={`py-1.5 px-2.5 rounded border text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    showLaplacianMap
                      ? 'bg-cyan-500/20 border-cyan-500 text-cyan-200'
                      : 'bg-[#1A1D24] border-[#2A2F3A] text-[#8A919E] hover:text-[#F1F3F5]'
                  }`}
                >
                  {showLaplacianMap ? 'Карта Лапласа: ВКЛ' : 'Карта граней Лапласа'}
                </button>

                <button
                  type="button"
                  onClick={() => setApplyEvPreview((prev) => !prev)}
                  className={`py-1.5 px-2.5 rounded border text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    applyEvPreview
                      ? 'bg-amber-500/20 border-amber-500 text-amber-200'
                      : 'bg-[#1A1D24] border-[#2A2F3A] text-[#8A919E] hover:text-[#F1F3F5]'
                  }`}
                >
                  {applyEvPreview ? `Превью ${evFormatted}` : 'Оригинал без EV'}
                </button>
              </div>
            </div>

            <hr className="border-[#22262E]" />

            {/* Интерактивная гистограмма яркости и расчет Exposure2012 (18% Middle Gray) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#F1F3F5]">
                  Гистограмма яркости &amp; Exposure2012
                </span>
                <span className="text-xs font-mono tabular-nums text-amber-400">
                  {evFormatted}
                </span>
              </div>

              <div className="p-3 rounded-md bg-[#0B0C0E] border border-[#22262E] space-y-2">
                <div className="h-24 flex items-end gap-0.5 relative pt-2">
                  {/* Референсная вертикальная линия 18% фотографического серого */}
                  <div
                    style={{ left: '46%' }}
                    className="absolute top-0 bottom-0 w-px border-l border-dashed border-amber-500/70 z-10 pointer-events-none"
                    title="Референс 18% Middle Gray (sRGB ~46%)"
                  />
                  {selectedItem.histogramLuma.slice(0, 32).map((val, idx) => (
                    <div
                      key={idx}
                      style={{ height: `${Math.max(6, val)}%` }}
                      className="flex-1 bg-[#3A404D] hover:bg-amber-400 transition-colors rounded-t-xs"
                    />
                  ))}
                </div>

                <div className="flex items-center justify-between text-xs font-mono text-[#8A919E] pt-1 border-t border-[#1A1D24]">
                  <span>L_avg: {selectedItem.geometricMeanLuma.toFixed(3)}</span>
                  <span>·</span>
                  <span>Цель: 0.180 (18%)</span>
                  <span>·</span>
                  <span>ББ: {selectedItem.wbTemperature}K</span>
                </div>
              </div>
            </div>
          </>
        )}

        {inspectorSection === 'lytro' && (
          <div className="space-y-4">
            {selectedItem.lytroMeta ? (
              <>
                <div className="p-3 rounded-md bg-[#0D1E25] border border-cyan-800/50 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-cyan-200">
                      {selectedItem.lytroMeta.cameraModel}
                    </span>
                    <span className="font-mono text-cyan-300">
                      {selectedItem.lytroMeta.sensorMegarays.toFixed(0)} Megarays
                    </span>
                  </div>
                  <div className="text-xs text-[#8A919E]">
                    Шаг микролинз MLA: {selectedItem.lytroMeta.mlaPitchUm} мкм · Оптика f/{selectedItem.lytroMeta.physicalAperture.toFixed(1)}
                  </div>
                </div>

                {/* Быстрый выбор калиброванных плоскостей глубины */}
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-[#F1F3F5]">
                    Плоскости фокусировки 4D-поля (клик):
                  </span>
                  <div className="space-y-1.5">
                    {selectedItem.lytroMeta.focusZones.map((zone) => {
                      const isCurrentPlane =
                        Math.abs((selectedItem.lytroMeta?.currentLambda ?? 0) - zone.lambdaValue) < 1.1;
                      return (
                        <button
                          key={zone.id}
                          type="button"
                          onClick={() =>
                            onUpdateLytroParams(selectedItem.id, {
                              currentLambda: zone.lambdaValue,
                            })
                          }
                          className={`w-full text-left p-2 rounded border text-xs transition-colors cursor-pointer ${
                            isCurrentPlane
                              ? 'bg-cyan-950/60 border-cyan-500 text-[#F1F3F5]'
                              : 'bg-[#0B0C0E] border-[#22262E] text-[#8A919E] hover:text-[#F1F3F5]'
                          }`}
                        >
                          <div className="flex items-center justify-between font-medium">
                            <span>{zone.label}</span>
                            <span className="font-mono text-cyan-300">
                              λ = {zone.lambdaValue >= 0 ? `+${zone.lambdaValue.toFixed(1)}` : zone.lambdaValue.toFixed(1)}
                            </span>
                          </div>
                          <div className="text-xs text-[#8A919E] mt-0.5">
                            {zone.planeDescription}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Ползунок оптической глубины Lambda */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#8A919E]">Плоскость рефокуса (Lambda λ)</span>
                    <span className="font-mono tabular-nums text-cyan-300">
                      {selectedItem.lytroMeta.currentLambda >= 0
                        ? `+${selectedItem.lytroMeta.currentLambda.toFixed(2)}`
                        : selectedItem.lytroMeta.currentLambda.toFixed(2)}{' '}
                      λ
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-10}
                    max={15}
                    step={0.2}
                    value={selectedItem.lytroMeta.currentLambda}
                    onChange={(e) =>
                      onUpdateLytroParams(selectedItem.id, {
                        currentLambda: Number(e.target.value),
                      })
                    }
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                </div>

                {/* Ползунок виртуальной диафрагмы Synthetic Aperture */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#8A919E]">Виртуальная диафрагма (ГРИП)</span>
                    <span className="font-mono tabular-nums text-amber-300">
                      f/{selectedItem.lytroMeta.syntheticApertureFstop.toFixed(1)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1.0}
                    max={16.0}
                    step={0.2}
                    value={selectedItem.lytroMeta.syntheticApertureFstop}
                    onChange={(e) =>
                      onUpdateLytroParams(selectedItem.id, {
                        syntheticApertureFstop: Number(e.target.value),
                      })
                    }
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                </div>

                <button
                  type="button"
                  onClick={onOpenLytroStudio}
                  className="w-full py-2 px-3 bg-cyan-500 hover:bg-cyan-400 text-[#0B0C0E] font-semibold text-xs rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Открыть полноэкранную студию Lytro Illum 4D
                </button>
              </>
            ) : (
              <div className="p-4 rounded-md bg-[#0B0C0E] border border-[#22262E] space-y-3">
                <p className="text-xs text-[#8A919E] leading-relaxed">
                  Выбранный файл ({selectedItem.formatBadge}) является классическим 2D-снимком. Вы можете синтезировать для него карту глубины и открыть функции пост-фокусировки Lytro Illum 4D.
                </p>
                <button
                  type="button"
                  onClick={() => onConvertItemToLytro4D(selectedItem.id)}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-[#122B34] hover:bg-[#173742] border border-cyan-600/60 text-cyan-200 rounded-md text-xs font-medium transition-colors cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Реконструировать 4D стек глубины (.LFR)</span>
                </button>
              </div>
            )}
          </div>
        )}

        {inspectorSection === 'xmp' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#F1F3F5]">
                Сгенерированный Adobe XMP Sidecar
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleCopyXmp}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#1A1D24] hover:bg-[#242934] border border-[#2C3240] rounded text-xs text-[#F1F3F5] transition-colors cursor-pointer"
                >
                  {copiedXmp ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span>Скопировано</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Копировать</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadSingleXmp}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-[#0B0C0E] font-semibold rounded text-xs transition-colors cursor-pointer"
                >
                  <Download className="w-3 h-3" />
                  <span>.XMP</span>
                </button>
              </div>
            </div>

            <pre className="p-3 rounded-md bg-[#0B0C0E] border border-[#22262E] text-[11px] font-mono text-[#D5DAE2] overflow-x-auto leading-relaxed max-h-80">
              {selectedItem.xmpXml}
            </pre>
          </div>
        )}

        <hr className="border-[#22262E]" />

        {/* Ручная корректировка рейтинга и цветовой метки */}
        <div className="space-y-2">
          <span className="text-xs font-semibold text-[#F1F3F5]">
            Рейтинг и метка в .XMP Sidecar
          </span>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() =>
                    onUpdateManualRating(selectedItem.id, star, selectedItem.colorLabel)
                  }
                  className={`w-7 h-7 rounded text-xs font-mono font-semibold border transition-colors cursor-pointer ${
                    selectedItem.rating >= star
                      ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                      : 'bg-[#0B0C0E] border-[#22262E] text-[#8A919E] hover:text-[#F1F3F5]'
                  }`}
                >
                  {star}★
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1">
              {(
                [
                  { id: ColorLabel.Green, title: 'Pick (Green)' },
                  { id: ColorLabel.Blue, title: 'Lytro 4D Refocused (Blue)' },
                  { id: ColorLabel.Yellow, title: 'Review (Yellow)' },
                  { id: ColorLabel.Red, title: 'Reject (Red)' },
                ] as const
              ).map((lbl) => (
                <button
                  key={lbl.id}
                  type="button"
                  onClick={() =>
                    onUpdateManualRating(selectedItem.id, selectedItem.rating, lbl.id)
                  }
                  className={`px-2 py-1 rounded text-xs font-medium border transition-colors cursor-pointer ${
                    selectedItem.colorLabel === lbl.id
                      ? 'bg-[#222631] border-[#F1F3F5] text-[#F1F3F5]'
                      : 'bg-[#0B0C0E] border-[#22262E] text-[#8A919E] hover:text-[#F1F3F5]'
                  }`}
                >
                  {lbl.id}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};
