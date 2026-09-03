import readline from 'readline';
import path from 'path';
import { ExporterOptions, NamingCustomizationOptions, NameStyleOption } from './types.js';
import { runExportPipeline } from './cli.js';

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

/**
 * Prompts the user interactively through all export configuration preferences.
 */
export async function promptWizardOptions(): Promise<ExporterOptions> {
  console.log('\n====================================================');
  console.log('   🚀 WhatsApp Contact Exporter - Setup Wizard');
  console.log('====================================================\n');

  const { ask, close } = createPrompt();

  // Stage 1: Extraction & Connection Preferences
  console.log('--- STAGE 1: SCANNING PREFERENCES ---');
  const countryInput = await ask('1. Default 2-letter Country Code (e.g. PK, US, GB, IN)', 'PK');
  const includeGroupsInput = await ask('2. Include Group Chat participants? (y/n)', 'n');
  const formatsInput = await ask('3. Export formats (csv, vcf, or both)', 'both');
  const outputDirInput = await ask('4. Output directory path', './exports');

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

  let styleChoice: NameStyleOption = 'pushname_or_number';
  let counterStart = 1;
  let padDigits = 3;

  if (styleChoiceInput === '2') {
    styleChoice = 'full_number';
  } else if (styleChoiceInput === '3') {
    styleChoice = 'last4';
  } else if (styleChoiceInput === '4') {
    styleChoice = 'counter';
    const counterStartInput = await ask('Starting number for counter', '1');
    const padDigitsInput = await ask('Digits for zero-padding (e.g., 3 -> 001, 002)', '3');
    counterStart = parseInt(counterStartInput, 10) || 1;
    padDigits = parseInt(padDigitsInput, 10) || 3;
  }

  close();

  const includeGroups = includeGroupsInput.toLowerCase().startsWith('y');
  let formats: ('csv' | 'vcf')[] = ['csv', 'vcf'];
  if (formatsInput.toLowerCase() === 'csv') {
    formats = ['csv'];
  } else if (formatsInput.toLowerCase() === 'vcf') {
    formats = ['vcf'];
  }

  const namingOptions: NamingCustomizationOptions = {
    prefix: prefixInput,
    suffix: suffixInput.length > 0 ? suffixInput : undefined,
    nameStyle: styleChoice,
    startCounter: counterStart,
    padDigits: padDigits,
  };

  return {
    country: countryInput.toUpperCase(),
    format: formats,
    outputDir: path.resolve(outputDirInput),
    includeGroups,
    headless: true,
    syncWaitMs: 3000,
    naming: namingOptions,
  };
}

export async function runWizard(): Promise<void> {
  const options = await promptWizardOptions();
  console.log('\n====================================================');
  console.log('   📱 Launching WhatsApp Web Client (Headless)');
  console.log('   If this is your first run, a QR code will appear.');
  console.log('   Open WhatsApp on your phone -> Settings -> Linked Devices');
  console.log('====================================================\n');
  await runExportPipeline(options);
}

if (process.argv[1] && process.argv[1].endsWith('wizard.ts')) {
  runWizard().catch((err) => {
    console.error('\n[Error] Wizard execution failed:', err);
    process.exit(1);
  });
}
