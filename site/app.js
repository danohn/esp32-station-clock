import { ClockSerial, validateWifi } from './clock-serial.js';
import { initPreview } from './clock-preview.js';
initPreview();
let themeSupported = false;
let themeDirty = false, themeEditRevision = 0;
function resetThemeSupport() {
  themeSupported = false; themeDirty = false; themeEditRevision++; $('clock-theme').disabled = true;
  $('theme-support').textContent = 'Connect a clock to choose its theme. The preview above is separate.';
}
const $ = (id) => document.getElementById(id);
const supported = window.isSecureContext && typeof navigator.serial?.requestPort === 'function';
const clock = new ClockSerial(navigator.serial);
const status = (message, error = false) => { $('connection-status').textContent = message; $('connection-status').classList.toggle('error', error); };
function controls(connected) {
  $('setup-fields').disabled = !connected; $('connect-button').hidden = connected; $('disconnect-button').hidden = !connected;
  $('clock-details').hidden = !connected;
  if (!connected) resetThemeSupport();
}
function userError(error) {
  return error?.name === 'NotFoundError' ? 'No USB device selected. Connect the board and try again.' : (error?.message || 'The operation could not be completed. Reconnect the clock and try again.');
}
async function operation(button, output, action) {
  const text = button.textContent; button.disabled = true;
  try { await action(); } catch (error) { output.textContent = userError(error); }
  finally { button.disabled = false; button.textContent = text; }
}
if (supported) {
  try {
    await import('./vendor/esp-web-tools/install-button.js');
    $('installer-loading').hidden = true;
  } catch {
    $('installer-loading').textContent = 'The installer did not load. Reload the page, or use the firmware download and command-line instructions.';
    $('board-confirm').disabled = true;
  }
} else {
  $('installer-container').hidden = true; $('board-confirm').disabled = true; $('connect-button').disabled = true;
  $('installer-loading').textContent = window.isSecureContext ? 'USB installation and setup need desktop Chrome or Edge with Web Serial support.' : 'USB installation and setup need HTTPS, or localhost for a local preview.';
  status('Use desktop Chrome or Edge to connect the clock over USB.');
}
$('board-confirm').addEventListener('change', (event) => { $('install-button').disabled = !event.target.checked; });
$('installer').addEventListener('state-changed', (event) => {
  if (event.detail?.state === 'finished') status('Installation finished. Close the installer dialog, then connect the clock here.');
});
$('connect-button').addEventListener('click', async () => {
  await operation($('connect-button'), $('connection-status'), async () => {
    status('Select the clock’s USB serial port…');
    resetThemeSupport();
    await clock.connect(); await clock.syncTime(); controls(true);
    $('install-button').disabled = true; $('board-confirm').disabled = true;
    status('Clock connected. Time set from this computer.');
  });
});
$('disconnect-button').addEventListener('click', async () => {
  await clock.disconnect(); controls(false); $('board-confirm').disabled = false;
  $('install-button').disabled = !$('board-confirm').checked; status('Clock disconnected.');
});
clock.addEventListener('status', (event) => {
  const info = event.detail;
  $('clock-time').textContent = (info.time || '').replace('T', ' ');
  $('clock-zone').textContent = info.zone || '';
  if (['Sydney', 'Berlin', 'UTC'].includes(info.zone)) $('timezone').value = info.zone;
  // A boot status may omit capabilities; only a full status determines support.
  if ('epoch_us' in info) {
    themeSupported = ['db', 'swiss'].includes(info.theme);
    $('clock-theme').disabled = !themeSupported;
    if (!themeSupported) { themeDirty = false; themeEditRevision++; }
    else if (!themeDirty) $('clock-theme').value = info.theme;
    $('theme-support').textContent = !themeSupported ? 'This firmware does not report a supported theme. Install the latest firmware to enable themes.' :
      themeDirty ? 'Theme change pending. Save display settings to apply it.' : 'Saved on the clock, including after a restart.';
  }
  const brightness = Number(info.brightness);
  if (Number.isInteger(brightness) && brightness >= 5 && brightness <= 100) {
    $('brightness').value = brightness; $('brightness-value').textContent = brightness + '%';
  }
});
clock.addEventListener('network', (event) => { $('network-state').textContent = 'Wi-Fi connected · ' + event.detail.ip; });
clock.addEventListener('synchronised', () => { $('network-state').textContent = 'Wi-Fi connected · network time synchronised'; });
clock.addEventListener('connection-error', (event) => {
  controls(false); status(event.detail, true);
  clock.disconnect().finally(() => { $('board-confirm').disabled = false; $('install-button').disabled = !$('board-confirm').checked; });
});
$('wifi-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const ssid = $('ssid').value; let password = $('password').value;
  await operation($('wifi-button'), $('wifi-status'), async () => {
    validateWifi(ssid, password);
    $('wifi-status').textContent = 'Saving settings and waiting for the network connection…';
    // Disable the other setup actions while the connection is being established.
    $('setup-fields').disabled = true;
    try {
      const pending = clock.configureWifi(ssid, password);
      $('password').value = ''; password = '';
      const ip = await pending;
      $('wifi-status').textContent = 'Connected to Wi-Fi at ' + ip + '. Time updates automatically from the network.';
    } finally { $('password').value = ''; password = ''; $('setup-fields').disabled = !clock.running; }
  });
});
$('clock-theme').addEventListener('change', () => {
  if (!themeSupported) return;
  themeDirty = true; themeEditRevision++;
  $('theme-support').textContent = 'Theme change pending. Save display settings to apply it.';
});
$('brightness').addEventListener('input', (event) => { $('brightness-value').textContent = event.target.value + '%'; });
$('save-display').addEventListener('click', () => operation($('save-display'), $('settings-status'), async () => {
  const saveTheme = themeSupported && themeDirty; const theme = $('clock-theme').value;
  const editRevision = themeEditRevision;
  await clock.setTimezone($('timezone').value); await clock.setBrightness(Number($('brightness').value));
  if (saveTheme) {
    await clock.setTheme(theme);
    // Preserve a newer edit made while the serial commands were in flight.
    if (themeEditRevision === editRevision) {
      themeDirty = false;
      $('theme-support').textContent = 'Saved on the clock, including after a restart.';
    }
  }
  await clock.command('STATUS', (line) => line.startsWith('CLOCK_STATUS '));
  $('settings-status').textContent = saveTheme ? 'Timezone, brightness and theme saved.' : 'Timezone and brightness saved.';
}));
$('sync-time').addEventListener('click', () => operation($('sync-time'), $('settings-status'), async () => {
  await clock.syncTime(); await clock.command('STATUS', (line) => line.startsWith('CLOCK_STATUS '));
  $('settings-status').textContent = 'Time set from this computer.';
}));
$('replay').addEventListener('click', () => operation($('replay'), $('settings-status'), async () => {
  await clock.command('DEMO', (line) => line.includes('Minute-change demonstration started'));
  $('settings-status').textContent = 'Replaying the minute change. Live time returns after 12 seconds.';
}));
try {
  const release = await (await fetch('./firmware/release.json')).json();
  document.querySelectorAll('[data-version]').forEach((node) => { node.textContent = 'v' + release.version; });
  if (release.repository && /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/.test(release.repository)) {
    $('source-link').href = release.repository;
  }
} catch { /* Offline preview retains the bundled version label. */ }
