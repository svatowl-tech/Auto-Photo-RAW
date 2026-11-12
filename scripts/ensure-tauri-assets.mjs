/**
 * Автономный кроссплатформенный генератор обязательных ресурсов Tauri v2 (`ensure-tauri-assets.mjs`).
 * Гарантирует наличие:
 * 1. Валидных RGBA PNG иконок (`32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.png`),
 *    Windows-ресурса `icon.ico` и macOS-пакета `icon.icns` в `src-tauri/icons/`.
 * 2. Схемы прав безопасности Tauri v2 ACL `src-tauri/capabilities/default.json`.
 * 3. Директории `dist/` (для прохождения `tauri::generate_context!()` при `cargo check`).
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const rootDir = process.cwd();
const tauriDir = path.join(rootDir, 'src-tauri');
const iconsDir = path.join(tauriDir, 'icons');
const capabilitiesDir = path.join(tauriDir, 'capabilities');
const distDir = path.join(rootDir, 'dist');

fs.mkdirSync(iconsDir, { recursive: true });
fs.mkdirSync(capabilitiesDir, { recursive: true });
fs.mkdirSync(distDir, { recursive: true });

// Вычисление CRC32 для чанков стандарта PNG (ISO/IEC 15948)
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(typeAscii, dataBuffer) {
  const typeBuf = Buffer.from(typeAscii, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(dataBuffer.length, 0);

  const crcInput = Buffer.concat([typeBuf, dataBuffer]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);

  return Buffer.concat([lenBuf, typeBuf, dataBuffer, crcBuf]);
}

/**
 * Генерирует валидный 32-битный RGBA PNG (ColorType = 6) заданного размера.
 * Tauri v2 (`tauri-build`) строго требует формат RGBA для всех PNG-иконок.
 */
function createRgbaPngBuffer(size) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); // width
  ihdr.writeUInt32BE(size, 4); // height
  ihdr.writeUInt8(8, 8);       // bit depth: 8 bits
  ihdr.writeUInt8(6, 9);       // color type: 6 (RGBA)
  ihdr.writeUInt8(0, 10);      // compression
  ihdr.writeUInt8(0, 11);      // filter
  ihdr.writeUInt8(0, 12);      // interlace

  const rowStride = size * 4 + 1;
  const rawScanlines = Buffer.alloc(rowStride * size);
  const center = size / 2;
  const outerR = size * 0.42;
  const innerR = size * 0.22;

  for (let y = 0; y < size; y++) {
    const rowOffset = y * rowStride;
    rawScanlines[rowOffset] = 0; // filter type None
    for (let x = 0; x < size; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const dx = x - center;
      const dy = y - center;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= innerR) {
        // Янтарная апертура OptiCull (#F59E0B)
        rawScanlines[pxOffset] = 245;
        rawScanlines[pxOffset + 1] = 158;
        rawScanlines[pxOffset + 2] = 11;
        rawScanlines[pxOffset + 3] = 255;
      } else if (dist <= outerR) {
        // Бирюзовое кольцо Lytro 4D (#06B6D4)
        rawScanlines[pxOffset] = 6;
        rawScanlines[pxOffset + 1] = 182;
        rawScanlines[pxOffset + 2] = 212;
        rawScanlines[pxOffset + 3] = 255;
      } else {
        // Темно-графитовый корпус (#131519)
        rawScanlines[pxOffset] = 19;
        rawScanlines[pxOffset + 1] = 21;
        rawScanlines[pxOffset + 2] = 25;
        rawScanlines[pxOffset + 3] = 255;
      }
    }
  }

  const compressedIdat = zlib.deflateSync(rawScanlines);
  return Buffer.concat([
    signature,
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', compressedIdat),
    makePngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Упаковывает PNG-буфер в стандартный контейнер Windows Icon (`.ico`),
 * требуемый `tauri-build` на Windows для компиляции `.rc` ресурсов.
 */
function createIcoFromPng(pngBuffer, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // Type: 1 = ICON
  header.writeUInt16LE(1, 4); // Count: 1 image

  const dirEntry = Buffer.alloc(16);
  dirEntry.writeUInt8(size >= 256 ? 0 : size, 0); // Width
  dirEntry.writeUInt8(size >= 256 ? 0 : size, 1); // Height
  dirEntry.writeUInt8(0, 2);                      // Color palette
  dirEntry.writeUInt8(0, 3);                      // Reserved
  dirEntry.writeUInt16LE(1, 4);                   // Color planes
  dirEntry.writeUInt16LE(32, 6);                  // Bits per pixel (32-bit RGBA)
  dirEntry.writeUInt32LE(pngBuffer.length, 8);    // Size of image data
  dirEntry.writeUInt32LE(6 + 16, 12);             // Offset of image data (22)

  return Buffer.concat([header, dirEntry, pngBuffer]);
}

/**
 * Упаковывает 256x256 PNG в контейнер Apple Icon Image (`.icns` с блоком `ic08`).
 */
function createIcnsFromPng(png256Buffer) {
  const totalLen = 8 + 8 + png256Buffer.length;
  const header = Buffer.alloc(8);
  header.write('icns', 0, 4, 'ascii');
  header.writeUInt32BE(totalLen, 4);

  const blockHeader = Buffer.alloc(8);
  blockHeader.write('ic08', 0, 4, 'ascii');
  blockHeader.writeUInt32BE(8 + png256Buffer.length, 4);

  return Buffer.concat([header, blockHeader, png256Buffer]);
}

const png32 = createRgbaPngBuffer(32);
const png128 = createRgbaPngBuffer(128);
const png256 = createRgbaPngBuffer(256);

fs.writeFileSync(path.join(iconsDir, '32x32.png'), png32);
fs.writeFileSync(path.join(iconsDir, '128x128.png'), png128);
fs.writeFileSync(path.join(iconsDir, '128x128@2x.png'), png256);
fs.writeFileSync(path.join(iconsDir, 'icon.png'), png256);
fs.writeFileSync(path.join(iconsDir, 'icon.ico'), createIcoFromPng(png32, 32));
fs.writeFileSync(path.join(iconsDir, 'icon.icns'), createIcnsFromPng(png256));

// Создание default.json для системы прав Tauri v2 Capabilities
const defaultCapabilityPath = path.join(capabilitiesDir, 'default.json');
if (!fs.existsSync(defaultCapabilityPath)) {
  const capabilityJson = {
    $schema: '../gen/schemas/desktop-schema.json',
    identifier: 'default',
    description: 'Default desktop capabilities for OptiCull RAW & Lytro Illum 4D Studio',
    windows: ['main'],
    permissions: ['core:default'],
  };
  fs.writeFileSync(defaultCapabilityPath, JSON.stringify(capabilityJson, null, 2) + '\n', 'utf8');
}

// Гарантируем наличие dist/index.html для прохождения cargo check до запуска vite build
const distIndex = path.join(distDir, 'index.html');
if (!fs.existsSync(distIndex)) {
  fs.writeFileSync(
    distIndex,
    '<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>OptiCull RAW</title></head><body><div id="root"></div></body></html>\n',
    'utf8'
  );
}

console.log('[ensure-tauri-assets] Ресурсы Tauri v2 (RGBA иконки, capabilities/default.json и dist/) проверены и готовы.');
