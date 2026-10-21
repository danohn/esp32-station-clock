import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('..', import.meta.url));
const out = path.join(root, '.local/site');
const firmware = path.join(root, 'firmware/db-station-clock-factory.bin');
let bytes;
try { bytes = await readFile(firmware); } catch { throw new Error('Package firmware first: uv run tools/package_firmware.py'); }
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const digest = createHash('sha256').update(bytes).digest('hex');
// Read before replacing the destination, so this is also safe when called repeatedly.
await rm(out, { recursive: true, force: true }); await mkdir(out, { recursive: true });
await cp(path.join(root, 'site'), out, { recursive: true });
await mkdir(path.join(out, 'assets'), { recursive: true });
for (const name of ['db-logo.svg', 'clock_dial.png', 'clock_hour.png', 'clock_minute.png', 'clock_second.png']) {
  await cp(path.join(root, 'assets', name), path.join(out, 'assets', name));
}
await cp(path.join(root, 'node_modules/esp-web-tools/dist/web'), path.join(out, 'vendor/esp-web-tools'), { recursive: true });
await cp(path.join(root, 'node_modules/esp-web-tools/LICENSE'), path.join(out, 'vendor/esp-web-tools/LICENSE.txt'));
await mkdir(path.join(out, 'firmware'), { recursive: true });
await writeFile(path.join(out, 'firmware/db-station-clock-factory.bin'), bytes);
await writeFile(path.join(out, 'firmware/SHA256SUMS.txt'), digest + '  db-station-clock-factory.bin\n');
const metadata = { version: pkg.version, board: 'ESP32-S3-Touch-AMOLED-1.8 V2', sha256: digest };
const repository = process.env.GITHUB_REPOSITORY;
if (repository && /^[\w.-]+\/[\w.-]+$/.test(repository)) metadata.repository = 'https://github.com/' + repository;
await writeFile(path.join(out, 'firmware/release.json'), JSON.stringify(metadata, null, 2) + '\n');
await writeFile(path.join(out, 'firmware/manifest.json'), JSON.stringify({
  name: 'DB Station Clock', version: pkg.version,
  new_install_prompt_erase: true, new_install_improv_wait_time: 0,
  builds: [{ chipFamily: 'ESP32-S3', parts: [{ path: './db-station-clock-factory.bin', offset: 0 }] }]
}, null, 2) + '\n');
await writeFile(path.join(out, '.nojekyll'), '');
console.log('Static installer prepared in ' + out);
