const STORAGE_KEY = 'kitagent_device_binding_v3';

async function sha256(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function stableDeviceSignals() {
  const uaData = navigator.userAgentData;
  return [
    uaData?.platform || navigator.platform || '',
    navigator.language || '',
    Array.isArray(navigator.languages) ? navigator.languages.slice(0, 4).join(',') : '',
    Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    navigator.hardwareConcurrency || '',
    navigator.deviceMemory || '',
    `${screen.width}x${screen.height}`,
    `${screen.availWidth}x${screen.availHeight}`,
    screen.colorDepth || '',
    window.devicePixelRatio || '',
    navigator.maxTouchPoints || 0,
    navigator.cookieEnabled ? 'cookies' : 'no-cookies',
  ].join('|');
}

export async function getDeviceBindingId() {
  const existing = localStorage.getItem(STORAGE_KEY);
  if (existing && /^[a-f0-9]{64}$/.test(existing)) return existing;

  const id = await sha256(stableDeviceSignals());
  localStorage.setItem(STORAGE_KEY, id);
  return id;
}
