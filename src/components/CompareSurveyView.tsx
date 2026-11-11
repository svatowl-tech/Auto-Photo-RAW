import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, XCircle, Eye } from 'lucide-react';
import { ColorLabel, PhotoAnalysisItem } from '../types/culling.types';
import {
  loadImageElement,
  renderLoupeOrLaplacianCanvas,
} from '../services/cvEngine.service';

interface CompareSurveyViewProps {
  items: PhotoAnalysisItem[];
  leftItemId: string;
  rightItemId: string;
  onSelectLeft: (id: string) => void;
  onSelectRight: (id: string) => void;
  onAssignVerdict: (winnerId: string, loserId: string) => void;
}

export const CompareSurveyView: React.FC<CompareSurveyViewProps> = ({
  items,
  leftItemId,
  rightItemId,
  onSelectLeft,
  onSelectRight,
  onAssignVerdict,
}) => {
  const [syncZoom, setSyncZoom] = useState<number>(2.0);
  const [syncCenter, setSyncCenter] = useState<{ x: number; y: number }>({ x: 0.5, y: 0.4 });
  const [showLaplacianOverlay, setShowLaplacianOverlay] = useState<boolean>(false);

  const leftCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rightCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const leftItem = items.find((i) => i.id === leftItemId) || items[0];
  const rightItem = items.find((i) => i.id === rightItemId) || items[Math.min(1, items.length - 1)];

  useEffect(() => {
    if (!leftItem || !leftCanvasRef.current) return;
    let cancelled = false;
    loadImageElement(leftItem.imageUrl)
      .then((img) => {
        if (cancelled || !leftCanvasRef.current) return;
        renderLoupeOrLaplacianCanvas(leftCanvasRef.current, img, {
          normCenterX: syncCenter.x,
          normCenterY: syncCenter.y,
          zoomFactor: syncZoom,
          showLaplacianMap: showLaplacianOverlay,
          previewExposureEv: leftItem.exposureEv,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [leftItem, syncCenter, syncZoom, showLaplacianOverlay]);

  useEffect(() => {
    if (!rightItem || !rightCanvasRef.current) return;
    let cancelled = false;
    loadImageElement(rightItem.imageUrl)
      .then((img) => {
        if (cancelled || !rightCanvasRef.current) return;
        renderLoupeOrLaplacianCanvas(rightCanvasRef.current, img, {
          normCenterX: syncCenter.x,
          normCenterY: syncCenter.y,
          zoomFactor: syncZoom,
          showLaplacianMap: showLaplacianOverlay,
          previewExposureEv: rightItem.exposureEv,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [rightItem, syncCenter, syncZoom, showLaplacianOverlay]);

  const handleCanvasSyncClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = Math.min(0.95, Math.max(0.05, (e.clientX - rect.left) / rect.width));
    const ny = Math.min(0.95, Math.max(0.05, (e.clientY - rect.top) / rect.height));
    setSyncCenter({ x: nx, y: ny });
  };

  if (!leftItem || !rightItem) return null;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0B0C0E] p-5 overflow-y-auto space-y-4">
      {/* Панель управления синхронным сравнением */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-[#22262E]">
        <div>
          <h1 className="font-display text-lg font-semibold text-[#F1F3F5] tracking-tight">
            Сравнение дублей бок о бок (Survey &amp; Synchronized Loupe)
          </h1>
          <p className="text-xs text-[#8A919E]">
            Кликните по любому из двух кадров для синхронного наведения лупы резкости в одну и ту же область
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-[#131519] p-1 rounded border border-[#22262E]">
            {[1.0, 2.0, 3.5].map((z) => (
              <button
                key={z}
                type="button"
                onClick={() => setSyncZoom(z)}
                className={`px-2.5 py-1 text-xs font-mono rounded transition-colors cursor-pointer ${
                  Math.abs(syncZoom - z) < 0.1
                    ? 'bg-amber-500 text-[#0B0C0E] font-semibold'
                    : 'text-[#8A919E] hover:text-[#F1F3F5]'
                }`}
              >
                {Math.round(z * 100)}%
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowLaplacianOverlay((p) => !p)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs font-medium transition-colors cursor-pointer ${
              showLaplacianOverlay
                ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                : 'bg-[#131519] border-[#22262E] text-[#8A919E] hover:text-[#F1F3F5]'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>{showLaplacianOverlay ? 'Свертка Лапласа: ВКЛ' : 'Показать грани Лапласа'}</span>
          </button>
        </div>
      </div>

      {/* Сплит-экран сравнения двух кадров */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 flex-1 min-h-0">
        {[
          {
            slot: 'Кандидат A (Слева)',
            item: leftItem,
            otherItem: rightItem,
            canvasRef: leftCanvasRef,
            onSelect: onSelectLeft,
          },
          {
            slot: 'Кандидат B (Справа)',
            item: rightItem,
            otherItem: leftItem,
            canvasRef: rightCanvasRef,
            onSelect: onSelectRight,
          },
        ].map(({ slot, item, otherItem, canvasRef, onSelect }) => {
          const isSharper = item.sharpnessScore >= otherItem.sharpnessScore;
          return (
            <div
              key={slot}
              className="flex flex-col bg-[#131519] border border-[#22262E] rounded-lg overflow-hidden"
            >
              <div className="flex items-center justify-between gap-3 p-3 border-b border-[#22262E] bg-[#0F1115]">
                <span className="text-xs font-semibold text-[#8A919E]">{slot}</span>
                <select
                  value={item.id}
                  onChange={(e) => onSelect(e.target.value)}
                  className="bg-[#131519] border border-[#22262E] rounded px-2.5 py-1 text-xs text-[#F1F3F5] outline-none cursor-pointer"
                >
                  {items.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.fileName} ({opt.sharpnessScore.toFixed(1)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="relative flex-1 min-h-[280px] bg-[#07080A] flex items-center justify-center">
                <canvas
                  ref={canvasRef}
                  width={560}
                  height={380}
                  onClick={handleCanvasSyncClick}
                  className="w-full h-full max-h-[380px] object-cover cursor-crosshair"
                />
              </div>

              {/* Сравнение технических метрик */}
              <div className="p-3.5 border-t border-[#22262E] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums">
                  <div>
                    <span className="text-[#8A919E]">Резкость: </span>
                    <strong className={isSharper ? 'text-emerald-400' : 'text-[#F1F3F5]'}>
                      {item.sharpnessScore.toFixed(1)}
                    </strong>
                    <span className="text-[#8A919E]"> (σ²={item.laplacianVariance.toFixed(0)})</span>
                  </div>
                  <div>
                    <span className="text-[#8A919E]">Эстетика: </span>
                    <strong className="text-[#F1F3F5]">{item.aestheticScore.toFixed(2)}</strong>
                  </div>
                  <div>
                    <span className="text-[#8A919E]">Exposure2012: </span>
                    <strong className="text-amber-400">
                      {item.exposureEv >= 0 ? `+${item.exposureEv.toFixed(2)}` : item.exposureEv.toFixed(2)} EV
                    </strong>
                  </div>
                  <div>
                    <span className="text-[#8A919E]">Статус: </span>
                    <strong className="text-[#F1F3F5]">
                      {item.rating}★ · {item.colorLabel}
                    </strong>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onAssignVerdict(item.id, otherItem.id)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/60 text-emerald-200 rounded text-xs font-medium transition-colors cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Выбрать этот дубль (5★ Green, второй в Reject)</span>
                  </button>

                  {item.colorLabel === ColorLabel.Red && (
                    <span className="inline-flex items-center gap-1 text-xs text-rose-400 px-2">
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Отклонен</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
