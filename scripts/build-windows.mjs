import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import esbuild from 'esbuild';
import { inject } from 'postject';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const nodeVersion = process.version;
const NODE_WIN_URL = `https://nodejs.org/dist/${nodeVersion}/win-x64/node.exe`;
const SEA_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

async function buildWindowsExecutable() {
  console.log('====================================================');
  console.log('   📦 WINDOWS x64 PORTABLE EXECUTABLE BUILDER');
  console.log('====================================================\n');

  // 1. Run Vitest Unit Tests & TypeScript compilation
  console.log('[Step 1/6] Running unit tests and verifying build baseline...');
  execSync('npm test', { cwd: rootDir, stdio: 'inherit' });
  execSync('npx tsc', { cwd: rootDir, stdio: 'inherit' });

  // 2. Prepare output directories
  const distDir = path.join(rootDir, 'dist');
  const releaseDir = path.join(rootDir, 'release');
  fs.mkdirSync(distDir, { recursive: true });
  fs.mkdirSync(releaseDir, { recursive: true });

  const bundlePath = path.join(distDir, 'bundle.cjs');
  const seaConfigPath = path.join(distDir, 'sea-config.json');
  const seaBlobPath = path.join(distDir, 'sea-prep.blob');
  const winNodePath = path.join(distDir, `node-${nodeVersion}-win-x64.exe`);
  const targetExePath = path.join(releaseDir, 'whatsapp-contact-exporter-windows-x64.exe');
  const sha256Path = path.join(releaseDir, 'SHA256SUMS.txt');

  // 3. Bundle TypeScript application into standalone CommonJS file
  console.log('\n[Step 2/6] Bundling application source with esbuild...');
  const majorVersion = parseInt(process.versions.node.split('.')[0], 10) || 20;
  await esbuild.build({
    entryPoints: [path.join(rootDir, 'src/cli.ts')],
    bundle: true,
    platform: 'node',
    target: `node${majorVersion}`,
    format: 'cjs',
    outfile: bundlePath,
    external: ['@aws-sdk/*', 'fsevents'],
  });

  // Strip hashbang if present
  let code = fs.readFileSync(bundlePath, 'utf8');
  if (code.startsWith('#!')) {
    code = code.replace(/^#![^\n]*\n/, '');
    fs.writeFileSync(bundlePath, code, 'utf8');
  }

  console.log(`✓ Bundled CJS application created (hashbang stripped): ${bundlePath}`);

  // 4. Write SEA config and generate SEA Blob
  console.log('\n[Step 3/6] Generating Node.js Single Executable Application (SEA) Blob...');
  const seaConfig = {
    main: bundlePath,
    output: seaBlobPath,
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: false,
  };
  fs.writeFileSync(seaConfigPath, JSON.stringify(seaConfig, null, 2));

  execSync(`node --experimental-sea-config "${seaConfigPath}"`, { cwd: rootDir, stdio: 'inherit' });
  console.log(`✓ SEA Blob created: ${seaBlobPath}`);

  // 5. Download / fetch Node.js Windows x64 binary matching the runtime version
  console.log(`\n[Step 4/6] Fetching Node.js ${nodeVersion} Windows x64 base binary...`);
  if (!fs.existsSync(winNodePath)) {
    if (process.platform === 'win32' && process.execPath.endsWith('node.exe')) {
      console.log(`✓ Copying local Windows node.exe (${process.execPath})...`);
      fs.copyFileSync(process.execPath, winNodePath);
    } else {
      console.log(`Downloading base binary from ${NODE_WIN_URL}...`);
      const res = await fetch(NODE_WIN_URL);
      if (!res.ok) {
        throw new Error(`Failed to download Node.js Windows binary from ${NODE_WIN_URL}: ${res.statusText}`);
      }
      const arrayBuffer = await res.arrayBuffer();
      fs.writeFileSync(winNodePath, Buffer.from(arrayBuffer));
    }
  } else {
    console.log(`✓ Reusing cached Windows base binary: ${winNodePath}`);
  }

  // Copy base binary to release directory
  fs.copyFileSync(winNodePath, targetExePath);

  // 6. Inject SEA Blob into Windows executable using postject
  console.log('\n[Step 5/6] Injecting SEA Blob into Windows executable...');
  const blobBuffer = fs.readFileSync(seaBlobPath);

  await inject(targetExePath, 'NODE_SEA_BLOB', blobBuffer, {
    sentinelFuse: SEA_FUSE,
    machoSegmentName: 'NODE_SEA',
    overwrite: true,
  });

  console.log(`✓ SEA Blob injected successfully into ${targetExePath}`);

  // 7. Calculate SHA-256 hash and write checksum file
  console.log('\n[Step 6/6] Calculating SHA-256 checksum...');
  const exeBuffer = fs.readFileSync(targetExePath);
  const hash = crypto.createHash('sha256').update(exeBuffer).digest('hex');
  const exeFileName = path.basename(targetExePath);
  const sha256Content = `${hash}  ${exeFileName}\n`;

  fs.writeFileSync(sha256Path, sha256Content);

  const stats = fs.statSync(targetExePath);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

  console.log('\n====================================================');
  console.log('   🎉 WINDOWS EXECUTABLE BUILD SUCCESSFUL!');
  console.log('====================================================');
  console.log(` Executable Path : ${targetExePath}`);
  console.log(` Executable Size : ${sizeMB} MB`);
  console.log(` SHA-256 Checksum: ${hash}`);
  console.log(` Checksum File   : ${sha256Path}`);
  console.log('====================================================\n');
}

buildWindowsExecutable().catch((err) => {
  console.error('\n[Fatal Error] Windows executable build failed:', err);
  process.exit(1);
});
