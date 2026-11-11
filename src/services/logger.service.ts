/**
 * Сервис сбора, фильтрации и экспорта системных логов OptiCull RAW & Lytro Illum 4D.
 * Сохраняет подробные логи всех операций (декодирование, вычисления CV, рефокус 4D, ONNX, XMP, IPC)
 * в кольцевой буфер в памяти и localStorage, позволяет искать, фильтровать по уровню и скачивать лог-файл.
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export type LogCategory =
  | 'CORE'
  | 'PIPELINE'
  | 'CV_ENGINE'
  | 'ONNX_ORT'
  | 'LYTRO_4D'
  | 'XMP_SIDECAR'
  | 'IO_FS'
  | 'TAURI_IPC';

export interface LogEntry {
  id: string;
  timestamp: string; // ISO 8601
  epochMs: number;
  level: LogLevel;
  category: LogCategory;
  message: string;
  details?: Record<string, unknown> | string;
  errorStack?: string;
  fileContext?: string;
}

const MAX_LOG_ENTRIES = 2000;
const STORAGE_KEY = 'opticull_system_logs_v1';

class LoggerService {
  private logs: LogEntry[] = [];
  private listeners: Set<(logs: LogEntry[]) => void> = new Set();

  constructor() {
    this.loadFromStorage();
    if (this.logs.length === 0) {
      this.info(
        'CORE',
        'Инициализация системы сквозного логирования OptiCull RAW & Lytro Illum 4D (v1.4.0)',
        {
          environment: typeof window !== 'undefined' && (window as unknown as { __TAURI__?: unknown }).__TAURI__ ? 'Tauri v2 Desktop' : 'Web/Preview Shell',
          maxEntries: MAX_LOG_ENTRIES,
        }
      );
    }
  }

  private loadFromStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as LogEntry[];
        if (Array.isArray(parsed)) {
          this.logs = parsed.slice(-MAX_LOG_ENTRIES);
        }
      }
    } catch {
      // Игнорируем сбои чтения кэша
    }
  }

  private saveToStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.logs.slice(-500)));
    } catch {
      // Игнорируем квоты localStorage
    }
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener([...this.logs]);
    }
    this.saveToStorage();
  }

  public subscribe(listener: (logs: LogEntry[]) => void): () => void {
    this.listeners.add(listener);
    listener([...this.logs]);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public log(
    level: LogLevel,
    category: LogCategory,
    message: string,
    details?: Record<string, unknown> | string,
    fileContext?: string,
    error?: unknown
  ): LogEntry {
    const now = new Date();
    let errorStack: string | undefined;
    if (error instanceof Error) {
      errorStack = error.stack;
    } else if (typeof error === 'string') {
      errorStack = error;
    }

    const entry: LogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: now.toISOString(),
      epochMs: now.getTime(),
      level,
      category,
      message,
      details,
      errorStack,
      fileContext,
    };

    this.logs.push(entry);
    if (this.logs.length > MAX_LOG_ENTRIES) {
      this.logs.splice(0, this.logs.length - MAX_LOG_ENTRIES);
    }

    // Дублируем в консоль браузера с форматированием
    const prefix = `[${entry.timestamp}] [${level}] [${category}]`;
    if (level === 'ERROR') {
      console.error(prefix, message, details ?? '', errorStack ?? '');
    } else if (level === 'WARN') {
      console.warn(prefix, message, details ?? '');
    } else if (level === 'DEBUG') {
      console.debug(prefix, message, details ?? '');
    } else {
      console.info(prefix, message, details ?? '');
    }

    this.notify();
    return entry;
  }

  public debug(
    category: LogCategory,
    message: string,
    details?: Record<string, unknown> | string,
    fileContext?: string
  ): LogEntry {
    return this.log('DEBUG', category, message, details, fileContext);
  }

  public info(
    category: LogCategory,
    message: string,
    details?: Record<string, unknown> | string,
    fileContext?: string
  ): LogEntry {
    return this.log('INFO', category, message, details, fileContext);
  }

  public warn(
    category: LogCategory,
    message: string,
    details?: Record<string, unknown> | string,
    fileContext?: string
  ): LogEntry {
    return this.log('WARN', category, message, details, fileContext);
  }

  public error(
    category: LogCategory,
    message: string,
    details?: Record<string, unknown> | string,
    fileContext?: string,
    error?: unknown
  ): LogEntry {
    return this.log('ERROR', category, message, details, fileContext, error);
  }

  public getLogs(): LogEntry[] {
    return [...this.logs];
  }

  public clearLogs(): void {
    this.logs = [];
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // noop
      }
    }
    this.info('CORE', 'Журнал событий очищен пользователем');
  }

  public exportLogsAsText(): string {
    const header = [
      '# ==============================================================================',
      '# OptiCull RAW & Lytro Illum 4D Studio — Диагностический отчет и логи',
      `# Экспортировано: ${new Date().toISOString()}`,
      `# Всего записей: ${this.logs.length}`,
      '# ==============================================================================\n',
    ].join('\n');

    const lines = this.logs.map((entry) => {
      let line = `[${entry.timestamp}] [${entry.level.padEnd(5)}] [${entry.category.padEnd(11)}] ${entry.message}`;
      if (entry.fileContext) {
        line += ` | file="${entry.fileContext}"`;
      }
      if (entry.details) {
        const detailsStr =
          typeof entry.details === 'string'
            ? entry.details
            : JSON.stringify(entry.details);
        line += ` | details=${detailsStr}`;
      }
      if (entry.errorStack) {
        line += `\n    STACK TRACE: ${entry.errorStack.replace(/\n/g, '\n    ')}`;
      }
      return line;
    });

    return `${header}\n${lines.join('\n')}\n`;
  }
}

export const logger = new LoggerService();
