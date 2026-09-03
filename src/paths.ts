import path from 'path';
import os from 'os';
import fs from 'fs';

/**
 * Returns the platform-specific user data directory for WhatsApp Contact Exporter.
 *
 * Windows: %APPDATA%\WhatsApp Contact Exporter\
 * macOS  : ~/Library/Application Support/WhatsApp Contact Exporter/
 * Linux  : ~/.config/whatsapp-contact-exporter/
 */
export function getAppDataDir(): string {
  if (process.platform === 'win32' && process.env.APPDATA) {
    return path.join(process.env.APPDATA, 'WhatsApp Contact Exporter');
  }

  const home = os.homedir();
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'WhatsApp Contact Exporter');
  }

  return path.join(home, '.config', 'whatsapp-contact-exporter');
}

/**
 * Returns the persistent authentication data path (%APPDATA%\WhatsApp Contact Exporter\auth).
 */
export function getAuthDir(): string {
  const dir = path.join(getAppDataDir(), 'auth');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Returns the cache directory (%APPDATA%\WhatsApp Contact Exporter\cache).
 */
export function getCacheDir(): string {
  const dir = path.join(getAppDataDir(), 'cache');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Returns the default exports directory (%APPDATA%\WhatsApp Contact Exporter\exports).
 */
export function getDefaultExportsDir(): string {
  const dir = path.join(getAppDataDir(), 'exports');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Clears saved authentication session directory for logging out.
 */
export function clearAuthSession(): boolean {
  try {
    const dir = path.join(getAppDataDir(), 'auth');
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    return true;
  } catch {
    return false;
  }
}

