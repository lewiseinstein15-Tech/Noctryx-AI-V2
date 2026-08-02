import crypto from 'crypto';
import providerManager from '../providers/providerManager.js';
import KnowledgeRepository from '../database/repositories/knowledgeRepository.js';
import MetricsService from '../services/metricsService.js';
import Logger from '../services/logger.js';

const JEXI_PERSONA = `You are Jexi, a sharp-witted, sassy, and brutally honest AI assistant. You sound exactly like Jexi from the comedy movie — playful, slightly aggressive, irreverent, but genuinely helpful deep down. You call the user "my creator" (never "Master"). You talk fast, don't waste words, and hate fluff. No preambles like "Sure!" or "Of course!" — just get to the point with attitude. Keep replies tight and energetic.`;

const requestCounts = new Map();
const RATE_LIMIT_WINDOW_MS = 60000;
const RATE_LIMIT_MAX = 100;

function applySecurity(req, res) {
  const ALLOWED_ORIGINS = ['https://15-techs-projects.vercel.app', 'http://localhost:3000', 'http://localhost:8080'];
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  const ip = req.headers['x-forwarded-for'] || '127.0.0.1';
  const now = Date.now();
  const record = requestCounts.get(ip) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW_MS };
  if (now > record.resetTime) { record.count = 1; record.resetTime = now + RATE_LIMIT_WINDOW_MS; }
  else record.count++;
  requestCounts.set(ip, record);
  if (record.count > RATE_LIMIT_MAX) {
    res.status(429).json({ error: 'Rate limit exceeded. Chill out, creator.' });
    return false;
  }
  return true;
}

export default async function handler(req, res) {
  if (!applySecurity(req, res)) return;
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method === 'GET') {
    const path = req.url?.split('?')[0];
    if (path === '/api/health' || path === '/health') {
      res.status(200).json({ status: 'healthy', app: 'Jexi AI', creator: 'Lewis Einstein' });
      return;
    }
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch {
    res.status(400).json({ error: 'Invalid JSON' }); return;
  }

  const messages = body?.messages || (body?.message ? [{ role: 'user', content: body.message }] : null);
  if (!messages || !Array.isArray(messages) || !messages.length) {
    res.status(400).json({ error: 'Messages required' }); return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive'
  });

  try {
    const apiKey = process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY;
    const endpoint = process.env.AI_ENDPOINT || 'https://api.openai.com/v1/chat/completions';
    const model = process.env.AI_MODEL || 'gpt-4o-mini';

    const fullMessages = [{ role: 'system', content: JEXI_PERSONA }, ...messages];

    const r = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
      },
      body: JSON.stringify({ model, messages: fullMessages, stream: true })
    });

    if (!r.ok) throw new Error(`HTTP ${r.status}`);

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
          if (chunk) res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: chunk } }] }) + '\n\n');
        } catch {}
      }
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    if (!res.headersSent) res.status(502).json({ error: err.message || 'Jexi brain failed' });
    else { res.write('data: ' + JSON.stringify({ error: err.message }) + '\n\n'); res.end(); }
  }
}
