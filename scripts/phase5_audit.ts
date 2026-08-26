import { createWhatsAppClient } from '../src/auth.js';
import { scanWhatsAppChats } from '../src/scanner.js';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

async function runPhase5Audit() {
  const client = createWhatsAppClient({ headless: true });

  client.on('ready', async () => {
    try {
      const scanResults = await scanWhatsAppChats(client, true, 3000, { onLog: () => {} });
      const unsavedContacts = scanResults.contacts.filter((c) => c.status === 'UNSAVED');

      const auditRows: any[] = [];

      for (const scanned of unsavedContacts) {
        const rawId = scanned.id;
        const phoneCandidate = scanned.number || '';
        const digitsOnly = phoneCandidate.replace(/\D/g, '');
        const withPlus = `+${digitsOnly}`;

        const intlParsed = parsePhoneNumberFromString(withPlus, 'PK');
        const localParsed = parsePhoneNumberFromString(digitsOnly, 'PK');
        const parsed = intlParsed && intlParsed.isValid() ? intlParsed : (localParsed && localParsed.isValid() ? localParsed : intlParsed || localParsed);

        const isPossible = parsed ? parsed.isPossible() : false;
        const isValid = parsed ? parsed.isValid() : false;
        const country = parsed?.country || 'UNKNOWN';
        const e164 = parsed && isValid ? parsed.format('E.164') : 'N/A';

        let confidence = 'HIGH';
        if (!isValid && isPossible) {
          confidence = 'MEDIUM (Ambiguous)';
        } else if (!isPossible) {
          confidence = 'LOW (Suspicious token)';
        }

        auditRows.push({
          jid: rawId,
          rawIdentity: phoneCandidate,
          e164,
          isPossible,
          isValid,
          country,
          resolutionMethod: scanned.resolutionMethod || 'JID_PREFIX',
          confidence,
        });
      }

      console.log(JSON.stringify(auditRows, null, 2));

      await client.destroy();
      process.exit(0);
    } catch (err) {
      console.error('Phase 5 audit failed:', err);
      await client.destroy();
      process.exit(1);
    }
  });

  await client.initialize();
}

runPhase5Audit();
