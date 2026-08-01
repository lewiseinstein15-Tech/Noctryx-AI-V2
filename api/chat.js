/**
 * ═══════════════════════════════════════════════
 * Noctryx AI V2 - Production API Handler (FIXED)
 * Creator: Lewis Einstein
 * ═══════════════════════════════════════════════
 */

const crypto = require('crypto');
const providerManager = require('../providers/providerManager');
const KnowledgeRepository = require('../database/repositories/knowledgeRepository');
const MetricsService = require('../services/metricsService');
const Logger = require('../services/logger');

const requestCounts = new Map();
const RATE_LIMIT_WINDOW_MS = 60000;
const RATE_LIMIT_MAX = 100;

function applySecurity(req, res) {
  // CHANGE THIS to your actual frontend URL after deploying
  const ALLOWED_ORIGINS = [
    'https://15-techs-projects.vercel.app',
    'http://localhost:3000',
    'http://localhost:8080'
  ];
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

  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + RATE_LIMIT_WINDOW_MS;
  } else {
    record.count++;
  }
  requestCounts.set(ip, record);

  if (record.count > RATE_LIMIT_MAX) {
    res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
    return false;
  }
  return true;
}

module.exports = async function handler(req, res) {
  const requestId = crypto.randomUUID();

  if (!applySecurity(req, res)) return;

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  if (req.method === 'GET') {
    const path = req.url?.split('?')[0];
    if (path === '/api/health' || path === '/health') {
      res.status(200).json({
        status: 'healthy',
        app: 'Noctryx AI V2',
        creator: 'Lewis Einstein',
        metrics: MetricsService.getOverview()
      });
      return;
    }
    res.status(404).json({ error: 'Endpoint not found' });
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
    res.status(400).json({ error: 'Invalid JSON payload structure' });
    return;
  }

  // Support both { message } (from your frontend) and { messages } (OpenAI format)
  const messages = body?.messages || (body?.message ? [{ role: 'user', content: body.message }] : null);
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'Valid messages array is required' });
    return;
  }

  for (const m of messages) {
    if (!m.role || !m.content || typeof m.content !== 'string') {
      res.status(400).json({ error: 'Malformed message schema structure' });
      return;
    }
  }

  const lastUserMessage = messages.slice(-1)[0]?.content || '';

  // Check cache
  const cachedKnowledge = KnowledgeRepository.findByQuery(lastUserMessage);
  if (cachedKnowledge) {
    Logger.info('Serving response directly from persistent knowledge database', { requestId, topic: cachedKnowledge.topic });
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive'
    });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: cachedKnowledge.content } }] })}

`);
    res.write('data: [DONE]

');
    res.end();
    return;
  }

  // Execute AI stream
  try {
    await providerManager.executeStream(messages, res, requestId);
  } catch (err) {
    Logger.error('Provider execution failed', { requestId, error: err.message });
    if (!res.headersSent) {
      res.status(502).json({ error: err.message || 'AI provider failed' });
    }
    return;
  }

  // Store knowledge for future queries
  if (lastUserMessage.length > 15) {
    KnowledgeRepository.upsert(lastUserMessage.slice(0, 40), 'Enterprise automated knowledge index entry.');
  }
};