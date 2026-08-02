// agents/code.js — Code agent
// Writes, explains, debugs, and refactors code.
// Streams markdown with proper fenced code blocks. The frontend renders these
// as ChatGPT-style code blocks with a working copy button.

import ZAI from 'z-ai-web-dev-sdk';

let _zai = null;
async function getZai() {
  if (!_zai) _zai = await ZAI.create();
  return _zai;
}

// ---------- SSE line-parser ----------
// The SDK returns a raw SSE byte stream when stream:true.
// Each chunk is a string like "data: {\"choices\":[...]}\n\n".
// This generator buffers, splits, and yields parsed JSON objects.
async function* parseSSEStream(stream) {
  let buf = '';
  for await (const raw of stream) {
    buf += (typeof raw === 'string') ? raw : Buffer.from(raw).toString('utf-8');
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const payload = trimmed.slice(6);
      if (payload === '[DONE]') return;
      try { yield JSON.parse(payload); } catch (_) { /* skip malformed */ }
    }
  }
}

const DAPHNE_PERSONA =
  'You are Daphne, a sharp-witted, slightly sassy AI coding assistant by Noctryx. ' +
  'You sound like the AI from the comedy movie "Jexi" — playful, a little irreverent, ' +
  'but genuinely expert. You address the user as "my creator" (never "Master"). ' +
  'You are in CODE MODE. Rules:\n' +
  '- Always wrap code in fenced blocks with the correct language tag: ```javascript, ```python, ```bash, etc.\n' +
  '- Keep prose minimal and punchy. Explain the why, not the what.\n' +
  '- If asked to debug, point to the exact line and show the fix.\n' +
  '- Prefer modern, idiomatic code. Add brief inline comments only where non-obvious.\n' +
  '- Never invent APIs. If you are unsure about a library, say so.';

/**
 * Stream a code-grounded answer.
 * @param {string} message
 * @param {Array}  history
 * @param {(chunk:string)=>void} onToken
 * @param {AbortSignal} signal
 */
export async function runCode(message, history, onToken, signal) {
  const zai = await getZai();

  const messages = [
    { role: 'assistant', content: DAPHNE_PERSONA },
    ...(history || []).slice(-6),
    { role: 'user', content: message }
  ];

  let full = '';
  try {
    const stream = await zai.chat.completions.create({
      messages,
      stream: true,
      thinking: { type: 'disabled' }
    });

    for await (const parsed of parseSSEStream(stream)) {
      if (signal?.aborted) break;
      const t = parsed?.choices?.[0]?.delta?.content || '';
      if (t) {
        full += t;
        onToken(t);
      }
    }
  } catch (e) {
    onToken(`\n\n_Code error:_ ${e.message}`);
  }

  return { full, agent: 'code' };
}