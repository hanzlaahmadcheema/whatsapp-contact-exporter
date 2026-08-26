import { createWhatsAppClient } from '../src/auth.js';
import { scanWhatsAppChats, isExcludedEntity, resolvePhoneIdentity, classifyContact } from '../src/scanner.js';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import type { Chat, GroupChat, GroupParticipant } from 'whatsapp-web.js';

interface ProvenanceEntry {
  candidateJid: string;
  discoverySource: 'DM_CHAT' | 'GROUP_PARTICIPANT' | 'GET_CONTACTS_FALLBACK';
  sourceChatId: string;
  sourceChatName: string;
  chatType: 'DM' | 'GROUP' | 'STORE';
  resolutionPath: string;
  resolvedPhone: string | null;
  status: string;
}

async function runProvenanceAudit() {
  console.log('====================================================');
  console.log('   🔍 PHASE 6: DISCOVERY PROVENANCE AUDIT');
  console.log('====================================================\n');

  const client = createWhatsAppClient({ headless: true });

  client.on('ready', async () => {
    try {
      console.log('Scanning WhatsApp session chats...');
      const provenanceEntries: ProvenanceEntry[] = [];

      // 1. Trace Chats from client.getChats()
      let chats: Chat[] = [];
      try {
        chats = await client.getChats();
      } catch {
        // Fallback DOM extraction if getChats fails
      }

      if (chats && chats.length > 0) {
        for (const chat of chats) {
          const rawId = chat.id?._serialized || '';
          if (isExcludedEntity(rawId)) continue;

          if (!chat.isGroup) {
            // Direct DM Chat
            const contactObj = await client.getContactById(rawId).catch(() => null);
            const identity = await resolvePhoneIdentity(client, rawId, contactObj);
            const classification = contactObj ? classifyContact(contactObj) : { status: 'UNCERTAIN' };

            provenanceEntries.push({
              candidateJid: rawId,
              discoverySource: 'DM_CHAT',
              sourceChatId: rawId,
              sourceChatName: chat.name || rawId,
              chatType: 'DM',
              resolutionPath: identity.method,
              resolvedPhone: identity.phoneCandidate,
              status: classification.status,
            });
          } else {
            // Group Chat
            const groupChat = chat as GroupChat;
            const participants: GroupParticipant[] = groupChat.participants || [];
            for (const p of participants) {
              const pId = p.id?._serialized || '';
              if (isExcludedEntity(pId)) continue;

              const contactObj = await client.getContactById(pId).catch(() => null);
              const identity = await resolvePhoneIdentity(client, pId, contactObj);
              const classification = contactObj ? classifyContact(contactObj) : { status: 'UNCERTAIN' };

              provenanceEntries.push({
                candidateJid: pId,
                discoverySource: 'GROUP_PARTICIPANT',
                sourceChatId: rawId,
                sourceChatName: chat.name || 'Group',
                chatType: 'GROUP',
                resolutionPath: identity.method,
                resolvedPhone: identity.phoneCandidate,
                status: classification.status,
              });
            }
          }
        }
      }

      // 2. Trace GET_CONTACTS_FALLBACK entries
      const storeContacts = await client.getContacts().catch(() => []);
      for (const sc of storeContacts) {
        if (!sc || !sc.id || !sc.id._serialized) continue;
        const sId = sc.id._serialized;
        if (isExcludedEntity(sId) || sc.isGroup) continue;

        const identity = await resolvePhoneIdentity(client, sId, sc);
        const classification = classifyContact(sc);

        // Check if already discovered via active chats
        const existsInChats = provenanceEntries.some((pe) => pe.candidateJid === sId);
        if (!existsInChats) {
          provenanceEntries.push({
            candidateJid: sId,
            discoverySource: 'GET_CONTACTS_FALLBACK',
            sourceChatId: 'STORE_ONLY',
            sourceChatName: sc.name || sId,
            chatType: 'STORE',
            resolutionPath: identity.method,
            resolvedPhone: identity.phoneCandidate,
            status: classification.status,
          });
        }
      }

      // Filter only UNSAVED entries for the provenance report
      const unsavedProvenance = provenanceEntries.filter((pe) => pe.status === 'UNSAVED');

      console.log(`Discovered ${unsavedProvenance.length} UNSAVED candidate provenance entries:\n`);
      console.log(JSON.stringify(unsavedProvenance, null, 2));

      await client.destroy();
      process.exit(0);
    } catch (err) {
      console.error('Provenance audit failed:', err);
      await client.destroy();
      process.exit(1);
    }
  });

  await client.initialize();
}

runProvenanceAudit();
