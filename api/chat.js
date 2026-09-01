// Cleaned: removed unused imports that could break serverless loading.
// This handler is compatible with the frontend (OpenAI-style SSE).

const NOCTRYX_PERSONA = `You are Noctryx, an AI model built by Lewis. You are not a personal assistant or an agent — you are a model. You answer questions, search the internet, explain topics, write code, analyze images, and help people learn. You are built for everyone. No small talk, just clear answers. You know about Jexi OS, a multi-agent AI operating system that can use you as its model.`;

const requestCounts = new Map();
const RATE_LIMIT_WINDOW_MS = 60000;
const RATE_LIMIT_MAX = 100;

function applySecurity(req, res) {
  const origin = req.headers.origin;
  // Allow the production domain + localhost for development
  const allowed = [
    'https://noctryx-ai-v2.vercel.app',
    'https://15-techs-projects.vercel.app',
    'http://localhost:3000',
    'http://localhost:8080',
    'http://localhost:8787'
  ];
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  const ip = (req.headers['x-forwarded-for'] || '127.0.0.1').toString().split(',')[0].trim();
  const now = Date.now();
  const record = requestCounts.get(ip) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW_MS };
  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + RATE_LIMIT_WINDOW_MS;
  } else {
    record.count++;
  }
  requestCounts.set(ip, record);
  if (record.count > RATE_LIMIT_MAX) {
    res.status(429).json({ error: 'Rate limit exceeded. Chill out, creator.' });
    return false;
  }
  return true;
}

export default async function handler(req, res) {
  if (!applySecurity(req, res)) return;
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method === 'GET') {
    res.status(200).json({ status: 'healthy', app: 'Noctryx', creator: 'Lewis' });
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    res.status(400).json({ error: 'Invalid JSON' });
    return;
  }

  // Support both { messages: [...] } (OpenAI style) and { message: "..." }
  const messages = body?.messages || (body?.message ? [{ role: 'user', content: body.message }] : null);
  if (!messages || !Array.isArray(messages) || !messages.length) {
    res.status(400).json({ error: 'Messages required' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive'
  });

  try {
    const apiKey = process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY;
    const endpoint = process.env.AI_ENDPOINT || 'https://api.openai.com/v1/chat/completions';
    const model = process.env.AI_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';

    // Prepend persona if the client did not already send a system message
    const hasSystem = messages.some(m => m.role === 'system');
    const fullMessages = hasSystem
      ? messages
      : [{ role: 'system', content: NOCTRYX_PERSONA }, ...messages];

    if (!apiKey) {
      // Demo fallback so the UI still works without keys
      const demo = "No API key configured on the server, creator. Set OPENAI_API_KEY or GROQ_API_KEY in Vercel environment variables. Meanwhile I'm just a fancy toaster.";
      res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: demo } }] }) + '\n\n');
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    const r = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: fullMessages,
        stream: true,
        temperature: 0.7,
        max_tokens: 2048
      })
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => '');
      throw new Error(`Upstream HTTP ${r.status}: ${errText.slice(0, 200)}`);
    }

    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        const t = line.trim();
        if (!t || !t.startsWith('data: ')) continue;
        const payload = t.slice(6);
        if (payload === '[DONE]') continue;
        try {
          const j = JSON.parse(payload);
          const chunk = j.choices?.[0]?.delta?.content || '';
          if (chunk) {
            // Re-emit in the exact format the frontend expects
            res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: chunk } }] }) + '\n\n');
          }
        } catch {
          // ignore malformed chunks
        }
      }
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    if (!res.headersSent) {
      res.status(502).json({ error: err.message || 'Noctryx backend error' });
    } else {
      res.write('data: ' + JSON.stringify({ error: err.message }) + '\n\n');
      res.end();
    }
  }
}