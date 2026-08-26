import type { Client, Chat, Contact, GroupChat, GroupParticipant } from 'whatsapp-web.js';
import { ScannedContact, ContactClassification, ResolutionMethod, DiscoverySourceType } from './types.js';

export interface ScanCallbacks {
  onProgress?: (scannedChats: number, totalChats: number, currentChatName: string) => void;
  onLog?: (message: string) => void;
}

export interface RawScanResults {
  contacts: ScannedContact[];
  totalChatsScanned: number;
  dmCandidatesCount: number;
  groupCandidatesCount: number;
  savedCount: number;
  unsavedCount: number;
  uncertainCount: number;
  unresolvedCount: number;
  storeOnlyDetectedCount: number;
  storeOnlyRejectedCount: number;
}

export interface IdentityResolutionResult {
  phoneCandidate: string | null;
  method: ResolutionMethod;
  note?: string;
}

/**
 * Entity filter check.
 * Excludes newsletters, broadcasts, and system accounts.
 * Retains business and enterprise user accounts.
 */
export function isExcludedEntity(id: string): boolean {
  if (!id) return true;
  if (id.endsWith('@newsletter')) return true;
  if (id.endsWith('@broadcast')) return true;
  if (id === 'status@broadcast') return true;
  if (id.startsWith('0@c.us') || id.startsWith('1@c.us')) return true;
  return false;
}

/**
 * Robustly resolves the actual telephone number from a WhatsApp JID / LID / Contact object.
 */
export async function resolvePhoneIdentity(
  client: Client,
  rawId: string,
  contactObj: Contact | null
): Promise<IdentityResolutionResult> {
  const isLid = rawId.endsWith('@lid');
  const jidUser = rawId.split('@')[0] || '';

  // 1. Path 1: Check JID Prefix for @c.us IDs (e.g. '923200485780@c.us')
  if (!isLid && /^\d{7,15}$/.test(jidUser)) {
    return {
      phoneCandidate: jidUser,
      method: 'JID_PREFIX',
    };
  }

  // 2. Path 2: Check LID Mapping API (getContactLidAndPhone)
  try {
    const lidMappings = await (client as unknown as {
      getContactLidAndPhone?: (ids: string[]) => Promise<Array<{ lid: string; pn: string }>>;
    }).getContactLidAndPhone?.([rawId]);

    if (lidMappings && lidMappings.length > 0 && lidMappings[0].pn) {
      const resolvedPn = lidMappings[0].pn.replace('@c.us', '').replace(/\D/g, '');
      if (/^\d{7,15}$/.test(resolvedPn)) {
        return {
          phoneCandidate: resolvedPn,
          method: 'LID_MAPPING',
        };
      }
    }
  } catch {
    // Non-fatal
  }

  // 3. Path 3: Check contactObj.number (if available and valid digits)
  if (contactObj?.number) {
    const cleanNum = contactObj.number.replace(/\D/g, '');
    if (/^\d{7,15}$/.test(cleanNum)) {
      return {
        phoneCandidate: cleanNum,
        method: 'CONTACT_NUMBER',
      };
    }
  }

  // All supported resolution paths failed
  return {
    phoneCandidate: null,
    method: 'NONE',
    note: 'All identity resolution paths failed (JID_PREFIX, LID_MAPPING, CONTACT_NUMBER)',
  };
}

/**
 * Classifies a contact as SAVED, UNSAVED, UNCERTAIN, or UNRESOLVED.
 * isMyContact is strictly authoritative.
 * Any undefined isMyContact MUST be UNCERTAIN, regardless of isAddressBookContact.
 */
export function classifyContact(contact: Partial<Contact>): {
  status: ContactClassification;
  note?: string;
} {
  const isMyContact = contact.isMyContact;
  const isAddressBook = (contact as Record<string, unknown>).isAddressBookContact;

  if (isMyContact === false && isAddressBook === true) {
    return {
      status: 'UNCERTAIN',
      note: 'Conflict detected: isMyContact is false but isAddressBookContact is true',
    };
  }

  if (isMyContact === true) {
    return { status: 'SAVED' };
  }

  if (isMyContact === false) {
    return { status: 'UNSAVED' };
  }

  return {
    status: 'UNCERTAIN',
    note: isAddressBook === true
      ? 'UNCERTAIN: isMyContact is undefined despite isAddressBookContact being true'
      : 'Contact sync metadata incomplete (isMyContact is undefined)',
  };
}

/**
 * Scans WhatsApp chats (DMs and optional Groups) to extract unsaved contact records.
 * STRICT PROVENANCE: Only active scanned WhatsApp chats are authoritative candidate sources.
 * Global client.getContacts() is NEVER used for candidate discovery.
 */
export async function scanWhatsAppChats(
  client: Client,
  includeGroups: boolean = true,
  syncWaitMs: number = 3000,
  callbacks?: ScanCallbacks
): Promise<RawScanResults> {
  const log = callbacks?.onLog || (() => {});
  log('Fetching active chat list from WhatsApp Web...');

  if (syncWaitMs > 0) {
    log(`Waiting ${syncWaitMs}ms for contact sync hydration...`);
    await new Promise((resolve) => setTimeout(resolve, syncWaitMs));
  }

  const contactsMap = new Map<string, ScannedContact>();
  let totalChatsScanned = 0;
  let dmCandidatesCount = 0;
  let groupCandidatesCount = 0;
  let chats: Chat[] = [];

  try {
    chats = await client.getChats();
    log(`Found ${chats.length} active chats via standard getChats().`);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log(`[Warning] Standard client.getChats() encountered a WhatsApp protocol issue: ${errorMsg}`);
    log('[Fallback] Switching to chat-preserving DOM fallback...');
  }

  if (chats && chats.length > 0) {
    for (let i = 0; i < chats.length; i++) {
      const chat = chats[i];
      const rawId = chat.id?._serialized || '';

      if (isExcludedEntity(rawId)) {
        continue;
      }

      totalChatsScanned++;
      if (callbacks?.onProgress) {
        callbacks.onProgress(i + 1, chats.length, chat.name || rawId);
      }

      try {
        if (!chat.isGroup) {
          dmCandidatesCount++;
          await processIndividualChat(client, chat, contactsMap, log);
        } else if (includeGroups) {
          const participantsCount = (chat as GroupChat).participants?.length || 0;
          groupCandidatesCount += participantsCount;
          await processGroupChat(client, chat as GroupChat, contactsMap, log);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log(`[Warning] Failed to scan chat ${chat.name || rawId}: ${msg}`);
      }
    }
  } else {
    // Chat-Preserving Fallback: Extract ONLY active chats and their participants directly from DOM
    const rawFallbackChats = await safeGetChatsFallback(client, log);
    totalChatsScanned = rawFallbackChats.length;
    log(`Retrieved ${rawFallbackChats.length} active chats via chat-preserving DOM fallback.`);

    for (let i = 0; i < rawFallbackChats.length; i++) {
      const rawChat = rawFallbackChats[i];
      if (isExcludedEntity(rawChat.id)) continue;

      if (callbacks?.onProgress) {
        callbacks.onProgress(i + 1, rawFallbackChats.length, rawChat.name || rawChat.id);
      }

      try {
        if (!rawChat.isGroup) {
          dmCandidatesCount++;
          await processRawIndividualChat(client, rawChat.id, rawChat.name, contactsMap, log);
        } else if (includeGroups && rawChat.participants && rawChat.participants.length > 0) {
          groupCandidatesCount += rawChat.participants.length;
          await processRawGroupParticipants(client, rawChat.id, rawChat.name, rawChat.participants, contactsMap, log);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log(`[Warning] Failed processing fallback chat ${rawChat.id}: ${msg}`);
      }
    }
  }

  const allScanned = Array.from(contactsMap.values());
  const savedCount = allScanned.filter((c) => c.status === 'SAVED').length;
  const unsavedCount = allScanned.filter((c) => c.status === 'UNSAVED').length;
  const uncertainCount = allScanned.filter((c) => c.status === 'UNCERTAIN').length;
  const unresolvedCount = allScanned.filter((c) => c.status === 'UNRESOLVED').length;

  return {
    contacts: allScanned,
    totalChatsScanned,
    dmCandidatesCount,
    groupCandidatesCount,
    savedCount,
    unsavedCount,
    uncertainCount,
    unresolvedCount,
    storeOnlyDetectedCount: 0,
    storeOnlyRejectedCount: 0,
  };
}

async function processIndividualChat(
  client: Client,
  chat: Chat,
  contactsMap: Map<string, ScannedContact>,
  log: (msg: string) => void
): Promise<void> {
  const rawId = chat.id._serialized;
  await processRawIndividualChat(client, rawId, chat.name || rawId, contactsMap, log);
}

async function processRawIndividualChat(
  client: Client,
  rawId: string,
  chatName: string,
  contactsMap: Map<string, ScannedContact>,
  log: (msg: string) => void
): Promise<void> {
  if (isExcludedEntity(rawId)) return;

  let contactObj: Contact | null = null;
  const isLid = rawId.endsWith('@lid');

  try {
    contactObj = await client.getContactById(rawId);
  } catch (err) {
    log(`[Debug] Could not fetch contact object for ${rawId}: ${err instanceof Error ? err.message : String(err)}`);
  }

  const identityRes = await resolvePhoneIdentity(client, rawId, contactObj);
  const sourceType: DiscoverySourceType = 'DM_CHAT';

  if (!identityRes.phoneCandidate) {
    contactsMap.set(rawId, {
      id: rawId,
      number: null,
      pushname: contactObj?.pushname || null,
      formattedName: contactObj?.name || null,
      status: 'UNRESOLVED',
      source: 'DM',
      sourceType,
      sourceChatId: rawId,
      sourceChatName: chatName,
      chatName: chatName,
      isGroup: false,
      lid: isLid ? rawId : null,
      resolutionMethod: identityRes.method,
      resolutionNote: identityRes.note || 'Unresolved identity (No accessible phone number)',
      isBusiness: (contactObj as any)?.isBusiness,
      isEnterprise: (contactObj as any)?.isEnterprise,
    });
    return;
  }

  const classification = contactObj
    ? classifyContact(contactObj)
    : { status: 'UNCERTAIN' as ContactClassification, note: 'Failed to retrieve contact object' };

  contactsMap.set(rawId, {
    id: rawId,
    number: identityRes.phoneCandidate,
    pushname: contactObj?.pushname || null,
    formattedName: contactObj?.name || null,
    status: classification.status,
    source: 'DM',
    sourceType,
    sourceChatId: rawId,
    sourceChatName: chatName,
    chatName: chatName,
    isGroup: false,
    lid: isLid ? rawId : null,
    resolutionMethod: identityRes.method,
    resolutionNote: classification.note,
    isBusiness: (contactObj as any)?.isBusiness,
    isEnterprise: (contactObj as any)?.isEnterprise,
  });
}

async function processGroupChat(
  client: Client,
  chat: GroupChat,
  contactsMap: Map<string, ScannedContact>,
  log: (msg: string) => void
): Promise<void> {
  const participants: GroupParticipant[] = chat.participants || [];
  const rawParticipants = participants.map((p) => ({ id: p.id._serialized }));
  await processRawGroupParticipants(client, chat.id._serialized, chat.name || 'Group Chat', rawParticipants, contactsMap, log);
}

async function processRawGroupParticipants(
  client: Client,
  groupChatId: string,
  groupName: string,
  participants: Array<{ id: string }>,
  contactsMap: Map<string, ScannedContact>,
  log: (msg: string) => void
): Promise<void> {
  const sourceType: DiscoverySourceType = 'GROUP_PARTICIPANT';

  for (const participant of participants) {
    const rawId = participant.id;
    if (isExcludedEntity(rawId) || contactsMap.has(rawId)) {
      continue;
    }

    let contactObj: Contact | null = null;
    const isLid = rawId.endsWith('@lid');

    try {
      contactObj = await client.getContactById(rawId);
    } catch {
      // Non-fatal
    }

    const identityRes = await resolvePhoneIdentity(client, rawId, contactObj);

    if (!identityRes.phoneCandidate) {
      contactsMap.set(rawId, {
        id: rawId,
        number: null,
        pushname: contactObj?.pushname || null,
        formattedName: contactObj?.name || null,
        status: 'UNRESOLVED',
        source: 'GROUP',
        sourceType,
        sourceChatId: groupChatId,
        sourceChatName: groupName,
        chatName: groupName,
        isGroup: true,
        lid: isLid ? rawId : null,
        resolutionMethod: identityRes.method,
        resolutionNote: identityRes.note || 'Unresolved group participant (No accessible phone number)',
        isBusiness: (contactObj as any)?.isBusiness,
        isEnterprise: (contactObj as any)?.isEnterprise,
      });
      continue;
    }

    const classification = contactObj
      ? classifyContact(contactObj)
      : { status: 'UNCERTAIN' as ContactClassification, note: 'Failed to retrieve contact object' };

    contactsMap.set(rawId, {
      id: rawId,
      number: identityRes.phoneCandidate,
      pushname: contactObj?.pushname || null,
      formattedName: contactObj?.name || null,
      status: classification.status,
      source: 'GROUP',
      sourceType,
      sourceChatId: groupChatId,
      sourceChatName: groupName,
      chatName: groupName,
      isGroup: true,
      lid: isLid ? rawId : null,
      resolutionMethod: identityRes.method,
      resolutionNote: classification.note,
      isBusiness: (contactObj as any)?.isBusiness,
      isEnterprise: (contactObj as any)?.isEnterprise,
    });
  }
}

/**
 * Direct Puppeteer DOM fallback to safely retrieve active chat IDs and participant IDs
 * when standard client.getChats() fails due to WA Web bundle updates.
 * NEVER accesses the global contact store (getContacts).
 */
async function safeGetChatsFallback(
  client: Client,
  log: (msg: string) => void
): Promise<Array<{ id: string; name: string; isGroup: boolean; participants?: Array<{ id: string }> }>> {
  log('[Fallback] Executing chat-preserving DOM extraction...');
  try {
    const rawChats = await (client as unknown as { pupPage: { evaluate: (fn: Function) => Promise<any> } }).pupPage.evaluate(() => {
      try {
        const collections = (window as any).require ? (window as any).require('WAWebCollections') : null;
        const chatModels = collections?.Chat?.getModelsArray ? collections.Chat.getModelsArray() : [];

        return chatModels.map((c: any) => {
          try {
            const rawParticipants = c.groupMetadata?.participants
              ? c.groupMetadata.participants.map((p: any) => ({
                  id: p.id?._serialized || p.id || String(p),
                }))
              : [];

            return {
              id: c.id?._serialized || String(c.id),
              name: c.name || c.formattedTitle || c.id?._serialized || 'Chat',
              isGroup: Boolean(c.isGroup),
              participants: rawParticipants,
            };
          } catch {
            return {
              id: c.id?._serialized || String(c.id),
              name: c.name || 'Chat',
              isGroup: Boolean(c.isGroup),
              participants: [],
            };
          }
        });
      } catch {
        return [];
      }
    });

    return rawChats || [];
  } catch (err) {
    log(`[Warning] Safe DOM chat fallback evaluation failed: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}
