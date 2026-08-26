import { createWhatsAppClient } from '../src/auth.js';
import { scanWhatsAppChats } from '../src/scanner.js';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

async function runAuditReport() {
  console.log('====================================================');
  console.log('   🔍 DETAILED AUDIT REPORT: 20 UNSAVED CONTACTS    ');
  console.log('====================================================\n');

  const client = createWhatsAppClient({ headless: true });

  client.on('ready', async () => {
    try {
      console.log('Scanning WhatsApp session...');
      const scanResults = await scanWhatsAppChats(client, true, 3000, {
        onLog: () => {},
      });

      const unsavedContacts = scanResults.contacts.filter((c) => c.status === 'UNSAVED');
      console.log(`Found ${unsavedContacts.length} contacts classified as UNSAVED.\n`);

      const e164Seen = new Set<string>();
      const reportItems: any[] = [];

      for (const contact of unsavedContacts) {
        const rawNumber = contact.number;
        let e164Number: string | null = null;
        let isValid = false;

        if (rawNumber) {
          const cleanDigits = rawNumber.startsWith('+') ? '+' + rawNumber.replace(/\D/g, '') : rawNumber.replace(/\D/g, '');
          const parsed = parsePhoneNumberFromString(cleanDigits, 'PK') || parsePhoneNumberFromString(`+${cleanDigits}`, 'PK');
          if (parsed && parsed.isValid()) {
            e164Number = parsed.format('E.164');
            isValid = true;
          }
        }

        let isDeduplicated = false;
        let finalDecision = 'EXPORTED';
        let exclusionReason: string | null = null;

        if (!isValid) {
          finalDecision = 'EXCLUDED';
          exclusionReason = `Invalid phone number format (${rawNumber || 'No number'})`;
        } else if (e164Number && e164Seen.has(e164Number)) {
          isDeduplicated = true;
          finalDecision = 'EXCLUDED';
          exclusionReason = `Duplicate E.164 number (${e164Number}) merged into primary entry`;
        } else if (e164Number) {
          e164Seen.add(e164Number);
        }

        reportItems.push({
          id: contact.id,
          rawNumber,
          e164Number,
          pushname: contact.pushname,
          formattedName: contact.formattedName,
          source: contact.chatName,
          status: contact.status,
          isValid,
          isDeduplicated,
          finalDecision,
          exclusionReason,
        });
      }

      console.log(JSON.stringify(reportItems, null, 2));

      await client.destroy();
      process.exit(0);
    } catch (err) {
      console.error('Audit report failed:', err);
      await client.destroy();
      process.exit(1);
    }
  });

  await client.initialize();
}

runAuditReport();
