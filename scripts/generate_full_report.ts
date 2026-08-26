import { createWhatsAppClient } from '../src/auth.js';
import { scanWhatsAppChats } from '../src/scanner.js';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

async function generateReport() {
  const client = createWhatsAppClient({ headless: true });

  client.on('ready', async () => {
    try {
      const scanResults = await scanWhatsAppChats(client, true, 3000, { onLog: () => {} });
      const unsavedContacts = scanResults.contacts.filter((c) => c.status === 'UNSAVED');

      const rawContacts = await client.getContacts();
      const rawMap = new Map<string, any>();
      for (const rc of rawContacts) {
        if (rc && rc.id && rc.id._serialized) {
          rawMap.set(rc.id._serialized, rc);
        }
      }

      const e164Seen = new Map<string, string>();
      const tableRows: any[] = [];

      for (let i = 0; i < unsavedContacts.length; i++) {
        const c = unsavedContacts[i];
        const rawObj = rawMap.get(c.id);

        const isMyContact = rawObj ? rawObj.isMyContact : false;
        const isAddressBookContact = rawObj ? (rawObj as any).isAddressBookContact : false;
        const name = c.formattedName || rawObj?.name || null;
        const pushname = c.pushname || rawObj?.pushname || null;

        // Try extracting number from JID if c.number looks like LID
        const rawNum = c.number;
        let e164: string | null = null;
        let isValid = false;

        if (rawNum) {
          const cleanDigits = rawNum.startsWith('+') ? '+' + rawNum.replace(/\D/g, '') : rawNum.replace(/\D/g, '');
          const parsed = parsePhoneNumberFromString(cleanDigits, 'PK') || parsePhoneNumberFromString(`+${cleanDigits}`, 'PK');
          if (parsed && parsed.isValid()) {
            e164 = parsed.format('E.164');
            isValid = true;
          }
        }

        let isDeduplicated = false;
        let finalDecision = 'EXPORTED';
        let exclusionReason: string | null = null;

        if (!isValid) {
          finalDecision = 'EXCLUDED';
          exclusionReason = `Invalid phone number format (${rawNum || 'No number'}). Internal LID sequence returned instead of phone number.`;
        } else if (e164 && e164Seen.has(e164)) {
          isDeduplicated = true;
          finalDecision = 'EXCLUDED';
          exclusionReason = `Duplicate E.164 number (${e164}) already exported from primary entry ${e164Seen.get(e164)}`;
        } else if (e164) {
          e164Seen.set(e164, c.id);
        }

        tableRows.push({
          index: i + 1,
          jid: c.id,
          rawNumber: rawNum,
          e164Number: e164 || 'N/A',
          isMyContact: isMyContact ?? false,
          isAddressBookContact: isAddressBookContact ?? false,
          name: name || 'None',
          pushname: pushname || 'None',
          sources: c.chatName,
          isDeduplicated: isDeduplicated ? 'Yes' : 'No',
          finalDecision,
          exclusionReason: exclusionReason || 'N/A',
        });
      }

      console.log(JSON.stringify(tableRows, null, 2));

      await client.destroy();
      process.exit(0);
    } catch (err) {
      console.error('Failed to generate full report:', err);
      await client.destroy();
      process.exit(1);
    }
  });

  await client.initialize();
}

generateReport();
