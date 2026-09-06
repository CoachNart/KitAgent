const DEVICE_KEY = 'kitagent.device.install.v3';

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function getDeviceBindingId() {
  const existing = localStorage.getItem(DEVICE_KEY);
  if (existing) return existing;

  const screenInfo = `${window.screen?.width || 0}x${window.screen?.height || 0}x${window.devicePixelRatio || 1}`;
  const signals = [
    navigator.userAgent || '',
    navigator.platform || '',
    navigator.language || '',
    Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    navigator.hardwareConcurrency || 0,
    navigator.deviceMemory || 0,
    screenInfo,
  ].join('|');

  const id = await sha256(signals);
  localStorage.setItem(DEVICE_KEY, id);
  return id;
}
