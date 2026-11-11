import React, { useState } from 'react';
import { Copy, Check, Download, FileCode, Terminal } from 'lucide-react';
import { RUST_SOURCE_FILES } from '../data/rustSources.data';
import { downloadTextFile } from '../services/xmpGenerator.service';

export const RustSourceStudioView: React.FC = () => {
  const [selectedFileId, setSelectedFileId] = useState<string>(RUST_SOURCE_FILES[0].id);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const activeFile =
    RUST_SOURCE_FILES.find((f) => f.id === selectedFileId) || RUST_SOURCE_FILES[0];

  const handleCopyCode = (id: string, code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleDownloadFile = (relativePath: string, code: string) => {
    const filename = relativePath.split('/').pop() || 'source.rs';
    downloadTextFile(filename, code, 'text/plain');
  };

  const filteredFiles = RUST_SOURCE_FILES.filter(
    (f) =>
      f.relativePath.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex-1 flex min-h-0 bg-[#0B0C0E] overflow-hidden">
      {/* Левый список всех исходных файлов Rust и Tauri v2 */}
      <aside className="w-80 bg-[#131519] border-r border-[#22262E] flex flex-col min-h-0 shrink-0">
        <div className="p-4 border-b border-[#22262E] space-y-2.5">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-amber-400" />
            <h2 className="text-xs font-semibold text-[#F1F3F5]">
              Rust-ядро, Tauri v2 &amp; GitHub Release CI
            </h2>
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск (release.yml, ort, lytro, logger)..."
            className="w-full bg-[#0B0C0E] border border-[#22262E] focus:border-amber-500 rounded px-2.5 py-1.5 text-xs text-[#F1F3F5] outline-none"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredFiles.map((file) => {
            const isSelected = file.id === activeFile.id;
            return (
              <button
                key={file.id}
                type="button"
                onClick={() => setSelectedFileId(file.id)}
                className={`w-full text-left p-2.5 rounded-md border transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-[#1B2029] border-amber-500/80 text-[#F1F3F5]'
                    : 'bg-transparent border-transparent text-[#8A919E] hover:bg-[#171A21] hover:text-[#F1F3F5]'
                }`}
              >
                <div className="flex items-center gap-2 font-mono text-xs text-amber-400">
                  <FileCode className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{file.relativePath}</span>
                </div>
                <div className="text-xs font-medium text-[#F1F3F5] mt-1">
                  {file.title}
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Правая область просмотра полного исходного кода без сокращений */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-3.5 bg-[#131519] border-b border-[#22262E] shrink-0">
          <div className="min-w-0">
            <div className="font-mono text-xs text-amber-400">{activeFile.relativePath}</div>
            <h1 className="text-sm font-semibold text-[#F1F3F5] mt-0.5">{activeFile.title}</h1>
            <p className="text-xs text-[#8A919E] mt-0.5">{activeFile.description}</p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleCopyCode(activeFile.id, activeFile.code)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#1D222B] hover:bg-[#262C38] border border-[#2E3646] rounded text-xs font-medium text-[#F1F3F5] transition-colors cursor-pointer"
            >
              {copiedId === activeFile.id ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Код скопирован</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Копировать весь файл</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => handleDownloadFile(activeFile.relativePath, activeFile.code)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-[#0B0C0E] font-semibold rounded text-xs transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Скачать {activeFile.relativePath.split('/').pop()}</span>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-[#0B0C0E]">
          <pre className="p-4 rounded-lg bg-[#111318] border border-[#22262E] text-xs font-mono text-[#E2E6EE] leading-relaxed overflow-x-auto select-text">
            <code>{activeFile.code}</code>
          </pre>
        </div>
      </main>
    </div>
  );
};
