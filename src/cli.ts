#!/usr/bin/env node

// Suppress internal Node.js runtime deprecation warnings (e.g. DEP0040 punycode, DEP0169 url.parse) for clean terminal UI
process.env.NODE_NO_WARNINGS = '1';
process.removeAllListeners('warning');
process.on('warning', () => {});
process.emitWarning = () => {};

import { Command } from 'commander';
import path from 'path';
import readline from 'readline';
import { exec } from 'child_process';
import { createWhatsAppClient } from './auth.js';
import { scanWhatsAppChats } from './scanner.js';
import { normalizeContacts } from './normalizer.js';
import { exportContacts } from './exporter.js';
import { performHealthCheck } from './health.js';
import { ExportSummary, ExporterOptions, NamingCustomizationOptions, NameStyleOption } from './types.js';
import { runMainMenu } from './wizard.js';

export function openFolderInExplorer(folderPath: string): void {
  try {
    if (process.platform === 'win32') {
      exec(`explorer.exe "${folderPath}"`);
    } else if (process.platform === 'darwin') {
      exec(`open "${folderPath}"`);
    } else {
      exec(`xdg-open "${folderPath}"`);
    }
  } catch {
    // Non-fatal
  }
}

export async function pauseForUserExit(): Promise<void> {
  if (process.stdin.isTTY) {
    console.log('\n----------------------------------------------------------------');
    console.log(' ✨ Press [ENTER] to exit...');
    await new Promise<void>((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      rl.question('', () => {
        rl.close();
        resolve();
      });
    });
  }
}

export async function runExportPipeline(options: ExporterOptions): Promise<void> {
  console.log('================================================================');
  console.log('         🟢 WHATSAPP CONTACT EXPORTER PIPELINE');
  console.log('================================================================');
  console.log(`• Default Country : ${options.country}`);
  console.log(`• Export Formats  : ${options.format.join(', ')}`);
  console.log(`• Output Folder   : ${options.outputDir}`);
  console.log(`• Include Groups  : ${options.includeGroups ? 'Yes' : 'No'}`);
  if (options.naming) {
    console.log(`• Name Style      : ${options.naming.nameStyle}`);
    if (options.naming.prefix) console.log(`• Prefix          : "${options.naming.prefix}"`);
    if (options.naming.suffix) console.log(`• Suffix          : "${options.naming.suffix}"`);
  }
  console.log('----------------------------------------------------------------');

  const client = createWhatsAppClient({
    headless: options.headless,
    onLog: (msg) => console.log(msg),
  });

  client.on('ready', async () => {
    try {
      await performHealthCheck(client, (msg) => console.log(msg));

      console.log('\n🔍 [Progress] Scanning WhatsApp active chats...');

      const scanResults = await scanWhatsAppChats(client, options.includeGroups, options.syncWaitMs, {
        onProgress: (current, total, name) => {
          process.stdout.write(`\r[Progress] Processing chat ${current}/${total}: ${name.slice(0, 30)}...   `);
        },
        onLog: (msg) => console.log(`\n${msg}`),
      });

      console.log('\n\n⚙️ [Progress] Normalizing & validating phone numbers...');

      const normalization = normalizeContacts(scanResults.contacts, options.country, options.naming);

      console.log('💾 [Progress] Writing contact files to disk...');

      const exportResult = await exportContacts(normalization.normalized, options.outputDir, options.format);

      const exportedFiles: string[] = [];
      if (exportResult.csvPath) exportedFiles.push(exportResult.csvPath);
      if (exportResult.vcfPath) exportedFiles.push(exportResult.vcfPath);

      const totalUniqueExported = normalization.normalized.length;

      const summary: ExportSummary = {
        totalChatsScanned: scanResults.totalChatsScanned,
        totalContactsDiscovered: scanResults.contacts.length,
        dmCandidatesCount: scanResults.dmCandidatesCount,
        groupCandidatesCount: scanResults.groupCandidatesCount,
        savedContactsCount: scanResults.savedCount,
        unsavedContactsCount: scanResults.unsavedCount,
        uncertainContactsCount: scanResults.uncertainCount,
        unresolvedContactsCount: scanResults.unresolvedCount,
        storeOnlyDetectedCount: scanResults.storeOnlyDetectedCount,
        storeOnlyRejectedCount: scanResults.storeOnlyRejectedCount,
        invalidNumbersCount: normalization.invalidNumbers.length,
        deduplicatedExportCount: totalUniqueExported,
        exportedFiles,
      };

      printSummary(summary);

      // Open export folder in File Explorer for easy access
      console.log('📂 Opening exports folder in File Explorer...');
      openFolderInExplorer(options.outputDir);

      console.log('\n[Done] Process completed successfully.');
      await client.destroy().catch(() => {});
      await pauseForUserExit();
      process.exit(0);
    } catch (err) {
      console.error('\n❌ [Error] An error occurred during export:', err instanceof Error ? err.message : err);
      console.log('💡 Tip: Make sure WhatsApp on your phone is connected to the internet and try again.');
      await client.destroy().catch(() => {});
      await pauseForUserExit();
      process.exit(1);
    }
  });

  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await client.initialize();
      break;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      await client.destroy().catch(() => {});
      if (
        attempt < maxRetries &&
        (errorMsg.includes('Execution context was destroyed') || errorMsg.includes('auth timeout'))
      ) {
        console.log(`[Auth Info] Page reload detected during startup. Re-attaching (${attempt}/${maxRetries})...`);
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      console.error('❌ [Fatal Error] Failed to connect to WhatsApp Web:', err instanceof Error ? err.message : err);
      console.log('💡 Tip: Ensure Chrome or Edge is installed and you have an active internet connection.');
      await pauseForUserExit();
      process.exit(1);
    }
  }
}

function printSummary(summary: ExportSummary): void {
  console.log('\n================================================================');
  console.log('              🎉 SCAN & EXPORT COMPLETE');
  console.log('================================================================');
  console.log(` Total Chats Scanned        : ${summary.totalChatsScanned}`);
  console.log(`   ├─ DM Chats              : ${summary.dmCandidatesCount}`);
  console.log(`   └─ Group Chats           : ${summary.groupCandidatesCount}`);
  console.log(` Total Contacts Discovered  : ${summary.totalContactsDiscovered}`);
  console.log(`   ├─ Already Saved Contacts: ${summary.savedContactsCount}`);
  console.log(`   └─ Unsaved Contacts Found: ${summary.unsavedContactsCount}`);
  console.log(` Deduplicated Unique Exports: ${summary.deduplicatedExportCount}`);
  console.log('----------------------------------------------------------------');
  console.log(' 📁 Exported Files Ready For Import:');
  for (const filePath of summary.exportedFiles) {
    console.log(`   • ${filePath}`);
  }
  console.log('================================================================\n');
}

async function main() {
  const args = process.argv.slice(2);

  // If launched with no arguments or explicitly with --wizard / -i, run interactive Main Menu
  if (args.length === 0 || args.includes('--wizard') || args.includes('-i') || args.includes('--interactive')) {
    await runMainMenu();
    return;
  }

  const program = new Command();

  program
    .name('whatsapp-contact-exporter')
    .description('Extract and normalize unsaved contacts from WhatsApp Web into CSV and VCF formats')
    .version('1.0.0')
    .option('-i, --interactive, --wizard', 'Run interactive setup wizard')
    .option('-c, --country <countryCode>', 'Default 2-letter ISO country code for phone number parsing', 'PK')
    .option('-f, --format <formats...>', 'Export format(s): csv, vcf', ['csv', 'vcf'])
    .option('-o, --output <dirPath>', 'Output directory for exported files', './exports')
    .option('--no-groups', 'Skip scanning participants in group chats')
    .option('--no-headless', 'Run Chrome browser in visible (non-headless) mode')
    .option('--sync-wait <ms>', 'Milliseconds to wait for contact hydration on launch', '3000')
    .option('--prefix <prefix>', 'Custom prefix for exported contact names')
    .option('--suffix <suffix>', 'Custom suffix for exported contact names')
    .option('--name-style <style>', 'Name generation style: pushname, number, last4, counter', 'pushname')
    .option('--counter-start <number>', 'Starting counter for counter style', '1')
    .option('--pad-digits <number>', 'Zero-padding digits for counter style', '3')
    .action(async (options) => {
      const country = options.country.toUpperCase();
      const formats = (Array.isArray(options.format) ? options.format : [options.format]).map((f: string) =>
        f.toLowerCase()
      ) as ('csv' | 'vcf')[];
      const outputDir = path.resolve(options.output);
      const includeGroups = options.groups !== false;
      const headless = options.headless !== false;
      const syncWaitMs = parseInt(options.syncWait, 10) || 3000;

      let styleChoice: NameStyleOption = 'pushname_or_number';
      if (options.nameStyle === 'number') styleChoice = 'full_number';
      else if (options.nameStyle === 'last4') styleChoice = 'last4';
      else if (options.nameStyle === 'counter') styleChoice = 'counter';

      const namingOptions: NamingCustomizationOptions = {
        prefix: options.prefix,
        suffix: options.suffix,
        nameStyle: styleChoice,
        startCounter: parseInt(options.counterStart, 10) || 1,
        padDigits: parseInt(options.padDigits, 10) || 3,
      };

      await runExportPipeline({
        country,
        format: formats,
        outputDir,
        includeGroups,
        headless,
        syncWaitMs,
        naming: namingOptions,
      });
    });

  program.parse(process.argv);
}

main().catch(async (err) => {
  console.error('\n❌ [Fatal Error]:', err instanceof Error ? err.message : err);
  await pauseForUserExit();
  process.exit(1);
});
