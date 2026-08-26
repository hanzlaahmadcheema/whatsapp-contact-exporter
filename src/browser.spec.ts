import { describe, it, expect } from 'vitest';
import { getAppDataDir, getAuthDir, getCacheDir, getDefaultExportsDir } from './paths.js';
import { findSystemBrowser } from './browser.js';

describe('paths - Platform AppData Resolution', () => {
  it('returns valid directory paths for application user data', () => {
    const appData = getAppDataDir();
    const auth = getAuthDir();
    const cache = getCacheDir();
    const exportsDir = getDefaultExportsDir();

    expect(appData).toBeDefined();
    expect(auth).toContain('auth');
    expect(cache).toContain('cache');
    expect(exportsDir).toContain('exports');
  });
});

describe('browser - System Browser Detection', () => {
  it('detects a installed system browser or throws friendly error', () => {
    try {
      const res = findSystemBrowser();
      expect(res.executablePath).toBeDefined();
      expect(res.browserName).toBeDefined();
    } catch (err) {
      expect((err as Error).message).toContain('No supported browser was found');
    }
  });
});
