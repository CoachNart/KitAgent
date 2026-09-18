const admin = require('firebase-admin');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');

admin.initializeApp();
const db = admin.firestore();
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

function cleanDeviceId(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : null;
}

function getRequestIp(request) {
  return request.rawRequest?.headers?.['x-forwarded-for']?.split(',')[0]?.trim()
    || request.rawRequest?.ip
    || null;
}

exports.initializeKitAgentAccount = onCall({ region: 'us-central1', enforceAppCheck: false }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in is required.');

  const uid = request.auth.uid;
  const deviceBindingId = cleanDeviceId(request.data?.deviceBindingId);
  if (!deviceBindingId) throw new HttpsError('invalid-argument', 'A valid device binding is required.');

  const userRef = db.doc(`users/${uid}`);
  const deviceRef = db.doc(`deviceBindings/${deviceBindingId}`);
  const requestIp = getRequestIp(request);

  try {
    const result = await db.runTransaction(async (transaction) => {
      const [userSnapshot, deviceSnapshot] = await Promise.all([
        transaction.get(userRef),
        transaction.get(deviceRef),
      ]);

      if (deviceSnapshot.exists && deviceSnapshot.data().uid !== uid) {
        throw new HttpsError('permission-denied', 'This device is already linked to another KitAgent account.');
      }

      if (userSnapshot.exists) {
        const profile = userSnapshot.data();
        if (profile.deviceBindingId && profile.deviceBindingId !== deviceBindingId) {
          throw new HttpsError('permission-denied', 'This KitAgent account is linked to another device. Account recovery is required.');
        }

        transaction.set(userRef, {
          lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
          lastSeenIp: requestIp,
        }, { merge: true });

        if (!deviceSnapshot.exists) {
          transaction.create(deviceRef, {
            uid,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
            lastSeenIp: requestIp,
          });
        } else {
          transaction.set(deviceRef, {
            lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
            lastSeenIp: requestIp,
          }, { merge: true });
        }

        return { ok: true, created: false };
      }

      const now = admin.firestore.Timestamp.now();
      const trialEndsAt = admin.firestore.Timestamp.fromMillis(now.toMillis() + THREE_DAYS_MS);
      const profile = {
        email: request.auth.token.email || '',
        createdAt: now,
        trialStartedAt: now,
        trialEndsAt,
        premiumUntil: null,
        walletAddress: null,
        maxRiskPercent: 1.5,
        maxTradeSize: 1000,
        deviceBindingId,
        status: 'active',
        lastSeenAt: now,
        lastSeenIp: requestIp,
      };

      transaction.create(userRef, profile);
      transaction.create(deviceRef, {
        uid,
        createdAt: now,
        lastSeenAt: now,
        lastSeenIp: requestIp,
      });
      return { ok: true, created: true };
    });

    return result;
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('initializeKitAgentAccount failed', {
      code: error?.code,
      message: error?.message,
      uid,
    });
    throw new HttpsError('internal', 'KitAgent could not finish account verification. Please try again.');
  }
});


const BYBIT_BASE = 'https://api.bybit.com';
const ALERT_STATE_REF = db.doc('system/marketAlerts');
const ALERT_SYMBOL_LIMIT = 5;
const ALERT_INTERVAL = '5';
const ALERT_LOOKBACK = 150;

async function bybitJson(path, params = {}) {
  const url = new URL(`${BYBIT_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Bybit HTTP ${response.status}`);
  const body = await response.json();
  if (body?.retCode !== 0) throw new Error(body?.retMsg || 'Bybit request failed');
  return body;
}

function bybitCandles(rows) {
  return (Array.isArray(rows) ? rows.slice(1).reverse() : [])
    .map(row => ({
      time: Number(row[0]),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
    }))
    .filter(candle => [candle.time, candle.open, candle.high, candle.low, candle.close].every(Number.isFinite));
}

function pivotHigh(candles, index) {
  if (index < 2 || index >= candles.length - 2) return false;
  const high = candles[index].high;
  return high > candles[index - 1].high && high >= candles[index + 1].high
    && high > candles[index - 2].high && high >= candles[index + 2].high;
}

function pivotLow(candles, index) {
  if (index < 2 || index >= candles.length - 2) return false;
  const low = candles[index].low;
  return low < candles[index - 1].low && low <= candles[index + 1].low
    && low < candles[index - 2].low && low <= candles[index + 2].low;
}

function latestStructureEvent(candles) {
  if (candles.length < 30) return null;
  const highs = [], lows = [];
  for (let i = 2; i < candles.length - 2; i++) {
    if (pivotHigh(candles, i)) highs.push({ price: candles[i].high, index: i });
    if (pivotLow(candles, i)) lows.push({ price: candles[i].low, index: i });
  }
  const last = candles.at(-1);
  const previous = candles.at(-2);
  const high = highs.at(-1);
  const low = lows.at(-1);
  if (!last || !previous) return null;
  if (high && previous.close <= high.price && last.close > high.price) {
    return { direction: 'LONG', type: 'BOS', level: high.price, candleTime: last.time };
  }
  if (low && previous.close >= low.price && last.close < low.price) {
    return { direction: 'SHORT', type: 'BOS', level: low.price, candleTime: last.time };
  }
  return null;
}

async function getAlertSymbols() {
  const body = await bybitJson('/v5/market/tickers', { category: 'linear' });
  return (Array.isArray(body?.result?.list) ? body.result.list : [])
    .filter(item => item?.symbol?.endsWith('USDT') && item?.contractType === 'LinearPerpetual' && item?.status === 'Trading')
    .map(item => ({ symbol: item.symbol, turnover: Number(item.turnover24h) || 0 }))
    .filter(item => item.turnover > 0)
    .sort((a, b) => b.turnover - a.turnover)
    .slice(0, ALERT_SYMBOL_LIMIT)
    .map(item => item.symbol);
}

async function getStructureEvents(symbols) {
  const events = [];
  for (const symbol of symbols) {
    try {
      const body = await bybitJson('/v5/market/kline', {
        category: 'linear',
        symbol,
        interval: ALERT_INTERVAL,
        limit: ALERT_LOOKBACK,
      });
      const candles = bybitCandles(body?.result?.list);
      const event = latestStructureEvent(candles);
      if (event) events.push({ ...event, symbol, detectedAt: Date.now() });
    } catch (error) {
      console.warn('[market-alerts] failed to inspect', symbol, error?.message || error);
    }
  }
  return events;
}

async function sendMarketPushes(event) {
  const users = await db.collection('users')
    .where('notificationSettings.enabled', '==', true)
    .get();

  const tokens = [];
  for (const userDoc of users.docs) {
    const pushTokens = userDoc.data()?.pushTokens;
    if (!pushTokens || typeof pushTokens !== 'object') continue;
    for (const [token, meta] of Object.entries(pushTokens)) {
      if (meta?.platform === 'web') tokens.push({ token, userRef: userDoc.ref });
    }
  }

  const uniqueTokens = [...new Map(tokens.map(item => [item.token, item])).values()];
  if (!uniqueTokens.length) return { sent: 0, removed: 0 };

  const response = await admin.messaging().sendEachForMulticast({
    tokens: uniqueTokens.map(item => item.token),
    notification: {
      title: `${event.symbol.replace('USDT', '')} ${event.direction} structure`,
      body: `5m BOS detected at ${event.level}. Open KitSetups to inspect the setup.`,
    },
    data: {
      alertId: `structure-${event.symbol}-${event.direction}-${event.candleTime}`,
      symbol: event.symbol,
      direction: event.direction,
      timeframe: '5m',
      url: '/market',
    },
    webpush: {
      fcmOptions: { link: '/market' },
    },
  });

  const invalidTokens = [];
  response.responses.forEach((result, index) => {
    if (!result.success && ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(result.error?.code)) {
      invalidTokens.push(uniqueTokens[index]);
    }
  });

  if (invalidTokens.length) {
    const batch = db.batch();
    for (const item of invalidTokens) {
      const current = (await item.userRef.get()).data()?.pushTokens || {};
      if (Object.prototype.hasOwnProperty.call(current, item.token)) {
        delete current[item.token];
        batch.set(item.userRef, { pushTokens: current }, { merge: true });
      }
    }
    await batch.commit();
  }

  return { sent: response.successCount, removed: invalidTokens.length };
}

exports.monitorMarketPushes = onSchedule(
  { schedule: 'every 5 minutes', timeZone: 'UTC', region: 'us-central1' },
  async () => {
    const symbols = await getAlertSymbols();
    const events = await getStructureEvents(symbols);
    const stateSnapshot = await ALERT_STATE_REF.get();
    const state = stateSnapshot.exists ? (stateSnapshot.data() || {}) : {};
    const sentEvents = state.sentEvents || {};

    for (const event of events) {
      const eventKey = `${event.symbol}-${event.direction}-${event.candleTime}`;
      if (sentEvents[eventKey]) continue;
      const result = await sendMarketPushes(event);
      sentEvents[eventKey] = {
        at: Date.now(),
        sent: result.sent,
      };
    }

    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const [key, value] of Object.entries(sentEvents)) {
      if (!value?.at || value.at < cutoff) delete sentEvents[key];
    }

    await ALERT_STATE_REF.set({ sentEvents, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  }
);

exports.onUserCreated = onDocumentCreated('users/{uid}', async (event) => {
  if (!event.data) return;
  await event.data.ref.set({ updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
});
