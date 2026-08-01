/**
 * ═══════════════════════════════════════════════
 * Noctryx AI V2 - Production Chat Backend with Robust Fallback
 * ═══════════════════════════════════════════════
 * File:        api/chat.js
 * Runtime:     Node.js 18+ (ES2022)
 * Platform:    Vercel Serverless Functions
 * ═══════════════════════════════════════════════
 */

const crypto = require('crypto');
const { ReadableStream } = require('stream/web');

function env(key, defaultValue = undefined) {
  return process.env[key] ?? defaultValue;
}

const ENV = Object.freeze({
  OPENAI_API_KEY: env('OPENAI_API_KEY'),
  GEMINI_API_KEY: env('GEMINI_API_KEY'),
  GROQ_API_KEY: env('GROQ_API_KEY'),
  ALLOWED_ORIGINS: env('ALLOWED_ORIGINS', '*'),
});

const CONFIG = Object.freeze({
  RATE_LIMIT_WINDOW_MS: 60000,
  RATE_LIMIT_MAX_REQUESTS: 60,
  RATE_LIMIT_BURST_SIZE: 10,
  PROVIDER_TIMEOUT_MS: 30000,
});

function generateId(prefix = 'nx') {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}`;
}

function safeJsonParse(str, fallback = null) {
  try { return JSON.parse(str); } catch { return fallback; }
}

function safeJsonStringify(value, fallback = 'null') {
  try { return JSON.stringify(value); } catch { return fallback; }
}

class RateLimiter {
  constructor() { this.buckets = new Map(); }
  check(ip) {
    const now = Date.now();
    let bucket = this.buckets.get(ip) || { tokens: CONFIG.RATE_LIMIT_BURST_SIZE, lastRefill: now };
    const elapsed = now - bucket.lastRefill;
    bucket.tokens = Math.min(CONFIG.RATE_LIMIT_BURST_SIZE, bucket.tokens + (elapsed * (CONFIG.RATE_LIMIT_MAX_REQUESTS / CONFIG.RATE_LIMIT_WINDOW_MS)));
    bucket.lastRefill = now;
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      this.buckets.set(ip, bucket);
      return { allowed: true };
    }
    return { allowed: false };
  }
}
const rateLimiter = new RateLimiter();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AI PROVIDERS IMPLEMENTATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class GroqProvider {
  constructor() {
    this.name = 'groq';
    this.apiKey = ENV.GROQ_API_KEY;
    this.model = 'llama-3.3-70b-versatile';
    this.priority = 1; // Primary choice to avoid OpenAI limits
  }

  async stream(messages) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, messages, stream: true })
    });
    if (!res.ok) throw new Error(`Groq stream error: ${res.statusText}`);
    return this._transformStream(res);
  }

  _transformStream(res) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    return new ReadableStream({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) { controller.close(); return; }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const data = trimmed.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) controller.enqueue({ type: 'token', data: content });
            } catch {}
          }
        }
      }
    });
  }
}

class GeminiProvider {
  constructor() {
    this.name = 'gemini';
    this.apiKey = ENV.GEMINI_API_KEY;
    this.model = 'gemini-1.5-pro';
    this.priority = 2;
  }

  async stream(messages) {
    const contents = messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.model}:streamGenerateContent?alt=sse&key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents })
    });
    if (!res.ok) throw new Error(`Gemini stream error: ${res.statusText}`);
    
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    return new ReadableStream({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) { controller.close(); return; }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(trimmed.slice(6));
              const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) controller.enqueue({ type: 'token', data: text });
            } catch {}
          }
        }
      }
    });
  }
}

class OpenAIProvider {
  constructor() {
    this.name = 'openai';
    this.apiKey = ENV.OPENAI_API_KEY;
    this.model = 'gpt-4o';
    this.priority = 3; // Moved to last resort because of rate limits
  }

  async stream(messages) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, messages, stream: true })
    });
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`OpenAI stream error: ${res.status === 429 ? 'Too Many Requests' : res.statusText} (${errBody.slice(0, 100)})`);
    }
    
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    return new ReadableStream({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) { controller.close(); return; }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const data = trimmed.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) controller.enqueue({ type: 'token', data: content });
            } catch {}
          }
        }
      }
    });
  }
}

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method === 'GET') { res.status(200).json({ status: 'healthy' }); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const ip = req.headers['x-forwarded-for'] || 'unknown';
  if (!rateLimiter.check(ip).allowed) {
    res.status(429).json({ error: 'Too many requests' });
    return;
  }

  let body;
  try {
    body = typeof req.body === 'string' ? safeJsonParse(req.body) : req.body;
  } catch {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }

  const messages = body?.messages || (body?.message ? [{ role: 'user', content: body.message }] : null);
  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ error: 'Messages array is required' });
    return;
  }

  // Build provider list ordered by priority (Groq -> Gemini -> OpenAI)
  const providers = [
    new GroqProvider(),
    new GeminiProvider(),
    new OpenAIProvider()
  ].filter(p => p.apiKey);

  if (providers.length === 0) {
    res.status(503).json({ error: 'No AI providers have API keys configured.' });
    return;
  }

  let lastError = null;

  // Try each provider sequentially if one fails or hits rate limit
  for (const provider of providers) {
    try {
      const aiStream = await provider.stream(messages);
      
      res.writeHead(200, { 
        'Content-Type': 'text/event-stream', 
        'Cache-Control': 'no-cache', 
        'Connection': 'keep-alive' 
      });

      const reader = aiStream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value?.type === 'token') {
          res.write(`data: ${safeJsonStringify({ type: 'token', content: value.data })}\n\n`);
        }
      }
      res.write(`data: [DONE]\n\n`);
      res.end();
      return; // Success, exit request lifecycle

    } catch (err) {
      lastError = err;
      console.warn(`[Failover] Provider ${provider.name} failed: ${err.message}. Trying next provider...`);
    }
  }

  // If all providers failed
  if (!res.headersSent) {
    res.status(500).json({ error: lastError?.message || 'All AI providers failed.' });
  }
};
