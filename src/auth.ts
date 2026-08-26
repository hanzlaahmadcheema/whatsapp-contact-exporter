import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';

export interface AuthInitOptions {
  headless?: boolean;
  dataPath?: string;
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
 * and high-timeout Puppeteer settings to prevent CDP protocol timeouts.
 */
export function createWhatsAppClient(options: AuthInitOptions = {}): InstanceType<typeof Client> {
  const log = options.onLog || console.log;

  log('Initializing WhatsApp Web client with LocalAuth...');

  const clientOptions: Record<string, unknown> = {
    authStrategy: new LocalAuth({
      dataPath: options.dataPath || './.wwebjs_auth',
    }),
    puppeteer: {
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
      ],
    },
  };

  // Only apply remote web version cache if explicitly provided
  if (options.webVersionCacheUrl) {
    clientOptions.webVersionCache = {
      type: 'remote',
      remotePath: options.webVersionCacheUrl,
    };
  }

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
