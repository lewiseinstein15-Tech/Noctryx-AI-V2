import fs from 'fs';
import path from 'path';

const SRC = '.';
const DIST = 'dist';

const COPY_LIST = [
  'index.html',
  'manifest.json',
  'capacitor.config.json',
  'icon.svg',
  'icon-maskable.svg'
];

if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true });

COPY_LIST.forEach((item) => {
  const srcPath = path.join(SRC, item);
  const destPath = path.join(DIST, item);
  if (!fs.existsSync(srcPath)) {
    console.warn(`⚠️ Missing: ${item}`);
    return;
  }
  const stat = fs.statSync(srcPath);
  if (stat.isDirectory()) {
    fs.cpSync(srcPath, destPath, { recursive: true, force: true });
  } else {
    fs.copyFileSync(srcPath, destPath);
  }
  console.log(`✅ Copied: ${item}`);
});

console.log('🚀 Build complete. dist/ is ready for Capacitor.');
