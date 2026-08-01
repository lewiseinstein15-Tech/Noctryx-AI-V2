/**
 * ═══════════════════════════════════════════════
 * Noctryx AI V2 - Production Chat Backend (Fixed Streaming)
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
});

class GroqProvider {
  constructor() {
    this.name = 'groq';
    this.apiKey = ENV.GROQ_API_KEY;
    this.model = 'llama-3.3-70b-versatile';
  }
  async stream(messages) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, messages, stream: true })
    });
    if (!res.ok) throw new Error(`Groq error: ${res.statusText}`);
    return res.body;
  }
}

class GeminiProvider {
  constructor() {
    this.name = 'gemini';
    this.apiKey = ENV.GEMINI_API_KEY;
    this.model = 'gemini-1.5-pro';
  }
  async stream(messages) {
    const contents = messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.model}:streamGenerateContent?alt=sse&key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents })
    });
    if (!res.ok) throw new Error(`Gemini error: ${res.statusText}`);
    return res.body;
  }
}

class OpenAIProvider {
  constructor() {
    this.name = 'openai';
    this.apiKey = ENV.OPENAI_API_KEY;
    this.model = 'gpt-4o';
  }
  async stream(messages) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, messages, stream: true })
    });
    if (!res.ok) throw new Error(`OpenAI error: ${res.statusText}`);
    return res.body;
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

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }

  const messages = body?.messages || (body?.message ? [{ role: 'user', content: body.message }] : null);
  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ error: 'Messages array is required' });
    return;
  }

  const providers = [
    new GroqProvider(),
    new GeminiProvider(),
    new OpenAIProvider()
  ].filter(p => p.apiKey);

  if (providers.length === 0) {
    res.status(503).json({ error: 'No AI providers configured.' });
    return;
  }

  let lastError = null;

  for (const provider of providers) {
    try {
      const rawStream = await provider.stream(messages);
      
      res.writeHead(200, { 
        'Content-Type': 'text/event-stream', 
        'Cache-Control': 'no-cache', 
        'Connection': 'keep-alive' 
      });

      const reader = rawStream.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;
          
          if (provider.name === 'gemini') {
            if (trimmed.startsWith('data: ')) {
              try {
                const json = JSON.parse(trimmed.slice(6));
                const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) {
                  res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
                }
              } catch {}
            }
          } else {
            // Groq & OpenAI OpenAI-compatible format
            if (trimmed === 'data: [DONE]') continue;
            if (trimmed.startsWith('data: ')) {
              try {
                const json = JSON.parse(trimmed.slice(6));
                const text = json.choices?.[0]?.delta?.content;
                if (text) {
                  res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
                }
              } catch {}
            }
          }
        }
      }

      res.write('data: [DONE]\n\n');
      res.end();
      return;

    } catch (err) {
      lastError = err;
      console.warn(`Provider ${provider.name} failed: ${err.message}. Trying next...`);
    }
  }

  if (!res.headersSent) {
    res.status(500).json({ error: lastError?.message || 'All AI providers failed.' });
  }
};
