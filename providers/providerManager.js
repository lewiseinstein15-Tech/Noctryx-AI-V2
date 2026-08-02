const GroqProvider = require('./groq');
const GeminiProvider = require('./gemini');
const OpenAIProvider = require('./openai');
const SystemPromptService = require('../services/systemPrompt');
const Logger = require('../services/logger');

class ProviderManager {
  constructor() {
    this.providers = [new GroqProvider(), new GeminiProvider(), new OpenAIProvider()].filter(p => p.apiKey).sort((a, b) => a.priority - b.priority);
  }

  async executeStream(messages, res, requestId) {
    if (!this.providers.length) { res.status(503).json({ error: 'No AI providers configured. Set an API key, creator.' }); return; }
    let lastError = null;
    const systemPrompt = SystemPromptService.getSystemPrompt();
    const fullMessages = [{ role: 'system', content: systemPrompt }, ...messages];

    for (const provider of this.providers) {
      try {
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 30000);
        const rawStream = await provider.stream(fullMessages, ctrl.signal);
        clearTimeout(timeout);

        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
        const reader = rawStream.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) this.parseAndWriteChunk(line, provider.name, res);
        }
        if (buffer.trim()) this.parseAndWriteChunk(buffer, provider.name, res);
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      } catch (err) {
        lastError = err;
        Logger.warn(`Provider ${provider.name} failed`, { requestId, error: err.message });
      }
    }
    if (!res.headersSent) res.status(502).json({ error: lastError?.message || 'All providers failed. Typical.' });
  }

  parseAndWriteChunk(line, providerName, res) {
    const t = line.trim();
    if (!t || t.startsWith(':')) return;
    if (t.startsWith('data: ')) {
      const dataStr = t.slice(6);
      if (dataStr === '[DONE]') return;
      try {
        const json = JSON.parse(dataStr);
        let text = providerName === 'gemini' ? json.candidates?.[0]?.content?.parts?.[0]?.text || '' : json.choices?.[0]?.delta?.content || '';
        if (text) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
      } catch {}
    }
  }
}

module.exports = new ProviderManager();
