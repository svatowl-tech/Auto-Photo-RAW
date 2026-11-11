import React, { useEffect, useRef, useState } from 'react';
import {
  Crosshair,
  Layers,
  Focus,
  RotateCcw,
  Sparkles,
  Download,
} from 'lucide-react';
import { PhotoAnalysisItem } from '../types/culling.types';
import {
  loadImageElement,
  renderLytro4DStageCanvas,
  sampleSceneDepthLambda,
} from '../services/cvEngine.service';
import { downloadTextFile } from '../services/xmpGenerator.service';

interface LytroIllumStudioViewProps {
  items: PhotoAnalysisItem[];
  selectedItem: PhotoAnalysisItem;
  onSelectItem: (id: string) => void;
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
}

const APERTURE_PRESETS = [1.0, 1.4, 2.0, 2.8, 4.0, 5.6, 8.0, 11.0, 16.0];

export const LytroIllumStudioView: React.FC<LytroIllumStudioViewProps> = ({
  items,
  selectedItem,
  onSelectItem,
  onUpdateLytroParams,
  onConvertItemToLytro4D,
}) => {
  const [viewMode, setViewMode] = useState<'refocus' | 'depth_map' | 'focus_peaking'>('refocus');
  const [clickTargetCoords, setClickTargetCoords] = useState<{ x: number; y: number } | null>({
    x: 0.54,
    y: 0.29,
  });

  const stageCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lytroMeta = selectedItem.lytroMeta;

  useEffect(() => {
    if (!lytroMeta || !stageCanvasRef.current) return;
    let cancelled = false;

    loadImageElement(selectedItem.imageUrl)
      .then((img) => {
        if (cancelled || !stageCanvasRef.current) return;
        renderLytro4DStageCanvas(stageCanvasRef.current, img, lytroMeta, {
          viewMode,
          exposureEv: selectedItem.exposureEv,
        });
      })
      .catch((err) => {
        console.debug('Ошибка рендера 4D сцены Lytro:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedItem, lytroMeta, viewMode]);

  const handleCanvasClickRefocus = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!lytroMeta) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = Math.min(0.98, Math.max(0.02, (e.clientX - rect.left) / rect.width));
    const ny = Math.min(0.98, Math.max(0.02, (e.clientY - rect.top) / rect.height));
    setClickTargetCoords({ x: nx, y: ny });

    const sampledLambda = Number(sampleSceneDepthLambda(nx, ny, lytroMeta).toFixed(2));
    onUpdateLytroParams(selectedItem.id, {
      currentLambda: sampledLambda,
    });
  };

  return (
    <div className="flex-1 flex min-h-0 bg-[#0B0C0E] overflow-hidden">
      {/* Центральная оптическая сцена Lytro Illum 4D */}
      <div className="flex-1 flex flex-col min-h-0 p-5 overflow-y-auto">
        {/* Верхняя панель управления режимами Lytro Illum */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#22262E]">
          <div>
            <h1 className="font-display text-lg font-semibold text-[#F1F3F5] tracking-tight">
              Оптическая лаборатория Lytro Illum 4D Light Field (.LFR / .LFP)
            </h1>
            <p className="text-xs text-[#8A919E] mt-0.5">
              Кликните в любую точку кадра для перефокусировки субапертур 40 Megarays по слоям глубины λ
            </p>
          </div>

          <div className="flex items-center gap-1.5 bg-[#131519] p-1 rounded-md border border-[#22262E]">
            <button
              type="button"
              onClick={() => setViewMode('refocus')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                viewMode === 'refocus'
                  ? 'bg-cyan-500 text-[#0B0C0E] font-semibold'
                  : 'text-[#8A919E] hover:text-[#F1F3F5]'
              }`}
            >
              <Focus className="w-3.5 h-3.5" />
              <span>Живой рефокус 4D</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('depth_map')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                viewMode === 'depth_map'
                  ? 'bg-cyan-500 text-[#0B0C0E] font-semibold'
                  : 'text-[#8A919E] hover:text-[#F1F3F5]'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Карта глубины (Depth Map)</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('focus_peaking')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                viewMode === 'focus_peaking'
                  ? 'bg-cyan-500 text-[#0B0C0E] font-semibold'
                  : 'text-[#8A919E] hover:text-[#F1F3F5]'
              }`}
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span>Focus Peaking (Зона ГРИП)</span>
            </button>
          </div>
        </div>

        {/* Основной холст 4D светового поля или предложение реконструкции для 2D RAW */}
        {lytroMeta ? (
          <div className="flex-1 flex flex-col justify-between gap-4 pt-4 min-h-0">
            <div className="relative flex-1 min-h-[340px] bg-[#07080A] border border-[#22262E] rounded-lg overflow-hidden flex items-center justify-center">
              <canvas
                ref={stageCanvasRef}
                width={760}
                height={510}
                onClick={handleCanvasClickRefocus}
                className="max-h-full max-w-full object-contain cursor-crosshair"
              />

              {/* Маркеры калиброванных плоскостей фокусировки поверх кадра */}
              {lytroMeta.focusZones.map((zone) => {
                const isFocused = Math.abs(lytroMeta.currentLambda - zone.lambdaValue) < 1.1;
                return (
                  <button
                    key={zone.id}
                    type="button"
                    onClick={() => {
                      setClickTargetCoords({ x: zone.normX, y: zone.normY });
                      onUpdateLytroParams(selectedItem.id, {
                        currentLambda: zone.lambdaValue,
                      });
                    }}
                    style={{
                      left: `${zone.normX * 100}%`,
                      top: `${zone.normY * 100}%`,
                    }}
                    className={`-translate-x-1/2 -translate-y-1/2 absolute px-2.5 py-1 rounded border text-xs font-mono transition-transform duration-150 cursor-pointer ${
                      isFocused
                        ? 'bg-cyan-500/90 text-[#0B0C0E] border-white font-semibold scale-105'
                        : 'bg-[#0B0C0E]/85 text-cyan-200 border-cyan-500/60 hover:scale-105'
                    }`}
                  >
                    {zone.lambdaValue >= 0 ? `+${zone.lambdaValue.toFixed(1)}` : zone.lambdaValue.toFixed(1)} λ
                  </button>
                );
              })}

              {/* Оптический телеметрический оверлей Lytro Illum */}
              <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-3 px-3.5 py-2 bg-[#0B0C0E]/90 border border-[#22262E] rounded text-xs font-mono text-[#8A919E]">
                <div className="flex items-center gap-2">
                  <span className="text-[#F1F3F5] font-semibold">{lytroMeta.cameraModel}</span>
                  <span>·</span>
                  <span>{lytroMeta.sensorMegarays.toFixed(0)} MR</span>
                  <span>·</span>
                  <span>MLA {lytroMeta.mlaPitchUm.toFixed(0)}μm</span>
                  <span>·</span>
                  <span>Pitch {lytroMeta.pitchDeg}° / Roll {lytroMeta.rollDeg}°</span>
                </div>
                <div className="flex items-center gap-2 text-cyan-300">
                  <span>
                    Плоскость: λ = {lytroMeta.currentLambda >= 0 ? `+${lytroMeta.currentLambda.toFixed(2)}` : lytroMeta.currentLambda.toFixed(2)}
                  </span>
                  <span>·</span>
                  <span className="text-amber-300">
                    Диафрагма: f/{lytroMeta.syntheticApertureFstop.toFixed(1)}
                  </span>
                  <span>·</span>
                  <span>
                    Резкость: {selectedItem.sharpnessScore.toFixed(1)}
                  </span>
                </div>
              </div>
            </div>

            {/* Нижняя лента переключения кадров пакета */}
            <div className="flex items-center gap-2.5 overflow-x-auto py-1 shrink-0">
              {items.map((item) => {
                const isSelected = item.id === selectedItem.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectItem(item.id)}
                    className={`flex items-center gap-2.5 p-2 rounded-md border text-left transition-colors shrink-0 cursor-pointer ${
                      isSelected
                        ? 'bg-[#171B22] border-cyan-500'
                        : 'bg-[#131519] border-[#22262E] hover:border-[#363C49]'
                    }`}
                  >
                    <img
                      src={item.imageUrl}
                      alt={item.fileName}
                      referrerPolicy="no-referrer"
                      className="w-12 h-9 object-cover rounded-xs bg-[#0B0C0E]"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-[#F1F3F5] truncate max-w-[140px]">
                        {item.fileName}
                      </div>
                      <div className="text-[11px] font-mono text-[#8A919E]">
                        {item.lytroMeta ? `4D .LFR · λ=${item.lytroMeta.currentLambda.toFixed(1)}` : item.formatBadge}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
            <div className="max-w-md space-y-2">
              <h2 className="font-display text-base font-semibold text-[#F1F3F5]">
                Кадр {selectedItem.fileName} снят в классическом 2D-формате ({selectedItem.formatBadge})
              </h2>
              <p className="text-xs text-[#8A919E] leading-relaxed">
                Выберите в нижней ленте пленоптический кадр <strong>.LFR</strong> с камеры Lytro Illum или запустите синтетическую 4D-реконструкцию карты глубины для текущего снимка.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onConvertItemToLytro4D(selectedItem.id)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-[#0B0C0E] font-semibold text-xs rounded-md transition-colors cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>Реконструировать 4D световое поле для этого кадра</span>
            </button>
          </div>
        )}
      </div>

      {/* Правая инструментальная колонка управления оптикой Lytro Illum */}
      {lytroMeta && (
        <aside className="w-96 bg-[#131519] border-l border-[#22262E] p-4 overflow-y-auto space-y-5 shrink-0">
          {/* 1. Шкала Focus Spread и пост-фокусировка Lambda */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-[#F1F3F5]">
                01. Пост-фокусировка и Focus Spread
              </h2>
              <button
                type="button"
                onClick={() =>
                  onUpdateLytroParams(selectedItem.id, {
                    currentLambda: lytroMeta.optimalLambda,
                    syntheticApertureFstop: 2.0,
                    perspectiveU: 0,
                    perspectiveV: 0,
                  })
                }
                className="inline-flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-200 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>К пику λ={lytroMeta.optimalLambda.toFixed(1)}</span>
              </button>
            </div>

            {/* Гистограмма глубины Focus Spread */}
            <div className="p-3 rounded-md bg-[#0B0C0E] border border-[#22262E] space-y-2">
              <div className="flex justify-between text-[11px] font-mono text-[#8A919E]">
                <span>Ближний ({lytroMeta.focusSpreadMin.toFixed(1)} λ)</span>
                <span className="text-cyan-300">
                  Активный: {lytroMeta.currentLambda >= 0 ? `+${lytroMeta.currentLambda.toFixed(2)}` : lytroMeta.currentLambda.toFixed(2)} λ
                </span>
                <span>Бесконечность (+{lytroMeta.focusSpreadMax.toFixed(1)} λ)</span>
              </div>

              <div className="h-16 flex items-end gap-1 pt-2">
                {lytroMeta.depthHistogram.map((val, idx) => {
                  const binLambda = -8 + (idx / 15) * 20;
                  const isNearActive = Math.abs(binLambda - lytroMeta.currentLambda) < 1.8;
                  return (
                    <div
                      key={idx}
                      style={{ height: `${Math.max(10, val)}%` }}
                      className={`flex-1 rounded-t-xs transition-colors ${
                        isNearActive ? 'bg-cyan-400' : 'bg-[#2C3240]'
                      }`}
                    />
                  );
                })}
              </div>

              <input
                type="range"
                min={-10}
                max={15}
                step={0.1}
                value={lytroMeta.currentLambda}
                onChange={(e) =>
                  onUpdateLytroParams(selectedItem.id, {
                    currentLambda: Number(e.target.value),
                  })
                }
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </div>
          </section>

          <hr className="border-[#22262E]" />

          {/* 2. Кольцо виртуальной диафрагмы Synthetic Aperture (f/1.0 - f/16) */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-[#F1F3F5]">
                02. Виртуальная диафрагма (f/1.0 – f/16)
              </h2>
              <span className="text-xs font-mono text-amber-400">
                f/{lytroMeta.syntheticApertureFstop.toFixed(1)}
              </span>
            </div>

            <div className="grid grid-cols-5 gap-1.5">
              {APERTURE_PRESETS.map((fstop) => {
                const active = Math.abs(lytroMeta.syntheticApertureFstop - fstop) < 0.25;
                return (
                  <button
                    key={fstop}
                    type="button"
                    onClick={() =>
                      onUpdateLytroParams(selectedItem.id, {
                        syntheticApertureFstop: fstop,
                      })
                    }
                    className={`py-1.5 rounded text-xs font-mono border transition-colors cursor-pointer ${
                      active
                        ? 'bg-amber-500 text-[#0B0C0E] border-amber-400 font-semibold'
                        : 'bg-[#0B0C0E] border-[#22262E] text-[#8A919E] hover:text-[#F1F3F5]'
                    }`}
                  >
                    f/{fstop % 1 === 0 ? fstop.toFixed(0) : fstop.toFixed(1)}
                  </button>
                );
              })}
            </div>

            <input
              type="range"
              min={1.0}
              max={16.0}
              step={0.1}
              value={lytroMeta.syntheticApertureFstop}
              onChange={(e) =>
                onUpdateLytroParams(selectedItem.id, {
                  syntheticApertureFstop: Number(e.target.value),
                })
              }
              className="w-full accent-amber-500 cursor-pointer"
            />
          </section>

          <hr className="border-[#22262E]" />

          {/* 3. Сдвиг перспективы субапертур (Perspective Shift u, v) */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-[#F1F3F5]">
                03. Сдвиг ракурса субапертуры (u, v)
              </h2>
              <span className="text-xs font-mono text-[#8A919E]">
                u={lytroMeta.perspectiveU >= 0 ? `+${lytroMeta.perspectiveU.toFixed(2)}` : lytroMeta.perspectiveU.toFixed(2)} · v={lytroMeta.perspectiveV >= 0 ? `+${lytroMeta.perspectiveV.toFixed(2)}` : lytroMeta.perspectiveV.toFixed(2)}
              </span>
            </div>

            <div className="space-y-2">
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-[#8A919E]">
                  <span>Горизонтальный параллакс (U)</span>
                  <span className="font-mono text-[#F1F3F5]">{lytroMeta.perspectiveU.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={-1.0}
                  max={1.0}
                  step={0.05}
                  value={lytroMeta.perspectiveU}
                  onChange={(e) =>
                    onUpdateLytroParams(selectedItem.id, {
                      perspectiveU: Number(e.target.value),
                    })
                  }
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs text-[#8A919E]">
                  <span>Вертикальный параллакс (V)</span>
                  <span className="font-mono text-[#F1F3F5]">{lytroMeta.perspectiveV.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={-1.0}
                  max={1.0}
                  step={0.05}
                  value={lytroMeta.perspectiveV}
                  onChange={(e) =>
                    onUpdateLytroParams(selectedItem.id, {
                      perspectiveV: Number(e.target.value),
                    })
                  }
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>
            </div>
          </section>

          <hr className="border-[#22262E]" />

          {/* 4. Статус спасения 4D Refocus Salvage и экспорт XMP */}
          <section className="p-3 rounded-md bg-[#0B0C0E] border border-[#22262E] space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#8A919E]">Исходная резкость (λ = {lytroMeta.capturedLambda.toFixed(1)}):</span>
              <span className="font-mono text-[#8A919E]">{lytroMeta.baseSharpnessScore.toFixed(1)} / 100</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#F1F3F5] font-medium">Текущая резкость 4D:</span>
              <span className="font-mono text-emerald-400 font-semibold">
                {selectedItem.sharpnessScore.toFixed(1)} / 100
              </span>
            </div>
            {clickTargetCoords && (
              <div className="text-[11px] font-mono text-[#8A919E]">
                Точка замера: X={(clickTargetCoords.x * 100).toFixed(0)}% · Y={(clickTargetCoords.y * 100).toFixed(0)}%
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                const base = selectedItem.fileName.replace(/\.[^/.]+$/, '');
                downloadTextFile(`${base}_lytro4d.xmp`, selectedItem.xmpXml);
              }}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-amber-500 hover:bg-amber-400 text-[#0B0C0E] font-semibold text-xs rounded transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Сохранить .XMP с параметрами Lytro 4D</span>
            </button>
          </section>
        </aside>
      )}
    </div>
  );
};
