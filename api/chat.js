/**
 * ═══════════════════════════════════════════════
 * Noctryx AI V2 - Production Chat Backend
 * ═══════════════════════════════════════════════
 * 
 * File:        api/chat.js
 * Creator:     Lewis Einstein
 * Runtime:     Node.js 18+ (ES2022)
 * Platform:    Vercel Serverless Functions
 * 
 * Architecture:
 *   • Multi-provider AI with automatic failover
 *   • Intelligent agent routing & dynamic prompts
 *   • Conversation memory & long-term knowledge storage
 *   • Code execution, verification & auto-debugging
 *   • ChatGPT-style Server-Sent Events streaming
 *   • Production security, rate limiting & health monitoring
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
  
  ENABLE_CODE_EXECUTION: env('ENABLE_CODE_EXECUTION', 'true') === 'true',
  ENABLE_KNOWLEDGE_STORAGE: env('ENABLE_KNOWLEDGE_STORAGE', 'true') === 'true',
  ENABLE_AUTO_DEBUG: env('ENABLE_AUTO_DEBUG', 'true') === 'true',
  LOG_LEVEL: env('LOG_LEVEL', 'info'),
});

const CONFIG = Object.freeze({
  STREAM_CHUNK_SIZE: 16,
  STREAM_MAX_DURATION_MS: 120000,
  STREAM_KEEPALIVE_INTERVAL_MS: 15000,
  
  MAX_CONTEXT_MESSAGES: 50,
  MAX_CONTEXT_TOKENS: 8000,
  CONTEXT_TRIM_THRESHOLD: 7500,
  KNOWLEDGE_MAX_ENTRIES: 10000,
  KNOWLEDGE_SIMILARITY_THRESHOLD: 0.85,
  
  RATE_LIMIT_WINDOW_MS: 60000,
  RATE_LIMIT_MAX_REQUESTS: 60,
  RATE_LIMIT_BURST_SIZE: 10,
  
  CODE_EXEC_TIMEOUT_MS: 30000,
  CODE_EXEC_MAX_MEMORY_MB: 128,
  CODE_EXEC_MAX_OUTPUT_CHARS: 10000,
  
  PROVIDER_TIMEOUT_MS: 30000,
  PROVIDER_MAX_RETRIES: 3,
  PROVIDER_RETRY_DELAY_MS: 1000,
  PROVIDER_CIRCUIT_BREAKER_THRESHOLD: 5,
  PROVIDER_CIRCUIT_BREAKER_RESET_MS: 30000,
  
  MAX_REQUEST_BODY_SIZE: 1048576,
  MAX_MESSAGE_LENGTH: 32000,
  REQUEST_TIMEOUT_MS: 125000,
  
  AGENT_CONFIDENCE_THRESHOLD: 0.6,
  AGENT_ROUTING_CACHE_TTL_MS: 300000,
});

function generateId(prefix = 'nx') {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(8).toString('hex');
  return `${prefix}_${timestamp}_${random}`;
}

function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  try {
    return structuredClone(obj);
  } catch {
    return JSON.parse(JSON.stringify(obj));
  }
}

function safeJsonParse(str, fallback = null) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

function safeJsonStringify(value, fallback = 'null') {
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
}

function truncateText(text, maxLength) {
  if (typeof text !== 'string' || text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + '…';
}

function estimateTokens(text) {
  if (typeof text !== 'string') return 0;
  let tokens = 0;
  for (const char of text) {
    tokens += char.charCodeAt(0) > 127 ? 0.5 : 0.25;
  }
  return Math.ceil(tokens);
}

function estimateMessagesTokens(messages) {
  if (!Array.isArray(messages)) return 0;
  return messages.reduce((sum, msg) => sum + estimateTokens(msg?.content || ''), 0);
}

function levenshteinDistance(a, b) {
  const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= a.length; j++) matrix[0][j] = j;
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = b[i - 1] === a[j - 1]
        ? matrix[i - 1][j - 1]
        : Math.min(matrix[i - 1][j - 1], matrix[i][j - 1], matrix[i - 1][j]) + 1;
    }
  }
  return matrix[b.length][a.length];
}

function textSimilarity(a, b) {
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const distance = levenshteinDistance(a, b);
  return 1 - distance / maxLen;
}

function quickHash(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function normalizedHash(text) {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  return quickHash(normalized);
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
      if (domain.startsWith('*.')) {
        const suffix = domain.slice(1);
        return origin.endsWith(suffix);
      }
      return origin === domain || origin.startsWith(domain + '/');
    });
  },

  sign(payload, secret = ENV.NOCTRYX_SECRET) {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  },

  verifySignature(payload, signature, secret = ENV.NOCTRYX_SECRET) {
    if (!payload || !signature) return false;
    const expected = Security.sign(payload, secret);
    if (signature.length !== expected.length) return false;
    let result = 0;
    for (let i = 0; i < signature.length; i++) {
      result |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    return result === 0;
  },

  hashIp(ip) {
    return crypto.createHash('sha256').update(ip + ENV.RATE_LIMIT_SECRET).digest('hex').slice(0, 32);
  },

  sanitizeConversationId(id) {
    if (typeof id !== 'string') return null;
    const sanitized = id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
    return sanitized.length >= 4 ? sanitized : null;
  },

  validateMessage(msg) {
    if (!msg || typeof msg !== 'object') {
      return { valid: false, error: 'Message must be an object' };
    }
    if (!['user', 'assistant', 'system', 'tool'].includes(msg.role)) {
      return { valid: false, error: `Invalid role: ${msg.role}` };
    }
    if (typeof msg.content !== 'string') {
      return { valid: false, error: 'Message content must be a string' };
    }
    if (msg.content.length > CONFIG.MAX_MESSAGE_LENGTH) {
      return { valid: false, error: `Message exceeds maximum length of ${CONFIG.MAX_MESSAGE_LENGTH}` };
    }
    const sanitized = sanitizeInput(msg.content);
    if (!sanitized && msg.role === 'user') {
      return { valid: false, error: 'Message content is empty after sanitization' };
    }
    return {
      valid: true,
      message: {
        id: msg.id || generateId('msg'),
        role: msg.role,
        content: sanitized,
        timestamp: msg.timestamp || Date.now(),
        agent: msg.agent || undefined,
        metadata: msg.metadata || {},
        toolCalls: Array.isArray(msg.toolCalls) ? msg.toolCalls : undefined,
      },
    };
  },

  validateRequestBody(body) {
    if (!body || typeof body !== 'object') {
      return { valid: false, error: 'Request body must be a JSON object' };
    }

    let { messages, conversationId, stream, agent, context, options, message, history } = body;

    if ((!Array.isArray(messages) || messages.length === 0) && typeof message === 'string' && message.trim()) {
      const hist = Array.isArray(history) ? history : [];
      messages = [
        ...hist
          .filter(m => m && ['user', 'assistant', 'system'].includes(m.role))
          .map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : String(m.content ?? '') })),
        { role: 'user', content: message },
      ];
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return { valid: false, error: 'messages must be a non-empty array (or provide message + optional history)' };
    }
    if (messages.length > CONFIG.MAX_CONTEXT_MESSAGES) {
      return { valid: false, error: `messages array exceeds limit of ${CONFIG.MAX_CONTEXT_MESSAGES}` };
    }

    const validatedMessages = [];
    for (let i = 0; i < messages.length; i++) {
      const result = Security.validateMessage(messages[i]);
      if (!result.valid) {
        return { valid: false, error: `Message[${i}]: ${result.error}` };
      }
      validatedMessages.push(result.message);
    }

    const validatedConversationId = Security.sanitizeConversationId(conversationId) || generateId('conv');

    return {
      valid: true,
      data: {
        messages: validatedMessages,
        conversationId: validatedConversationId,
        stream: stream !== false,
        agent: typeof agent === 'string' ? agent.slice(0, 64) : undefined,
        context: context && typeof context === 'object' ? context : {},
        options: options && typeof options === 'object' ? options : {},
      },
    };
  },

  getSecurityHeaders() {
    return {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
    };
  },
});

class RateLimiter {
  constructor() {
    this.buckets = new Map();
    this.lastCleanup = Date.now();
    this.cleanupIntervalMs = 60000;
  }

  static getKey(req, userId) {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
      || req.headers['x-real-ip']
      || req.socket?.remoteAddress
      || 'unknown';
    const base = userId ? `${userId}:${ip}` : ip;
    return Security.hashIp(base);
  }

  _gc() {
    const now = Date.now();
    if (now - this.lastCleanup < this.cleanupIntervalMs) return;
    const expiry = now - (CONFIG.RATE_LIMIT_WINDOW_MS * 2);
    for (const [key, bucket] of this.buckets) {
      if (bucket.lastRefill < expiry) this.buckets.delete(key);
    }
    this.lastCleanup = now;
  }

  check(key) {
    this._gc();
    const now = Date.now();
    const windowMs = CONFIG.RATE_LIMIT_WINDOW_MS;
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = { tokens: CONFIG.RATE_LIMIT_BURST_SIZE, lastRefill: now, violations: 0 };
      this.buckets.set(key, bucket);
    }

    const elapsed = now - bucket.lastRefill;
    const refillRate = CONFIG.RATE_LIMIT_MAX_REQUESTS / windowMs;
    const tokensToAdd = elapsed * refillRate;
    bucket.tokens = Math.min(CONFIG.RATE_LIMIT_BURST_SIZE, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return { allowed: true, remaining: Math.floor(bucket.tokens), reset: Math.ceil((now + windowMs) / 1000) };
    }

    bucket.violations += 1;
    const retryAfter = Math.ceil((1 - bucket.tokens) / refillRate / 1000);
    return { allowed: false, remaining: 0, reset: Math.ceil((now + windowMs) / 1000), retryAfter: Math.max(1, retryAfter) };
  }
}

const rateLimiter = new RateLimiter();

function getCorsHeaders(req) {
  const origin = req.headers.origin || req.headers.referer || '';
  if (origin && !Security.validateOrigin(origin)) return null;
  const allowedOrigin = ENV.ALLOWED_ORIGINS.includes('*')
    ? (origin || '*')
    : (origin || ENV.ALLOWED_ORIGINS.split(',')[0].trim() || '*');
  return {
    'Access-Control-Allow-Origin': allowedOrigin === '*' ? '*' : allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-ID, X-Noctryx-Signature',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

async function parseBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') {
      const parsed = safeJsonParse(req.body, null);
      if (parsed === null && req.body.trim()) throw new Error('Invalid JSON in request body');
      return parsed || {};
    }
    if (typeof req.body === 'object') return req.body;
  }
  if (req.readableEnded || req.complete === true) return {};

  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;

    const finish = (fn, val) => {
      if (settled) return;
      settled = true;
      fn(val);
    };

    const timer = setTimeout(() => finish(reject, new Error('Request body parse timeout')), 8000);

    req.on('data', chunk => {
      size += chunk.length;
      if (size > CONFIG.MAX_REQUEST_BODY_SIZE) {
        req.destroy();
        clearTimeout(timer);
        finish(reject, new Error('Request body exceeds maximum size'));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      clearTimeout(timer);
      try {
        const raw = Buffer.concat(chunks).toString('utf-8');
        if (!raw || !raw.trim()) { finish(resolve, {}); return; }
        const body = safeJsonParse(raw, null);
        if (body === null) { finish(reject, new Error('Invalid JSON')); return; }
        finish(resolve, body);
      } catch (err) { finish(reject, err); }
    });

    req.on('error', err => { clearTimeout(timer); finish(reject, err); });
  });
}

function sendError(res, status, code, message, headers = {}) {
  const body = safeJsonStringify({ error: true, code, message, timestamp: Date.now() });
  res.writeHead(status, { 'Content-Type': 'application/json', ...Security.getSecurityHeaders(), ...headers });
  res.end(body);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PART 3: LOGGING, METRICS & CIRCUIT BREAKER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const Logger = Object.freeze({
  _emit(level, message, meta = {}) {
    const entry = { timestamp: new Date().toISOString(), level: level.toUpperCase(), message, service: 'noctryx-chat', ...meta };
    if (ENV.NODE_ENV === 'development') {
      console.log(`[${entry.timestamp}] [${entry.level}] ${message}`, Object.keys(meta).length ? meta : '');
    } else {
      console.log(safeJsonStringify(entry));
    }
  },
  debug(msg, meta) { this._emit('debug', msg, meta); },
  info(msg, meta) { this._emit('info', msg, meta); },
  warn(msg, meta) { this._emit('warn', msg, meta); },
  error(msg, meta) { this._emit('error', msg, meta); },
});

class CircuitBreaker {
  constructor() {
    this.states = new Map();
  }
  isClosed(providerName) {
    const state = this.states.get(providerName);
    if (!state || state.state === 'closed') return true;
    if (state.state === 'open') {
      if (Date.now() - state.lastFailure > CONFIG.PROVIDER_CIRCUIT_BREAKER_RESET_MS) {
        state.state = 'half-open';
        state.failures = 0;
        return true;
      }
      return false;
    }
    return true;
  }
  recordSuccess(providerName) { this.states.delete(providerName); }
  recordFailure(providerName) {
    let state = this.states.get(providerName);
    if (!state) { state = { failures: 0, lastFailure: Date.now(), state: 'closed' }; this.states.set(providerName, state); }
    state.failures += 1;
    state.lastFailure = Date.now();
    if (state.failures >= CONFIG.PROVIDER_CIRCUIT_BREAKER_THRESHOLD) state.state = 'open';
  }
}

const circuitBreaker = new CircuitBreaker();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PART 4: STORAGE ABSTRACTION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class StorageAdapter {
  async get(key) { throw new Error('Not implemented'); }
  async set(key, value, ttlMs) { throw new Error('Not implemented'); }
  async delete(key) { throw new Error('Not implemented'); }
  async has(key) { throw new Error('Not implemented'); }
  async list(prefix) { throw new Error('Not implemented'); }
}

class InMemoryStorage extends StorageAdapter {
  constructor() {
    super();
    this.store = new Map();
  }
  async get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiry && entry.expiry < Date.now()) { this.store.delete(key); return null; }
    return deepClone(entry.value);
  }
  async set(key, value, ttlMs = null) {
    const expiry = ttlMs ? Date.now() + ttlMs : null;
    this.store.set(key, { value: deepClone(value), expiry });
  }
  async delete(key) { this.store.delete(key); }
  async has(key) { return this.store.has(key); }
  async list(prefix) {
    const keys = [];
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) keys.push(key);
    }
    return keys;
  }
}

class VercelKVStorage extends StorageAdapter {
  constructor() {
    super();
    this.fallback = new InMemoryStorage();
  }
  async _getClient() {
    if (!ENV.KV_REST_API_URL || !ENV.KV_REST_API_TOKEN) return null;
    try {
      const { createClient } = await import('@vercel/kv');
      return createClient({ url: ENV.KV_REST_API_URL, token: ENV.KV_REST_API_TOKEN });
    } catch { return null; }
  }
  async get(key) {
    const client = await this._getClient();
    if (!client) return this.fallback.get(key);
    try { return await client.get(key); } catch { return this.fallback.get(key); }
  }
  async set(key, value, ttlMs = null) {
    const client = await this._getClient();
    if (!client) { await this.fallback.set(key, value, ttlMs); return; }
    try {
      if (ttlMs) await client.set(key, value, { px: ttlMs });
      else await client.set(key, value);
    } catch { await this.fallback.set(key, value, ttlMs); }
  }
  async delete(key) {
    const client = await this._getClient();
    if (!client) { await this.fallback.delete(key); return; }
    try { await client.del(key); } catch { await this.fallback.delete(key); }
  }
  async has(key) {
    const client = await this._getClient();
    if (!client) return this.fallback.has(key);
    try { return (await client.get(key)) !== null; } catch { return this.fallback.has(key); }
  }
  async list(prefix) {
    return this.fallback.list(prefix);
  }
}

const Storage = {
  _instance: null,
  getInstance() {
    if (!this._instance) {
      if (ENV.KV_REST_API_URL && ENV.KV_REST_API_TOKEN) {
        this._instance = new VercelKVStorage();
      } else {
        this._instance = new InMemoryStorage();
      }
    }
    return this._instance;
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PART 5: AI PROVIDERS & REGISTRY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class BaseProvider {
  constructor(config) {
    this.name = config.name;
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl;
    this.model = config.model;
    this.priority = config.priority;
    this.timeoutMs = config.timeoutMs || CONFIG.PROVIDER_TIMEOUT_MS;
  }

  async _fetch(url, init) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timeout);
      return response;
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }
  }

  _parseOpenAIChunk(line) {
    if (!line.startsWith('data: ')) return null;
    const data = line.slice(6);
    if (data === '[DONE]') return { type: 'done', data: '' };
    try {
      const parsed = JSON.parse(data);
      const delta = parsed.choices?.[0]?.delta;
      const content = delta?.content || delta?.text || '';
      if (content) return { type: 'token', data: content };
    } catch { return null; }
    return null;
  }
}

class OpenAIProvider extends BaseProvider {
  constructor() {
    super({ name: 'openai', apiKey: ENV.OPENAI_API_KEY, baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o', priority: 1 });
  }
  async complete(messages, options = {}) {
    const res = await this._fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: options.model || this.model, messages })
    });
    if (!res.ok) throw new Error(`OpenAI error: ${res.statusText}`);
    const data = await res.json();
    return { content: data.choices?.[0]?.message?.content || '', usage: data.usage || {} };
  }
  async stream(messages, options = {}) {
    const res = await this._fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: options.model || this.model, messages, stream: true })
    });
    if (!res.ok) throw new Error(`OpenAI stream error: ${res.statusText}`);
    
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const self = this;

    return new ReadableStream({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) { controller.close(); return; }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const chunk = self._parseOpenAIChunk(line.trim());
          if (chunk) controller.enqueue(chunk);
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
  async complete(messages, options = {}) {
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
  async stream(messages, options = {}) {
    const contents = messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
    const res = await this._fetch(`${this.baseUrl}/models/${this.model}:streamGenerateContent?alt=sse&key=${this.apiKey}`, {
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
  async healthCheck() { return !!this.apiKey; }
}

class GroqProvider extends OpenAIProvider {
  constructor() {
    super();
    this.name = 'groq';
    this.apiKey = ENV.GROQ_API_KEY;
    this.baseUrl = 'https://api.groq.com/openai/v1';
    this.model = 'llama-3.3-70b-versatile';
  }
  async healthCheck() { return !!this.apiKey; }
}

const ProviderRegistry = {
  getProviders() {
    const providers = [];
    if (ENV.OPENAI_API_KEY) providers.push(new OpenAIProvider());
    if (ENV.GEMINI_API_KEY) providers.push(new GeminiProvider());
    if (ENV.GROQ_API_KEY) providers.push(new GroqProvider());
    return providers.sort((a, b) => a.priority - b.priority);
  },
  getDefaultProvider() {
    const providers = this.getProviders();
    return providers.find(p => circuitBreaker.isClosed(p.name)) || providers[0] || null;
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PART 6: VERCEL SERVERLESS HTTP HANDLER ENTRYPOINT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

module.exports = async function handler(req, res) {
  const cors = getCorsHeaders(req);
  if (!cors) {
    return sendError(res, 403, 'FORBIDDEN_ORIGIN', 'Origin not permitted');
  }

  for (const [key, value] of Object.entries(cors)) {
    res.setHeader(key, value);
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && (req.url.includes('/health') || req.url === '/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(safeJsonStringify({ status: 'healthy', timestamp: Date.now(), service: 'Noctryx AI V2' }));
    return;
  }

  if (req.method !== 'POST') {
    return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Only POST requests are supported');
  }

  const rateLimitKey = RateLimiter.getKey(req);
  const rateLimitResult = rateLimiter.check(rateLimitKey);
  if (!rateLimitResult.allowed) {
    return sendError(res, 429, 'RATE_LIMIT_EXCEEDED', 'Too many requests, please slow down', {
      'Retry-After': String(rateLimitResult.retryAfter),
    });
  }

  try {
    const rawBody = await parseBody(req);
    const validation = Security.validateRequestBody(rawBody);
    if (!validation.valid) {
      return sendError(res, 400, 'INVALID_REQUEST', validation.error);
    }

    const { messages, stream } = validation.data;
    const provider = ProviderRegistry.getDefaultProvider();
    
    if (!provider) {
      return sendError(res, 503, 'NO_AI_PROVIDER', 'No active AI providers are currently configured. Please check API keys.');
    }

    if (stream) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      const aiStream = await provider.stream(messages);
      const reader = aiStream.getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value.type === 'token') {
          res.write(`data: ${safeJsonStringify({ type: 'token', content: value.data })}\n\n`);
        }
      }
      res.write(`data: [DONE]\n\n`);
      res.end();
    } else {
      const result = await provider.complete(messages);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(safeJsonStringify({ success: true, message: result.content, usage: result.usage }));
    }
  } catch (err) {
    Logger.error('Chat endpoint execution error', { error: err.message, stack: err.stack });
    return sendError(res, 500, 'INTERNAL_SERVER_ERROR', err.message || 'An unexpected backend error occurred.');
  }
};
