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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let response;
  try {
    response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        ...(options.headers || {}),
        'User-Agent': 'KitAgent-MEXC-Futures/2.0',
        'Language': 'English'
      }
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('MEXC request timed out after 15 seconds. The exchange did not confirm the request.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { message: text }; }
  const code = data?.code ?? data?.errorCode;
  const message = data?.message || data?.msg || data?.errorMsg;
  if (!response.ok) throw new Error(`MEXC [${code ?? response.status}] ${message || `request failed (${response.status})`}`);
  if (data?.success === false) throw new Error(`MEXC [${code ?? 'unknown'}] ${message || 'request failed'}`);
  if (code !== undefined && Number(code) !== 0) throw new Error(`MEXC [${code}] ${message || 'request failed'}`);
  return data;
};

const symbolOf = value => String(value || 'BTCUSDT').toUpperCase().replace(/[-/]/g, '').replace(/_USDT$/, 'USDT').replace(/USDT$/, '_USDT');
const intervalOf = value => ({ '1m':'Min1', '5m':'Min5', '15m':'Min15', '30m':'Min30', '1h':'Min60', '4h':'Hour4', '1d':'Day1' }[String(value || '5m').toLowerCase()] || 'Min5');
const list = value => Array.isArray(value) ? value : (Array.isArray(value?.data) ? value.data : []);

const decimalPlaces = value => {
  const s = String(value ?? '').toLowerCase();
  if (!s || !Number.isFinite(Number(value))) return 0;
  if (s.includes('e')) {
    const [coefficient, exponentText] = s.split('e');
    const exponent = Number(exponentText);
    return Math.max(0, (coefficient.split('.')[1] || '').length - exponent);
  }
  return (s.split('.')[1] || '').length;
};

const normalizeStep = (value, step, mode = 'round') => {
  const v = Number(value);
  const s = Number(step);
  if (!Number.isFinite(v) || !Number.isFinite(s) || s <= 0) return v;
  const places = Math.min(18, Math.max(decimalPlaces(v), decimalPlaces(s)));
  const scale = 10 ** places;
  const scaledV = Math.round(v * scale);
  const scaledStep = Math.max(1, Math.round(s * scale));
  const units = mode === 'floor'
    ? Math.floor(scaledV / scaledStep)
    : Math.round(scaledV / scaledStep);
  return Number((units * scaledStep / scale).toFixed(places));
};

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
const riskRowsFor = (result, symbol) => {
  const raw = result?.data || result;
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    const direct = raw[symbol] || raw[String(symbol).replace('_USDT', 'USDT')] || raw[String(symbol).replace('USDT', '_USDT')];
    if (Array.isArray(direct)) return direct;
    const nested = Object.values(raw).find(v => Array.isArray(v));
    if (Array.isArray(nested)) return nested;
  }
  return [];
};

const validateOperationResult = (result, fallback = 'MEXC operation failed.') => {
  const candidates = Array.isArray(result?.data) ? result.data : [result?.data];
  const failed = candidates.find(item => Number(item?.errorCode || 0) !== 0 || item?.errorMsg);
  if (failed) throw new Error(`MEXC [${failed.errorCode ?? 'unknown'}] ${failed.errorMsg || fallback}`);
  if (result?.errorCode && Number(result.errorCode) !== 0) throw new Error(`MEXC [${result.errorCode}] ${result?.errorMsg || fallback}`);
  if (result?.code !== undefined && Number(result.code) !== 0) throw new Error(`MEXC [${result.code}] ${result?.message || result?.msg || fallback}`);
  return result;
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

    if (action === 'pairs') {
      const result = await publicGet('/api/v1/contract/detail/country');
      const data = Array.isArray(result?.data) ? result.data : [];
      return json(res, 200, { ...result, data: data.filter(x => String(x?.state ?? x?.status ?? 0) === '0' || x?.state == null) });
    }
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
        publicGet(`/api/v1/contract/detail/country?symbol=${encodeURIComponent(symbol)}`),
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
    if (action === 'orders') return json(res, 200, await privateGet(key, secret, `/api/v1/private/order/list/open_orders/${encodeURIComponent(symbol)}`, { page_num: 1, page_size: 100 }));
    if (action === 'stopOrders') return json(res, 200, await privateGet(key, secret, '/api/v1/private/stoporder/open_orders', { symbol }));
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
      return json(res, 200, validateOperationResult(await privatePost(key, secret, '/api/v1/private/position/change_leverage', payload), 'Leverage change was rejected by MEXC.'));
    }

    if (action === 'placeStopOrder') {
      const payload = {
        positionId: Number(body.positionId),
        vol: Number(body.volume),
        lossTrend: Number(body.lossTrend || 1),
        profitTrend: Number(body.profitTrend || 1),
        stopLossPrice: body.stopLossPrice ? Number(body.stopLossPrice) : undefined,
        takeProfitPrice: body.takeProfitPrice ? Number(body.takeProfitPrice) : undefined,
        priceProtect: body.priceProtect !== undefined ? Number(body.priceProtect) : 0,
        profitLossVolType: 'SAME',
        volType: 2,
        takeProfitType: 0,
        takeProfitOrderPrice: 0,
        stopLossType: 0,
        stopLossOrderPrice: 0
      };
      Object.keys(payload).forEach(k => payload[k] === undefined || payload[k] === null || payload[k] === '' ? delete payload[k] : null);
      if (!payload.positionId || !payload.vol || (!payload.stopLossPrice && !payload.takeProfitPrice)) {
        return json(res, 400, { error: 'A position, quantity, and at least one TP/SL price are required.' });
      }
      return json(res, 200, validateOperationResult(await privatePost(key, secret, '/api/v1/private/stoporder/place', payload), 'TP/SL order was rejected by MEXC.'));
    }

    if (action === 'placeStopLimit') {
      const payload = {
        positionId: Number(body.positionId),
        vol: Number(body.volume),
        lossTrend: Number(body.lossTrend || 1),
        profitTrend: Number(body.profitTrend || 1),
        stopLossPrice: body.stopLossPrice ? Number(body.stopLossPrice) : undefined,
        takeProfitPrice: body.takeProfitPrice ? Number(body.takeProfitPrice) : undefined,
        priceProtect: body.priceProtect !== undefined ? Number(body.priceProtect) : 0,
        profitLossVolType: 'SAME',
        volType: 2,
        takeProfitType: 1,
        takeProfitOrderPrice: body.takeProfitOrderPrice ? Number(body.takeProfitOrderPrice) : 0,
        stopLossType: 1,
        stopLossOrderPrice: body.stopLossOrderPrice ? Number(body.stopLossOrderPrice) : 0
      };
      Object.keys(payload).forEach(k => payload[k] === undefined || payload[k] === null || payload[k] === '' ? delete payload[k] : null);
      return json(res, 200, validateOperationResult(await privatePost(key, secret, '/api/v1/private/stoporder/place', payload), 'TP/SL limit order was rejected by MEXC.'));
    }

    if (action === 'changeStopOrder') {
      const payload = {
        stopPlanOrderId: Number(body.stopPlanOrderId),
        stopLossPrice: body.stopLoss ? Number(body.stopLoss) : undefined,
        takeProfitPrice: body.takeProfit ? Number(body.takeProfit) : undefined
      };
      Object.keys(payload).forEach(k => payload[k] === undefined || payload[k] === null || payload[k] === '' ? delete payload[k] : null);
      return json(res, 200, validateOperationResult(await privatePost(key, secret, '/api/v1/private/stoporder/change_plan_price', payload), 'TP/SL adjustment was rejected by MEXC.'));
    }

    if (action === 'cancelStopOrder') return json(res, 200, validateOperationResult(await privatePost(key, secret, '/api/v1/private/stoporder/cancel', [{ stopPlanOrderId: Number(body.stopPlanOrderId) }]), 'Could not cancel the stop order.'));
    if (action === 'cancelStopAll') return json(res, 200, validateOperationResult(await privatePost(key, secret, '/api/v1/private/stoporder/cancel_all', { positionId: body.positionId ? Number(body.positionId) : undefined, symbol }), 'Could not cancel position protection.'));

    if (action === 'closePosition') {
      const positionType = Number(body.positionType);
      if (![1, 2].includes(positionType)) return json(res, 400, { error: 'Invalid position direction.' });
      const positionMode = body.positionMode ? Number(body.positionMode) : undefined;
      const payload = {
        symbol,
        price: Number(body.price) > 0 ? Number(body.price) : Number((await publicGet(`/api/v1/contract/ticker?symbol=${encodeURIComponent(symbol)}`))?.data?.lastPrice || 0),
        vol: Number(body.volume),
        side: positionType === 1 ? 4 : 2,
        type: 5,
        openType: Number(body.openType) === 1 ? 1 : 2,
        positionId: Number(body.positionId),
        positionMode,
        reduceOnly: positionMode === 2 ? true : undefined
      };
      Object.keys(payload).forEach(k => payload[k] === undefined || payload[k] === null || payload[k] === '' ? delete payload[k] : null);
      const result = validateOperationResult(await privatePost(key, secret, '/api/v1/private/order/create', payload), 'Close order was rejected by MEXC.');
      return json(res, 200, { ok: true, orderId: result?.data ?? result });
    }

    if (action === 'order') {
      const opening = body.intent !== 'close';
      const side = opening ? (body.side === 'buy' ? 1 : 3) : (body.side === 'buy' ? 4 : 2);

      // MEXC expects numeric type codes. Accept both the terminal's orderType string
      // and the raw API type so a Limit selection can never silently become Market.
      const rawType = body.type ?? body.orderType;
      const typeMap = { market: 5, limit: 1, postonly: 2, 'post-only': 2, ioc: 3, fok: 4 };
      const orderType = typeof rawType === 'string'
        ? (typeMap[rawType.toLowerCase()] ?? Number(rawType))
        : Number(rawType ?? 5);
      if (![1,2,3,4,5].includes(orderType)) {
        return json(res, 400, { error: 'Invalid futures order type.' });
      }

      const volume = Number(body.volume);
      const price = Number(body.price);
      if (!Number.isFinite(volume) || volume <= 0) {
        return json(res, 400, { error: 'Enter a valid contract quantity.' });
      }
      if (orderType === 1 && (!Number.isFinite(price) || price <= 0)) {
        return json(res, 400, { error: 'A valid limit price is required for a limit order.' });
      }

      // Use live contract rules so quantity/price match MEXC's min/max/step constraints.
      const contractResult = await publicGet(`/api/v1/contract/detail/country?symbol=${encodeURIComponent(symbol)}`);
      const contract = Array.isArray(contractResult?.data) ? contractResult.data[0] : contractResult?.data;
      if (!contract) return json(res, 400, { error: `Contract rules unavailable for ${symbol}.` });
      if (contract.apiAllowed === false) return json(res, 400, { error: `${symbol} does not allow API futures trading.` });
      if (Number(contract.state) !== 0) return json(res, 400, { error: `${symbol} is not currently tradable.` });

      const volUnit = Number(contract.volUnit) || 1;
      const minVol = Number(contract.minVol) || volUnit;
      const maxVol = Number(contract.maxVol) || Number.POSITIVE_INFINITY;
      // Normalize quantity to the exchange volume step without binary floating-point tails.
      const normalizedVol = normalizeStep(volume, volUnit, 'floor');
      if (normalizedVol < minVol) {
        return json(res, 400, { error: `Order size is below the ${minVol} contract minimum for ${symbol}.` });
      }
      if (normalizedVol > maxVol) {
        return json(res, 400, { error: `Order size exceeds the ${maxVol} contract maximum for ${symbol}.` });
      }

      const priceUnit = Number(contract.priceUnit) || 0;
      let normalizedPrice = price;
      if (orderType === 5) {
        const tickerResult = await publicGet(`/api/v1/contract/ticker?symbol=${encodeURIComponent(symbol)}`);
        const livePrice = Number(tickerResult?.data?.lastPrice || tickerResult?.data?.fairPrice || 0);
        if (!(livePrice > 0)) return json(res, 400, { error: `Live market price unavailable for ${symbol}.` });
        normalizedPrice = priceUnit > 0 ? normalizeStep(livePrice, priceUnit, 'round') : livePrice;
      } else {
        normalizedPrice = priceUnit > 0 ? normalizeStep(price, priceUnit, 'round') : price;
        if (!(normalizedPrice > 0)) return json(res, 400, { error: 'Limit price is invalid after tick-size normalization.' });
      }

      // TP/SL are prices too. Normalize them to the exact MEXC tick size.
      const normalizeOptionalPrice = value => {
        if (value === undefined || value === null || value === '') return undefined;
        const parsed = Number(value);
        if (!(parsed > 0)) return undefined;
        return priceUnit > 0 ? normalizeStep(parsed, priceUnit, 'round') : parsed;
      };
      const normalizedStopLoss = normalizeOptionalPrice(body.stopLoss);
      const normalizedTakeProfit = normalizeOptionalPrice(body.takeProfit);

      const leverage = opening ? Number(body.leverage) : undefined;
      // Keep order creation single-hop. A separate private risk-limit request
      // immediately before create-order can stall a valid order. MEXC performs
      // the authoritative live risk-tier validation on order creation.
      const allowedMaxLeverage = Number(contract.maxLeverage || contract.maxLeverageNum || contract.leverageMax || 0)
        || ((symbol === 'BTC_USDT' || symbol === 'ETH_USDT') ? 500 : 0);
      if (opening && (!Number.isFinite(leverage) || leverage < Number(contract.minLeverage || 1) || leverage > allowedMaxLeverage)) {
        return json(res, 400, { error: `Leverage must be between ${contract.minLeverage || 1}x and ${allowedMaxLeverage || 500}x for ${symbol}.` });
      }

      // Let MEXC perform the authoritative funding check at order creation.
      // The exchange calculates opening cost from the actual contract, leverage,
      // margin mode and order parameters. A local balance formula can reject a
      // valid small-margin order when its risk-tier assumptions differ from MEXC.

      const payload = {
        symbol,
        price: normalizedPrice,
        vol: normalizedVol,
        leverage: opening ? leverage : undefined,
        side,
        type: orderType,
        openType: body.marginMode === 'isolated' ? 1 : 2,
        positionId: body.positionId ? Number(body.positionId) : undefined,
        stopLossPrice: normalizedStopLoss,
        takeProfitPrice: normalizedTakeProfit,
        lossTrend: body.lossTrend ? Number(body.lossTrend) : undefined,
        profitTrend: body.profitTrend ? Number(body.profitTrend) : undefined,
        positionMode: body.positionMode ? Number(body.positionMode) : undefined,
        reduceOnly: Boolean(body.reduceOnly),
        marketCeiling: Boolean(body.marketCeiling),
        flashClose: Boolean(body.flashClose),
        bboTypeNum: body.bboTypeNum !== undefined ? Number(body.bboTypeNum) : undefined,
        stpMode: body.stpMode !== undefined ? Number(body.stpMode) : undefined,
        externalOid: body.externalOid ? String(body.externalOid) : `kitsetups-${Date.now()}-${Math.random().toString(36).slice(2,10)}`
      };
      Object.keys(payload).forEach(k => payload[k] === undefined || payload[k] === null || payload[k] === '' ? delete payload[k] : null);

      const result = validateOperationResult(
        await privatePost(key, secret, '/api/v1/private/order/create', payload),
        'Order was rejected by MEXC.'
      );
      return json(res, 200, { ok: true, orderId: result?.data?.orderId ?? result?.data ?? result, order: result?.data ?? null });
    }

    if (action === 'cancel') return json(res, 200, validateOperationResult(await privatePost(key, secret, '/api/v1/private/order/cancel', { orderIds: body.orderIds || [] }), 'Order cancellation was rejected by MEXC.'));
    if (action === 'cancelAll') return json(res, 200, validateOperationResult(await privatePost(key, secret, '/api/v1/private/order/cancel_all', { symbol }), 'Cancel-all was rejected by MEXC.'));

    return json(res, 400, { error: `Unsupported MEXC action: ${action}` });
  } catch (error) {
    return json(res, 502, { error: error?.message || 'MEXC request failed.' });
  }
}
