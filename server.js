// server.js — Daphne by Noctryx
// Express backend for the Daphne voice AI.
// Routes chat to one of three agents: research / code / automation.
// Streams responses back as SSE (Server-Sent Events) for low-latency "no gap" voice.

import express from 'express';
import cors from 'cors';
import ZAI from 'z-ai-web-dev-sdk';
import { routeIntent } from './agents/router.js';
import { runResearch } from './agents/research.js';
import { runCode } from './agents/code.js';
import { runAutomation } from './agents/automation.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const PORT = process.env.PORT || 8787;

// ---- health check ----
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    name: 'Daphne',
    by: 'Noctryx',
    version: '1.0.0',
    agents: ['research', 'code', 'automation'],
    time: new Date().toISOString()
  });
});

// ---- agents listing (for the frontend's status panel) ----
app.get('/api/agents', (req, res) => {
  res.json({
    agents: [
      { id: 'research', name: 'Research Agent', desc: 'Live web search + cited synthesis.' },
      { id: 'code', name: 'Code Agent', desc: 'Writes, debugs, explains code with proper fenced blocks.' },
      { id: 'automation', name: 'Automation Agent', desc: 'Opens apps/sites, drafts messages, sets notes, controls device.' },
      { id: 'chat', name: 'Chat (default)', desc: 'General conversation in Daphne persona.' }
    ]
  });
});

// ---- main chat endpoint (SSE stream) ----
// Body: { message: string, history: [{role, content}], stream?: boolean }
app.post('/api/chat', async (req, res) => {
  const { message, history = [], stream = true } = req.body || {};

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  const send = (obj) => {
    res.write('data: ' + JSON.stringify(obj) + '\n\n');
  };

  // 1) Route the intent (fast keyword pass, then LLM if needed)
  let route;
  try {
    route = await routeIntent(message);
  } catch (e) {
    route = { agent: 'chat', reason: 'router crashed: ' + e.message, source: 'fallback' };
  }
  send({ type: 'route', agent: route.agent, reason: route.reason, source: route.source });

  // 2) Set up an abort controller tied to the request
  const ac = new AbortController();
  req.on('close', () => ac.abort());

  // 3) Stream tokens
  try {
    if (route.agent === 'research') {
      const result = await runResearch(message, history, (t) => send({ type: 'token', text: t }), ac.signal);
      send({ type: 'done', agent: result.agent, sources: result.sources });
    } else if (route.agent === 'code') {
      const result = await runCode(message, history, (t) => send({ type: 'token', text: t }), ac.signal);
      send({ type: 'done', agent: result.agent });
    } else if (route.agent === 'automation') {
      const result = await runAutomation(message, history, (t) => send({ type: 'token', text: t }), ac.signal);
      send({ type: 'done', agent: result.agent, action: result.action });
    } else {
      // Default chat — SSE line-parser for the raw SDK stream
      const zai = await ZAI.create();
      const DAPHNE = 'You are Daphne, a sharp-witted, slightly sassy AI assistant by Noctryx. ' +
        'You sound like the AI from the comedy movie "Jexi" — playful, a little irreverent, but genuinely helpful. ' +
        'You address the user as "my creator" (never "Master"). Keep replies tight, energetic, no fluff. ' +
        'When asked to answer, answer fast — no preamble like "Sure!" or "Of course!". Get to the point.';
      const messages = [
        { role: 'assistant', content: DAPHNE },
        ...history.slice(-6),
        { role: 'user', content: message }
      ];
      const rawStream = await zai.chat.completions.create({
        messages,
        stream: true,
        thinking: { type: 'disabled' }
      });
      // Parse the raw SSE byte stream into JSON objects
      let full = '';
      let buf = '';
      for await (const rawChunk of rawStream) {
        if (ac.signal.aborted) break;
        buf += (typeof rawChunk === 'string') ? rawChunk : Buffer.from(rawChunk).toString('utf-8');
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const payload = trimmed.slice(6);
          if (payload === '[DONE]') break;
          let parsed;
          try { parsed = JSON.parse(payload); } catch (_) { continue; }
          const t = parsed?.choices?.[0]?.delta?.content || '';
          if (t) { full += t; send({ type: 'token', text: t }); }
        }
      }
      send({ type: 'done', agent: 'chat' });
    }
  } catch (e) {
    console.error('[chat] error:', e);
    send({ type: 'error', message: e.message || 'unknown error' });
  } finally {
    res.end();
  }
});

// ---- simple notes endpoint (used by automation agent "take a note") ----
// Notes are kept in-memory per session; the frontend also keeps a local copy.
const notesStore = new Map();
app.post('/api/notes', (req, res) => {
  const { session, content } = req.body || {};
  if (!session || !content) return res.status(400).json({ error: 'session and content required' });
  const list = notesStore.get(session) || [];
  list.push({ content, ts: Date.now() });
  notesStore.set(session, list);
  res.json({ ok: true, total: list.length });
});
app.get('/api/notes/:session', (req, res) => {
  const list = notesStore.get(req.params.session) || [];
  res.json({ notes: list });
});

app.listen(PORT, () => {
  console.log('─'.repeat(60));
  console.log(`  Daphne by Noctryx — backend up on http://localhost:${PORT}`);
  console.log(`  Health:  http://localhost:${PORT}/api/health`);
  console.log(`  Chat:    POST http://localhost:${PORT}/api/chat  (SSE stream)`);
  console.log(`  Agents:  research · code · automation · chat`);
  console.log('─'.repeat(60));
});
