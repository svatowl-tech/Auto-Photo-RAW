import React, { useEffect, useState, useMemo } from 'react';
import {
  Download,
  Trash2,
  Search,
  Filter,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Info,
  Terminal,
  RefreshCw,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import { LogCategory, LogEntry, LogLevel, logger } from '../services/logger.service';
import { downloadTextFile } from '../services/xmpGenerator.service';

const ALL_LEVELS: LogLevel[] = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
const ALL_CATEGORIES: LogCategory[] = [
  'CORE',
  'PIPELINE',
  'CV_ENGINE',
  'ONNX_ORT',
  'LYTRO_4D',
  'XMP_SIDECAR',
  'IO_FS',
  'TAURI_IPC',
];

export const SystemLogsStudioView: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selectedLevel, setSelectedLevel] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState<boolean>(false);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);

  useEffect(() => {
    const unsubscribe = logger.subscribe((newLogs) => {
      setLogs(newLogs);
    });
    return () => unsubscribe();
  }, []);

  const counts = useMemo(() => {
    const errorCount = logs.filter((l) => l.level === 'ERROR').length;
    const warnCount = logs.filter((l) => l.level === 'WARN').length;
    const infoCount = logs.filter((l) => l.level === 'INFO').length;
    const debugCount = logs.filter((l) => l.level === 'DEBUG').length;
    return { errorCount, warnCount, infoCount, debugCount, total: logs.length };
  }, [logs]);

  const filteredLogs = useMemo(() => {
    return logs.filter((entry) => {
      if (selectedLevel !== 'ALL' && entry.level !== selectedLevel) {
        return false;
      }
      if (selectedCategory !== 'ALL' && entry.category !== selectedCategory) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const inMsg = entry.message.toLowerCase().includes(q);
        const inCat = entry.category.toLowerCase().includes(q);
        const inContext = entry.fileContext?.toLowerCase().includes(q) ?? false;
        const inDetails =
          entry.details && typeof entry.details === 'object'
            ? JSON.stringify(entry.details).toLowerCase().includes(q)
            : false;
        if (!inMsg && !inCat && !inContext && !inDetails) {
          return false;
        }
      }
      return true;
    });
  }, [logs, selectedLevel, selectedCategory, searchQuery]);

  const handleExportText = () => {
    const text = logger.exportLogsAsText();
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    downloadTextFile(`opticull_system_diagnostics_${ts}.log`, text, 'text/plain');
  };

  const handleCopySingle = (id: string, entry: LogEntry) => {
    const line = `[${entry.timestamp}] [${entry.level}] [${entry.category}] ${entry.message} ${
      entry.details ? JSON.stringify(entry.details) : ''
    } ${entry.errorStack || ''}`;
    navigator.clipboard.writeText(line);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleCopyAll = () => {
    const text = logger.exportLogsAsText();
    navigator.clipboard.writeText(text);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const getLevelBadge = (level: LogLevel) => {
    switch (level) {
      case 'ERROR':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono font-semibold bg-rose-950/80 text-rose-300 border border-rose-800">
            <XCircle className="w-3 h-3 text-rose-400" />
            ERROR
          </span>
        );
      case 'WARN':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono font-semibold bg-amber-950/80 text-amber-300 border border-amber-800">
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            WARN
          </span>
        );
      case 'DEBUG':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono text-slate-400 bg-slate-900 border border-slate-800">
            DEBUG
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono font-medium bg-emerald-950/60 text-emerald-300 border border-emerald-800/60">
            <Info className="w-3 h-3 text-emerald-400" />
            INFO
          </span>
        );
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0B0C0E] overflow-hidden">
      {/* Шапка консоли логов */}
      <header className="px-6 py-3.5 bg-[#131519] border-b border-[#22262E] flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Terminal className="w-4 h-4" />
          </div>
          <div>
            <h1 className="font-display text-base font-semibold text-[#F1F3F5] tracking-tight flex items-center gap-2">
              <span>Сквозной журнал диагностики и трассировки процессов</span>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#1B2029] text-[#8A919E] border border-[#272D3A]">
                {counts.total} записей
              </span>
            </h1>
            <p className="text-xs text-[#8A919E] mt-0.5">
              Полный аудит операций: декодирование RAW/LFR, ONNX Runtime, дисперсия Лапласа, сдвиг Exposure2012, генерация XMP Sidecar
            </p>
          </div>
        </div>

        {/* Действия: Копировать, Скачать, Очистить */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopyAll}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#1A1D24] hover:bg-[#252A35] border border-[#2C313E] rounded text-xs font-medium text-[#F1F3F5] transition-colors cursor-pointer"
            title="Скопировать весь журнал в буфер обмена"
          >
            {copiedAll ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Скопировано!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Копировать всё</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleExportText}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-[#0B0C0E] font-semibold rounded text-xs transition-colors cursor-pointer"
            title="Скачать лог-файл для анализа ошибок и диагностики"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Скачать .log файл</span>
          </button>

          <button
            type="button"
            onClick={() => logger.clearLogs()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#201518] hover:bg-[#2D1B20] border border-rose-900/60 rounded text-xs text-rose-300 transition-colors cursor-pointer"
            title="Очистить буфер журнала"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            <span>Очистить</span>
          </button>
        </div>
      </header>

      {/* Панель фильтров и статистики ошибок */}
      <section className="px-6 py-2.5 bg-[#0F1116] border-b border-[#22262E] flex flex-wrap items-center justify-between gap-4 text-xs shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          {/* Поиск по тексту */}
          <div className="relative min-w-[240px]">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по сообщениям, файлам, стеку..."
              className="w-full bg-[#0B0C0E] border border-[#22262E] focus:border-amber-500 rounded pl-7 pr-3 py-1 text-xs text-[#F1F3F5] outline-none"
            />
            <Search className="w-3.5 h-3.5 text-[#8A919E] absolute left-2 top-2 pointer-events-none" />
          </div>

          {/* Фильтр по уровню */}
          <div className="flex items-center gap-1 bg-[#0B0C0E] p-0.5 rounded border border-[#22262E]">
            <button
              type="button"
              onClick={() => setSelectedLevel('ALL')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                selectedLevel === 'ALL'
                  ? 'bg-[#1F242F] text-[#F1F3F5]'
                  : 'text-[#8A919E] hover:text-[#F1F3F5]'
              }`}
            >
              Все ({counts.total})
            </button>
            <button
              type="button"
              onClick={() => setSelectedLevel('ERROR')}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                selectedLevel === 'ERROR'
                  ? 'bg-rose-950 text-rose-300 border border-rose-800'
                  : 'text-rose-400 hover:text-rose-200'
              }`}
            >
              Ошибки ({counts.errorCount})
            </button>
            <button
              type="button"
              onClick={() => setSelectedLevel('WARN')}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                selectedLevel === 'WARN'
                  ? 'bg-amber-950 text-amber-300 border border-amber-800'
                  : 'text-amber-400 hover:text-amber-200'
              }`}
            >
              Предупреждения ({counts.warnCount})
            </button>
            <button
              type="button"
              onClick={() => setSelectedLevel('INFO')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                selectedLevel === 'INFO'
                  ? 'bg-[#1F242F] text-[#F1F3F5]'
                  : 'text-[#8A919E] hover:text-[#F1F3F5]'
              }`}
            >
              Инфо ({counts.infoCount})
            </button>
          </div>

          {/* Категория подсистемы */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="bg-[#0B0C0E] border border-[#22262E] focus:border-amber-500 rounded px-2.5 py-1 text-xs text-[#F1F3F5] outline-none cursor-pointer"
          >
            <option value="ALL">Все подсистемы (ALL)</option>
            {ALL_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        {/* Быстрый статус исправности */}
        <div className="flex items-center gap-3 text-[#8A919E] font-mono text-[11px]">
          {counts.errorCount === 0 ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-400">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Ошибок не зафиксировано</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-rose-400 font-semibold">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Обнаружено критических сбоев: {counts.errorCount}</span>
            </span>
          )}
        </div>
      </section>

      {/* Список записей журнала */}
      <main className="flex-1 overflow-y-auto p-4 space-y-2 select-text font-mono text-xs">
        {filteredLogs.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center space-y-2 border border-dashed border-[#22262E] rounded-lg p-6">
            <p className="text-xs text-[#8A919E]">
              Нет записей, удовлетворяющих заданным фильтрам.
            </p>
            <button
              type="button"
              onClick={() => {
                setSelectedLevel('ALL');
                setSelectedCategory('ALL');
                setSearchQuery('');
              }}
              className="inline-flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Сбросить фильтры поиска</span>
            </button>
          </div>
        ) : (
          filteredLogs.map((entry) => {
            const isExpanded = expandedId === entry.id;
            const hasDetails = Boolean(entry.details || entry.errorStack);

            const borderClass =
              entry.level === 'ERROR'
                ? 'border-rose-900/60 bg-[#160E10]'
                : entry.level === 'WARN'
                ? 'border-amber-900/40 bg-[#14120E]'
                : 'border-[#22262E] bg-[#111318]';

            return (
              <div
                key={entry.id}
                className={`rounded border p-2.5 transition-colors ${borderClass}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {getLevelBadge(entry.level)}
                    <span className="text-[#8A919E] text-[11px] tabular-nums">
                      {entry.timestamp.replace('T', ' ').replace('Z', '')}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-[#1B202A] text-amber-300 font-semibold text-[11px] border border-[#2B3242]">
                      {entry.category}
                    </span>
                    {entry.fileContext && (
                      <span className="text-[#9BA3AF] text-[11px] underline decoration-slate-700">
                        {entry.fileContext}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopySingle(entry.id, entry)}
                      className="p-1 text-[#8A919E] hover:text-[#F1F3F5] rounded transition-colors"
                      title="Скопировать запись"
                    >
                      {copiedId === entry.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                    {hasDetails && (
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                        className="p-1 text-[#8A919E] hover:text-[#F1F3F5] rounded transition-colors"
                        title={isExpanded ? 'Свернуть детали' : 'Развернуть детали'}
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                <div className="text-[#F1F3F5] mt-1.5 break-words font-sans text-xs leading-relaxed">
                  {entry.message}
                </div>

                {/* Развернутые данные для отладки и исправления ошибок */}
                {isExpanded && hasDetails && (
                  <div className="mt-2.5 pt-2 border-t border-[#22262E] space-y-2 text-[11px]">
                    {entry.details && (
                      <div>
                        <div className="text-[#8A919E] font-semibold mb-0.5">Контекст операции:</div>
                        <pre className="p-2 rounded bg-[#0B0C0E] border border-[#1E232E] text-slate-300 overflow-x-auto">
                          {typeof entry.details === 'string'
                            ? entry.details
                            : JSON.stringify(entry.details, null, 2)}
                        </pre>
                      </div>
                    )}

                    {entry.errorStack && (
                      <div>
                        <div className="text-rose-400 font-semibold mb-0.5">Stack Trace ошибки:</div>
                        <pre className="p-2 rounded bg-[#1C0F12] border border-rose-900/60 text-rose-300 overflow-x-auto leading-tight">
                          {entry.errorStack}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </main>
    </div>
  );
};
