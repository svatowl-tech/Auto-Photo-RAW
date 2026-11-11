import React, { useRef } from 'react';
import { FolderOpen, Upload, RotateCcw, Download } from 'lucide-react';
import {
  BackendOption,
  CullingThresholds,
  HardwareBackend,
} from '../types/culling.types';

interface LeftControlRailProps {
  folderPath: string;
  onFolderPathChange: (val: string) => void;
  selectedBackend: HardwareBackend;
  onSelectBackend: (backend: HardwareBackend) => void;
  backends: BackendOption[];
  backendStatusMessage: string;
  fallbackOccurred: boolean;
  thresholds: CullingThresholds;
  onChangeThresholds: (next: CullingThresholds) => void;
  onResetThresholds: () => void;
  onUploadFiles: (files: FileList, treatAsLytroLfr: boolean) => void;
  onExportAllXmp: () => void;
  totalItemsCount: number;
}

export const LeftControlRail: React.FC<LeftControlRailProps> = ({
  folderPath,
  onFolderPathChange,
  selectedBackend,
  onSelectBackend,
  backends,
  backendStatusMessage,
  fallbackOccurred,
  thresholds,
  onChangeThresholds,
  onResetThresholds,
  onUploadFiles,
  onExportAllXmp,
  totalItemsCount,
}) => {
  const stdInputRef = useRef<HTMLInputElement | null>(null);
  const lytroInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <aside className="w-72 bg-[#131519] border-r border-[#22262E] flex flex-col min-h-0 shrink-0 select-none">
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Каталог съемки и импорт реальных файлов */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-[#F1F3F5] tracking-tight">
              01. Источник и пакет съемки
            </h2>
            <span className="text-xs font-mono tabular-nums text-[#8A919E]">
              {totalItemsCount} кадр.
            </span>
          </div>

          <div className="relative">
            <input
              type="text"
              value={folderPath}
              onChange={(e) => onFolderPathChange(e.target.value)}
              aria-label="Путь к каталогу фотосессии"
              className="w-full bg-[#0B0C0E] border border-[#22262E] focus:border-amber-500 rounded-md pl-3 pr-8 py-1.5 text-xs font-mono text-[#F1F3F5] outline-none transition-colors"
            />
            <FolderOpen className="w-3.5 h-3.5 text-[#8A919E] absolute right-2.5 top-2.5 pointer-events-none" />
          </div>

          <div className="grid grid-cols-1 gap-1.5 pt-0.5">
            <input
              ref={stdInputRef}
              type="file"
              multiple
              accept="image/*,.cr2,.cr3,.nef,.arw,.dng,.lfr,.lfp"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  onUploadFiles(e.target.files, false);
                  e.target.value = '';
                }
              }}
            />
            <button
              type="button"
              onClick={() => stdInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-[#1A1D24] hover:bg-[#22262F] border border-[#2A2F3A] rounded-md text-xs font-medium text-[#F1F3F5] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Загрузить фото (RAW / JPEG)</span>
            </button>

            <input
              ref={lytroInputRef}
              type="file"
              multiple
              accept="image/*,.lfr,.lfp"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  onUploadFiles(e.target.files, true);
                  e.target.value = '';
                }
              }}
            />
            <button
              type="button"
              onClick={() => lytroInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-[#0E2229] hover:bg-[#132D36] border border-cyan-800/60 rounded-md text-xs font-medium text-cyan-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span>Импорт как Lytro Illum (.LFR)</span>
            </button>
          </div>
        </section>

        <hr className="border-[#22262E]" />

        {/* Аппаратный ускоритель ONNX Runtime (ort) */}
        <section className="space-y-2.5">
          <h2 className="text-xs font-semibold text-[#F1F3F5] tracking-tight">
            02. Ускоритель ONNX Runtime
          </h2>

          <select
            value={selectedBackend}
            onChange={(e) => onSelectBackend(e.target.value as HardwareBackend)}
            aria-label="Выбор Execution Provider"
            className="w-full bg-[#0B0C0E] border border-[#22262E] focus:border-amber-500 rounded-md px-2.5 py-2 text-xs text-[#F1F3F5] outline-none transition-colors cursor-pointer"
          >
            {backends.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>

          <p className="text-xs text-[#8A919E] leading-relaxed">
            {backends.find((b) => b.id === selectedBackend)?.platformHint}
          </p>

          <div
            className={`p-2.5 rounded-md border text-xs leading-snug ${
              fallbackOccurred
                ? 'bg-amber-950/30 border-amber-700/50 text-amber-200'
                : 'bg-[#0B0C0E] border-[#22262E] text-[#8A919E]'
            }`}
          >
            <div className="font-medium text-[#F1F3F5] mb-0.5">
              {fallbackOccurred ? 'Сработал авто-откат на CPU' : 'Статус сессии ort'}
            </div>
            <div>{backendStatusMessage}</div>
          </div>
        </section>

        <hr className="border-[#22262E]" />

        {/* Живые пороги отбора и авто-коррекции XMP */}
        <section className="space-y-3.5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-[#F1F3F5] tracking-tight">
              03. Пороги отбора и XMP
            </h2>
            <button
              type="button"
              onClick={onResetThresholds}
              title="Сбросить пороги по умолчанию"
              className="inline-flex items-center gap-1 text-xs text-[#8A919E] hover:text-[#F1F3F5] transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Сброс</span>
            </button>
          </div>

          {/* Порог Pick (Green) по Лапласу */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-[#8A919E]">Мин. резкость Pick (Green)</span>
              <span className="font-mono tabular-nums text-[#F1F3F5]">
                {thresholds.minSharpnessPick.toFixed(0)} / 100
              </span>
            </div>
            <input
              type="range"
              min={25}
              max={90}
              step={1}
              value={thresholds.minSharpnessPick}
              onChange={(e) => {
                const val = Number(e.target.value);
                onChangeThresholds({
                  ...thresholds,
                  minSharpnessPick: val,
                  minSharpnessReview: Math.min(thresholds.minSharpnessReview, val - 5),
                });
              }}
              className="w-full accent-amber-500 cursor-pointer"
            />
          </div>

          {/* Порог Review (Yellow) */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-[#8A919E]">Порог брака Reject (Red)</span>
              <span className="font-mono tabular-nums text-[#F1F3F5]">
                &lt; {thresholds.minSharpnessReview.toFixed(0)}
              </span>
            </div>
            <input
              type="range"
              min={10}
              max={75}
              step={1}
              value={thresholds.minSharpnessReview}
              onChange={(e) => {
                const val = Number(e.target.value);
                onChangeThresholds({
                  ...thresholds,
                  minSharpnessReview: Math.min(val, thresholds.minSharpnessPick - 4),
                });
              }}
              className="w-full accent-amber-500 cursor-pointer"
            />
          </div>

          {/* Мин. эстетический балл ONNX для 5★ */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-[#8A919E]">Эстетика ONNX для 5★</span>
              <span className="font-mono tabular-nums text-[#F1F3F5]">
                {thresholds.minAestheticPick.toFixed(1)} / 10
              </span>
            </div>
            <input
              type="range"
              min={5.0}
              max={9.5}
              step={0.1}
              value={thresholds.minAestheticPick}
              onChange={(e) =>
                onChangeThresholds({
                  ...thresholds,
                  minAestheticPick: Number(e.target.value),
                })
              }
              className="w-full accent-amber-500 cursor-pointer"
            />
          </div>

          {/* Лимит авто-сдвига экспозиции Exposure2012 */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-[#8A919E]">Лимит сдвига Exposure2012</span>
              <span className="font-mono tabular-nums text-[#F1F3F5]">
                ±{thresholds.maxExposureShiftEv.toFixed(2)} EV
              </span>
            </div>
            <input
              type="range"
              min={0.25}
              max={3.0}
              step={0.05}
              value={thresholds.maxExposureShiftEv}
              onChange={(e) =>
                onChangeThresholds({
                  ...thresholds,
                  maxExposureShiftEv: Number(e.target.value),
                })
              }
              className="w-full accent-amber-500 cursor-pointer"
            />
          </div>

          {/* Переключатель 4D-спасения кадров Lytro Illum */}
          <label className="flex items-start gap-2.5 pt-1 cursor-pointer">
            <input
              type="checkbox"
              checked={thresholds.enableLytro4DSalvage}
              onChange={(e) =>
                onChangeThresholds({
                  ...thresholds,
                  enableLytro4DSalvage: e.target.checked,
                })
              }
              className="mt-0.5 accent-cyan-400 rounded cursor-pointer"
            />
            <span className="text-xs text-[#F1F3F5] leading-snug">
              Авто-спасение кадров <strong>Lytro Illum (.LFR)</strong> поиском пика резкости по глубине λ
            </span>
          </label>
        </section>
      </div>

      {/* Нижняя панель пакетного экспорта XMP */}
      <div className="p-4 border-t border-[#22262E] bg-[#0F1115]">
        <button
          type="button"
          onClick={onExportAllXmp}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-[#1A1D24] hover:bg-[#252934] border border-[#2C313E] rounded-md text-xs font-medium text-[#F1F3F5] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>Скачать пакетный манифест .XMP</span>
        </button>
      </div>
    </aside>
  );
};
