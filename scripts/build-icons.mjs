// Regenerates every app icon from the SVG masters in src-tauri/icons/source.
//
//   node scripts/build-icons.mjs
//
// 1. Renders the master drawing to icons/icon-master-1024.png.
// 2. Runs `tauri icon` on it to produce the .icns, Store, Android and iOS sizes.
// 3. Rebuilds icon.ico and 32x32.png so the small sizes (16/24/32) use the
//    simplified drawing instead of a shrunken master.
// 4. Copies the simplified drawing to public/favicon.svg.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const iconsDir = path.join(root, 'src-tauri', 'icons');
const masterSvg = fs.readFileSync(path.join(iconsDir, 'source', 'silkcast-icon.svg'), 'utf8');
const smallSvg = fs.readFileSync(path.join(iconsDir, 'source', 'silkcast-icon-small.svg'), 'utf8');

const SMALL_DRAWING_MAX = 32;
const ICO_SIZES = [16, 24, 32, 48, 64, 256];

function render(svg, size) {
  return new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
}

function renderForSize(size) {
  return render(size <= SMALL_DRAWING_MAX ? smallSvg : masterSvg, size);
}

/** Packs PNG images into a Windows .ico (PNG-compressed entries, Vista+). */
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  const entries = [];
  let offset = 6 + images.length * 16;
  for (const { size, png } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(entry);
  }

  return Buffer.concat([header, ...entries, ...images.map((image) => image.png)]);
}

const masterPng = path.join(iconsDir, 'icon-master-1024.png');
fs.writeFileSync(masterPng, render(masterSvg, 1024));
console.log('rendered icon-master-1024.png');

const tauriCli = path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');
execFileSync(process.execPath, [tauriCli, 'icon', masterPng, '--output', iconsDir], {
  cwd: root,
  stdio: 'inherit',
});

fs.writeFileSync(
  path.join(iconsDir, 'icon.ico'),
  buildIco(ICO_SIZES.map((size) => ({ size, png: renderForSize(size) })))
);
fs.writeFileSync(path.join(iconsDir, '32x32.png'), renderForSize(32));
console.log('rebuilt icon.ico and 32x32.png with the small-size drawing');

fs.writeFileSync(path.join(root, 'public', 'favicon.svg'), smallSvg);
console.log('wrote public/favicon.svg');
