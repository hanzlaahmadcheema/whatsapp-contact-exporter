#!/usr/bin/env node

import { Command } from 'commander';
import path from 'path';
import { createWhatsAppClient } from './auth.js';
import { scanWhatsAppChats } from './scanner.js';
import { normalizeContacts } from './normalizer.js';
import { exportContacts } from './exporter.js';
import { performHealthCheck } from './health.js';
import { ExportSummary, ExporterOptions, NamingCustomizationOptions, NameStyleOption } from './types.js';
import { promptWizardOptions } from './wizard.js';

export async function runExportPipeline(options: ExporterOptions): Promise<void> {
  console.log('====================================================');
  console.log('         WhatsApp Contact Exporter CLI             ');
  console.log('====================================================');
  console.log(`• Default Country : ${options.country}`);
  console.log(`• Export Formats  : ${options.format.join(', ')}`);
  console.log(`• Output Directory: ${options.outputDir}`);
  console.log(`• Include Groups  : ${options.includeGroups ? 'Yes' : 'No'}`);
  console.log(`• Headless Mode   : ${options.headless ? 'Yes' : 'No'}`);
  if (options.naming) {
    console.log(`• Name Style      : ${options.naming.nameStyle}`);
    if (options.naming.prefix) console.log(`• Prefix          : "${options.naming.prefix}"`);
    if (options.naming.suffix) console.log(`• Suffix          : "${options.naming.suffix}"`);
  }
  console.log('----------------------------------------------------');

  const client = createWhatsAppClient({
    headless: options.headless,
    onLog: (msg) => console.log(msg),
  });

  client.on('ready', async () => {
    try {
      await performHealthCheck(client, (msg) => console.log(msg));

      console.log('[Progress] Starting WhatsApp chat scanning...');

      const scanResults = await scanWhatsAppChats(client, options.includeGroups, options.syncWaitMs, {
        onProgress: (current, total, name) => {
          process.stdout.write(`\r[Progress] Processing chat ${current}/${total}: ${name.slice(0, 30)}...   `);
        },
        onLog: (msg) => console.log(`\n${msg}`),
      });

      console.log('\n\n[Progress] Scan complete. Normalizing phone numbers...');

      const normalization = normalizeContacts(scanResults.contacts, options.country, options.naming);

      console.log('[Progress] Exporting contact files...');

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

      console.log('\n[Done] Process completed successfully. Closing session...');
      await client.destroy();
      process.exit(0);
    } catch (err) {
      console.error('\n[Fatal Error] An unexpected error occurred during execution:', err);
      await client.destroy();
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
      console.error('[Fatal Error] Failed to initialize WhatsApp Web client:', err);
      process.exit(1);
    }
  }
}

function printSummary(summary: ExportSummary): void {
  console.log('\n====================================================');
  console.log('              FINAL SCAN & EXPORT SUMMARY           ');
  console.log('====================================================');
  console.log(` Total Chats Scanned        : ${summary.totalChatsScanned}`);
  console.log(`   ├─ DM Candidates         : ${summary.dmCandidatesCount}`);
  console.log(`   └─ Group Candidates      : ${summary.groupCandidatesCount}`);
  console.log(` Total Contacts Discovered  : ${summary.totalContactsDiscovered}`);
  console.log(`   ├─ SAVED Contacts        : ${summary.savedContactsCount}`);
  console.log(`   ├─ UNSAVED Contacts      : ${summary.unsavedContactsCount}`);
  console.log(`   ├─ UNCERTAIN Status      : ${summary.uncertainContactsCount}`);
  console.log(`   └─ UNRESOLVED Identities : ${summary.unresolvedContactsCount}`);
  console.log(` Store-Only Candidates      : Detected: ${summary.storeOnlyDetectedCount} | Rejected: ${summary.storeOnlyRejectedCount}`);
  console.log(` Invalid Phone Numbers      : ${summary.invalidNumbersCount}`);
  console.log(` Deduplicated Unique Exports: ${summary.deduplicatedExportCount}`);
  console.log('----------------------------------------------------');
  console.log(' Exported Files:');
  for (const filePath of summary.exportedFiles) {
    console.log(`   • ${filePath}`);
  }
  console.log('====================================================\n');
}

async function main() {
  const args = process.argv.slice(2);

  // If launched with no arguments or explicitly with --wizard / -i, run interactive setup wizard
  if (args.length === 0 || args.includes('--wizard') || args.includes('-i') || args.includes('--interactive')) {
    const options = await promptWizardOptions();
    await runExportPipeline(options);
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

main().catch((err) => {
  console.error('\n[Fatal Error]:', err);
  process.exit(1);
});
