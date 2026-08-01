/**
 * ═══════════════════════════════════════════════
 * Noctryx AI V2 - Provider Routing & Failover Manager
 * Creator: Lewis Einstein
 * ═══════════════════════════════════════════════
 */

const GroqProvider = require('./groq');
const GeminiProvider = require('./gemini');
const OpenAIProvider = require('./openai');
const SystemPromptService = require('../services/systemPrompt');
const Logger = require('../services/logger');
const MetricsService = require('../services/metricsService');

class ProviderManager {
  constructor() {
    this.providers = [
      new GroqProvider(),
      new GeminiProvider(),
      new OpenAIProvider()
    ].filter(p => p.apiKey).sort((a, b) => a.priority - b.priority);
  }

  async executeStream(messages, res, requestId) {
    if (this.providers.length === 0) {
      res.status(503).json({ error: 'No AI providers configured in environment.' });
      return;
    }

    let lastError = null;
    const systemPrompt = SystemPromptService.getSystemPrompt();
    const fullMessages = [{ role: 'system', content: systemPrompt }, ...messages];

    for (const provider of this.providers) {
      const startTime = Date.now();
      MetricsService.incrementActiveStreams();

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);

        const rawStream = await provider.stream(fullMessages, controller.signal);
        clearTimeout(timeout);

        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no'
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
            this.parseAndWriteChunk(line, provider.name, res);
          }
        }

        if (buffer.trim()) {
          this.parseAndWriteChunk(buffer, provider.name, res);
        }

        res.write('data: [DONE]\n\n');
        res.end();

        MetricsService.record(provider.name, Date.now() - startTime, true);
        MetricsService.decrementActiveStreams();
        return;

      } catch (err) {
        MetricsService.decrementActiveStreams();
        lastError = err;
        MetricsService.record(provider.name, Date.now() - startTime, false, err.message);
        Logger.warn(`Provider ${provider.name} failed, trying failover...`, { requestId, error: err.message });
      }
    }

    if (!res.headersSent) {
      res.status(502).json({ error: lastError?.message || 'All AI routing providers failed.' });
    }
  }

  parseAndWriteChunk(line, providerName, res) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(':')) return;

    if (trimmed.startsWith('data: ')) {
      const dataStr = trimmed.slice(6);
      if (dataStr === '[DONE]') return;

      try {
        const json = JSON.parse(dataStr);
        let text = '';

        if (providerName === 'gemini') {
          text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
        } else {
          text = json.choices?.[0]?.delta?.content || '';
        }

        if (text) {
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
        }
      } catch (err) {
        Logger.error('Chunk parse error', { provider: providerName, error: err.message });
      }
    }
  }
}

module.exports = new ProviderManager();
