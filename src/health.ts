import type { Client } from 'whatsapp-web.js';
import { HealthCheckResult } from './types.js';

/**
 * Performs an integration health check on the WhatsApp Web client before starting the extraction pipeline.
 */
export async function performHealthCheck(
  client: Client,
  log: (msg: string) => void = console.log
): Promise<HealthCheckResult> {
  log('\n====================================================');
  log('   🔍 RUNNING INTEGRATION HEALTH CHECK');
  log('====================================================');

  let isConnected = false;
  let isContactStoreReady = false;
  let hasLidResolver = false;
  let totalContactsInStore = 0;
  let syncHydrated = false;

  // 1. Connection check
  try {
    const info = (client as unknown as { info?: unknown }).info;
    isConnected = Boolean(info || client.pupPage);
    log(` • Connection Status        : ${isConnected ? 'OK (Connected)' : 'FAIL (Disconnected)'}`);
  } catch {
    log(' • Connection Status        : FAIL');
  }

  // 2. LID Resolver capability check
  hasLidResolver = typeof (client as unknown as { getContactLidAndPhone?: Function }).getContactLidAndPhone === 'function';
  log(` • LID Resolver Available   : ${hasLidResolver ? 'OK' : 'WARNING (Fallback mode)'}`);

  // 3. Contact Store & Sync Hydration check
  try {
    const contacts = await client.getContacts();
    totalContactsInStore = contacts.length;
    isContactStoreReady = true;

    // Check if contacts have hydrated isMyContact status
    const sample = contacts.slice(0, 20);
    const hydratedCount = sample.filter((c) => c.isMyContact !== undefined).length;
    syncHydrated = sample.length > 0 ? hydratedCount / sample.length >= 0.5 : true;

    log(` • Contact Store Readiness  : OK (${totalContactsInStore} contacts in store)`);
    log(` • Contact Sync Hydration   : ${syncHydrated ? 'OK (Hydrated)' : 'WARNING (Sync in progress)'}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(` • Contact Store Readiness  : WARNING (${msg})`);
  }

  log('----------------------------------------------------');
  const healthy = isConnected && isContactStoreReady;
  log(` Integration Health Verdict  : ${healthy ? 'HEALTHY - PROCEEDING' : 'ATTENTION REQUIRED'}`);
  log('====================================================\n');

  return {
    isConnected,
    isContactStoreReady,
    hasLidResolver,
    totalContactsInStore,
    syncHydrated,
  };
}
