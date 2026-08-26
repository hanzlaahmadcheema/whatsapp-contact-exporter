import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { generateCsv, generateVcf, exportContacts } from './exporter.js';
import { NormalizedContact } from './types.js';

describe('exporter', () => {
  const mockContacts: NormalizedContact[] = [
    {
      id: '+14155552671',
      e164Number: '+14155552671',
      nationalNumber: '(415) 555-2671',
      countryCode: 'US',
      formattedName: 'WA Unsaved - Alex',
      givenName: 'Alex',
      familyName: 'WA Unsaved',
      pushname: 'Alex',
      sources: ['Direct Chat', 'Project Group'],
    },
  ];

  const tmpDir = path.join(process.cwd(), 'src', '__test_output__');

  beforeEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('generates CSV content with UTF-8 BOM and correct Google Contacts headers', () => {
    const csv = generateCsv(mockContacts);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('Name,Given Name,Family Name,Phone 1 - Type,Phone 1 - Value,Notes');
    expect(csv).toContain('WA Unsaved - Alex,Alex,WA Unsaved,Mobile,+14155552671');
    expect(csv).toContain('Discovered via WhatsApp in: Direct Chat; Project Group');
  });

  it('generates valid vCard 3.0 content', () => {
    const vcf = generateVcf(mockContacts);
    expect(vcf).toContain('BEGIN:VCARD');
    expect(vcf).toContain('VERSION:3.0');
    expect(vcf).toContain('FN:WA Unsaved - Alex');
    expect(vcf).toContain('N:WA Unsaved;Alex;;;');
    expect(vcf).toContain('TEL;TYPE=CELL:+14155552671');
    expect(vcf).toContain('NOTE:Discovered via WhatsApp in: Direct Chat\\; Project Group');
    expect(vcf).toContain('END:VCARD');
  });

  it('exports files to disk when exportContacts is invoked', async () => {
    const result = await exportContacts(mockContacts, tmpDir, ['csv', 'vcf']);
    expect(result.csvPath).toBeDefined();
    expect(result.vcfPath).toBeDefined();
    expect(fs.existsSync(result.csvPath!)).toBe(true);
    expect(fs.existsSync(result.vcfPath!)).toBe(true);
  });
});
