import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const platform = process.platform;

console.log(`[Universal Build] Detected host platform: ${platform}`);

if (platform === 'win32') {
  execSync('node scripts/build-windows.mjs', { cwd: rootDir, stdio: 'inherit' });
} else if (platform === 'darwin') {
  execSync('node scripts/build-macos.mjs', { cwd: rootDir, stdio: 'inherit' });
} else if (platform === 'linux') {
  execSync('node scripts/build-linux.mjs', { cwd: rootDir, stdio: 'inherit' });
} else {
  console.error(`[Fatal Error] Unsupported platform for standalone packaging: ${platform}`);
  process.exit(1);
}
