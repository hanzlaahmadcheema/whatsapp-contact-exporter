import { parsePhoneNumberFromString, CountryCode } from 'libphonenumber-js';
import { ScannedContact, NormalizedContact, NamingCustomizationOptions } from './types.js';

export interface NormalizationResult {
  normalized: NormalizedContact[];
  invalidNumbers: ScannedContact[];
}

/**
 * Normalizes raw scanned unsaved contacts into standard E.164 format and creates customized names.
 * Removes duplicate phone numbers while aggregating chat sources.
 * Strictly rejects any candidates originating from global store fallback (STORE_ONLY).
 */
export function normalizeContacts(
  scannedContacts: ScannedContact[],
  defaultCountry: string = 'US',
  namingOptions?: NamingCustomizationOptions
): NormalizationResult {
  const countryCodeUpper = (defaultCountry.toUpperCase() || 'US') as CountryCode;
  const contactMap = new Map<string, NormalizedContact>();
  const invalidNumbers: ScannedContact[] = [];

  const prefix = namingOptions?.prefix !== undefined ? namingOptions.prefix : 'WA Unsaved - ';
  const suffix = namingOptions?.suffix || '';
  const style = namingOptions?.nameStyle || 'pushname_or_number';
  const startCounter = namingOptions?.startCounter || 1;
  const padDigits = namingOptions?.padDigits || 3;

  let counterIndex = startCounter;

  for (const contact of scannedContacts) {
    // Requirement 7: Reject any candidate from STORE_ONLY or not from active scanned chats
    if ((contact as any).sourceType === 'STORE_ONLY' || contact.sourceChatId === 'STORE_ONLY') {
      continue;
    }

    if (contact.status !== 'UNSAVED') {
      continue;
    }

    if (!contact.number) {
      invalidNumbers.push(contact);
      continue;
    }

    const digitsOnly = contact.number.replace(/\D/g, '');
    const withPlus = `+${digitsOnly}`;

    const intlParsed = parsePhoneNumberFromString(withPlus, countryCodeUpper);
    const localParsed = parsePhoneNumberFromString(digitsOnly, countryCodeUpper);

    const parsedNumber = intlParsed && intlParsed.isValid() ? intlParsed : (localParsed && localParsed.isValid() ? localParsed : intlParsed || localParsed);

    if (!parsedNumber || !parsedNumber.isValid()) {
      invalidNumbers.push(contact);
      continue;
    }

    processValidNumber(parsedNumber, contact, contactMap, { prefix, suffix, style, padDigits }, () => counterIndex++);
  }

  return {
    normalized: Array.from(contactMap.values()),
    invalidNumbers,
  };
}

function processValidNumber(
  parsedNumber: ReturnType<typeof parsePhoneNumberFromString>,
  contact: ScannedContact,
  contactMap: Map<string, NormalizedContact>,
  config: { prefix: string; suffix: string; style: string; padDigits: number },
  getNextCounter: () => number
): void {
  if (!parsedNumber) return;

  const e164 = parsedNumber.format('E.164');
  const national = parsedNumber.formatNational();
  const country = parsedNumber.country || 'UNKNOWN';

  const hasPushname = contact.pushname && contact.pushname.trim().length > 0 && contact.pushname !== contact.number;

  const existing = contactMap.get(e164);
  if (existing) {
    if (!existing.sources.includes(contact.chatName)) {
      existing.sources.push(contact.chatName);
    }
    if (!existing.pushname && hasPushname) {
      existing.pushname = contact.pushname;
      if (config.style === 'pushname_or_number') {
        const coreName = contact.pushname!.trim();
        existing.formattedName = `${config.prefix}${coreName}${config.suffix}`;
        existing.givenName = coreName;
      }
    }
    return;
  }

  const digitsOnly = e164.replace(/\D/g, '');
  const last4Digits = digitsOnly.length >= 4 ? digitsOnly.slice(-4) : digitsOnly;

  let coreName = '';
  if (config.style === 'counter') {
    const currentCounter = getNextCounter();
    coreName = String(currentCounter).padStart(config.padDigits, '0');
  } else if (config.style === 'last4') {
    coreName = last4Digits;
  } else if (config.style === 'full_number') {
    coreName = e164;
  } else {
    coreName = hasPushname ? contact.pushname!.trim() : e164;
  }

  const formattedName = `${config.prefix}${coreName}${config.suffix}`;
  const givenName = coreName;
  const familyName = config.prefix.replace(/[\s\-_]+$/, '') || 'WA Unsaved';

  contactMap.set(e164, {
    id: e164,
    e164Number: e164,
    nationalNumber: national,
    countryCode: country,
    formattedName,
    givenName,
    familyName,
    pushname: hasPushname ? contact.pushname : null,
    sources: [contact.chatName],
  });
}
