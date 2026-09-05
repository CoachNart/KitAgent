export default async function handler(req, res) {
  try {
    const params = new URL(req.url, 'http://localhost').searchParams;
    const allowed = ['fromChain','toChain','fromToken','toToken','fromAmount','fromAddress','toAddress'];
    const query = new URLSearchParams();
    for (const key of allowed) {
      const value = params.get(key);
      if (value) query.set(key, value);
    }
    if (!query.get('fromChain') || !query.get('toChain') || !query.get('fromToken') || !query.get('toToken') || !query.get('fromAmount')) {
      return res.status(400).json({ error: 'Missing route parameters' });
    }
    const upstream = await fetch(`https://li.quest/v1/quote?${query.toString()}`, { headers: { accept: 'application/json' } });
    const text = await upstream.text();
    res.status(upstream.status).setHeader('content-type', upstream.headers.get('content-type') || 'application/json').send(text);
  } catch (error) {
    res.status(502).json({ error: error?.message || 'Route provider unavailable' });
  }
}
