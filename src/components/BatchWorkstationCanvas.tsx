import React, { useState } from 'react';
import {
  LayoutGrid,
  Table as TableIcon,
  ArrowUpDown,
  Download,
  RotateCcw,
} from 'lucide-react';
import {
  BatchFilterMode,
  ColorLabel,
  PhotoAnalysisItem,
} from '../types/culling.types';
import { downloadTextFile } from '../services/xmpGenerator.service';

interface BatchWorkstationCanvasProps {
  items: PhotoAnalysisItem[];
  selectedItemId: string;
  onSelectItem: (id: string) => void;
  filterMode: BatchFilterMode;
  onFilterModeChange: (mode: BatchFilterMode) => void;
  isProcessing: boolean;
  progressPercent: number;
  progressStatusText: string;
  onOpenLytroStudioForItem: (id: string) => void;
}

export const BatchWorkstationCanvas: React.FC<BatchWorkstationCanvasProps> = ({
  items,
  selectedItemId,
  onSelectItem,
  filterMode,
  onFilterModeChange,
  isProcessing,
  progressPercent,
  progressStatusText,
  onOpenLytroStudioForItem,
}) => {
  const [layoutMode, setLayoutMode] = useState<'table' | 'grid'>('table');
  const [sortBy, setSortBy] = useState<'sharpness' | 'aesthetic' | 'exposure' | 'name'>('sharpness');
  const [sortDesc, setSortDesc] = useState<boolean>(true);

  const filteredItems = items.filter((item) => {
    if (filterMode === BatchFilterMode.Pick) {
      return item.colorLabel === ColorLabel.Green || item.colorLabel === ColorLabel.Blue;
    }
    if (filterMode === BatchFilterMode.Review) {
      return item.colorLabel === ColorLabel.Yellow;
    }
    if (filterMode === BatchFilterMode.Reject) {
      return item.colorLabel === ColorLabel.Red;
    }
    if (filterMode === BatchFilterMode.LytroOnly) {
      return Boolean(item.lytroMeta?.isLytroRaw);
    }
    return true;
  });

  const sortedItems = [...filteredItems].sort((a, b) => {
    let cmp = 0;
    if (sortBy === 'sharpness') cmp = a.sharpnessScore - b.sharpnessScore;
    else if (sortBy === 'aesthetic') cmp = a.aestheticScore - b.aestheticScore;
    else if (sortBy === 'exposure') cmp = Math.abs(a.exposureEv) - Math.abs(b.exposureEv);
    else cmp = a.fileName.localeCompare(b.fileName);
    return sortDesc ? -cmp : cmp;
  });

  const pickCount = items.filter(
    (i) => i.colorLabel === ColorLabel.Green || i.colorLabel === ColorLabel.Blue
  ).length;
  const reviewCount = items.filter((i) => i.colorLabel === ColorLabel.Yellow).length;
  const rejectCount = items.filter((i) => i.colorLabel === ColorLabel.Red).length;
  const lytroSalvagedCount = items.filter((i) => i.lytroMeta?.salvagedByRefocus).length;

  const toggleSort = (field: 'sharpness' | 'aesthetic' | 'exposure' | 'name') => {
    if (sortBy === field) {
      setSortDesc((prev) => !prev);
    } else {
      setSortBy(field);
      setSortDesc(true);
    }
  };

  return (
    <main className="flex-1 flex flex-col min-h-0 bg-[#0B0C0E] overflow-hidden">
      {/* Полоса прогресса пайплайна (cull-progress) и сводные показатели пакета */}
      <section className="px-5 py-3 bg-[#111318] border-b border-[#22262E] space-y-2 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex flex-wrap items-center gap-2 text-[#8A919E]">
            <span className="font-mono text-amber-400 font-semibold">
              v0.1.0-alpha.1 (Early-Stage Alpha)
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-medium text-[#F1F3F5]">{progressStatusText}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              Отобрано Pick: <strong className="text-emerald-400">{pickCount}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              Lytro 4D Спасено: <strong className="text-cyan-300">{lytroSalvagedCount}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              Проверка: <strong className="text-amber-400">{reviewCount}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              Брак: <strong className="text-rose-400">{rejectCount}</strong>
            </span>
          </div>

          <span className="font-mono tabular-nums text-xs text-amber-400 font-semibold">
            {Math.round(progressPercent)}%
          </span>
        </div>

        <div className="w-full h-1.5 bg-[#1B1F27] rounded-full overflow-hidden">
          <div
            style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
            className={`h-full transition-all duration-150 ${
              isProcessing ? 'bg-amber-400' : 'bg-emerald-500'
            }`}
          />
        </div>
      </section>

      {/* Инструментальная панель фильтрации и переключения вида (Таблица / Сетка) */}
      <section className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 bg-[#131519] border-b border-[#22262E] shrink-0">
        {/* Функциональные кнопки фильтрации */}
        <div className="flex items-center gap-1 p-1 bg-[#0B0C0E] rounded-md border border-[#22262E]">
          {(
            [
              { id: BatchFilterMode.All, label: `Все (${items.length})` },
              { id: BatchFilterMode.Pick, label: `Pick (${pickCount})` },
              { id: BatchFilterMode.LytroOnly, label: `Lytro .LFR (${items.filter((i) => i.lytroMeta).length})` },
              { id: BatchFilterMode.Review, label: `Review (${reviewCount})` },
              { id: BatchFilterMode.Reject, label: `Reject (${rejectCount})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onFilterModeChange(tab.id)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                filterMode === tab.id
                  ? 'bg-[#1F242F] text-[#F1F3F5]'
                  : 'text-[#8A919E] hover:text-[#F1F3F5]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Сортировка и переключение Таблица / Сетка */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-[#0B0C0E] p-1 rounded-md border border-[#22262E]">
            <button
              type="button"
              onClick={() => setLayoutMode('table')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                layoutMode === 'table'
                  ? 'bg-[#1F242F] text-[#F1F3F5]'
                  : 'text-[#8A919E] hover:text-[#F1F3F5]'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span>Таблица</span>
            </button>

            <button
              type="button"
              onClick={() => setLayoutMode('grid')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                layoutMode === 'grid'
                  ? 'bg-[#1F242F] text-[#F1F3F5]'
                  : 'text-[#8A919E] hover:text-[#F1F3F5]'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Сетка</span>
            </button>
          </div>
        </div>
      </section>

      {/* Рабочая область данных (скроллится только этот контейнер) */}
      <div className="flex-1 overflow-y-auto p-5">
        {sortedItems.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center space-y-3 border border-dashed border-[#22262E] rounded-lg p-6">
            <p className="text-xs text-[#8A919E]">
              Нет кадров, соответствующих выбранному фильтру ({filterMode}).
            </p>
            <button
              type="button"
              onClick={() => onFilterModeChange(BatchFilterMode.All)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#1A1D24] hover:bg-[#242934] border border-[#2C3240] rounded text-xs font-medium text-[#F1F3F5] transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Очистить фильтр и показать все кадры</span>
            </button>
          </div>
        ) : layoutMode === 'table' ? (
          <div className="border border-[#22262E] rounded-lg overflow-hidden bg-[#111318]">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#22262E] bg-[#151820] text-[#8A919E]">
                  <th className="py-2.5 px-3 font-medium">Превью и файл</th>
                  <th className="py-2.5 px-3 font-medium">Формат</th>
                  <th className="py-2.5 px-3 font-medium text-right">
                    <button
                      type="button"
                      onClick={() => toggleSort('sharpness')}
                      className="inline-flex items-center gap-1 hover:text-[#F1F3F5] cursor-pointer"
                    >
                      <span>Резкость (Laplacian)</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-2.5 px-3 font-medium text-right">
                    <button
                      type="button"
                      onClick={() => toggleSort('aesthetic')}
                      className="inline-flex items-center gap-1 hover:text-[#F1F3F5] cursor-pointer"
                    >
                      <span>Эстетика (ONNX)</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-2.5 px-3 font-medium text-right">
                    <button
                      type="button"
                      onClick={() => toggleSort('exposure')}
                      className="inline-flex items-center gap-1 hover:text-[#F1F3F5] cursor-pointer"
                    >
                      <span>Exposure2012</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-2.5 px-3 font-medium">Lytro Illum 4D</th>
                  <th className="py-2.5 px-3 font-medium">Рейтинг · Метка</th>
                  <th className="py-2.5 px-3 font-medium text-right">Sidecar .XMP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1D2028] font-mono tabular-nums">
                {sortedItems.map((item) => {
                  const isSelected = item.id === selectedItemId;
                  const evText =
                    item.exposureEv >= 0
                      ? `+${item.exposureEv.toFixed(2)} EV`
                      : `${item.exposureEv.toFixed(2)} EV`;

                  const labelColorClass =
                    item.colorLabel === ColorLabel.Green
                      ? 'text-emerald-400'
                      : item.colorLabel === ColorLabel.Blue
                      ? 'text-cyan-300'
                      : item.colorLabel === ColorLabel.Yellow
                      ? 'text-amber-400'
                      : 'text-rose-400';

                  return (
                    <tr
                      key={item.id}
                      onClick={() => onSelectItem(item.id)}
                      className={`transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-[#1D222D]'
                          : 'hover:bg-[#161922]'
                      }`}
                    >
                      <td className="py-2 px-3 font-sans">
                        <div className="flex items-center gap-3">
                          <img
                            src={item.imageUrl}
                            alt={item.fileName}
                            referrerPolicy="no-referrer"
                            className="w-12 h-9 object-cover rounded-xs bg-[#0B0C0E] shrink-0 border border-[#262B36]"
                          />
                          <div className="min-w-0">
                            <div className="font-medium text-[#F1F3F5] truncate max-w-[210px]">
                              {item.fileName}
                            </div>
                            <div className="text-[11px] text-[#8A919E] truncate max-w-[210px]">
                              {item.width}×{item.height} · {item.processingMs} мс
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-2 px-3 text-[#8A919E]">
                        {item.formatBadge}
                      </td>

                      <td className="py-2 px-3 text-right">
                        <span className="font-semibold text-[#F1F3F5]">
                          {item.sharpnessScore.toFixed(1)}
                        </span>
                        <span className="text-[#8A919E] ml-1.5 text-[11px]">
                          (σ²={item.laplacianVariance.toFixed(0)})
                        </span>
                      </td>

                      <td className="py-2 px-3 text-right text-[#F1F3F5]">
                        {item.aestheticScore.toFixed(2)} / 10
                      </td>

                      <td className="py-2 px-3 text-right">
                        <span className="text-amber-400">{evText}</span>
                        <span className="text-[#8A919E] ml-1.5 text-[11px]">
                          · {item.wbTemperature}K
                        </span>
                      </td>

                      <td className="py-2 px-3 font-sans">
                        {item.lytroMeta ? (
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-cyan-300">
                              λ={item.lytroMeta.currentLambda >= 0 ? `+${item.lytroMeta.currentLambda.toFixed(1)}` : item.lytroMeta.currentLambda.toFixed(1)} · f/{item.lytroMeta.syntheticApertureFstop.toFixed(1)}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenLytroStudioForItem(item.id);
                              }}
                              className="px-2 py-0.5 bg-[#122B34] hover:bg-[#183844] border border-cyan-700/60 text-cyan-200 rounded text-[11px] transition-colors cursor-pointer"
                            >
                              4D Фокус
                            </button>
                          </div>
                        ) : (
                          <span className="text-[#8A919E]">2D Сенсор</span>
                        )}
                      </td>

                      <td className="py-2 px-3">
                        <span className="text-amber-400">{'★'.repeat(item.rating)}</span>
                        <span className="text-[#8A919E]"> · </span>
                        <span className={`font-sans font-medium ${labelColorClass}`}>
                          {item.colorLabel === ColorLabel.Blue
                            ? 'Blue (4D Refocus)'
                            : item.colorLabel}
                        </span>
                      </td>

                      <td className="py-2 px-3 text-right font-sans">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const base = item.fileName.replace(/\.[^/.]+$/, '');
                            downloadTextFile(`${base}.xmp`, item.xmpXml);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#1A1D24] hover:bg-[#252A35] border border-[#2C313E] rounded text-xs text-[#F1F3F5] transition-colors cursor-pointer"
                        >
                          <Download className="w-3 h-3 text-amber-400" />
                          <span>.XMP</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* Визуальная сетка превью (Grid View) с чистыми необрамленными метаданными */
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {sortedItems.map((item) => {
              const isSelected = item.id === selectedItemId;
              const evText =
                item.exposureEv >= 0
                  ? `+${item.exposureEv.toFixed(2)} EV`
                  : `${item.exposureEv.toFixed(2)} EV`;

              return (
                <article
                  key={item.id}
                  onClick={() => onSelectItem(item.id)}
                  className={`flex flex-col rounded-lg border overflow-hidden transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#181C24] border-amber-500'
                      : 'bg-[#131519] border-[#22262E] hover:border-[#363C49]'
                  }`}
                >
                  <div className="relative h-48 bg-[#07080A] overflow-hidden">
                    <img
                      src={item.imageUrl}
                      alt={item.fileName}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-x-0 bottom-0 p-2.5 bg-gradient-to-t from-black/85 via-black/45 to-transparent flex items-center justify-between text-xs font-mono">
                      <span className="text-amber-400">{'★'.repeat(item.rating)}</span>
                      <span className="text-[#F1F3F5]">
                        Резкость {item.sharpnessScore.toFixed(1)} · {evText}
                      </span>
                    </div>
                  </div>

                  <div className="p-3.5 space-y-1.5">
                    <h3 className="text-xs font-semibold text-[#F1F3F5] truncate">
                      {item.fileName}
                    </h3>

                    {/* Чистые необрамленные метаданные с типографскими разделителями */}
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#8A919E] font-mono tabular-nums">
                      <span>{item.formatBadge}</span>
                      <span aria-hidden="true">·</span>
                      <span>Эстетика {item.aestheticScore.toFixed(2)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{item.colorLabel}</span>
                      {item.lytroMeta && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-cyan-300">
                            λ={item.lytroMeta.currentLambda.toFixed(1)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
};
