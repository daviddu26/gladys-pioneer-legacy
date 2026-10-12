// -----------------------------------------------------------------------------
// Entry point of the Gladys external integration for legacy Pioneer receivers.
//
// Role of this file: wire the SDK to the discovery (src/discovery.js) and to
// the receivers (src/devices/). It holds no protocol logic. It only:
//   1. instantiates the SDK (connection, auth, reconnection: handled for you);
//   2. registers the event handlers BEFORE connect();
//   3. connects, and opens a link to every receiver the user created.
//
// The SDK reads GLADYS_HOST_API_URL, GLADYS_INTEGRATION_TOKEN and
// GLADYS_INTEGRATION_SELECTOR from the environment set by Gladys.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './src/config.js';
import { discoverReceivers } from './src/discovery.js';
import { buildReceiverDevices, receiversFromDevices, receivers } from './src/devices/index.js';
import { ACTIONS } from './src/actions.js';
import { SCENE_ACTIONS } from './src/scenes.js';
import { WIDGETS, createRefresher } from './src/widgets.js';

const gladys = new GladysIntegration();

// Current configuration (hot-reloaded via onConfigUpdated).
let config = normalizeConfig();

// --- Discovery: the user clicked "Scan" in the Discovery tab -----------------
gladys.onScanRequest(async () => {
  try {
    await scan();
  } catch (err) {
    // The SDK only acks the failure to Gladys: log it, or it stays invisible.
    logger.error(`Scan failed: ${err.message}`);
    throw err;
  }
});

async function scan() {
  logger.info('onScanRequest -> looking for receivers');
  const { receivers: found, ignored } = await discoverReceivers(gladys, config);
  for (const { host, reason } of ignored) {
    if (reason === 'eiscp') {
      logger.info(`${host} is a recent receiver (Onkyo protocol): use the Onkyo integration`);
    }
  }
  logger.info(`Found ${found.length} receiver(s)`);
  await gladys.publishDiscoveredDevices(
    found.flatMap((r) => buildReceiverDevices(gladys, r, config)),
  );
}

// --- Command: the user acts on a controllable feature ------------------------
gladys.onSetValue(async (device, feature, value) => {
  logger.info(`onSetValue <- ${feature.external_id} = ${JSON.stringify(value)}`);
  await receivers.onSetValue(gladys, { device, feature, value, config });
});

// --- The user created, edited or deleted a receiver --------------------------
async function syncReceivers() {
  const devices = await gladys.getDevices();
  receivers.sync(gladys, devices);
  await reportStatus();
}
gladys.onDeviceCreated(syncReceivers);
gladys.onDeviceUpdated(syncReceivers);
gladys.onDeviceDeleted(syncReceivers);

// --- Manifest actions and scene actions --------------------------------------
for (const [actionKey, handler] of Object.entries(ACTIONS)) {
  gladys.onAction(actionKey, (fields) => handler(gladys, { fields, config }));
}
for (const [actionKey, handler] of Object.entries(SCENE_ACTIONS)) {
  gladys.onSceneAction(actionKey, (fields) => handler(gladys, { fields, config }));
}

// --- Dashboard widgets --------------------------------------------------------
for (const [widgetKey, widget] of Object.entries(WIDGETS)) {
  gladys.onWidgetGet(widgetKey, (request) => widget.get(gladys, { ...request, config }));
  gladys.onWidgetAction(widgetKey, (actionKey, params, { settings }) =>
    widget.action(gladys, { actionKey, params, settings, config }),
  );
}
// The computed tiles (power, input, mode) follow the receivers' states.
receivers.onStateChange(createRefresher(gladys));

// --- Configuration updated by the user ---------------------------------------
// The max volume and the input names shape the features: re-publish the
// receivers already created, rebuilt from their stored params (no probing).
gladys.onConfigUpdated(async (newConfig) => {
  logger.info('onConfigUpdated -> new configuration received');
  config = normalizeConfig(newConfig);
  const devices = await gladys.getDevices();
  const rebuilt = receiversFromDevices(gladys, devices).flatMap((r) =>
    buildReceiverDevices(gladys, r, config).filter((d) =>
      devices.some((existing) => existing.external_id === d.external_id),
    ),
  );
  if (rebuilt.length > 0) {
    await gladys.publishDiscoveredDevices(rebuilt).catch((err) => {
      logger.error(`Updating the receivers failed: ${err.message}`);
    });
  }
});

// --- Application-level status, shown in the Configuration screen ------------
async function reportStatus() {
  const list = receivers.list();
  const down = list.filter((c) => !c.connected).map((c) => c.key);
  if (list.length === 0) {
    await gladys.setConnectionStatus(false, {
      en: 'No receiver yet: run a scan in the Discovery tab.',
      fr: "Aucun ampli pour l'instant : lancez un scan dans l'onglet Découverte.",
    });
  } else if (down.length > 0) {
    await gladys.setConnectionStatus(false, {
      en: `Unreachable: ${down.join(', ')}. Is Network Standby on?`,
      fr: `Injoignable : ${down.join(', ')}. Le Network Standby est-il activé ?`,
    });
  } else {
    await gladys.setConnectionStatus(true);
  }
}
receivers.onStatusChange(() => {
  reportStatus().catch(() => {});
});

// --- Connection lifecycle ----------------------------------------------------
// The links to the receivers are independent from the link to Gladys: they
// stay open when the Gladys WebSocket drops, so no state change is missed.
gladys.on('connected', async () => {
  try {
    config = normalizeConfig(await gladys.getConfig());
    await syncReceivers();
  } catch (err) {
    logger.error('Post-connection initialization failed', err);
    await gladys
      .setConnectionStatus(false, {
        en: 'Initialization failed, check the integration logs.',
        fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
      })
      .catch(() => {});
  }
});

// --- Graceful shutdown -------------------------------------------------------
gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  receivers.stopAll();
});

// --- Startup -----------------------------------------------------------------
logger.info('Starting the Pioneer legacy integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
