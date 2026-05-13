const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'authorization,apikey,content-type,prefer');
    res.status(204).end();
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    res.status(500).json({ error: 'Missing Supabase proxy environment variables.' });
    return;
  }

  const targetUrl = buildTargetUrl(req, supabaseUrl);
  const headers = buildForwardHeaders(req.headers, supabaseAnonKey);
  const body = getForwardBody(req);

  try {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
    });
    const responseText = await upstream.text();

    res.status(upstream.status);
    copyResponseHeaders(upstream.headers, res);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(responseText);
  } catch (error) {
    console.error('Supabase proxy error:', error);
    res.status(502).json({ error: 'Supabase proxy request failed.' });
  }
}

function buildTargetUrl(req, supabaseUrl) {
  const path = Array.isArray(req.query.path)
    ? req.query.path.join('/')
    : req.query.path || '';
  const targetUrl = new URL(path, ensureTrailingSlash(supabaseUrl));

  Object.entries(req.query).forEach(([key, value]) => {
    if (key === 'path') return;
    if (Array.isArray(value)) {
      value.forEach((item) => targetUrl.searchParams.append(key, item));
    } else if (value !== undefined) {
      targetUrl.searchParams.set(key, value);
    }
  });

  return targetUrl;
}

function buildForwardHeaders(incomingHeaders, supabaseAnonKey) {
  const headers = new Headers();

  Object.entries(incomingHeaders).forEach(([key, value]) => {
    const lowerKey = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lowerKey)) return;
    if (Array.isArray(value)) {
      headers.set(key, value.join(', '));
    } else if (value !== undefined) {
      headers.set(key, value);
    }
  });

  headers.set('apikey', supabaseAnonKey);
  if (!headers.has('authorization')) {
    headers.set('authorization', `Bearer ${supabaseAnonKey}`);
  }

  return headers;
}

function getForwardBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  if (req.body === undefined || req.body === null) return undefined;
  if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) return req.body;
  return JSON.stringify(req.body);
}

function copyResponseHeaders(upstreamHeaders, res) {
  upstreamHeaders.forEach((value, key) => {
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) return;
    res.setHeader(key, value);
  });
}

function ensureTrailingSlash(url) {
  return url.endsWith('/') ? url : `${url}/`;
}
