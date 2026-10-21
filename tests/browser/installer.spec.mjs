import { test, expect } from '@playwright/test';
async function mockSerial(page) {
  await page.addInitScript(() => {
    const encoder = new TextEncoder(); let input; let open = false;
    window.fakeCommands = [];
    const line = (text) => input.enqueue(encoder.encode(text + '\n'));
    const port = {
      readable: new ReadableStream({ start(controller) { input = controller; } }),
      writable: new WritableStream({ write(bytes) {
        const command = new TextDecoder().decode(bytes).trimEnd(); window.fakeCommands.push(command);
        if (command === 'STATUS') line('CLOCK_STATUS time=2026-10-21T12:00:00.000 zone=Sydney epoch_us=1792544400000000 demo=0');
        else if (command.startsWith('TIME ')) { line('CLOCK_STATUS time=startup zone=Sydney'); line('CLOCK_OK time'); }
        else if (command.startsWith('WIFI ')) {
          line('CLOCK_OK wifi saved');
          setTimeout(() => { line('I (7) esp_netif_handlers: sta ip: 192.0.2.10, mask: 255.255.255.0'); line('I (8) station_clock: Network time synchronised'); }, 30);
        } else if (command.startsWith('TZ ')) line('CLOCK_OK timezone');
        else if (command.startsWith('BRIGHTNESS ')) line('CLOCK_OK brightness');
        else if (command === 'DEMO') line('I (9) station_clock: Minute-change demonstration started (12 seconds)');
      } }),
      async open() { open = true; line('CLOCK_READY version=0.1.0'); },
      async close() { open = false; },
      getInfo() { return { usbVendorId: 0x303a, usbProductId: 0x1001 }; },
    };
    Object.defineProperty(navigator, 'serial', { configurable: true, value: { requestPort: async () => port } });
  });
}
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
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: '.local/site-mobile.png', fullPage: true });
});
