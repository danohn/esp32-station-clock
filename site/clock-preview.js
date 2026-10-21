const SVG = 'http://www.w3.org/2000/svg';
export const THEME_STORAGE_KEY = 'station-clock-theme';
export const DEFAULT_THEME = {
  id: 'db', label: 'DB', sweep_seconds: 58, advance_seconds: .18,
  assets: {
    dial: { path: 'clock_dial.png', width: 368, height: 448 },
    hour: { path: 'clock_hour.png', width: 32, height: 136, pivot: [16, 112] },
    minute: { path: 'clock_minute.png', width: 24, height: 190, pivot: [12, 170] },
    second: { path: 'clock_second.png', width: 48, height: 200, pivot: [24, 176] },
  },
};
export function validateCatalog(value) {
  if (!Array.isArray(value) || value.length !== 2) throw new Error('Invalid clock theme catalog');
  for (const [index, theme] of value.entries()) {
    if (theme?.id !== ['db', 'swiss'][index] || typeof theme.label !== 'string' || !theme.label.trim() || theme.label.length > 30 ||
        theme.sweep_seconds !== [58, 58.5][index] || !Number.isFinite(theme.advance_seconds) || theme.advance_seconds <= 0 || theme.advance_seconds > 1) throw new Error('Invalid clock theme');
    for (const name of ['dial', 'hour', 'minute', 'second']) {
      const asset = theme.assets?.[name];
      if (!asset || !/^(?:swiss\/)?clock_(?:dial|hour|minute|second)\.png$/.test(asset.path) ||
          !Number.isInteger(asset.width) || asset.width < 1 || asset.width > 448 || !Number.isInteger(asset.height) || asset.height < 1 || asset.height > 448 ||
          (name === 'dial' && (asset.width !== 368 || asset.height !== 448)) ||
          (name !== 'dial' && (!Array.isArray(asset.pivot) || asset.pivot.length !== 2 || asset.pivot.some((v, i) => !Number.isFinite(v) || v < 0 || v > [asset.width, asset.height][i])))) throw new Error('Invalid clock artwork');
    }
  }
  return value;
}
export function handAngles(date, theme) {
  const seconds = date.getSeconds() + date.getMilliseconds() / 1000;
  const progress = Math.min(seconds / theme.advance_seconds, 1);
  const advance = progress * progress * (3 - 2 * progress);
  const minutes = date.getHours() * 60 + date.getMinutes() - 1 + advance;
  return { hour: minutes * .5, minute: minutes * 6, second: seconds < theme.sweep_seconds ? seconds / theme.sweep_seconds * 360 : 0 };
}
export async function initPreview() {
  const svg = document.getElementById('clock-preview');
  const device = svg.closest('.device');
  const toggle = document.getElementById('theme-toggle');
  const label = document.getElementById('theme-label');
  const hint = document.getElementById('theme-hint');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let catalog = [DEFAULT_THEME];
  try {
    const response = await fetch('./assets/theme-catalog.json');
    if (!response.ok) throw new Error('Theme catalog unavailable');
    catalog = validateCatalog(await response.json());
    // Decode every face before making it selectable, avoiding an empty crossfade.
    await Promise.all(catalog.flatMap((theme) => Object.values(theme.assets).map(async (asset) => {
      const image = new Image(); image.src = './assets/' + asset.path; await image.decode();
    })));
  } catch { catalog = [DEFAULT_THEME]; }
  let stored;
  try { stored = localStorage.getItem(THEME_STORAGE_KEY); } catch { /* Private browsing can deny storage. */ }
  let selected = Math.max(0, catalog.findIndex((theme) => theme.id === stored));
  const layers = catalog.map((theme) => {
    const group = document.createElementNS(SVG, 'g'); group.classList.add('clock-theme'); group.dataset.theme = theme.id;
    const hands = {};
    for (const name of ['dial', 'hour', 'minute', 'second']) {
      const asset = theme.assets[name]; const image = document.createElementNS(SVG, 'image');
      image.setAttribute('href', './assets/' + asset.path); image.setAttribute('width', asset.width); image.setAttribute('height', asset.height);
      if (name === 'dial') group.append(image);
      else {
        const hand = document.createElementNS(SVG, 'g'); hand.dataset.hand = name;
        image.setAttribute('x', -asset.pivot[0]); image.setAttribute('y', -asset.pivot[1]);
        hand.append(image); group.append(hand); hands[name] = hand;
      }
    }
    return { theme, group, hands };
  });
  svg.replaceChildren(...layers.map(({ group }) => group));
  let labelTimer, transitionTimer;
  function finishTransition() {
    clearTimeout(transitionTimer);
    layers.forEach(({ group }, index) => {
      group.classList.remove('incoming', 'outgoing', 'fading');
      group.style.opacity = index === selected ? '1' : '0';
    });
  }
  function update(announce = false) {
    const theme = catalog[selected];
    layers.forEach(({ group }, index) => { group.classList.toggle('selected', index === selected); });
    svg.dataset.theme = theme.id;
    svg.setAttribute('aria-label', theme.label + ' station clock, live preview');
    toggle.setAttribute('aria-label', theme.label + ' selected. Switch to ' + catalog[(selected + 1) % catalog.length].label + ' clock');
    toggle.dataset.theme = theme.id;
    toggle.disabled = catalog.length < 2;
    document.getElementById('preview-caption').textContent = theme.sweep_seconds + ' s sweep / ' + (60 - theme.sweep_seconds) + ' s pause / Wi-Fi time sync';
    document.getElementById('clock-phase').textContent = theme.sweep_seconds + '-second sweep · ' + (60 - theme.sweep_seconds) + '-second pause';
    if (announce) {
      label.textContent = theme.label; label.classList.add('visible');
      clearTimeout(labelTimer); labelTimer = setTimeout(() => label.classList.remove('visible'), 1400);
      hint.hidden = true;
      try { localStorage.setItem(THEME_STORAGE_KEY, theme.id); } catch { /* The preview works without storage. */ }
    }
  }
  function switchTheme() {
    if (catalog.length < 2) return;
    // A second gesture settles the current target first, so every fade has an
    // opaque outgoing face beneath it, including when the direction reverses.
    finishTransition();
    const outgoing = layers[selected].group;
    selected = (selected + 1) % catalog.length;
    const incoming = layers[selected].group;
    svg.append(incoming); // The incoming face must composite above the old face.
    update(true);
    if (reduced.matches) { finishTransition(); return; }
    incoming.classList.add('incoming'); outgoing.classList.add('outgoing');
    // Commit the zero-opacity start before enabling the incoming transition.
    incoming.getBoundingClientRect();
    incoming.classList.add('fading'); incoming.style.opacity = '1';
    transitionTimer = setTimeout(finishTransition, 150);
  }
  toggle.addEventListener('click', switchTheme);
  toggle.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); switchTheme(); }
  });
  let start;
  device.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button') || !event.isPrimary || event.button !== 0) return;
    start = { x: event.clientX, y: event.clientY, id: event.pointerId };
    device.setPointerCapture(event.pointerId);
  });
  device.addEventListener('pointerup', (event) => {
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y; start = null;
    if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy) * 1.5) switchTheme();
  });
  device.addEventListener('pointercancel', () => { start = null; });
  hint.hidden = Boolean(stored) && catalog.length > 1;
  if (catalog.length < 2) hint.textContent = 'Swiss preview unavailable. Reload the page to try again.';
  update(); finishTransition();
  function draw() {
    const date = new Date();
    for (const { theme, hands } of layers) {
      const angles = handAngles(date, theme);
      for (const name of ['hour', 'minute', 'second']) hands[name].setAttribute('transform', 'translate(184 224) rotate(' + angles[name] + ')');
    }
    // Reduced motion keeps a useful clock while removing continuous sweeping and fades.
    if (reduced.matches) setTimeout(draw, 1000); else requestAnimationFrame(draw);
  }
  draw();
}
