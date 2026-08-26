import { describe, it, expect } from 'vitest';
import { normalizeContacts } from './normalizer.js';
import { ScannedContact } from './types.js';

describe('normalizer', () => {
  it('normalizes valid US phone numbers into E.164 and generates default names', () => {
    const mockContacts: ScannedContact[] = [
      {
        id: '14155552671@c.us',
        number: '4155552671',
        pushname: 'Alex',
        status: 'UNSAVED',
        source: 'DM',
        sourceType: 'DM_CHAT',
        sourceChatId: '14155552671@c.us',
        sourceChatName: 'Chat 1',
        chatName: 'Chat 1',
        isGroup: false,
      },
      {
        id: '14155559999@c.us',
        number: '+14155559999',
        pushname: null,
        status: 'UNSAVED',
        source: 'GROUP',
        sourceType: 'GROUP_PARTICIPANT',
        sourceChatId: 'group1@g.us',
        sourceChatName: 'Tech Group',
        chatName: 'Tech Group',
        isGroup: true,
      },
    ];

    const result = normalizeContacts(mockContacts, 'US');
    expect(result.normalized).toHaveLength(2);
    expect(result.invalidNumbers).toHaveLength(0);

    const alex = result.normalized.find((c) => c.e164Number === '+14155552671');
    expect(alex).toBeDefined();
    expect(alex?.formattedName).toBe('WA Unsaved - Alex');
    expect(alex?.sources).toEqual(['Chat 1']);
  });

  it('REGRESSION TEST: rejects any candidate from global contact store fallback (STORE_ONLY)', () => {
    const mockContacts: ScannedContact[] = [
      {
        id: '14155551111@c.us',
        number: '4155551111',
        pushname: 'Orphan Contact',
        status: 'UNSAVED',
        source: 'DM',
        sourceType: 'STORE_ONLY' as any,
        sourceChatId: 'STORE_ONLY',
        sourceChatName: 'STORE_ONLY',
        chatName: 'STORE_ONLY',
        isGroup: false,
      },
      {
        id: '14155552222@c.us',
        number: '4155552222',
        pushname: 'Valid DM Contact',
        status: 'UNSAVED',
        source: 'DM',
        sourceType: 'DM_CHAT',
        sourceChatId: '14155552222@c.us',
        sourceChatName: 'Valid DM Chat',
        chatName: 'Valid DM Chat',
        isGroup: false,
      },
    ];

    const result = normalizeContacts(mockContacts, 'US');
    expect(result.normalized).toHaveLength(1);
    expect(result.normalized[0].e164Number).toBe('+14155552222');
    expect(result.normalized[0].formattedName).toBe('WA Unsaved - Valid DM Contact');
  });

  it('supports custom prefix, suffix, and counter naming style', () => {
    const mockContacts: ScannedContact[] = [
      {
        id: '14155552671@c.us',
        number: '4155552671',
        pushname: 'Alex',
        status: 'UNSAVED',
        source: 'DM',
        sourceType: 'DM_CHAT',
        sourceChatId: '14155552671@c.us',
        sourceChatName: 'Direct Chat',
        chatName: 'Direct Chat',
        isGroup: false,
      },
      {
        id: '14155559999@c.us',
        number: '4155559999',
        pushname: 'Bob',
        status: 'UNSAVED',
        source: 'DM',
        sourceType: 'DM_CHAT',
        sourceChatId: '14155559999@c.us',
        sourceChatName: 'Direct Chat 2',
        chatName: 'Direct Chat 2',
        isGroup: false,
      },
    ];

    const result = normalizeContacts(mockContacts, 'US', {
      prefix: 'Lead ',
      suffix: ' - Aug 2026',
      nameStyle: 'counter',
      startCounter: 1,
      padDigits: 3,
    });

    expect(result.normalized).toHaveLength(2);
    expect(result.normalized[0].formattedName).toBe('Lead 001 - Aug 2026');
    expect(result.normalized[1].formattedName).toBe('Lead 002 - Aug 2026');
  });

  it('deduplicates duplicate phone numbers across different chat sources', () => {
    const mockContacts: ScannedContact[] = [
      {
        id: '14155552671@c.us',
        number: '4155552671',
        pushname: null,
        status: 'UNSAVED',
        source: 'DM',
        sourceType: 'DM_CHAT',
        sourceChatId: '14155552671@c.us',
        sourceChatName: 'Direct Chat',
        chatName: 'Direct Chat',
        isGroup: false,
      },
      {
        id: '14155552671@c.us',
        number: '+1 (415) 555-2671',
        pushname: 'Alex Smith',
        status: 'UNSAVED',
        source: 'GROUP',
        sourceType: 'GROUP_PARTICIPANT',
        sourceChatId: 'group1@g.us',
        sourceChatName: 'Community Group',
        chatName: 'Community Group',
        isGroup: true,
      },
    ];

    const result = normalizeContacts(mockContacts, 'US');
    expect(result.normalized).toHaveLength(1);
    expect(result.normalized[0].e164Number).toBe('+14155552671');
    expect(result.normalized[0].formattedName).toBe('WA Unsaved - Alex Smith');
    expect(result.normalized[0].sources).toEqual(['Direct Chat', 'Community Group']);
  });
});
