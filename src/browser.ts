import fs from 'fs';
import path from 'path';

export interface BrowserDetectionResult {
  executablePath: string;
  browserName: string;
}

/**
 * Searches standard system installation paths for Google Chrome, Microsoft Edge, or Chromium.
 * Throws a friendly actionable error if no supported browser is found.
 */
export function findSystemBrowser(): BrowserDetectionResult {
  const isWindows = process.platform === 'win32';
  const isMac = process.platform === 'darwin';

  const candidates: Array<{ name: string; path: string }> = [];

  if (isWindows) {
    const programFiles = process.env.PROGRAMFILES || 'C:\\Program Files';
    const programFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
    const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'AppData\\Local');

    // Google Chrome
    candidates.push({ name: 'Google Chrome', path: path.join(programFiles, 'Google\\Chrome\\Application\\chrome.exe') });
    candidates.push({ name: 'Google Chrome', path: path.join(programFilesX86, 'Google\\Chrome\\Application\\chrome.exe') });
    candidates.push({ name: 'Google Chrome', path: path.join(localAppData, 'Google\\Chrome\\Application\\chrome.exe') });

    // Microsoft Edge
    candidates.push({ name: 'Microsoft Edge', path: path.join(programFiles, 'Microsoft\\Edge\\Application\\msedge.exe') });
    candidates.push({ name: 'Microsoft Edge', path: path.join(programFilesX86, 'Microsoft\\Edge\\Application\\msedge.exe') });
    candidates.push({ name: 'Microsoft Edge', path: path.join(localAppData, 'Microsoft\\Edge\\Application\\msedge.exe') });

    // Chromium / Brave
    candidates.push({ name: 'Brave', path: path.join(programFiles, 'BraveSoftware\\Brave-Browser\\Application\\brave.exe') });
    candidates.push({ name: 'Chromium', path: path.join(localAppData, 'Chromium\\Application\\chrome.exe') });
  } else if (isMac) {
    candidates.push({ name: 'Google Chrome', path: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
    candidates.push({ name: 'Microsoft Edge', path: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' });
    candidates.push({ name: 'Brave', path: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' });
    candidates.push({ name: 'Chromium', path: '/Applications/Chromium.app/Contents/MacOS/Chromium' });
  } else {
    // Linux
    candidates.push({ name: 'Google Chrome', path: '/usr/bin/google-chrome' });
    candidates.push({ name: 'Google Chrome Stable', path: '/usr/bin/google-chrome-stable' });
    candidates.push({ name: 'Chromium', path: '/usr/bin/chromium' });
    candidates.push({ name: 'Chromium Browser', path: '/usr/bin/chromium-browser' });
    candidates.push({ name: 'Microsoft Edge', path: '/usr/bin/microsoft-edge' });
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate.path)) {
      return {
        executablePath: candidate.path,
        browserName: candidate.name,
      };
    }
  }

  throw new Error(
    'No supported browser was found. Install Google Chrome or Microsoft Edge and run the application again.'
  );
}
