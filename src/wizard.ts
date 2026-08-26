import readline from 'readline';
import { execSync } from 'child_process';
import fs from 'fs';

function createPrompt() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (question: string, defaultValue: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(`${question} [Default: ${defaultValue}]: `, (answer) => {
        const trimmed = answer.trim();
        resolve(trimmed.length > 0 ? trimmed : defaultValue);
      });
    });
  };

  const close = () => rl.close();

  return { ask, close };
}

async function runWizard() {
  console.log('\n====================================================');
  console.log('   🚀 WhatsApp Contact Exporter - Setup Wizard');
  console.log('====================================================\n');

  const { ask, close } = createPrompt();

  // Stage 1: Extraction & Connection Preferences
  console.log('--- STAGE 1: SCANNING PREFERENCES ---');
  const country = await ask('1. Default 2-letter Country Code (e.g. PK, US, GB, IN)', 'PK');
  const includeGroupsInput = await ask('2. Include Group Chat participants? (y/n)', 'n');
  const formatsInput = await ask('3. Export formats (csv, vcf, or both)', 'both');
  const outputDir = await ask('4. Output directory path', './exports');

  // Stage 2: Name Customization Menu
  console.log('\n====================================================');
  console.log('  ⚙️  STAGE 2: CONTACT NAME CUSTOMIZATION MENU');
  console.log('====================================================');
  console.log('Select Name Format Style:');
  console.log('  [1] Pushname if available (Fallback: Full Phone Number)  (e.g., "Alex" or "+923001234567")');
  console.log('  [2] Full Phone Number                                    (e.g., "+923001234567")');
  console.log('  [3] Last 4 Digits of Phone Number                        (e.g., "4567")');
  console.log('  [4] Incremental Counter                                  (e.g., "001", "002", "003")');

  const styleChoiceInput = await ask('Select Style (1-4)', '1');
  const prefixInput = await ask('Custom Prefix (Leave empty for default "WA Unsaved - ", or enter custom e.g., "Client - ")', 'WA Unsaved - ');
  const suffixInput = await ask('Custom Suffix (Leave empty for none, or enter e.g., " - Aug 2026")', '');

  let style = 'pushname';
  let counterStart = '1';
  let padDigits = '3';

  if (styleChoiceInput === '2') {
    style = 'number';
  } else if (styleChoiceInput === '3') {
    style = 'last4';
  } else if (styleChoiceInput === '4') {
    style = 'counter';
    counterStart = await ask('Starting number for counter', '1');
    padDigits = await ask('Digits for zero-padding (e.g., 3 -> 001, 002)', '3');
  }

  close();

  console.log('\n----------------------------------------------------');
  console.log(' Preparing environment...');

  if (!fs.existsSync('./dist/cli.js')) {
    console.log(' Building project TypeScript files...');
    execSync('npm run build', { stdio: 'inherit' });
  }

  const includeGroups = includeGroupsInput.toLowerCase() === 'y';

  let formatArgs: string[] = ['csv', 'vcf'];
  if (formatsInput.toLowerCase() === 'csv') {
    formatArgs = ['csv'];
  } else if (formatsInput.toLowerCase() === 'vcf') {
    formatArgs = ['vcf'];
  }

  const args: string[] = [
    './dist/cli.js',
    '-c', country.toUpperCase(),
    '-o', outputDir,
    '-f', ...formatArgs,
    '--name-style', style,
    '--prefix', `"${prefixInput}"`,
  ];

  if (suffixInput.length > 0) {
    args.push('--suffix', `"${suffixInput}"`);
  }

  if (style === 'counter') {
    args.push('--counter-start', counterStart, '--pad-digits', padDigits);
  }

  if (!includeGroups) {
    args.push('--no-groups');
  }

  console.log('\n====================================================');
  console.log('   📱 Launching WhatsApp Web Client (Headless)');
  console.log('   If this is your first run, a QR code will appear.');
  console.log('   Open WhatsApp on your phone -> Settings -> Linked Devices');
  console.log('====================================================\n');

  execSync(`node ${args.join(' ')}`, { stdio: 'inherit' });
}

runWizard().catch((err) => {
  console.error('\n[Error] Wizard execution failed:', err);
  process.exit(1);
});
