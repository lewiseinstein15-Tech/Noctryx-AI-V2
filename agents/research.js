// agents/research.js — Research agent
// 1) runs a web search via z-ai-web-dev-sdk
// 2) feeds the top results into the LLM as context
// 3) streams a grounded, cited answer back to the client

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
  'You are Daphne, a sharp-witted, slightly sassy AI assistant by Noctryx. ' +
  'You sound like the AI from the comedy movie "Jexi" — playful, a little irreverent, ' +
  'but genuinely helpful. You address the user as "my creator" (never "Master"). ' +
  'You keep replies tight and energetic. When you cite sources, do it inline like [1], [2].';

async function runWebSearch(query, num = 6) {
  try {
    const zai = await getZai();
    const results = await zai.functions.invoke('web_search', { query, num });
    if (!Array.isArray(results)) return [];
    return results.slice(0, num).map((r, i) => ({
      idx: i + 1,
      title: r.name || '(untitled)',
      url: r.url,
      snippet: (r.snippet || '').slice(0, 400),
      host: r.host_name || '',
      date: r.date || ''
    }));
  } catch (e) {
    console.error('[research] web_search error:', e.message);
    return [];
  }
}

function buildContext(query, results) {
  if (results.length === 0) {
    return `Query: "${query}"\n\n(Web search returned no results. Answer from your own knowledge and say so honestly.)`;
  }
  const lines = results.map(r =>
    `[${r.idx}] ${r.title}\nURL: ${r.url}\n${r.snippet}`
  ).join('\n\n');
  return `Query: "${query}"\n\nWeb search results:\n${lines}\n\nSynthesize a clear answer. Cite inline as [1], [2] etc. If results conflict, say so. Don't pad — be tight.`;
}

/**
 * Stream a research-grounded answer.
 * @param {string} message - user's question
 * @param {Array}  history - prior turns [{role, content}, ...]
 * @param {(chunk:string)=>void} onToken - called for each text chunk
 * @param {AbortSignal} signal
 */
export async function runResearch(message, history, onToken, signal) {
  const zai = await getZai();

  // 1) Web search (fast, parallelizable later if needed)
  const results = await runWebSearch(message, 6);

  // 2) Emit a tiny "Searching..." preamble so the UI feels alive
  onToken(`_DAPHNE_THINKING_:Searching the web…_DAPHNE_END_`);

  const context = buildContext(message, results);
  const messages = [
    { role: 'assistant', content: DAPHNE_PERSONA + '\n\nYou are now in RESEARCH MODE.' },
    ...(history || []).slice(-6),
    { role: 'user', content: context }
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
    onToken(`\n\n_Research error:_ ${e.message}`);
  }

  // 3) Append a sources block at the end
  if (results.length > 0) {
    const sourcesBlock = '\n\n---\n**Sources:**\n' +
      results.map(r => `${r.idx}. [${r.title}](${r.url}) — ${r.host}`).join('\n');
    onToken(sourcesBlock);
    full += sourcesBlock;
  }

  return { full, sources: results, agent: 'research' };
}