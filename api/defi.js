const LIGHTER_API = 'https://api.rh.lighter.xyz';
const MORPHO_API = 'https://api.morpho.org';

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });

  const provider = String(req.query?.provider || '');

  try {
    if (provider === 'uniswap') {
      if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
      const apiKey = process.env.UNISWAP_API_KEY;
      if (!apiKey) return json(res, 503, { ok: false, error: 'Uniswap Trading API key is not configured on the server.' });
      const action = String(req.query?.action || 'quote');
      const params = new URLSearchParams(req.query || {});
      params.delete('provider');
      const path = action === 'orders' ? '/orders' : '/quote';
      const response = await fetch(`https://api.uniswap.org/v2${path}?${params.toString()}`, { headers: { Accept: 'application/json', 'x-api-key': apiKey } });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return json(res, response.status, { ok: false, error: body?.message || body?.error || `Uniswap API returned ${response.status}`, details: body });
      return json(res, 200, { ok: true, chainId: 4663, data: body });
    }

    if (provider === 'lighter') {
      const path = String(req.query?.path || '/');
      const upstream = await fetch(
        `${LIGHTER_API}${path.startsWith('/') ? path : `/${path}`}`,
        { headers: { Accept: 'application/json' } }
      );
      const text = await upstream.text();
      let body;
      try { body = JSON.parse(text); } catch { body = { raw: text }; }

      if (!upstream.ok) {
        return json(res, upstream.status, {
          ok: false,
          error: body?.message || `Lighter returned ${upstream.status}`,
          data: body,
        });
      }

      return json(res, 200, { ok: true, data: body, api: LIGHTER_API });
    }

    if (provider === 'morpho') {
      const route = String(req.query?.route || 'markets');
      const q = new URLSearchParams(req.query || {});
      q.delete('provider');
      q.delete('route');

      let path = '/v1/blue/markets';
      if (route === 'vaults') {
        path = '/v0/vaults-v2';
        q.set('chain_ids', '4663');
      } else if (route === 'positions' && q.get('address')) {
        path = `/v1/vaults-v2/users/${q.get('address')}/positions`;
        q.set('chain_ids', '4663');
        q.delete('address');
      } else {
        q.set('chain_id', '4663');
      }

      const upstream = await fetch(`${MORPHO_API}${path}?${q.toString()}`, {
        headers: { Accept: 'application/json' },
      });
      const body = await upstream.json();

      if (!upstream.ok) {
        return json(res, upstream.status, {
          ok: false,
          error: body?.message || body?.error?.message || `Morpho returned ${upstream.status}`,
        });
      }

      return json(res, 200, { ok: true, chainId: 4663, data: body });
    }

    return json(res, 400, { ok: false, error: 'Unknown provider' });
  } catch (error) {
    const message = error?.message || 'Upstream request failed';
    return json(res, 502, { ok: false, error: message });
  }
}
