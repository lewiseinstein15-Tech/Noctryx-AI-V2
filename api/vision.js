export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

const rateLimitMap = new Map();
function checkRateLimit(key, max = 10, windowMs = 60000) {
  const now = Date.now();
  let record = rateLimitMap.get(key);
  if (!record || now > record.resetTime) { record = { count: 1, resetTime: now + windowMs }; rateLimitMap.set(key, record); return true; }
  if (record.count >= max) return false;
  record.count++; return true;
}

function getClientKey(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const client = getClientKey(req);
  if (!checkRateLimit(`vision:${client}`, 10, 60000)) return res.status(429).json({ error: 'Too many requests. Slow down, creator.' });

  try {
    const { imageBase64, mimeType, prompt } = req.body || {};
    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 required' });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'GEMINI_API_KEY not set. Typical.' });

    const model = 'gemini-1.5-pro';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt || 'Describe what is visible in this image in 2-3 concise sentences.' }, { inline_data: { mime_type: mimeType || 'image/jpeg', data: imageBase64 } }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 512 }
    };

    const geminiRes = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!geminiRes.ok) { const err = await geminiRes.text(); throw new Error(`Gemini HTTP ${geminiRes.status}: ${err.slice(0, 300)}`); }

    const data = await geminiRes.json();
    const analysis = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!analysis) throw new Error('Gemini returned nothing. Shocking.');

    return res.status(200).json({ analysis, provider: 'gemini' });
  } catch (err) {
    console.error('[vision] error:', err.message);
    return res.status(502).json({ error: err.message });
  }
}
