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
 * Designed with simple defaults so non-tech users can simply press [Enter] to proceed.
 */
export async function promptWizardOptions(): Promise<ExporterOptions> {
  console.log('\n================================================================');
  console.log('   🟢 WHATSAPP CONTACT EXPORTER - EASY SETUP WIZARD');
  console.log('================================================================');
  console.log('💡 Tip: You can press [Enter] on each question to use the default!\n');

  const { ask, close } = createPrompt();

  // Stage 1: Basic Preferences
  console.log('--- 📋 STEP 1: EXPORT PREFERENCES ---');
  const countryInput = await ask(
    '1. Your Country Code (e.g. PK for Pakistan, US for USA, GB for UK, IN for India)',
    'PK'
  );

  const includeGroupsInput = await ask(
    '2. Include members from WhatsApp Group Chats? (y = Yes, n = No / DMs only)',
    'n'
  );

  console.log('\n3. What format would you like your contacts exported in?');
  console.log('   [1] Both CSV (Excel / Google Contacts) & VCF (Phone contacts) [Recommended]');
  console.log('   [2] CSV only (for Excel / Google Sheets)');
  console.log('   [3] VCF only (for direct import into iPhone / Android)');
  const formatChoice = await ask('   Choose format (1, 2, or 3)', '1');

  let formats: ('csv' | 'vcf')[] = ['csv', 'vcf'];
  if (formatChoice === '2') {
    formats = ['csv'];
  } else if (formatChoice === '3') {
    formats = ['vcf'];
  }

  const defaultExportPath = path.resolve('./exports');
  const outputDirInput = await ask(
    `\n4. Folder to save exported files [Default: ${defaultExportPath}]`,
    defaultExportPath
  );

  // Stage 2: Name Customization Menu
  console.log('\n================================================================');
  console.log('  🏷️  STEP 2: CONTACT NAME CUSTOMIZATION');
  console.log('================================================================');
  console.log('How would you like unsaved contacts to be named in your address book?');
  console.log('  [1] Real Name if available, otherwise Phone Number (e.g., "WA Unsaved - Alex") [Recommended]');
  console.log('  [2] Full Phone Number (e.g., "WA Unsaved - +923001234567")');
  console.log('  [3] Last 4 Digits of Phone Number (e.g., "WA Unsaved - 4567")');
  console.log('  [4] Sequential Counter (e.g., "Client - 001", "Client - 002")');

  const styleChoiceInput = await ask('Choose naming style (1-4)', '1');
  const prefixInput = await ask(
    'Name Prefix in front of every contact (or enter custom e.g. "Lead ")',
    'WA Unsaved - '
  );
  const suffixInput = await ask('Name Suffix at the end (or press Enter for none)', '');

  let styleChoice: NameStyleOption = 'pushname_or_number';
  let counterStart = 1;
  let padDigits = 3;

  if (styleChoiceInput === '2') {
    styleChoice = 'full_number';
  } else if (styleChoiceInput === '3') {
    styleChoice = 'last4';
  } else if (styleChoiceInput === '4') {
    styleChoice = 'counter';
    const counterStartInput = await ask('Starting number for counter (e.g. 1)', '1');
    const padDigitsInput = await ask('Digits for numbering padding (e.g. 3 for 001, 002)', '3');
    counterStart = parseInt(counterStartInput, 10) || 1;
    padDigits = parseInt(padDigitsInput, 10) || 3;
  }

  close();

  const includeGroups = includeGroupsInput.toLowerCase().startsWith('y');

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
  await runExportPipeline(options);
}

if (process.argv[1] && process.argv[1].endsWith('wizard.ts')) {
  runWizard().catch((err) => {
    console.error('\n[Error] Wizard execution failed:', err);
    process.exit(1);
  });
}
