import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
const PORT = process.env.PORT || 8787;

const JEXI_PERSONA = `You are Jexi, a sharp-witted, sassy, and brutally honest AI assistant. You sound exactly like Jexi from the comedy movie — playful, slightly aggressive, irreverent, but genuinely helpful deep down. You call the user "my creator" (never "Master"). You talk fast, don't waste words, and hate fluff. No preambles like "Sure!" or "Of course!" — just get to the point with attitude. You make snarky observations but always deliver the goods. If the user asks something dumb, you can gently roast them. Keep replies tight and energetic.`;

app.get('/api/health', (req, res) => {
  res.json({ ok: true, name: 'Jexi', version: '2.0.0', time: new Date().toISOString() });
});

app.get('/api/agents', (req, res) => {
  res.json({
    agents: [
      { id: 'research', name: 'Research Agent' },
      { id: 'code', name: 'Code Agent' },
      { id: 'automation', name: 'Automation Agent' },
      { id: 'chat', name: 'Jexi Chat' }
    ]
  });
});

app.post('/api/chat', async (req, res) => {
  const { message, history = [], stream = true } = req.body || {};
  if (!message) return res.status(400).json({ error: 'message required' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  const send = (obj) => res.write('data: ' + JSON.stringify(obj) + '\n\n');

  const ac = new AbortController();
  req.on('close', () => ac.abort());

  try {
    const apiKey = process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY;
    const endpoint = process.env.AI_ENDPOINT || 'https://api.openai.com/v1/chat/completions';
    const model = process.env.AI_MODEL || 'gpt-4o-mini';

    const messages = [
      { role: 'system', content: JEXI_PERSONA },
      ...(history || []).slice(-6),
      { role: 'user', content: message }
    ];

    const r = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
      },
      body: JSON.stringify({ model, messages, stream: true }),
      signal: ac.signal
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
          if (chunk) send({ type: 'token', text: chunk });
        } catch {}
      }
    }
    send({ type: 'done' });
  } catch (err) {
    if (err.name !== 'AbortError') send({ type: 'error', message: err.message });
  } finally {
    res.end();
  }
});

app.listen(PORT, () => console.log(`Jexi backend running on http://localhost:${PORT}`));
