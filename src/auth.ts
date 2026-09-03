import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import { getAuthDir } from './paths.js';
import { findSystemBrowser } from './browser.js';

export interface AuthInitOptions {
  headless?: boolean;
  dataPath?: string;
  executablePath?: string;
  webVersionCacheUrl?: string;
  onQr?: (qr: string) => void;
  onAuthenticated?: () => void;
  onReady?: () => void;
  onAuthFailure?: (message: string) => void;
  onDisconnected?: (reason: string) => void;
  onLog?: (message: string) => void;
}

/**
 * Initializes WhatsApp Web client with LocalAuth session persistence, QR authentication,
 * platform-aware AppData resolution, and system browser auto-detection.
 */
export function createWhatsAppClient(options: AuthInitOptions = {}): InstanceType<typeof Client> {
  const log = options.onLog || console.log;

  const authDataPath = options.dataPath || getAuthDir();
  log(`Initializing WhatsApp Web client with LocalAuth at: ${authDataPath}`);

  let browserPath = options.executablePath;
  if (!browserPath) {
    try {
      const detected = findSystemBrowser();
      browserPath = detected.executablePath;
      log(`[Browser] Auto-detected system browser: ${detected.browserName} (${browserPath})`);
    } catch (err) {
      log(`[Browser Info] Bundled Chromium fallback / System search note: ${(err as Error).message}`);
    }
  }

  const puppeteerConfig: Record<string, unknown> = {
    headless: options.headless ?? true,
    protocolTimeout: 0, // Disable CDP protocol timeout for script injection
    timeout: 120000, // 2-minute browser load timeout
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-blink-features=AutomationControlled',
      '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    ],
  };

  if (browserPath) {
    puppeteerConfig.executablePath = browserPath;
  }

  const clientOptions: Record<string, unknown> = {
    authStrategy: new LocalAuth({
      dataPath: authDataPath,
    }),
    puppeteer: puppeteerConfig,
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    bypassCSP: true,
    webVersionCache: options.webVersionCacheUrl
      ? { type: 'remote', remotePath: options.webVersionCacheUrl }
      : {
          type: 'remote',
          remotePath:
            'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1018944819-alpha.html',
        },
  };

  const client = new Client(clientOptions as any);

  client.on('qr', (qr: string) => {
    log('\n================ WhatsApp Web QR Code ================');
    log('Scan the QR code below using WhatsApp on your phone:');
    qrcode.generate(qr, { small: true });
    log('======================================================\n');
    options.onQr?.(qr);
  });

  client.on('authenticated', () => {
    log('[Auth] Session authenticated successfully.');
    options.onAuthenticated?.();
  });

  client.on('auth_failure', (msg: string) => {
    log(`[Auth Error] Authentication failed: ${msg}`);
    options.onAuthFailure?.(msg);
  });

  client.on('ready', () => {
    log('[Auth] WhatsApp Web client is READY.');
    options.onReady?.();
  });

  client.on('disconnected', (reason: string) => {
    log(`[Auth Disconnected] Client was disconnected: ${reason}`);
    options.onDisconnected?.(reason);
  });

  return client;
}
