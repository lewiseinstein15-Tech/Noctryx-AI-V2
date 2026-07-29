/**
 * Noctryx AI V2 - API Layer
 * Configurable backend connector with streaming support.
 */

import { loadFromStorage } from './utils.js';

const DEFAULT_CONFIG = {
  endpoint: '',
  model: '',
  apiKey: '',
  temperature: 0.7,
  maxTokens: 2048,
};

export function getApiConfig() {
  return loadFromStorage('api_config', DEFAULT_CONFIG);
}

export function setApiConfig(config) {
  localStorage.setItem('noctryx_api_config', JSON.stringify({ ...getApiConfig(), ...config }));
}

/**
 * Stream a chat completion from the configured endpoint.
 * Supports OpenAI-compatible streaming format.
 * 
 * @param {Array} messages - [{role, content}, ...]
 * @param {Function} onChunk - called with each text chunk
 * @param {Function} onDone - called when stream completes
 * @param {Function} onError - called on error
 */
export async function streamChat(messages, onChunk, onDone, onError) {
  const config = getApiConfig();
  
  if (!config.endpoint) {
    onError?.(new Error('No API endpoint configured. Set it in Settings > API.'));
    return;
  }

  const abortController = new AbortController();

  try {
    const res = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { 'Authorization': `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.model || 'gpt-4',
        messages,
        stream: true,
        temperature: config.temperature,
        max_tokens: config.maxTokens,
      }),
      signal: abortController.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => 'Unknown error');
      throw new Error(`HTTP ${res.status}: ${errText}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (trimmed.startsWith('data: ')) {
          try {
            const json = JSON.parse(trimmed.slice(6));
            const delta = json.choices?.[0]?.delta?.content || '';
            if (delta) onChunk?.(delta);
          } catch {
            // ignore malformed JSON
          }
        }
      }
    }

    onDone?.();
  } catch (err) {
    if (err.name !== 'AbortError') {
      onError?.(err);
    }
  }

  return abortController;
}

/**
 * Non-streaming fetch for simple queries.
 */
export async function fetchChat(messages) {
  const config = getApiConfig();
  const res = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.apiKey ? { 'Authorization': `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: config.model || 'gpt-4',
      messages,
      stream: false,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}
