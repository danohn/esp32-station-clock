/** Station Clock's existing text protocol over Web Serial. No credentials are logged or stored. */
export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export function validateWifi(ssid, password) {
  const bytes = (text) => new TextEncoder().encode(text).length;
  if (bytes(ssid) < 1 || bytes(ssid) > 32) throw new Error('Enter a network name of 1–32 UTF-8 bytes.');
  if (bytes(password) > 63) throw new Error('The Wi-Fi password must be at most 63 UTF-8 bytes.');
}
export function parseStatus(line) {
  if (!line.startsWith('CLOCK_STATUS ')) return null;
  return Object.fromEntries([...line.matchAll(/(\w+)=([^\s]+)/g)].map((m) => [m[1], m[2]]));
}
export class ClockSerial extends EventTarget {
  constructor(serial) {
    super(); this.serial = serial; this.port = null; this.waiters = new Set(); this.running = false; this.busy = false;
  }
  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  expect(predicate, timeout = 6000) {
    let entry;
    const promise = new Promise((resolve, reject) => {
      entry = { predicate, resolve, reject };
      entry.timer = setTimeout(() => {
        this.waiters.delete(entry);
        const error = new Error('The clock did not respond. Close other serial tools and reconnect.');
        error.name = 'ClockTimeoutError'; reject(error);
      }, timeout);
      this.waiters.add(entry);
    });
    // Avoid an unhandled rejection if a write fails before the caller awaits its reply.
    promise.catch(() => {});
    return { promise, cancel: () => { clearTimeout(entry.timer); this.waiters.delete(entry); } };
  }
  consume(line) {
    const status = parseStatus(line); if (status) this.emit('status', status);
    const ip = line.match(/sta ip:\s*([0-9.]+)/); if (ip) this.emit('network', { ip: ip[1] });
    if (line.includes('Network time synchronised')) this.emit('synchronised', true);
    for (const waiter of [...this.waiters]) {
      if (line.startsWith('CLOCK_ERROR')) {
        clearTimeout(waiter.timer); this.waiters.delete(waiter);
        waiter.reject(new Error('The clock rejected the command. Check the values and try again.'));
      } else if (waiter.predicate(line)) {
        clearTimeout(waiter.timer); this.waiters.delete(waiter); waiter.resolve(line);
      }
    }
  }
  async readLoop() {
    const decoder = new TextDecoder(); let buffer = '';
    try {
      while (this.running) {
        const { value, done } = await this.reader.read();
        if (done) {
          if (this.running) this.emit('connection-error', 'The USB connection was lost. Reconnect the clock.');
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        let newline;
        while ((newline = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newline).replace(/\r$/, ''); buffer = buffer.slice(newline + 1);
          this.consume(line);
        }
        if (buffer.length > 65536) buffer = '';
      }
    } catch { if (this.running) this.emit('connection-error', 'The USB connection was lost. Reconnect the clock.'); }
    finally {
      this.running = false;
      for (const waiter of this.waiters) { clearTimeout(waiter.timer); waiter.reject(new Error('The clock disconnected.')); }
      this.waiters.clear();
      this.reader.releaseLock();
    }
  }
  async connect() {
    if (this.port) throw new Error('Disconnect the existing session first.');
    const port = await this.serial.requestPort();
    try { await port.open({ baudRate: 115200, bufferSize: 8192 }); }
    catch { throw new Error('Could not open the clock. Close the installer, terminal, or other serial tool, then try again.'); }
    this.port = port;
    try {
      this.reader = port.readable.getReader(); this.writer = port.writable.getWriter(); this.running = true;
      this.readTask = this.readLoop();
      // Opening native USB can reset the ESP32-S3. Drain boot output before sending commands.
      await delay(1500);
      // A truncated log left in USB output can absorb the first reply into its line.
      // STATUS is read-only, so retry it within a bounded handshake window.
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          await this.command('STATUS', (line) => line.startsWith('CLOCK_STATUS '), 1500);
          break;
        } catch (error) {
          if (error.name !== 'ClockTimeoutError' || attempt === 3) throw error;
        }
      }
    } catch (error) { await this.disconnect(); throw error; }
  }
  async command(text, predicate = (line) => line.startsWith('CLOCK_OK '), timeout = 6000) {
    if (!this.running || !this.writer) throw new Error('Connect the clock first.');
    if (this.busy) throw new Error('Wait for the current operation to finish.');
    this.busy = true; const reply = this.expect(predicate, timeout);
    try { await this.writer.write(new TextEncoder().encode(text + '\n')); return await reply.promise; }
    finally { reply.cancel(); this.busy = false; }
  }
  async syncTime() { await this.command('TIME ' + String(Date.now() * 1000), (line) => line === 'CLOCK_OK time'); }
  async setTimezone(zone) {
    if (!['Sydney', 'Berlin', 'UTC'].includes(zone)) throw new Error('Select a supported timezone.');
    await this.command('TZ ' + zone);
  }
  async setBrightness(value) {
    if (!Number.isInteger(value) || value < 5 || value > 100) throw new Error('Brightness must be between 5 and 100.');
    await this.command('BRIGHTNESS ' + value);
  }
  async setTheme(theme) {
    if (!['db', 'swiss'].includes(theme)) throw new Error('Select a supported clock theme.');
    await this.command('THEME ' + theme, (line) => line === 'CLOCK_OK theme');
  }
  async configureWifi(ssid, password) {
    validateWifi(ssid, password);
    // Subscribe before sending: an open network can connect before the acknowledgement arrives.
    const connected = this.expect((line) => /sta ip:\s*[0-9.]+/.test(line), 35000);
    try {
      await this.command('WIFI ' + JSON.stringify({ ssid, password }), (line) => line === 'CLOCK_OK wifi saved');
      let line;
      try { line = await connected.promise; }
      catch { throw new Error('Wi-Fi connection was not confirmed. Check the network name, password, and 2.4 GHz availability, then try again.'); }
      return line.match(/sta ip:\s*([0-9.]+)/)[1];
    } finally { connected.cancel(); }
  }
  async disconnect() {
    if (!this.port) return;
    this.running = false;
    if (this.reader) { try { await this.reader.cancel(); } catch {} }
    if (this.readTask) await this.readTask;
    if (this.writer) { this.writer.releaseLock(); this.writer = null; }
    try { await this.port.close(); } catch {}
    this.port = null;
  }
}
