import { test, expect } from '@playwright/test';

test('local previews never load the production analytics tracker', async ({ page }) => {
  const analytics = [];
  page.on('request', request => { if (new URL(request.url()).hostname === 'analytics.danohn.com') analytics.push(request.url()); });
  await mockSerial(page); await page.goto('/');
  await expect(page.locator('#installer-loading')).toBeHidden();
  await page.getByRole('button', { name: 'Connect clock', exact: true }).click();
  await expect(page.locator('#connection-status')).toContainText('Clock connected.');
  expect(analytics).toEqual([]);
});

test('production analytics sends named actions without setup values or serial details', async ({ page }) => {
  // Serve the local build under its production hostname, intercepting every tracker request.
  await page.route('https://stationclock.net/**', async route => {
    const url = new URL(route.request().url());
    const response = await page.request.get('http://localhost:4173' + url.pathname + url.search);
    await route.fulfill({ response });
  });
  await page.route('https://analytics.danohn.com/**', async route => {
    expect(new URL(route.request().url()).pathname).toBe('/js/pa-q75pBtpEil5K2tX8Zb3lH.js');
    await route.fulfill({ contentType: 'text/javascript', body: `
      window.recordedAnalytics = [];
      const queued = window.plausible?.q || [];
      window.plausible = (...args) => window.recordedAnalytics.push(args);
      queued.forEach(args => window.plausible(...args));
    ` });
  });
  await mockSerial(page); await page.goto('https://stationclock.net/');
  await expect(page.locator('#installer-loading')).toBeHidden();
  await expect(page.locator('script[data-domain="stationclock.net"]')).toHaveAttribute('src', 'https://analytics.danohn.com/js/pa-q75pBtpEil5K2tX8Zb3lH.js');
  await page.getByRole('button', { name: 'Connect clock', exact: true }).click();
  await expect(page.locator('#connection-status')).toContainText('Clock connected.');
  await page.locator('#ssid').fill('Private test network');
  await page.locator('#password').fill('private-test-password');
  await page.getByRole('button', { name: 'Save & connect Wi-Fi' }).click();
  await expect(page.locator('#wifi-status')).toContainText('Connected to Wi-Fi');
  await page.evaluate(async () => {
    const { track } = await import('/analytics.js');
    track('Firmware Download Clicked');
    track('not-an-approved-event');
  });
  expect(await page.evaluate(() => window.recordedAnalytics)).toEqual([
    ['Clock Connected'], ['Firmware Download Clicked'],
  ]);
});

test('blocked analytics does not prevent production USB setup', async ({ page }) => {
  await page.route('https://stationclock.net/**', async route => {
    const url = new URL(route.request().url());
    const response = await page.request.get('http://localhost:4173' + url.pathname + url.search);
    await route.fulfill({ response });
  });
  await page.route('https://analytics.danohn.com/**', route => route.abort('blockedbyclient'));
  await mockSerial(page); await page.goto('https://stationclock.net/');
  await expect(page.locator('#installer-loading')).toBeHidden();
  await page.getByRole('button', { name: 'Connect clock', exact: true }).click();
  await expect(page.locator('#connection-status')).toHaveText('Clock connected. Time set from this computer.');
});
async function mockSerial(page, { fragmentFirstStatus = false, theme = null } = {}) {
  await page.addInitScript(({ fragmentFirstStatus, theme }) => {
    const encoder = new TextEncoder(); let input; let open = false; let statusRequests = 0;
    window.fakeCommands = []; window.fakeTheme = theme; window.fakeBrightness = 65;
    const line = (text) => input.enqueue(encoder.encode(text + '\n'));
    const statusLine = () => 'CLOCK_STATUS time=2026-10-21T12:00:00.000 zone=Sydney epoch_us=1792544400000000 demo=0' +
      (window.fakeTheme === null ? '' : ' theme=' + window.fakeTheme + ' brightness=' + window.fakeBrightness);
    window.fakePhysicalTheme = (value) => { window.fakeTheme = value; line(statusLine()); };
    const port = {
      readable: new ReadableStream({ start(controller) { input = controller; } }),
      writable: new WritableStream({ write(bytes) {
        const command = new TextDecoder().decode(bytes).trimEnd(); window.fakeCommands.push(command);
        if (command === 'STATUS') {
          statusRequests++;
          const status = statusLine();
          line(fragmentFirstStatus && statusRequests === 1 ? 'I (123) station_clock: Animation updates 46' + status : status);
        }
        else if (command.startsWith('TIME ')) { line('CLOCK_STATUS time=startup zone=Sydney'); line('CLOCK_OK time'); }
        else if (command.startsWith('WIFI ')) {
          line('CLOCK_OK wifi saved');
          setTimeout(() => { line('I (7) esp_netif_handlers: sta ip: 192.0.2.10, mask: 255.255.255.0'); line('I (8) station_clock: Network time synchronised'); }, 30);
        } else if (command.startsWith('TZ ')) line('CLOCK_OK timezone');
        else if (command.startsWith('BRIGHTNESS ')) { window.fakeBrightness = Number(command.slice(11)); line('CLOCK_OK brightness'); }
        else if (command.startsWith('THEME ')) { window.fakeTheme = command.slice(6); line('CLOCK_OK theme'); }
        else if (command === 'DEMO') line('I (9) station_clock: Minute-change demonstration started (12 seconds)');
      } }),
      async open() { open = true; this.readable = new ReadableStream({ start(controller) { input = controller; } }); line('CLOCK_READY version=0.1.0'); },
      async close() { open = false; },
      getInfo() { return { usbVendorId: 0x303a, usbProductId: 0x1001 }; },
    };
    Object.defineProperty(navigator, 'serial', { configurable: true, value: { requestPort: async () => port } });
  }, { fragmentFirstStatus, theme });
}
test('connection recovers when a partial boot log hides the first status reply', async ({ page }) => {
  await mockSerial(page, { fragmentFirstStatus: true }); await page.goto('/');
  await page.getByRole('button', { name: 'Connect clock', exact: true }).click();
  await expect(page.locator('#connection-status')).toHaveText('Clock connected. Time set from this computer.');
  const commands = await page.evaluate(() => window.fakeCommands);
  expect(commands.filter((command) => command === 'STATUS')).toHaveLength(2);
  expect(commands.filter((command) => command.startsWith('TIME '))).toHaveLength(1);
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await expect(page.locator('#connection-status')).toHaveText('Clock disconnected.');
});
test('installer library loads and board confirmation controls installation', async ({ page }) => {
  await mockSerial(page); await page.goto('/');
  await expect(page.locator('#installer-loading')).toBeHidden();
  await expect(page.locator('#install-button')).toBeDisabled();
  await page.locator('#board-confirm').check();
  await expect(page.locator('#install-button')).toBeEnabled();
  expect(await page.evaluate(() => !!customElements.get('esp-web-install-button'))).toBe(true);
  const manifest = await (await page.request.get('/firmware/manifest.json')).json();
  expect(manifest.builds[0].chipFamily).toBe('ESP32-S3'); expect(manifest.builds[0].parts[0].offset).toBe(0);
  const binary = await page.request.get('/firmware/db-station-clock-factory.bin'); expect(binary.status()).toBe(200);
  expect((await binary.body())[0]).toBe(0xe9);
});
test('setup sends credentials over serial, clears the password, and saves display settings', async ({ page }) => {
  await mockSerial(page); await page.goto('/');
  await page.getByRole('button', { name: 'Connect clock', exact: true }).click();
  await expect(page.locator('#connection-status')).toHaveText('Clock connected. Time set from this computer.');
  await page.locator('#ssid').fill('Test platform'); await page.locator('#password').fill('browser-test-only');
  await page.getByRole('button', { name: 'Save & connect Wi-Fi' }).click();
  await expect(page.locator('#wifi-status')).toContainText('Connected to Wi-Fi at 192.0.2.10');
  await expect(page.locator('#password')).toHaveValue('');
  await page.locator('#timezone').selectOption('Berlin');
  await page.getByRole('button', { name: 'Save display settings' }).click();
  await expect(page.locator('#save-display')).toBeEnabled();
  await expect(page.locator('#settings-status')).toHaveText('Timezone and brightness saved.');
  const commands = await page.evaluate(() => window.fakeCommands);
  expect(commands.some((c) => c.startsWith('WIFI '))).toBe(true); expect(commands).toContain('TZ Berlin');
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  expect(await page.locator('body').innerText()).not.toContain('browser-test-only');
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await expect(page.locator('#connection-status')).toHaveText('Clock disconnected.');
});
test('unsupported browsers get a useful message and USB controls stay disabled', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(navigator, 'serial', { configurable: true, value: undefined }); });
  await page.goto('/');
  await expect(page.locator('#installer-loading')).toContainText('desktop Chrome or Edge');
  await expect(page.locator('#connect-button')).toBeDisabled();
});
test('mobile layout has no horizontal overflow', async ({ page }) => {
  await mockSerial(page); await page.setViewportSize({ width: 375, height: 812 }); await page.goto('/');
  await expect(page.locator('#theme-toggle')).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.locator('.clock-theme.selected')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: '.local/site-mobile.png', fullPage: true });
  await page.locator('#theme-toggle').click();
  await expect(page.locator('#clock-preview')).toHaveAttribute('data-theme', 'swiss');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.locator('.clock-theme.selected')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: '.local/site-mobile-swiss.png', fullPage: true });
});

async function swipePreview(page, dx, dy = 0) {
  const box = await page.locator('#clock-preview').boundingBox();
  const x = box.x + box.width / 2 - dx / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 }); await page.mouse.up();
}
test('preview changes themes by deliberate swipes and the accessible pill, and remembers only the theme', async ({ page }) => {
  await mockSerial(page); await page.goto('/');
  await expect(page.locator('#theme-toggle')).toBeEnabled();
  await expect(page.locator('#theme-hint')).toBeVisible();
  await expect(page.locator('#clock-preview')).toHaveAttribute('data-theme', 'db');
  await swipePreview(page, -90);
  await expect(page.locator('#clock-preview')).toHaveAttribute('data-theme', 'swiss');
  await expect(page.locator('#preview-caption')).toContainText('58.5 s sweep');
  await expect(page.locator('#theme-label')).toHaveText('Swiss');
  await expect(page.locator('#theme-hint')).toBeHidden();
  await swipePreview(page, 90);
  await expect(page.locator('#clock-preview')).toHaveAttribute('data-theme', 'db');
  await swipePreview(page, 15); await swipePreview(page, 50, 90);
  await expect(page.locator('#clock-preview')).toHaveAttribute('data-theme', 'db');
  await page.getByRole('button', { name: 'DB selected. Switch to Swiss clock' }).click();
  await expect(page.locator('#clock-preview')).toHaveAttribute('data-theme', 'swiss');
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual({ 'station-clock-theme': 'swiss' });
  await page.reload();
  await expect(page.locator('#clock-preview')).toHaveAttribute('data-theme', 'swiss');
  await expect(page.locator('#theme-hint')).toBeHidden();
  await page.locator('#theme-toggle').focus(); await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#clock-preview')).toHaveAttribute('data-theme', 'db');
  await page.keyboard.press('Enter');
  await expect(page.locator('#clock-preview')).toHaveAttribute('data-theme', 'swiss');
});
test('theme switches keep current hand positions and reduced motion removes crossfades', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install({ time: new Date(2026, 9, 21, 12, 0, 58, 250) });
  await mockSerial(page); await page.goto('/');
  await expect(page.locator('#theme-toggle')).toBeEnabled();
  const db = page.locator('.clock-theme[data-theme="db"] [data-hand="second"]');
  const swiss = page.locator('.clock-theme[data-theme="swiss"] [data-hand="second"]');
  await expect(db).toHaveAttribute('transform', 'translate(184 224) rotate(0)');
  expect(await swiss.getAttribute('transform')).not.toContain('rotate(0)');
  await page.locator('#theme-toggle').click();
  expect(await page.locator('.clock-theme.selected').evaluate((node) => getComputedStyle(node).transitionDuration)).toBe('0s');
  await page.clock.runFor(1000);
  await expect(swiss).toHaveAttribute('transform', 'translate(184 224) rotate(0)');
});
test('failed or malformed theme metadata leaves a usable DB preview and USB setup', async ({ page }) => {
  await mockSerial(page);
  await page.route('**/theme-catalog.json', (route) => route.fulfill({ contentType: 'application/json', body: '[{"id":"swiss","assets":{"dial":{"path":"../bad.png"}}}]' }));
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#clock-preview')).toHaveAttribute('data-theme', 'db');
  await expect(page.locator('#theme-toggle')).toBeDisabled();
  await expect(page.locator('#clock-preview image').first()).toHaveAttribute('href', './assets/clock_dial.png');
  await page.getByRole('button', { name: 'Connect clock', exact: true }).click();
  await expect(page.locator('#connection-status')).toContainText('Clock connected.');
  expect(errors).toEqual([]);
});
test('USB theme setting follows the clock and disables on reconnecting old firmware', async ({ page }) => {
  await mockSerial(page, { theme: 'swiss' }); await page.goto('/');
  await page.getByRole('button', { name: 'Connect clock', exact: true }).click();
  await expect(page.locator('#clock-theme')).toBeEnabled();
  await expect(page.locator('#clock-theme')).toHaveValue('swiss');
  await page.locator('#clock-theme').selectOption('db');
  await page.getByRole('button', { name: 'Save display settings' }).click();
  await expect(page.locator('#save-display')).toBeEnabled();
  await expect(page.locator('#settings-status')).toHaveText('Timezone, brightness and theme saved.');
  expect(await page.evaluate(() => window.fakeCommands)).toContain('THEME db');
  await page.locator('#clock-theme').selectOption('swiss'); // An unsaved choice must not survive reconnect.
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await expect(page.locator('#clock-theme')).toBeDisabled();
  await page.evaluate(() => { window.fakeTheme = null; window.fakeCommands = []; });
  await page.getByRole('button', { name: 'Connect clock', exact: true }).click();
  await expect(page.locator('#connection-status')).toContainText('Clock connected.');
  await expect(page.locator('#clock-theme')).toBeDisabled();
  await expect(page.locator('#theme-support')).toContainText('Install the latest firmware');
  await page.getByRole('button', { name: 'Save display settings' }).click();
  await expect(page.locator('#save-display')).toBeEnabled();
  await expect(page.locator('#settings-status')).toHaveText('Timezone and brightness saved.');
  expect((await page.evaluate(() => window.fakeCommands)).some((line) => line.startsWith('THEME '))).toBe(false);
});
test('unknown reported themes are treated as unsupported firmware', async ({ page }) => {
  await mockSerial(page, { theme: 'invalid' }); await page.goto('/');
  await page.getByRole('button', { name: 'Connect clock', exact: true }).click();
  await expect(page.locator('#connection-status')).toContainText('Clock connected.');
  await expect(page.locator('#clock-theme')).toBeDisabled();
});

test('incoming face fades above an opaque outgoing face and rapid toggles settle cleanly', async ({ page }) => {
  await mockSerial(page); await page.goto('/');
  await expect(page.locator('#theme-toggle')).toBeEnabled();
  await page.clock.install(); await page.clock.pauseAt(new Date());
  await page.locator('#theme-toggle').click();
  await expect(page.locator('.clock-theme.outgoing')).toHaveAttribute('data-theme', 'db');
  await expect(page.locator('.clock-theme.outgoing')).toHaveCSS('opacity', '1');
  await expect(page.locator('.clock-theme.incoming')).toHaveAttribute('data-theme', 'swiss');
  await expect(page.locator('.clock-theme.incoming')).toHaveCSS('transition-duration', '0.15s');
  expect(await page.locator('#clock-preview > g').last().getAttribute('data-theme')).toBe('swiss');
  // Stop before the completion timer, then reverse repeatedly. Each new target
  // becomes the top layer without leaving the dial transparent underneath it.
  for (const theme of ['db', 'swiss', 'db']) {
    await page.locator('#theme-toggle').click();
    await expect(page.locator('.clock-theme.incoming')).toHaveAttribute('data-theme', theme);
    await expect(page.locator('.clock-theme.outgoing')).toHaveCSS('opacity', '1');
    expect(await page.locator('#clock-preview > g').last().getAttribute('data-theme')).toBe(theme);
  }
  await page.clock.runFor(160);
  await expect(page.locator('.clock-theme.incoming, .clock-theme.outgoing')).toHaveCount(0);
  await expect(page.locator('.clock-theme.selected')).toHaveAttribute('data-theme', 'db');
  await expect(page.locator('.clock-theme.selected')).toHaveCSS('opacity', '1');
  await expect(page.locator('.clock-theme:not(.selected)')).toHaveCSS('opacity', '0');
});

test('brightness saves never overwrite a physical theme change or a stale reported theme', async ({ page }) => {
  await mockSerial(page, { theme: 'db' }); await page.goto('/');
  await page.getByRole('button', { name: 'Connect clock', exact: true }).click();
  await expect(page.locator('#connection-status')).toContainText('Clock connected.');
  await expect(page.locator('#clock-theme')).toHaveValue('db');
  // The device changes immediately; its status can arrive after another save.
  await page.evaluate(() => { window.fakeTheme = 'swiss'; window.fakeCommands = []; });
  await page.locator('#brightness').fill('70');
  await page.getByRole('button', { name: 'Save display settings' }).click();
  await expect(page.locator('#save-display')).toBeEnabled();
  await expect(page.locator('#settings-status')).toHaveText('Timezone and brightness saved.');
  await expect(page.locator('#clock-theme')).toHaveValue('swiss');
  expect(await page.evaluate(() => window.fakeCommands)).toContain('BRIGHTNESS 70');
  expect((await page.evaluate(() => window.fakeCommands)).filter((command) => command.startsWith('THEME '))).toEqual([]);
  // A later physical change updates a clean selector directly.
  await page.evaluate(() => window.fakePhysicalTheme('db'));
  await expect(page.locator('#clock-theme')).toHaveValue('db');
  await page.locator('#brightness').fill('75');
  await page.getByRole('button', { name: 'Save display settings' }).click();
  await expect(page.locator('#save-display')).toBeEnabled();
  await expect(page.locator('#settings-status')).toHaveText('Timezone and brightness saved.');
  expect((await page.evaluate(() => window.fakeCommands)).filter((command) => command.startsWith('THEME '))).toEqual([]);
});

test('explicit pending theme choices survive status updates and become clean after saving', async ({ page }) => {
  await mockSerial(page, { theme: 'db' }); await page.goto('/');
  await page.getByRole('button', { name: 'Connect clock', exact: true }).click();
  await expect(page.locator('#connection-status')).toContainText('Clock connected.');
  await page.locator('#clock-theme').selectOption('swiss');
  await expect(page.locator('#theme-support')).toContainText('Theme change pending');
  await page.evaluate(() => window.fakePhysicalTheme('db'));
  await page.getByRole('button', { name: 'Sync time now' }).click();
  await expect(page.locator('#settings-status')).toHaveText('Time set from this computer.');
  await expect(page.locator('#clock-theme')).toHaveValue('swiss');
  await page.getByRole('button', { name: 'Save display settings' }).click();
  await expect(page.locator('#save-display')).toBeEnabled();
  await expect(page.locator('#settings-status')).toHaveText('Timezone, brightness and theme saved.');
  expect((await page.evaluate(() => window.fakeCommands)).filter((command) => command.startsWith('THEME '))).toEqual(['THEME swiss']);
  await page.evaluate(() => window.fakePhysicalTheme('db'));
  await expect(page.locator('#clock-theme')).toHaveValue('db');
  await expect(page.locator('#theme-support')).not.toContainText('pending');
  await page.getByRole('button', { name: 'Save display settings' }).click();
  await expect(page.locator('#save-display')).toBeEnabled();
  await expect(page.locator('#settings-status')).toHaveText('Timezone and brightness saved.');
  expect((await page.evaluate(() => window.fakeCommands)).filter((command) => command.startsWith('THEME '))).toEqual(['THEME swiss']);
  // A pending edit is also discarded when reconnecting current firmware.
  await page.locator('#clock-theme').selectOption('swiss');
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await page.getByRole('button', { name: 'Connect clock', exact: true }).click();
  await expect(page.locator('#connection-status')).toContainText('Clock connected.');
  await expect(page.locator('#clock-theme')).toHaveValue('db');
  await page.getByRole('button', { name: 'Save display settings' }).click();
  await expect(page.locator('#save-display')).toBeEnabled();
  await expect(page.locator('#settings-status')).toHaveText('Timezone and brightness saved.');
  expect((await page.evaluate(() => window.fakeCommands)).filter((command) => command.startsWith('THEME '))).toEqual(['THEME swiss']);
});
