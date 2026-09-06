const PREFIX = 'kitagent:';

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(PREFIX + key)) ?? fallback; } catch { return fallback; }
}
function write(key, value) { localStorage.setItem(PREFIX + key, JSON.stringify(value)); return value; }

export function getProfile() {
  const existing = read('profile', null);
  if (existing) return existing;
  return write('profile', { createdAt: Date.now(), premiumStartedAt: null, premiumDays: 0 });
}

export function activatePremium() {
  const profile = getProfile();
  return write('profile', { ...profile, premiumStartedAt: Date.now(), premiumDays: 30 });
}

export function getEntitlement() {
  const profile = getProfile();
  const now = Date.now();
  const trialEnds = profile.createdAt + 3 * 86400000;
  const premiumEnds = profile.premiumStartedAt ? profile.premiumStartedAt + profile.premiumDays * 86400000 : 0;
  if (premiumEnds > now) return { plan: 'premium', daysLeft: Math.ceil((premiumEnds - now) / 86400000) };
  if (trialEnds > now) return { plan: 'trial', daysLeft: Math.ceil((trialEnds - now) / 86400000) };
  return { plan: 'expired', daysLeft: 0 };
}

export function getTransactions() { return read('transactions', []); }
export function recordTransaction(tx) { return write('transactions', [{ ...tx, id: crypto.randomUUID?.() || String(Date.now()), createdAt: Date.now() }, ...getTransactions()]); }
export function getSignals() { return read('signals', []); }
export function recordSignal(signal) { return write('signals', [{ ...signal, id: crypto.randomUUID?.() || String(Date.now()), createdAt: Date.now() }, ...getSignals()]); }
