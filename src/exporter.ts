import fs from 'fs';
import path from 'path';
import { NormalizedContact } from './types.js';

export interface ExportResult {
  csvPath?: string;
  vcfPath?: string;
}

/**
 * Escapes a field for CSV generation according to RFC 4180.
 */
function escapeCsvField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

/**
 * Generates a Google Contacts compatible CSV string with UTF-8 BOM.
 */
export function generateCsv(contacts: NormalizedContact[]): string {
  const headers = ['Name', 'Given Name', 'Family Name', 'Phone 1 - Type', 'Phone 1 - Value', 'Notes'];
  const lines: string[] = [];

  // UTF-8 BOM prefix
  lines.push('\uFEFF' + headers.map(escapeCsvField).join(','));

  for (const contact of contacts) {
    const notes = `Discovered via WhatsApp in: ${contact.sources.join('; ')}`;
    const row = [
      contact.formattedName,
      contact.givenName,
      contact.familyName,
      'Mobile',
      contact.e164Number,
      notes,
    ];
    lines.push(row.map(escapeCsvField).join(','));
  }

  return lines.join('\n');
}

/**
 * Generates a vCard 3.0 string for iOS / Android / Google Contacts compatibility.
 */
export function generateVcf(contacts: NormalizedContact[]): string {
  const cards: string[] = [];

  for (const contact of contacts) {
    const notes = `Discovered via WhatsApp in: ${contact.sources.join('; ')}`;
    const card = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${escapeVcardField(contact.formattedName)}`,
      `N:${escapeVcardField(contact.familyName)};${escapeVcardField(contact.givenName)};;;`,
      `TEL;TYPE=CELL:${contact.e164Number}`,
      `NOTE:${escapeVcardField(notes)}`,
      'END:VCARD',
    ].join('\r\n');
    cards.push(card);
  }

  return cards.join('\r\n\r\n') + '\r\n';
}

function escapeVcardField(field: string): string {
  return field
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Writes export files to the specified output directory.
 */
export async function exportContacts(
  contacts: NormalizedContact[],
  outputDir: string,
  formats: ('csv' | 'vcf')[] = ['csv', 'vcf']
): Promise<ExportResult> {
  const resolvedDir = path.resolve(outputDir);
  if (!fs.existsSync(resolvedDir)) {
    fs.mkdirSync(resolvedDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const result: ExportResult = {};

  if (formats.includes('csv')) {
    const csvContent = generateCsv(contacts);
    const csvPath = path.join(resolvedDir, `whatsapp_unsaved_contacts_${timestamp}.csv`);
    fs.writeFileSync(csvPath, csvContent, 'utf-8');
    result.csvPath = csvPath;
  }

  if (formats.includes('vcf')) {
    const vcfContent = generateVcf(contacts);
    const vcfPath = path.join(resolvedDir, `whatsapp_unsaved_contacts_${timestamp}.vcf`);
    fs.writeFileSync(vcfPath, vcfContent, 'utf-8');
    result.vcfPath = vcfPath;
  }

  return result;
}
