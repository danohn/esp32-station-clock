// Only production pages report analytics. Local previews, forks and tests stay local.
const production = ['stationclock.net', 'www.stationclock.net'].includes(window.location.hostname);
const events = new Set(['Install Clicked', 'Firmware Download Clicked', 'Clock Connected', 'GitHub Clicked']);

export function track(event) {
  if (!production || !events.has(event)) return;
  // Named actions only: no form values, device details, serial logs or arbitrary props.
  try { window.plausible?.(event); } catch { /* Analytics must never interrupt USB setup. */ }
}

if (production) {
  window.plausible = window.plausible || function (...args) {
    (window.plausible.q = window.plausible.q || []).push(args);
  };
  window.plausible.init = window.plausible.init || function (options) { window.plausible.o = options || {}; };
  window.plausible.init();
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://analytics.danohn.com/js/pa-q75pBtpEil5K2tX8Zb3lH.js';
  script.dataset.domain = 'stationclock.net';
  document.head.append(script);
}
