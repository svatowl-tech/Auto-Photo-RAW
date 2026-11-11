# OptiCull RAW & Lytro Illum 4D Studio

[![Status: Early-Stage Alpha](https://img.shields.io/badge/status-early--stage%20alpha%20(v0.1.0--alpha.1)-f59e0b)](https://github.com/opticull/opticull-raw/releases)
[![CI Verification](https://github.com/opticull/opticull-raw/actions/workflows/ci.yml/badge.svg)](https://github.com/opticull/opticull-raw/actions/workflows/ci.yml)
[![Release Build](https://github.com/opticull/opticull-raw/actions/workflows/release.yml/badge.svg)](https://github.com/opticull/opticull-raw/actions/workflows/release.yml)
[![License: MIT / Apache-2.0](https://img.shields.io/badge/license-MIT%20%2F%20Apache--2.0-blue.svg)](./LICENSE)

> [!WARNING]
> **Статус проекта: Ранняя стадия разработки (Early-Stage Alpha `v0.1.0-alpha.1` / Pre-Release)**
>
> Проект находится в активной фазе инженерного развития и открытого тестирования.
> - Все операции чтения исходных файлов фотосессий (`.CR3`, `.NEF`, `.ARW`, `.DNG`, `.JPEG`, `.LFR`, `.LFP`) выполняются **строго в неразрушающем режиме (`read-only`)** — метаданные записываются исключительно в соседние sidecar-файлы `.xmp`.
> - Калибровка матриц микролинз (**MLA**) для различных ревизий камер **Lytro Illum** и **Lytro First Gen** активно пополняется.
> - В приложение встроена полная система сквозного логирования (**вкладка «Журнал логов»** $\rightarrow$ **«Скачать .log файл»**). При обнаружении любых сбоев декодирования или ошибок драйвера GPU (`DirectML` / `CoreML` / `CUDA`) прикрепляйте сгенерированный `.log` файл в раздел **GitHub Issues**.

---

## О проекте

**OptiCull RAW & Lytro Illum 4D Studio** — это полностью автономная (100% оффлайн, без облачных API, телеметрии и подписок) кроссплатформенная станция для пакетного технического и эстетического отбора фотографий, первичной экспокоррекции и работы с 4D световым полем камер **Lytro Illum**.

### Ключевые возможности

1. **Многопоточное ядро на Rust (`rayon` + `tokio`)**:
   - Параллельная обработка каталогов съемки (`rayon::par_iter`) с атомарным отслеживанием прогресса (`AtomicUsize`) и потоковой передачей статуса `cull-progress` в интерфейс **Tauri v2**.
2. **Локальный нейросетевой инференс (`ort` — ONNX Runtime)**:
   - Выбор аппаратного ускорителя пользователем: `Auto`, `CPU (SIMD)`, `DirectML` (Windows DX12), `CoreML` (macOS Apple Silicon), `CUDA` (NVIDIA).
   - **Безопасный автоматический CPU Fallback**: при отсутствии GPU или несовместимости видеодрайвера сессия автоматически и без падения переключается на многопоточный CPU.
3. **Математический анализ резкости и экспозиции (`engine/cv.rs`)**:
   - Детекция смаза и оценка резкости через дисперсию оператора Лапласа ($\text{Var}(\nabla^2 Y)$) в канале яркости.
   - Построение 256-канальной гистограммы яркости и расчет автоматического сдвига экспозиции `crs:Exposure2012` через логарифмическое геометрическое среднее относительно стандарта **18% Middle Gray**.
4. **Нативная поддержка Lytro RAW (`.LFR` / `.LFP`) и функций Lytro Illum (`engine/lytro.rs`)**:
   - Разбор бинарного контейнера Lytro Package (`\x89LFP`, секции `\x89LF_`) и JSON-манифеста 40-мегалучевого сенсора (**40 Megarays MLA**).
   - **Интерактивная пост-фокусировка ($\lambda \in [-10.0, +15.0]$)**: перефокусировка в один клик по любой зоне кадра после съемки.
   - **Виртуальная диафрагма (`f/1.0` – `f/16`) и шкала `Focus Spread`**: цифровое управление глубиной резкости (ГРИП) и визуализация гистограммы оптической глубины.
   - **Карта глубины (`Depth Map`), `Focus Peaking` и сдвиг ракурса (`Perspective Shift u, v`)**.
   - **Умное спасение кадров (`4D Refocus Salvage`)**: если исходный срез `.LFR` не в фокусе, алгоритм сканирует стек глубины $\lambda$, находит пик резкости $\lambda_{\text{opt}}$ и спасает кадр из брака с записью параметров в `.xmp`.
5. **Неразрушающий генератор Adobe XMP Sidecar (`engine/xmp.rs`)**:
   - Запись стандартных тегов `xmp:Rating`, `xmp:Label`, `crs:Exposure2012`, `crs:Temperature`, `crs:Tint` и расширенного пространства имен `xmlns:lytro="http://ns.lytro.com/lightfield/1.0/"` для Lightroom Classic, Camera Raw, Capture One и Darktable.
6. **Сквозное диагностическое логирование (`logger.rs` / `logger.service.ts`)**:
   - Трассировка каждого шага конвейера, фильтрация по уровням `DEBUG`/`INFO`/`WARN`/`ERROR`, просмотр контекста и Stack Trace ошибок, выгрузка отчета `.log` в один клик.

---

## Автоматическая сборка и релизы (GitHub Actions CI/CD)

В репозитории настроены два автоматических пайплайна в `.github/workflows/`:

- **`ci.yml`**: запускается при каждом `push` и `pull_request` в `main`/`master`. Проверяет строгую типизацию фронтенда (`tsc --noEmit`), сборку Vite и компиляцию Rust-ядра (`cargo check`) на Ubuntu, Windows и macOS.
- **`release.yml`**: автоматически запускается при пуше git-тега вида `v*` (например, `v0.1.0-alpha.1`) или вручную через `workflow_dispatch`. Собирает нативные пакеты через `tauri-apps/tauri-action@v1` для:
  - **Windows x64** (`.msi` и `.exe` NSIS инсталляторы)
  - **macOS Apple Silicon (`aarch64`) и Intel (`x86_64`)** (`.dmg` и `.app`)
  - **Linux x64** (`.deb` и `.AppImage`)
  и публикует их в **GitHub Releases** с флагом `prerelease: true` и пометкой о ранней стадии разработки.

### Как выпустить новый релиз в публичном репозитории

```bash
# 1. Инициализация и привязка к вашему публичному репозиторию GitHub
git init
git add .
git commit -m "chore(release): prepare initial early-stage alpha v0.1.0-alpha.1"
git branch -M main
git remote add origin https://github.com/<ВАШ_АККАУНТ>/opticull-raw.git
git push -u origin main

# 2. Создание и отправка тега для автоматической сборки и публикации релиза GitHub Actions
git tag -a v0.1.0-alpha.1 -m "OptiCull RAW v0.1.0-alpha.1 (Early-Stage Alpha)"
git push origin v0.1.0-alpha.1
```

---

## Локальная разработка и сборка

### 1. Требования
- **Node.js**: `20.x` или `22.x` LTS
- **Rust**: `1.81+` (`rustup update stable`)
- **Tauri CLI v2**: `cargo install tauri-cli --version "=2.2.0" --locked`

### 2. Запуск интерактивного веб-прототипа и проверка типов
```bash
npm install
npm run lint
npm run dev
```

### 3. Сборка нативного десктопного приложения Tauri v2
```bash
# Проверка Rust-ядра
cargo check --manifest-path src-tauri/Cargo.toml

# Запуск десктопного окна в режиме разработки
cargo tauri dev

# Сборка релизного инсталлятора под текущую ОС
cargo tauri build
```

---

## Лицензия

Проект распространяется на условиях двойной лицензии **MIT OR Apache-2.0** (см. файл [`LICENSE`](./LICENSE)).
