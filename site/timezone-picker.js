import { timezoneCatalog } from './timezones.js';

const legacyZones = { 'Australia/Sydney': 'Sydney', 'Europe/Berlin': 'Berlin', UTC: 'UTC' };
export function canonicalTimezone(value) {
  return typeof value === 'string' && Object.hasOwn(timezoneCatalog.aliases, value) ? timezoneCatalog.aliases[value] : null;
}
export function timezoneCommand(value, extended) {
  const id = canonicalTimezone(value);
  if (!id) throw new Error('Select a supported timezone.');
  if (extended) return id;
  if (Object.hasOwn(legacyZones, id)) return legacyZones[id];
  throw new Error('Install firmware 0.3.0 or later to use this timezone.');
}

export class TimezonePicker {
  constructor({ select, search, computer, hint }) {
    Object.assign(this, { select, search, computer, hint });
    this.extended = false; this.dirty = false; this.selected = 'Australia/Sydney';
    this.detected = canonicalTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    search.addEventListener('input', () => this.render());
    search.addEventListener('keydown', event => {
      // This control shares the Wi-Fi form; Enter should choose a location,
      // rather than submit saved network credentials.
      if (event.key === 'Enter') { event.preventDefault(); select.focus(); }
    });
    select.addEventListener('change', () => { this.selected = canonicalTimezone(select.value); this.dirty = true; this.render(); });
    computer.addEventListener('click', () => {
      if (!this.detected) return;
      this.selected = this.detected; this.dirty = true; search.value = ''; this.render();
    });
    this.reset();
  }
  reset() {
    this.extended = false; this.dirty = false; this.selected = 'Australia/Sydney';
    this.search.value = ''; this.render();
    this.hint.textContent = 'Connect a clock to choose its timezone.';
  }
  report(info) {
    // A partial boot reply does not describe the firmware's capabilities.
    if (!('epoch_us' in info)) return;
    const extended = Boolean(info.tzdb);
    if (extended !== this.extended) { this.dirty = false; this.search.value = ''; }
    this.extended = extended;
    const zone = canonicalTimezone(info.zone);
    if (zone && !this.dirty) this.selected = zone;
    this.render();
  }
  render() {
    let all = this.extended ? timezoneCatalog.locations : [
      { id: 'Australia/Sydney', label: 'Sydney' }, { id: 'Europe/Berlin', label: 'Berlin' }, { id: 'UTC', label: 'UTC' },
    ];
    // An IANA alias absent from zone.tab remains selectable when a clock reports it.
    if (this.extended && !all.some(zone => zone.id === this.selected)) {
      all = [...all, { id: this.selected, label: this.selected.replaceAll('_', ' ') }];
    }
    const query = this.search.value.trim().toLocaleLowerCase().replaceAll('_', ' ');
    const matches = all.filter(zone => zone.id === this.selected || `${zone.id.replaceAll('_', ' ')} ${zone.label}`.toLocaleLowerCase().includes(query));
    this.select.replaceChildren(...matches.map(zone => new Option(zone.label, this.extended ? zone.id : legacyZones[zone.id])));
    this.select.value = this.extended ? this.selected : legacyZones[this.selected] || 'Sydney';
    this.search.disabled = !this.extended;
    this.computer.disabled = !this.detected || (!this.extended && !Object.hasOwn(legacyZones, this.detected));
    const count = matches.filter(zone => zone.id !== this.selected).length;
    this.hint.textContent = !this.extended ? 'Install firmware 0.3.0 or later for the full timezone list.' : query ?
      `${count} other matching ${count === 1 ? 'location' : 'locations'}. Your current selection stays in the list.` :
      this.dirty ? 'Timezone change pending. Save display settings to apply it.' :
      'Daylight-saving changes are automatic. Saved on the clock.';
  }
  saved(value) {
    // Keep edits made while USB commands were in flight.
    if (canonicalTimezone(this.select.value) === canonicalTimezone(value)) this.dirty = false;
  }
}
