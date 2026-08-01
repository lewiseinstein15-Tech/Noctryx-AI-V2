/**
 * ═══════════════════════════════════════════════
 * Noctryx AI V2 - Production Chat Backend with Fallback
 * ═══════════════════════════════════════════════
 * 
 * File:        api/chat.js
 * Creator:     Lewis Einstein
 * Runtime:     Node.js 18+ (ES2022)
 * Platform:    Vercel Serverless Functions
 * 
 * ═══════════════════════════════════════════════
 */

const crypto = require('crypto');
const { ReadableStream } = require('stream/web');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PART 1: ENVIRONMENT CONFIGURATION & CORE UTILITIES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function env(key, defaultValue = undefined, required = false) {
  const value = process.env[key] ?? defaultValue;
  if (required && value === undefined) {
    throw new Error(`[Noctryx] Required environment variable missing: ${key}`);
  }
  return value;
}

const ENV = Object.freeze({
  NODE_ENV: env('NODE_ENV', 'development'),
  VERCEL_ENV: env('VERCEL_ENV', 'development'),
  
  OPENAI_API_KEY: env('OPENAI_API_KEY'),
  ANTHROPIC_API_KEY: env('ANTHROPIC_API_KEY'),
  GEMINI_API_KEY: env('GEMINI_API_KEY'),
  GROQ_API_KEY: env('GROQ_API_KEY'),
  DEEPSEEK_API_KEY: env('DEEPSEEK_API_KEY'),
  XAI_API_KEY: env('XAI_API_KEY'),
  PERPLEXITY_API_KEY: env('PERPLEXITY_API_KEY'),
  COHERE_API_KEY: env('COHERE_API_KEY'),
  HUGGINGFACE_API_KEY: env('HUGGINGFACE_API_KEY'),
  
  REDIS_URL: env('REDIS_URL'),
  KV_REST_API_URL: env('KV_REST_API_URL'),
  KV_REST_API_TOKEN: env('KV_REST_API_TOKEN'),
  
  NOCTRYX_SECRET: env('NOCTRYX_SECRET', crypto.randomBytes(32).toString('hex')),
  RATE_LIMIT_SECRET: env('RATE_LIMIT_SECRET', crypto.randomBytes(32).toString('hex')),
  ALLOWED_ORIGINS: env('ALLOWED_ORIGINS', '*'),
  
  LOG_LEVEL: env('LOG_LEVEL', 'info'),
});

const CONFIG = Object.freeze({
  MAX_CONTEXT_MESSAGES: 50,
  RATE_LIMIT_WINDOW_MS: 60000,
  RATE_LIMIT_MAX_REQUESTS: 60,
  RATE_LIMIT_BURST_SIZE: 10,
  PROVIDER_TIMEOUT_MS: 30000,
  PROVIDER_CIRCUIT_BREAKER_THRESHOLD: 3,
  PROVIDER_CIRCUIT_BREAKER_RESET_MS: 30000,
  MAX_REQUEST_BODY_SIZE: 1048576,
  MAX_MESSAGE_LENGTH: 32000,
});

function generateId(prefix = 'nx') {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(8).toString('hex');
  return `${prefix}_${timestamp}_${random}`;
}

function safeJsonParse(str, fallback = null) {
  try { return JSON.parse(str); } catch { return fallback; }
}

function safeJsonStringify(value, fallback = 'null') {
  try { return JSON.stringify(value); } catch { return fallback; }
}

function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  return input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PART 2: SECURITY, RATE LIMITING & REQUEST PARSING
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const Security = Object.freeze({
  validateOrigin(origin) {
    if (!origin) return true;
    const allowed = ENV.ALLOWED_ORIGINS.split(',').map(s => s.trim());
    if (allowed.includes('*')) return true;
    return allowed.some(domain => {
      if (domain.startsWith('*.')) return origin.endsWith(domain.slice(1));
      return origin === domain || origin.startsWith(domain + '/');
    });
  },
  hashIp(ip) {
    return crypto.createHash('sha256').update(ip + ENV.RATE_LIMIT_SECRET).digest('hex').slice(0, 32);
  },
  sanitizeConversationId(id) {
    if (typeof id !== 'string') return null;
    return id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128) || null;
  },
  validateMessage(msg) {
    if (!msg || typeof msg !== 'object') return { valid: false, error: 'Message must be an object' };
    if (!['user', 'assistant', 'system', 'tool'].includes(msg.role)) return { valid: false, error: `Invalid role: ${msg.role}` };
    if (typeof msg.content !== 'string') return { valid: false, error: 'Message content must be a string' };
    if (msg.content.length > CONFIG.MAX_MESSAGE_LENGTH) return { valid: false, error: 'Message exceeds maximum length' };
    return { valid: true, message: { id: msg.id || generateId('msg'), role: msg.role, content: sanitizeInput(msg.content), timestamp: msg.timestamp || Date.now() } };
  },
  validateRequestBody(body) {
    if (!body || typeof body !== 'object') return { valid: false, error: 'Request body must be a JSON object' };
    let { messages, conversationId, stream, message, history } = body;

    if ((!Array.isArray(messages) || messages.length === 0) && typeof message === 'string' && message.trim()) {
      const hist = Array.isArray(history) ? history : [];
      messages = [
        ...hist.filter(m => m && ['user', 'assistant', 'system'].includes(m.role)).map(m => ({ role: m.role, content: String(m.content ?? '') })),
        { role: 'user', content: message }
      ];
    }

    if (!Array.isArray(messages) || messages.length === 0) return { valid: false, error: 'messages array is empty' };
    
    const validatedMessages = [];
    for (const msg of messages) {
      const res = Security.validateMessage(msg);
      if (!res.valid) return { valid: false, error: res.error };
      validatedMessages.push(res.message);
    }

    return {
      valid: true,
      data: {
        messages: validatedMessages,
        conversationId: Security.sanitizeConversationId(conversationId) || generateId('conv'),
        stream: stream !== false,
      }
    };
  },
  getSecurityHeaders() {
    return {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
    };
  }
});

class RateLimiter {
  constructor() { this.buckets = new Map(); }
  static getKey(req) {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
    return Security.hashIp(ip);
  }
  check(key) {
    const now = Date.now();
    let bucket = this.buckets.get(key) || { tokens: CONFIG.RATE_LIMIT_BURST_SIZE, lastRefill: now };
    const elapsed = now - bucket.lastRefill;
    bucket.tokens = Math.min(CONFIG.RATE_LIMIT_BURST_SIZE, bucket.tokens + (elapsed * (CONFIG.RATE_LIMIT_MAX_REQUESTS / CONFIG.RATE_LIMIT_WINDOW_MS)));
    bucket.lastRefill = now;
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      this.buckets.set(key, bucket);
      return { allowed: true };
    }
    return { allowed: false, retryAfter: 5 };
  }
}
const rateLimiter = new RateLimiter();

function getCorsHeaders(req) {
  const origin = req.headers.origin || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  };
}

async function parseBody(req) {
  if (req.body) return typeof req.body === 'string' ? safeJsonParse(req.body, {}) : req.body;
  return new Promise((resolve) => {
    let chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(safeJsonParse(Buffer.concat(chunks).toString('utf-8'), {})));
  });
}

function sendError(res, status, code, message) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...Security.getSecurityHeaders() });
  res.end(safeJsonStringify({ error: true, code, message }));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PART 3: LOGGING & CIRCUIT BREAKER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const Logger = {
  error(msg, meta) { console.log(safeJsonStringify({ level: 'ERROR', message: msg, ...meta })); }
};

class CircuitBreaker {
  constructor() { this.states = new Map(); }
  isClosed(name) {
    const state = this.states.get(name);
    if (!state || state.state === 'closed') return true;
    if (state.state === 'open' && Date.now() - state.lastFailure > CONFIG.PROVIDER_CIRCUIT_BREAKER_RESET_MS) {
      state.state = 'closed';
      state.failures = 0;
      return true;
    }
    return state.state === 'closed';
  }
  recordSuccess(name) { this.states.delete(name); }
  recordFailure(name) {
    let state = this.states.get(name) || { failures: 0, lastFailure: Date.now(), state: 'closed' };
    state.failures += 1;
    state.lastFailure = Date.now();
    if (state.failures >= CONFIG.PROVIDER_CIRCUIT_BREAKER_THRESHOLD) state.state = 'open';
    this.states.set(name, state);
  }
}
const circuitBreaker = new CircuitBreaker();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PART 4: AI PROVIDERS & INTELLIGENT FAILOVER REGISTRY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class BaseProvider {
  constructor(config) {
    this.name = config.name;
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl;
    this.model = config.model;
    this.priority = config.priority;
  }
  async _fetch(url, init) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONFIG.PROVIDER_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }
}

class GroqProvider extends BaseProvider {
  constructor() {
    super({ name: 'groq', apiKey: ENV.GROQ_API_KEY, baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', priority: 1 });
  }
  async complete(messages) {
    const res = await this._fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, messages })
    });
    if (!res.ok) throw new Error(`Groq error: ${res.statusText}`);
    const data = await res.json();
    return { content: data.choices?.[0]?.message?.content || '', usage: data.usage || {} };
  }
  async stream(messages) {
    const res = await this._fetch(`${this.baseUrl}/chat/completions`, {
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
  async healthCheck() { return !!this.apiKey; }
}

class GeminiProvider extends BaseProvider {
  constructor() {
    super({ name: 'gemini', apiKey: ENV.GEMINI_API_KEY, baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-1.5-pro', priority: 2 });
  }
  async complete(messages) {
    const contents = messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
    const res = await this._fetch(`${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents })
    });
    if (!res.ok) throw new Error(`Gemini error: ${res.statusText}`);
    const data = await res.json();
    return { content: data.candidates?.[0]?.content?.parts?.[0]?.text || '', usage: {} };
  }
  async stream(messages) {
    const contents = messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
    const res = await this._fetch(`${this.baseUrl}/models/${this.model}:streamGenerateContent?alt=sse&key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents })
    });
    if (!res.ok) throw new Error(`Gemini stream error: ${res.statusText}`);
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
  async healthCheck() { return !!this.apiKey; }
}

class OpenAIProvider extends BaseProvider {
  constructor() {
    super({ name: 'openai', apiKey: ENV.OPENAI_API_KEY, baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o', priority: 3 });
  }
  async complete(messages) {
    const res = await this._fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, messages })
    });
    if (!res.ok) throw new Error(`OpenAI error: ${res.statusText}`);
    const data = await res.json();
    return { content: data.choices?.[0]?.message?.content || '', usage: data.usage || {} };
  }
  async stream(messages) {
    const res = await this._fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, messages, stream: true })
    });
    if (!res.ok) throw new Error(`OpenAI stream error: ${res.statusText}`);
    
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
  async healthCheck() { return !!this.apiKey; }
}

const ProviderRegistry = {
  getAvailableProviders() {
    const providers = [
      new GroqProvider(),
      new GeminiProvider(),
      new OpenAIProvider(),
    ].filter(p => p.apiKey && circuitBreaker.isClosed(p.name));
    return providers.sort((a, b) => a.priority - b.priority);
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PART 5: VERCEL HANDLER WITH AUTOMATIC FAILOVER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

module.exports = async function handler(req, res) {
  const cors = getCorsHeaders(req);
  for (const [key, value] of Object.entries(cors)) res.setHeader(key, value);

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.method === 'GET') { res.writeHead(200); res.end(safeJsonStringify({ status: 'healthy' })); return; }
  if (req.method !== 'POST') return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Only POST supported');

  const rateLimit = rateLimiter.check(RateLimiter.getKey(req));
  if (!rateLimit.allowed) return sendError(res, 429, 'RATE_LIMIT', 'Too many requests');

  try {
    const rawBody = await parseBody(req);
    const validation = Security.validateRequestBody(rawBody);
    if (!validation.valid) return sendError(res, 400, 'INVALID_REQUEST', validation.error);

    const { messages, stream } = validation.data;
    const providers = ProviderRegistry.getAvailableProviders();

    if (providers.length === 0) {
      return sendError(res, 503, 'NO_PROVIDERS', 'No active AI providers are configured or available.');
    }

    let successResult = null;
    let lastError = null;

    // AUTOMATIC FAILOVER LOOP: Try providers one by one until one succeeds
    for (const provider of providers) {
      try {
        if (stream) {
          const aiStream = await provider.stream(messages);
          circuitBreaker.recordSuccess(provider.name);
          
          res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
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
          return;
        } else {
          const result = await provider.complete(messages);
          circuitBreaker.recordSuccess(provider.name);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(safeJsonStringify({ success: true, message: result.content, providerUsed: provider.name }));
          return;
        }
      } catch (err) {
        lastError = err;
        circuitBreaker.recordFailure(provider.name);
        Logger.error(`Provider ${provider.name} failed, trying next provider if available`, { error: err.message });
      }
    }

    // If all providers failed
    throw new Error(lastError?.message || 'All AI providers failed to respond.');

  } catch (err) {
    if (res.headersSent) {
      try { res.write(`data: ${safeJsonStringify({ type: 'error', message: err.message })}\n\n`); res.end(); } catch {}
      return;
    }
    return sendError(res, 500, 'INTERNAL_SERVER_ERROR', err.message);
  }
};
