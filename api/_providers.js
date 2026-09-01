export const PROVIDERS = {
  cerebras: { enabled: !!process.env.CEREBRAS_API_KEY, url: 'https://api.cerebras.ai/v1/chat/completions', model: 'gpt-oss-120b', priority: 0, headers: () => ({ 'Authorization': `Bearer ${process.env.CEREBRAS_API_KEY}`, 'Content-Type': 'application/json' }) },
  groq: { enabled: !!process.env.GROQ_API_KEY, url: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.3-70b-versatile', priority: 1, headers: () => ({ 'Authorization': `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' }) },
  openrouter: { enabled: !!process.env.OPENROUTER_API_KEY, url: 'https://openrouter.ai/api/v1/chat/completions', model: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free', priority: 2, headers: () => ({ 'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json', 'HTTP-Referer': process.env.ALLOWED_ORIGIN || 'https://noctryx.vercel.app', 'X-Title': 'Noctryx' }) },
  gemini: { enabled: !!process.env.GEMINI_API_KEY, model: 'gemini-2.5-flash', priority: 3 }
};

export const FALLBACK_ORDER = ['cerebras', 'groq', 'openrouter', 'gemini'];

const CACHE = new Map();
const CACHE_TTL = 60000;
const CACHE_MAX = 50;

function cacheKey(msgs) { return msgs[msgs.length - 1]?.content?.slice(0, 200) || ''; }
function getCached(msgs) { const e = CACHE.get(cacheKey(msgs)); if (!e) return null; if (Date.now() - e.ts > CACHE_TTL) { CACHE.delete(cacheKey(msgs)); return null; } return e.data; }
function setCache(msgs, data) { if (CACHE.size >= CACHE_MAX) CACHE.delete(CACHE.keys().next().value); CACHE.set(cacheKey(msgs), { data, ts: Date.now() }); }

async function callOpenAI(key, messages) {
  const p = PROVIDERS[key];
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(p.url, { method: 'POST', headers: p.headers(), signal: ctrl.signal, keepalive: false, body: JSON.stringify({ model: p.model, messages, temperature: 0.7, max_tokens: 4096, stream: false }) });
    clearTimeout(timeout);
    if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error(`${key} HTTP ${res.status}: ${t.slice(0, 200)}`); }
    const d = await res.json();
    const reply = d?.choices?.[0]?.message?.content;
    if (!reply) throw new Error(`${key} returned nothing`);
    return { reply, provider: key };
  } catch (err) { clearTimeout(timeout); throw err; }
}

export async function callGemini(messages) {
  const contents = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  const systemMsg = messages.find(m => m.role === 'system');
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 10000);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${PROVIDERS.gemini.model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const body = { contents, ...(systemMsg ? { systemInstruction: { parts: [{ text: systemMsg.content }] } } : {}), generationConfig: { temperature: 0.7, maxOutputTokens: 8192 } };
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal, body: JSON.stringify(body) });
    if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error(`Gemini HTTP ${res.status}: ${t.slice(0, 200)}`); }
    const d = await res.json();
    const reply = d?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!reply) throw new Error('Gemini returned nothing');
    return { reply, provider: 'gemini' };
  } finally { clearTimeout(timeout); }
}

export async function chatWithFallback(messages) {
  const cached = getCached(messages);
  if (cached) return { ...cached, cached: true };
  const enabled = FALLBACK_ORDER.filter(k => PROVIDERS[k].enabled).sort((a, b) => (PROVIDERS[a].priority || 99) - (PROVIDERS[b].priority || 99));
  if (!enabled.length) throw new Error('No providers configured. Set an API key, creator.');

  const errors = [];
  for (const key of enabled) {
    try {
      const result = key === 'gemini' ? await callGemini(messages) : await callOpenAI(key, messages);
      setCache(messages, result);
      return result;
    } catch (err) { errors.push(`${key}: ${err.message}`); }
  }
  throw new Error(`All providers failed:\\n${errors.join('\\n')}`);
}
