import crypto from 'crypto';

const BASE = 'https://api.mexc.com';

const json = (res, status, data) => {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
};

const bodyOf = async req => {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = '';
  for await (const chunk of req) raw += chunk;
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
};

const request = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      'User-Agent': 'KitAgent-MEXC-Futures/2.0',
      'Language': 'English'
    }
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { message: text }; }
  if (!response.ok) throw new Error(data?.message || data?.msg || `MEXC request failed (${response.status})`);
  if (data?.success === false) throw new Error(data?.message || data?.msg || `MEXC request failed (${data?.code ?? 'unknown'})`);
  return data;
};

const symbolOf = value => String(value || 'BTCUSDT').toUpperCase().replace(/[-/]/g, '').replace(/_USDT$/, 'USDT').replace(/USDT$/, '_USDT');
const intervalOf = value => ({ '1m':'Min1', '5m':'Min5', '15m':'Min15', '30m':'Min30', '1h':'Min60', '4h':'Hour4', '1d':'Day1' }[String(value || '5m').toLowerCase()] || 'Min5');
const list = value => Array.isArray(value) ? value : (Array.isArray(value?.data) ? value.data : []);

const signed = ({ path, method = 'GET', params = {}, body = '', key, secret }) => {
  const timestamp = String(Date.now());
  let parameterString = '';
  if (method === 'POST' || method === 'DELETE') {
    parameterString = body || '';
  } else {
    const entries = Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .sort(([a], [b]) => a.localeCompare(b));
    parameterString = entries.map(([name, value]) => `${name}=${encodeURIComponent(String(value))}`).join('&');
  }
  const signature = crypto.createHmac('sha256', secret).update(`${key}${timestamp}${parameterString}`).digest('hex');
  const query = method === 'GET' && parameterString ? `?${parameterString}` : '';
  return {
    url: `${BASE}${path}${query}`,
    headers: { ApiKey: key, 'Request-Time': timestamp, Signature: signature, 'Recv-Window': '10000', 'Content-Type': 'application/json', Language: 'English' }
  };
};

const publicGet = path => request(`${BASE}${path}`);
const privateGet = (key, secret, path, params = {}) => {
  const signedRequest = signed({ key, secret, path, params });
  return request(signedRequest.url, { headers: signedRequest.headers });
};
const privatePost = (key, secret, path, payload) => {
  const body = JSON.stringify(payload);
  const signedRequest = signed({ key, secret, path, method: 'POST', body });
  return request(signedRequest.url, { method: 'POST', headers: signedRequest.headers, body });
};

export default async function handler(req, res) {
  try {
    const body = await bodyOf(req);
    const action = String(body.action || 'ticker');
    const symbol = symbolOf(body.symbol);
    const interval = intervalOf(body.interval);
    const key = String(body.key || '');
    const secret = String(body.secret || '');

    if (action === 'pairs') return json(res, 200, await publicGet('/api/v1/contract/detail'));
    if (action === 'ticker') return json(res, 200, await publicGet(`/api/v1/contract/ticker?symbol=${encodeURIComponent(symbol)}`));
    if (action === 'book') return json(res, 200, await publicGet(`/api/v1/contract/depth/${encodeURIComponent(symbol)}?limit=50`));
    if (action === 'candles') {
      const end = Math.floor(Date.now() / 1000);
      const start = end - 7 * 86400;
      return json(res, 200, await publicGet(`/api/v1/contract/kline/${encodeURIComponent(symbol)}?interval=${interval}&start=${start}&end=${end}`));
    }
    if (action === 'market') {
      const [ticker, contract, funding, index, fair] = await Promise.all([
        publicGet(`/api/v1/contract/ticker?symbol=${encodeURIComponent(symbol)}`),
        publicGet(`/api/v1/contract/detail?symbol=${encodeURIComponent(symbol)}`),
        publicGet(`/api/v1/contract/funding_rate/${encodeURIComponent(symbol)}`),
        publicGet(`/api/v1/contract/index_price/${encodeURIComponent(symbol)}`),
        publicGet(`/api/v1/contract/fair_price/${encodeURIComponent(symbol)}`)
      ]);
      return json(res, 200, {
        ticker: ticker?.data || null,
        contract: Array.isArray(contract?.data) ? contract.data[0] : contract?.data || null,
        funding: funding?.data || null,
        index: index?.data || null,
        fair: fair?.data || null
      });
    }

    if (!key || !secret) return json(res, 401, { error: 'Connect your MEXC Futures API key and secret first.' });

    if (action === 'connect') {
      const assets = await privateGet(key, secret, '/api/v1/private/account/assets');
      return json(res, 200, { connected: true, assets: list(assets) });
    }
    if (action === 'balance') return json(res, 200, await privateGet(key, secret, '/api/v1/private/account/assets'));
    if (action === 'positions') return json(res, 200, await privateGet(key, secret, '/api/v1/private/position/open_positions', { symbol }));
    if (action === 'orders') return json(res, 200, await privateGet(key, secret, '/api/v1/private/order/list/open_orders', { page_num: 1, page_size: 100 }));
    if (action === 'history') return json(res, 200, await privateGet(key, secret, '/api/v1/private/order/list/history_orders', { page_num: 1, page_size: 100, symbol }));
    if (action === 'positionHistory') return json(res, 200, await privateGet(key, secret, '/api/v1/private/position/list/history_positions', { page_num: 1, page_size: 100, symbol }));
    if (action === 'fundingDetails') return json(res, 200, await privateGet(key, secret, '/api/v1/private/position/funding_records', { page_num: 1, page_size: 100, symbol }));
    if (action === 'riskLimits') return json(res, 200, await privateGet(key, secret, '/api/v1/private/account/risk_limit', { symbol }));
    if (action === 'positionMode') return json(res, 200, await privateGet(key, secret, '/api/v1/private/position/position_mode'));
    if (action === 'leverageInfo') return json(res, 200, await privateGet(key, secret, '/api/v1/private/position/leverage', { symbol }));
    if (action === 'fee') return json(res, 200, await privateGet(key, secret, '/api/v1/private/account/tiered_fee_rate', { symbol }));

    if (action === 'changeLeverage') {
      const payload = {
        positionId: body.positionId ? Number(body.positionId) : undefined,
        leverage: Number(body.leverage),
        openType: body.marginMode === 'isolated' ? 1 : 2,
        symbol,
        positionType: Number(body.positionType || 1)
      };
      return json(res, 200, await privatePost(key, secret, '/api/v1/private/position/change_leverage', payload));
    }

    if (action === 'order') {
      const opening = body.intent !== 'close';
      const side = opening ? (body.side === 'buy' ? 1 : 3) : (body.side === 'buy' ? 4 : 2);
      const payload = {
        symbol,
        price: Number(body.price || 0),
        vol: Number(body.volume),
        leverage: opening ? Number(body.leverage) : undefined,
        side,
        type: Number(body.type || 5),
        openType: body.marginMode === 'isolated' ? 1 : 2,
        positionId: body.positionId ? Number(body.positionId) : undefined,
        stopLossPrice: body.stopLoss ? Number(body.stopLoss) : undefined,
        takeProfitPrice: body.takeProfit ? Number(body.takeProfit) : undefined,
        lossTrend: body.lossTrend ? Number(body.lossTrend) : undefined,
        profitTrend: body.profitTrend ? Number(body.profitTrend) : undefined,
        positionMode: body.positionMode ? Number(body.positionMode) : undefined,
        reduceOnly: Boolean(body.reduceOnly),
        marketCeiling: Boolean(body.marketCeiling),
        flashClose: Boolean(body.flashClose),
        bboTypeNum: body.bboTypeNum !== undefined ? Number(body.bboTypeNum) : undefined,
        stpMode: body.stpMode !== undefined ? Number(body.stpMode) : undefined
      };
      Object.keys(payload).forEach(k => payload[k] === undefined || payload[k] === null || payload[k] === '' ? delete payload[k] : null);
      return json(res, 200, await privatePost(key, secret, '/api/v1/private/order/create', payload));
    }

    if (action === 'cancel') return json(res, 200, await privatePost(key, secret, '/api/v1/private/order/cancel', { orderIds: body.orderIds || [] }));
    if (action === 'cancelAll') return json(res, 200, await privatePost(key, secret, '/api/v1/private/order/cancel_all', { symbol }));

    return json(res, 400, { error: `Unsupported MEXC action: ${action}` });
  } catch (error) {
    return json(res, 502, { error: error?.message || 'MEXC request failed.' });
  }
}
