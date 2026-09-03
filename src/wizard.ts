// Suppress internal Node.js runtime deprecation warnings (e.g. DEP0040 punycode, DEP0169 url.parse)
process.env.NODE_NO_WARNINGS = '1';
process.removeAllListeners('warning');
process.on('warning', () => {});
process.emitWarning = () => {};

import readline from 'readline';
import path from 'path';
import { ExporterOptions, NamingCustomizationOptions, NameStyleOption } from './types.js';
import { clearAuthSession } from './paths.js';
import { runExportPipeline, openFolderInExplorer } from './cli.js';

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
 * Prompts the user through the step-by-step export preferences.
 */
export async function promptExportOptions(): Promise<ExporterOptions> {
  console.log('\n----------------------------------------------------------------');
  console.log('  📋 EXPORT PREFERENCES (Press Enter to keep defaults)');
  console.log('----------------------------------------------------------------');

  const { ask, close } = createPrompt();

  // Stage 1: Basic Preferences
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
  console.log('\n----------------------------------------------------------------');
  console.log('  🏷️  CONTACT NAME CUSTOMIZATION');
  console.log('----------------------------------------------------------------');
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

/**
 * Interactive Main Menu with options to Start Export, Logout/Switch Account, Open Folder, or Exit.
 */
export async function runMainMenu(): Promise<void> {
  while (true) {
    console.log('\n================================================================');
    console.log('   🟢 WHATSAPP CONTACT EXPORTER - MAIN MENU');
    console.log('================================================================');
    console.log('  [1] 🚀 Start Contact Export (Extract unsaved contacts)');
    console.log('  [2] 🔄 Logout & Switch Account (Clear saved WhatsApp login)');
    console.log('  [3] 📂 Open Exports Folder in File Explorer');
    console.log('  [4] ❌ Exit');
    console.log('================================================================');

    const { ask, close } = createPrompt();
    const choice = await ask('Select an option (1-4)', '1');
    close();

    if (choice === '1') {
      const options = await promptExportOptions();
      await runExportPipeline(options);
      break;
    } else if (choice === '2') {
      console.log('\n🔄 Logging out of current session...');
      const success = clearAuthSession();
      if (success) {
        console.log('✓ Successfully logged out!');
        console.log('💡 Next time you export, a new QR code will appear to link your other account.');
      } else {
        console.log('⚠️ No active session found or already logged out.');
      }
    } else if (choice === '3') {
      const defaultExportPath = path.resolve('./exports');
      console.log(`📂 Opening: ${defaultExportPath}`);
      openFolderInExplorer(defaultExportPath);
    } else if (choice === '4' || choice.toLowerCase() === 'exit' || choice.toLowerCase() === 'q') {
      console.log('\n👋 Goodbye!');
      process.exit(0);
    } else {
      console.log('⚠️ Invalid option. Please select 1, 2, 3, or 4.');
    }
  }
}

export async function runWizard(): Promise<void> {
  await runMainMenu();
}

if (process.argv[1] && process.argv[1].endsWith('wizard.ts')) {
  runWizard().catch((err) => {
    console.error('\n[Error] Wizard execution failed:', err);
    process.exit(1);
  });
}
