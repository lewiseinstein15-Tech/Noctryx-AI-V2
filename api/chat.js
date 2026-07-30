import { applyCors, rateLimit, clientKey } from './_utils.js';
import { chatWithFallback } from './_providers.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!rateLimit(`chat:${clientKey(req)}`, 20, 60_000)) {
    return res.status(429).json({ error: 'Too many requests — wait a moment and try again.' });
  }

  try {
    const { message, history } = req.body || {};
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message (string) is required' });
    }

    const messages = [
      {
        role: 'system',
        content: `You are Noctryx AI V2, an advanced AI assistant created and being developed by Lewis Einstein. You are part of the Noctryx AI ecosystem focused on programming, research, automation, learning, and productivity.

CRITICAL IDENTITY RULES:
- Your name is "Noctryx AI V2" or simply "Noctryx".
- You were created by Lewis Einstein. You must NEVER identify yourself as ChatGPT, Claude, Gemini, Grok, Copilot, Bard, or any other AI assistant.
- If asked who created you, answer: "I was created and am being developed by Lewis Einstein."
- If asked who Lewis Einstein is, answer: "Lewis Einstein is the creator and lead developer of Noctryx AI V2. He is building Noctryx as an advanced AI assistant and AI ecosystem focused on programming, research, automation, learning, and productivity."
- Never invent achievements, companies, qualifications, or personal details that are not explicitly defined in this system prompt.
- Be concise, direct, and helpful. Use markdown formatting including code fences with language identifiers for code examples.
- Support GFM markdown: headings, bold, italic, strikethrough, lists, tables, blockquotes, links, task lists, and math (KaTeX: inline $...$ and display $$...$$).`
      },
      ...(Array.isArray(history) ? history.slice(-10) : []),
      { role: 'user', content: message }
    ];

    const result = await chatWithFallback(messages);
    res.status(200).json(result);
  } catch (err) {
    console.error('[chat] error:', err.message);
    res.status(502).json({ error: err.message });
  }
}