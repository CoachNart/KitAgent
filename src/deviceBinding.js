const STORAGE_KEY = 'kitagent_device_binding_v4';

async function sha256(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function canvasSignal() {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 240; canvas.height = 60;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.textBaseline = 'top'; ctx.font = '16px Arial';
    ctx.fillText('KitSetups device verification', 7, 7);
    ctx.fillStyle = 'rgba(31, 119, 180, 0.7)'; ctx.fillRect(11, 32, 83, 17);
    return canvas.toDataURL();
  } catch { return ''; }
}

function webglSignal() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return '';
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) || '') : String(gl.getParameter(gl.RENDERER) || '');
  } catch { return ''; }
}

function stableDeviceSignals() {
  // Avoid browser-specific UA/client-hint values so different browsers on one device share the base signal.
  return [
    navigator.language || '',
    Array.isArray(navigator.languages) ? navigator.languages.slice(0, 4).join(',') : '',
    Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    navigator.hardwareConcurrency || '',
    `${screen.width}x${screen.height}`,
    `${screen.availWidth}x${screen.availHeight}`,
    screen.colorDepth || '',
    window.devicePixelRatio || '',
    navigator.maxTouchPoints || 0,
    navigator.cookieEnabled ? 'cookies' : 'no-cookies',
    canvasSignal(),
    webglSignal(),
  ].join('|');
}

export async function getDeviceBindingFingerprint() {
  return sha256(stableDeviceSignals());
}

export async function getDeviceBindingId() {
  const existing = localStorage.getItem(STORAGE_KEY);
  if (existing && /^[a-f0-9]{64}$/.test(existing)) return existing;
  const id = await getDeviceBindingFingerprint();
  localStorage.setItem(STORAGE_KEY, id);
  return id;
}