// -----------------------------------------------------------------------------
// Entry point of the Gladys external integration for legacy Pioneer receivers.
//
// Role of this file: wire the SDK to the device catalog (src/devices/). It holds
// no protocol logic (src/pioneer/) and no device logic (src/devices/). It only:
//   1. instantiates the SDK (connection, auth, reconnection: handled for you);
//   2. registers the event handlers BEFORE connect();
//   3. connects, publishes the receiver and opens the link to it.
//
// The SDK reads GLADYS_HOST_API_URL, GLADYS_INTEGRATION_TOKEN and
// GLADYS_INTEGRATION_SELECTOR from the environment set by Gladys.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './src/config.js';
import { buildDiscoveredDevices, findBlueprintByDevice } from './src/devices/index.js';
import { receiver } from './src/devices/receiver.js';
import { ACTIONS } from './src/actions.js';
import { SCENE_ACTIONS } from './src/scenes.js';

const gladys = new GladysIntegration();

// Current configuration (hot-reloaded via onConfigUpdated).
let config = normalizeConfig();

const notConfigured = {
  en: 'Enter the IP address of the receiver in the configuration.',
  fr: "Saisissez l'adresse IP de l'ampli dans la configuration.",
};

// --- Discovery: Gladys asks for the list of devices --------------------------
gladys.onScanRequest(async () => {
  logger.info('onScanRequest -> publishing the receiver');
  await gladys.publishDiscoveredDevices(buildDiscoveredDevices(gladys, config));
});

// --- Command: the user acts on a controllable feature ------------------------
gladys.onSetValue(async (device, feature, value) => {
  logger.info(`onSetValue <- ${feature.external_id} = ${JSON.stringify(value)}`);
  const blueprint = findBlueprintByDevice(gladys, device);
  if (!blueprint) {
    // Throw: the SDK sends a success:false acknowledgement to Gladys.
    throw new Error(`No command handler for ${device.external_id}`);
  }
  await blueprint.onSetValue(gladys, { device, feature, value, config });
});

// --- Manifest actions: buttons in the Configuration screen -------------------
for (const [actionKey, handler] of Object.entries(ACTIONS)) {
  gladys.onAction(actionKey, (fields) => handler(gladys, { fields, config }));
}

// --- Scene actions -----------------------------------------------------------
for (const [actionKey, handler] of Object.entries(SCENE_ACTIONS)) {
  gladys.onSceneAction(actionKey, (fields) => handler(gladys, { fields, config }));
}

// (Re)publish the receiver and (re)open the link to it with the current config.
async function applyConfig() {
  await gladys.publishDiscoveredDevices(buildDiscoveredDevices(gladys, config));
  if (!config.host) {
    receiver.stopPush();
    await gladys.setConnectionStatus(false, notConfigured);
    return;
  }
  receiver.startPush(gladys, config);
}

// --- Configuration updated by the user ---------------------------------------
gladys.onConfigUpdated(async (newConfig) => {
  logger.info('onConfigUpdated -> new configuration received');
  config = normalizeConfig(newConfig);
  await applyConfig();
});

// --- Connection lifecycle ----------------------------------------------------
// The link to the receiver is independent from the link to Gladys: it stays
// open when the Gladys WebSocket drops, so no state change is missed.
gladys.on('connected', async () => {
  try {
    config = normalizeConfig(await gladys.getConfig());
    await applyConfig();
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
  receiver.stopPush();
});

// --- Startup -----------------------------------------------------------------
logger.info('Starting the Pioneer legacy integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
