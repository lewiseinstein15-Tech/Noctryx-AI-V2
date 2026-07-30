export const PROVIDERS = {
  cerebras: {
    enabled: !!process.env.CEREBRAS_API_KEY,
    url: 'https://api.cerebras.ai/v1/chat/completions',
    model: 'gpt-oss-120b',
    priority: 0,
    headers: () => ({
      'Authorization': `Bearer ${process.env.CEREBRAS_API_KEY}`,
      'Content-Type': 'application/json'
    })
  },
  groq: {
    enabled: !!process.env.GROQ_API_KEY,
    url: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'openai/gpt-oss-20b',
    priority: 1,
    headers: () => ({
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    })
  },
  openrouter: {
    enabled: !!process.env.OPENROUTER_API_KEY,
    url: 'https://openrouter.ai/api/v1/chat/completions',
    model: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free',
    priority: 2,
    headers: () => ({
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.ALLOWED_ORIGIN || 'https://noctryx.vercel.app',
      'X-Title': 'Noctryx AI V2'
    })
  },
  gemini: {
    enabled: !!process.env.GEMINI_API_KEY,
    model: 'gemini-2.5-flash',
    priority: 3
  }
};

export const FALLBACK_ORDER = ['cerebras', 'groq', 'openrouter', 'gemini'];

const SIMPLE_CACHE = new Map();
const CACHE_TTL = 60_000; // 60 seconds
const CACHE_MAX = 50;

function cacheKey(messages) {
  const last = messages[messages.length - 1];
  return last?.content?.slice(0, 200) || '';
}

function getCached(messages) {
  const k = cacheKey(messages);
  const entry = SIMPLE_CACHE.get(k);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { SIMPLE_CACHE.delete(k); return null; }
  return entry.data;
}

function setCache(messages, data) {
  if (SIMPLE_CACHE.size >= CACHE_MAX) {
    const oldest = SIMPLE_CACHE.keys().next().value;
    SIMPLE_CACHE.delete(oldest);
  }
  SIMPLE_CACHE.set(cacheKey(messages), { data, ts: Date.now() });
}

async function callOpenAICompatible(providerKey, messages) {
  const p = PROVIDERS[providerKey];
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(p.url, {
      method: 'POST',
      headers: p.headers(),
      signal: controller.signal,
      keepalive: false,
      body: JSON.stringify({
        model: p.model,
        messages,
        temperature: 0.7,
        max_tokens: 4096,
        stream: false
      })
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`${providerKey} HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }
    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content;
    if (!reply) throw new Error(`${providerKey} returned no content`);
    return { reply, provider: providerKey };
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

export async function callGemini(messages) {
  const p = PROVIDERS.gemini;
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  const systemMsg = messages.find(m => m.role === 'system');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${p.model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const body = {
      contents,
      ...(systemMsg ? { systemInstruction: { parts: [{ text: systemMsg.content }] } } : {}),
      generationConfig: { temperature: 0.7, maxOutputTokens: 8192 }
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`gemini HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }
    const data = await res.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!reply) throw new Error('gemini returned no content');
    return { reply, provider: 'gemini' };
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

export async function chatWithFallback(messages) {
  // Check cache first
  const cached = getCached(messages);
  if (cached) return { ...cached, cached: true };

  const errors = [];
  // Get enabled providers sorted by priority
  const enabled = FALLBACK_ORDER
    .filter(k => PROVIDERS[k].enabled)
    .sort((a, b) => (PROVIDERS[a].priority || 99) - (PROVIDERS[b].priority || 99));

  if (!enabled.length) {
    throw new Error(
      'No provider API keys are configured. Set at least one of CEREBRAS_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY, GEMINI_API_KEY in Vercel project settings.'
    );
  }

  // Race the top 2 providers for faster response
  const racing = enabled.slice(0, 2);
  const fallback = enabled.slice(2);

  if (racing.length >= 2) {
    try {
      const result = await Promise.race(
        racing.map(async (key) => {
          try {
            if (key === 'gemini') return await callGemini(messages);
            return await callOpenAICompatible(key, messages);
          } catch (err) {
            errors.push(`${key}: ${err.message}`);
            throw err;
          }
        })
      );
      setCache(messages, result);
      return result;
    } catch (_) {
      // Both raced providers failed, try fallbacks
    }
  } else if (racing.length === 1) {
    const key = racing[0];
    try {
      if (key === 'gemini') {
        const result = await callGemini(messages);
        setCache(messages, result);
        return result;
      }
      const result = await callOpenAICompatible(key, messages);
      setCache(messages, result);
      return result;
    } catch (err) {
      errors.push(`${key}: ${err.message}`);
    }
  }

  // Try remaining fallback providers sequentially
  for (const key of fallback) {
    try {
      if (key === 'gemini') {
        const result = await callGemini(messages);
        setCache(messages, result);
        return result;
      }
      const result = await callOpenAICompatible(key, messages);
      setCache(messages, result);
      return result;
    } catch (err) {
      errors.push(`${key}: ${err.message}`);
    }
  }

  throw new Error(
    `All providers failed:\n${errors.join('\n')}`
  );
}
