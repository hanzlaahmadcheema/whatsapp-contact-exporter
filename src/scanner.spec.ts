import { describe, it, expect } from 'vitest';
import { classifyContact, isExcludedEntity, resolvePhoneIdentity } from './scanner.js';

describe('scanner - resolvePhoneIdentity (Multi-Path Identity Resolution)', () => {
  it('resolves phone number from JID prefix when contact.number contains internal LID sequence', async () => {
    const mockContactObj = {
      number: '114405782106120', // Internal LID sequence returned by WA Web
    } as any;

    const mockClient = {} as any;

    const res = await resolvePhoneIdentity(mockClient, '923200485780@c.us', mockContactObj);
    expect(res.phoneCandidate).toBe('923200485780');
    expect(res.method).toBe('JID_PREFIX');
  });

  it('resolves phone number via LID mapping for @lid JIDs', async () => {
    const mockClient = {
      getContactLidAndPhone: async (ids: string[]) => [
        { lid: ids[0], pn: '923143620650@c.us' },
      ],
    } as any;

    const res = await resolvePhoneIdentity(mockClient, '249194522640567@lid', null);
    expect(res.phoneCandidate).toBe('923143620650');
    expect(res.method).toBe('LID_MAPPING');
  });

  it('resolves phone number from contact.number as fallback when JID prefix is non-standard', async () => {
    const mockContactObj = {
      number: '923001234567',
    } as any;

    const mockClient = {} as any;

    const res = await resolvePhoneIdentity(mockClient, 'nonstandard@c.us', mockContactObj);
    expect(res.phoneCandidate).toBe('923001234567');
    expect(res.method).toBe('CONTACT_NUMBER');
  });

  it('returns NONE and null candidate when all identity resolution paths fail', async () => {
    const mockClient = {
      getContactLidAndPhone: async () => [],
    } as any;

    const res = await resolvePhoneIdentity(mockClient, 'unresolved@lid', null);
    expect(res.phoneCandidate).toBeNull();
    expect(res.method).toBe('NONE');
    expect(res.note).toContain('All identity resolution paths failed');
  });
});

describe('scanner - classifyContact (Strict Authoritative Rules & Regression Tests)', () => {
  it('classifies contact as SAVED when isMyContact is true', () => {
    const result = classifyContact({
      isMyContact: true,
      number: '14155552671',
    });
    expect(result.status).toBe('SAVED');
  });

  it('classifies contact as UNSAVED when isMyContact is false and isAddressBookContact is false', () => {
    const result = classifyContact({
      isMyContact: false,
      number: '14155552671',
      pushname: 'Alex',
    });
    expect(result.status).toBe('UNSAVED');
  });

  it('REGRESSION TEST: classifies as UNCERTAIN and logs conflict note when isMyContact is false but isAddressBookContact is true', () => {
    const result = classifyContact({
      isMyContact: false,
      isAddressBookContact: true,
      number: '14155552671',
    } as any);

    expect(result.status).toBe('UNCERTAIN');
    expect(result.note).toBe('Conflict detected: isMyContact is false but isAddressBookContact is true');
  });

  it('REGRESSION TEST: classifies as UNCERTAIN when isMyContact is undefined, even if isAddressBookContact is true', () => {
    const result = classifyContact({
      isMyContact: undefined,
      isAddressBookContact: true,
      number: '14155552671',
    } as any);

    expect(result.status).toBe('UNCERTAIN');
    expect(result.note).toContain('isMyContact is undefined');
  });

  it('classifies contact as UNCERTAIN when isMyContact is undefined', () => {
    const result = classifyContact({
      number: '14155552671',
    });
    expect(result.status).toBe('UNCERTAIN');
    expect(result.note).toContain('isMyContact is undefined');
  });
});

describe('scanner - isExcludedEntity', () => {
  it('excludes newsletters, broadcasts, and system entities', () => {
    expect(isExcludedEntity('12345@newsletter')).toBe(true);
    expect(isExcludedEntity('12345@broadcast')).toBe(true);
    expect(isExcludedEntity('status@broadcast')).toBe(true);
    expect(isExcludedEntity('0@c.us')).toBe(true);
  });

  it('retains standard user accounts and business accounts', () => {
    expect(isExcludedEntity('14155552671@c.us')).toBe(false);
    expect(isExcludedEntity('xyz123@lid')).toBe(false);
  });
});
