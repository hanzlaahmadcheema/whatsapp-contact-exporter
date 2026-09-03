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
const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
const SEA_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

async function buildMacOSExecutable() {
  console.log('====================================================');
  console.log(`   🍎 macOS (${arch}) STANDALONE EXECUTABLE BUILDER`);
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
  const targetBinaryPath = path.join(releaseDir, `whatsapp-contact-exporter-macos-${arch}`);
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

  // 5. Fetch/copy Node.js macOS base binary
  console.log(`\n[Step 4/6] Resolving Node.js ${nodeVersion} macOS (${arch}) base binary...`);
  fs.copyFileSync(process.execPath, targetBinaryPath);
  fs.chmodSync(targetBinaryPath, 0o755);

  // Remove existing macOS signature before injecting SEA blob
  try {
    console.log('✓ Removing existing code signature...');
    execSync(`codesign --remove-signature "${targetBinaryPath}"`, { stdio: 'ignore' });
  } catch {
    // Non-fatal if unsigned
  }

  // 6. Inject SEA Blob into macOS executable using postject
  console.log('\n[Step 5/6] Injecting SEA Blob into Mach-O binary...');
  const blobBuffer = fs.readFileSync(seaBlobPath);

  await inject(targetBinaryPath, 'NODE_SEA_BLOB', blobBuffer, {
    sentinelFuse: SEA_FUSE,
    machoSegmentName: 'NODE_SEA',
    overwrite: true,
  });

  // Re-sign binary with ad-hoc signature for macOS Gatekeeper compliance
  console.log('✓ Applying ad-hoc code signature...');
  try {
    execSync(`codesign --sign - "${targetBinaryPath}"`, { stdio: 'inherit' });
  } catch (err) {
    console.warn('⚠️ Warning: Ad-hoc signing failed, binary may require manual permission on macOS:', err);
  }

  fs.chmodSync(targetBinaryPath, 0o755);
  console.log(`✓ SEA Blob injected successfully into ${targetBinaryPath}`);

  // 7. Calculate SHA-256 hash and update checksum file
  console.log('\n[Step 6/6] Calculating SHA-256 checksum...');
  const binBuffer = fs.readFileSync(targetBinaryPath);
  const hash = crypto.createHash('sha256').update(binBuffer).digest('hex');
  const binFileName = path.basename(targetBinaryPath);
  const sha256Line = `${hash}  ${binFileName}\n`;

  let existingChecksums = '';
  if (fs.existsSync(sha256Path)) {
    existingChecksums = fs.readFileSync(sha256Path, 'utf8').replace(new RegExp(`.*${binFileName}\\n?`, 'g'), '');
  }
  fs.writeFileSync(sha256Path, existingChecksums + sha256Line);

  const stats = fs.statSync(targetBinaryPath);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

  console.log('\n====================================================');
  console.log('   🎉 macOS EXECUTABLE BUILD SUCCESSFUL!');
  console.log('====================================================');
  console.log(` Executable Path : ${targetBinaryPath}`);
  console.log(` Executable Size : ${sizeMB} MB`);
  console.log(` SHA-256 Checksum: ${hash}`);
  console.log(` Checksum File   : ${sha256Path}`);
  console.log('====================================================\n');
}

buildMacOSExecutable().catch((err) => {
  console.error('\n[Fatal Error] macOS executable build failed:', err);
  process.exit(1);
});
