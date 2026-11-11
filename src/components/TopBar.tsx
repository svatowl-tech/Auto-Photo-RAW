import React from 'react';
import { Play, Loader2 } from 'lucide-react';
import { WorkspaceTab } from '../types/culling.types';

interface TopBarProps {
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  onRunBatch: () => void;
  isProcessing: boolean;
}

/**
 * Верхняя панель навигации строго по контракту 3 зон (Top Bar Contract):
 * Зона 1: Однострочный текстовый логотип (Outfit)
 * Зона 2: 4 однострочных пункта навигации
 * Зона 3: 1 основное действие (Запустить пакетный анализ)
 */
export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  onSelectTab,
  onRunBatch,
  isProcessing,
}) => {
  const navItems: { id: WorkspaceTab; label: string }[] = [
    { id: WorkspaceTab.Workstation, label: 'Рабочая станция' },
    { id: WorkspaceTab.Lytro4D, label: 'Lytro Illum 4D' },
    { id: WorkspaceTab.Compare, label: 'Сравнение дублей' },
    { id: WorkspaceTab.RustSource, label: 'Код Rust и сборка' },
    { id: WorkspaceTab.SystemLogs, label: 'Журнал логов' },
  ];

  return (
    <header className="flex items-center justify-between gap-8 px-6 py-3 bg-[#131519] border-b border-[#22262E] shrink-0">
      {/* Zone 1: Single text element wordmark */}
      <a
        href="#workstation"
        onClick={(e) => {
          e.preventDefault();
          onSelectTab(WorkspaceTab.Workstation);
        }}
        className="font-display text-lg font-semibold tracking-tight text-[#F1F3F5] whitespace-nowrap shrink-0"
      >
        OptiCull RAW
      </a>

      {/* Zone 2: 4 clean single-line text navigation links */}
      <nav className="flex items-center gap-6 text-sm font-medium">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <a
              key={item.id}
              href={`#${item.id}`}
              onClick={(e) => {
                e.preventDefault();
                onSelectTab(item.id);
              }}
              className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors duration-150 ${
                isActive
                  ? 'border-amber-500 text-[#F1F3F5]'
                  : 'border-transparent text-[#8A919E] hover:text-[#F1F3F5]'
              }`}
            >
              {item.label}
            </a>
          );
        })}
      </nav>

      {/* Zone 3: 1 primary action */}
      <div className="flex items-center shrink-0">
        <button
          type="button"
          onClick={onRunBatch}
          disabled={isProcessing}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-[#0B0C0E] bg-amber-500 hover:bg-amber-400 disabled:opacity-50 rounded-md transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Выполняется прогон...</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Запустить пакетный анализ</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
};
