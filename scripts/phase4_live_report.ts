import { createWhatsAppClient } from '../src/auth.js';
import { scanWhatsAppChats } from '../src/scanner.js';
import { normalizeContacts } from '../src/normalizer.js';
import { exportContacts } from '../src/exporter.js';

async function runPhase4Report() {
  console.log('====================================================');
  console.log('   🚀 PHASE 4: LIVE ACCOUNT IDENTITY RESOLUTION');
  console.log('====================================================\n');

  const client = createWhatsAppClient({ headless: true });

  client.on('ready', async () => {
    try {
      console.log('Scanning WhatsApp session...');
      const scanResults = await scanWhatsAppChats(client, true, 3000, { onLog: () => {} });
      const normalization = normalizeContacts(scanResults.contacts, 'PK');
      const exportResult = await exportContacts(normalization.normalized, './exports');

      const unsavedContacts = scanResults.contacts.filter((c) => c.status === 'UNSAVED');

      let resolvedCount = 0;
      let unresolvedCount = 0;
      let invalidCount = normalization.invalidNumbers.length;

      const resolutionDetails: any[] = [];

      for (const c of unsavedContacts) {
        if (c.number) {
          resolvedCount++;
        } else {
          unresolvedCount++;
        }

        resolutionDetails.push({
          jid: c.id,
          phoneCandidate: c.number || 'N/A',
          resolutionMethod: c.resolutionMethod || 'NONE',
          status: c.status,
          note: c.resolutionNote || 'N/A',
        });
      }

      console.log('\n====================================================');
      console.log('            PHASE 4 METRICS REPORT                  ');
      console.log('====================================================');
      console.log(` Total UNSAVED Discovered    : ${scanResults.unsavedCount}`);
      console.log(` Successfully Resolved       : ${resolvedCount}`);
      console.log(` Unresolved                  : ${unresolvedCount}`);
      console.log(` Invalid Phone Numbers       : ${invalidCount}`);
      console.log(` Deduplicated Unique Numbers : ${normalization.normalized.length}`);
      console.log('----------------------------------------------------');
      console.log(' Resolution Method for Discovered Contacts:');
      console.log(JSON.stringify(resolutionDetails, null, 2));
      console.log('====================================================\n');

      await client.destroy();
      process.exit(0);
    } catch (err) {
      console.error('Phase 4 report failed:', err);
      await client.destroy();
      process.exit(1);
    }
  });

  await client.initialize();
}

runPhase4Report();
