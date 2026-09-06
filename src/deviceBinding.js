const STORAGE_KEY = 'kitagent_device_binding_v2';

async function sha256(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function getDeviceBindingId() {
  const existing = localStorage.getItem(STORAGE_KEY);
  if (existing && /^[a-f0-9]{64}$/.test(existing)) return existing;

  const signals = [
    navigator.userAgent || '',
    navigator.platform || '',
    navigator.language || '',
    Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    navigator.hardwareConcurrency || '',
    navigator.deviceMemory || '',
    `${screen.width}x${screen.height}`,
    window.devicePixelRatio || '',
  ].join('|');

  const id = await sha256(signals);
  localStorage.setItem(STORAGE_KEY, id);
  return id;
}
