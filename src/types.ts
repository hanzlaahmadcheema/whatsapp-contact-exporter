/**
 * Status classification for contacts discovered during scanning.
 */
export type ContactClassification = 'SAVED' | 'UNSAVED' | 'UNCERTAIN' | 'UNRESOLVED';

/**
 * Format styles for generated contact names.
 */
export type NameStyleOption = 'pushname_or_number' | 'full_number' | 'last4' | 'counter';

/**
 * Method used to resolve phone number identity from JID/LID/Contact.
 */
export type ResolutionMethod = 'JID_PREFIX' | 'LID_MAPPING' | 'CONTACT_NUMBER' | 'NONE';

/**
 * Mandatory discovery source type. Only DM_CHAT and GROUP_PARTICIPANT are allowed.
 */
export type DiscoverySourceType = 'DM_CHAT' | 'GROUP_PARTICIPANT';

/**
 * Options for customizing contact names before export.
 */
export interface NamingCustomizationOptions {
  prefix?: string; // Prefix, e.g., "Client - ", "WA - ", "Lead "
  suffix?: string; // Suffix, e.g., " - 2026", " (Unsaved)"
  nameStyle: NameStyleOption; // Style choice: 'pushname_or_number' | 'full_number' | 'last4' | 'counter'
  startCounter?: number; // Starting index for counter style (default: 1)
  padDigits?: number; // Zero-padding for counter, e.g., 3 -> '001', '002' (default: 3)
}

/**
 * Health check status before starting scan pipeline.
 */
export interface HealthCheckResult {
  isConnected: boolean;
  isContactStoreReady: boolean;
  hasLidResolver: boolean;
  totalContactsInStore: number;
  syncHydrated: boolean;
}

/**
 * Raw scanned contact information from WhatsApp Web API.
 */
export interface ScannedContact {
  id: string; // e.g., '1234567890@c.us' or 'xyz@lid'
  number: string | null; // Raw digits or null if unresolved LID
  pushname: string | null; // Profile display name if set by user
  formattedName?: string | null;
  status: ContactClassification;
  source: 'DM' | 'GROUP';
  sourceType: DiscoverySourceType; // Mandatory provenance: DM_CHAT or GROUP_PARTICIPANT
  sourceChatId: string; // Mandatory provenance: originating chat ID
  sourceChatName: string; // Mandatory provenance: originating chat name
  chatName: string;
  isGroup: boolean;
  lid?: string | null;
  resolutionMethod?: ResolutionMethod;
  resolutionNote?: string | null;
  isBusiness?: boolean;
  isEnterprise?: boolean;
}

/**
 * Normalized contact ready for export.
 */
export interface NormalizedContact {
  id: string; // Unique primary ID (E.164 number)
  e164Number: string; // e.g. '+14155552671'
  nationalNumber: string; // e.g. '(415) 555-2671'
  countryCode: string; // e.g. 'US'
  formattedName: string; // Deterministic customized name, e.g. 'WA Unsaved - Alex' or 'Client - 001'
  givenName: string; // e.g., 'Alex' or '001'
  familyName: string; // Prefix or 'WA Unsaved'
  pushname: string | null;
  sources: string[]; // List of chat names where contact was discovered
}

/**
 * Options passed to the exporter CLI.
 */
export interface ExporterOptions {
  country: string; // Default ISO 2-letter country code for parsing (e.g. 'US', 'PK', 'GB')
  format: ('csv' | 'vcf')[]; // Formats to generate
  outputDir: string; // Path to write export files
  includeGroups: boolean; // Whether to scan group chat participants
  headless: boolean; // Run Chrome in headless mode
  syncWaitMs: number; // Waiting time in ms for WA Web contact sync hydration
  naming?: NamingCustomizationOptions; // Optional contact naming configuration
}

/**
 * Summary metrics of the scan and export process.
 */
export interface ExportSummary {
  totalChatsScanned: number;
  totalContactsDiscovered: number;
  dmCandidatesCount: number;
  groupCandidatesCount: number;
  savedContactsCount: number;
  unsavedContactsCount: number;
  uncertainContactsCount: number;
  unresolvedContactsCount: number;
  storeOnlyDetectedCount: number;
  storeOnlyRejectedCount: number;
  invalidNumbersCount: number;
  deduplicatedExportCount: number;
  exportedFiles: string[];
}
