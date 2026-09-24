const STORAGE_KEY = 'kitagent_device_binding_v5';
const LEGACY_STORAGE_KEY = 'kitagent_device_binding_v3';

async function sha256(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function osFamily() {
  const platform = String(navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || '').toLowerCase();
  if (platform.includes('android')) return 'android';
  if (platform.includes('iphone') || platform.includes('ipad') || platform.includes('ios') || /macintosh/.test(platform) && navigator.maxTouchPoints > 1) return 'ios';
  if (platform.includes('win')) return 'windows';
  if (platform.includes('mac')) return 'mac';
  if (platform.includes('linux')) return 'linux';
  return 'other';
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

export function getDeviceBindingProfile() {
  const width = Number(screen.width) || 0;
  const height = Number(screen.height) || 0;
  const availWidth = Number(screen.availWidth) || 0;
  const availHeight = Number(screen.availHeight) || 0;
  return {
    osFamily: osFamily(),
    language: String(navigator.language || '').toLowerCase(),
    languages: Array.isArray(navigator.languages) ? navigator.languages.slice(0, 4).map(String).join(',').toLowerCase() : '',
    timezone: String(Intl.DateTimeFormat().resolvedOptions().timeZone || ''),
    hardwareConcurrency: Number(navigator.hardwareConcurrency) || 0,
    deviceMemory: Number(navigator.deviceMemory) || 0,
    screenWidth: width,
    screenHeight: height,
    availWidth,
    availHeight,
    colorDepth: Number(screen.colorDepth) || 0,
    pixelRatio: Math.round((Number(window.devicePixelRatio) || 0) * 100) / 100,
    maxTouchPoints: Number(navigator.maxTouchPoints) || 0,
    canvas: canvasSignal(),
    webgl: webglSignal(),
  };
}

export async function getDeviceBindingFingerprint() {
  const profile = getDeviceBindingProfile();
  const stable = [
    profile.osFamily,
    profile.language,
    profile.languages,
    profile.timezone,
    profile.hardwareConcurrency,
    profile.deviceMemory,
    profile.screenWidth,
    profile.screenHeight,
    profile.availWidth,
    profile.availHeight,
    profile.colorDepth,
    profile.pixelRatio,
    profile.maxTouchPoints,
  ].join('|');
  return sha256(stable);
}

export async function getDeviceBindingId() {
  const existing = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
  if (existing && /^[a-f0-9]{64}$/.test(existing)) return existing;
  const id = await getDeviceBindingFingerprint();
  localStorage.setItem(STORAGE_KEY, id);
  return id;
}
