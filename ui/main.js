/**
 * Клиентский мост Tauri v2 (`ui/main.js`).
 * Взаимодействует с Rust-ядром через `@tauri-apps/api/core` (`invoke`)
 * и подписывается на потоковые события `cull-progress` через `@tauri-apps/api/event` (`listen`).
 */

const tauriCore = window.__TAURI__?.core;
const tauriEvent = window.__TAURI__?.event;

const folderInput = document.getElementById('folder-input');
const backendSelect = document.getElementById('backend-select');
const startBtn = document.getElementById('start-btn');
const progressLabel = document.getElementById('progress-label');
const progressPercent = document.getElementById('progress-percent');
const progressFill = document.getElementById('progress-fill');
const backendStatus = document.getElementById('backend-status');
const resultsBody = document.getElementById('results-body');

async function initTauriBridge() {
  if (!tauriCore) {
    backendStatus.textContent = 'Режим браузерного предпросмотра (Tauri IPC мост готов)';
    populateDefaultBackends([
      { id: 'Auto', label: 'Auto (Smart Hardware Routing)' },
      { id: 'Cpu', label: 'CPU (Multi-Threaded SIMD)' },
      { id: 'DirectML', label: 'DirectML (Windows DX12 GPU)' },
      { id: 'CoreML', label: 'CoreML (Apple Neural Engine)' },
      { id: 'Cuda', label: 'NVIDIA CUDA (Tensor Cores)' },
    ]);
    return;
  }

  try {
    const backends = await tauriCore.invoke('get_available_backends');
    populateDefaultBackends(backends);

    await tauriEvent.listen('cull-progress', (event) => {
      const payload = event.payload;
      if (!payload) return;
      const pct = Math.round(payload.percentage || 0);
      progressFill.style.width = `${pct}%`;
      progressPercent.textContent = `${pct}% (${payload.completed}/${payload.total})`;
      progressLabel.textContent = `Обработка: ${payload.current_file} [${payload.active_backend}]`;
    });
  } catch (err) {
    console.error('Ошибка инициализации Tauri IPC:', err);
  }
}

function populateDefaultBackends(backends) {
  backendSelect.innerHTML = '';
  for (const item of backends) {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = item.label;
    backendSelect.appendChild(opt);
  }
}

startBtn.addEventListener('click', async () => {
  const folderPath = folderInput.value.trim();
  if (!folderPath) {
    progressLabel.textContent = 'Укажите путь к папке с фотографиями RAW / JPEG / .LFR';
    return;
  }

  startBtn.disabled = true;
  resultsBody.innerHTML = '';
  progressFill.style.width = '0%';
  progressLabel.textContent = 'Инициализация пула потоков Rayon и сессии ONNX Runtime...';

  try {
    const report = await tauriCore.invoke('run_batch_cull', {
      folderPath,
      backend: backendSelect.value,
      thresholds: null,
    });

    backendStatus.textContent = report.backend_status.status_message;
    renderBatchRows(report.items || []);
    progressLabel.textContent = `Готово: обработано ${report.succeeded_count} из ${report.total_files} кадров за ${report.elapsed_total_ms} мс`;
  } catch (err) {
    progressLabel.textContent = `Ошибка выполнения: ${String(err)}`;
  } finally {
    startBtn.disabled = false;
  }
});

function renderBatchRows(items) {
  resultsBody.innerHTML = '';
  for (const item of items) {
    const tr = document.createElement('tr');
    const evStr = item.exposure_ev >= 0 ? `+${item.exposure_ev.toFixed(2)} EV` : `${item.exposure_ev.toFixed(2)} EV`;
    const lytroStr = item.lytro_meta
      ? `λ=${item.lytro_meta.current_lambda.toFixed(1)} · f/${item.lytro_meta.synthetic_aperture_fstop.toFixed(1)}`
      : '—';

    tr.innerHTML = `
      <td>${item.file_name}</td>
      <td>${item.format_badge}</td>
      <td>${item.sharpness_score.toFixed(1)} (σ²=${item.laplacian_variance.toFixed(0)})</td>
      <td>${item.aesthetic_score.toFixed(2)} / 10</td>
      <td>${evStr} · ${item.wb_temperature}K</td>
      <td>${lytroStr}</td>
      <td>${'★'.repeat(item.rating)} · ${item.color_label}</td>
      <td>${item.xmp_saved ? 'Сохранен .XMP' : item.error_message || 'Ошибка'}</td>
    `;
    resultsBody.appendChild(tr);
  }
}

initTauriBridge();
