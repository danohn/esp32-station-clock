import test from 'node:test';
import assert from 'node:assert/strict';
import { ClockSerial, parseStatus, validateWifi } from '../site/clock-serial.js';
import { timezoneCommand } from '../site/timezone-picker.js';

test('timezone commands validate IANA IDs and preserve older firmware compatibility', () => {
  assert.equal(timezoneCommand('Sydney', true), 'Australia/Sydney');
  assert.equal(timezoneCommand('Asia/Calcutta', true), 'Asia/Kolkata');
  assert.equal(timezoneCommand('Australia/Sydney', false), 'Sydney');
  assert.equal(timezoneCommand('Berlin', false), 'Berlin');
  assert.throws(() => timezoneCommand('Europe/London', false), /firmware 0.3.0/);
  for (const invalid of ['__proto__', 'constructor', 'Europe/London\nDEMO', '', null, 'Atlantis/City'])
    assert.throws(() => timezoneCommand(invalid, true), /supported timezone/);
});

test('timezone capability comes from full status and is not lost to a partial boot reply', async () => {
  const link = new ClockSerial({}); link.running = true; const commands = [];
  link.consume('CLOCK_STATUS zone=Australia/Sydney epoch_us=1792544400000000 tzdb=2026e');
  link.consume('CLOCK_STATUS zone=Sydney time=startup');
  link.writer = { write: async bytes => { commands.push(new TextDecoder().decode(bytes).trim()); link.consume('CLOCK_OK timezone'); } };
  await link.setTimezone('Asia/Kathmandu');
  link.consume('CLOCK_STATUS zone=Sydney epoch_us=1792544400000000');
  await assert.rejects(link.setTimezone('Asia/Kathmandu'), /firmware 0.3.0/);
  await link.setTimezone('Australia/Sydney');
  assert.deepEqual(commands, ['TZ Asia/Kathmandu', 'TZ Sydney']);
});

test('Wi-Fi input counts UTF-8 bytes and supports open networks', () => {
  assert.doesNotThrow(() => validateWifi('platform', ''));
  assert.throws(() => validateWifi('é'.repeat(17), 'x'));
  assert.throws(() => validateWifi('platform', 'é'.repeat(32)));
  assert.throws(() => validateWifi('', 'x'));
});
test('only clock status replies are parsed', () => {
  assert.equal(parseStatus('I (123) boot: hello'), null);
  assert.deepEqual(parseStatus('CLOCK_STATUS time=2026-10-21T11:52:00 zone=Sydney epoch_us=1 demo=0'), {
    time: '2026-10-21T11:52:00', zone: 'Sydney', epoch_us: '1', demo: '0',
  });
});
test('startup status cannot acknowledge a time-setting command', async () => {
  const link = new ClockSerial({}); link.running = true;
  link.writer = { write: async () => { link.consume('CLOCK_STATUS time=startup zone=Sydney'); setTimeout(() => link.consume('CLOCK_OK time'), 10); } };
  await link.syncTime(); assert.equal(link.busy, false); assert.equal(link.waiters.size, 0);
});
test('a rejected command is surfaced and the next command can succeed', async () => {
  const link = new ClockSerial({}); link.running = true;
  link.writer = { write: async () => link.consume('CLOCK_ERROR invalid value') };
  await assert.rejects(link.setBrightness(65), /rejected/); assert.equal(link.busy, false);
  link.writer.write = async () => link.consume('CLOCK_OK brightness');
  await link.setBrightness(65);
});
test('credentials preserve quotes and spaces without being emitted as UI events', async () => {
  const link = new ClockSerial({}); link.running = true; let command;
  const events = [];
  for (const name of ['status', 'network', 'synchronised']) link.addEventListener(name, (e) => events.push(e.detail));
  link.writer = { write: async (bytes) => {
    command = new TextDecoder().decode(bytes);
    link.consume('CLOCK_OK wifi saved'); link.consume('I (5) esp_netif_handlers: sta ip: 192.0.2.10, mask: 255.255.255.0');
  } };
  const ip = await link.configureWifi('rail "network"', ' test-password ');
  assert.equal(ip, '192.0.2.10');
  assert.deepEqual(JSON.parse(command.slice(5)), { ssid: 'rail "network"', password: ' test-password ' });
  assert.ok(!JSON.stringify(events).includes('test-password'));
  assert.equal(link.waiters.size, 0);
});

test('theme selection validates IDs before writing and requires the theme acknowledgement', async () => {
  const link = new ClockSerial({}); link.running = true; const commands = [];
  link.writer = { write: async (bytes) => {
    commands.push(new TextDecoder().decode(bytes).trimEnd());
    link.consume('CLOCK_STATUS time=startup zone=Sydney theme=swiss');
    setTimeout(() => link.consume('CLOCK_OK theme'), 5);
  } };
  for (const value of ['', 'Swiss', 'db\nDEMO', 'unknown', null]) await assert.rejects(link.setTheme(value), /supported clock theme/);
  assert.equal(commands.length, 0);
  await link.setTheme('swiss'); await link.setTheme('db');
  assert.deepEqual(commands, ['THEME swiss', 'THEME db']); assert.equal(link.waiters.size, 0);
});

test('a rejected theme does not leave the serial link busy', async () => {
  const link = new ClockSerial({}); link.running = true;
  link.writer = { write: async () => link.consume('CLOCK_ERROR unknown theme') };
  await assert.rejects(link.setTheme('swiss'), /rejected/);
  assert.equal(link.busy, false); assert.equal(link.waiters.size, 0);
});
